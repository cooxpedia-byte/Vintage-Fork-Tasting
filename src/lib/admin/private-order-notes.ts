import type { SupabaseClient } from "@supabase/supabase-js";
import { validOrderRef, type OrderKind } from "./order-operations";

export type PrivateOrderNote = { id: string; body: string; authorName: string; createdAt: string };
export type PrivateNotesContext = { kind: OrderKind; orderId: string; orderNumber: string; notes: PrivateOrderNote[]; hasMore: boolean };
export type PrivateNoteRequest = { kind: OrderKind; orderId: string; operationId: string; body: string };
export type PrivateNoteReceipt = { kind: OrderKind; orderId: string; noteId: string; authorName: string; createdAt: string; replayed: boolean };

function record(value: unknown, fields: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== fields.length || Object.keys(value).some(key => !fields.includes(key))) throw Error("Invalid private note response.");
  return value as Record<string, unknown>;
}
const timestamp = (value: unknown): value is string => typeof value === "string" && value.length <= 50 && Number.isFinite(Date.parse(value));
const author = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0 && Array.from(value).length <= 200 && !/[\u0000-\u001f\u007f]/.test(value);

export function normalizePrivateNote(value: unknown): string {
  if (typeof value !== "string" || value.length > 20000) throw Error("Write a private note between 3 and 5,000 characters.");
  const body = value.replace(/\r\n?/g, "\n").replace(/^[ \t\n]+|[ \t\n]+$/g, "");
  const length = Array.from(body).length;
  if (length < 3 || length > 5000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(body)) throw Error("Write a private note between 3 and 5,000 characters using plain text.");
  return body;
}

export function parsePrivateNotesContext(value: unknown, kind: OrderKind, orderId: string): PrivateNotesContext {
  const row = record(value, ["kind", "orderId", "orderNumber", "notes", "hasMore"]);
  if (!validOrderRef(kind, orderId) || row.kind !== kind || row.orderId !== orderId || typeof row.orderNumber !== "string" || !/^[1-9][0-9]{0,30}$/.test(row.orderNumber)
    || !Array.isArray(row.notes) || row.notes.length > 20 || typeof row.hasMore !== "boolean") throw Error("Invalid private note context.");
  const seen = new Set<string>();
  const notes = row.notes.map(value => {
    const note = record(value, ["id", "body", "authorName", "createdAt"]);
    if (typeof note.id !== "string" || !validOrderRef("native", note.id) || seen.has(note.id) || normalizePrivateNote(note.body) !== note.body || !author(note.authorName) || !timestamp(note.createdAt)) throw Error("Invalid private note history.");
    seen.add(note.id);
    return note as PrivateOrderNote;
  });
  return { ...row, notes } as PrivateNotesContext;
}

export function parsePrivateNoteRequest(value: unknown): PrivateNoteRequest {
  const row = record(value, ["kind", "orderId", "operationId", "body"]);
  if (!validOrderRef(row.kind, row.orderId) || typeof row.orderId !== "string" || typeof row.operationId !== "string" || !validOrderRef("native", row.operationId)) throw Error("Invalid private note request.");
  return { kind: row.kind, orderId: row.orderId, operationId: row.operationId, body: normalizePrivateNote(row.body) };
}

export function parsePrivateNoteReceipt(value: unknown, request: PrivateNoteRequest): PrivateNoteReceipt {
  const row = record(value, ["kind", "orderId", "noteId", "authorName", "createdAt", "replayed"]);
  if (row.kind !== request.kind || row.orderId !== request.orderId || row.noteId !== request.operationId || !author(row.authorName) || !timestamp(row.createdAt) || typeof row.replayed !== "boolean") throw Error("Unconfirmed private note receipt.");
  return row as PrivateNoteReceipt;
}

export async function loadPrivateOrderNotes(client: SupabaseClient, kind: OrderKind, orderId: string): Promise<{ context: PrivateNotesContext | null; error: string | null }> {
  try {
    if (!validOrderRef(kind, orderId)) throw Error("Invalid order reference.");
    const result = await client.rpc("vf_admin_private_order_notes_v1", { p_order_kind: kind, p_order_id: orderId }).abortSignal(AbortSignal.timeout(12000));
    if (result.error) throw Error("Private notes unavailable.");
    return { context: parsePrivateNotesContext(result.data, kind, orderId), error: null };
  } catch { return { context: null, error: "Private staff notes could not be loaded. Refresh to try again." }; }
}
