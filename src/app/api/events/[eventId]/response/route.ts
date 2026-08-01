import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireParticipant } from "@/lib/guest-token";
import { responseSchema } from "@/lib/validation";
import { logger } from "@/lib/logger";

export async function POST(request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  try {
    const participant = await requireParticipant(eventId);
    if (!participant) return NextResponse.json({ error: "Participation session expired." }, { status: 401 });
    if (participant.status === "removed") return NextResponse.json({ error: "You were removed from this tasting." }, { status: 403 });
    const parsed = responseSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid response." }, { status: 400 });
    const admin = createAdminClient();
    await admin.from("participants").update({ status: "active", last_seen_at: new Date().toISOString() }).eq("id", participant.id);
    const [{ data: event }, { data: flightItem }] = await Promise.all([
      admin.from("events").select("phase,current_flight_item_id,tasting_opened_flight_item_id,status").eq("id", eventId).single(),
      admin.from("event_flight_items").select("id").eq("id", parsed.data.flightItemId).eq("event_id", eventId).maybeSingle()
    ]);
    if (!flightItem) return NextResponse.json({ error: "That tea does not belong to this tasting." }, { status: 400 });
    if (!event || event.status !== "live" || !["tasting","trivia","recap"].includes(event.phase)) return NextResponse.json({ error: "The host has not opened tasting responses." }, { status: 409 });
    if (event.phase !== "recap" && event.tasting_opened_flight_item_id !== event.current_flight_item_id) return NextResponse.json({ error: "The host has not opened this tea for responses." }, { status: 409 });
    if (event.current_flight_item_id !== parsed.data.flightItemId && event.phase !== "recap") return NextResponse.json({ error: "The room has moved to another tea." }, { status: 409 });
    const { data: existingResponse } = await admin.from("tea_responses").select("completed_at").eq("participant_id", participant.id).eq("event_flight_item_id", parsed.data.flightItemId).maybeSingle();
    const payload = {
      participant_id: participant.id,
      event_flight_item_id: parsed.data.flightItemId,
      first_impression: parsed.data.firstImpression ?? null,
      descriptors: parsed.data.descriptors,
      intensity: parsed.data.intensity ?? null,
      rating: parsed.data.rating ?? null,
      personal_notes: parsed.data.personalNotes ?? null,
      saved: parsed.data.saved ?? false,
      completed_at: parsed.data.completed ? new Date().toISOString() : existingResponse?.completed_at ?? null
    };
    const { error } = await admin.from("tea_responses").upsert(payload, { onConflict: "participant_id,event_flight_item_id" });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error("tea_response_failed", error, { eventId });
    return NextResponse.json({ error: "We could not save that just now." }, { status: 500 });
  }
}
