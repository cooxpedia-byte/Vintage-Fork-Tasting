import { describe, expect, it, vi } from "vitest";
import { loadHistoricalSalesEstimate } from "@/lib/admin/commerce";
import type { HistoricalOrder } from "@/lib/admin/historical-orders";

const lastYear = {
  start: "2025-01-01T07:00:00.000Z",
  end: "2026-01-01T07:00:00.000Z",
};

function order(sourceOrderId: string, overrides: Partial<HistoricalOrder> = {}): HistoricalOrder {
  return {
    sourceOrderId,
    sourceParentOrderId: null,
    type: "shop_order",
    status: "wc-completed",
    currency: "CAD",
    createdGmt: "2025-07-01 12:00:00",
    updatedGmt: null,
    total: "1.00",
    cartTax: "0",
    shipping: "0",
    shippingTax: "0",
    discount: "0",
    discountTax: "0",
    observations: [],
    issues: [],
    sourceHolds: [],
    textProjectionHeld: false,
    giftPaymentObservationCount: 0,
    arithmetic: {
      computedTotal: overrides.total ?? "1.00", totalDifference: "0.00",
      amountMatch: true, taxMatch: true, shippingMatch: true, discountMatch: true,
    },
    ...overrides,
  };
}

function page(
  rows: Array<{ ordinal: number; data: HistoricalOrder }>,
  nextCursor: number | null = null,
  total = rows.length,
) {
  return {
    snapshot: "saved-import-v1",
    operatingOwner: "original_woo",
    operational: false,
    completeGraph: false,
    paymentVerified: false,
    fulfillmentVerified: false,
    importedAt: "2026-09-01T00:00:00.000Z",
    kind: "orders",
    identityVerified: true,
    total,
    nextCursor,
    rows: rows.map(({ ordinal, data }) => ({ ordinal, itemCount: 0, data })),
  };
}

type RpcResponse = { data: unknown; error: null | { message: string } };
function historicalClient(responses: Record<number, RpcResponse>) {
  const rpc = vi.fn((name: string, args: { p_after: number }) => ({
    async abortSignal(): Promise<RpcResponse> {
      expect(name).toBe("vf_admin_imported_orders_page_v1");
      return responses[args.p_after] ?? { data: null, error: { message: "Unexpected cursor" } };
    },
  }));
  return { client: { rpc } as never, rpc };
}

describe("previous-store sales estimate", () => {
  it("counts only completed or processing CAD shop orders inside the half-open year", async () => {
    const rows = [
      order("1", { createdGmt: "2025-01-01 07:00:00", total: "10.25",
        cartTax: "0.50", shippingTax: "0.05", shipping: "1.00" }),
      order("2", { status: "wc-processing", total: "0.50" }),
      order("3", { createdGmt: "2025-01-01 06:59:59", total: "999.00" }),
      order("4", { createdGmt: "2026-01-01 07:00:00", total: "999.00" }),
      order("5", { status: "wc-pending", total: "999.00" }),
      order("6", { status: "wc-cancelled", total: "999.00" }),
      order("7", { type: "shop_order_refund", total: "-5.00" }),
    ];
    const { client } = historicalClient({
      0: { data: page(rows.map((data, index) => ({ ordinal: index + 1, data }))), error: null },
    });

    await expect(loadHistoricalSalesEstimate(client, lastYear)).resolves.toMatchObject({
      connected: true,
      totalCents: 1075,
      orderCount: 2,
      currency: "cad",
      message: null,
      components: { merchandiseCents: 920, taxCents: 55, shippingCents: 100,
        recordedTotalCents: 1075, orderCount: 2, excludedOrderCount: 0 },
    });
  });

  it("converts saved decimal strings into exact cents", async () => {
    const rows = [
      order("1", { total: "0.01" }),
      order("2", { total: "2.30" }),
      order("3", { total: "12.3400" }),
    ];
    const { client } = historicalClient({
      0: { data: page(rows.map((data, index) => ({ ordinal: index + 1, data }))), error: null },
    });

    await expect(loadHistoricalSalesEstimate(client, lastYear)).resolves.toMatchObject({
      connected: true,
      totalCents: 1465,
      orderCount: 3,
      components: { merchandiseCents: 1465, taxCents: 0, shippingCents: 0,
        recordedTotalCents: 1465, orderCount: 3, excludedOrderCount: 0 },
    });
  });

  it("reads every page with the saved-history cursor", async () => {
    const first = Array.from({ length: 50 }, (_, index) => ({
      ordinal: index + 1,
      data: order(String(index + 1), { total: "1.01" }),
    }));
    const second = [{ ordinal: 51, data: order("51", { total: "1.01" }) }];
    const { client, rpc } = historicalClient({
      0: { data: page(first, 50, 51), error: null },
      50: { data: page(second, null, 51), error: null },
    });

    await expect(loadHistoricalSalesEstimate(client, lastYear)).resolves.toMatchObject({
      connected: true,
      totalCents: 5151,
      orderCount: 51,
    });
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls.map(([, args]) => args.p_after)).toEqual([0, 50]);
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_limit: 50, p_filter: "all" });
  });

  it("hides a partial total when a later archive page fails", async () => {
    const { client } = historicalClient({
      0: { data: page([{ ordinal: 1, data: order("1") }], 1, 2), error: null },
      1: { data: null, error: { message: "Archive unavailable" } },
    });

    await expect(loadHistoricalSalesEstimate(client, lastYear)).resolves.toMatchObject({
      connected: false,
      totalCents: 0,
      orderCount: 0,
      components: null,
      message: expect.stringMatching(/unavailable/i),
    });
  });

  it("does not display a CAD estimate if an included order has another currency or fractional cents", async () => {
    for (const invalid of [
      order("2", { currency: "USD" }),
      order("2", { total: "2.001" }),
    ]) {
      const { client } = historicalClient({
        0: { data: page([
          { ordinal: 1, data: order("1") },
          { ordinal: 2, data: invalid },
        ]), error: null },
      });
      await expect(loadHistoricalSalesEstimate(client, lastYear)).resolves.toMatchObject({
        connected: false,
        totalCents: 0,
        orderCount: 0,
        components: null,
      });
    }
  });

  it("excludes archived orders whose arithmetic or component fields cannot support a breakdown", async () => {
    const rows = [
      order("1", { total: "10.00", cartTax: "0.50", shipping: "1.00" }),
      order("2", { arithmetic: null }),
      order("3", { arithmetic: { computedTotal: "1.00", totalDifference: "0.00",
        amountMatch: false, taxMatch: true, shippingMatch: true, discountMatch: true } }),
      order("4", { cartTax: null }),
    ];
    const { client } = historicalClient({
      0: { data: page(rows.map((data, index) => ({ ordinal: index + 1, data }))), error: null },
    });

    await expect(loadHistoricalSalesEstimate(client, lastYear)).resolves.toMatchObject({
      connected: true,
      totalCents: 1000,
      orderCount: 1,
      components: { merchandiseCents: 850, taxCents: 50, shippingCents: 100,
        recordedTotalCents: 1000, orderCount: 1, excludedOrderCount: 3 },
    });
  });
});
