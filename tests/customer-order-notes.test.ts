import { describe, expect, it, vi } from "vitest";
import { customerNoteState, loadCustomerOrderNotes, normalizeCustomerNote, parseCustomerNoteReceipt, parseCustomerNoteRequest, parseCustomerNotesContext } from "@/lib/admin/customer-order-notes";

const orderId = "10000000-0000-4000-8000-000000000001", operationId = "20000000-0000-4000-8000-000000000001";
const sourceVersion = "a".repeat(64), createdAt = "2026-09-13T20:00:00Z";
const request = { kind: "native" as const, orderId, operationId, sourceVersion, body: "Your tea is ready.\nPlease reply with your pickup time." };
const note = { id: operationId, body: request.body, recipientEmail: "buyer@example.test", status: "pending", createdAt, sentAt: null };
const context = { kind: "native", orderId, orderNumber: "10008", recipientEmail: "buyer@example.test", sourceVersion, canSend: true, unavailableReason: null, notes: [note], hasMore: false };

describe("customer note contract", () => {
  it("normalizes only ASCII edge whitespace and line endings; preserves plain text", () => {
    expect(normalizeCustomerNote(" \t\r\nHello\r\nWorld\rLast\t ")).toBe("Hello\nWorld\nLast");
    expect(normalizeCustomerNote("<script>alert('x')</script> & tea")).toBe("<script>alert('x')</script> & tea");
    expect(normalizeCustomerNote("\u00a0Tea\u00a0")).toBe("\u00a0Tea\u00a0");
  });
  it.each([null, 12, "", "  \t\r\n", "Hi", "a".repeat(5001), "tea\0", "\u000btea", "tea\u007f"])("rejects invalid note body %#", body => {
    expect(() => normalizeCustomerNote(body)).toThrow();
  });
  it("counts Unicode code points consistently with the database", () => {
    expect(normalizeCustomerNote("🍵".repeat(5000))).toHaveLength(10000);
    expect(() => normalizeCustomerNote("🍵".repeat(5001))).toThrow();
  });
  it("accepts distinct notes with the same event semantics and preserves wide imported IDs", () => {
    const two = { ...context, notes: [note, { ...note, id: "20000000-0000-4000-8000-000000000002", body: "A second intentional note." }] };
    expect(parseCustomerNotesContext(two, "native", orderId).notes).toHaveLength(2);
    const imported = { ...context, kind: "imported", orderId: "18446744073709551615", orderNumber: "18446744073709551615" };
    expect(parseCustomerNotesContext(imported, "imported", imported.orderId).orderId).toBe(imported.orderId);
  });
  it.each([
    { orderId: "10000000-0000-4000-8000-000000000002" }, { kind: "imported" }, { sourceVersion: "bad" },
    { recipientEmail: "bad\r\nTo: other@example.test" }, { recipientEmail: null }, { canSend: false },
    { notes: [note, note] }, { notes: Array.from({ length: 21 }, () => note) }, { hasMore: "yes" },
    { secret: "unexpected" }, { unavailableReason: "unknown" },
    { notes: [{ ...note, status: "delivered" }] }, { notes: [{ ...note, status: "sent" }] },
    { notes: [{ ...note, body: " unnormalized " }] }, { notes: [{ ...note, createdAt: "invalid" }] },
  ])("rejects mismatched, malformed or unsafe context %#", change => {
    expect(() => parseCustomerNotesContext({ ...context, ...change }, "native", orderId)).toThrow();
  });
  it.each(["recipient_missing_or_invalid", "recipient_ambiguous", "order_unavailable"])("represents unavailable recipient/order without enabling send: %s", reason => {
    expect(parseCustomerNotesContext({ ...context, canSend: false, recipientEmail: null, unavailableReason: reason }, "native", orderId).canSend).toBe(false);
  });
  it("limits request fields and matches receipts to the exact operation and order", () => {
    expect(parseCustomerNoteRequest({ ...request, body: "  Hello\r\nthere  " }).body).toBe("Hello\nthere");
    expect(() => parseCustomerNoteRequest({ ...request, recipientEmail: "another@example.test" })).toThrow();
    const receipt = { kind: request.kind, orderId, noteId: operationId, status: "pending", createdAt, replayed: false };
    expect(parseCustomerNoteReceipt(receipt, request)).toEqual(receipt);
    for (const change of [{ noteId: orderId }, { orderId: operationId }, { kind: "imported" }, { replayed: "false" }, { status: "delivered" }]) expect(() => parseCustomerNoteReceipt({ ...receipt, ...change }, request)).toThrow();
  });
  it("loads the exact order through the native RPC, with a bounded timeout", async () => {
    const abortSignal = vi.fn().mockResolvedValue({ data: context, error: null });
    const rpc = vi.fn().mockReturnValue({ abortSignal });
    expect(await loadCustomerOrderNotes({ rpc } as never, "native", orderId)).toEqual({ context, error: null });
    expect(rpc).toHaveBeenCalledWith("vf_admin_customer_order_notes_v1", { p_order_kind: "native", p_order_id: orderId });
    expect(abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
  });
  it("never calls an RPC for an invalid reference, and distinguishes failure from empty history", async () => {
    const rpc = vi.fn();
    expect((await loadCustomerOrderNotes({ rpc } as never, "native", "bad")).error).toBeTruthy();
    expect(rpc).not.toHaveBeenCalled();
    rpc.mockReturnValue({ abortSignal: vi.fn().mockResolvedValue({ data: null, error: { code: "42501", message: "private error" } }) });
    const result = await loadCustomerOrderNotes({ rpc } as never, "native", orderId);
    expect(result.context).toBeNull(); expect(result.error).not.toContain("private error");
  });
  it("never treats a queue or unknown provider outcome as sent", () => {
    expect(customerNoteState("pending").label).toBe("Queued");
    expect(customerNoteState("processing").label).toBe("Queued");
    expect(customerNoteState("sent").label).toBe("Sent");
    for (const status of ["uncertain", "failed", "blocked"] as const) expect(customerNoteState(status).label).toBe("Needs attention");
  });
});
