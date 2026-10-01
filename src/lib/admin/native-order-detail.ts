import type { SupabaseClient } from "@supabase/supabase-js";
import { nativeOrderContact, type OrderContact } from "./order-contact";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const NATIVE_ORDER_DETAIL_COLUMNS = "id,order_number::text,customer_email,status,payment_status,payment_provider,currency,subtotal_cents,discount_cents,shipping_cents,tax_cents,total_cents,refunded_cents,placed_at,created_at,source,stripe_subscription_id,stripe_invoice_id,billing_address,shipping_address,shipping_method_snapshot";
export const NATIVE_ORDER_ITEM_COLUMNS = "id,name_snapshot,sku_snapshot,variant_snapshot,quantity,unit_amount_cents,subtotal_cents,discount_cents,tax_cents,total_cents,fulfillment_status,created_at";

type OrderRow = {
  id: unknown; order_number: unknown; customer_email: unknown; status: unknown;
  payment_status: unknown; payment_provider: unknown; currency: unknown;
  subtotal_cents: unknown; discount_cents: unknown; shipping_cents: unknown;
  tax_cents: unknown; total_cents: unknown; refunded_cents: unknown;
  placed_at: unknown; created_at: unknown; source: unknown;
  stripe_subscription_id: unknown; stripe_invoice_id: unknown;
  billing_address: unknown; shipping_address: unknown; shipping_method_snapshot: unknown;
};
type ItemRow = {
  id: unknown; name_snapshot: unknown; sku_snapshot: unknown; variant_snapshot: unknown;
  quantity: unknown; unit_amount_cents: unknown; subtotal_cents: unknown;
  discount_cents: unknown; tax_cents: unknown; total_cents: unknown;
  fulfillment_status: unknown; created_at: unknown;
};

export type NativeOrderItem = {
  id: string; name: string; sku: string | null; variant: string | null;
  quantity: number; unitAmountCents: number; subtotalCents: number;
  discountCents: number; taxCents: number; totalCents: number;
  fulfillmentStatus: string;
};
export type NativeOrderDetail = {
  id: string; orderNumber: string; customerEmail: string | null;
  status: string; paymentStatus: string | null; paymentProvider: string;
  currency: string; subtotalCents: number; discountCents: number;
  shippingCents: number; taxCents: number; totalCents: number; refundedCents: number;
  placedAt: string; createdAt: string; source: string; contact: OrderContact;
  stripeSubscriptionId: string | null; stripeInvoiceId: string | null;
  shippingMethod: string | null; items: NativeOrderItem[];
};
export type NativeOrderDetailResult =
  | { state: "ready"; order: NativeOrderDetail }
  | { state: "not_found" }
  | { state: "error"; message: string };

const ERROR_MESSAGE = "This order could not be loaded. Please refresh or contact your administrator.";

function requiredText(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) throw new Error("malformed");
  return value;
}
function optionalText(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string") throw new Error("malformed");
  return value;
}
function cents(value: unknown): number {
  const parsed = typeof value === "number" ? value :
    typeof value === "string" && /^[0-9]+$/.test(value) ? Number(value) : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error("malformed");
  return parsed;
}
function quantity(value: unknown): number {
  const parsed = cents(value);
  if (parsed < 1 || parsed > 1000) throw new Error("malformed");
  return parsed;
}
function orderNumber(value: unknown): string {
  if (typeof value !== "string" || !/^[1-9][0-9]{0,18}$/.test(value)
    || BigInt(value)>9223372036854775807n) throw new Error("malformed");
  return value;
}
function timestamp(value: unknown): string {
  const text = requiredText(value);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(text) || !Number.isFinite(Date.parse(text))) throw new Error("malformed");
  return text;
}
function currency(value: unknown): string {
  const text = requiredText(value);
  if (!/^[a-z]{3}$/.test(text)) throw new Error("malformed");
  return text;
}

function mapItem(row: ItemRow): NativeOrderItem {
  return {
    id: requiredText(row.id), name: requiredText(row.name_snapshot),
    sku: optionalText(row.sku_snapshot), variant: optionalText(row.variant_snapshot),
    quantity: quantity(row.quantity), unitAmountCents: cents(row.unit_amount_cents),
    subtotalCents: cents(row.subtotal_cents), discountCents: cents(row.discount_cents),
    taxCents: cents(row.tax_cents), totalCents: cents(row.total_cents),
    fulfillmentStatus: requiredText(row.fulfillment_status),
  };
}

function mapOrder(row: OrderRow, items: NativeOrderItem[]): NativeOrderDetail {
  const createdAt = timestamp(row.created_at), placedAt = row.placed_at===null?createdAt:timestamp(row.placed_at);
  return {
    id: requiredText(row.id), orderNumber: orderNumber(row.order_number),
    customerEmail: optionalText(row.customer_email), status: requiredText(row.status),
    paymentStatus: optionalText(row.payment_status), paymentProvider: requiredText(row.payment_provider),
    currency: currency(row.currency), subtotalCents: cents(row.subtotal_cents),
    discountCents: cents(row.discount_cents), shippingCents: cents(row.shipping_cents),
    taxCents: cents(row.tax_cents), totalCents: cents(row.total_cents),
    refundedCents: cents(row.refunded_cents), placedAt,
    createdAt, source: requiredText(row.source),
    stripeSubscriptionId: optionalText(row.stripe_subscription_id),
    stripeInvoiceId: optionalText(row.stripe_invoice_id),
    contact: nativeOrderContact(row.billing_address,row.shipping_address,row.shipping_method_snapshot),
    shippingMethod: optionalText(row.shipping_method_snapshot), items,
  };
}

/** Read saved native order facts only. This does not quote, book, or buy shipping. */
export async function loadNativeOrderDetail(
  client: SupabaseClient,rawId: unknown
): Promise<NativeOrderDetailResult> {
  if (typeof rawId !== "string" || !UUID.test(rawId)) throw new Error("Invalid order reference.");
  const id = rawId.toLowerCase();
  try {
    const orderResult = await client.from("commerce_orders").select(NATIVE_ORDER_DETAIL_COLUMNS)
      .eq("id",id).maybeSingle();
    if (orderResult.error) return { state:"error",message:ERROR_MESSAGE };
    if (!orderResult.data) return { state:"not_found" };
    const source = (orderResult.data as OrderRow).source;
    if (source!=="web" && source!=="subscription_renewal") return { state:"not_found" };
    if ((orderResult.data as OrderRow).id!==id) return { state:"error",message:ERROR_MESSAGE };
    if (source==="subscription_renewal" &&
      (typeof (orderResult.data as OrderRow).stripe_subscription_id!=="string" ||
       typeof (orderResult.data as OrderRow).stripe_invoice_id!=="string"))
      return { state:"error",message:ERROR_MESSAGE };
    const itemResult = await client.from("commerce_order_items").select(NATIVE_ORDER_ITEM_COLUMNS,{count:"exact"})
      .eq("order_id",id).order("created_at",{ascending:true}).order("id",{ascending:true});
    if (itemResult.error || !Array.isArray(itemResult.data) || itemResult.count!==itemResult.data.length)
      return { state:"error",message:ERROR_MESSAGE };
    try {
      const items=(itemResult.data as ItemRow[]).map(mapItem);
      if (new Set(items.map(item=>item.id)).size!==items.length || items.some(item=>!UUID.test(item.id)))
        throw new Error("malformed");
      return { state:"ready",order:mapOrder(orderResult.data as OrderRow,items) };
    } catch {
      return { state:"error",message:ERROR_MESSAGE };
    }
  } catch {
    return { state:"error",message:"The order connection is temporarily unavailable. Please refresh." };
  }
}
