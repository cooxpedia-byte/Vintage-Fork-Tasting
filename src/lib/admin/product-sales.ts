import type { SupabaseClient } from "@supabase/supabase-js";
import type { SalesPeriodRange } from "./sales-periods";

export type ProductSalesVariation = { key: string; label: string; sku: string | null; units: number };
export type ProductSalesProduct = { id: string; name: string; units: number; variations: ProductSalesVariation[] };
export type ProductSalesReport = {
  connected: boolean;
  products: ProductSalesProduct[];
  message: string | null;
  more: boolean;
};

type ProductRow = { id: string; name: string };
type VariantRow = { id: string; product_id: string; label: string; sku: string };
type OrderRow = {
  id: string; status: string; placed_at: string | null; created_at: string;
  total_cents: number; refunded_cents: number;
};
type ItemRow = {
  id: string; product_id: string | null; variant_id: string | null;
  sku_snapshot: string | null; variant_snapshot: string | null;
  quantity: number; fulfillment_status: string; commerce_orders: OrderRow | OrderRow[] | null;
};

const PRODUCT_LIMIT = 50;
const PAGE_SIZE = 500;
const SETTLED_STATUSES = ["paid", "processing", "fulfilled", "partially_refunded"];
const EXCLUDED_ITEM_STATUSES = new Set(["cancelled", "returned"]);

function unavailable(): ProductSalesReport {
  return { connected: false, products: [], more: false,
    message: "Product sales could not be loaded. Please refresh and try again." };
}

function addUnits(current: number, quantity: number): number {
  if (!Number.isSafeInteger(quantity) || quantity < 1) throw Error("Invalid item quantity.");
  const next = current + quantity;
  if (!Number.isSafeInteger(next)) throw Error("Product unit count is too large.");
  return next;
}

function totalUnits(current: number, quantity: number): number {
  if (!Number.isSafeInteger(quantity) || quantity < 0) throw Error("Invalid variation count.");
  const next = current + quantity;
  if (!Number.isSafeInteger(next)) throw Error("Product unit count is too large.");
  return next;
}

function normalizedSearch(query: string): string {
  const normalized = query.trim().replace(/\s+/g, " ");
  if (normalized.length > 100) throw Error("Product search is too long.");
  return normalized;
}

/** Keep %, _, and backslash in a search term literal rather than SQL wildcards. */
function likeLiteral(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

function orderForItem(row: ItemRow, window: SalesPeriodRange): OrderRow {
  const order = Array.isArray(row.commerce_orders) ? row.commerce_orders[0] : row.commerce_orders;
  if (!order || !order.id || !SETTLED_STATUSES.includes(order.status)
    || !Number.isSafeInteger(order.total_cents) || order.total_cents < 0
    || !Number.isSafeInteger(order.refunded_cents) || order.refunded_cents < 0
    || order.refunded_cents > order.total_cents) throw Error("Invalid settled order.");
  const purchasedAt = Date.parse(order.placed_at ?? order.created_at);
  if (!Number.isFinite(purchasedAt) || purchasedAt < Date.parse(window.start)
    || purchasedAt >= Date.parse(window.end)) throw Error("Order outside selected period.");
  return order;
}

function variationKey(item: ItemRow, variantsById: Map<string, VariantRow>, variantsBySku: Map<string, VariantRow>): string {
  if (item.variant_id) return item.variant_id;
  const sku = item.sku_snapshot?.trim();
  if (sku) return variantsBySku.get(`${item.product_id}:${sku}`)?.id ?? `sku:${sku}`;
  const label = item.variant_snapshot?.trim();
  return label ? `label:${label}` : "unspecified";
}

/** A name search can find any current catalog product, including draft and archived entries. */
export async function loadProductSales(client: SupabaseClient, options: {
  query: string; range: SalesPeriodRange;
}): Promise<ProductSalesReport> {
  try {
    const query = normalizedSearch(options.query);
    if (!query) return { connected: true, products: [], more: false, message: null };
    const start = Date.parse(options.range.start), end = Date.parse(options.range.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) throw Error("Invalid product sales period.");

    const catalog = await client.from("commerce_products").select("id,name")
      .ilike("name", `%${likeLiteral(query)}%`)
      .order("name", { ascending: true }).order("id", { ascending: true })
      .limit(PRODUCT_LIMIT + 1).abortSignal(AbortSignal.timeout(15000));
    if (catalog.error || !Array.isArray(catalog.data)) throw Error("Product catalog is unavailable.");
    const more = catalog.data.length > PRODUCT_LIMIT;
    const products = (catalog.data as ProductRow[]).slice(0, PRODUCT_LIMIT);
    if (products.some(product => !product.id || typeof product.name !== "string")) throw Error("Invalid product catalog.");
    if (products.length === 0) return { connected: true, products: [], more: false, message: null };

    const productIds = products.map(product => product.id);
    const productIdSet = new Set(productIds);
    const variantsById = new Map<string, VariantRow>();
    const variantsBySku = new Map<string, VariantRow>();
    let variantCursor: string | null = null;
    for (;;) {
      let request = client.from("commerce_product_variants").select("id,product_id,label,sku")
        .in("product_id", productIds).order("id", { ascending: true }).limit(PAGE_SIZE);
      if (variantCursor) request = request.gt("id", variantCursor);
      const response = await request.abortSignal(AbortSignal.timeout(15000));
      if (response.error || !Array.isArray(response.data)) throw Error("Product variations are unavailable.");
      const rows = response.data as VariantRow[];
      for (const variant of rows) {
        if (!variant.id || !productIdSet.has(variant.product_id)
          || typeof variant.label !== "string" || typeof variant.sku !== "string") throw Error("Invalid product variation.");
        variantsById.set(variant.id, variant);
        variantsBySku.set(`${variant.product_id}:${variant.sku}`, variant);
      }
      if (rows.length < PAGE_SIZE) break;
      const next = rows.at(-1)?.id;
      if (!next || next === variantCursor) throw Error("Variation cursor did not advance.");
      variantCursor = next;
    }

    const buckets = new Map<string, Map<string, ProductSalesVariation>>();
    for (const product of products) buckets.set(product.id, new Map());
    for (const variant of variantsById.values()) buckets.get(variant.product_id)!.set(variant.id,
      { key: variant.id, label: variant.label, sku: variant.sku, units: 0 });

    // Each pass is disjoint: placed_at is authoritative, created_at is only a fallback.
    for (const clock of ["placed_at", "created_at"] as const) {
      let cursor: string | null = null;
      for (;;) {
        let request = client.from("commerce_order_items")
          .select("id,product_id,variant_id,sku_snapshot,variant_snapshot,quantity,fulfillment_status,commerce_orders!inner(id,status,placed_at,created_at,total_cents,refunded_cents)")
          .in("product_id", productIds)
          .in("commerce_orders.status", SETTLED_STATUSES)
          .gte(`commerce_orders.${clock}`, options.range.start)
          .lt(`commerce_orders.${clock}`, options.range.end)
          .order("id", { ascending: true }).limit(PAGE_SIZE);
        if (clock === "created_at") request = request.is("commerce_orders.placed_at", null);
        if (cursor) request = request.gt("id", cursor);
        const response = await request.abortSignal(AbortSignal.timeout(15000));
        if (response.error || !Array.isArray(response.data)) throw Error("Order items are unavailable.");
        const rows = response.data as ItemRow[];
        for (const item of rows) {
          if (!item.id || !item.product_id || !productIdSet.has(item.product_id)) throw Error("Invalid order item.");
          const order = orderForItem(item, options.range);
          if (EXCLUDED_ITEM_STATUSES.has(item.fulfillment_status)
            || (order.total_cents > 0 && order.refunded_cents === order.total_cents)) continue;
          const key = variationKey(item, variantsById, variantsBySku);
          const bucket = buckets.get(item.product_id)!;
          const known = variantsById.get(key);
          const existing = bucket.get(key) ?? {
            key,
            label: known?.label ?? item.variant_snapshot?.trim() ?? "Unspecified variation",
            sku: known?.sku ?? item.sku_snapshot?.trim() ?? null,
            units: 0,
          };
          existing.units = addUnits(existing.units, item.quantity);
          bucket.set(key, existing);
        }
        if (rows.length < PAGE_SIZE) break;
        const next = rows.at(-1)?.id;
        if (!next || next === cursor) throw Error("Order item cursor did not advance.");
        cursor = next;
      }
    }

    const result = products.map(product => {
      const bucket = buckets.get(product.id)!;
      const variations = [...bucket.values()].sort((a, b) => a.label.localeCompare(b.label) || (a.sku ?? "").localeCompare(b.sku ?? ""));
      if (!variations.length) variations.push({ key: "unvaried", label: "Standard", sku: null, units: 0 });
      const units = variations.reduce((total, variation) => totalUnits(total, variation.units), 0);
      return { id: product.id, name: product.name, units, variations };
    });
    return { connected: true, products: result, more, message: null };
  } catch {
    return unavailable();
  }
}
