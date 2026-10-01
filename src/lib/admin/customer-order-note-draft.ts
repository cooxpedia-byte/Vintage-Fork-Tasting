import type { CustomerNoteRequest, CustomerNotesContext, CustomerNoteReceipt } from "./customer-order-notes";

export type NotePreview = { context: CustomerNotesContext; request: CustomerNoteRequest };
export type NoteDraft = { phase: "closed" | "compose" | "preview" | "unconfirmed" | "recorded"; body: string; preview: NotePreview | null; message: string; receipt: CustomerNoteReceipt | null };
export const emptyNoteDraft: NoteDraft = { phase: "closed", body: "", preview: null, message: "", receipt: null };
export type NoteDraftEvent =
  | { type: "open" } | { type: "edit"; body: string } | { type: "back" } | { type: "cancel" }
  | { type: "preview"; value: NotePreview } | { type: "message"; message: string }
  | { type: "unconfirmed"; message: string } | { type: "rejected"; message: string }
  | { type: "recorded"; receipt: CustomerNoteReceipt };

export function customerNoteDraft(state: NoteDraft, event: NoteDraftEvent): NoteDraft {
  if (event.type === "message") return { ...state, message: event.message };
  if (event.type === "recorded") {
    if (!state.preview || event.receipt.noteId !== state.preview.request.operationId || event.receipt.kind !== state.preview.request.kind || event.receipt.orderId !== state.preview.request.orderId) return state;
    return { ...state, phase: "recorded", receipt: event.receipt, message: "" };
  }
  // An unknown send outcome keeps the exact request immutable until its receipt is found.
  if (state.phase === "unconfirmed") return event.type === "unconfirmed" ? { ...state, message: event.message } : state;
  if (event.type === "unconfirmed" && state.preview && state.phase === "preview") return { ...state, phase: "unconfirmed", message: event.message };
  if (event.type === "rejected") return { ...state, phase: "compose", preview: null, message: event.message };
  if (event.type === "open" && (state.phase === "closed" || state.phase === "recorded")) return { ...emptyNoteDraft, phase: "compose" };
  if (event.type === "edit" && state.phase === "compose") return { ...state, body: event.body, message: "" };
  if (event.type === "preview" && state.phase === "compose") return { ...state, phase: "preview", body: event.value.request.body, preview: event.value, message: "" };
  if (event.type === "back" && state.phase === "preview") return { ...state, phase: "compose", preview: null, message: "" };
  if (event.type === "cancel") return emptyNoteDraft;
  return state;
}

export function matchingCustomerNoteReceipt(context: CustomerNotesContext, preview: NotePreview): CustomerNoteReceipt | null {
  if (context.kind !== preview.request.kind || context.orderId !== preview.request.orderId) return null;
  const note = context.notes.find(n => n.id === preview.request.operationId);
  if (!note || note.body !== preview.request.body || note.recipientEmail !== preview.context.recipientEmail) return null;
  return { kind: context.kind, orderId: context.orderId, noteId: note.id, status: note.status, createdAt: note.createdAt, replayed: true };
}
