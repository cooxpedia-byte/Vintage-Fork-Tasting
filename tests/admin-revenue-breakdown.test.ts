import { describe, expect, it } from "vitest";
import { summarizeRevenueBreakdown } from "@/lib/admin/commerce";

type Native = Parameters<typeof summarizeRevenueBreakdown>[1];
type Historical = NonNullable<Parameters<typeof summarizeRevenueBreakdown>[2]>;

function native(overrides: Partial<Native> = {}): Native {
  return {
    connected: true, totalCents: 12345, orderCount: 2, currency: "cad", message: null,
    components: { merchandiseCents: 10000, taxCents: 1000, shippingCents: 450,
      refundsCents: 105, totalCents: 12345, orderCount: 2 },
    earliestOrderAt: Date.parse("2026-09-01T00:00:00.000Z"), newStoreProvenance: true,
    ...overrides,
  };
}

function historical(overrides: Partial<Historical> = {}): Historical {
  return {
    connected: true, totalCents: 9000, orderCount: 3, currency: "cad", message: null,
    components: { merchandiseCents: 8000, taxCents: 400, shippingCents: 600,
      recordedTotalCents: 9000, orderCount: 3, excludedOrderCount: 0, snapshotAt: "2026-09-01T00:00:00.000Z" },
    latestOrderAt: Date.parse("2026-08-31T23:59:59.000Z"),
    ...overrides,
  };
}

describe("admin revenue breakdown summary", () => {
  it("keeps new-store and previous-store components separate and computes a labeled combined estimate", () => {
    const result = summarizeRevenueBreakdown("last_month", native(), historical());
    expect(result).toMatchObject({
      historicalRequested: true,
      native: { totalCents: 12345, taxCents: 1000, shippingCents: 450, refundsCents: 105 },
      historicalEstimate: { recordedTotalCents: 9000, taxCents: 400, shippingCents: 600 },
      combinedEstimateCents: 21345,
      message: null,
    });
    expect(summarizeRevenueBreakdown("year_to_date", native(), historical()).combinedEstimateCents).toBe(21345);
  });

  it("does not combine overlapping or unverified purchase sources", () => {
    for (const result of [
      summarizeRevenueBreakdown("last_month", native(), historical({ latestOrderAt: Date.parse("2026-09-01T00:00:00.000Z") })),
      summarizeRevenueBreakdown("last_month", native({ newStoreProvenance: false }), historical()),
    ]) {
      expect(result.native?.totalCents).toBe(12345);
      expect(result.historicalEstimate?.recordedTotalCents).toBe(9000);
      expect(result.combinedEstimateCents).toBeNull();
      expect(result.message).toMatch(/not been confirmed as separate purchases/i);
    }
  });

  it("leaves a missing archive estimate unavailable instead of calling it zero", () => {
    const result = summarizeRevenueBreakdown("last_year", native(), historical({
      totalCents: 0, orderCount: 0,
      components: { merchandiseCents: 0, taxCents: 0, shippingCents: 0,
        recordedTotalCents: 0, orderCount: 0, excludedOrderCount: 0, snapshotAt: "2026-09-01T00:00:00.000Z" },
      latestOrderAt: null,
    }));
    expect(result.historicalEstimate).toBeNull();
    expect(result.combinedEstimateCents).toBeNull();
    expect(result.message).toMatch(/archive has no completed or processing orders/i);
  });

  it("uses only native figures for periods without a historical archive request", () => {
    const result = summarizeRevenueBreakdown("month_to_date", native(), historical());
    expect(result).toMatchObject({
      historicalRequested: false, native: { totalCents: 12345 },
      historicalEstimate: null, combinedEstimateCents: null,
    });
  });
});
