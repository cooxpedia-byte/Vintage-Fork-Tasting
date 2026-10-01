import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/admin/orders/private-note-actions", () => ({ addPrivateOrderNote: vi.fn(), refreshPrivateOrderNotes: vi.fn() }));
import { PrivateOrderNotes } from "@/components/admin/PrivateOrderNotes";
import { emptyPrivateNoteDraft, matchingPrivateNoteReceipt, privateNoteDraft } from "@/lib/admin/private-order-note-draft";
import { addPrivateOrderNote, refreshPrivateOrderNotes } from "@/app/admin/orders/private-note-actions";
import type { PrivateNotesContext } from "@/lib/admin/private-order-notes";

const orderId = "10000000-0000-4000-8000-000000000001", operationId = "20000000-0000-4000-8000-000000000001";
const context: PrivateNotesContext = { kind: "native", orderId, orderNumber: "10008", notes: [], hasMore: false };
const request = { kind: "native" as const, orderId, operationId, body: "Staff packing instruction.\nHandle with care." };
const receipt = { kind: "native" as const, orderId, noteId: operationId, authorName: "Staff member", createdAt: "2026-09-13T21:00:00Z", replayed: true };

describe("private staff note UI", () => {
  it("renders a labelled private panel without saving, refreshing or opening a composer", () => {
    const html = renderToStaticMarkup(createElement(PrivateOrderNotes, { kind: "native", orderId, context, error: null }));
    expect(html).toContain("Private staff notes"); expect(html).toContain("Add private note");
    expect(html).toContain("never emailed or shown to customers"); expect(html).not.toContain("<textarea");
    expect(html).not.toContain("Preview email"); expect(html).not.toContain("Send customer note");
    expect(addPrivateOrderNote).not.toHaveBeenCalled(); expect(refreshPrivateOrderNotes).not.toHaveBeenCalled();
  });
  it("enables private notes without any customer recipient or payment-status field", () => {
    const html = renderToStaticMarkup(createElement(PrivateOrderNotes, { kind: "native", orderId, context, error: null }));
    expect(html).not.toMatch(/disabled=""[^>]*>Add private note/);
  });
  it("shows unavailable history distinctly and disables composing if the protected read failed", () => {
    const html = renderToStaticMarkup(createElement(PrivateOrderNotes, { kind: "native", orderId, context: null, error: "Private notes unavailable." }));
    expect(html).toMatch(/disabled=""[^>]*>Add private note/);
    expect(html).toContain("history is currently unavailable"); expect(html).not.toContain("No private staff notes have been saved");
  });
  it("renders complete escaped private history with author and timestamp", () => {
    const notes = [{ id: operationId, body: "<script>Staff instruction</script>\n& tea", authorName: "<Admin>", createdAt: receipt.createdAt }];
    const html = renderToStaticMarkup(createElement(PrivateOrderNotes, { kind: "native", orderId, context: { ...context, notes, hasMore: true }, error: null }));
    expect(html).toContain("&lt;Admin&gt;"); expect(html).toContain("&lt;script&gt;Staff instruction&lt;/script&gt;\n&amp; tea");
    expect(html).not.toContain("<script>"); expect(html).toContain('dateTime="2026-09-13T21:00:00Z"');
    expect(html).toContain("latest 20 private notes"); expect(html).toContain("Edmonton time");
    expect(html).not.toContain("Queued"); expect(html).not.toContain("Sent");
  });
  it("freezes the exact normalized request when saving and blocks editing or cancel while pending", () => {
    let state = privateNoteDraft(emptyPrivateNoteDraft, { type: "open" });
    state = privateNoteDraft(state, { type: "edit", body: "  " + request.body + "  " });
    state = privateNoteDraft(state, { type: "submit", request });
    for (const event of [{ type: "edit", body: "changed" }, { type: "cancel" }, { type: "open" }] as const) state = privateNoteDraft(state, event);
    expect(state).toMatchObject({ phase: "saving", body: request.body, request });
    expect(state.request).toBe(request);
  });
  it("keeps an uncertain save immutable through retry and later authorization failure", () => {
    let state = privateNoteDraft({ ...emptyPrivateNoteDraft, phase: "compose", body: request.body }, { type: "submit", request });
    state = privateNoteDraft(state, { type: "unconfirmed", message: "Check status" });
    for (const event of [{ type: "edit", body: "other" }, { type: "cancel" }, { type: "open" }, { type: "submit", request: { ...request, operationId: orderId } }, { type: "rejected", message: "Now denied" }] as const) state = privateNoteDraft(state, event);
    expect(state).toMatchObject({ phase: "unconfirmed", body: request.body, request });
    state = privateNoteDraft(state, { type: "unconfirmed", message: "Reconnect to check this save" });
    expect(state.message).toBe("Reconnect to check this save"); expect(state.request).toBe(request);
  });
  it("a definite first-save rejection returns to editing without discarding the body", () => {
    let state = privateNoteDraft({ ...emptyPrivateNoteDraft, phase: "compose", body: request.body }, { type: "submit", request });
    state = privateNoteDraft(state, { type: "rejected", message: "Review this order" });
    expect(state).toMatchObject({ phase: "compose", body: request.body, request: null });
  });
  it("reconciles history only for the same order, ID and exact body", () => {
    const note = { id: operationId, body: request.body, authorName: receipt.authorName, createdAt: receipt.createdAt };
    expect(matchingPrivateNoteReceipt({ ...context, notes: [note] }, request)).toEqual(receipt);
    expect(matchingPrivateNoteReceipt({ ...context, notes: [{ ...note, body: "Different note" }] }, request)).toBeNull();
    expect(matchingPrivateNoteReceipt({ ...context, notes: [{ ...note, id: orderId }] }, request)).toBeNull();
    expect(matchingPrivateNoteReceipt({ ...context, orderId: operationId, notes: [note] }, request)).toBeNull();
  });
  it("confirms only a matching receipt and never downgrades a confirmed save on refresh failure", () => {
    let state = privateNoteDraft({ ...emptyPrivateNoteDraft, phase: "compose", body: request.body }, { type: "submit", request });
    state = privateNoteDraft(state, { type: "unconfirmed", message: "Unknown save" });
    expect(privateNoteDraft(state, { type: "saved", receipt: { ...receipt, noteId: orderId } })).toBe(state);
    state = privateNoteDraft(state, { type: "saved", receipt });
    expect(state.phase).toBe("saved");
    expect(privateNoteDraft(state, { type: "unconfirmed", message: "Refresh failed" }).phase).toBe("saved");
    expect(privateNoteDraft(state, { type: "open" })).toMatchObject({ phase: "compose", body: "", request: null });
  });
});
