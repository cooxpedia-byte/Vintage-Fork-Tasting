import type {SupabaseClient} from "@supabase/supabase-js";
import {cheersInvitation,cheersRichness,type CheersContext,type CheersStatus,type HostCheersSnapshot,type ParticipantCheersSnapshot} from "@/lib/cheers";

type CheersRow={
  id:string;context:string;invitation:string;opened_at:string;closes_at:string;resolve_at:string;
  status:string;sound_enabled:boolean;completed_at:string|null;
};

function derivedStatus(row:CheersRow,now:number):CheersStatus{
  if(row.status==="cancelled")return"cancelled";
  const resolveAt=new Date(row.resolve_at).getTime();
  if(now>=resolveAt+1_650)return"complete";
  if(now>=new Date(row.closes_at).getTime())return"resolving";
  return"open";
}

async function currentCheers(admin:SupabaseClient,eventId:string){
  const result=await admin.from("event_cheers_sessions").select("id,context,invitation,opened_at,closes_at,resolve_at,status,sound_enabled,completed_at")
    .eq("event_id",eventId).order("opened_at",{ascending:false}).limit(1).maybeSingle();
  if(result.error)throw result.error;
  const row=result.data as CheersRow|null;
  if(!row)return null;
  const now=Date.now();
  const status=derivedStatus(row,now);
  if(status!==row.status){
    const updateResult=await admin.from("event_cheers_sessions").update({status,completed_at:status==="complete"?new Date(now).toISOString():row.completed_at}).eq("id",row.id).eq("status",row.status);
    if(updateResult.error)throw updateResult.error;
  }
  if(status==="cancelled"||now>=new Date(row.resolve_at).getTime()+2_500)return null;
  return{...row,status};
}

async function cheersCounts(admin:SupabaseClient,eventId:string,cheersId:string){
  const [joinedResult,roomResult]=await Promise.all([
    admin.from("event_cheers_participations").select("participant_id",{count:"exact",head:true}).eq("cheers_id",cheersId),
    admin.from("participants").select("id",{count:"exact",head:true}).eq("event_id",eventId).in("status",["admitted","active"]).gte("last_seen_at",new Date(Date.now()-45_000).toISOString())
  ]);
  if(joinedResult.error)throw joinedResult.error;
  if(roomResult.error)throw roomResult.error;
  return{joinedCount:joinedResult.count??0,roomCount:roomResult.count??0};
}

function publicSnapshot(row:CheersRow&{status:CheersStatus},joined:boolean,joinedCount:number,roomCount:number):ParticipantCheersSnapshot{
  const context=(['first_sip','welcome_back','final','spontaneous'].includes(row.context)?row.context:'spontaneous') as CheersContext;
  return{
    id:row.id,context,invitation:row.invitation||cheersInvitation(context),openedAt:row.opened_at,closesAt:row.closes_at,
    resolveAt:row.resolve_at,status:row.status,joined,richness:cheersRichness(joinedCount,roomCount),soundEnabled:Boolean(row.sound_enabled)
  };
}

export async function loadParticipantCheers({admin,eventId,participantId}:{admin:SupabaseClient;eventId:string;participantId:string}):Promise<ParticipantCheersSnapshot|null>{
  const row=await currentCheers(admin,eventId);
  if(!row)return null;
  const [ownResult,counts]=await Promise.all([
    admin.from("event_cheers_participations").select("participant_id").eq("cheers_id",row.id).eq("participant_id",participantId).maybeSingle(),
    cheersCounts(admin,eventId,row.id)
  ]);
  if(ownResult.error)throw ownResult.error;
  return publicSnapshot(row,Boolean(ownResult.data),counts.joinedCount,counts.roomCount);
}

export async function loadHostCheers({admin,eventId}:{admin:SupabaseClient;eventId:string}):Promise<HostCheersSnapshot|null>{
  const row=await currentCheers(admin,eventId);
  if(!row)return null;
  const counts=await cheersCounts(admin,eventId,row.id);
  return{...publicSnapshot(row,false,counts.joinedCount,counts.roomCount),joinedCount:counts.joinedCount};
}
