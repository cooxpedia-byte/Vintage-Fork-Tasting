"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { authorizedCommerceClient } from "@/lib/supabase/commerce-server";
import { validOrderRef } from "@/lib/admin/order-operations";
import { loadCustomerOrderNotes, normalizeCustomerNote, parseCustomerNoteRequest, parseCustomerNoteReceipt, type CustomerNotesContext, type CustomerNoteReceipt } from "@/lib/admin/customer-order-notes";

export async function refreshCustomerOrderNotes(kind: unknown, orderId: unknown): Promise<{ context: CustomerNotesContext | null; error: string | null }> {
  const staff = await requireStaff(["admin"]);
  const client = await authorizedCommerceClient(staff.user.id);
  if (!client) return { context: null, error: "Reconnect your store administrator account to view customer notes." };
  if (!validOrderRef(kind, orderId) || typeof orderId !== "string") return { context: null, error: "The order reference is invalid." };
  return loadCustomerOrderNotes(client, kind, orderId);
}

export async function previewCustomerOrderNote(kind: unknown, orderId: unknown, body: unknown): Promise<{ ok: true; context: CustomerNotesContext; body: string } | { ok: false; message: string }> {
  // Refresh repeats both administrator checks; preview never invokes the send RPC.
  const result = await refreshCustomerOrderNotes(kind, orderId);
  if (!result.context || result.error) return { ok: false, message: result.error || "Customer notes are unavailable." };
  if (!result.context.canSend) return { ok: false, message: "This order has no available customer email recipient. Refresh and review its details." };
  try { return { ok: true, context: result.context, body: normalizeCustomerNote(body) }; }
  catch { return { ok: false, message: "Write a note between 3 and 5,000 characters using plain text." }; }
}

export type CustomerNoteSendResult = { ok: true; receipt: CustomerNoteReceipt } | { ok: false; code: "invalid" | "stale" | "denied" | "unconfirmed"; message: string };
export async function sendCustomerOrderNote(value: unknown): Promise<CustomerNoteSendResult> {
  const staff = await requireStaff(["admin"]);
  const client = await authorizedCommerceClient(staff.user.id);
  if (!client) return { ok: false, code: "denied", message: "Reconnect your store administrator account before sending a customer note." };
  let request;
  try { request = parseCustomerNoteRequest(value); }
  catch { return { ok: false, code: "invalid", message: "Review the order and preview a valid customer note before sending." }; }
  try {
    const result = await client.rpc("vf_admin_send_customer_order_note_v1", {
      p_order_kind: request.kind, p_order_id: request.orderId, p_operation_id: request.operationId,
      p_expected_source_version: request.sourceVersion, p_body: request.body,
    }).abortSignal(AbortSignal.timeout(15000));
    if (result.error) {
      if (result.error.code === "40001") return { ok: false, code: "stale", message: "This order changed. Preview the note again before sending." };
      if (result.error.code === "42501") return { ok: false, code: "denied", message: "Your account cannot send a note for this order." };
      if (["22023", "23505", "55000", "P0002"].includes(result.error.code)) return { ok: false, code: "invalid", message: "This note could not be queued. Refresh and review the order before trying again." };
      throw Error("Unconfirmed result.");
    }
    const receipt = parseCustomerNoteReceipt(result.data, request);
    revalidatePath("/admin/orders");
    if (request.kind === "native") revalidatePath("/admin/orders/native/" + request.orderId);
    return { ok: true, receipt };
  } catch { return { ok: false, code: "unconfirmed", message: "The result is not confirmed. Check the note status before writing another note. Your draft and request are preserved." }; }
}
