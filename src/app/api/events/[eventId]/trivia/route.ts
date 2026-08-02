import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireParticipant } from "@/lib/guest-token";
import { logger } from "@/lib/logger";
import { z } from "zod";
import { triviaDeliveryStatus } from "@/lib/live-timing";
import { verifyTriviaDeadlineToken } from "@/lib/trivia-token";

const answerSchema = z.object({
  selectedIndex: z.number().int().nonnegative(),
  deadlineToken: z.string().min(32),
  answeredAt: z.string().datetime({ offset: true }),
  idempotencyKey: z.string().uuid()
});

export async function POST(request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  try {
    const participant = await requireParticipant(eventId);
    if (!participant) return NextResponse.json({ error: "Participation session expired." }, { status: 401 });
    if (participant.status === "removed") return NextResponse.json({ error: "You were removed from this tasting." }, { status: 403 });

    const parsed = answerSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "That answer could not be verified." }, { status: 400 });
    const body = parsed.data;
    const admin = createAdminClient();
    await admin.from("participants").update({ status: "active", last_seen_at: new Date().toISOString() }).eq("id", participant.id);

    const claims = verifyTriviaDeadlineToken(body.deadlineToken);
    if (!claims || claims.eventId !== eventId || claims.participantId !== participant.id) return NextResponse.json({ error: "That question token is not valid for this tasting." }, { status: 403 });

    const { data: question } = await admin.from("trivia_questions").select("id,correct_index,options,event_flight_item:event_flight_items!inner(id,event_id)").eq("id", claims.questionId).eq("event_flight_item_id", claims.flightItemId).single();
    if (!question) return NextResponse.json({ error: "No question is open." }, { status: 404 });
    const questionFlight = Array.isArray(question.event_flight_item) ? question.event_flight_item[0] : question.event_flight_item;
    if (!questionFlight || questionFlight.event_id !== eventId) return NextResponse.json({ error: "That question does not belong to this tasting." }, { status: 403 });
    const options = Array.isArray(question.options) ? question.options : [];
    if (body.selectedIndex >= options.length) return NextResponse.json({ error: "Choose one of the available answers." }, { status: 400 });

    const { data: existing } = await admin.from("trivia_answers").select("selected_index,on_time").eq("participant_id", participant.id).eq("trivia_question_id", question.id).maybeSingle();
    if (existing) return NextResponse.json({ locked: true, selectedIndex: existing.selected_index, onTime: existing.on_time });

    const delivery = triviaDeliveryStatus(claims.deadlineAt, body.answeredAt, Date.now());
    if (!delivery.accepted) return NextResponse.json({ error: "That answer timestamp is invalid." }, { status: 400 });

    const { error } = await admin.from("trivia_answers").insert({
      participant_id: participant.id,
      trivia_question_id: question.id,
      selected_index: body.selectedIndex,
      is_correct: body.selectedIndex === question.correct_index,
      idempotency_key: body.idempotencyKey,
      original_answered_at: body.answeredAt,
      on_time: delivery.onTime
    });
    if (error) {
      if (error.code === "23505") {
        const { data: raced } = await admin.from("trivia_answers").select("selected_index,on_time").eq("participant_id", participant.id).eq("trivia_question_id", question.id).single();
        if (raced) return NextResponse.json({ locked: true, selectedIndex: raced.selected_index, onTime: raced.on_time });
        return NextResponse.json({ error:"That answer retry key was already used." },{ status:409 });
      }
      throw error;
    }
    return NextResponse.json({ locked: true, selectedIndex: body.selectedIndex, onTime: delivery.onTime });
  } catch (error) {
    logger.error("trivia_answer_failed", error, { eventId });
    return NextResponse.json({ error: "We could not lock that answer." }, { status: 500 });
  }
}
