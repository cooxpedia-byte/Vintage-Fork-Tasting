import type { PrivateNoteRequest, PrivateNotesContext, PrivateNoteReceipt } from "./private-order-notes";

export type PrivateNoteDraft = { phase: "closed" | "compose" | "saving" | "unconfirmed" | "saved"; body: string; request: PrivateNoteRequest | null; receipt: PrivateNoteReceipt | null; message: string };
export const emptyPrivateNoteDraft: PrivateNoteDraft = { phase: "closed", body: "", request: null, receipt: null, message: "" };
export type PrivateNoteEvent =
  | { type: "open" } | { type: "edit"; body: string } | { type: "cancel" }
  | { type: "submit"; request: PrivateNoteRequest } | { type: "message"; message: string }
  | { type: "unconfirmed"; message: string } | { type: "rejected"; message: string }
  | { type: "saved"; receipt: PrivateNoteReceipt };

export function privateNoteDraft(state: PrivateNoteDraft, event: PrivateNoteEvent): PrivateNoteDraft {
  if (event.type === "message") return { ...state, message: event.message };
  if (event.type === "saved") {
    if (!state.request || event.receipt.noteId !== state.request.operationId || event.receipt.kind !== state.request.kind || event.receipt.orderId !== state.request.orderId) return state;
    return { ...state, phase: "saved", receipt: event.receipt, message: "" };
  }
  // Unknown saves retain the exact payload; retry cannot silently edit or duplicate it.
  if (state.phase === "unconfirmed") return event.type === "unconfirmed" ? { ...state, message: event.message } : state;
  if (event.type === "unconfirmed" && state.phase === "saving") return { ...state, phase: "unconfirmed", message: event.message };
  if (event.type === "rejected" && state.phase === "saving") return { ...state, phase: "compose", request: null, message: event.message };
  if (state.phase === "saving") return state;
  if (event.type === "open" && (state.phase === "closed" || state.phase === "saved")) return { ...emptyPrivateNoteDraft, phase: "compose" };
  if (event.type === "edit" && state.phase === "compose") return { ...state, body: event.body, message: "" };
  if (event.type === "submit" && state.phase === "compose") return { ...state, phase: "saving", body: event.request.body, request: event.request, message: "" };
  if (event.type === "cancel" && state.phase === "compose") return emptyPrivateNoteDraft;
  return state;
}

export function matchingPrivateNoteReceipt(context: PrivateNotesContext, request: PrivateNoteRequest): PrivateNoteReceipt | null {
  if (context.kind !== request.kind || context.orderId !== request.orderId) return null;
  const note = context.notes.find(note => note.id === request.operationId && note.body === request.body);
  if (!note) return null;
  return { kind: context.kind, orderId: context.orderId, noteId: note.id, authorName: note.authorName, createdAt: note.createdAt, replayed: true };
}
