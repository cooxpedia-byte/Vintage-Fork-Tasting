import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createRequestClient } from "@/lib/supabase/request-auth";
import { requireParticipant } from "@/lib/guest-token";
import type { CommunicationViewer } from "@/lib/live-communication";

type CommunicationEvent = {
  id: string;
  title: string;
  status: string;
  phase: string;
  current_flight_item_id: string | null;
  owner_user_id: string;
  host_user_id: string | null;
  backup_host_user_id: string | null;
  current_breakout_session_id:string|null;
};

export type CommunicationContext = {
  event: CommunicationEvent;
  viewer: CommunicationViewer;
  breakoutRoomId:string|null;
};

export async function resolveCommunicationContext(request: Request, eventId: string): Promise<CommunicationContext | null> {
  const admin = createAdminClient();
  const [{ user }, eventResult, participant] = await Promise.all([
    createRequestClient(request),
    admin.from("events").select("id,title,status,phase,current_flight_item_id,owner_user_id,host_user_id,backup_host_user_id,current_breakout_session_id").eq("id", eventId).maybeSingle(),
    requireParticipant(eventId)
  ]);
  if (eventResult.error) throw eventResult.error;
  const event = eventResult.data as CommunicationEvent | null;
  if (!event || !user) return null;

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("role,display_name")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) throw profileError;

  const role = profile?.role ?? null;
  const canModerate = role === "admin" || (
    role === "host" && [event.owner_user_id, event.host_user_id, event.backup_host_user_id].includes(user.id)
  );
  if (canModerate) {
    return {
      event,
      breakoutRoomId:null,
      viewer: {
        kind: "host",
        id: user.id,
        userId: user.id,
        displayName: profile?.display_name ?? user.email ?? "Vintage Fork host",
        canModerate: true
      }
    };
  }

  if (!participant || participant.status === "removed" || participant.user_id !== user.id) return null;
  let breakoutRoomId:string|null=null;
  if(event.current_breakout_session_id){
    const [sessionResult,memberResult]=await Promise.all([
      admin.from("event_breakout_sessions").select("status,ends_at").eq("id",event.current_breakout_session_id).maybeSingle(),
      admin.from("event_breakout_members").select("breakout_room_id,status").eq("session_id",event.current_breakout_session_id).eq("participant_id",participant.id).maybeSingle()
    ]);
    if(sessionResult.error)throw sessionResult.error;
    if(memberResult.error)throw memberResult.error;
    if(sessionResult.data?.status==="active"&&new Date(sessionResult.data.ends_at).getTime()>Date.now()&&memberResult.data&&!['returned','failed','stayed_main'].includes(memberResult.data.status))breakoutRoomId=memberResult.data.breakout_room_id;
  }
  return {
    event,
    breakoutRoomId,
    viewer: {
      kind: "guest",
      id: participant.id,
      userId: user.id,
      displayName: participant.display_name,
      canModerate: false
    }
  };
}

export function communicationSenderKey(viewer: CommunicationViewer) {
  return `${viewer.kind}:${viewer.id}`;
}

export function canWriteCommunication(event: Pick<CommunicationEvent, "status" | "phase">) {
  return ["scheduled", "live"].includes(event.status) && event.phase !== "ended";
}
