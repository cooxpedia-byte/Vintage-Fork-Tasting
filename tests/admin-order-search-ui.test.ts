import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrderSearchResult } from "@/lib/admin/order-search";

const stubs = vi.hoisted(() => ({
  staff: vi.fn(),
  commerce: vi.fn(),
  search: vi.fn(),
  orderPage: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireStaff: stubs.staff }));
vi.mock("@/lib/supabase/commerce-server", () => ({ authorizedCommerceClient: stubs.commerce }));
vi.mock("@/lib/admin/order-search", () => ({ loadOrderSearch: stubs.search }));
vi.mock("@/lib/admin/commerce", () => ({ loadOrderPage: stubs.orderPage }));
vi.mock("@/components/admin/ImportedOrders", () => ({ ImportedOrders: () => null }));
vi.mock("@/components/admin/CommerceAdminOverview", () => ({ OrderRows: () => null }));

import AdminOrderSearchPage from "@/app/admin/orders/search/page";
import AdminOrdersPage from "@/app/admin/orders/page";

const client = { connection: "store-owner-session" };
const nativeId = "10000000-0000-4000-8000-000000000001";
const result: OrderSearchResult = {
  connected: true,
  rows: [
    {
      source: "native", orderId: nativeId, orderNumber: "301", status: "processing",
      placedAt: "2026-10-01T18:30:00.000Z", customerName: "Ada Native",
      deliveryCity: "Edmonton", postalCode: "T5J 0N3", totalCents: 4512,
      recordedTotal: null, currency: "CAD",
    },
    {
      source: "imported", orderId: "902", orderNumber: "902", status: "wc-completed",
      placedAt: "2025-09-10T16:00:00.000Z", customerName: "Mina Archive",
      deliveryCity: "Calgary", postalCode: "T2P 1J9", totalCents: null,
      recordedTotal: "43.50", currency: "CAD",
    },
  ],
  total: 2, nextOffset: null, archiveSnapshotAt: "2026-09-11T02:08:51.000Z", message: null,
};

async function searchPage(params: Record<string, string | string[]> = {}) {
  return renderToStaticMarkup(await AdminOrderSearchPage({ searchParams: Promise.resolve(params) }));
}

beforeEach(() => {
  vi.clearAllMocks();
  stubs.staff.mockResolvedValue({ user: { id: "admin-1" }, role: "admin" });
  stubs.commerce.mockResolvedValue(client);
  stubs.search.mockResolvedValue(result);
  stubs.orderPage.mockResolvedValue({ connected: true, orders: [], nextCursor: null, total: 0, error: null });
});

describe("admin order search page", () => {
  it("requires an admin store session and prompts for criteria before querying", async () => {
    const html = await searchPage();
    expect(stubs.staff).toHaveBeenCalledExactlyOnceWith(["admin"]);
    expect(stubs.commerce).toHaveBeenCalledExactlyOnceWith("admin-1");
    expect(stubs.search).not.toHaveBeenCalled();
    expect(html).toContain("Enter a customer name, delivery postal code, or delivery city to begin.");
    expect(html).toContain('name="name"');
    expect(html).toContain('name="postal"');
    expect(html).toContain('name="city"');
    expect(html).toContain('name="source"');
  });

  it("passes trimmed criteria, source, and page offset to the search loader", async () => {
    stubs.search.mockResolvedValue({ ...result, rows: [result.rows[0]], total: 51, archiveSnapshotAt: null });
    const html = await searchPage({ name: " Ada ", postal: " T5J 0N3 ", city: " Edmonton ", source: "native", offset: "50" });
    expect(stubs.search).toHaveBeenCalledExactlyOnceWith(client, {
      name: "Ada", postal: "T5J 0N3", city: "Edmonton", source: "native", offset: 50,
    });
    expect(html).toContain('name="name" value="Ada"');
    expect(html).toContain('value="native" selected=""');
  });

  it("shows native and archived results with their delivery details and distinct order links", async () => {
    const html = await searchPage({ name: "Ada" });
    expect(html).toContain('href="/admin/orders/native/10000000-0000-4000-8000-000000000001"');
    expect(html).toContain('href="/admin/orders?source=imported&amp;id=902&amp;items=1"');
    expect(html).toContain("Ada Native");
    expect(html).toContain("Mina Archive");
    expect(html).toContain("T5J 0N3");
    expect(html).toContain("T2P 1J9");
    expect(html).toContain("$45.12");
    expect(html).toContain("CAD 43.50");
    expect(html).toContain("Previous-store records come from the saved archive snapshot");
    expect(html).toContain("payment and refund details are unverified");
  });

  it("preserves the search filters in previous and next page links", async () => {
    stubs.search.mockResolvedValue({ ...result, rows: [result.rows[1]], total: 101, nextOffset: 100 });
    const html = await searchPage({ name: " Ada ", city: "Edmonton", source: "imported", offset: "50" });
    expect(html).toContain("Showing 51–51 of 101");
    expect(html).toContain('href="/admin/orders/search?name=Ada&amp;city=Edmonton&amp;source=imported"');
    expect(html).toContain('href="/admin/orders/search?name=Ada&amp;city=Edmonton&amp;source=imported&amp;offset=100"');
  });

  it("shows a useful empty or error state without presenting stale orders", async () => {
    stubs.search.mockResolvedValueOnce({ ...result, rows: [], total: 0, archiveSnapshotAt: null });
    expect(await searchPage({ postal: "T5J" })).toContain("No orders match these details");
    stubs.search.mockResolvedValueOnce({ connected: false, rows: [], total: 0, nextOffset: null, archiveSnapshotAt: null, message: "Order search could not be loaded. Please try again." });
    const html = await searchPage({ postal: "T5J" });
    expect(html).toContain("Order search unavailable");
    expect(html).toContain("Order search could not be loaded. Please try again.");
    expect(html).not.toContain("Matching orders");
  });

  it("does not query orders after staff authorization fails", async () => {
    stubs.staff.mockRejectedValue(new Error("Redirect"));
    await expect(searchPage({ name: "Ada" })).rejects.toThrow("Redirect");
    expect(stubs.commerce).not.toHaveBeenCalled();
    expect(stubs.search).not.toHaveBeenCalled();
  });
});

it("links to the detail search from the main orders page", async () => {
  const html = renderToStaticMarkup(await AdminOrdersPage({ searchParams: Promise.resolve({}) }));
  expect(html).toContain('href="/admin/orders/search"');
  expect(html).toContain("Search both stores by customer name, delivery postal code, or delivery city.");
  expect(stubs.orderPage).toHaveBeenCalledOnce();
});
