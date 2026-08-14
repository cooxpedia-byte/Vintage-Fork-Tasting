import type { User } from "@supabase/supabase-js";
import { safeNextPath } from "@/lib/auth-redirect";
import { getMobileDisplayName } from "@/lib/mobile-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export type MobileHandoffResult =
  | { ok: true; url: URL }
  | { ok: false; status: number; error: string };

export async function createMobileHandoff(
  user: User,
  requestUrl: string,
  requestedNext: unknown
): Promise<MobileHandoffResult> {
  if (!user.email) return { ok: false, status: 422, error: "This account has no email address." };

  const next = safeNextPath(typeof requestedNext === "string" ? requestedNext : null, "/dashboard");
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: user.email
  });
  if (error || !data.properties.hashed_token) {
    return { ok: false, status: 503, error: "The mobile handoff could not be created." };
  }

  const displayName = getMobileDisplayName(user);
  if (displayName) {
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .update({ display_name: displayName })
      .eq("id", data.user.id)
      .select("id")
      .maybeSingle();
    if (profileError || !profile) {
      return { ok: false, status: 503, error: "The mobile profile could not be synchronized." };
    }
  }

  const handoffUrl = new URL("/auth/confirm", requestUrl);
  handoffUrl.searchParams.set("token_hash", data.properties.hashed_token);
  handoffUrl.searchParams.set("type", "email");
  handoffUrl.searchParams.set("next", next);
  return { ok: true, url: handoffUrl };
}
