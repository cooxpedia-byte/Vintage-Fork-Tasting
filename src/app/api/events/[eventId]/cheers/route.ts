import {NextResponse} from "next/server";
import {z} from "zod";
import {canManageAgoraEvent} from "@/lib/agora";
import {loadHostCheers,loadParticipantCheers} from "@/lib/cheers-server";
import {requireParticipant} from "@/lib/guest-token";
import {logger} from "@/lib/logger";
import {createAdminClient} from "@/lib/supabase/admin";
import {createRequestClient} from "@/lib/supabase/request-auth";

const joinSchema=z.object({cheersId:z.string().uuid(),clientId:z.string().uuid()});

export async function GET(request:Request,{params}:{params:Promise<{eventId:string}>}){
  const{eventId}=await params;
  try{
    const admin=createAdminClient();
    const[{client:supabase,user},eventResult]=await Promise.all([
      createRequestClient(request),
      admin.from("events").select("id,owner_user_id,host_user_id,backup_host_user_id").eq("id",eventId).maybeSingle()
    ]);
    if(eventResult.error)throw eventResult.error;
    if(!eventResult.data)return response({error:"Tasting not found."},404);
    if(user){
      const profileResult=await supabase.from("profiles").select("role").eq("id",user.id).maybeSingle();
      if(profileResult.error)throw profileResult.error;
      if(canManageAgoraEvent(user.id,profileResult.data?.role,eventResult.data)){
        return response({viewer:"host",snapshot:await loadHostCheers({admin,eventId})});
      }
    }
    const participant=await requireParticipant(eventId);
    if(!participant||participant.status==="removed")return response({error:"A current tasting seat is required."},401);
    return response({viewer:"guest",snapshot:await loadParticipantCheers({admin,eventId,participantId:participant.id})});
  }catch(error){
    logger.error("cheers_state_failed",error,{eventId});
    return response({error:"The shared Cheers moment could not be loaded."},500);
  }
}

export async function POST(request:Request,{params}:{params:Promise<{eventId:string}>}){
  const{eventId}=await params;
  try{
    const participant=await requireParticipant(eventId);
    if(!participant)return response({error:"Participation session expired."},401);
    if(participant.status==="removed")return response({error:"You were removed from this tasting."},403);
    const parsed=joinSchema.safeParse(await request.json());
    if(!parsed.success)return response({error:"That Cheers tap was not valid."},400);
    const admin=createAdminClient();
    const sessionResult=await admin.from("event_cheers_sessions").select("id,event_id,opened_at,closes_at,status").eq("id",parsed.data.cheersId).eq("event_id",eventId).maybeSingle();
    if(sessionResult.error)throw sessionResult.error;
    const session=sessionResult.data;
    const now=Date.now();
    if(!session||session.status!=="open"||now<new Date(session.opened_at).getTime()||now>new Date(session.closes_at).getTime()){
      return response({joined:false,closed:true});
    }
    const tapDelayMs=Math.max(0,Math.min(2_147_483_647,now-new Date(session.opened_at).getTime()));
    const joinResult=await admin.from("event_cheers_participations").upsert({
      cheers_id:session.id,participant_id:participant.id,client_id:parsed.data.clientId,tapped_at:new Date(now).toISOString(),tap_delay_ms:tapDelayMs
    },{onConflict:"cheers_id,participant_id",ignoreDuplicates:true});
    if(joinResult.error)throw joinResult.error;
    await admin.from("participants").update({status:"active",last_seen_at:new Date(now).toISOString()}).eq("id",participant.id);
    return response({joined:true});
  }catch(error){
    logger.error("cheers_join_failed",error,{eventId});
    return response({error:"Your cup is still raised. The room connection could not confirm the tap."},500);
  }
}

function response(body:Record<string,unknown>,status=200){
  return NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store, max-age=0"}});
}
