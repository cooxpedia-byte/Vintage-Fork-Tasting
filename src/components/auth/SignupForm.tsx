"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { Brand } from "@/components/Brand";
import { safeNextPath, withNextPath } from "@/lib/auth-redirect";
import {
  beginSignupSubmission,
  finishSignupSubmission,
  SIGNUP_SUCCESS_MESSAGE,
  signupResultMessage,
} from "@/lib/signup";

export function SignupForm() {
  const params = useSearchParams();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);
  const submissionLock = useRef(false);
  const next = safeNextPath(params.get("next"), "/dashboard");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!beginSignupSubmission(submissionLock)) return;

    setBusy(true);
    setMessage("");

    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: name },
          emailRedirectTo: withNextPath(`${window.location.origin}/auth/callback`, next),
        },
      });

      if (!error && data.session) {
        window.location.assign(next);
        return;
      }
      setComplete(!error);
      setMessage(signupResultMessage(error));
    } finally {
      finishSignupSubmission(submissionLock);
      setBusy(false);
    }
  }

  return (
    <main className="auth-page" id="main-content">
      <section className="auth-card">
        <Brand />
        <p className="eyebrow">Customer dashboard</p>
        <h1 className="page-title">Start your tea cellar</h1>
        <p className="page-lede">Keep your tasting history, Passport stamps and saved teas together.</p>
        {message && (
          <div className={message === SIGNUP_SUCCESS_MESSAGE ? "notice success" : "form-error"} role="status">
            {message}
          </div>
        )}
        <form onSubmit={submit} style={{ marginTop: 20 }}>
          <div className="field">
            <label htmlFor="signup-name">Your name</label>
            <input className="input" id="signup-name" autoComplete="name" required maxLength={80} value={name} onChange={event => setName(event.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="signup-email">Email</label>
            <input className="input" id="signup-email" type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="signup-password">Password</label>
            <input className="input" id="signup-password" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={event => setPassword(event.target.value)} />
            <span className="help">Use at least 8 characters.</span>
          </div>
          <button className="btn btn-primary btn-attention" style={{ width: "100%" }} disabled={busy || complete}>
            {busy ? "Creating…" : complete ? "Check your email" : "Create My Account"}
          </button>
        </form>
        <p className="help">Already have an account? <Link href={withNextPath("/login", next)}>Sign in</Link>.</p>
      </section>
    </main>
  );
}
