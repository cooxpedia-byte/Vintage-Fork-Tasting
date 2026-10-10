import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CommerceAdminOverview } from "@/components/admin/CommerceAdminOverview";
import { summarizeSalesPeriod, type CommerceOverview } from "@/lib/admin/commerce";
import { unavailableTrafficOverview } from "@/lib/admin/traffic";

type SalesResult = Parameters<typeof summarizeSalesPeriod>[1];

function sales(overrides: Partial<SalesResult> = {}): SalesResult {
  return { connected: true, totalCents: 0, orderCount: 0, currency: "cad", message: null, ...overrides };
}

function overview(summary: ReturnType<typeof summarizeSalesPeriod>): CommerceOverview {
  return {
    connected: true,
    ordersConnected: true,
    inventoryConnected: true,
    customersConnected: true,
    subscriptionsConnected: true,
    productsConnected: true,
    fulfilmentCount: 0,
    customerCount: 0,
    subscriptionCount: 0,
    productCount: 0,
    draftProductCount: 0,
    recentOrders: [],
    inventoryAlerts: [],
    salesChannels: null,
    todaySales: {
      connected: false, totalCents: 0, orderCount: 0, currency: "cad", message: null,
      components: null, channels: null,
      startUtc: "2026-10-10T06:00:00.000Z", endUtc: "2026-10-10T13:00:00.000Z",
    },
    revenueBreakdown: {
      native: { merchandiseCents: 0, taxCents: 0, shippingCents: 0,
        refundsCents: 0, totalCents: 0, orderCount: 0 },
      historicalEstimate: null, combinedEstimateCents: null,
      historicalRequested: true, message: null,
    },
    ...summary,
  };
}

describe("Last Year sales coverage", () => {
  it("marks an empty connected archive unavailable and hides a misleading $0 amount", () => {
    const summary = summarizeSalesPeriod("last_year", sales(), sales());

    expect(summary).toMatchObject({
      salesConnected: false,
      salesSource: "native",
      netSalesCents: 0,
      orderCount: 0,
      salesMessage: expect.stringMatching(/archive has no completed or processing orders/i),
    });
    const html = renderToStaticMarkup(createElement(CommerceAdminOverview, {
      commerce: overview(summary), salesPeriod: "last_year", traffic: unavailableTrafficOverview(),
    }));
    expect(html).toContain("Recorded order total estimate");
    expect(html).toContain("An estimate is unavailable.");
    expect(html).toMatch(/class="admin-kpi-card admin-sales-card"><span>Recorded order total estimate<\/span><strong>—<\/strong>/);
  });

  it("labels a nonempty previous-store archive as an estimate", () => {
    expect(summarizeSalesPeriod("last_year", sales(), sales({ totalCents: 12345, orderCount: 3 }))).toEqual({
      netSalesCents: 12345,
      currency: "cad",
      orderCount: 3,
      salesConnected: true,
      salesSource: "native-and-imported-estimate",
      salesMessage: null,
    });
  });

  it("fails closed when native orders overlap the previous-store year", () => {
    expect(summarizeSalesPeriod(
      "last_year",
      sales({ totalCents: 2500, orderCount: 1 }),
      sales({ totalCents: 12345, orderCount: 3 }),
    )).toMatchObject({
      salesConnected: false,
      netSalesCents: 0,
      orderCount: 0,
      salesMessage: expect.stringMatching(/not yet been reconciled/i),
    });
  });

  it("returns native totals for a regular period without using the archive", () => {
    expect(summarizeSalesPeriod(
      "month_to_date",
      sales({ totalCents: 6789, orderCount: 2 }),
      sales({ connected: false, message: "Archive unavailable" }),
    )).toEqual({
      netSalesCents: 6789,
      currency: "cad",
      orderCount: 2,
      salesConnected: true,
      salesSource: "native",
      salesMessage: null,
    });
  });
});
