import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { guestCookieName, hashGuestToken, requireParticipant } from "@/lib/guest-token";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { guestDeletionSchema } from "@/lib/validation";

export async function DELETE(request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  try {
    const parsed = guestDeletionSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: "This deletion request is invalid." }, { status: 400 });

    const admin = createAdminClient();
    let participantId: string | null = null;
    let source: "email_link" | "guest_session" = "guest_session";

    if (parsed.data.deletionToken) {
      source = "email_link";
      const { data: token, error: tokenError } = await admin
        .from("participant_deletion_tokens")
        .select("participant_id")
        .eq("event_id", eventId)
        .eq("token_hash", hashGuestToken(parsed.data.deletionToken))
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();
      if (tokenError) throw tokenError;
      participantId = token?.participant_id ?? null;
    } else {
      const participant = await requireParticipant(eventId);
      participantId = participant?.id ?? null;
    }

    if (!participantId) {
      return NextResponse.json({ error: "This deletion link is invalid or has expired." }, { status: 401 });
    }

    const { data: deleted, error: deleteError } = await admin
      .from("participants")
      .delete()
      .eq("id", participantId)
      .eq("event_id", eventId)
      .select("id")
      .maybeSingle();
    if (deleteError) throw deleteError;
    if (!deleted) return NextResponse.json({ error: "This tasting data has already been deleted." }, { status: 410 });

    const cookieStore = await cookies();
    cookieStore.delete(guestCookieName(eventId));
    logger.info("guest_tasting_data_deleted", { eventId, source });
    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error("guest_tasting_data_deletion_failed", error, { eventId });
    return NextResponse.json({ error: "We couldn’t delete your tasting data just now. Please try again." }, { status: 500 });
  }
}
