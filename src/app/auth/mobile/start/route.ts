import { type Provider } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { safeNextPath } from "@/lib/auth-redirect";
import { MOBILE_PROVIDER_EMAIL_COOKIE, normalizeAccountEmail } from "@/lib/mobile-provider-login";
import { createMobileServerClient } from "@/lib/supabase/mobile-server";

const providerStartSchema = z.object({
  provider: z.enum(["apple", "google"]),
  email: z.string().trim().email().max(254),
  next: z.string().optional()
});

export async function POST(request: NextRequest) {
  const parsed = providerStartSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid Vintage Fork account email." }, { status: 400 });

  const provider: Provider = parsed.data.provider;
  const next = safeNextPath(parsed.data.next ?? null, "/dashboard");
  const callback = new URL("/auth/mobile/callback", request.url);
  callback.searchParams.set("next", next);

  try {
    const mobile = await createMobileServerClient();
    const { data, error } = await mobile.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: callback.toString(),
        skipBrowserRedirect: true,
        queryParams: provider === "google" ? {
          prompt: "select_account",
          login_hint: normalizeAccountEmail(parsed.data.email)
        } : undefined
      }
    });
    if (error || !data.url) return NextResponse.json({ error: "Apple or Google sign-in could not start." }, { status: 503 });

    const response = NextResponse.json({ url: data.url }, { headers: { "Cache-Control": "private, no-store" } });
    response.cookies.set(MOBILE_PROVIDER_EMAIL_COOKIE, normalizeAccountEmail(parsed.data.email), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/auth/mobile",
      maxAge: 60 * 10
    });
    return response;
  } catch {
    return NextResponse.json({ error: "Apple or Google sign-in could not start." }, { status: 503 });
  }
}
