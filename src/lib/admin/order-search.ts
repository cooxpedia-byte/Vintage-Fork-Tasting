import type { SupabaseClient } from "@supabase/supabase-js";

export const ORDER_SEARCH_PAGE_SIZE = 50;
export type OrderSearchSource = "all" | "native" | "imported";
export type OrderSearchCriteria = {
  name?: string; postal?: string; city?: string; source?: OrderSearchSource; offset?: number;
};
export type OrderSearchRow = {
  source: "native" | "imported";
  orderId: string;
  orderNumber: string;
  status: string | null;
  placedAt: string | null;
  customerName: string | null;
  deliveryCity: string | null;
  postalCode: string | null;
  totalCents: number | null;
  recordedTotal: string | null;
  currency: string | null;
};
export type OrderSearchResult = {
  connected: boolean;
  rows: OrderSearchRow[];
  total: number;
  nextOffset: number | null;
  archiveSnapshotAt: string | null;
  message: string | null;
};

const control = /[\u0000-\u001f\u007f]/;
const nativeId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const orderNumber = /^[1-9][0-9]{0,19}$/;
const archiveAmount = /^(?:0|[1-9][0-9]{0,14})(?:\.[0-9]{1,8})?$/;

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("Invalid order search response.");
  return value as Record<string, unknown>;
}

function text(value: unknown, maximum: number): string {
  if (typeof value !== "string" || value.length > maximum || control.test(value)) throw Error("Invalid order search text.");
  return value;
}

function nullableText(value: unknown, maximum: number): string | null {
  return value === null ? null : text(value, maximum);
}

function date(value: unknown): string | null {
  if (value === null) return null;
  const result = text(value, 64);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(result)
    || !Number.isFinite(Date.parse(result))) throw Error("Invalid order search date.");
  return result;
}

function nonnegativeInteger(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw Error("Invalid order search count.");
  return value;
}

function queryText(value: string | undefined, maximum: number): string {
  if (value === undefined) return "";
  if (typeof value !== "string" || control.test(value)) throw Error("Invalid search query.");
  const result = value.trim().replace(/\s+/gu, " ");
  if (result.length > maximum) throw Error("Search query is too long.");
  return result;
}

export function parseOrderSearchCriteria(input: OrderSearchCriteria) {
  const name = queryText(input.name, 100);
  const postal = queryText(input.postal, 24);
  const city = queryText(input.city, 100);
  if (!name && !postal && !city) throw Error("Enter a name, delivery postal code, or delivery city.");
  if (postal && (!/^[A-Za-z0-9 -]+$/.test(postal) || !/[A-Za-z0-9]/.test(postal))) {
    throw Error("Invalid delivery postal code.");
  }
  const source = input.source ?? "all";
  if (!["all", "native", "imported"].includes(source)) throw Error("Invalid order source.");
  const offset = input.offset ?? 0;
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 10000 || offset % ORDER_SEARCH_PAGE_SIZE !== 0) {
    throw Error("Invalid result page.");
  }
  return { name, postal, city, source, offset };
}

export function parseOrderSearchResponse(value: unknown, source: OrderSearchSource, offset: number): OrderSearchResult {
  const data = object(value);
  if (data.kind !== "order-search" || !Array.isArray(data.rows) || data.rows.length > ORDER_SEARCH_PAGE_SIZE) {
    throw Error("Invalid order search response.");
  }
  const total = nonnegativeInteger(data.total);
  const nextOffset = data.nextOffset === null ? null : nonnegativeInteger(data.nextOffset);
  if (data.rows.length > 0 && total < offset + data.rows.length || nextOffset !== null
    && (!data.rows.length || nextOffset !== offset + ORDER_SEARCH_PAGE_SIZE || nextOffset >= total || nextOffset > 10000)) {
    throw Error("Invalid order search pagination.");
  }
  const archiveSnapshotAt = date(data.archiveSnapshotAt);
  const seen = new Set<string>();
  const rows: OrderSearchRow[] = data.rows.map(value => {
    const row = object(value);
    if (row.source !== "native" && row.source !== "imported" || source !== "all" && row.source !== source) {
      throw Error("Wrong order search source.");
    }
    const kind = row.source;
    const orderId = text(row.orderId, 64);
    const number = text(row.orderNumber, 20);
    if (kind === "native" ? !nativeId.test(orderId) || !orderNumber.test(number)
      : !orderNumber.test(orderId) || orderId !== number) throw Error("Invalid order reference.");
    const key = `${kind}:${orderId}`;
    if (seen.has(key)) throw Error("Duplicate order search result.");
    seen.add(key);
    const currency = nullableText(row.currency, 3);
    if (currency !== null && !/^[A-Za-z]{3}$/.test(currency)) throw Error("Invalid order currency.");
    const totalCents = row.totalCents === null ? null : nonnegativeInteger(row.totalCents);
    const recordedTotal = nullableText(row.recordedTotal, 64);
    if (recordedTotal !== null && !archiveAmount.test(recordedTotal)) throw Error("Invalid recorded order total.");
    if (kind === "native" && recordedTotal !== null || kind === "imported" && totalCents !== null) {
      throw Error("Mixed order amounts.");
    }
    return {
      source: kind, orderId, orderNumber: number,
      status: nullableText(row.status, 100), placedAt: date(row.placedAt),
      customerName: nullableText(row.customerName, 320),
      deliveryCity: nullableText(row.deliveryCity, 200),
      postalCode: nullableText(row.postalCode, 32),
      totalCents, recordedTotal, currency,
    };
  });
  if (rows.some(row => row.source === "imported") && archiveSnapshotAt === null) {
    throw Error("Historical search snapshot is unavailable.");
  }
  return { connected: true, rows, total, nextOffset, archiveSnapshotAt, message: null };
}

/** Search order snapshots with the store owner's delegated commerce session. */
export async function loadOrderSearch(client: SupabaseClient, input: OrderSearchCriteria): Promise<OrderSearchResult> {
  const unavailable = (message: string): OrderSearchResult => ({
    connected: false, rows: [], total: 0, nextOffset: null, archiveSnapshotAt: null, message,
  });
  let criteria: ReturnType<typeof parseOrderSearchCriteria>;
  try { criteria = parseOrderSearchCriteria(input); }
  catch (error) { return unavailable(error instanceof Error ? error.message : "Invalid search query."); }
  try {
    const response = await client.rpc("vf_admin_order_search_v1", {
      p_name: criteria.name || null,
      p_postal: criteria.postal || null,
      p_city: criteria.city || null,
      p_source: criteria.source,
      p_offset: criteria.offset,
      p_limit: ORDER_SEARCH_PAGE_SIZE,
    }).abortSignal(AbortSignal.timeout(15000));
    if (response.error) return unavailable(response.error.code === "42501"
      ? "This store account does not have access to order search."
      : "Order search could not be loaded. Please try again.");
    return parseOrderSearchResponse(response.data, criteria.source, criteria.offset);
  } catch { return unavailable("Order search could not be loaded. Please try again."); }
}
