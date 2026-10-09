import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { loadOrderPage } from "@/lib/admin/commerce";
import { loadOrderOperations } from "@/lib/admin/order-operations";
import { loadOrderEmailStatuses } from "@/lib/admin/order-email-status";
import { loadCustomerOrderNotes } from "@/lib/admin/customer-order-notes";
import { loadPrivateOrderNotes } from "@/lib/admin/private-order-notes";

const id = "10000000-0000-4000-8000-000000000001";
const refs = [{ kind: "native" as const, orderId: id }];
const operation = { ...refs[0], status: "processing", revision: 0, sourceStatus: "paid",
  sourceVersion: "a".repeat(64), allowedTargets: [], staleOverlay: false, reviewReason: "not_actionable" };
const noteContext = { ...refs[0], orderNumber: "10008", notes: [], hasMore: false };
const notification = { ...refs[0], orderNumber: "10008", eventType: "customer_order_confirmed",
  recipientKind: "customer", status: "pending", createdAt: "2026-10-08T20:00:00Z", sentAt: null,
  errorCode: null, uncertaintyCode: null, blockCode: null };

function client(responses: Record<string, unknown>) {
  const rpc = vi.fn((name: string) => ({ abortSignal: vi.fn().mockResolvedValue({ data: responses[name], error: null }) }));
  return { fake: { rpc } as unknown as SupabaseClient, rpc };
}

describe("Matcha native admin contracts", () => {
  it("keeps saved Matcha orders in the native list without offering generic fulfillment changes", async () => {
    const c = client({ vf_admin_native_orders_page_v1: { rows: [{ id, order_number: "10008",
      customer_email: "matcha@example.test", status: "paid", payment_status: "paid", total_cents: 2900,
      refunded_cents: 0, currency: "cad", placed_at: "2026-10-08T20:00:00Z", created_at: "2026-10-08T20:00:00Z",
      source: "matcha_subscription", billing_address: { name: "Matcha Customer" }, shipping_address: {},
      shipping_method_snapshot: "Canada Post", operation }], total: 1, nextCursor: null },
      vf_admin_order_operations_v1: { orders: [operation], operational: true } });
    const page = await loadOrderPage(c.fake);
    expect(page.connected).toBe(true);
    expect(page.orders).toMatchObject([{ id, source: "matcha_subscription", orderNumber: "10008",
      totalCents: 2900, operation: { allowedTargets: [], reviewReason: "not_actionable" } }]);
    const controls = await loadOrderOperations(c.fake, refs);
    expect(controls.error).toBeNull();
    expect(controls.orders.get("native:" + id)?.allowedTargets).toEqual([]);
    expect(c.rpc.mock.calls.map(([name]) => name)).toEqual([
      "vf_admin_native_orders_page_v1", "vf_admin_order_operations_v1",
    ]);
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
