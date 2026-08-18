import { NextResponse } from "next/server";
import {
  AGORA_TOKEN_TTL_SECONDS,
  agoraBreakoutChannelName,
  agoraChannelName,
  agoraUserAccount,
  canManageAgoraEvent,
  createAgoraRtcToken,
  getAgoraConfiguration
} from "@/lib/agora";
import { requireParticipant } from "@/lib/guest-token";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { createRequestClient } from "@/lib/supabase/request-auth";

export async function POST(request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  try {
    const requestBody=await request.json().catch(()=>({})) as {breakoutRoomId?:unknown};
    const requestedBreakoutRoomId=typeof requestBody.breakoutRoomId==="string"?requestBody.breakoutRoomId:null;
    const admin = createAdminClient();
    const [{ client: supabase, user }, eventResult, participant] = await Promise.all([
      createRequestClient(request),
      admin
        .from("events")
        .select("id,status,phase,location_mode,owner_user_id,host_user_id,backup_host_user_id,current_breakout_session_id")
        .eq("id", eventId)
        .maybeSingle(),
      requireParticipant(eventId)
    ]);
    const { data: event, error } = eventResult;
    if (error) throw error;

    let identity: { kind: "host" | "guest"; id: string } | null = null;
    if (user && event) {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      if (profileError) throw profileError;
      if (canManageAgoraEvent(user.id, profile?.role, event)) identity = { kind: "host", id: user.id };
    }
    if (!identity && participant && participant.status !== "removed") {
      identity = { kind: "guest", id: participant.id };
    }
    if (!identity) return response({ error: "A current tasting seat or staff sign-in is required." }, 401);
    if (!event) return response({ error: "Tasting not found." }, 404);
    if (event.location_mode !== "remote") return response({ error: "Video is only available for remote tastings." }, 409);
    if (!["scheduled", "live"].includes(event.status) || event.phase === "ended") {
      return response({ error: "This video room is closed." }, 409);
    }

    const config = getAgoraConfiguration();
    if (!config) {
      return response({ error: "Video is waiting for its final secure configuration." }, 503);
    }

    let channel=agoraChannelName(eventId);
    if(requestedBreakoutRoomId){
      if(identity.kind!=="guest"||!participant)return response({error:"Only an assigned tasting guest can enter that small room."},403);
      if(!event.current_breakout_session_id)return response({error:"That small tasting room has already returned."},409);
      const [sessionResult,memberResult]=await Promise.all([
        admin.from("event_breakout_sessions").select("status,ends_at").eq("id",event.current_breakout_session_id).eq("event_id",eventId).maybeSingle(),
        admin.from("event_breakout_members").select("breakout_room_id,status").eq("session_id",event.current_breakout_session_id).eq("participant_id",participant.id).maybeSingle()
      ]);
      if(sessionResult.error)throw sessionResult.error;
      if(memberResult.error)throw memberResult.error;
      const session=sessionResult.data;
      const member=memberResult.data;
      if(!session||!member||member.breakout_room_id!==requestedBreakoutRoomId||member.status==="stayed_main"||member.status==="returned"){
        return response({error:"That small tasting room is not assigned to this seat."},403);
      }
      if(session.status!=="active"||new Date(session.ends_at).getTime()<=Date.now())return response({error:"That small tasting room is returning to the main tasting."},409);
      if(member.status!=="connected"){
        const joiningResult=await admin.from("event_breakout_members").update({status:"joining",updated_at:new Date().toISOString()}).eq("session_id",event.current_breakout_session_id).eq("participant_id",participant.id);
        if(joiningResult.error)throw joiningResult.error;
      }
      channel=agoraBreakoutChannelName(eventId,requestedBreakoutRoomId);
    }
    const account = agoraUserAccount(identity.kind, identity.id);
    const token = createAgoraRtcToken({ ...config, channel, account });
    return response({
      appId: config.appId,
      channel,
      account,
      token,
      expiresAt: new Date(Date.now() + AGORA_TOKEN_TTL_SECONDS * 1000).toISOString()
    });
  } catch (error) {
    logger.error("agora_token_issue_failed", error, { eventId });
    return response({ error: "The secure video room could not be opened." }, 500);
  }
}

function response(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0" }
  });
}
