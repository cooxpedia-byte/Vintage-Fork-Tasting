import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireParticipant } from "@/lib/guest-token";
import { maskEmail, protectGuestState } from "@/lib/guest-privacy";
import { logger } from "@/lib/logger";

export async function GET(_: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const serverReceivedTime = new Date().toISOString();
  const { eventId } = await params;
  const participant = await requireParticipant(eventId);
  if (!participant) return NextResponse.json({ error: "Participation session expired." }, { status: 401 });

  const admin = createAdminClient();
  const { data: event, error: eventError } = await admin.from("events").select("id,title,status,phase,sequence_number,current_flight_item_id,current_trivia_question_id,tasting_opened_flight_item_id,reveal_at,timer_started_at,timer_ends_at,trivia_opened_at,trivia_closes_at,starts_at,location_mode,video_call_url,venue_name,venue_address,completed_at").eq("id", eventId).single();
  if (!event && eventError?.code === "PGRST116") return NextResponse.json({ error: "Event not found." }, { status: 404 });
  if (eventError) return stateLoadFailure(eventId, eventError);
  if (!event) return NextResponse.json({ error: "Event not found." }, { status: 404 });

  const { data: flight, error: flightError } = await admin.from("event_flight_items").select("id,position,reveal_title,reveal_description,brewing_instructions,steep_seconds,temperature_c,leaf_grams,water_ml,tea:teas(name,origin,producer,tea_type)").eq("event_id", eventId).order("position");
  if (flightError) return stateLoadFailure(eventId, flightError);
  const rawCurrent = (flight ?? []).find(item => item.id === event.current_flight_item_id) ?? null;
  const tastingIsOpen = Boolean(rawCurrent && event.tasting_opened_flight_item_id === rawCurrent.id);
  const betweenTeas = Boolean(rawCurrent && event.phase === "tasting" && !tastingIsOpen);
  const includeResults = ["recap", "ended"].includes(event.phase) || event.status === "completed";
  const revealVisible = Boolean(rawCurrent && (
    ["reveal", "brewing", "trivia", "recap", "ended"].includes(event.phase)
    || (event.phase === "tasting" && tastingIsOpen)
    || event.status === "completed"
  ));
  const current = revealVisible ? rawCurrent : null;

  const { data: responses, error: responsesError } = await admin.from("tea_responses").select("id,event_flight_item_id,first_impression,descriptors,intensity,rating,personal_notes,saved,completed_at,stamp_released_at").eq("participant_id", participant.id);
  if (responsesError) return stateLoadFailure(eventId, responsesError);
  let analytics: { average_rating: number | null } | null = null;
  if (includeResults) {
    const aggregateResult = await admin.from("event_analytics").select("average_rating").eq("event_id", eventId).maybeSingle();
    if (aggregateResult.error) return stateLoadFailure(eventId, aggregateResult.error);
    analytics = aggregateResult.data;
  }

  return NextResponse.json(protectGuestState({
    serverReceivedTime,
    serverTime: new Date().toISOString(),
    event,
    participant: {
      id: participant.id,
      displayName: participant.display_name,
      status: participant.status,
      linkedToAccount: Boolean(participant.user_id),
      hasEmail: Boolean(participant.email),
      maskedEmail: participant.email ? maskEmail(participant.email) : null
    },
    flightCount: flight?.length ?? 0,
    currentItem: current,
    currentPosition: rawCurrent?.position ?? 0,
    betweenTeas,
    // Keep the old response keys inert for clients already open during release.
    trivia: null,
    responses: responses ?? [],
    allItems: includeResults ? flight : undefined,
    analytics,
    participantTrivia: null
  }), { headers: { "Cache-Control": "private, no-store, max-age=0" } });
}

function stateLoadFailure(eventId: string, error: unknown) {
  logger.error("guest_state_load_failed", error, { eventId });
  return NextResponse.json({ error: "We couldn’t load the current tasting state." }, {
    status: 500,
    headers: { "Cache-Control": "private, no-store, max-age=0" }
  });
}
