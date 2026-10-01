import { describe, expect, it, vi } from "vitest";
import { loadPrivateOrderNotes, normalizePrivateNote, parsePrivateNoteReceipt, parsePrivateNoteRequest, parsePrivateNotesContext } from "@/lib/admin/private-order-notes";

const orderId = "10000000-0000-4000-8000-000000000001", operationId = "20000000-0000-4000-8000-000000000001";
const request = { kind: "native" as const, orderId, operationId, body: "Hold for staff review.\nCheck the packing slip." };
const note = { id: operationId, body: request.body, authorName: "Staff member", createdAt: "2026-09-13T21:00:00Z" };
const context = { kind: "native", orderId, orderNumber: "10008", notes: [note], hasMore: false };

describe("private staff note contract", () => {
  it("normalizes line endings and ASCII edge whitespace without altering plain text", () => {
    expect(normalizePrivateNote(" \t\r\nPacking\r\nreview\rNeeded\t ")).toBe("Packing\nreview\nNeeded");
    expect(normalizePrivateNote("<script>example</script> & tea")).toBe("<script>example</script> & tea");
    expect(normalizePrivateNote("\u00a0Tea\u00a0")).toBe("\u00a0Tea\u00a0");
  });
  it.each([null, 12, "", " \t\n", "Hi", "a".repeat(5001), "tea\0", "\u000btea", "tea\u007f"])("rejects invalid body %#", body => {
    expect(() => normalizePrivateNote(body)).toThrow();
  });
  it("permits 5,000 Unicode code points including surrogate pairs", () => {
    expect(normalizePrivateNote("🍵".repeat(5000))).toHaveLength(10000);
    expect(() => normalizePrivateNote("🍵".repeat(5001))).toThrow();
  });
  it("accepts history without any recipient or status requirement", () => {
    expect(parsePrivateNotesContext(context, "native", orderId)).toEqual(context);
    expect(parsePrivateNotesContext({ ...context, notes: [] }, "native", orderId).notes).toEqual([]);
    const imported = { ...context, kind: "imported", orderId: "18446744073709551615", orderNumber: "18446744073709551615" };
    expect(parsePrivateNotesContext(imported, "imported", imported.orderId).orderId).toBe(imported.orderId);
  });
  it("keeps two intentional notes with the same body as distinct records", () => {
    const two = { ...context, notes: [note, { ...note, id: "20000000-0000-4000-8000-000000000002" }] };
    expect(parsePrivateNotesContext(two, "native", orderId).notes).toHaveLength(2);
  });
  it.each([
    { kind: "imported" }, { orderId: operationId }, { orderNumber: 10008 }, { recipientEmail: "person@example.test" },
    { notes: [note, note] }, { notes: Array.from({ length: 21 }, () => note) }, { hasMore: "yes" },
    { notes: [{ ...note, body: " Unnormalized " }] }, { notes: [{ ...note, createdAt: "invalid" }] },
    { notes: [{ ...note, authorName: "" }] }, { notes: [{ ...note, authorName: "\u00a0" }] },
    { notes: [{ ...note, authorName: "a".repeat(201) }] }, { notes: [{ ...note, authorName: "Staff\nmember" }] },
    { notes: [{ ...note, actorUserId: operationId }] },
  ])("rejects unrelated, duplicate or unsafe context %#", change => {
    expect(() => parsePrivateNotesContext({ ...context, ...change }, "native", orderId)).toThrow();
  });
  it("accepts the sanitized fallback author and bounded Unicode names", () => {
    expect(parsePrivateNotesContext(context, "native", orderId).notes[0].authorName).toBe("Staff member");
    expect(parsePrivateNotesContext({ ...context, notes: [{ ...note, authorName: "🍵".repeat(200) }] }, "native", orderId).notes[0].authorName).toHaveLength(400);
  });
  it("rejects forged authors or email intent in a write request", () => {
    expect(parsePrivateNoteRequest({ ...request, body: "  Internal\r\nnote  " }).body).toBe("Internal\nnote");
    for (const field of [{ authorName: "Another staff member" }, { recipientEmail: "person@example.test" }, { sourceVersion: "a".repeat(64) }, { sendEmail: true }]) expect(() => parsePrivateNoteRequest({ ...request, ...field })).toThrow();
  });
  it("accepts a receipt only for the exact operation and order", () => {
    const receipt = { kind: "native", orderId, noteId: operationId, authorName: note.authorName, createdAt: note.createdAt, replayed: false };
    expect(parsePrivateNoteReceipt(receipt, request)).toEqual(receipt);
    for (const change of [{ noteId: orderId }, { orderId: operationId }, { kind: "imported" }, { replayed: "false" }, { authorName: "\u00a0" }, { status: "sent" }]) expect(() => parsePrivateNoteReceipt({ ...receipt, ...change }, request)).toThrow();
  });
  it("uses only the exact private read RPC with a bounded timeout", async () => {
    const abortSignal = vi.fn().mockResolvedValue({ data: context, error: null });
    const rpc = vi.fn().mockReturnValue({ abortSignal });
    expect(await loadPrivateOrderNotes({ rpc } as never, "native", orderId)).toEqual({ context, error: null });
    expect(rpc).toHaveBeenCalledWith("vf_admin_private_order_notes_v1", { p_order_kind: "native", p_order_id: orderId });
    expect(abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
  });
  it("does not query malformed references or treat a denial as empty history", async () => {
    const rpc = vi.fn();
    expect((await loadPrivateOrderNotes({ rpc } as never, "native", "bad")).error).toBeTruthy();
    expect(rpc).not.toHaveBeenCalled();
    rpc.mockReturnValue({ abortSignal: vi.fn().mockResolvedValue({ data: null, error: { code: "42501", message: "private database data" } }) });
    const result = await loadPrivateOrderNotes({ rpc } as never, "native", orderId);
    expect(result.context).toBeNull(); expect(result.error).not.toContain("private database data");
  });
});
