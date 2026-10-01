import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrderKind } from "./order-operations";

export type OrderEmailRef = { kind: OrderKind; orderId: string };
export type OrderEmailDeliveryStatus =
  | "pending"
  | "processing"
  | "sent"
  | "failed"
  | "uncertain"
  | "blocked";

export type OrderEmailNotification = {
  kind: OrderKind;
  orderId: string;
  orderNumber: string | null;
  eventType: string;
  recipientKind: "customer" | "merchant";
  status: OrderEmailDeliveryStatus;
  createdAt: string;
  sentAt: string | null;
  errorCode: string | null;
  uncertaintyCode: string | null;
  blockCode: string | null;
};

const deliveryStatuses = new Set<OrderEmailDeliveryStatus>([
  "pending", "processing", "sent", "failed", "uncertain", "blocked",
]);
const responseFields = new Set([
  "kind", "orderId", "orderNumber", "eventType", "recipientKind", "status", "createdAt", "sentAt",
  "errorCode", "uncertaintyCode", "blockCode",
]);
const nativeId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function validEmailRef(kind: unknown, orderId: unknown): kind is OrderKind {
  return typeof orderId === "string" && (kind === "native" ? nativeId.test(orderId) : kind === "imported" && /^[1-9][0-9]{0,19}$/.test(orderId));
}

function nullableText(value: unknown, maxLength = 100): value is string | null {
  return value === null || (typeof value === "string" && value.length <= maxLength);
}

function timestamp(value: unknown): value is string {
  return typeof value === "string" && value.length <= 50 && !Number.isNaN(Date.parse(value));
}

export function parseOrderEmailStatuses(value: unknown, refs: OrderEmailRef[]): OrderEmailNotification[] {
  const fail = (): never => { throw new Error("Email status is unavailable."); };
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== 1
    || !Array.isArray((value as { notifications?: unknown }).notifications)) return fail();
  if (!refs.length || refs.length > 100 || refs.some((ref) => !validEmailRef(ref.kind, ref.orderId))) return fail();
  const expected = new Set(refs.map((ref) => `${ref.kind}:${ref.orderId}`));
  if (expected.size !== refs.length) return fail();
  const rows = (value as { notifications: unknown[] }).notifications;
  if (rows.length > 600) return fail();
  const seen = new Set<string>();
  const parsed: OrderEmailNotification[] = [];
  for (const raw of rows) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)
      || Object.keys(raw).length !== responseFields.size || Object.keys(raw).some((key) => !responseFields.has(key))) return fail();
    const row = raw as Record<string, unknown>;
    const refKey = `${row.kind}:${row.orderId}`;
    const eventKey = `${refKey}:${row.eventType}:${row.recipientKind}`;
    if (!expected.has(refKey) || seen.has(eventKey) || !validEmailRef(row.kind, row.orderId)
      || !nullableText(row.orderNumber) || typeof row.eventType !== "string" || !row.eventType || row.eventType.length > 100
      || (row.recipientKind !== "customer" && row.recipientKind !== "merchant")
      || typeof row.status !== "string" || !deliveryStatuses.has(row.status as OrderEmailDeliveryStatus)
      || !timestamp(row.createdAt) || !(row.sentAt === null || timestamp(row.sentAt)) || (row.status === "sent" && row.sentAt === null)
      || !nullableText(row.errorCode) || !nullableText(row.uncertaintyCode) || !nullableText(row.blockCode)) return fail();
    seen.add(eventKey);
    parsed.push({
      kind: row.kind,
      orderId: row.orderId,
      orderNumber: row.orderNumber,
      eventType: row.eventType,
      recipientKind: row.recipientKind,
      status: row.status,
      createdAt: row.createdAt,
      sentAt: row.sentAt,
      errorCode: row.errorCode,
      uncertaintyCode: row.uncertaintyCode,
      blockCode: row.blockCode,
    } as OrderEmailNotification);
  }
  return parsed;
}

export async function loadOrderEmailStatuses(client: SupabaseClient, refs: OrderEmailRef[]) {
  if (!refs.length) return { notifications: [] as OrderEmailNotification[], error: null };
  try {
    if (refs.length > 100 || refs.some((ref) => !validEmailRef(ref.kind, ref.orderId))
      || new Set(refs.map((ref) => `${ref.kind}:${ref.orderId}`)).size !== refs.length) throw new Error("Invalid order reference.");
    const result = await client.rpc("vf_admin_order_email_status_v1", { p_refs: refs }).abortSignal(AbortSignal.timeout(12000));
    if (result.error) throw new Error("Email status unavailable.");
    return { notifications: parseOrderEmailStatuses(result.data, refs), error: null };
  } catch {
    return { notifications: [] as OrderEmailNotification[], error: "Customer email status could not be loaded. Refresh to try again." };
  }
}
