import { type NextRequest, NextResponse } from "next/server";
import { safeNextPath } from "@/lib/auth-redirect";
import { getMobileDisplayName, getMobileUser } from "@/lib/mobile-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const user = await getMobileUser(request.headers.get("authorization"));
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!user.email) return NextResponse.json({ error: "This account has no email address." }, { status: 422 });

  const payload = await request.json().catch(() => ({})) as { next?: unknown };
  const next = safeNextPath(typeof payload.next === "string" ? payload.next : null, "/dashboard");
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: user.email
  });
  if (error || !data.properties.hashed_token) {
    return NextResponse.json({ error: "The mobile handoff could not be created." }, { status: 503 });
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
      return NextResponse.json({ error: "The mobile profile could not be synchronized." }, { status: 503 });
    }
  }

  const handoffUrl = new URL("/auth/confirm", request.url);
  handoffUrl.searchParams.set("token_hash", data.properties.hashed_token);
  handoffUrl.searchParams.set("type", "email");
  handoffUrl.searchParams.set("next", next);

  return NextResponse.json(
    { url: handoffUrl.toString() },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
