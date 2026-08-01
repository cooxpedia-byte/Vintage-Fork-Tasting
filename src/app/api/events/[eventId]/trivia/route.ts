import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireParticipant } from "@/lib/guest-token";
import { logger } from "@/lib/logger";

export async function POST(request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  try {
    const participant = await requireParticipant(eventId);
    if (!participant) return NextResponse.json({ error: "Participation session expired." }, { status: 401 });
    if (participant.status === "removed") return NextResponse.json({ error: "You were removed from this tasting." }, { status: 403 });

    const body = await request.json();
    if (!Number.isInteger(body.selectedIndex) || body.selectedIndex < 0) return NextResponse.json({ error: "Choose an answer." }, { status: 400 });
    const admin = createAdminClient();
    await admin.from("participants").update({ status: "active", last_seen_at: new Date().toISOString() }).eq("id", participant.id);

    const { data: event } = await admin.from("events").select("phase,current_flight_item_id,tasting_opened_flight_item_id,trivia_closes_at").eq("id", eventId).single();
    if (!event || event.phase !== "trivia" || !event.current_flight_item_id || event.tasting_opened_flight_item_id !== event.current_flight_item_id || (event.trivia_closes_at && new Date(event.trivia_closes_at) <= new Date())) {
      return NextResponse.json({ error: "This question is closed." }, { status: 409 });
    }

    const { data: question } = await admin.from("trivia_questions").select("id,correct_index,options").eq("event_flight_item_id", event.current_flight_item_id).single();
    if (!question) return NextResponse.json({ error: "No question is open." }, { status: 404 });
    const options = Array.isArray(question.options) ? question.options : [];
    if (body.selectedIndex >= options.length) return NextResponse.json({ error: "Choose one of the available answers." }, { status: 400 });

    const { data: existing } = await admin.from("trivia_answers").select("selected_index").eq("participant_id", participant.id).eq("trivia_question_id", question.id).maybeSingle();
    if (existing) return NextResponse.json({ locked: true, selectedIndex: existing.selected_index });

    const { error } = await admin.from("trivia_answers").insert({
      participant_id: participant.id,
      trivia_question_id: question.id,
      selected_index: body.selectedIndex,
      is_correct: body.selectedIndex === question.correct_index
    });
    if (error) {
      if (error.code === "23505") {
        const { data: raced } = await admin.from("trivia_answers").select("selected_index").eq("participant_id", participant.id).eq("trivia_question_id", question.id).single();
        return NextResponse.json({ locked: true, selectedIndex: raced?.selected_index ?? body.selectedIndex });
      }
      throw error;
    }
    return NextResponse.json({ locked: true, selectedIndex: body.selectedIndex });
  } catch (error) {
    logger.error("trivia_answer_failed", error, { eventId });
    return NextResponse.json({ error: "We could not lock that answer." }, { status: 500 });
  }
}
