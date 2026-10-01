"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { authorizedCommerceClient } from "@/lib/supabase/commerce-server";
import { validOrderRef } from "@/lib/admin/order-operations";
import { loadPrivateOrderNotes, parsePrivateNoteRequest, parsePrivateNoteReceipt, type PrivateNotesContext, type PrivateNoteReceipt } from "@/lib/admin/private-order-notes";

export async function refreshPrivateOrderNotes(kind: unknown, orderId: unknown): Promise<{ context: PrivateNotesContext | null; error: string | null }> {
  const staff = await requireStaff(["admin"]);
  const client = await authorizedCommerceClient(staff.user.id);
  if (!client) return { context: null, error: "Reconnect your store administrator account to view private staff notes." };
  if (!validOrderRef(kind, orderId) || typeof orderId !== "string") return { context: null, error: "The order reference is invalid." };
  return loadPrivateOrderNotes(client, kind, orderId);
}

export type PrivateNoteSaveResult = { ok: true; receipt: PrivateNoteReceipt } | { ok: false; code: "invalid" | "denied" | "unconfirmed"; message: string };
export async function addPrivateOrderNote(value: unknown): Promise<PrivateNoteSaveResult> {
  const staff = await requireStaff(["admin"]);
  const client = await authorizedCommerceClient(staff.user.id);
  if (!client) return { ok: false, code: "denied", message: "Reconnect your store administrator account before saving a private note." };
  let request;
  try { request = parsePrivateNoteRequest(value); }
  catch { return { ok: false, code: "invalid", message: "Write a private note between 3 and 5,000 characters using plain text." }; }
  try {
    const result = await client.rpc("vf_admin_add_private_order_note_v1", {
      p_order_kind: request.kind, p_order_id: request.orderId, p_operation_id: request.operationId, p_body: request.body,
    }).abortSignal(AbortSignal.timeout(15000));
    if (result.error) {
      if (result.error.code === "42501") return { ok: false, code: "denied", message: "Your account cannot save a private note for this order." };
      if (["22023", "23505", "P0002"].includes(result.error.code)) return { ok: false, code: "invalid", message: "The private note could not be saved. Refresh and review this order before trying again." };
      throw Error("Unconfirmed save.");
    }
    const receipt = parsePrivateNoteReceipt(result.data, request);
    revalidatePath("/admin/orders");
    if (request.kind === "native") revalidatePath("/admin/orders/native/" + request.orderId);
    return { ok: true, receipt };
  } catch { return { ok: false, code: "unconfirmed", message: "The save is not confirmed. Refresh private notes before writing another note. Your draft and request are preserved." }; }
}
