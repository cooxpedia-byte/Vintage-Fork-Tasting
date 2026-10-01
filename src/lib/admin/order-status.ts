/** Pure presentation helpers for a unified native + migrated admin order list. */

export type OrderRecordSource = "native" | "historical";
export type HistoricalRecordType = "shop_order" | "shop_subscription" | "shop_order_refund" | (string & {});

export type AdminOrderStatusFilter =
  | "all"
  | "processing"
  | "on_hold"
  | "failed"
  | "completed"
  | "other";

export type OrderStatusKey =
  | "processing"
  | "on_hold"
  | "failed"
  | "completed"
  | "pending"
  | "cancelled"
  | "partially_refunded"
  | "refunded"
  | "unknown";

export type OrderStatusTone = "info" | "warning" | "danger" | "success" | "neutral";
export type OrderRecordKind =
  | "native_order"
  | "migrated_order"
  | "migrated_subscription"
  | "migrated_refund"
  | "migrated_record";

export type OrderStatusInput =
  | { source: "native"; status: string | null }
  | { source: "historical"; status: string | null; type: HistoricalRecordType | null };

export type OrderStatusDisplay = {
  /** Stable semantic key. Never interpolate the raw source value into a class name. */
  key: OrderStatusKey;
  label: string;
  tone: OrderStatusTone;
  badgeClassName: `admin-order-status is-${OrderStatusTone}`;
  filterKey: Exclude<AdminOrderStatusFilter, "all">;
  source: OrderRecordSource;
  sourceLabel: "New store" | "Migrated record";
  recordKind: OrderRecordKind;
  recordTypeLabel: string;
  /** Exact source value retained for details, diagnostics, and future mappings. */
  rawStatus: string | null;
  known: boolean;
  /** Migrated records are a saved archive and must not drive operational actions. */
  operational: boolean;
};

type KnownDisplay = Pick<OrderStatusDisplay, "key" | "label" | "tone" | "filterKey">;

const DISPLAY: Record<Exclude<OrderStatusKey, "unknown">, KnownDisplay> = {
  processing: { key: "processing", label: "Processing", tone: "info", filterKey: "processing" },
  on_hold: { key: "on_hold", label: "On hold", tone: "warning", filterKey: "on_hold" },
  failed: { key: "failed", label: "Failed", tone: "danger", filterKey: "failed" },
  completed: { key: "completed", label: "Completed", tone: "success", filterKey: "completed" },
  pending: { key: "pending", label: "Pending", tone: "warning", filterKey: "other" },
  cancelled: { key: "cancelled", label: "Cancelled", tone: "neutral", filterKey: "other" },
  partially_refunded: { key: "partially_refunded", label: "Partially refunded", tone: "warning", filterKey: "other" },
  refunded: { key: "refunded", label: "Refunded", tone: "neutral", filterKey: "other" },
};

const NATIVE_STATUS: Readonly<Record<string, Exclude<OrderStatusKey, "unknown">>> = {
  // A native paid order is purchased and waiting in the fulfillment queue.
  paid: "processing",
  processing: "processing",
  fulfilled: "completed",
  failed: "failed",
  pending: "pending",
  cancelled: "cancelled",
  partially_refunded: "partially_refunded",
  refunded: "refunded",
};

const HISTORICAL_STATUS: Readonly<Record<string, Exclude<OrderStatusKey, "unknown">>> = {
  "wc-processing": "processing",
  processing: "processing",
  "wc-on-hold": "on_hold",
  "on-hold": "on_hold",
  on_hold: "on_hold",
  "wc-failed": "failed",
  failed: "failed",
  "wc-completed": "completed",
  "wc-delivered": "completed",
  completed: "completed",
  "wc-pending": "pending",
  pending: "pending",
  "wc-cancelled": "cancelled",
  cancelled: "cancelled",
  "wc-partially-refunded": "partially_refunded",
  partially_refunded: "partially_refunded",
  "wc-refunded": "refunded",
  refunded: "refunded",
};

export const ORDER_STATUS_FILTERS: ReadonlyArray<{ key: AdminOrderStatusFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "processing", label: "Processing" },
  { key: "on_hold", label: "On hold" },
  { key: "failed", label: "Failed" },
  { key: "completed", label: "Completed" },
  { key: "other", label: "Other" },
];

/** Values to use when each source is queried independently. */
export const ORDER_STATUS_SOURCE_FILTERS = {
  processing: {
    native: ["paid", "processing"],
    historical: ["wc-processing", "processing"],
  },
  on_hold: {
    native: [],
    historical: ["wc-on-hold", "on-hold", "on_hold"],
  },
  failed: {
    native: ["failed"],
    historical: ["wc-failed", "failed"],
  },
  completed: {
    native: ["fulfilled"],
    historical: ["wc-completed", "wc-delivered", "completed"],
  },
} as const;

function historicalRecord(input: Extract<OrderStatusInput, { source: "historical" }>): {
  recordKind: OrderRecordKind;
  recordTypeLabel: string;
} {
  if (input.type === "shop_order") return { recordKind: "migrated_order", recordTypeLabel: "Migrated order" };
  if (input.type === "shop_subscription") return { recordKind: "migrated_subscription", recordTypeLabel: "Migrated subscription record" };
  if (input.type === "shop_order_refund") return { recordKind: "migrated_refund", recordTypeLabel: "Migrated refund record" };
  return {
    recordKind: "migrated_record",
    recordTypeLabel: input.type ? `Migrated ${humanize(input.type)} record` : "Migrated record",
  };
}

function humanize(value: string): string {
  const words = value.trim().replace(/^wc-/, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  if (!words) return "Unknown";
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function orderStatusDisplay(input: OrderStatusInput): OrderStatusDisplay {
  const normalized = input.status?.trim().toLowerCase() ?? "";
  const mapped = (input.source === "native" ? NATIVE_STATUS : HISTORICAL_STATUS)[normalized];
  const display: KnownDisplay = mapped
    ? DISPLAY[mapped]
    : { key: "unknown", label: input.status ? humanize(input.status) : "Unknown", tone: "neutral", filterKey: "other" };
  const record = input.source === "native"
    ? { recordKind: "native_order" as const, recordTypeLabel: "New-store order" }
    : historicalRecord(input);

  return {
    ...display,
    badgeClassName: `admin-order-status is-${display.tone}`,
    source: input.source,
    sourceLabel: input.source === "native" ? "New store" : "Migrated record",
    ...record,
    rawStatus: input.status,
    known: Boolean(mapped),
    operational: input.source === "native",
  };
}

export function orderMatchesStatusFilter(input: OrderStatusInput, filter: AdminOrderStatusFilter): boolean {
  return filter === "all" || orderStatusDisplay(input).filterKey === filter;
}
