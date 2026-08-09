"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Brand } from "@/components/Brand";
import { safeNextPath } from "@/lib/auth-redirect";
import { sharedWordPressLoginUrl } from "@/lib/shared-login";

export function LoginForm({ staff = false }: { staff?: boolean }) {
  const params = useSearchParams();
  const [busy, setBusy] = useState(false);
  const callbackError = params.get("authError")
    ? "Vintage Fork could not complete sign-in. Please try again."
    : "";
  const fallback = staff ? "/admin" : "/dashboard";
  const next = safeNextPath(params.get("next"), fallback);
  const signInUrl = sharedWordPressLoginUrl(next);

  function beginSharedSignIn() {
    setBusy(true);
    window.location.assign(signInUrl);
  }

  useEffect(() => {
    if (!callbackError) {
      window.location.replace(signInUrl);
    }
  }, [callbackError, signInUrl]);

  return (
    <main className="auth-page" id="main-content">
      <section className="auth-card enter">
        <Brand href="/" />
        <p className="eyebrow">{staff ? "Tasting administration" : "Customer dashboard"}</p>
        <h1 className="page-title">{staff ? "Staff sign in" : "Welcome back"}</h1>
        <p className="page-lede">{staff ? "Use your assigned Vintage Fork staff account." : "Your tasting notes, Passport and saved teas are waiting."}</p>
        {callbackError && <div className="form-error" role="status">{callbackError}</div>}
        <button
          className="btn btn-primary btn-attention"
          style={{ width: "100%", marginTop: 20 }}
          type="button"
          disabled={busy}
          onClick={beginSharedSignIn}
        >
          {busy ? "Connecting…" : "Continue with Vintage Fork"}
        </button>
        <p className="help">Use the same Vintage Fork password for Tea Lab, Tea Merchant and your mobile account.</p>
      </section>
    </main>
  );
}
