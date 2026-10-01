import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeAccountDirectory } from "../src/lib/admin/account-directory.ts";

const profile = (id = "owner-a", role = "customer") => ({ id, display_name: id, role, created_at: "2026-01-01T00:00:00Z" });
const user = (id = "owner-a") => ({ id, email: `${id}@example.test`, email_confirmed_at: "2026-01-01T00:00:00Z" });
const wallet = (balance = 125) => ({ id: "wallet-a", owner_user_id: "owner-a", balance });
const mobile = { mobile_auth_user_id: "store-a", owner_user_id: "owner-a" };
const store = { store_profile_id: "store-a", owner_user_id: "owner-a", wallet_id: "wallet-a" };
const fixture = (override = {}) => ({ profiles: [profile()], users: [user()], wallets: [wallet()], mobileLinks: [], storeLinks: [], ...override });
const account = (override = {}) => mergeAccountDirectory(fixture(override))[0];

test("original wallet is visible without a store connection", () => {
  assert.deepEqual({ balance: account().goldLeaves, wallet: account().walletStatus, connection: account().storeConnection }, { balance: 125, wallet: "available", connection: "not_connected" });
});
test("email verification is separate from store connection", () => {
  assert.equal(account().authStatus, "email_verified");
  assert.equal(account().storeConnection, "not_connected");
});
test("existing mobile mapping alone connects the store, matching the bridge", () => {
  const row = account({ mobileLinks: [mobile] });
  assert.equal(row.storeConnection, "connected");
  assert.equal(row.mobileConnection, "connected");
});
test("consistent explicit store and mobile mappings connect to the original wallet", () => {
  const row = account({ storeLinks: [store], mobileLinks: [mobile] });
  assert.equal(row.storeConnection, "connected");
  assert.equal(row.walletId, "wallet-a");
});
test("wrong-wallet store links require review without changing balance ownership", () => {
  const row = account({ storeLinks: [{ ...store, wallet_id: "wallet-b" }], mobileLinks: [mobile] });
  assert.equal(row.storeConnection, "needs_review");
  assert.equal(row.goldLeaves, 125);
});
test("conflicting or absent mobile counterpart never reports connected", () => {
  assert.equal(account({ storeLinks: [store] }).storeConnection, "needs_review");
  assert.equal(account({ storeLinks: [store], mobileLinks: [{ ...mobile, owner_user_id: "owner-b" }] }).storeConnection, "needs_review");
});
test("a mapping with no canonical wallet needs review and does not fabricate zero", () => {
  const row = account({ wallets: [], mobileLinks: [mobile] });
  assert.equal(row.storeConnection, "needs_review");
  assert.equal(row.goldLeaves, null);
  assert.equal(row.walletStatus, "missing");
});
test("actual zero and negative integer balances remain distinct from missing", () => {
  assert.equal(account({ wallets: [wallet(0)] }).goldLeaves, 0);
  assert.equal(account({ wallets: [wallet("-12")] }).goldLeaves, -12);
  assert.equal(account({ wallets: [] }).goldLeaves, null);
});
test("unsafe or malformed balances are unavailable", () => {
  for (const balance of [null, undefined, false, true, {}, [], "", "1.5", "NaN", "9007199254740993", Number.NaN, Number.POSITIVE_INFINITY]) {
    const row = account({ wallets: [{ ...wallet(), balance }] });
    assert.equal(row.goldLeaves, null);
    assert.equal(row.walletStatus, "unavailable");
  }
});
test("matching email text never confers another owner's wallet or store mapping", () => {
  const rows = mergeAccountDirectory(fixture({ profiles: [profile(), profile("owner-b")], users: [user(), { ...user("owner-b"), email: user().email }], storeLinks: [store], mobileLinks: [mobile] }));
  const other = rows.find((row) => row.userId === "owner-b");
  assert.equal(other.walletId, null);
  assert.equal(other.goldLeaves, null);
  assert.equal(other.storeConnection, "not_connected");
});
test("missing auth and unconfirmed auth remain explicit", () => {
  assert.equal(account({ users: [] }).authStatus, "unavailable");
  assert.equal(account({ users: [{ ...user(), email_confirmed_at: null }] }).authStatus, "email_unconfirmed");
});
test("staff privileges stay profile-owned", () => {
  assert.equal(account({ profiles: [profile("owner-a", "admin")] }).role, "admin");
  assert.equal(account({ users: [{ ...user(), role: "admin" }] }).role, "customer");
});
test("ambiguous wallet ownership fails rather than choosing an arbitrary wallet", () => {
  assert.throws(() => account({ wallets: [wallet(), { ...wallet(), id: "wallet-other" }] }), /ownership is inconsistent/);
});
test("ambiguous mapping ownership fails rather than choosing an arbitrary connection", () => {
  assert.throws(() => account({ mobileLinks: [mobile, { ...mobile, owner_user_id: "owner-b" }] }), /ownership is inconsistent/);
  assert.throws(() => account({ storeLinks: [store, { ...store, store_profile_id: "store-other" }] }), /ownership is inconsistent/);
});
