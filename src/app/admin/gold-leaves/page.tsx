import { GoldLeavesManager } from "@/components/admin/GoldLeavesManager";
import { mergeAdminAccounts } from "@/lib/admin/accounts";
import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { User } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
type LedgerRow = { id: string; wallet_id: string; entry_type: string; leaves_delta: number | string; description: string | null; source: string | null; created_at: string };

export default async function AdminGoldLeavesPage() {
  await requireStaff(["admin"]);
  const admin = createAdminClient();
  const pageSize = 1000;
  type AccountInput = Parameters<typeof mergeAdminAccounts>[0];
  async function readRows<T>(table: string, columns: string) {
    const rows: T[] = [];
    for (let from = 0; from < 100000; from += pageSize) {
      const result = await admin.from(table).select(columns).order("id").range(from, from + pageSize - 1);
      if (result.error || !result.data) throw new Error("Gold Leaves details could not be verified.");
      rows.push(...result.data as unknown as T[]);
      if (result.data.length < pageSize) return rows;
    }
    throw new Error("Gold Leaves directory exceeds the supported size.");
  }
  async function readUsers() {
    const users: User[] = [];
    for (let page = 1; page <= 100; page += 1) {
      const result = await admin.auth.admin.listUsers({ page, perPage: pageSize });
      if (result.error || !result.data?.users) throw new Error("Account details could not be verified.");
      users.push(...result.data.users);
      if (result.data.users.length < pageSize) return users;
    }
    throw new Error("Gold Leaves directory exceeds the supported size.");
  }
  let accounts: ReturnType<typeof mergeAdminAccounts>, ledger: Array<LedgerRow & { formattedDelta: string; positive: boolean }>;
  try {
    const [profiles, wallets, users, activity] = await Promise.all([
      readRows<AccountInput["profiles"][number]>("profiles", "id,display_name,role,created_at"),
      readRows<AccountInput["wallets"][number]>("merchant_wallets", "id,owner_user_id,balance,refund_debt"),
      readUsers(),
      admin.from("merchant_ledger_entries").select("id,wallet_id,entry_type,leaves_delta,description,source,created_at").order("created_at", { ascending: false }).limit(12),
    ]);
    if (activity.error || !activity.data) throw new Error("Gold Leaves activity could not be verified.");
    accounts = mergeAdminAccounts({ profiles, wallets, users });
    ledger = (activity.data as LedgerRow[]).map((entry) => {
      if ((typeof entry.leaves_delta === "number" && !Number.isSafeInteger(entry.leaves_delta)) || !/^-?\d+$/.test(String(entry.leaves_delta))) throw new Error("Gold Leaves activity could not be verified.");
      const delta = BigInt(entry.leaves_delta);
      return { ...entry, positive: delta > 0n, formattedDelta: `${delta > 0n ? "+" : ""}${delta.toLocaleString("en-CA")}` };
    });
  } catch {
    return <main className="admin-page"><div className="admin-page-heading"><h1>Gold Leaves</h1></div><div className="notice error" role="alert">Gold Leaves balances and activity could not be verified. Reload this page to try again.</div></main>;
  }
  const accountByWallet = new Map(accounts.filter((account) => account.walletId).map((account) => [account.walletId, account]));
  const spendable = accounts.reduce((sum, account) => sum + BigInt(account.goldLeaves), 0n);
  const debt = accounts.reduce((sum, account) => sum + BigInt(account.refundDebt), 0n);
  return <main className="admin-page"><div className="admin-page-heading"><div><p className="eyebrow">Gold Leaves wallets</p><h1>Gold Leaves</h1><p>Customer balances and the permanent ledger for checkout rewards and manual credits.</p></div></div><section className="admin-kpi-grid admin-kpi-grid--three"><article className="admin-kpi-card"><span>Spendable Leaves</span><strong>{spendable.toLocaleString("en-CA")}</strong><small>Across {accountByWallet.size.toLocaleString("en-CA")} wallets</small></article><article className="admin-kpi-card"><span>Refund debt</span><strong>{debt.toLocaleString("en-CA")}</strong><small>Future credits repay this before becoming spendable</small></article><article className="admin-kpi-card"><span>Net Leaves</span><strong>{(spendable - debt).toLocaleString("en-CA")}</strong><small>Spendable Leaves minus refund debt</small></article></section><div className="admin-loyalty-grid"><GoldLeavesManager accounts={accounts} /><section className="admin-panel"><div className="admin-panel-heading"><div><p className="eyebrow">Ledger</p><h2>Recent activity</h2></div></div><div className="admin-ledger-list">{ledger.map((entry) => { const account = accountByWallet.get(entry.wallet_id); return <article key={entry.id}><span className={entry.positive ? "is-positive" : "is-negative"}>{entry.formattedDelta}</span><div><strong>{account?.displayName ?? "Account"}</strong><small>{entry.description || entry.entry_type} · {entry.source || "Gold Leaves ledger"}</small></div><time>{new Date(entry.created_at).toLocaleDateString("en-CA", { month: "short", day: "numeric" })}</time></article>; })}{!ledger.length && <div className="empty-state"><strong>No ledger activity yet</strong><p>Recorded credits and checkout activity will appear here.</p></div>}</div></section></div></main>;
}
