import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireParticipant } from "@/lib/guest-token";
import { evaluateLiveResponseWindow } from "@/lib/live-response";
import { responseSchema } from "@/lib/validation";
import { logger } from "@/lib/logger";
import {refreshRoomDiscoveryCard} from "@/lib/discovery-cards-server";

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
      admin.from("events").select("phase,current_flight_item_id,tasting_opened_flight_item_id,status,conductor_stage,current_breakout_session_id").eq("id", eventId).single(),
      admin.from("event_flight_items").select("id").eq("id", parsed.data.flightItemId).eq("event_id", eventId).maybeSingle()
    ]);
    if (!flightItem) return NextResponse.json({ error: "That tea does not belong to this tasting." }, { status: 400 });
    const responseWindow = evaluateLiveResponseWindow(event, parsed.data.flightItemId);
    if (!responseWindow.allowed) return NextResponse.json({ error: responseWindow.message }, { status: 409 });
    const { data: existingResponse } = await admin.from("tea_responses").select("aroma_descriptors,aroma_intensity,first_impression,descriptors,intensity,rating,personal_notes,completed_at").eq("participant_id", participant.id).eq("event_flight_item_id", parsed.data.flightItemId).maybeSingle();
    const payload = {
      participant_id: participant.id,
      event_flight_item_id: parsed.data.flightItemId,
      aroma_descriptors: parsed.data.aromaDescriptors ?? existingResponse?.aroma_descriptors ?? [],
      aroma_intensity: parsed.data.aromaIntensity === undefined ? existingResponse?.aroma_intensity ?? null : parsed.data.aromaIntensity,
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
    const observation={aromaDescriptors:payload.aroma_descriptors,aromaIntensity:payload.aroma_intensity,firstImpression:payload.first_impression,descriptors:payload.descriptors,intensity:payload.intensity,rating:payload.rating,personalNotes:payload.personal_notes,completed:Boolean(payload.completed_at),conductorStage:event?.conductor_stage??null};
    const previousObservation=existingResponse?{aromaDescriptors:existingResponse.aroma_descriptors,aromaIntensity:existingResponse.aroma_intensity,firstImpression:existingResponse.first_impression,descriptors:existingResponse.descriptors,intensity:existingResponse.intensity,rating:existingResponse.rating,personalNotes:existingResponse.personal_notes,completed:Boolean(existingResponse.completed_at),conductorStage:event?.conductor_stage??null}:null;
    if(JSON.stringify(observation)!==JSON.stringify(previousObservation)){
      let breakoutRoomId:string|null=null;
      if(event?.current_breakout_session_id){
        const memberResult=await admin.from("event_breakout_members").select("breakout_room_id,status").eq("session_id",event.current_breakout_session_id).eq("participant_id",participant.id).maybeSingle();
        if(memberResult.error)throw memberResult.error;
        if(memberResult.data&&!['returned','failed','stayed_main'].includes(memberResult.data.status))breakoutRoomId=memberResult.data.breakout_room_id;
      }
      const revisionResult=await admin.from("tea_response_revisions").insert({participant_id:participant.id,event_flight_item_id:parsed.data.flightItemId,breakout_room_id:breakoutRoomId,source:breakoutRoomId?"breakout":["first_sip","explore"].includes(event?.conductor_stage??"")?"private":"main_room",observation});
      if(revisionResult.error)throw revisionResult.error;
      if(breakoutRoomId){
        try{await refreshRoomDiscoveryCard(admin,breakoutRoomId)}
        catch(cardError){logger.warn("room_discovery_refresh_failed",{eventId,breakoutRoomId,reason:cardError instanceof Error?cardError.message:"unknown"})}
      }
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error("tea_response_failed", error, { eventId });
    return NextResponse.json({ error: "We could not save that just now." }, { status: 500 });
  }
}
