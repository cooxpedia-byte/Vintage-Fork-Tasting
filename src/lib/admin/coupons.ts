import type { SupabaseClient } from "@supabase/supabase-js";

export const couponStatuses = ["draft", "scheduled", "active", "paused", "archived"] as const;
export type CouponStatus = (typeof couponStatuses)[number];
export type CouponVisibility = "private" | "public";
export type CouponAudience = "all" | "new_customer" | "no_existing_account" | "selected";
export type CouponDefinition = {
  code: string;
  name: string;
  status: CouponStatus;
  visibility: CouponVisibility;
  discount: { type: "fixed"; fixedCents: number; maxCents: null; currency: "cad" } |
    { type: "percent"; basisPoints: number; maxCents: number | null; currency: "cad" };
  scope: {
    includeProductIds: string[]; excludeProductIds: string[];
    includeCategoryKeys: string[]; excludeCategoryKeys: string[];
    excludeSale: boolean; excludeAdvent: boolean;
  };
  minimum: { eligibleQuantity: number; eligibleSpendCents: number };
  audience: { type: CouponAudience; selectedCustomerKeys: string[] };
  usage: { globalLimit: number | null; perCustomerLimit: number | null };
  startsAt: string | null; endsAt: string | null; allowGoldLeaves: boolean;
};
export type CouponSummary = {
  couponId: string; code: string; name: string; status: CouponStatus; visibility: CouponVisibility; version: number;
  updatedAt: string; redemptions: number; needsReview: number;
};
export type CouponDetail = CouponSummary & { revisionId: string; definition: CouponDefinition; createdAt: string };
export type CouponRedemption = {
  reservationId: string; orderId: string; orderNumber: string; normalizedEmail: string;
  customerKey: string; discountCents: number; redeemedAt: string; totalCents: number;
};
export type CouponReportRow = {
  code: string; name: string; redemptions: number; discountCents: number;
  grossPaidCents: number; refundedCents: number; netRevenueCents: number;
};
export type CouponCatalog = {
  products: { id: string; name: string }[];
  categories: { key: string; name: string }[];
  customers: { key: string; label: string }[];
};
export type CouponAggregate = { availableNow: number; needsReview: number; redemptions: number; discountCents: number; grossPaidCents: number; refundedCents: number; netRevenueCents: number };
export type CouponReviewHold = { reservationId: string; attemptId: string; code: string; normalizedEmail: string; discountCents: number; holdExpiresAt: string; reviewReason: string; createdAt: string; paymentProvider: string; attemptStatus: string };
export class CouponValidationError extends Error {}
const invalid = (message: string): never => { throw new CouponValidationError(message); };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const codePattern = /^[A-Z0-9][A-Z0-9_-]{0,63}$/;
const string = (value: unknown) => typeof value === "string" ? value : "";
const integer = (value: unknown) => Number.isSafeInteger(Number(value)) ? Number(value) : NaN;
const cents = (value: FormDataEntryValue | null, label: string, optional = false) => {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw && optional) return null;
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(raw)) invalid(`${label} must be a positive dollar amount with up to two decimal places.`);
  const amount = Math.round(Number(raw) * 100);
  if (!Number.isSafeInteger(amount) || amount < (optional ? 1 : 0)) invalid(`${label} is invalid.`);
  return amount;
};
const count = (value: FormDataEntryValue | null, label: string, options: { optional?: boolean; min?: number } = {}) => {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw && options.optional) return null;
  if (!/^\d{1,9}$/.test(raw)) invalid(`${label} must be a whole number.`);
  const parsed = Number(raw), min = options.min ?? 0;
  if (!Number.isSafeInteger(parsed) || parsed < min) invalid(`${label} must be at least ${min}.`);
  return parsed;
};
const values = (form: FormData, key: string, pattern: RegExp, label: string) => {
  const result = [...new Set(form.getAll(key).filter((entry): entry is string => typeof entry === "string" && entry !== ""))];
  if (result.some((entry) => !pattern.test(entry))) invalid(`Choose valid ${label}.`);
  return result;
};
const date = (value: FormDataEntryValue | null, label: string, timezoneOffset: number) => {
  if (typeof value !== "string" || !value.trim()) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) || !Number.isInteger(timezoneOffset) || Math.abs(timezoneOffset)>840) invalid(`${label} is invalid.`);
  const [year,month,day,hour,minute]=value.split(/[-T:]/).map(Number);
  const wallClock = new Date(Date.UTC(year,month-1,day,hour,minute));
  if (wallClock.getUTCFullYear()!==year || wallClock.getUTCMonth()!==month-1 || wallClock.getUTCDate()!==day
    || wallClock.getUTCHours()!==hour || wallClock.getUTCMinutes()!==minute) invalid(`${label} is invalid.`);
  const parsed = new Date(wallClock.valueOf()+timezoneOffset*60_000);
  if (!Number.isFinite(parsed.valueOf())) invalid(`${label} is invalid.`);
  return parsed.toISOString();
};

export function parseCouponDefinition(form: FormData, immutableCode?: string): CouponDefinition {
  const code = (immutableCode ?? String(form.get("code") ?? "")).trim().toUpperCase();
  const name = String(form.get("name") ?? "").trim();
  const status = String(form.get("status") ?? "draft") as CouponStatus;
  const visibility = String(form.get("visibility") ?? "private") as CouponVisibility;
  const discountType = String(form.get("discountType"));
  const startsAtOffset = integer(form.get("startsAtTimezoneOffset") ?? form.get("timezoneOffset") ?? 0);
  const endsAtOffset = integer(form.get("endsAtTimezoneOffset") ?? form.get("timezoneOffset") ?? 0);
  const startsAt = date(form.get("startsAt"), "Start date", startsAtOffset), endsAt = date(form.get("endsAt"), "End date", endsAtOffset);
  if (!codePattern.test(code)) invalid("Use 1–64 letters, numbers, hyphens, or underscores for the code.");
  if (name.length < 1 || name.length > 160) invalid("Enter a coupon name up to 160 characters.");
  if (!couponStatuses.includes(status)) invalid("Choose a valid coupon status.");
  if (!["private", "public"].includes(visibility)) invalid("Choose whether this coupon is private or public.");
  if (status === "scheduled" && !startsAt) invalid("Scheduled coupons need a start date.");
  if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) invalid("End date must be after the start date.");
  let discount!: CouponDefinition["discount"];
  if (discountType === "fixed") {
    discount = { type: "fixed", fixedCents: cents(form.get("fixedAmount"), "Fixed discount")!, maxCents: null, currency: "cad" };
    if (discount.fixedCents <= 0) invalid("Fixed discount must be greater than zero.");
  } else if (discountType === "percent") {
    const raw = String(form.get("percentage") ?? "").trim();
    if (!/^\d{1,3}(\.\d{1,2})?$/.test(raw)) invalid("Percentage must be from 0.01 to 100.");
    const basisPoints = Math.round(Number(raw) * 100);
    if (basisPoints < 1 || basisPoints > 10_000) invalid("Percentage must be from 0.01 to 100.");
    discount = { type: "percent", basisPoints, maxCents: cents(form.get("maxAmount"), "Maximum discount", true), currency: "cad" };
  } else invalid("Choose fixed amount or percentage.");
  const audience = String(form.get("audience")) as CouponAudience;
  if (!["all", "new_customer", "no_existing_account", "selected"].includes(audience)) invalid("Choose a valid audience.");
  const selectedCustomerKeys = values(form, "selectedCustomerKeys", /^(email:.+|profile:[0-9a-f-]{36}|canonical:[0-9a-f-]{36})$/i, "customers");
  if (audience === "selected" && !selectedCustomerKeys.length) invalid("Choose at least one selected customer.");
  return {
    code, name, status, visibility, discount,
    scope: {
      includeProductIds: values(form, "includeProductIds", uuid, "included products"),
      excludeProductIds: values(form, "excludeProductIds", uuid, "excluded products"),
      includeCategoryKeys: values(form, "includeCategoryKeys", /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/, "included categories"),
      excludeCategoryKeys: values(form, "excludeCategoryKeys", /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/, "excluded categories"),
      excludeSale: form.get("excludeSale") === "on", excludeAdvent: form.get("excludeAdvent") === "on",
    },
    minimum: {
      eligibleQuantity: count(form.get("minimumQuantity"), "Minimum eligible quantity") as number,
      eligibleSpendCents: cents(form.get("minimumSpend"), "Minimum eligible spend") as number,
    },
    audience: { type: audience, selectedCustomerKeys },
    usage: {
      globalLimit: count(form.get("globalLimit"), "Global usage limit", { optional: true, min: 1 }),
      perCustomerLimit: count(form.get("perCustomerLimit"), "Per-customer usage limit", { optional: true, min: 1 }),
    },
    startsAt, endsAt, allowGoldLeaves: form.get("allowGoldLeaves") === "on",
  };
}

export function couponDefinitionFromUnknown(value: unknown): CouponDefinition | null {
  if (!value || typeof value !== "object") return null;
  const definition = value as Partial<CouponDefinition>;
  const visibility = definition.visibility ?? "private";
  return codePattern.test(string(definition.code)) && ["private","public"].includes(visibility) && typeof definition.scope === "object" && typeof definition.discount === "object"
    ? { ...definition, visibility } as CouponDefinition : null;
}
const summary = (row: Record<string, unknown>): CouponSummary | null => {
  const couponId = string(row.couponId || row.coupon_id), status = string(row.status) as CouponStatus, visibility=string(row.visibility||"private") as CouponVisibility;
  if (!uuid.test(couponId) || !codePattern.test(string(row.code)) || !couponStatuses.includes(status) || !["private","public"].includes(visibility)) return null;
  const version = integer(row.version), redemptions = integer(row.redemptions ?? 0), needsReview = integer(row.needsReview ?? row.needs_review ?? 0), updatedAt = string(row.updatedAt || row.updated_at);
  if (version < 1 || redemptions < 0 || needsReview < 0 || !Number.isFinite(new Date(updatedAt).valueOf())) return null;
  return { couponId, code: string(row.code), name: string(row.name), status, visibility, version, redemptions, needsReview, updatedAt };
};

export async function loadCoupons(client: SupabaseClient, options: { status?: string; search?: string; cursor?: unknown; limit?: number } = {}) {
  const result = await client.rpc("commerce_admin_coupon_list_v1", {
    p_status: couponStatuses.includes(options.status as CouponStatus) ? options.status : null,
    p_search: options.search?.trim().slice(0, 100) || null, p_cursor: options.cursor ?? {}, p_limit: options.limit ?? 50,
  }).abortSignal(AbortSignal.timeout(15_000));
  const items = result.data?.items;
  if (result.error || !Array.isArray(items)) throw new Error("coupon_list_unavailable");
  const parsed = items.map((row) => summary(row as Record<string, unknown>));
  if (parsed.some((row) => !row)) throw new Error("coupon_list_invalid");
  return parsed as CouponSummary[];
}
export async function loadCoupon(client: SupabaseClient, couponId: string): Promise<CouponDetail> {
  if (!uuid.test(couponId)) throw new Error("coupon_id_invalid");
  const result = await client.rpc("commerce_admin_coupon_get_v1", { p_coupon_id: couponId }).abortSignal(AbortSignal.timeout(15_000));
  const base = result.data && summary(result.data as Record<string, unknown>), definition = couponDefinitionFromUnknown(result.data?.definition);
  if (result.error || !base || !definition || !uuid.test(string(result.data.revisionId)) || !Number.isFinite(new Date(result.data.createdAt).valueOf())) throw new Error("coupon_detail_unavailable");
  return { ...base, revisionId: result.data.revisionId, createdAt: result.data.createdAt, definition };
}
export async function loadCouponRedemptions(client: SupabaseClient, couponId: string, cursor: unknown = {}, limit = 25) {
  if (!uuid.test(couponId)) throw new Error("coupon_id_invalid");
  const result = await client.rpc("commerce_admin_coupon_redemptions_v1", { p_coupon_id: couponId, p_cursor: cursor, p_limit: limit }).abortSignal(AbortSignal.timeout(15_000));
  if (result.error || !Array.isArray(result.data?.items)) throw new Error("coupon_redemptions_unavailable");
  return result.data.items.map((row: Record<string, unknown>) => ({
    reservationId: string(row.reservation_id), orderId: string(row.order_id), orderNumber: string(row.order_number),
    normalizedEmail: string(row.normalized_email), customerKey: string(row.customer_key),
    discountCents: integer(row.discount_cents), redeemedAt: string(row.redeemed_at), totalCents: integer(row.total_cents),
  })) as CouponRedemption[];
}
export async function loadCouponReport(client: SupabaseClient, from: string, to: string, cursor: unknown = {}, limit = 50) {
  const result = await client.rpc("commerce_admin_coupon_report_v1", { p_from: from, p_to: to, p_cursor: cursor, p_limit: limit }).abortSignal(AbortSignal.timeout(15_000));
  if (result.error || !Array.isArray(result.data?.items)) throw new Error("coupon_report_unavailable");
  return result.data.items.map((row: Record<string, unknown>) => ({ code: string(row.code), name: string(row.name),
    redemptions: integer(row.redemptions), discountCents: integer(row.discount_cents), grossPaidCents: integer(row.gross_paid_cents),
    refundedCents: integer(row.refunded_cents), netRevenueCents: integer(row.net_revenue_cents) })) as CouponReportRow[];
}
export async function loadCouponSummary(client: SupabaseClient, from: string, to: string): Promise<CouponAggregate> {
  const result = await client.rpc("commerce_admin_coupon_summary_v1", { p_from: from, p_to: to }).abortSignal(AbortSignal.timeout(15_000));
  const row = result.data as Record<string, unknown> | null;
  if (result.error || !row || row.ok !== true) throw new Error("coupon_summary_unavailable");
  return { availableNow: integer(row.availableNow), needsReview: integer(row.needsReview), redemptions: integer(row.redemptions), discountCents: integer(row.discountCents), grossPaidCents: integer(row.grossPaidCents), refundedCents: integer(row.refundedCents), netRevenueCents: integer(row.netRevenueCents) };
}
export async function loadCouponReviewHolds(client: SupabaseClient, cursor: unknown = {}, limit = 25): Promise<CouponReviewHold[]> {
  const result = await client.rpc("commerce_admin_coupon_needs_review_v1", { p_cursor: cursor, p_limit: limit }).abortSignal(AbortSignal.timeout(15_000));
  if (result.error || !Array.isArray(result.data?.items)) throw new Error("coupon_review_unavailable");
  return result.data.items.map((row: Record<string, unknown>) => ({ reservationId: string(row.reservation_id), attemptId: string(row.attempt_id), code: string(row.code), normalizedEmail: string(row.normalized_email), discountCents: integer(row.discount_cents), holdExpiresAt: string(row.hold_expires_at), reviewReason: string(row.review_reason), createdAt: string(row.created_at), paymentProvider: string(row.payment_provider), attemptStatus: string(row.attempt_status) }));
}
export async function loadCouponCatalog(client: SupabaseClient, options: { search?: string; definition?: CouponDefinition } = {}): Promise<CouponCatalog> {
  const search = options.search?.trim().slice(0, 80);
  let productQuery = client.from("commerce_products").select("id,name").in("status", ["active", "draft"]).order("name").limit(100);
  let customerQuery = client.from("commerce_customers").select("id,profile_id,email").order("created_at", { ascending: false }).limit(100);
  if (search) { productQuery = productQuery.ilike("name", `%${search}%`); customerQuery = customerQuery.ilike("email", `%${search}%`); }
  const [products, categories, customers] = await Promise.all([
    productQuery,
    client.from("commerce_categories").select("id,name,slug").in("status", ["active", "draft"]).order("name").limit(200),
    customerQuery,
  ]);
  if (products.error || categories.error || customers.error) throw new Error("coupon_catalog_unavailable");
  const categoryRows = (categories.data ?? []) as { name: string; slug: string }[];
  const categoryMap = new Map(categoryRows.map((row) => [row.slug, row.name]));
  categoryMap.set("loose_leaf", "Loose-leaf tea");
  for (const key of [...(options.definition?.scope.includeCategoryKeys ?? []),...(options.definition?.scope.excludeCategoryKeys ?? [])]) if(!categoryMap.has(key))categoryMap.set(key,`Selected category: ${key}`);
  const productMap = new Map(((products.data ?? []) as { id: string; name: string }[]).filter((row) => uuid.test(row.id)).map((row) => [row.id, row.name]));
  const selectedProductIds = [...(options.definition?.scope.includeProductIds ?? []), ...(options.definition?.scope.excludeProductIds ?? [])];
  if (selectedProductIds.length) { const selected = await client.from("commerce_products").select("id,name").in("id", selectedProductIds); if (!selected.error) for (const row of (selected.data ?? []) as { id: string; name: string }[]) productMap.set(row.id, row.name); }
  const customerMap = new Map<string,string>();
  for (const row of (customers.data ?? []) as { profile_id: string | null; email: string | null }[]) { const email=row.email?.trim().toLowerCase(); const key=row.profile_id&&uuid.test(row.profile_id)?`profile:${row.profile_id}`:email?`email:${email}`:null; if(key)customerMap.set(key,email||`Account ${row.profile_id!.slice(0,8)}`); }
  for (const key of options.definition?.audience.selectedCustomerKeys ?? []) if (!customerMap.has(key)) customerMap.set(key, key.startsWith("email:") ? key.slice(6) : `Selected ${key.split(":")[0]} ${key.split(":")[1]?.slice(0,8)}`);
  return {
    products: [...productMap].map(([id,name]) => ({ id,name })).sort((a,b)=>a.name.localeCompare(b.name)),
    categories: [...categoryMap].map(([key, name]) => ({ key, name })).sort((a, b) => a.name.localeCompare(b.name)),
    customers: [...customerMap].map(([key,label]) => ({ key,label })),
  };
}

export const cad = (amount: number) => new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(amount / 100);
export const localDateTime = (iso: string | null) => iso ? new Date(iso).toISOString().slice(0, 16) : "";
