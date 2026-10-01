import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/admin/orders/customer-note-actions", () => ({ previewCustomerOrderNote: vi.fn(), refreshCustomerOrderNotes: vi.fn(), sendCustomerOrderNote: vi.fn() }));
import { CustomerOrderNotes, CustomerNotePreview } from "@/components/admin/CustomerOrderNotes";
import { customerNoteDraft, emptyNoteDraft, matchingCustomerNoteReceipt } from "@/lib/admin/customer-order-note-draft";
import { sendCustomerOrderNote, previewCustomerOrderNote } from "@/app/admin/orders/customer-note-actions";
import type { CustomerNotesContext } from "@/lib/admin/customer-order-notes";
const orderId = "10000000-0000-4000-8000-000000000001", operationId = "20000000-0000-4000-8000-000000000001";
const context: CustomerNotesContext = { kind: "native", orderId, orderNumber: "10008", recipientEmail: "buyer@example.test", sourceVersion: "a".repeat(64), canSend: true, unavailableReason: null, notes: [], hasMore: false };
const request = { kind: "native" as const, orderId, operationId, sourceVersion: context.sourceVersion, body: "Hello\nYour tea is ready." };
const preview = { context, request };
const receipt = { kind: "native" as const, orderId, noteId: operationId, status: "pending" as const, createdAt: "2026-09-13T20:00:00Z", replayed: true };

describe("customer note UI and draft lifecycle", () => {
  it("opening the order shows an explicit compose button and never calls preview or send", () => {
    const html = renderToStaticMarkup(createElement(CustomerOrderNotes, { kind: "native", orderId, context, error: null }));
    expect(html).toContain("Email customer a note"); expect(html).toContain("Refresh note status");
    expect(html).toContain("Note history"); expect(html).not.toContain("<textarea");
    expect(html).toContain("does not guarantee delivery");
    expect(sendCustomerOrderNote).not.toHaveBeenCalled(); expect(previewCustomerOrderNote).not.toHaveBeenCalled();
  });
  it("shows missing and ambiguous recipients as unavailable", () => {
    for (const reason of ["recipient_ambiguous", "recipient_missing_or_invalid", "order_unavailable"] as const) {
      const html = renderToStaticMarkup(createElement(CustomerOrderNotes, { kind: "native", orderId, context: { ...context, recipientEmail: null, canSend: false, unavailableReason: reason }, error: null }));
      expect(html).toMatch(/disabled=""[^>]*>Email customer a note/);
    }
  });
  it("previews full recipient, fixed subject, escaped body and actual email footer", () => {
    const html = renderToStaticMarkup(createElement(CustomerNotePreview, { context, body: "<script>bad()</script>\n& tea" }));
    expect(html).toContain("buyer@example.test"); expect(html).toContain("A note about your Vintage Fork order #");
    expect(html).toContain("&lt;script&gt;bad()&lt;/script&gt;\n&amp; tea"); expect(html).not.toContain("<script>");
    expect(html).toContain("Reply to this email if you have any questions.");
  });
  it("renders multiple notes, honest statuses and bounded-history disclosure", () => {
    const notes = ["pending", "sent", "uncertain"].map((status, i) => ({ id: operationId.slice(0, -1) + i, body: "Note " + i, recipientEmail: "buyer@example.test", status, createdAt: receipt.createdAt, sentAt: status === "sent" ? receipt.createdAt : null })) as CustomerNotesContext["notes"];
    const html = renderToStaticMarkup(createElement(CustomerOrderNotes, { kind: "native", orderId, context: { ...context, notes, hasMore: true }, error: null }));
    expect(html.match(/<li>/g)).toHaveLength(3);
    for (const text of ["Queued", "Sent", "Needs attention", "latest 20", "uncertain"]) expect(html).toContain(text);
  });
  it("keeps previously sent note history visible when the current recipient becomes unavailable", () => {
    const notes = [{ id: operationId, body: "Earlier customer note.", recipientEmail: "old@example.test", status: "sent" as const, createdAt: receipt.createdAt, sentAt: receipt.createdAt }];
    const html = renderToStaticMarkup(createElement(CustomerOrderNotes, { kind: "native", orderId, context: { ...context, recipientEmail: null, canSend: false, unavailableReason: "recipient_missing_or_invalid", notes }, error: null }));
    expect(html).toContain("no valid customer email");
    expect(html).toContain("Earlier customer note."); expect(html).toContain("old@example.test");
    expect(html).not.toContain("history is currently unavailable");
  });
  it("editing invalidates a preview while preserving its body", () => {
    let state = customerNoteDraft(emptyNoteDraft, { type: "open" });
    state = customerNoteDraft(state, { type: "edit", body: request.body });
    state = customerNoteDraft(state, { type: "preview", value: preview });
    expect(state.phase).toBe("preview");
    state = customerNoteDraft(state, { type: "back" });
    expect(state).toMatchObject({ phase: "compose", body: request.body, preview: null });
  });
  it("locks the exact request on uncertain send, preventing edit, cancel or a new request", () => {
    let state = customerNoteDraft({ ...emptyNoteDraft, phase: "compose", body: request.body }, { type: "preview", value: preview });
    state = customerNoteDraft(state, { type: "unconfirmed", message: "Check status" });
    for (const event of [{ type: "edit", body: "different" }, { type: "cancel" }, { type: "open" }, { type: "back" }, { type: "rejected", message: "later access denied" }] as const) state = customerNoteDraft(state, event);
    expect(state).toMatchObject({ phase: "unconfirmed", body: request.body, preview });
    expect(state.preview?.request).toBe(request);
  });
  it("reconciles an unknown send only by its exact ID, body, recipient and order", () => {
    const note = { id: operationId, body: request.body, recipientEmail: context.recipientEmail!, status: "pending" as const, createdAt: receipt.createdAt, sentAt: null };
    expect(matchingCustomerNoteReceipt({ ...context, notes: [note] }, preview)).toEqual(receipt);
    for (const changed of [{ ...note, id: orderId }, { ...note, body: "Different message" }, { ...note, recipientEmail: "other@example.test" }]) expect(matchingCustomerNoteReceipt({ ...context, notes: [changed] }, preview)).toBeNull();
    expect(matchingCustomerNoteReceipt({ ...context, orderId: operationId, notes: [note] }, preview)).toBeNull();
  });
  it("confirmed receipt unlocks new composition; unrelated or later network errors cannot erase it", () => {
    let state = customerNoteDraft({ ...emptyNoteDraft, phase: "compose" }, { type: "preview", value: preview });
    state = customerNoteDraft(state, { type: "unconfirmed", message: "unknown" });
    expect(customerNoteDraft(state, { type: "recorded", receipt: { ...receipt, noteId: orderId } })).toBe(state);
    state = customerNoteDraft(state, { type: "recorded", receipt });
    expect(state.phase).toBe("recorded");
    state = customerNoteDraft(state, { type: "unconfirmed", message: "refresh failed" });
    expect(state.phase).toBe("recorded");
    expect(customerNoteDraft(state, { type: "open" })).toMatchObject({ phase: "compose", body: "", preview: null });
  });
});
