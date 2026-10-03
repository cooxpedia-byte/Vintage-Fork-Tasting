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
    matchedBy: "name", totalCents: 1250, recordedTotal: null, currency: "CAD", ...overrides,
  };
}

function imported(overrides: Record<string, unknown> = {}) {
  return {
    source: "imported", orderId: "2002", orderNumber: "2002", status: "wc-completed",
    placedAt: "2025-10-01T10:00:00Z", customerName: "Grace Hopper",
    deliveryCity: "Calgary", postalCode: "T2P 1J9", totalCents: null,
    matchedBy: "city", recordedTotal: "22.50", currency: "CAD", ...overrides,
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
  it("normalizes the single query and preserves source and page offset", () => {
    expect(parseOrderSearchCriteria({ query: "  Ada   Lovelace  ", source: "imported", offset: 50 })).toEqual({
      query: "Ada Lovelace", source: "imported", offset: 50,
    });
  });

  it.each(["Ada", "#1001", "T5J 0N3", "Edmonton"])("accepts %s as a unified query", query => {
    expect(parseOrderSearchCriteria({ query })).toEqual({ query, source: "all", offset: 0 });
  });

  it.each([
    [{ query: "   " }, "Enter a name"],
    [{ query: "Ada\nLovelace" }, "Invalid search query"],
    [{ query: "x".repeat(101) }, "Search query is too long"],
    [{ query: "Ada", source: "other" }, "Invalid order source"],
    [{ query: "Ada", offset: -50 }, "Invalid result page"],
    [{ query: "Ada", offset: 49 }, "Invalid result page"],
    [{ query: "Ada", offset: 10050 }, "Invalid result page"],
    [{ query: "Ada", offset: 0.5 }, "Invalid result page"],
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
    ["unrecognized match reason", page([native({ matchedBy: "email" })])],
    ["missing match reason", page([native({ matchedBy: undefined })])],
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
  it("sends the normalized query, source, and page size to the scoped v2 RPC", async () => {
    const stub = clientResponse(page([imported()], { total: 51 }));
    const result = await loadOrderSearch(stub.client, {
      query: "  Grace   Hopper ", source: "imported", offset: 50,
    });
    expect(stub.rpc).toHaveBeenCalledExactlyOnceWith("vf_admin_order_search_v2", {
      p_query: "Grace Hopper",
      p_source: "imported", p_offset: 50, p_limit: ORDER_SEARCH_PAGE_SIZE,
    });
    expect(stub.abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
    expect(result.connected).toBe(true);
  });

  it("sends an order-number query without guessing another search field", async () => {
    const stub = clientResponse(page([native()]));
    await loadOrderSearch(stub.client, { query: "#1001" });
    expect(stub.rpc).toHaveBeenCalledWith("vf_admin_order_search_v2", {
      p_query: "#1001", p_source: "all", p_offset: 0,
      p_limit: ORDER_SEARCH_PAGE_SIZE,
    });
  });

  it("does not call the RPC for invalid criteria", async () => {
    const stub = clientResponse(page([]));
    const result = await loadOrderSearch(stub.client, { query: "Ada", offset: 1 });
    expect(stub.rpc).not.toHaveBeenCalled();
    expect(result).toMatchObject({ connected: false, rows: [], message: "Invalid result page." });
  });

  it("does not echo malformed response PII or upstream errors", async () => {
    const secret = "Sensitive Customer Name";
    const malformed = clientResponse(page([native({ customerName: `${secret}\n` })]));
    const result = await loadOrderSearch(malformed.client, { query: "Ada" });
    expect(result).toMatchObject({ connected: false, rows: [], total: 0,
      message: "Order search could not be loaded. Please try again." });
    expect(JSON.stringify(result)).not.toContain(secret);
  });

  it.each([
    ["42501", "This store account does not have access to order search."],
    ["PGRST000", "Order search could not be loaded. Please try again."],
  ])("handles RPC error %s", async (code, message) => {
    const stub = clientResponse(null, { code, message: "private provider detail" });
    const result = await loadOrderSearch(stub.client, { query: "Edmonton" });
    expect(result).toMatchObject({ connected: false, rows: [], message });
    expect(JSON.stringify(result)).not.toContain("private provider detail");
  });

  it("handles an RPC that throws", async () => {
    const rpc = vi.fn().mockReturnValue({ abortSignal: vi.fn().mockRejectedValue(Error("private transport detail")) });
    const result = await loadOrderSearch({ rpc } as unknown as SupabaseClient, { query: "T5J 0N3" });
    expect(result).toMatchObject({ connected: false, rows: [],
      message: "Order search could not be loaded. Please try again." });
    expect(JSON.stringify(result)).not.toContain("private transport detail");
  });
});
