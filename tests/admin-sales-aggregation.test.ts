import { describe, expect, it, vi } from "vitest";
import { loadNativeSales } from "@/lib/admin/commerce";

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
  return { client: { from } as never, queries };
}

describe("admin native sales aggregation", () => {
  it("includes all rows beyond the PostgREST response cap using a stable keyset cursor", async () => {
    const rows = Array.from({ length: 1205 }, (_, index) => sale(`order-${String(index).padStart(4, "0")}`));
    const { client, queries } = salesClient(rows);

    await expect(loadNativeSales(client, window)).resolves.toMatchObject({
      connected: true, totalCents: 1_205_000, orderCount: 1205, currency: "cad",
      components: { merchandiseCents: 1_205_000, taxCents: 0, shippingCents: 0,
        refundsCents: 0, totalCents: 1_205_000, orderCount: 1205 },
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
    ]) {
      const { client } = salesClient([unverified]);
      await expect(loadNativeSales(client, window)).resolves.toMatchObject({
        connected: true, totalCents: 1000, newStoreProvenance: false,
      });
    }
  });
});
