"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Brand } from "@/components/Brand";
import { safeNextPath } from "@/lib/auth-redirect";
import { sharedWordPressLoginUrl } from "@/lib/shared-login";

type SignInMethod = "apple" | "google" | "vintage-fork";

export function LoginForm({ staff = false }: { staff?: boolean }) {
  const params = useSearchParams();
  const [busyMethod, setBusyMethod] = useState<SignInMethod | null>(null);
  const [accountEmail, setAccountEmail] = useState("");
  const [startError, setStartError] = useState("");
  const callbackError = startError || loginErrorMessage(params.get("authError"));
  const fallback = staff ? "/admin" : "/dashboard";
  const next = safeNextPath(params.get("next"), fallback);
  const signInUrl = sharedWordPressLoginUrl(next);

  function beginSharedSignIn() {
    setBusyMethod("vintage-fork");
    window.location.assign(signInUrl);
  }

  async function beginProviderSignIn(provider: "apple" | "google") {
    if (!accountEmail.trim()) {
      setStartError("Enter the email you use with Vintage Fork first.");
      return;
    }
    setBusyMethod(provider);
    setStartError("");
    try {
      const response = await fetch("/auth/mobile/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider, email: accountEmail, next })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || typeof result.url !== "string") {
        setStartError(result.error ?? `${provider === "apple" ? "Apple" : "Google"} sign-in could not start. Please try again.`);
        setBusyMethod(null);
        return;
      }
      window.location.assign(result.url);
    } catch {
      setStartError(`${provider === "apple" ? "Apple" : "Google"} sign-in could not start. Please try again.`);
      setBusyMethod(null);
    }
  }

  useEffect(() => {
    if (staff && !callbackError) {
      window.location.replace(signInUrl);
    }
  }, [callbackError, signInUrl, staff]);

  return (
    <main className="auth-page" id="main-content">
      <section className="auth-card enter">
        <Brand href="/" />
        <p className="eyebrow">{staff ? "Tasting administration" : "Customer dashboard"}</p>
        <h1 className="page-title">{staff ? "Staff sign in" : "Welcome back"}</h1>
        <p className="page-lede">{staff ? "Use your assigned Vintage Fork staff account." : "Your tasting notes, Passport and saved teas are waiting."}</p>
        {callbackError && <div className="form-error" role="status">{callbackError}</div>}
        {!staff && <div className="stack" style={{ marginTop: 20 }}>
          <div className="field">
            <label htmlFor="account-email">Vintage Fork account email</label>
            <input className="input" id="account-email" type="email" autoComplete="email" required value={accountEmail} onChange={event => setAccountEmail(event.target.value)} />
            <span className="help">Use the same email you use in the Vintage Fork mobile app.</span>
          </div>
          <button className="btn btn-primary btn-attention" style={{ width: "100%" }} type="button" disabled={busyMethod !== null} onClick={() => void beginProviderSignIn("apple")}>
            {busyMethod === "apple" ? "Connecting…" : "Continue with Apple"}
          </button>
          <button className="btn btn-secondary" style={{ width: "100%" }} type="button" disabled={busyMethod !== null} onClick={() => void beginProviderSignIn("google")}>
            {busyMethod === "google" ? "Connecting…" : "Continue with Google"}
          </button>
          <div className="section-label" aria-hidden="true"><span>or</span></div>
        </div>}
        <button
          className={staff ? "btn btn-primary btn-attention" : "btn btn-secondary"}
          style={{ width: "100%", marginTop: staff ? 20 : 0 }}
          type="button"
          disabled={busyMethod !== null}
          onClick={beginSharedSignIn}
        >
          {busyMethod === "vintage-fork" ? "Connecting…" : staff ? "Continue with Vintage Fork" : "Use Vintage Fork password"}
        </button>
        <p className="help">Use Apple, Google, or the same Vintage Fork password you use for Tea Lab, Tea Merchant and your mobile account.</p>
      </section>
    </main>
  );
}

function loginErrorMessage(code: string | null) {
  if (!code) return "";
  if (code === "provider_email_mismatch") return "Use the same verified email you entered before choosing Apple or Google.";
  if (code === "apple_private_relay") return "Apple is protecting your email. Link Apple once in the Vintage Fork mobile app, or use Google or your Vintage Fork password here.";
  if (code.startsWith("provider_")) return "Apple or Google sign-in could not complete. Please try again.";
  return "Vintage Fork could not complete sign-in. Please try again.";
}
