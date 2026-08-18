import {NextResponse} from "next/server";
import {canManageAgoraEvent} from "@/lib/agora";
import {loadEligibleConversationPrompts} from "@/lib/conversation-prompts-server";
import {promptSuggestions} from "@/lib/conversation-prompts";
import {logger} from "@/lib/logger";
import {createAdminClient} from "@/lib/supabase/admin";
import {createRequestClient} from "@/lib/supabase/request-auth";
import type {ConductorStage} from "@/types/domain";

export async function GET(request:Request,{params}:{params:Promise<{eventId:string}>}){
  const{eventId}=await params;
  try{
    const admin=createAdminClient();
    const[{client:supabase,user},eventResult]=await Promise.all([
      createRequestClient(request),
      admin.from("events").select("id,status,phase,owner_user_id,host_user_id,backup_host_user_id,current_flight_item_id,current_breakout_session_id,conductor_stage,conversation_prompts_enabled").eq("id",eventId).maybeSingle()
    ]);
    if(eventResult.error)throw eventResult.error;
    if(!eventResult.data)return response({error:"Tasting not found."},404);
    if(!user)return response({error:"Authentication required."},401);
    const profileResult=await supabase.from("profiles").select("role").eq("id",user.id).maybeSingle();
    if(profileResult.error)throw profileResult.error;
    if(!canManageAgoraEvent(user.id,profileResult.data?.role,eventResult.data))return response({error:"You cannot view host prompts for this tasting."},403);
    const event=eventResult.data;
    const stage=event.conductor_stage as ConductorStage;
    const eligible=await loadEligibleConversationPrompts({admin,stage,audience:"host",revealVisible:["reveal","debrief","close_tea"].includes(stage)});
    const offset=Number(new URL(request.url).searchParams.get("offset")??0);
    const activeResult=event.current_flight_item_id
      ? await admin.from("event_conversation_prompts").select("audience,breakout_room_id").eq("event_id",eventId).eq("event_flight_item_id",event.current_flight_item_id).eq("status","active")
      : {data:[],error:null};
    if(activeResult.error)throw activeResult.error;
    return response({
      enabled:Boolean(event.conversation_prompts_enabled),stage,
      suggestions:promptSuggestions(eligible,stage,Number.isFinite(offset)?offset:0),
      active:{main:Boolean((activeResult.data??[]).some(item=>item.audience==="main")),breakoutCount:(activeResult.data??[]).filter(item=>item.audience==="breakout").length},
      breakoutsActive:Boolean(event.current_breakout_session_id)
    });
  }catch(error){
    logger.error("conversation_prompt_host_load_failed",error,{eventId});
    return response({error:"Private host suggestions could not be loaded. The tasting is unaffected."},500);
  }
}

function response(body:unknown,status=200){return NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store, max-age=0"}})}
