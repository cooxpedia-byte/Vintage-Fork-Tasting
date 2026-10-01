import { AccountManager } from "@/components/admin/AccountManager";
import { mergeAccountDirectory } from "@/lib/admin/account-directory";
import { requireStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { User } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export default async function AdminAccountsPage() {
  await requireStaff(["admin"]);
  const admin = createAdminClient();
  const pageSize = 1000;
  type AccountInput = Parameters<typeof mergeAccountDirectory>[0];
  async function readRows<T>(table: string, columns: string) {
    const rows: T[] = [];
    for (let from = 0; from < 100000; from += pageSize) {
      const result = await admin.from(table).select(columns).order(columns.split(",")[0]).range(from, from + pageSize - 1);
      if (result.error || !result.data) throw new Error("Account directory read failed.");
      rows.push(...result.data as unknown as T[]);
      if (result.data.length < pageSize) return rows;
    }
    throw new Error("Account directory exceeds the supported size.");
  }
  async function readUsers() {
    const users: User[] = [];
    for (let page = 1; page <= 100; page += 1) {
      const result = await admin.auth.admin.listUsers({ page, perPage: pageSize });
      if (result.error || !result.data?.users) throw new Error("Account authentication read failed.");
      users.push(...result.data.users);
      if (result.data.users.length < pageSize) return users;
    }
    throw new Error("Account directory exceeds the supported size.");
  }
  let accounts;
  try {
    const [profiles, wallets, mobileLinks, storeLinks, users] = await Promise.all([
      readRows<AccountInput["profiles"][number]>("profiles", "id,display_name,role,created_at"),
      readRows<AccountInput["wallets"][number]>("merchant_wallets", "id,owner_user_id,balance"),
      readRows<AccountInput["mobileLinks"][number]>("mobile_customer_links", "mobile_auth_user_id,owner_user_id"),
      readRows<AccountInput["storeLinks"][number]>("gold_leaves_store_links_v1", "store_profile_id,owner_user_id,wallet_id"),
      readUsers(),
    ]);
    accounts = mergeAccountDirectory({ profiles, wallets, mobileLinks, storeLinks, users });
  } catch {
    return <main className="admin-page"><div className="admin-page-heading"><h1>Accounts</h1></div><div className="notice error" role="alert">Account details are temporarily unavailable. Reload this page to try again. Connection and balance information could not be verified.</div></main>;
  }
  return <main className="admin-page"><div className="admin-page-heading"><div><p className="eyebrow">People</p><h1>Accounts</h1><p>Tasting identities, original Gold Leaves and verified store connections. Store sign-in credentials are managed separately.</p></div></div><AccountManager accounts={accounts} /></main>;
}
