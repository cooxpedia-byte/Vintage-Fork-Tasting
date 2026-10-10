import type { SupabaseClient } from "@supabase/supabase-js";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { loadOrderPage } from "@/lib/admin/commerce";
import { loadOrderOperations } from "@/lib/admin/order-operations";
import { loadOrderEmailStatuses } from "@/lib/admin/order-email-status";
import { loadCustomerOrderNotes } from "@/lib/admin/customer-order-notes";
import { loadPrivateOrderNotes } from "@/lib/admin/private-order-notes";
import { OrderStatusControl } from "@/components/admin/OrderStatusControl";
import type { OrderOperation } from "@/lib/admin/order-operations";
vi.mock("@/app/admin/orders/actions",()=>({changeOrderStatus:vi.fn()}));

const id = "10000000-0000-4000-8000-000000000001";
const refs = [{ kind: "native" as const, orderId: id }];
const operation:OrderOperation = { ...refs[0], status: "processing", revision: 0, sourceStatus: "paid",
  sourceVersion: "a".repeat(64), allowedTargets: ["on_hold","completed"], staleOverlay: false,
  reviewReason: null,fulfillmentReferenceRequired:true };
const noteContext = { ...refs[0], orderNumber: "10008", notes: [], hasMore: false };
const notification = { ...refs[0], orderNumber: "10008", eventType: "customer_order_confirmed",
  recipientKind: "customer", status: "pending", createdAt: "2026-10-08T20:00:00Z", sentAt: null,
  errorCode: null, uncertaintyCode: null, blockCode: null };

function client(responses: Record<string, unknown>) {
  const rpc = vi.fn((name: string) => ({ abortSignal: vi.fn().mockResolvedValue({ data: responses[name], error: null }) }));
  return { fake: { rpc } as unknown as SupabaseClient, rpc };
}

describe("Matcha native admin contracts", () => {
  it("renders completion in list and detail when Matcha server authority permits it", async () => {
    const c = client({ vf_admin_native_orders_page_v1: { rows: [{ id, order_number: "10008",
      customer_email: "matcha@example.test", status: "paid", payment_status: "paid", total_cents: 2900,
      refunded_cents: 0, currency: "cad", placed_at: "2026-10-08T20:00:00Z", created_at: "2026-10-08T20:00:00Z",
      source: "matcha_subscription", billing_address: { name: "Matcha Customer" }, shipping_address: {},
      shipping_method_snapshot: "Canada Post", operation }], total: 1, nextCursor: null },
      vf_admin_order_operations_v1: { orders: [operation], operational: true } });
    const page = await loadOrderPage(c.fake);
    expect(page.connected).toBe(true);
    expect(page.orders).toMatchObject([{ id, source: "matcha_subscription", orderNumber: "10008",
      totalCents: 2900, operation: { allowedTargets: ["on_hold","completed"], reviewReason: null,
        fulfillmentReferenceRequired:true } }]);
    const controls = await loadOrderOperations(c.fake, refs);
    expect(controls.error).toBeNull();
    expect(controls.orders.get("native:" + id)).toMatchObject({allowedTargets:["on_hold","completed"],
      fulfillmentReferenceRequired:true});
    const html=renderToStaticMarkup(createElement(OrderStatusControl,{order:controls.orders.get("native:"+id)!,number:"10008"}));
    expect(html).toContain("Change status");
    expect(html).toContain("Mark completed");
    expect(c.rpc.mock.calls.map(([name]) => name)).toEqual([
      "vf_admin_native_orders_page_v1", "vf_admin_order_operations_v1",
    ]);
  });

  it.each([
    ["web","stripe",false],
    ["pos","cash",false],
    ["pos","stripe",false],
    ["subscription_renewal","stripe",false],
    ["matcha_subscription","stripe",true],
  ] as const)("renders the same completion control for server-authorized %s/%s fixtures",async(source,paymentProvider,required)=>{
    const controls={...operation,fulfillmentReferenceRequired:required};
    const c=client({vf_admin_native_orders_page_v1:{rows:[{id,order_number:"10008",
      customer_email:null,status:"paid",payment_status:"paid",payment_provider:paymentProvider,total_cents:2900,
      refunded_cents:0,currency:"cad",placed_at:"2026-10-08T20:00:00Z",created_at:"2026-10-08T20:00:00Z",
      source,billing_address:{},shipping_address:{},shipping_method_snapshot:"Local pickup",operation:controls}],
      total:1,nextCursor:null}});
    const page=await loadOrderPage(c.fake);
    expect(page.connected).toBe(true);
    expect(page.orders[0]).toMatchObject({source,operation:{allowedTargets:["on_hold","completed"],
      fulfillmentReferenceRequired:required}});
    const html=renderToStaticMarkup(createElement(OrderStatusControl,{order:page.orders[0].operation!,number:"10008"}));
    expect(html).toContain("Change status");
    expect(html).toContain("Mark completed");
  });

  it("offers other permitted changes without exposing completion when it is not authorized",()=>{
    const html=renderToStaticMarkup(createElement(OrderStatusControl,{order:{...operation,allowedTargets:["on_hold"]},number:"10008"}));
    expect(html).toContain("Change status");
    expect(html).not.toContain("Mark completed");
  });

  it.each([
    {allowedTargets:[],reviewReason:"not_actionable"},
    {allowedTargets:[],staleOverlay:true,reviewReason:"source_changed"},
    {allowedTargets:[],status:"completed",sourceStatus:"fulfilled",revision:1},
  ])("does not manufacture a completion button when server authority refuses it %#",async(change)=>{
    const denied={...operation,...change};
    const c=client({vf_admin_order_operations_v1:{orders:[denied],operational:true}});
    const controls=await loadOrderOperations(c.fake,refs);
    expect(controls.error).toBeNull();
    expect(controls.orders.get("native:"+id)?.allowedTargets).toEqual([]);
    const html=renderToStaticMarkup(createElement(OrderStatusControl,{order:controls.orders.get("native:"+id)!,number:"10008"}));
    expect(html).not.toContain("Change status");
    expect(html).not.toContain("Mark completed");
    expect(html).not.toContain("Save status");
  });

  it("reads queued confirmations and both note panels through the exact native order reference", async () => {
    const c = client({ vf_admin_order_email_status_v1: { notifications: [notification] },
      vf_admin_customer_order_notes_v1: { ...noteContext, recipientEmail: "matcha@example.test",
        sourceVersion: "b".repeat(64), canSend: true, unavailableReason: null },
      vf_admin_private_order_notes_v1: noteContext });
    const emails = await loadOrderEmailStatuses(c.fake, refs);
    const notes = await loadCustomerOrderNotes(c.fake, "native", id);
    const privateNotes = await loadPrivateOrderNotes(c.fake, "native", id);
    expect(emails).toEqual({ notifications: [notification], error: null });
    expect(notes.error).toBeNull();
    expect(notes.context).toMatchObject({ ...noteContext, recipientEmail: "matcha@example.test", canSend: true });
    expect(privateNotes).toEqual({ context: noteContext, error: null });
    expect(c.rpc).toHaveBeenCalledWith("vf_admin_order_email_status_v1", { p_refs: refs });
    expect(c.rpc).toHaveBeenCalledWith("vf_admin_customer_order_notes_v1", { p_order_kind: "native", p_order_id: id });
    expect(c.rpc).toHaveBeenCalledWith("vf_admin_private_order_notes_v1", { p_order_kind: "native", p_order_id: id });
    expect(c.rpc).toHaveBeenCalledTimes(3);
  });
});
