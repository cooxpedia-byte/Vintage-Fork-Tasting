"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";
import { Brand } from "@/components/Brand";

export function LoginForm({ staff = false }: { staff?: boolean }) {
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    const supabase = createClient();
    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError || !data.session) { setError("The email or password was not accepted."); setBusy(false); return; }
    const fallback = staff ? "/admin" : "/dashboard";
    const next = safeNext(params.get("next"), fallback);
    window.location.assign(next);
  }

  async function resetPassword() {
    if (!email) { setError("Enter your email first."); return; }
    setBusy(true);
    setError("");
    const supabase = createClient();
    const afterReset = `/reset-password?next=${staff ? "/admin" : "/dashboard"}`;
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(afterReset)}`;
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    setBusy(false);
    if (resetError) {
      if (resetError.code === "over_email_send_rate_limit") {
        setError("The password-reset email service is temporarily at capacity. Please contact Vintage Fork for help.");
      } else if (resetError.code === "over_request_rate_limit") {
        setError("Too many reset requests were made recently. Please wait briefly and try again.");
      } else {
        setError("The reset email could not be sent. Please try again or contact Vintage Fork.");
      }
      return;
    }
    setError("If that account exists, a reset link is on its way.");
  }

  return (
    <main className="auth-page" id="main-content">
      <section className="auth-card enter">
        <Brand href="/" />
        <p className="eyebrow">{staff ? "Tasting administration" : "Customer dashboard"}</p>
        <h1 className="page-title">{staff ? "Staff sign in" : "Welcome back"}</h1>
        <p className="page-lede">{staff ? "Use your assigned Vintage Fork staff account." : "Your tasting notes, Passport and saved teas are waiting."}</p>
        {error && <div className={error.startsWith("If") ? "notice success" : "form-error"} role="status">{error}</div>}
        <form onSubmit={submit} style={{ marginTop: 20 }}>
          <div className="field"><label htmlFor="email">Email</label><input className="input" id="email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></div>
          <div className="field"><label htmlFor="password">Password</label><input className="input" id="password" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></div>
          <button className="btn btn-primary" style={{ width: "100%" }} disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        </form>
        <button className="btn btn-quiet" type="button" disabled={busy} onClick={resetPassword}>Forgot your password?</button>
        {!staff && <p className="help">New to the tasting cellar? <Link href="/signup">Create a customer account</Link>.</p>}
      </section>
    </main>
  );
}

function safeNext(value: string | null, fallback: string) {
  return value && value.startsWith("/") && !value.startsWith("//") && !value.includes("\\") ? value : fallback;
}
