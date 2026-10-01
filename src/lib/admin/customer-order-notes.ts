import type { SupabaseClient } from "@supabase/supabase-js";
import { validOrderRef, type OrderKind } from "./order-operations";

export type CustomerNoteStatus = "pending" | "processing" | "sent" | "failed" | "uncertain" | "blocked";
export type CustomerOrderNote = { id: string; body: string; recipientEmail: string; status: CustomerNoteStatus; createdAt: string; sentAt: string | null };
export type CustomerNotesContext = {
  kind: OrderKind; orderId: string; orderNumber: string; recipientEmail: string | null; sourceVersion: string;
  canSend: boolean; unavailableReason: "order_unavailable" | "recipient_missing_or_invalid" | "recipient_ambiguous" | null;
  notes: CustomerOrderNote[]; hasMore: boolean;
};
export type CustomerNoteReceipt = { kind: OrderKind; orderId: string; noteId: string; status: CustomerNoteStatus; createdAt: string; replayed: boolean };
export type CustomerNoteRequest = { kind: OrderKind; orderId: string; operationId: string; sourceVersion: string; body: string };
const statuses = new Set(["pending", "processing", "sent", "failed", "uncertain", "blocked"]);
const reasons = new Set(["order_unavailable", "recipient_missing_or_invalid", "recipient_ambiguous"]);
const email = (v: unknown): v is string => typeof v === "string" && v.length <= 254 && /^[^\s@\r\n]+@[^\s@\r\n]+\.[^\s@\r\n]+$/.test(v);
const date = (v: unknown): v is string => typeof v === "string" && v.length <= 50 && Number.isFinite(Date.parse(v));
const version = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
function record(v: unknown, fields: string[]): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v) || Object.keys(v).length !== fields.length || Object.keys(v).some(k => !fields.includes(k))) throw Error("Invalid customer note response.");
  return v as Record<string, unknown>;
}

export function normalizeCustomerNote(value: unknown): string {
  if (typeof value !== "string" || value.length > 20000) throw Error("Write a note between 3 and 5,000 characters.");
  const body = value.replace(/\r\n?/g, "\n").replace(/^[ \t\n]+|[ \t\n]+$/g, "");
  const length = Array.from(body).length;
  if (length < 3 || length > 5000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(body)) throw Error("Write a note between 3 and 5,000 characters using plain text.");
  return body;
}

export function parseCustomerNotesContext(value: unknown, kind: OrderKind, orderId: string): CustomerNotesContext {
  const row = record(value, ["kind", "orderId", "orderNumber", "recipientEmail", "sourceVersion", "canSend", "unavailableReason", "notes", "hasMore"]);
  if (!validOrderRef(kind, orderId) || row.kind !== kind || row.orderId !== orderId || typeof row.orderNumber !== "string" || !/^[1-9][0-9]{0,30}$/.test(row.orderNumber)
    || !(row.recipientEmail === null || email(row.recipientEmail)) || !version(row.sourceVersion) || typeof row.canSend !== "boolean"
    || !(row.unavailableReason === null || typeof row.unavailableReason === "string" && reasons.has(row.unavailableReason))
    || row.canSend !== (row.unavailableReason === null) || row.canSend && !email(row.recipientEmail)
    || !Array.isArray(row.notes) || row.notes.length > 20 || typeof row.hasMore !== "boolean") throw Error("Invalid customer note context.");
  const ids = new Set<string>();
  const notes = row.notes.map(value => {
    const n = record(value, ["id", "body", "recipientEmail", "status", "createdAt", "sentAt"]);
    if (typeof n.id !== "string" || !validOrderRef("native", n.id) || ids.has(n.id) || normalizeCustomerNote(n.body) !== n.body
      || !email(n.recipientEmail) || typeof n.status !== "string" || !statuses.has(n.status) || !date(n.createdAt)
      || !(n.sentAt === null || date(n.sentAt)) || n.status === "sent" && n.sentAt === null) throw Error("Invalid customer note history.");
    ids.add(n.id);
    return n as CustomerOrderNote;
  });
  return { ...row, notes } as CustomerNotesContext;
}

export function parseCustomerNoteRequest(value: unknown): CustomerNoteRequest {
  const r = record(value, ["kind", "orderId", "operationId", "sourceVersion", "body"]);
  if (!validOrderRef(r.kind, r.orderId) || typeof r.orderId !== "string" || typeof r.operationId !== "string" || !validOrderRef("native", r.operationId) || !version(r.sourceVersion)) throw Error("Invalid note request.");
  return { kind: r.kind, orderId: r.orderId, operationId: r.operationId, sourceVersion: r.sourceVersion, body: normalizeCustomerNote(r.body) };
}

export function parseCustomerNoteReceipt(value: unknown, request: CustomerNoteRequest): CustomerNoteReceipt {
  const r = record(value, ["kind", "orderId", "noteId", "status", "createdAt", "replayed"]);
  if (r.kind !== request.kind || r.orderId !== request.orderId || r.noteId !== request.operationId || typeof r.status !== "string" || !statuses.has(r.status) || !date(r.createdAt) || typeof r.replayed !== "boolean") throw Error("Unconfirmed note receipt.");
  return r as CustomerNoteReceipt;
}

export async function loadCustomerOrderNotes(client: SupabaseClient, kind: OrderKind, orderId: string): Promise<{ context: CustomerNotesContext | null; error: string | null }> {
  try {
    if (!validOrderRef(kind, orderId)) throw Error("Invalid order.");
    const result = await client.rpc("vf_admin_customer_order_notes_v1", { p_order_kind: kind, p_order_id: orderId }).abortSignal(AbortSignal.timeout(12000));
    if (result.error) throw Error("Customer notes unavailable.");
    return { context: parseCustomerNotesContext(result.data, kind, orderId), error: null };
  } catch { return { context: null, error: "Customer notes could not be loaded. Refresh to try again." }; }
}

export function customerNoteUnavailable(reason: CustomerNotesContext["unavailableReason"]) {
  if (reason === "recipient_ambiguous") return "This order has conflicting customer email details. Resolve them before emailing a note.";
  if (reason === "recipient_missing_or_invalid") return "This order has no valid customer email address. A note cannot be emailed.";
  return "Customer notes are available for individual customer orders.";
}

export function customerNoteState(status: CustomerNoteStatus) {
  if (status === "sent") return { label: "Sent", className: "is-success" };
  if (status === "pending" || status === "processing") return { label: "Queued", className: "is-warning" };
  return { label: "Needs attention", className: "is-danger" };
}
