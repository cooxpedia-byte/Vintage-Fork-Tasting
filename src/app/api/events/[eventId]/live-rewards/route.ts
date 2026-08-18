import {NextResponse} from "next/server";
import {canManageAgoraEvent} from "@/lib/agora";
import {requireParticipant} from "@/lib/guest-token";
import {loadHostLiveRewards,loadParticipantLiveRewards,processCompletedLiveRewards} from "@/lib/live-rewards-server";
import {logger} from "@/lib/logger";
import {createAdminClient} from "@/lib/supabase/admin";
import {createRequestClient} from "@/lib/supabase/request-auth";

export async function GET(request:Request,{params}:{params:Promise<{eventId:string}>}){
  const{eventId}=await params;
  try{
    const admin=createAdminClient();
    const[{client:supabase,user},eventResult]=await Promise.all([
      createRequestClient(request),
      admin.from("events").select("id,status,phase,owner_user_id,host_user_id,backup_host_user_id").eq("id",eventId).maybeSingle()
    ]);
    if(eventResult.error)throw eventResult.error;
    if(!eventResult.data)return response({error:"Tasting not found."},404);
    if(user){
      const profileResult=await supabase.from("profiles").select("role").eq("id",user.id).maybeSingle();
      if(profileResult.error)throw profileResult.error;
      if(canManageAgoraEvent(user.id,profileResult.data?.role,eventResult.data)){
        return response({viewer:"host",snapshot:await loadHostLiveRewards({admin,eventId})});
      }
    }
    const participant=await requireParticipant(eventId);
    if(!participant||participant.status==="removed")return response({error:"A current tasting seat is required."},401);
    if(eventResult.data.status==="completed"){
      try{await processCompletedLiveRewards(admin,eventId)}
      catch(processError){logger.warn("live_reward_reconcile_deferred",{eventId,reason:processError instanceof Error?processError.message:"unknown"})}
    }
    return response({viewer:"guest",snapshot:await loadParticipantLiveRewards({admin,eventId,userId:participant.user_id??null})});
  }catch(error){
    logger.error("live_reward_state_failed",error,{eventId});
    return response({error:"Your Gold Leaves could not be loaded. The tasting is unaffected."},503);
  }
}

function response(body:Record<string,unknown>,status=200){
  return NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store, max-age=0"}});
}
