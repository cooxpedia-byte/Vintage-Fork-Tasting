import { describe, expect, it, vi } from "vitest";
import { loadProductSales } from "@/lib/admin/product-sales";
import {
  DEFAULT_PRODUCT_SALES_PERIOD,
  PRODUCT_SALES_PERIODS,
  parseProductSalesPeriod,
  productSalesPeriodRange,
} from "@/lib/admin/product-sales-periods";

type Product = { id: string; name: string };
type Variant = { id: string; product_id: string; label: string; sku: string };
type Order = {
  id: string; status: string; placed_at: string | null; created_at: string;
  total_cents: number; refunded_cents: number;
};
type Item = {
  id: string; product_id: string | null; variant_id: string | null;
  sku_snapshot: string | null; variant_snapshot: string | null;
  quantity: number; fulfillment_status: string; commerce_orders: Order;
};
type Filter = { method: "in" | "gte" | "lt" | "is" | "gt" | "ilike"; column: string; value: unknown };
type Query = { table: string; select: string; filters: Filter[]; limit: number; orders: string[] };

const range = { start: "2026-10-01T06:00:00.000Z", end: "2026-10-02T06:00:00.000Z" };
const products: Product[] = [{ id: "advent", name: "Tea Advent Calendar" }];
const variants: Variant[] = [
  { id: "black", product_id: "advent", label: "Black tea", sku: "VF-BLACK" },
  { id: "herbal", product_id: "advent", label: "Herbal tea", sku: "VF-HERBAL" },
];

function order(id: string, changes: Partial<Order> = {}): Order {
  return {
    id, status: "paid", placed_at: "2026-10-01T12:00:00.000Z",
    created_at: "2026-10-01T12:00:00.000Z", total_cents: 1000, refunded_cents: 0,
    ...changes,
  };
}

function item(id: string, changes: Partial<Item> = {}): Item {
  return {
    id, product_id: "advent", variant_id: "black", sku_snapshot: "VF-BLACK",
    variant_snapshot: "Old black label", quantity: 1, fulfillment_status: "unfulfilled",
    commerce_orders: order(`order-${id}`), ...changes,
  };
}

function nestedField(row: Record<string, unknown>, column: string): unknown {
  return column.split(".").reduce<unknown>((value, part) =>
    value && typeof value === "object" ? (value as Record<string, unknown>)[part] : undefined, row);
}

function emptyArchive(productIds = ["advent"], unmappedProductIds: string[] = []) {
  return {
    kind: "historical-product-units", snapshot: "saved-import-v1", operatingOwner: "original_woo",
    historicalEstimate: true, paymentVerified: false, refundAdjusted: false, completeGraph: false,
    sourceUpdatedAt: "2026-09-11T02:08:51.677Z",
    mappedProductIds: productIds.filter(id => !unmappedProductIds.includes(id)), unmappedProductIds,
    rows: [], eligibleOrderCount: 0, matchingItemCount: 0,
  };
}

function shopClient(data: { products?: Product[]; variants?: Variant[]; items?: Item[];
  archive?: unknown; archiveError?: boolean; unmappedProductIds?: string[] },
  fails?: (query: Query) => boolean) {
  const queries: Query[] = [];
  const tables: Record<string, Record<string, unknown>[]> = {
    commerce_products: (data.products ?? products) as Record<string, unknown>[],
    commerce_product_variants: (data.variants ?? variants) as Record<string, unknown>[],
    commerce_order_items: (data.items ?? []) as Record<string, unknown>[],
  };
  const from = vi.fn((table: string) => {
    if (!(table in tables)) throw new Error(`Unexpected table ${table}`);
    const query: Query = { table, select: "", filters: [], limit: Infinity, orders: [] };
    const builder = {
      select(value: string) { query.select = value; return builder; },
      in(column: string, value: string[]) { query.filters.push({ method: "in", column, value }); return builder; },
      gte(column: string, value: string) { query.filters.push({ method: "gte", column, value }); return builder; },
      lt(column: string, value: string) { query.filters.push({ method: "lt", column, value }); return builder; },
      is(column: string, value: null) { query.filters.push({ method: "is", column, value }); return builder; },
      gt(column: string, value: string) { query.filters.push({ method: "gt", column, value }); return builder; },
      ilike(column: string, value: string) { query.filters.push({ method: "ilike", column, value }); return builder; },
      order(column: string) { query.orders.push(column); return builder; },
      limit(value: number) { query.limit = value; return builder; },
      async abortSignal() {
        const snapshot: Query = { ...query, filters: [...query.filters], orders: [...query.orders] };
        queries.push(snapshot);
        if (fails?.(snapshot)) return { data: null, error: { message: "Unavailable" } };
        let rows = tables[table];
        for (const filter of query.filters) {
          rows = rows.filter(row => {
            const value = nestedField(row, filter.column);
            if (filter.method === "in") return (filter.value as string[]).includes(String(value));
            if (filter.method === "is") return value === filter.value;
            if (filter.method === "gte") return value !== null && String(value) >= String(filter.value);
            if (filter.method === "lt") return value !== null && String(value) < String(filter.value);
            if (filter.method === "gt") return value !== null && String(value) > String(filter.value);
            if (filter.method === "ilike") {
              const literal = String(filter.value).slice(1, -1).replace(/\\([\\%_])/g, "$1");
              return String(value).toLocaleLowerCase().includes(literal.toLocaleLowerCase());
            }
            throw new Error(`Unsupported filter ${filter.method}`);
          });
        }
        rows = [...rows].sort((a, b) => {
          for (const column of query.orders) {
            const comparison = String(nestedField(a, column)).localeCompare(String(nestedField(b, column)));
            if (comparison) return comparison;
          }
          return 0;
        });
        return { data: rows.slice(0, Math.min(query.limit, 1000)), error: null };
      },
    };
    return builder;
  });
  const rpc = vi.fn((name: string, args: Record<string, unknown>) => {
    expect(name).toBe("vf_admin_historical_product_units_v1");
    expect(args).toMatchObject({ p_start: range.start, p_end: range.end });
    return { async abortSignal() {
      return data.archiveError
        ? { data: null, error: { message: "Archive unavailable" } }
        : { data: data.archive === undefined
          ? emptyArchive(args.p_product_ids as string[], data.unmappedProductIds) : data.archive, error: null };
    } };
  });
  return { client: { from, rpc } as never, queries, rpc };
}

describe("product sales periods", () => {
  it("offers exactly the six requested periods and rejects unknown values", () => {
    expect(PRODUCT_SALES_PERIODS.map(period => period.label)).toEqual([
      "Today", "Yesterday", "Last week", "Month to date", "Last month", "Year to date",
    ]);
    expect(parseProductSalesPeriod("yesterday")).toBe("yesterday");
    expect(parseProductSalesPeriod(["today", "yesterday"])).toBe(DEFAULT_PRODUCT_SALES_PERIOD);
    expect(parseProductSalesPeriod("last_year")).toBe(DEFAULT_PRODUCT_SALES_PERIOD);
  });

  it("uses Edmonton calendar boundaries and an exclusive end", () => {
    const now = new Date("2026-10-02T18:30:00.000Z");
    expect(productSalesPeriodRange("today", now)).toEqual({ start: "2026-10-02T06:00:00.000Z", end: now.toISOString() });
    expect(productSalesPeriodRange("yesterday", now)).toEqual({ start: "2026-10-01T06:00:00.000Z", end: "2026-10-02T06:00:00.000Z" });
    expect(productSalesPeriodRange("last_week", now)).toEqual({ start: "2026-09-21T06:00:00.000Z", end: "2026-09-28T06:00:00.000Z" });
    expect(productSalesPeriodRange("month_to_date", now)).toEqual({ start: "2026-10-01T06:00:00.000Z", end: now.toISOString() });
    expect(productSalesPeriodRange("last_month", now)).toEqual({ start: "2026-09-01T06:00:00.000Z", end: "2026-10-01T06:00:00.000Z" });
    expect(productSalesPeriodRange("year_to_date", now)).toEqual({ start: "2026-01-01T07:00:00.000Z", end: now.toISOString() });
    expect(productSalesPeriodRange("yesterday", now).end).toBe(productSalesPeriodRange("today", now).start);
  });

  it("gives yesterday 23 or 25 hours across daylight saving transitions", () => {
    const spring = productSalesPeriodRange("yesterday", new Date("2026-03-09T18:00:00.000Z"));
    expect(spring).toEqual({ start: "2026-03-08T07:00:00.000Z", end: "2026-03-09T06:00:00.000Z" });
    expect((Date.parse(spring.end) - Date.parse(spring.start)) / 3600000).toBe(23);
    const fall = productSalesPeriodRange("yesterday", new Date("2026-11-02T18:00:00.000Z"));
    expect(fall).toEqual({ start: "2026-11-01T06:00:00.000Z", end: "2026-11-02T07:00:00.000Z" });
    expect((Date.parse(fall.end) - Date.parse(fall.start)) / 3600000).toBe(25);
  });
});

describe("admin product sales aggregation", () => {
  it("includes zero-sale products and variations and keeps renamed or retired variations distinct", async () => {
    const { client } = shopClient({
      products: [...products, { id: "advent-card", name: "Advent gift card" }],
      items: [
        item("a", { variant_id: "black", variant_snapshot: "Old black label", quantity: 3 }),
        item("b", { variant_id: "retired", sku_snapshot: "OLD-RETIRED", variant_snapshot: "Retired blend", quantity: 2 }),
        item("c", { variant_id: null, sku_snapshot: "VF-HERBAL", variant_snapshot: "Old herbal label" }),
      ],
    });
    const result = await loadProductSales(client, { query: "  advent  ", range });
    expect(result).toMatchObject({ connected: true, more: false, message: null });
    expect(result.products).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "advent", units: 6, variations: expect.arrayContaining([
        expect.objectContaining({ key: "black", label: "Black tea", units: 3 }),
        expect.objectContaining({ key: "herbal", label: "Herbal tea", units: 1 }),
        expect.objectContaining({ key: "retired", label: "Retired blend", units: 2 }),
      ]) }),
      expect.objectContaining({ id: "advent-card", units: 0, variations: [expect.objectContaining({ key: "unvaried", label: "Standard", sku: null, units: 0 })] }),
    ]));
  });

  it("pages beyond 500 line items without silently truncating counts", async () => {
    const rows = Array.from({ length: 1205 }, (_, index) => item(`item-${String(index).padStart(4, "0")}`));
    const { client, queries } = shopClient({ items: rows });
    const result = await loadProductSales(client, { query: "Advent", range });
    expect(result).toMatchObject({ connected: true, products: [{ id: "advent", units: 1205 }] });
    const itemQueries = queries.filter(query => query.table === "commerce_order_items");
    expect(itemQueries).toHaveLength(4);
    expect(itemQueries.every(query => query.limit === 500 && query.orders.includes("id")
      && query.select.includes("commerce_orders!inner"))).toBe(true);
    expect(itemQueries.filter(query => query.filters.some(filter => filter.method === "gt" && filter.column === "id"))).toHaveLength(2);
  });

  it("merges mapped archive variations while preserving native and estimated columns", async () => {
    const archive = {
      ...emptyArchive(), eligibleOrderCount: 3, matchingItemCount: 3,
      rows: [
        { productId: "advent", variantId: "black", sourceVariationId: "8398", variantLabel: "Old black", units: 5 },
        { productId: "advent", variantId: "herbal", sourceVariationId: "8399", variantLabel: "Old herbal", units: 2 },
        { productId: "advent", variantId: null, sourceVariationId: "999", variantLabel: null, units: 4 },
      ],
    };
    const { client, rpc } = shopClient({ items: [item("native", { quantity: 3 })], archive });
    const result = await loadProductSales(client, { query: "Advent", range });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("vf_admin_historical_product_units_v1", {
      p_start: range.start, p_end: range.end, p_product_ids: ["advent"],
    });
    expect(result).toMatchObject({ connected: true, historyIncluded: true, products: [{
      id: "advent", nativeUnits: 3, historicalUnits: 11, units: 14,
      variations: expect.arrayContaining([
        expect.objectContaining({ key: "black", label: "Black tea", nativeUnits: 3, historicalUnits: 5, units: 8 }),
        expect.objectContaining({ key: "herbal", nativeUnits: 0, historicalUnits: 2, units: 2 }),
        expect.objectContaining({ key: "woo:999", nativeUnits: 0, historicalUnits: 4, units: 4 }),
      ]),
    }] });
  });

  it("marks an unmapped product's prior-store and combined counts unavailable", async () => {
    const { client } = shopClient({ items: [item("native", { quantity: 3 })], unmappedProductIds: ["advent"] });
    const result = await loadProductSales(client, { query: "Advent", range });
    expect(result).toMatchObject({ connected: true, historyIncluded: false, products: [{
      id: "advent", nativeUnits: 3, historicalUnits: null, units: null, historyMapped: false,
      variations: expect.arrayContaining([expect.objectContaining({
        key: "black", nativeUnits: 3, historicalUnits: null, units: null,
      })]),
    }] });
  });

  it("uses placed time when present and created time only as a fallback", async () => {
    const { client, queries } = shopClient({ items: [
      item("placed-inside", { commerce_orders: order("a", { created_at: "2026-09-30T12:00:00.000Z" }) }),
      item("placed-outside", { commerce_orders: order("b", { placed_at: "2026-09-30T12:00:00.000Z" }) }),
      item("created-fallback", { commerce_orders: order("c", { placed_at: null }) }),
      item("at-start", { commerce_orders: order("d", { placed_at: range.start }) }),
      item("at-end", { commerce_orders: order("e", { placed_at: range.end }) }),
      item("fallback-at-end", { commerce_orders: order("f", { placed_at: null, created_at: range.end }) }),
    ] });
    const result = await loadProductSales(client, { query: "Advent", range });
    expect(result).toMatchObject({ connected: true, products: [{ id: "advent", units: 3 }] });
    const fallback = queries.find(query => query.table === "commerce_order_items"
      && query.filters.some(filter => filter.method === "is" && filter.column === "commerce_orders.placed_at"));
    expect(fallback?.filters).toEqual(expect.arrayContaining([
      { method: "gte", column: "commerce_orders.created_at", value: range.start },
      { method: "lt", column: "commerce_orders.created_at", value: range.end },
    ]));
  });

  it("excludes cancelled and returned lines, unsettled and fully refunded orders", async () => {
    const { client } = shopClient({ items: [
      item("paid"),
      item("processing", { commerce_orders: order("p", { status: "processing" }) }),
      item("fulfilled", { commerce_orders: order("f", { status: "fulfilled" }) }),
      item("partial", { commerce_orders: order("r", { status: "partially_refunded", refunded_cents: 500 }) }),
      item("full", { commerce_orders: order("rf", { status: "partially_refunded", refunded_cents: 1000 }) }),
      item("refunded", { commerce_orders: order("rr", { status: "refunded", refunded_cents: 1000 }) }),
      item("pending", { commerce_orders: order("u", { status: "pending" }) }),
      item("failed", { commerce_orders: order("x", { status: "failed" }) }),
      item("cancelled-order", { commerce_orders: order("co", { status: "cancelled" }) }),
      item("returned-line", { fulfillment_status: "returned" }),
      item("cancelled-line", { fulfillment_status: "cancelled" }),
    ] });
    await expect(loadProductSales(client, { query: "Advent", range })).resolves.toMatchObject({
      connected: true, products: [{ id: "advent", units: 4 }],
    });
  });

  it("fails closed when a later page fails after partial counts were collected", async () => {
    const rows = Array.from({ length: 501 }, (_, index) => item(`item-${String(index).padStart(4, "0")}`));
    const { client } = shopClient({ items: rows }, query => query.table === "commerce_order_items"
      && query.filters.some(filter => filter.method === "gt" && filter.column === "id"));
    await expect(loadProductSales(client, { query: "Advent", range })).resolves.toMatchObject({
      connected: false, products: [], more: false, message: expect.stringMatching(/could not be loaded/i),
    });
  });

  it("hides native counts when the archive RPC is unavailable", async () => {
    const { client } = shopClient({ items: [item("native", { quantity: 3 })], archiveError: true });
    await expect(loadProductSales(client, { query: "Advent", range })).resolves.toMatchObject({
      connected: false, products: [], historyIncluded: false,
      message: expect.stringMatching(/could not be loaded/i),
    });
  });

  it("fails closed on malformed archive metadata, mapping, or quantities", async () => {
    const invalidArchives = [
      { ...emptyArchive(), paymentVerified: true },
      { ...emptyArchive(), rows: [{ productId: "another-product", variantId: null, sourceVariationId: "8398", variantLabel: null, units: 2 }] },
      { ...emptyArchive(), rows: [{ productId: "advent", variantId: "other-product-variant", sourceVariationId: "8398", variantLabel: null, units: 2 }] },
      { ...emptyArchive(), rows: [{ productId: "advent", variantId: null, sourceVariationId: "not-a-number", variantLabel: null, units: 2 }] },
      { ...emptyArchive(), rows: [{ productId: "advent", variantId: null, sourceVariationId: "8398", variantLabel: null, units: -1 }] },
    ];
    for (const archive of invalidArchives) {
      const { client } = shopClient({ items: [item("native")], archive });
      await expect(loadProductSales(client, { query: "Advent", range })).resolves.toMatchObject({
        connected: false, products: [], historyIncluded: false,
      });
    }
  });

  it("fails closed on malformed item quantities or order refund totals", async () => {
    for (const bad of [
      item("bad-quantity", { quantity: 0 }),
      item("bad-refund", { commerce_orders: order("bad", { refunded_cents: 1001 }) }),
    ]) {
      const { client } = shopClient({ items: [item("good"), bad] });
      await expect(loadProductSales(client, { query: "Advent", range })).resolves.toMatchObject({
        connected: false, products: [],
      });
    }
  });
});
