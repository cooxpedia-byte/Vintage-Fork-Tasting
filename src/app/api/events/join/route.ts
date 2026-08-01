import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createGuestToken, guestCookieName, hashGuestToken } from "@/lib/guest-token";
import { joinSchema } from "@/lib/validation";
import { logger } from "@/lib/logger";

export async function POST(request: Request) {
  try {
    const parsed = joinSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid registration." }, { status: 400 });
    const auth = await createClient();
    const { data: { user } } = await auth.auth.getUser();
    const token = createGuestToken();
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("join_event_guest", {
      p_invite_code: parsed.data.inviteCode,
      p_display_name: parsed.data.displayName,
      p_email: parsed.data.email || "",
      p_marketing_consent: parsed.data.email ? Boolean(parsed.data.marketingConsent) : null,
      p_token_hash: hashGuestToken(token),
      p_user_id: user?.id ?? null
    });
    if (error) return NextResponse.json({ error: friendly(error.message) }, { status: error.message.includes("full") ? 409 : 400 });
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new Error("Join returned no participant.");
    const store = await cookies();
    store.set(guestCookieName(row.event_id), token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 90 });
    return NextResponse.json(row);
  } catch (error) {
    logger.error("guest_join_failed", error);
    return NextResponse.json({ error: "We could not save your seat." }, { status: 500 });
  }
}
function friendly(message: string) {
  if (message.includes("invite_invalid")) return "We couldn’t find that invitation.";
  if (message.includes("event_cancelled")) return "This tasting was cancelled.";
  if (message.includes("event_full")) return "This tasting is full.";
  if (message.includes("event_not_open")) return "This tasting is not open for registration.";
  return "We could not save your seat.";
}
