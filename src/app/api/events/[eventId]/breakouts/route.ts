import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireParticipant } from "@/lib/guest-token";
import { logger } from "@/lib/logger";

const actionSchema=z.discriminatedUnion("action",[
  z.object({action:z.literal("signal"),signal:z.enum(["help","more_time","ready"])}),
  z.object({action:z.literal("mark_connected")}),
  z.object({action:z.literal("stay_main")}),
  z.object({action:z.literal("return")}),
  z.object({action:z.literal("snapshot"),snapshot:z.string().trim().max(500)})
]);

export async function POST(request:Request,{params}:{params:Promise<{eventId:string}>}){
  const {eventId}=await params;
  try{
    const participant=await requireParticipant(eventId);
    if(!participant||participant.status==="removed")return json({error:"Your current tasting seat is required."},401);
    const parsed=actionSchema.safeParse(await request.json().catch(()=>null));
    if(!parsed.success)return json({error:parsed.error.issues[0]?.message??"Invalid small-room action."},400);
    const admin=createAdminClient();
    const eventResult=await admin.from("events").select("current_breakout_session_id").eq("id",eventId).maybeSingle();
    if(eventResult.error)throw eventResult.error;
    const sessionId=eventResult.data?.current_breakout_session_id;
    if(!sessionId)return json({error:"The small tasting rooms have already returned."},409);
    const [sessionResult,memberResult]=await Promise.all([
      admin.from("event_breakout_sessions").select("id,status,starts_at,ends_at").eq("id",sessionId).eq("event_id",eventId).maybeSingle(),
      admin.from("event_breakout_members").select("breakout_room_id,status").eq("session_id",sessionId).eq("participant_id",participant.id).maybeSingle()
    ]);
    if(sessionResult.error)throw sessionResult.error;
    if(memberResult.error)throw memberResult.error;
    if(!sessionResult.data||!memberResult.data)return json({error:"No small tasting room is assigned to this seat."},409);
    const now=new Date().toISOString();
    const action=parsed.data;
    if(action.action==="signal"){
      if(sessionResult.data.status!=="active"||new Date(sessionResult.data.ends_at).getTime()<=Date.now())return json({error:"The tables are already returning."},409);
      const result=await admin.from("event_breakout_signals").upsert({
        session_id:sessionId,breakout_room_id:memberResult.data.breakout_room_id,participant_id:participant.id,
        signal:action.signal,updated_at:now
      },{onConflict:"session_id,participant_id"});
      if(result.error)throw result.error;
      return json({ok:true,signal:action.signal});
    }
    if(action.action==="snapshot"){
      const result=await admin.from("event_breakout_rooms").update({
        snapshot:action.snapshot||null,snapshot_submitted_by:action.snapshot?participant.id:null,
        snapshot_submitted_at:action.snapshot?now:null,updated_at:now
      }).eq("id",memberResult.data.breakout_room_id).eq("session_id",sessionId);
      if(result.error)throw result.error;
      return json({ok:true});
    }
    const status=action.action==="mark_connected"
      ? "connected"
      : action.action==="stay_main"
        ? "stayed_main"
        : "returned";
    const patch:Record<string,unknown>={status,updated_at:now};
    if(status==="connected")patch.joined_at=now;
    if(status==="returned")patch.returned_at=now;
    const result=await admin.from("event_breakout_members").update(patch).eq("session_id",sessionId).eq("participant_id",participant.id);
    if(result.error)throw result.error;
    return json({ok:true,status});
  }catch(error){
    logger.error("breakout_guest_action_failed",error,{eventId});
    return json({error:"That small tasting room action could not be completed."},500);
  }
}

function json(body:unknown,status=200){
  return NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store, max-age=0"}});
}
