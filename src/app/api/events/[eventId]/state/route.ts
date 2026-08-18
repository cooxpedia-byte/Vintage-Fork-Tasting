import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireParticipant } from "@/lib/guest-token";
import { maskEmail, protectGuestState } from "@/lib/guest-privacy";
import { logger } from "@/lib/logger";
import { createTriviaDeadlineToken } from "@/lib/trivia-token";
import type {BreakoutState} from "@/lib/breakouts";
import {loadParticipantDiscoveryBoard} from "@/lib/discovery-board-server";
import {loadGroupRevealSnapshot} from "@/lib/group-reveal-server";
import {loadParticipantCheers} from "@/lib/cheers-server";

export async function GET(_: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const serverReceivedTime = new Date().toISOString();
  const { eventId } = await params;
  const participant = await requireParticipant(eventId);
  if (!participant) return NextResponse.json({ error: "Participation session expired." }, { status: 401 });

  const admin = createAdminClient();
  const { data: event, error: eventError } = await admin.from("events").select("id,title,status,phase,sequence_number,current_flight_item_id,current_trivia_question_id,tasting_opened_flight_item_id,reveal_at,timer_started_at,timer_ends_at,trivia_opened_at,trivia_closes_at,starts_at,location_mode,video_call_url,venue_name,venue_address,completed_at,conductor_stage,conductor_stage_started_at,conductor_stage_duration_seconds,conductor_paused_at,conductor_remaining_seconds,conductor_sequence_version,current_brew_id,current_breakout_session_id").eq("id", eventId).single();
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
    event.conductor_stage !== "arrival"
    ||
    ["reveal", "brewing", "trivia", "recap", "ended"].includes(event.phase)
    || (event.phase === "tasting" && tastingIsOpen)
    || event.status === "completed"
  ));
  const current = revealVisible ? rawCurrent : null;
  const ownStageSignalResult = rawCurrent && ["prepare", "brew"].includes(event.conductor_stage)
    ? await admin.from("event_stage_signals").select("signal").eq("event_id", eventId).eq("participant_id", participant.id).eq("event_flight_item_id", rawCurrent.id).eq("stage", event.conductor_stage).maybeSingle()
    : { data: null, error: null };
  if (ownStageSignalResult.error) return stateLoadFailure(eventId, ownStageSignalResult.error);
  const currentBrewResult = event.current_brew_id
    ? await admin.from("event_brews").select("id,event_id,event_flight_item_id,infusion_number,started_at,duration_ms,status,paused_at,accumulated_pause_ms,host_id,completed_at").eq("id", event.current_brew_id).maybeSingle()
    : { data: null, error: null };
  if (currentBrewResult.error) return stateLoadFailure(eventId, currentBrewResult.error);
  const brewNoteResult = currentBrewResult.data
    ? await admin.from("participant_brew_notes").select("note").eq("participant_id",participant.id).eq("event_brew_id",currentBrewResult.data.id).maybeSingle()
    : {data:null,error:null};
  if(brewNoteResult.error)return stateLoadFailure(eventId,brewNoteResult.error);

  let breakout:BreakoutState|null=null;
  if(event.current_breakout_session_id){
    const [sessionResult,memberResult]=await Promise.all([
      admin.from("event_breakout_sessions").select("id,event_id,event_flight_item_id,origin_stage,status,room_size,assignment_mode,prompt,starts_at,ends_at,host_id,completed_at").eq("id",event.current_breakout_session_id).eq("event_id",eventId).maybeSingle(),
      admin.from("event_breakout_members").select("breakout_room_id,status").eq("session_id",event.current_breakout_session_id).eq("participant_id",participant.id).maybeSingle()
    ]);
    if(sessionResult.error)return stateLoadFailure(eventId,sessionResult.error);
    if(memberResult.error)return stateLoadFailure(eventId,memberResult.error);
    if(sessionResult.data&&memberResult.data){
      const [roomResult,membersResult,signalResult]=await Promise.all([
        admin.from("event_breakout_rooms").select("id,session_id,event_id,room_number,prompt,status,snapshot").eq("id",memberResult.data.breakout_room_id).maybeSingle(),
        admin.from("event_breakout_members").select("participant_id,status,participant:participants(display_name)").eq("session_id",event.current_breakout_session_id).eq("breakout_room_id",memberResult.data.breakout_room_id),
        admin.from("event_breakout_signals").select("signal").eq("session_id",event.current_breakout_session_id).eq("participant_id",participant.id).maybeSingle()
      ]);
      if(roomResult.error)return stateLoadFailure(eventId,roomResult.error);
      if(membersResult.error)return stateLoadFailure(eventId,membersResult.error);
      if(signalResult.error)return stateLoadFailure(eventId,signalResult.error);
      if(roomResult.data)breakout={
        session:sessionResult.data,
        room:roomResult.data,
        memberStatus:memberResult.data.status,
        members:(membersResult.data??[]).map(member=>{
          const relation=member.participant as unknown as {display_name?:string}|Array<{display_name?:string}>|null;
          return{id:member.participant_id,displayName:(Array.isArray(relation)?relation[0]?.display_name:relation?.display_name)??"Guest",status:member.status};
        }),
        signal:signalResult.data?.signal??null
      };
    }
  }

  let trivia: Record<string, unknown> | null = null;
  if (rawCurrent && event.current_trivia_question_id && (event.phase === "trivia" || includeResults)) {
    const { data: questions, error: questionsError } = await admin.from("trivia_questions").select("id,position,question,options,correct_index,explanation,answer_window_seconds").eq("event_flight_item_id", rawCurrent.id).order("position");
    if (questionsError) return stateLoadFailure(eventId, questionsError);
    const questionIndex = (questions ?? []).findIndex(candidate => candidate.id === event.current_trivia_question_id);
    const question = questionIndex >= 0 ? questions?.[questionIndex] : null;
    if (question) {
      const { data: ownAnswer, error: ownAnswerError } = await admin.from("trivia_answers").select("selected_index").eq("participant_id", participant.id).eq("trivia_question_id", question.id).maybeSingle();
      if (ownAnswerError) return stateLoadFailure(eventId, ownAnswerError);
      const closed = Boolean(event.trivia_closes_at && new Date(event.trivia_closes_at).getTime() <= Date.now());
      trivia = {
        id: question.id,
        question: question.question,
        options: question.options,
        questionNumber: questionIndex + 1,
        questionTotal: questions?.length ?? 1,
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

  const { data: responses, error: responsesError } = await admin.from("tea_responses").select("id,event_flight_item_id,aroma_descriptors,aroma_intensity,first_impression,descriptors,intensity,rating,personal_notes,saved,completed_at,stamp_released_at").eq("participant_id", participant.id);
  if (responsesError) return stateLoadFailure(eventId, responsesError);
  let discoveryBoard:Awaited<ReturnType<typeof loadParticipantDiscoveryBoard>>=null;
  try{discoveryBoard=await loadParticipantDiscoveryBoard({admin,eventId,eventFlightItemId:rawCurrent?.id??null,participantId:participant.id})}
  catch(discoveryError){return stateLoadFailure(eventId,discoveryError)}
  let groupReveal:Awaited<ReturnType<typeof loadGroupRevealSnapshot>>=null;
  try{groupReveal=await loadGroupRevealSnapshot({admin,eventId,eventFlightItemId:rawCurrent?.id??null,participantId:participant.id})}
  catch(revealError){return stateLoadFailure(eventId,revealError)}
  let cheers:Awaited<ReturnType<typeof loadParticipantCheers>>=null;
  try{cheers=await loadParticipantCheers({admin,eventId,participantId:participant.id})}
  catch(cheersError){return stateLoadFailure(eventId,cheersError)}
  let analytics: { average_rating: number | null } | null = null;
  let participantTrivia: { answered: number; correct: number; total: number } | null = null;
  if (includeResults) {
    const flightIds = (flight ?? []).map(item => item.id);
    const [aggregateResult, questionResult] = await Promise.all([
      admin.from("event_analytics").select("average_rating").eq("event_id", eventId).maybeSingle(),
      flightIds.length
        ? admin.from("trivia_questions").select("id").in("event_flight_item_id", flightIds)
        : Promise.resolve({ data: [], error: null })
    ]);
    if (aggregateResult.error) return stateLoadFailure(eventId, aggregateResult.error);
    if (questionResult.error) return stateLoadFailure(eventId, questionResult.error);
    analytics = aggregateResult.data;
    const questionIds = (questionResult.data ?? []).map(question => question.id);
    const ownTriviaResult = questionIds.length
      ? await admin.from("trivia_answers").select("is_correct,on_time").eq("participant_id", participant.id).in("trivia_question_id", questionIds)
      : { data: [], error: null };
    if (ownTriviaResult.error) return stateLoadFailure(eventId, ownTriviaResult.error);
    const ownTriviaAnswers = ownTriviaResult.data;
    const countedAnswers = (ownTriviaAnswers ?? []).filter(answer => answer.on_time);
    participantTrivia = {
      answered: countedAnswers.length,
      correct: countedAnswers.filter(answer => answer.is_correct).length,
      total: questionIds.length
    };
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
    stageSignal: ownStageSignalResult.data?.signal ?? null,
    brew: currentBrewResult.data,
    brewNote: brewNoteResult.data?.note??"",
    breakout,
    discoveryBoard,
    groupReveal,
    cheers,
    trivia,
    responses: responses ?? [],
    allItems: includeResults ? flight : undefined,
    analytics,
    participantTrivia
  }), { headers: { "Cache-Control": "private, no-store, max-age=0" } });
}

function stateLoadFailure(eventId: string, error: unknown) {
  logger.error("guest_state_load_failed", error, { eventId });
  return NextResponse.json({ error: "We couldn’t load the current tasting state." }, {
    status: 500,
    headers: { "Cache-Control": "private, no-store, max-age=0" }
  });
}
