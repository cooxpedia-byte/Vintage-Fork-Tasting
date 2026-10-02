import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import {
  loadOrderSearch,
  ORDER_SEARCH_PAGE_SIZE,
  parseOrderSearchCriteria,
  parseOrderSearchResponse,
} from "@/lib/admin/order-search";

const snapshotAt = "2026-10-01T12:00:00Z";

function native(overrides: Record<string, unknown> = {}) {
  return {
    source: "native", orderId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    orderNumber: "1001", status: "paid", placedAt: "2026-10-01T10:00:00Z",
    customerName: "Ada Lovelace", deliveryCity: "Edmonton", postalCode: "T5J 0N3",
    totalCents: 1250, recordedTotal: null, currency: "CAD", ...overrides,
  };
}

function imported(overrides: Record<string, unknown> = {}) {
  return {
    source: "imported", orderId: "2002", orderNumber: "2002", status: "wc-completed",
    placedAt: "2025-10-01T10:00:00Z", customerName: "Grace Hopper",
    deliveryCity: "Calgary", postalCode: "T2P 1J9", totalCents: null,
    recordedTotal: "22.50", currency: "CAD", ...overrides,
  };
}

function page(rows: unknown[], overrides: Record<string, unknown> = {}) {
  return { kind: "order-search", rows, total: rows.length, nextOffset: null,
    archiveSnapshotAt: snapshotAt, ...overrides };
}

function clientResponse(data: unknown, error: unknown = null) {
  const abortSignal = vi.fn().mockResolvedValue({ data, error });
  const rpc = vi.fn().mockReturnValue({ abortSignal });
  return { client: { rpc } as unknown as SupabaseClient, rpc, abortSignal };
}

describe("admin order search criteria", () => {
  it("trims and combines name, delivery postal code, and city", () => {
    expect(parseOrderSearchCriteria({ name: "  Ada   Lovelace  ", postal: "  T5J  0N3  ",
      city: "  Fort   Saskatchewan ", source: "imported", offset: 50 })).toEqual({
      name: "Ada Lovelace", postal: "T5J 0N3", city: "Fort Saskatchewan",
      source: "imported", offset: 50,
    });
  });

  it.each([
    [{ name: "Ada" }, { name: "Ada", postal: "", city: "", source: "all", offset: 0 }],
    [{ postal: "T5J 0N3" }, { name: "", postal: "T5J 0N3", city: "", source: "all", offset: 0 }],
    [{ city: "Edmonton" }, { name: "", postal: "", city: "Edmonton", source: "all", offset: 0 }],
  ] as const)("accepts a single search field", (input, expected) => {
    expect(parseOrderSearchCriteria(input)).toEqual(expected);
  });

  it.each([
    [{ name: "   " }, "Enter a name"],
    [{ name: "Ada\nLovelace" }, "Invalid search query"],
    [{ postal: "T5J%" }, "Invalid delivery postal code"],
    [{ city: "x".repeat(101) }, "Search query is too long"],
    [{ name: "Ada", source: "other" }, "Invalid order source"],
    [{ name: "Ada", offset: -50 }, "Invalid result page"],
    [{ name: "Ada", offset: 49 }, "Invalid result page"],
    [{ name: "Ada", offset: 10050 }, "Invalid result page"],
    [{ name: "Ada", offset: 0.5 }, "Invalid result page"],
  ])("rejects invalid search input before querying", (input, message) => {
    expect(() => parseOrderSearchCriteria(input as Parameters<typeof parseOrderSearchCriteria>[0]))
      .toThrow(message);
  });
});

describe("admin order search response", () => {
  it("parses mixed native and imported orders with source-specific amounts", () => {
    expect(parseOrderSearchResponse(page([native(), imported()]), "all", 0)).toEqual({
      connected: true, rows: [native(), imported()], total: 2, nextOffset: null,
      archiveSnapshotAt: snapshotAt, message: null,
    });
  });

  it("accepts a full result page and its next offset", () => {
    const rows = Array.from({ length: ORDER_SEARCH_PAGE_SIZE }, (_, index) =>
      native({ orderId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        orderNumber: String(index + 1) }));
    const parsed = parseOrderSearchResponse(page(rows, { total: 51, nextOffset: 50 }), "native", 0);
    expect(parsed.rows).toHaveLength(50);
    expect(parsed.total).toBe(51);
    expect(parsed.nextOffset).toBe(50);
  });

  it.each([
    ["duplicate", page([native(), native()])],
    ["wrong source", page([imported()])],
    ["control character in customer name", page([native({ customerName: "Ada\nLovelace" })])],
    ["control character in delivery city", page([native({ deliveryCity: "Edmon\u0000ton" })])],
    ["invalid date", page([native({ placedAt: "2026-13-01T10:00:00Z" })])],
    ["date without timezone", page([native({ placedAt: "2026-10-01T10:00:00" })])],
    ["mixed native amount", page([native({ recordedTotal: "12.50" })])],
    ["mixed imported amount", page([imported({ totalCents: 1250 })])],
    ["changed imported reference", page([imported({ orderNumber: "2003" })])],
    ["missing archive snapshot", page([imported()], { archiveSnapshotAt: null })],
  ])("fails closed on %s", (_case, response) => {
    expect(() => parseOrderSearchResponse(response, _case === "wrong source" ? "native" : "all", 0)).toThrow();
  });

  it.each([
    ["too many rows", page(Array.from({ length: 51 }, () => native()))],
    ["total smaller than returned window", page([native()], { total: 50 })],
    ["next offset without rows", page([], { total: 100, nextOffset: 50 })],
    ["next offset skips a page", page([native()], { total: 200, nextOffset: 100 })],
    ["next offset past total", page([native()], { total: 50, nextOffset: 50 })],
  ])("rejects %s", (_case, response) => {
    const offset = _case === "total smaller than returned window" ? 50 : 0;
    expect(() => parseOrderSearchResponse(response, "all", offset)).toThrow();
  });
});

describe("admin order search RPC", () => {
  it("sends combined normalized criteria, source, and page size to the scoped RPC", async () => {
    const stub = clientResponse(page([imported()], { total: 51 }));
    const result = await loadOrderSearch(stub.client, {
      name: "  Grace   Hopper ", postal: " T2P 1J9 ", city: " Calgary ",
      source: "imported", offset: 50,
    });
    expect(stub.rpc).toHaveBeenCalledExactlyOnceWith("vf_admin_order_search_v1", {
      p_name: "Grace Hopper", p_postal: "T2P 1J9", p_city: "Calgary",
      p_source: "imported", p_offset: 50, p_limit: ORDER_SEARCH_PAGE_SIZE,
    });
    expect(stub.abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
    expect(result.connected).toBe(true);
  });

  it("sends null for unused search fields", async () => {
    const stub = clientResponse(page([native()]));
    await loadOrderSearch(stub.client, { name: "Ada" });
    expect(stub.rpc).toHaveBeenCalledWith("vf_admin_order_search_v1", {
      p_name: "Ada", p_postal: null, p_city: null, p_source: "all", p_offset: 0,
      p_limit: ORDER_SEARCH_PAGE_SIZE,
    });
  });

  it("does not call the RPC for invalid criteria", async () => {
    const stub = clientResponse(page([]));
    const result = await loadOrderSearch(stub.client, { name: "Ada", offset: 1 });
    expect(stub.rpc).not.toHaveBeenCalled();
    expect(result).toMatchObject({ connected: false, rows: [], message: "Invalid result page." });
  });

  it("does not echo malformed response PII or upstream errors", async () => {
    const secret = "Sensitive Customer Name";
    const malformed = clientResponse(page([native({ customerName: `${secret}\n` })]));
    const result = await loadOrderSearch(malformed.client, { name: "Ada" });
    expect(result).toMatchObject({ connected: false, rows: [], total: 0,
      message: "Order search could not be loaded. Please try again." });
    expect(JSON.stringify(result)).not.toContain(secret);
  });

  it.each([
    ["42501", "This store account does not have access to order search."],
    ["PGRST000", "Order search could not be loaded. Please try again."],
  ])("handles RPC error %s", async (code, message) => {
    const stub = clientResponse(null, { code, message: "private provider detail" });
    const result = await loadOrderSearch(stub.client, { city: "Edmonton" });
    expect(result).toMatchObject({ connected: false, rows: [], message });
    expect(JSON.stringify(result)).not.toContain("private provider detail");
  });

  it("handles an RPC that throws", async () => {
    const rpc = vi.fn().mockReturnValue({ abortSignal: vi.fn().mockRejectedValue(Error("private transport detail")) });
    const result = await loadOrderSearch({ rpc } as unknown as SupabaseClient, { postal: "T5J 0N3" });
    expect(result).toMatchObject({ connected: false, rows: [],
      message: "Order search could not be loaded. Please try again." });
    expect(JSON.stringify(result)).not.toContain("private transport detail");
  });
});
