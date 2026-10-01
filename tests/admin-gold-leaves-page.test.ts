import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
const stubs = vi.hoisted(() => ({ requireStaff: vi.fn(), createAdminClient: vi.fn(), manager: vi.fn<(props: { accounts: unknown[] }) => null>(() => null) }));
vi.mock("@/lib/auth", () => ({ requireStaff: stubs.requireStaff }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: stubs.createAdminClient }));
vi.mock("@/components/admin/GoldLeavesManager", () => ({ GoldLeavesManager: stubs.manager }));
import Page from "@/app/admin/gold-leaves/page";
beforeEach(() => { vi.clearAllMocks(); stubs.requireStaff.mockResolvedValue({ role: "admin" }); });
function directory(failTable?: string) {
  const profiles = Array.from({ length: 1001 }, (_, index) => ({ id: `owner-${index}`, display_name: `Synthetic ${index}`, role: "customer", created_at: "2026-01-01" }));
  const wallets = profiles.map((p, index) => ({ id: `wallet-${index}`, owner_user_id: p.id, balance: index === 1000 ? 0 : 1, refund_debt: index === 1000 ? 90 : 0 }));
  const ranges: Array<{ table: string; from: number }> = [];
  const rows: Record<string, unknown[]> = { profiles, merchant_wallets: wallets };
  const from = vi.fn((table: string) => {
    if (!["profiles", "merchant_wallets", "merchant_ledger_entries"].includes(table)) throw new Error("Retired authority queried");
    const builder = {
      select: () => builder, order: () => builder,
      range: async (start: number, end: number) => {
        ranges.push({ table, from: start });
        return table === failTable ? { data: null, error: { message: "Offline" } } : { data: rows[table].slice(start, end + 1), error: null };
      },
      limit: async () => table === failTable ? { data: null, error: { message: "Offline" } } : { data: [{ id: "ledger-1", wallet_id: "wallet-1000", entry_type: "woocommerce_refund_reversal", leaves_delta: -90, description: "Synthetic refund", source: "store", created_at: "2026-01-01" }], error: null },
    };
    return builder;
  });
  const listUsers = vi.fn(async ({ page, perPage }: { page: number; perPage: number }) => ({ data: { users: profiles.slice((page - 1) * perPage, page * perPage).map(p => ({ id: p.id, email: `${p.id}@example.invalid` })) }, error: null }));
  stubs.createAdminClient.mockReturnValue({ from, auth: { admin: { listUsers } } });
  return { ranges, listUsers, from };
}
it("loads every wallet and identity page and reports spendable, debt, net and signed activity", async () => {
  const mock = directory(); const html = renderToStaticMarkup(await Page());
  expect(stubs.requireStaff).toHaveBeenCalledExactlyOnceWith(["admin"]);
  expect(mock.ranges).toEqual(expect.arrayContaining([{ table: "profiles", from: 1000 }, { table: "merchant_wallets", from: 1000 }]));
  expect(mock.listUsers).toHaveBeenCalledTimes(2); expect(stubs.manager.mock.calls[0][0].accounts).toHaveLength(1001);
  expect(html).toContain("Spendable Leaves"); expect(html).toContain("1,000"); expect(html).toContain("Refund debt"); expect(html).toContain("90"); expect(html).toContain("910"); expect(html).toContain("-90");
});
it.each(["merchant_wallets", "merchant_ledger_entries", "profiles"])("hides awards and refuses false zero totals when %s cannot be read", async table => {
  directory(table); const html = renderToStaticMarkup(await Page()); expect(html).toContain("could not be verified"); expect(html).not.toContain("Spendable Leaves"); expect(stubs.manager).not.toHaveBeenCalled();
});
it("does not query privileged wallet data when staff authorization fails", async () => {
  stubs.requireStaff.mockRejectedValue(new Error("Redirect")); await expect(Page()).rejects.toThrow("Redirect"); expect(stubs.createAdminClient).not.toHaveBeenCalled();
});
