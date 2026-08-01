import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireParticipant } from "@/lib/guest-token";
import { logger } from "@/lib/logger";

export async function POST(_: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  try {
    const participant = await requireParticipant(eventId);
    if (!participant) return NextResponse.json({ error: "Participation session expired." }, { status: 401 });
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in to save this tasting to your cellar." }, { status: 401 });
    if (participant.user_id && participant.user_id !== user.id) return NextResponse.json({ error: "This tasting is already linked to another account." }, { status: 409 });
    if (participant.email && user.email && participant.email.toLowerCase() !== user.email.toLowerCase()) {
      return NextResponse.json({ error: "This tasting was registered under a different email." }, { status: 403 });
    }
    const admin = createAdminClient();
    const { data: existing } = await admin.from("participants").select("id").eq("event_id", eventId).eq("user_id", user.id).maybeSingle();
    if (existing && existing.id !== participant.id) return NextResponse.json({ error: "This event is already linked to your account." }, { status: 409 });
    const { error } = await admin.from("participants").update({ user_id: user.id, email: participant.email ?? user.email ?? null, recap_claimed_at: new Date().toISOString(), delete_after: null }).eq("id", participant.id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error("participant_claim_failed", error, { eventId });
    return NextResponse.json({ error: "The tasting could not be linked." }, { status: 500 });
  }
}
