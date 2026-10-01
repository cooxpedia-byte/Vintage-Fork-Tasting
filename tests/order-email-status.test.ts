import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { OrderEmailStatus } from "@/components/admin/OrderEmailStatus";
import {
  loadOrderEmailStatuses,
  parseOrderEmailStatuses,
  type OrderEmailNotification,
} from "@/lib/admin/order-email-status";

const nativeId = "08b303bb-907e-48eb-bbc1-7a9602e71b9a";
const refs = [{ kind: "native" as const, orderId: nativeId }];
const notification = (overrides: Partial<OrderEmailNotification> = {}): OrderEmailNotification => ({
  kind: "native",
  orderId: nativeId,
  orderNumber: "10001",
  eventType: "customer_order_confirmed",
  recipientKind: "customer",
  status: "sent",
  createdAt: "2026-09-11T20:00:00.000Z",
  sentAt: "2026-09-11T20:00:01.000Z",
  errorCode: null,
  uncertaintyCode: null,
  blockCode: null,
  ...overrides,
});

describe("order email status reader", () => {
  it("accepts a privacy-limited matching response and permits omitted refs", () => {
    expect(parseOrderEmailStatuses({ notifications: [notification()] }, refs)).toEqual([notification()]);
    expect(parseOrderEmailStatuses({ notifications: [] }, refs)).toEqual([]);
  });

  it("rejects unrelated, duplicate, or unknown notification states", () => {
    expect(() => parseOrderEmailStatuses({ notifications: [notification({ orderId: "38aec99b-ccf6-42bd-ad53-14b79b239acb" })] }, refs)).toThrow();
    expect(() => parseOrderEmailStatuses({ notifications: [notification(), notification()] }, refs)).toThrow();
    expect(() => parseOrderEmailStatuses({ notifications: [notification({ status: "delivered" as never })] }, refs)).toThrow();
  });

  it("does not call the RPC for malformed or duplicate references", async () => {
    const rpc = vi.fn();
    const malformed = await loadOrderEmailStatuses({ rpc } as never, [{ kind: "native", orderId: "bad" }]);
    const duplicate = await loadOrderEmailStatuses({ rpc } as never, [...refs, ...refs]);
    expect(malformed.error).toMatch(/could not be loaded/i);
    expect(duplicate.error).toMatch(/could not be loaded/i);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("uses the owner-only RPC and validates its result", async () => {
    const abortSignal = vi.fn().mockResolvedValue({ data: { notifications: [notification()] }, error: null });
    const rpc = vi.fn().mockReturnValue({ abortSignal });
    const result = await loadOrderEmailStatuses({ rpc } as never, refs);
    expect(rpc).toHaveBeenCalledWith("vf_admin_order_email_status_v1", { p_refs: refs });
    expect(abortSignal).toHaveBeenCalledOnce();
    expect(result).toEqual({ notifications: [notification()], error: null });
  });
});

describe("OrderEmailStatus", () => {
  it("shows provider-accepted sent, queued, and attention states without claiming delivery", () => {
    const html = renderToStaticMarkup(createElement(OrderEmailStatus, {
      error: null,
      notifications: [
        notification(),
        notification({ eventType: "customer_order_completed", status: "uncertain", sentAt: null }),
        notification({ eventType: "merchant_new_order", recipientKind: "merchant", status: "processing", sentAt: null }),
      ],
    }));
    expect(html).toContain("Order confirmation");
    expect(html).toContain("Sent");
    expect(html).toContain("Order completed");
    expect(html).toContain("Needs attention");
    expect(html).toContain("provider accepted");
    expect(html).toContain("does not guarantee delivery");
    expect(html).not.toContain("merchant_new_order");
    const queued = renderToStaticMarkup(createElement(OrderEmailStatus, {
      error: null,
      notifications: [notification({ status: "processing", sentAt: null })],
    }));
    expect(queued).toContain("Queued");
  });

  it("uses No record for historical events omitted by the non-backfilled RPC", () => {
    const html = renderToStaticMarkup(createElement(OrderEmailStatus, { error: null, notifications: [] }));
    expect(html.match(/No record/g)).toHaveLength(2);
    expect(html).toContain("older email");
  });
});
