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

function html(commerce: CommerceOverview, salesPeriod: "month_to_date" | "last_year") {
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
    expect(output).not.toContain("$123.45");
  });
});
