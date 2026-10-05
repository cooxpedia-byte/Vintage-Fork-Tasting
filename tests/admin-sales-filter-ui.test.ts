import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CommerceAdminOverview } from "@/components/admin/CommerceAdminOverview";
import type { CommerceOverview } from "@/lib/admin/commerce";

const overview: CommerceOverview = {
  connected: true,
  ordersConnected: true,
  inventoryConnected: true,
  customersConnected: true,
  subscriptionsConnected: true,
  productsConnected: true,
  salesConnected: true,
  salesSource: "native",
  salesMessage: null,
  netSalesCents: 12345,
  revenueBreakdown: {
    native: { merchandiseCents: 10000, taxCents: 1000, shippingCents: 450,
      refundsCents: 105, totalCents: 12345, orderCount: 2 },
    historicalEstimate: null, combinedEstimateCents: null,
    historicalRequested: false, message: null,
  },
  currency: "cad",
  orderCount: 2,
  fulfilmentCount: 0,
  customerCount: 0,
  subscriptionCount: 0,
  productCount: 0,
  draftProductCount: 0,
  recentOrders: [],
  inventoryAlerts: [],
};

function html(commerce: CommerceOverview, salesPeriod: "month_to_date" | "last_month" | "last_year") {
  return renderToStaticMarkup(createElement(CommerceAdminOverview, { commerce, salesPeriod }));
}

describe("admin net sales filter", () => {
  it("offers all seven sales periods and marks the current selection", () => {
    const output = html(overview, "month_to_date");
    expect(output).toContain('<form class="admin-sales-filter admin-sales-filter-toolbar" action="/admin" method="get"');
    expect(output).toContain('name="salesPeriod"');
    for (const label of ["Day", "Week to date", "Month to date", "Last week", "Last month", "Year to date", "Last year"]) {
      expect(output).toContain(`>${label}</option>`);
    }
    expect(output).toContain('value="month_to_date" selected=""');
    expect(output).toContain("Paid order totals less refunds, including tax and shipping.");
    expect(output).toContain("Average order value (AOV)");
    expect(output).toContain("$61.73");
    expect(output).toContain("Month to date · 2 paid orders");
    expect(output).toContain("Net sales per paid order, including tax and shipping, after refunds.");
    expect(output).toContain("Revenue breakdown");
    expect(output).toContain("Tax charged (GST/HST)</dt><dd>$10.00");
    expect(output).toContain("Shipping charged</dt><dd>$4.50");
    expect(output).toContain("Less refunds</dt><dd>-$1.05");
    expect(output).toContain("Net revenue, including tax and shipping</dt><dd>$123.45");
  });

  it("labels previous-store totals as an estimate and shows the source warning", () => {
    const output = html({
      ...overview,
      salesSource: "native-and-imported-estimate" as CommerceOverview["salesSource"],
      salesMessage: "Historical figures are based on imported records.",
    }, "last_year");
    expect(output).toContain("Recorded order total estimate");
    expect(output).toContain("2 recorded orders · Last year");
    expect(output).toContain("Previous-store completed and processing order totals before refunds; payments and refunds are unverified.");
    expect(output).toContain("Historical figures are based on imported records.");
    expect(output).toContain("Includes previous-store orders.");
    expect(output).toContain("Average recorded order value estimate");
    expect(output).toContain("Last year · 2 recorded orders");
    expect(output).toContain("Recorded total per completed or processing order, before unverified refunds.");
    expect(output).toContain('value="last_year" selected=""');
  });

  it("shows the historical payment and refund caveat only once", () => {
    const output = html({
      ...overview,
      salesSource: "native-and-imported-estimate" as CommerceOverview["salesSource"],
      salesMessage: null,
    }, "last_year");
    expect(output.match(/payments and refunds are unverified/g)).toHaveLength(1);
  });

  it("hides Last Year amount when the historical source is unavailable", () => {
    const output = html({ ...overview, salesSource: "native", salesMessage: "Historical records are unavailable." }, "last_year");
    expect(output).toContain("Historical records are unavailable.");
    expect(output).toMatch(/class="admin-kpi-card admin-sales-card"><span>Recorded order total estimate<\/span><strong>—<\/strong>/);
    expect(output).toMatch(/class="admin-kpi-card admin-aov-card"><span>Average recorded order value estimate<\/span><strong>—<\/strong>/);
  });

  it("shows no AOV when the selected period has no paid orders", () => {
    const output = html({ ...overview, netSalesCents: 0, orderCount: 0 }, "month_to_date");
    expect(output).toMatch(/class="admin-kpi-card admin-aov-card"><span>Average order value \(AOV\)<\/span><strong>—<\/strong>/);
    expect(output).toContain("No paid orders in this period.");
  });

  it("shows no AOV when the sales connection fails", () => {
    const output = html({ ...overview, salesConnected: false, salesMessage: "Sales unavailable." }, "month_to_date");
    expect(output).toMatch(/class="admin-kpi-card admin-aov-card"><span>Average order value \(AOV\)<\/span><strong>—<\/strong>/);
    expect(output).toContain("Month to date · Sales unavailable");
  });

  it("shows previous-store components separately and a clearly labeled combined estimate", () => {
    const output = html({ ...overview,
      revenueBreakdown: {
        ...overview.revenueBreakdown,
        historicalRequested: true,
        historicalEstimate: { merchandiseCents: 8000, taxCents: 400, shippingCents: 600,
          recordedTotalCents: 9000, orderCount: 3, excludedOrderCount: 2, snapshotAt: "2026-09-11T02:08:51.000Z" },
        combinedEstimateCents: 21345,
      },
    }, "last_month");
    expect(output).toContain("New-store sales only. The previous-store estimate is below.");
    expect(output).toContain("Previous-store recorded estimate");
    expect(output).toContain("Saved archive snapshot: Sep 11, 2026 UTC");
    expect(output).toContain("Tax recorded (GST/HST)</dt><dd>$4.00");
    expect(output).toContain("Shipping recorded</dt><dd>$6.00");
    expect(output).toContain("Refunds</dt><dd>—");
    expect(output).toContain("2 archived orders could not be included in this estimate.");
    expect(output).toContain("Combined recorded estimate");
    expect(output).toContain("$213.45");
    expect(output).toContain("payments and refunds are unverified");
  });
});
