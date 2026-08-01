"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Brand } from "@/components/Brand";
import { createClient } from "@/lib/supabase/browser";

export function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");
    if (password.length < 12) { setMessage("Use at least 12 characters."); return; }
    if (password !== confirmation) { setMessage("The passwords do not match."); return; }
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) { setMessage("That password could not be saved. Request a fresh reset link."); return; }
    const next = safeNext(params.get("next"), "/dashboard");
    router.replace(next);
    router.refresh();
  }

  return <main className="auth-page" id="main-content"><section className="auth-card enter">
    <Brand href="/" />
    <p className="eyebrow">Account recovery</p>
    <h1 className="page-title">Set a new password</h1>
    <p className="page-lede">Use a unique password with at least 12 characters.</p>
    {message && <div className="form-error" role="alert">{message}</div>}
    <form onSubmit={submit} style={{ marginTop:20 }}>
      <div className="field"><label htmlFor="new-password">New password</label><input className="input" id="new-password" type="password" minLength={12} autoComplete="new-password" required value={password} onChange={event => setPassword(event.target.value)} /></div>
      <div className="field"><label htmlFor="confirm-password">Confirm new password</label><input className="input" id="confirm-password" type="password" minLength={12} autoComplete="new-password" required value={confirmation} onChange={event => setConfirmation(event.target.value)} /></div>
      <button className="btn btn-primary" style={{ width:"100%" }} disabled={busy}>{busy ? "Saving…" : "Save new password"}</button>
    </form>
  </section></main>;
}

function safeNext(value: string | null, fallback: string) {
  return value && value.startsWith("/") && !value.startsWith("//") && !value.includes("\\") ? value : fallback;
}
