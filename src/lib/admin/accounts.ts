export type AdminAccount = {
  userId: string;
  email: string;
  displayName: string;
  role: "customer" | "host" | "admin";
  joinedAt: string;
  walletId: string | null;
  goldLeaves: string;
  refundDebt: string;
};

type ProfileRow = { id: string; display_name: string | null; role: AdminAccount["role"]; created_at: string };
type WalletRow = { id: string; owner_user_id: string; balance: number | string; refund_debt: number | string };
type AuthUser = { id: string; email?: string | null };

/** Preserve exact bigint values; never silently round a balance received as a JS number. */
export function leavesValue(value: number | string): string {
  if ((typeof value === "number" && !Number.isSafeInteger(value)) || !/^\d+$/.test(String(value))) {
    throw new Error("Gold Leaves balance could not be verified.");
  }
  const result = BigInt(value);
  if (result > 9223372036854775807n) throw new Error("Gold Leaves balance could not be verified.");
  return result.toString();
}

export function mergeAdminAccounts(input: { profiles: ProfileRow[]; wallets: WalletRow[]; users: AuthUser[] }): AdminAccount[] {
  const users = new Map(input.users.map((row) => [row.id, row]));
  const wallets = new Map(input.wallets.map((row) => [row.owner_user_id, row]));
  const profileIds = new Set(input.profiles.map((row) => row.id));
  if (wallets.size !== input.wallets.length || input.wallets.some((row) => !profileIds.has(row.owner_user_id))) {
    throw new Error("Gold Leaves wallet ownership could not be verified.");
  }
  return input.profiles.map((profile): AdminAccount => {
    // Canonical owner IDs are authoritative. Email text never links two accounts.
    const wallet = wallets.get(profile.id);
    const goldLeaves = wallet ? leavesValue(wallet.balance) : "0";
    const refundDebt = wallet ? leavesValue(wallet.refund_debt) : "0";
    if (goldLeaves !== "0" && refundDebt !== "0") throw new Error("Gold Leaves balances are inconsistent.");
    return {
      userId: profile.id,
      email: users.get(profile.id)?.email ?? "Email unavailable",
      displayName: profile.display_name || "Unnamed account",
      role: profile.role,
      joinedAt: profile.created_at,
      walletId: wallet?.id ?? null,
      goldLeaves,
      refundDebt,
    };
  }).sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export type AwardIntent = { walletId: string; amount: number; reason: string };
export type PendingAward = AwardIntent & { requestId: string };

/** Keep the same key after an uncertain response; a changed intent is a new action. */
export function awardRequest(previous: PendingAward | null, intent: AwardIntent, newId: () => string): PendingAward {
  if (previous && previous.walletId === intent.walletId && previous.amount === intent.amount && previous.reason === intent.reason) return previous;
  return { ...intent, requestId: newId() };
}
