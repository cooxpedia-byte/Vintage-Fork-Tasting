import {NextResponse} from "next/server";
import {loadEventDiscoveryIdentitySnapshot,recalculateDiscoveryIdentities} from "@/lib/discovery-identity-server";
import {requireParticipant} from "@/lib/guest-token";
import {logger} from "@/lib/logger";
import {createAdminClient} from "@/lib/supabase/admin";

export async function GET(_request:Request,{params}:{params:Promise<{eventId:string}>}){
  const{eventId}=await params;
  try{
    const participant=await requireParticipant(eventId);
    if(!participant||participant.status==="removed")return response({error:"A current tasting seat is required."},401);
    const admin=createAdminClient();
    const eventResult=await admin.from("events").select("status,phase").eq("id",eventId).maybeSingle();
    if(eventResult.error)throw eventResult.error;
    if(!eventResult.data)return response({error:"Tasting not found."},404);
    if(participant.user_id&&eventResult.data.status==="completed"){
      try{await recalculateDiscoveryIdentities(admin,participant.user_id,eventId)}
      catch(recalculationError){logger.warn("discovery_identity_reconcile_deferred",{eventId,userId:participant.user_id,reason:recalculationError instanceof Error?recalculationError.message:"unknown"})}
    }
    return response({snapshot:await loadEventDiscoveryIdentitySnapshot(admin,eventId,participant.user_id??null)});
  }catch(error){logger.error("event_discovery_identity_load_failed",error,{eventId});return response({error:"Discovery identity is quietly unavailable. The tasting is unaffected."},503)}
}

function response(body:Record<string,unknown>,status=200){return NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store, max-age=0"}})}
