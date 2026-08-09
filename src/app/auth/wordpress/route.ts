import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/auth-redirect";

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const next = safeNextPath(request.nextUrl.searchParams.get("next"), "/dashboard");

  if (tokenHash) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: "email",
    });
    if (!error) return NextResponse.redirect(new URL(next, request.url));
  }

  const loginPath = next.startsWith("/admin") ? "/admin/login" : "/login";
  const failure = new URL(loginPath, request.url);
  failure.searchParams.set("next", next);
  failure.searchParams.set("authError", "wordpress_exchange_failed");
  return NextResponse.redirect(failure);
}
