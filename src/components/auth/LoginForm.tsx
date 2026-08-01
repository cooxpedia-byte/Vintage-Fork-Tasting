"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";
import { Brand } from "@/components/Brand";

export function LoginForm({ staff = false }: { staff?: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) { setError("The email or password was not accepted."); setBusy(false); return; }
    const fallback = staff ? "/admin" : "/dashboard";
    const next = safeNext(params.get("next"), fallback);
    router.replace(next);
    router.refresh();
  }

  async function resetPassword() {
    if (!email) { setError("Enter your email first."); return; }
    const supabase = createClient();
    const afterReset = `/reset-password?next=${staff ? "/admin" : "/dashboard"}`;
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(afterReset)}`;
    await supabase.auth.resetPasswordForEmail(email, { redirectTo });
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
        <button className="btn btn-quiet" type="button" onClick={resetPassword}>Forgot your password?</button>
        {!staff && <p className="help">New to the tasting cellar? <Link href="/signup">Create a customer account</Link>.</p>}
      </section>
    </main>
  );
}

function safeNext(value: string | null, fallback: string) {
  return value && value.startsWith("/") && !value.startsWith("//") && !value.includes("\\") ? value : fallback;
}
