import { describe, expect, it, vi } from "vitest";
import { loadCommerceOverview, loadNativeSales, summarizeNativeSales, type RevenueComponents } from "@/lib/admin/commerce";

type Sale = {
  id: string;
  status: string;
  total_cents: number;
  refunded_cents: number;
  tax_cents: number | null;
  shipping_cents: number | null;
  currency: string;
  source: string;
  migration_snapshot: Record<string, unknown>;
  checkout_attempt_id: string | null;
  stripe_invoice_id: string | null;
  placed_at: string | null;
  created_at: string;
};
type QueryRecord = {
  filters: Array<[string, string, unknown]>;
  limit: number;
  order: string | null;
};

const window = { start: "2026-10-01T06:00:00.000Z", end: "2026-10-02T06:00:00.000Z" };
const zeroComponents: RevenueComponents = {
  merchandiseCents: 0, taxCents: 0, shippingCents: 0, refundsCents: 0, totalCents: 0, orderCount: 0,
};

function sale(id: string, overrides: Partial<Sale> = {}): Sale {
  return {
    id,
    status: "paid",
    total_cents: 1000,
    refunded_cents: 0,
    tax_cents: 0,
    shipping_cents: 0,
    currency: "cad",
    source: "web",
    migration_snapshot: {},
    checkout_attempt_id: "checkout-attempt",
    stripe_invoice_id: null,
    placed_at: "2026-10-01T12:00:00.000Z",
    created_at: "2026-10-01T12:00:00.000Z",
    ...overrides,
  };
}

function salesClient(rows: Sale[], failOnQuery?: (query: QueryRecord) => boolean) {
  const queries: QueryRecord[] = [];
  const from = vi.fn((table: string) => {
    expect(table).toBe("commerce_orders");
    const query: QueryRecord = { filters: [], limit: Infinity, order: null };
    const builder = {
      select() { return builder; },
      in(column: string, values: string[]) { query.filters.push(["in", column, values]); return builder; },
      gte(column: string, value: string) { query.filters.push(["gte", column, value]); return builder; },
      lt(column: string, value: string) { query.filters.push(["lt", column, value]); return builder; },
      is(column: string, value: null) { query.filters.push(["is", column, value]); return builder; },
      gt(column: string, value: string) { query.filters.push(["gt", column, value]); return builder; },
      order(column: string) { query.order = column; return builder; },
      limit(value: number) { query.limit = value; return builder; },
      async abortSignal() {
        queries.push({ ...query, filters: [...query.filters] });
        if (failOnQuery?.(query)) return { data: null, error: { message: "Database unavailable" } };
        let matched = [...rows];
        for (const [operator, column, value] of query.filters) {
          matched = matched.filter((row) => {
            const field = row[column as keyof Sale];
            if (operator === "in") return (value as string[]).includes(String(field));
            if (operator === "is") return field === value;
            if (operator === "gte") return field !== null && String(field) >= String(value);
            if (operator === "lt") return field !== null && String(field) < String(value);
            if (operator === "gt") return field !== null && String(field) > String(value);
            throw new Error(`Unsupported filter ${operator}`);
          });
        }
        if (query.order === "id") matched.sort((a, b) => a.id.localeCompare(b.id));
        return { data: matched.slice(0, Math.min(query.limit, 1000)), error: null };
      },
    };
    return builder;
  });
  return { client: { from } as never, from, queries };
}

function overviewClient(rows: Sale[], failOnQuery?: (query: QueryRecord) => boolean) {
  const sales = salesClient(rows, failOnQuery);
  const emptyQuery = () => {
    const response = { data: [], count: 0, error: null };
    const builder = {
      gte() { return builder; }, order() { return builder; }, limit() { return builder; },
      in() { return builder; }, eq() { return builder; },
      then(resolve: (value: typeof response) => unknown) { return Promise.resolve(response).then(resolve); },
    };
    return builder;
  };
  const client = {
    from: (table: string) => ({
      select: (columns: string) => table === "commerce_orders" && columns.includes("migration_snapshot")
        ? sales.from(table).select() : emptyQuery(),
    }),
    rpc: (name: string) => ({
      abortSignal: async () => name === "vf_admin_imported_orders_page_v1"
        ? { data: null, error: { message: "Archive unavailable" } }
        : { data: { total: 0 }, error: null },
    }),
  };
  return { client: client as never, queries: sales.queries };
}

describe("admin native sales aggregation", () => {
  it("includes all rows beyond the PostgREST response cap using a stable keyset cursor", async () => {
    const rows = Array.from({ length: 1205 }, (_, index) => sale(`order-${String(index).padStart(4, "0")}`));
    const { client, queries } = salesClient(rows);

    await expect(loadNativeSales(client, window)).resolves.toMatchObject({
      connected: true, totalCents: 1_205_000, orderCount: 1205, currency: "cad",
      components: { merchandiseCents: 1_205_000, taxCents: 0, shippingCents: 0,
        refundsCents: 0, totalCents: 1_205_000, orderCount: 1205 },
      channels: { inStore: zeroComponents, unclassified: zeroComponents,
        online: { totalCents: 1_205_000, orderCount: 1205 } },
    });
    expect(queries.length).toBeGreaterThan(3);
    expect(queries.filter((query) => query.filters.some(([op, column]) => op === "gt" && column === "id"))).toHaveLength(2);
    expect(queries.every((query) => query.order === "id" && query.limit <= 1000)).toBe(true);
  });

  it("uses placed time where available and created time only as a fallback, with a half-open interval", async () => {
    const rows = [
      sale("placed-inside-created-outside", { created_at: "2026-09-30T12:00:00.000Z" }),
      sale("placed-outside-created-inside", { placed_at: "2026-09-30T12:00:00.000Z" }),
      sale("created-fallback", { placed_at: null }),
      sale("at-start", { placed_at: window.start }),
      sale("at-end", { placed_at: window.end }),
      sale("fallback-at-end", { placed_at: null, created_at: window.end }),
    ];
    const { client, queries } = salesClient(rows);

    await expect(loadNativeSales(client, window)).resolves.toMatchObject({
      connected: true, totalCents: 3000, orderCount: 3,
    });
    const fallback = queries.find((query) => query.filters.some(([op, column]) => op === "is" && column === "placed_at"));
    expect(fallback?.filters).toContainEqual(["gte", "created_at", window.start]);
    expect(fallback?.filters).toContainEqual(["lt", "created_at", window.end]);
  });

  it("counts settled statuses and subtracts partial or full refunds", async () => {
    const rows = [
      sale("paid", { total_cents: 2000, tax_cents: 100, shipping_cents: 200 }),
      sale("processing", { status: "processing", total_cents: 3000, tax_cents: 150, shipping_cents: 300, refunded_cents: 500 }),
      sale("fulfilled", { status: "fulfilled", total_cents: 4000, tax_cents: 200, shipping_cents: 400 }),
      sale("partial", { status: "partially_refunded", total_cents: 5000, tax_cents: 250, shipping_cents: 500, refunded_cents: 2000 }),
      sale("refunded", { status: "refunded", total_cents: 6000, tax_cents: 300, shipping_cents: 600, refunded_cents: 6000 }),
      sale("pending", { status: "pending", total_cents: 100_000 }),
      sale("failed", { status: "failed", total_cents: 100_000 }),
      sale("cancelled", { status: "cancelled", total_cents: 100_000 }),
    ];
    const { client } = salesClient(rows);
    await expect(loadNativeSales(client, window)).resolves.toMatchObject({
      connected: true, totalCents: 11_500, orderCount: 5,
      components: { merchandiseCents: 17_000, taxCents: 1000, shippingCents: 2000,
        refundsCents: 8500, totalCents: 11_500, orderCount: 5 },
    });
  });

  it("hides a partial total if a later page fails", async () => {
    const rows = Array.from({ length: 501 }, (_, index) => sale(`order-${String(index).padStart(4, "0")}`));
    const { client } = salesClient(rows, (query) => query.filters.some(([op, column]) => op === "gt" && column === "id"));
    await expect(loadNativeSales(client, window)).resolves.toMatchObject({
      connected: false, totalCents: 0, orderCount: 0, components: null,
      channels: null,
      message: expect.stringMatching(/could not be loaded/i),
    });
  });

  it("does not combine currencies or invalid refund values into a CAD total", async () => {
    for (const invalid of [
      sale("usd", { currency: "usd" }),
      sale("excessive-refund", { total_cents: 1000, refunded_cents: 1001 }),
      sale("fractional-total", { total_cents: 10.5 }),
      sale("negative-tax", { tax_cents: -1 }),
      sale("excessive-tax", { tax_cents: 1001 }),
      sale("excessive-shipping", { shipping_cents: 1001 }),
      sale("missing-tax", { tax_cents: null }),
      sale("missing-shipping", { shipping_cents: null }),
    ]) {
      const { client } = salesClient([sale("cad"), invalid]);
      await expect(loadNativeSales(client, window)).resolves.toMatchObject({
        connected: false, totalCents: 0, orderCount: 0, components: null,
        channels: null,
      });
    }
  });

  it("only marks native purchases as safe to combine when their source is verified", async () => {
    const verified = salesClient([
      sale("web"),
      sale("renewal", { source: "subscription_renewal", checkout_attempt_id: null, stripe_invoice_id: "invoice-1" }),
    ]);
    await expect(loadNativeSales(verified.client, window)).resolves.toMatchObject({
      connected: true, totalCents: 2000, newStoreProvenance: true,
    });

    for (const unverified of [
      sale("imported", { source: "imported" }),
      sale("snapshot", { migration_snapshot: { original_order_id: "7" } }),
      sale("no-checkout", { checkout_attempt_id: null }),
      sale("no-invoice", { source: "subscription_renewal", checkout_attempt_id: null }),
      sale("pos", { source: "pos" }),
      sale("matcha", { source: "matcha_subscription", checkout_attempt_id: null, stripe_invoice_id: "invoice-matcha",
        migration_snapshot: { matchaInvoiceOrderVersion: 1 } }),
    ]) {
      const { client } = salesClient([unverified]);
      await expect(loadNativeSales(client, window)).resolves.toMatchObject({
        connected: true, totalCents: 1000, newStoreProvenance: false,
      });
    }
  });

  it("reconciles cash/card POS, checkout and both subscription sources with refunds and unknown sources", async () => {
    const { client } = salesClient([
      sale("pos-cash", { source: "pos", total_cents: 1200, tax_cents: 100 }),
      sale("pos-card", { source: "pos", status: "partially_refunded", total_cents: 2400, tax_cents: 200, refunded_cents: 500 }),
      sale("web", { total_cents: 3500, tax_cents: 200, shipping_cents: 300 }),
      sale("renewal", { source: "subscription_renewal", total_cents: 2800, tax_cents: 100, checkout_attempt_id: null, stripe_invoice_id: "invoice-renewal" }),
      sale("matcha", { source: "matcha_subscription", status: "refunded", total_cents: 1500, tax_cents: 100, refunded_cents: 1500,
        checkout_attempt_id: null, stripe_invoice_id: "invoice-matcha", migration_snapshot: { matchaInvoiceOrderVersion: 1 } }),
      sale("unknown", { source: "other", total_cents: 700, tax_cents: 50 }),
      sale("unverified-alias", { source: "matcha_subscription_invoice", total_cents: 900, shipping_cents: 100 }),
      sale("pending-pos", { source: "pos", status: "pending", total_cents: 99_000 }),
    ]);
    const result = await loadNativeSales(client, window);
    expect(result).toMatchObject({ connected: true, totalCents: 11_000, orderCount: 7, newStoreProvenance: false });
    expect(result.channels).toEqual({
      inStore: { merchandiseCents: 3300, taxCents: 300, shippingCents: 0, refundsCents: 500, totalCents: 3100, orderCount: 2 },
      online: { merchandiseCents: 7100, taxCents: 400, shippingCents: 300, refundsCents: 1500, totalCents: 6300, orderCount: 3 },
      unclassified: { merchandiseCents: 1450, taxCents: 50, shippingCents: 100, refundsCents: 0, totalCents: 1600, orderCount: 2 },
    });
    for (const field of Object.keys(zeroComponents) as Array<keyof RevenueComponents>) {
      expect(Object.values(result.channels!).reduce((sum, channel) => sum + channel[field], 0)).toBe(result.components![field]);
    }
  });

  it("aggregates each channel across every page instead of only the first page", async () => {
    const sources = ["pos", "web", "unknown"];
    const rows = Array.from({ length: 1205 }, (_, index) => sale(`order-${String(index).padStart(4, "0")}`, { source: sources[index % 3] }));
    const { client } = salesClient(rows);
    expect((await loadNativeSales(client, window)).channels).toMatchObject({
      inStore: { totalCents: 402_000, orderCount: 402 },
      online: { totalCents: 402_000, orderCount: 402 },
      unclassified: { totalCents: 401_000, orderCount: 401 },
    });
  });

  it("applies the half-open calendar bounds and fallback clock to each channel", async () => {
    const { client } = salesClient([
      sale("pos-at-start", { source: "pos", placed_at: window.start }),
      sale("pos-at-end", { source: "pos", placed_at: window.end }),
      sale("matcha-created-fallback", { source: "matcha_subscription", placed_at: null }),
      sale("unknown-before-start", { source: "unknown", placed_at: "2026-10-01T05:59:59.999Z" }),
      sale("unknown-at-end", { source: "unknown", placed_at: null, created_at: window.end }),
    ]);
    expect((await loadNativeSales(client, window)).channels).toMatchObject({
      inStore: { totalCents: 1000, orderCount: 1 }, online: { totalCents: 1000, orderCount: 1 }, unclassified: zeroComponents,
    });
  });

  it("reports a loaded empty period as real zero channels and invalid periods as unavailable", async () => {
    const empty = salesClient([]);
    const loaded = await loadNativeSales(empty.client, window);
    expect(summarizeNativeSales(loaded)).toEqual({
      connected: true, totalCents: 0, orderCount: 0, currency: "cad", message: null,
      components: zeroComponents, channels: { inStore: zeroComponents, online: zeroComponents, unclassified: zeroComponents },
    });
    for (const invalid of [{ start: "invalid", end: window.end }, { start: window.end, end: window.start }, { start: window.start, end: window.start }]) {
      const { client, queries } = salesClient([sale("sale")]);
      const result = summarizeNativeSales(await loadNativeSales(client, invalid));
      expect(result).toMatchObject({ connected: false, components: null, channels: null, message: expect.any(String) });
      expect(queries).toHaveLength(0);
    }
  });

  it("hides channel figures and the projection when the fallback page fails", async () => {
    const { client } = salesClient([sale("pos", { source: "pos" }), sale("fallback", { placed_at: null })],
      query => query.filters.some(([op, column]) => op === "is" && column === "placed_at"));
    expect(summarizeNativeSales(await loadNativeSales(client, window))).toMatchObject({
      connected: false, totalCents: 0, orderCount: 0, components: null, channels: null,
    });
  });

  it("never returns channel amounts after safe-integer aggregation overflow", async () => {
    const { client } = salesClient([sale("max-pos", { source: "pos", total_cents: Number.MAX_SAFE_INTEGER }), sale("extra-web")]);
    expect(await loadNativeSales(client, window)).toMatchObject({ connected: false, components: null, channels: null });
  });
});

describe("Commerce Overview daily sales data", () => {
  it("reuses the same complete read for Today instead of loading mismatched snapshots twice", async () => {
    const { client, queries } = overviewClient([sale("pos", { source: "pos" }), sale("web")]);
    const result = await loadCommerceOverview(client, { salesPeriod: "day", salesRange: window, todayRange: { ...window } });
    expect(queries).toHaveLength(2);
    expect(result.todaySales).toMatchObject({ connected: true, totalCents: 2000, startUtc: window.start, endUtc: window.end,
      channels: { inStore: { totalCents: 1000 }, online: { totalCents: 1000 } } });
    expect(result.todaySales.channels).toBe(result.salesChannels);
  });

  it("keeps Today independent when a selected sales period fails", async () => {
    const selected = { start: "2026-09-30T06:00:00.000Z", end: window.start };
    const { client, queries } = overviewClient([sale("today-pos", { source: "pos", total_cents: 2500 })],
      query => query.filters.some(([op, , value]) => op === "gte" && value === selected.start));
    const result = await loadCommerceOverview(client, { salesPeriod: "yesterday", salesRange: selected, todayRange: window });
    expect(queries).toHaveLength(3);
    expect(result).toMatchObject({ salesConnected: false, salesChannels: null,
      todaySales: { connected: true, totalCents: 2500, channels: { inStore: { totalCents: 2500 }, online: zeroComponents } } });
  });

  it("keeps daily figures available even when Last year's archived estimate is unavailable", async () => {
    const selected = { start: "2025-01-01T07:00:00.000Z", end: "2026-01-01T07:00:00.000Z" };
    const { client } = overviewClient([sale("today-matcha", { source: "matcha_subscription", total_cents: 1499,
      stripe_invoice_id: "invoice-matcha", checkout_attempt_id: null })]);
    const result = await loadCommerceOverview(client, { salesPeriod: "last_year", salesRange: selected, todayRange: window });
    expect(result).toMatchObject({ salesConnected: false, salesMessage: expect.stringMatching(/archive/i),
      revenueBreakdown: { historicalRequested: true, historicalEstimate: null, combinedEstimateCents: null },
      todaySales: { connected: true, totalCents: 1499, channels: { online: { totalCents: 1499 }, inStore: zeroComponents } } });
  });

  it("keeps selected-period channels available if the independent Today read fails", async () => {
    const selected = { start: "2026-09-30T06:00:00.000Z", end: window.start };
    const { client } = overviewClient([sale("yesterday-pos", { source: "pos", total_cents: 1700, placed_at: "2026-09-30T12:00:00.000Z" })],
      query => query.filters.some(([op, , value]) => op === "gte" && value === window.start));
    const result = await loadCommerceOverview(client, { salesPeriod: "yesterday", salesRange: selected, todayRange: window });
    expect(result).toMatchObject({ salesConnected: true, salesChannels: { inStore: { totalCents: 1700 } },
      todaySales: { connected: false, components: null, channels: null, message: expect.stringMatching(/could not be loaded/i) } });
  });
});
