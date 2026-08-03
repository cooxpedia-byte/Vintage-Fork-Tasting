import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireParticipant } from "@/lib/guest-token";
import { guestNotesSchema } from "@/lib/validation";
import { logger } from "@/lib/logger";

export async function POST(request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  try {
    const participant = await requireParticipant(eventId);
    if (!participant) return NextResponse.json({ error: "Participation session expired." }, { status: 401 });
    if (participant.status === "removed") return NextResponse.json({ error: "You were removed from this tasting." }, { status: 403 });

    const parsed = guestNotesSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid notes." }, { status: 400 });

    const admin = createAdminClient();
    const [{ data: event }, { data: flightItem }] = await Promise.all([
      admin.from("events").select("status").eq("id", eventId).single(),
      admin.from("event_flight_items").select("id").eq("id", parsed.data.flightItemId).eq("event_id", eventId).maybeSingle()
    ]);
    if (!event || event.status === "cancelled") return NextResponse.json({ error: "This tasting is no longer accepting notes." }, { status: 409 });
    if (!flightItem) return NextResponse.json({ error: "That tea does not belong to this tasting." }, { status: 400 });

    const { error } = await admin.from("tea_responses").upsert({
      participant_id: participant.id,
      event_flight_item_id: flightItem.id,
      personal_notes: parsed.data.personalNotes
    }, { onConflict: "participant_id,event_flight_item_id" });
    if (error) throw error;

    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch (error) {
    logger.error("guest_notes_save_failed", error, { eventId });
    return NextResponse.json({ error: "Your notes are still saved on this device." }, { status: 500 });
  }
}
