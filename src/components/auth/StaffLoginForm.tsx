"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Brand } from "@/components/Brand";
import { safeNextPath } from "@/lib/auth-redirect";
import { createClient } from "@/lib/supabase/browser";

export function staffNextPath(value: string | null) {
  const requested = safeNextPath(value, "/admin/orders");
  const loginLoop = requested === "/admin/login" || requested.startsWith("/admin/login?") || requested.startsWith("/admin/login/");
  return !loginLoop && (requested === "/admin" || requested.startsWith("/admin/")) ? requested : "/admin/orders";
}

export function staffResetRedirect(origin: string, next: string) {
  const resetPage = `/reset-password?next=${encodeURIComponent(next)}`;
  const callback = new URL("/auth/callback", origin);
  callback.searchParams.set("next", resetPage);
  return callback.toString();
}

export function StaffLoginForm() {
  const params = useSearchParams();
  const next = staffNextPath(params.get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<"sign-in" | "reset" | null>(null);
  const [error, setError] = useState(params.get("authError") ? "That sign-in or recovery link could not be completed. Try again." : "");
  const [notice, setNotice] = useState("");

  async function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy("sign-in");
    setError("");
    setNotice("");
    try {
      const supabase = createClient();
      const result = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (result.error || !result.data.user) {
        setError("The email or password was not accepted.");
        return;
      }
      // The destination's existing requireStaff(["admin"]) check remains authoritative.
      window.location.assign(next);
    } catch {
      setError("Staff sign-in is unavailable right now. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function requestReset() {
    if (busy) return;
    const normalizedEmail = email.trim();
    if (!normalizedEmail || !/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      setError("Enter your staff email address first.");
      setNotice("");
      return;
    }
    setBusy("reset");
    setError("");
    setNotice("");
    try {
      const supabase = createClient();
      await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: staffResetRedirect(window.location.origin, next),
      });
      setNotice("If that email belongs to a tasting account, a password reset link will arrive shortly.");
    } catch {
      setNotice("If that email belongs to a tasting account, a password reset link will arrive shortly.");
    } finally {
      setBusy(null);
    }
  }

  return <main className="auth-page" id="main-content">
    <section className="auth-card enter">
      <Brand href="/" />
      <p className="eyebrow">Tasting administration</p>
      <h1 className="page-title">Staff sign in</h1>
      <p className="page-lede">Use the email and password assigned to your tasting staff account.</p>
      {error && <div className="form-error" role="alert">{error}</div>}
      {notice && <div className="notice success" role="status">{notice}</div>}
      <form onSubmit={signIn} style={{ marginTop: 20 }}>
        <div className="field">
          <label htmlFor="staff-email">Email</label>
          <input className="input" id="staff-email" type="email" autoComplete="username" maxLength={254} required value={email} onChange={(event) => setEmail(event.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="staff-password">Password</label>
          <input className="input" id="staff-password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
        </div>
        <button className="btn btn-primary btn-attention" style={{ width: "100%" }} disabled={busy !== null}>
          {busy === "sign-in" ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <button className="btn btn-secondary" style={{ width: "100%", marginTop: 12 }} type="button" disabled={busy !== null} onClick={requestReset}>
        {busy === "reset" ? "Requesting…" : "Reset password"}
      </button>
      <p className="help">Order management requires an administrator account. Assigned host areas remain available to hosts.</p>
    </section>
  </main>;
}
