import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireParticipant } from "@/lib/guest-token";
import { protectGuestState } from "@/lib/guest-privacy";
import { createTriviaDeadlineToken } from "@/lib/trivia-token";

export async function GET(_: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const serverReceivedTime = new Date().toISOString();
  const { eventId } = await params;
  const participant = await requireParticipant(eventId);
  if (!participant) return NextResponse.json({ error: "Participation session expired." }, { status: 401 });

  const admin = createAdminClient();
  const { data: event } = await admin.from("events").select("id,title,status,phase,sequence_number,current_flight_item_id,tasting_opened_flight_item_id,reveal_at,timer_started_at,timer_ends_at,trivia_opened_at,trivia_closes_at,starts_at,location_mode,video_call_url,venue_name,venue_address,completed_at").eq("id", eventId).single();
  if (!event) return NextResponse.json({ error: "Event not found." }, { status: 404 });

  const { data: flight } = await admin.from("event_flight_items").select("id,position,reveal_title,reveal_description,brewing_instructions,steep_seconds,temperature_c,leaf_grams,water_ml,tea:teas(name,origin,producer,tea_type)").eq("event_id", eventId).order("position");
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

  let trivia: Record<string, unknown> | null = null;
  if (rawCurrent && (event.phase === "trivia" || includeResults)) {
    const { data: question } = await admin.from("trivia_questions").select("id,question,options,correct_index,explanation,answer_window_seconds").eq("event_flight_item_id", rawCurrent.id).maybeSingle();
    if (question) {
      const { data: ownAnswer } = await admin.from("trivia_answers").select("selected_index").eq("participant_id", participant.id).eq("trivia_question_id", question.id).maybeSingle();
      const closed = Boolean(event.trivia_closes_at && new Date(event.trivia_closes_at).getTime() <= Date.now());
      trivia = {
        id: question.id,
        question: question.question,
        options: question.options,
        answerWindowSeconds: question.answer_window_seconds,
        flightItemId: rawCurrent.id,
        deadlineAt: event.trivia_closes_at,
        deadlineToken: event.trivia_closes_at && !closed && event.phase === "trivia" ? createTriviaDeadlineToken({
          eventId,
          participantId: participant.id,
          flightItemId: rawCurrent.id,
          questionId: question.id,
          deadlineAt: event.trivia_closes_at
        }) : null,
        selectedIndex: ownAnswer?.selected_index ?? null,
        closed,
        ...(closed ? { correctIndex: question.correct_index, explanation: question.explanation } : {})
      };
    }
  }

  const { data: responses } = await admin.from("tea_responses").select("id,event_flight_item_id,first_impression,descriptors,intensity,rating,personal_notes,saved,completed_at").eq("participant_id", participant.id);
  let analytics: {
    participants: number | null;
    completed_participants: number | null;
    average_rating: number | null;
    tea_saves: number | null;
    trivia_answers: number | null;
    trivia_correct: number | null;
  } | null = null;
  if (includeResults) {
    const { data: aggregate } = await admin.from("event_analytics").select("participants,completed_participants,average_rating,tea_saves,trivia_answers,trivia_correct").eq("event_id", eventId).maybeSingle();
    analytics = aggregate;
  }

  return NextResponse.json(protectGuestState({
    serverReceivedTime,
    serverTime: new Date().toISOString(),
    event,
    participant: { id: participant.id, displayName: participant.display_name, status: participant.status, linkedToAccount: Boolean(participant.user_id) },
    flightCount: flight?.length ?? 0,
    currentItem: current,
    currentPosition: rawCurrent?.position ?? 0,
    betweenTeas,
    trivia,
    responses: responses ?? [],
    allItems: includeResults ? flight : undefined,
    analytics
  }), { headers: { "Cache-Control": "private, no-store, max-age=0" } });
}
