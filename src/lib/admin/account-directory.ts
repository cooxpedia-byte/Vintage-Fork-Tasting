export type AccountDirectoryEntry = {
  userId: string;
  email: string;
  displayName: string;
  role: "customer" | "host" | "admin";
  joinedAt: string;
  authStatus: "email_verified" | "email_unconfirmed" | "unavailable";
  walletId: string | null;
  walletStatus: "available" | "missing" | "unavailable";
  goldLeaves: number | null;
  storeConnection: "connected" | "not_connected" | "needs_review";
  mobileConnection: "connected" | "not_connected";
};

type ProfileRow = { id: string; display_name: string | null; role: AccountDirectoryEntry["role"]; created_at: string };
type WalletRow = { id: string; owner_user_id: string; balance: number | string };
type MobileLinkRow = { mobile_auth_user_id: string; owner_user_id: string };
type StoreLinkRow = { store_profile_id: string; owner_user_id: string; wallet_id: string };
type AuthUser = { id: string; email?: string | null; email_confirmed_at?: string | null };

function safeBalance(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !/^-?\d+$/.test(value)) return null;
  const result = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(result) ? result : null;
}

/** Every relationship uses verified IDs. Matching email text is never a link. */
export function mergeAccountDirectory(input: {
  profiles: ProfileRow[];
  users: AuthUser[];
  wallets: WalletRow[];
  mobileLinks: MobileLinkRow[];
  storeLinks: StoreLinkRow[];
}): AccountDirectoryEntry[] {
  const users = new Map(input.users.map((row) => [row.id, row]));
  const wallets = new Map(input.wallets.map((row) => [row.owner_user_id, row]));
  if (wallets.size !== input.wallets.length) throw new Error("Account wallet ownership is inconsistent.");
  const mobileById = new Map(input.mobileLinks.map((row) => [row.mobile_auth_user_id, row]));
  const storeByOwner = new Map(input.storeLinks.map((row) => [row.owner_user_id, row]));
  if (mobileById.size !== input.mobileLinks.length || storeByOwner.size !== input.storeLinks.length) {
    throw new Error("Account connection ownership is inconsistent.");
  }
  return input.profiles.map((profile): AccountDirectoryEntry => {
    const user = users.get(profile.id);
    const wallet = wallets.get(profile.id);
    const balance = wallet ? safeBalance(wallet.balance) : null;
    const mobileLinks = input.mobileLinks.filter((row) => row.owner_user_id === profile.id);
    const storeLink = storeByOwner.get(profile.id);
    const storeMobile = storeLink ? mobileById.get(storeLink.store_profile_id) : undefined;
    const connectionConflict = Boolean(
      storeLink && (!wallet || storeLink.wallet_id !== wallet.id || storeMobile?.owner_user_id !== profile.id),
    ) || Boolean(mobileLinks.length && !wallet);
    return {
      userId: profile.id,
      email: user?.email ?? "Email unavailable",
      displayName: profile.display_name || "Unnamed account",
      role: profile.role,
      joinedAt: profile.created_at,
      authStatus: !user ? "unavailable" : user.email_confirmed_at ? "email_verified" : "email_unconfirmed",
      walletId: wallet?.id ?? null,
      walletStatus: !wallet ? "missing" : balance === null ? "unavailable" : "available",
      goldLeaves: balance,
      // Store and mobile use the same Auth project. The bridge already accepts
      // existing mobile mappings, even before an explicit store row is created.
      storeConnection: connectionConflict ? "needs_review" : storeLink || mobileLinks.length ? "connected" : "not_connected",
      mobileConnection: mobileLinks.length ? "connected" : "not_connected",
    };
  }).sort((a, b) => a.displayName.localeCompare(b.displayName));
}
