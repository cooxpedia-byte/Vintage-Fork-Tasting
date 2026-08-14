import { type NextRequest, NextResponse } from "next/server";
import { safeNextPath } from "@/lib/auth-redirect";
import { createMobileHandoff } from "@/lib/mobile-auth-handoff";
import { isApplePrivateRelayEmail, MOBILE_PROVIDER_EMAIL_COOKIE, normalizeAccountEmail } from "@/lib/mobile-provider-login";
import { createMobileServerClient } from "@/lib/supabase/mobile-server";

export async function GET(request: NextRequest) {
  const next = safeNextPath(request.nextUrl.searchParams.get("next"), "/dashboard");
  const code = request.nextUrl.searchParams.get("code");
  const expectedEmail = normalizeAccountEmail(request.cookies.get(MOBILE_PROVIDER_EMAIL_COOKIE)?.value);
  if (!code) return loginFailure(request, next, "provider_callback_failed");
  if (!expectedEmail) return loginFailure(request, next, "provider_callback_failed");

  try {
    const mobile = await createMobileServerClient();
    const { data, error } = await mobile.auth.exchangeCodeForSession(code);
    if (error || !data.user) return loginFailure(request, next, "provider_callback_failed");

    if (data.user.app_metadata.provider === "apple" && isApplePrivateRelayEmail(data.user.email)) {
      await mobile.auth.signOut({ scope: "local" });
      return loginFailure(request, next, "apple_private_relay");
    }
    if (normalizeAccountEmail(data.user.email) !== expectedEmail) {
      await mobile.auth.signOut({ scope: "local" });
      return loginFailure(request, next, "provider_email_mismatch");
    }

    const handoff = await createMobileHandoff(data.user, request.url, next);
    await mobile.auth.signOut({ scope: "local" });
    if (!handoff.ok) return loginFailure(request, next, "provider_handoff_failed");
    const response = NextResponse.redirect(handoff.url);
    response.cookies.delete({ name: MOBILE_PROVIDER_EMAIL_COOKIE, path: "/auth/mobile" });
    return response;
  } catch {
    return loginFailure(request, next, "provider_callback_failed");
  }
}

function loginFailure(request: NextRequest, next: string, code: string) {
  const login = new URL("/login", request.url);
  login.searchParams.set("next", next);
  login.searchParams.set("authError", code);
  const response = NextResponse.redirect(login);
  response.cookies.delete({ name: MOBILE_PROVIDER_EMAIL_COOKIE, path: "/auth/mobile" });
  return response;
}
