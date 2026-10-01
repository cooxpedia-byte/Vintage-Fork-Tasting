"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { awardRequest, type AdminAccount, type PendingAward } from "@/lib/admin/accounts";

const format = (value: string) => BigInt(value).toLocaleString("en-CA");

export function GoldLeavesManager({ accounts }: { accounts: AdminAccount[] }) {
  const eligible = accounts.filter((account) => account.walletId);
  const router = useRouter();
  const [userId, setUserId] = useState(eligible[0]?.userId ?? "");
  const [amount, setAmount] = useState("50");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const pending = useRef<PendingAward | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const selected = eligible.find((account) => account.userId === userId);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!selected?.walletId || inFlight.current) return;
    const value = Number(amount), trimmedReason = reason.trim();
    if (!Number.isInteger(value) || value < 1 || value > 5000) { setResult({ ok: false, text: "Enter a whole number from 1 to 5,000." }); return; }
    if (trimmedReason.length < 6 || trimmedReason.length > 240) { setResult({ ok: false, text: "Record a reason between 6 and 240 characters." }); return; }
    if (!window.confirm(`Credit ${value.toLocaleString("en-CA")} Gold Leaves to ${selected.displayName}? Any refund debt will be repaid first.`)) return;
    pending.current = awardRequest(pending.current, { walletId: selected.walletId, amount: value, reason: trimmedReason }, () => crypto.randomUUID());
    inFlight.current = true; setBusy(true); setResult(null);
    try {
      const response = await fetch("/api/admin/gold-leaves", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(pending.current) });
      const body = await response.json().catch(() => ({}));
      setResult({ ok: response.ok, text: response.ok ? body.message : body.error ?? "The award could not be confirmed. Retry the same request safely." });
      if (response.ok) { pending.current = null; setReason(""); router.refresh(); }
    } catch { setResult({ ok: false, text: "The award could not be confirmed. Keep these details and retry the same request safely." }); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <section className="admin-panel admin-award-panel"><div className="admin-panel-heading"><div><p className="eyebrow">Manual credit</p><h2>Give Gold Leaves</h2></div><span className="chip chip-success">Audited</span></div>{result && <div className={`notice ${result.ok ? "success" : "error"}`} role={result.ok ? "status" : "alert"}>{result.text}</div>}<form onSubmit={submit}><label className="field">Customer<select className="select" disabled={busy} onChange={(event) => setUserId(event.target.value)} required value={userId}>{eligible.map((account) => <option key={account.userId} value={account.userId}>{account.displayName} · {account.email} · {format(account.goldLeaves)} spendable Leaves{account.refundDebt !== "0" ? ` · ${format(account.refundDebt)} refund debt` : ""}</option>)}</select></label>{!eligible.length && <p className="help">No verified Gold Leaves wallets are available.</p>}<div className="grid grid-2"><label className="field">Amount<input className="input" disabled={busy} inputMode="numeric" onChange={(event) => setAmount(event.target.value)} required value={amount} /></label><label className="field">Reason<input className="input" disabled={busy} maxLength={240} minLength={6} onChange={(event) => setReason(event.target.value)} placeholder="Why are these Leaves being issued?" required value={reason} /></label></div><div className="admin-form-footer"><p className="help">Credits are capped at 5,000 per action and recorded in the permanent ledger. Credits repay refund debt first.</p><button className="btn btn-gold" disabled={busy || !selected} type="submit">{busy ? "Recording…" : "Record credit"}</button></div></form></section>;
}
