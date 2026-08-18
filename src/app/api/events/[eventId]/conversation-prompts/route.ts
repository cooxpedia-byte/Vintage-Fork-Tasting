import {NextResponse} from "next/server";
import {z} from "zod";
import {actOnParticipantConversationPrompt,loadParticipantConversationPrompt} from "@/lib/conversation-prompts-server";
import {requireParticipant} from "@/lib/guest-token";
import {logger} from "@/lib/logger";
import {createAdminClient} from "@/lib/supabase/admin";

const actionSchema=z.object({
  action:z.enum(["dismiss","another","promote_curiosity"]),
  instanceId:z.string().uuid()
});

export async function GET(_:Request,{params}:{params:Promise<{eventId:string}>}){
  const{eventId}=await params;
  try{
    const participant=await requireParticipant(eventId);
    if(!participant||participant.status==="removed")return response({error:"A current tasting seat is required."},401);
    return response(await loadParticipantConversationPrompt({admin:createAdminClient(),eventId,participantId:participant.id}));
  }catch(error){
    logger.warn("conversation_prompt_guest_load_failed",{eventId,reason:error instanceof Error?error.message:"unknown"});
    return response({enabled:false,prompt:null},200);
  }
}

export async function POST(request:Request,{params}:{params:Promise<{eventId:string}>}){
  const{eventId}=await params;
  try{
    const participant=await requireParticipant(eventId);
    if(!participant||participant.status==="removed")return response({error:"A current tasting seat is required."},401);
    const parsed=actionSchema.safeParse(await request.json().catch(()=>null));
    if(!parsed.success)return response({error:"Choose a current conversation prompt action."},400);
    return response(await actOnParticipantConversationPrompt({admin:createAdminClient(),eventId,participantId:participant.id,instanceId:parsed.data.instanceId,action:parsed.data.action}));
  }catch(error){
    const reason=error instanceof Error?error.message:"unknown";
    logger.error("conversation_prompt_guest_action_failed",error,{eventId});
    if(reason.includes("not_member"))return response({error:"Only members of this small table can change its prompt."},403);
    if(reason.includes("curiosity_locked"))return response({error:"The table card locked when your room returned."},409);
    if(reason.includes("unavailable"))return response({error:"That prompt is no longer active."},409);
    return response({error:"That prompt action could not be completed. Your tasting is unaffected."},500);
  }
}

function response(body:unknown,status=200){return NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store, max-age=0"}})}
