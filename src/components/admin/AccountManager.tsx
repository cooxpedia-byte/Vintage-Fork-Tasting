"use client";

import { useMemo, useState } from "react";
import type { AccountDirectoryEntry } from "@/lib/admin/account-directory";

const authLabels = { email_verified: "Email verified", email_unconfirmed: "Email confirmation pending", unavailable: "Unavailable" };
const connectionLabels = { connected: "Connected", not_connected: "Not connected", needs_review: "Connection needs review" };

export function AccountManager({ accounts }: { accounts: AccountDirectoryEntry[] }) {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("all");
  const [selectedId, setSelectedId] = useState(accounts[0]?.userId ?? "");
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return accounts.filter((account) => (role === "all" || account.role === role) && (!needle || `${account.displayName} ${account.email}`.toLowerCase().includes(needle)));
  }, [accounts, query, role]);
  const selected = visible.find((account) => account.userId === selectedId) ?? visible[0] ?? null;

  return <div className="admin-account-layout">
    <section className="admin-panel admin-account-index">
      <div className="admin-panel-heading"><div><p className="eyebrow">Directory</p><h2>{accounts.length} accounts</h2></div></div>
      <div className="admin-account-filters"><label><span className="sr-only">Search accounts</span><input className="input" onChange={(event) => setQuery(event.target.value)} placeholder="Search name or email" type="search" value={query} /></label><label><span className="sr-only">Filter by role</span><select className="select" onChange={(event) => setRole(event.target.value)} value={role}><option value="all">All roles</option><option value="customer">Customers</option><option value="host">Hosts</option><option value="admin">Administrators</option></select></label></div>
      <div className="admin-account-list" role="list">{visible.map((account) => <button className={selected?.userId === account.userId ? "is-selected" : ""} key={account.userId} onClick={() => setSelectedId(account.userId)} role="listitem" type="button"><span className="admin-avatar">{account.displayName.split(/\s+/).slice(0,2).map((word) => word[0]).join("").toUpperCase()}</span><span><strong>{account.displayName}</strong><small>{account.email}</small></span><span className={`chip ${account.role === "admin" ? "chip-live" : account.role === "host" ? "chip-warning" : ""}`}>{account.role}</span></button>)}{!visible.length && <div className="empty-state"><strong>No accounts found</strong><p>Try a broader name, email or role.</p></div>}</div>
    </section>
    <section className="admin-panel admin-account-detail">{selected ? <>
      <div className="admin-account-profile"><span className="admin-avatar is-large">{selected.displayName.split(/\s+/).slice(0,2).map((word) => word[0]).join("").toUpperCase()}</span><div><p className="eyebrow">Account details</p><h2>{selected.displayName}</h2><p>{selected.email}</p></div><span className={`chip ${selected.storeConnection === "connected" ? "chip-success" : "chip-warning"}`}>{connectionLabels[selected.storeConnection]}</span></div>
      <div className="admin-account-controls"><section><div className="admin-control-heading"><div><h3>Identity & access</h3><p>Email verification and store connection are separate account details.</p></div></div><dl className="admin-account-facts"><div><dt>Staff role</dt><dd>{selected.role}</dd></div><div><dt>Tasting account</dt><dd>{authLabels[selected.authStatus]}</dd></div><div><dt>Store connection</dt><dd>{connectionLabels[selected.storeConnection]}</dd></div><div><dt>Mobile connection</dt><dd>{connectionLabels[selected.mobileConnection]}</dd></div><div><dt>Joined</dt><dd>{new Date(selected.joinedAt).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })}</dd></div></dl><p className="help">A verified email does not confirm that a store password has been set. Customers can connect their existing Gold Leaves account after signing in to the store.</p><p className="help">Role elevation, suspension and closure require a separate reviewed policy and are intentionally not one-click actions.</p></section>
      <section className="admin-wallet-card"><div className="admin-wallet-balance"><span>Gold Leaves balance</span><strong>{selected.goldLeaves === null ? "Unavailable" : selected.goldLeaves.toLocaleString("en-CA")}</strong><small>{selected.walletStatus === "available" ? "Original Gold Leaves wallet" : selected.walletStatus === "missing" ? "No original wallet found" : "Wallet balance could not be verified"}</small></div><p>Gold Leaves awards are temporarily unavailable in this account directory.</p>{selected.storeConnection === "not_connected" && <p>The original wallet can exist before a customer connects their store account.</p>}{selected.storeConnection === "needs_review" && <p role="alert">The saved connection is inconsistent. Review account ownership before changing it.</p>}</section></div>
    </> : <div className="empty-state"><h2>Select an account</h2><p>Choose a customer or staff member to view their account details.</p></div>}</section>
  </div>;
}
