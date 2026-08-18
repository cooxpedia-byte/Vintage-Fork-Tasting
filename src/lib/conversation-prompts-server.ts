import type {SupabaseClient} from "@supabase/supabase-js";
import {
  chooseRoomPrompt,
  isPromptEligible,
  type ActiveConversationPrompt,
  type ConversationPrompt,
  type ConversationPromptAudience,
  type ConversationPromptCategory,
  type ConversationPromptDifficulty
} from "@/lib/conversation-prompts";
import type {ConductorStage} from "@/types/domain";

type ServerClient=SupabaseClient;
type PromptRow={
  id:string;prompt_text:string;category:string;allowed_stages:string[];audience:string;difficulty:string;
  requires_reveal:boolean;tea_context_tags:string[];locale:string;version:number;
};

function mapPrompt(row:PromptRow):ConversationPrompt{
  return{
    id:row.id,text:row.prompt_text,category:row.category as ConversationPromptCategory,
    allowedStages:row.allowed_stages as ConductorStage[],audience:row.audience as ConversationPromptAudience,
    difficulty:row.difficulty as ConversationPromptDifficulty,requiresReveal:Boolean(row.requires_reveal),
    teaContextTags:Array.isArray(row.tea_context_tags)?row.tea_context_tags:[],locale:row.locale,version:Number(row.version)
  };
}

export async function loadEligibleConversationPrompts({admin,stage,audience,revealVisible}:{admin:ServerClient;stage:ConductorStage;audience:"host"|"breakout";revealVisible:boolean}){
  const result=await admin.from("conversation_prompt_library")
    .select("id,prompt_text,category,allowed_stages,audience,difficulty,requires_reveal,tea_context_tags,locale,version")
    .eq("active",true).contains("allowed_stages",[stage]).in("audience",[audience,"all"])
    .order("sort_order").order("prompt_key");
  if(result.error)throw result.error;
  return(result.data??[]).map(row=>mapPrompt(row as PromptRow)).filter(prompt=>isPromptEligible(prompt,{stage,audience,revealVisible}));
}

async function loadPromptById(admin:ServerClient,promptId:string){
  const result=await admin.from("conversation_prompt_library")
    .select("id,prompt_text,category,allowed_stages,audience,difficulty,requires_reveal,tea_context_tags,locale,version")
    .eq("id",promptId).eq("active",true).maybeSingle();
  if(result.error)throw result.error;
  return result.data?mapPrompt(result.data as PromptRow):null;
}

async function loadActiveInstance({admin,eventId,eventFlightItemId,breakoutRoomId}:{admin:ServerClient;eventId:string;eventFlightItemId:string;breakoutRoomId:string|null}):Promise<ActiveConversationPrompt|null>{
  let query=admin.from("event_conversation_prompts")
    .select("id,library_prompt_id,audience,source,breakout_room_id,displayed_at")
    .eq("event_id",eventId).eq("event_flight_item_id",eventFlightItemId).eq("status","active");
  query=breakoutRoomId?query.eq("breakout_room_id",breakoutRoomId).eq("audience","breakout"):query.is("breakout_room_id",null).eq("audience","main");
  const result=await query.order("displayed_at",{ascending:false}).limit(1).maybeSingle();
  if(result.error)throw result.error;
  if(!result.data)return null;
  const prompt=await loadPromptById(admin,result.data.library_prompt_id);
  if(!prompt)return null;
  return{
    instanceId:result.data.id,prompt,audience:result.data.audience as "main"|"breakout",
    source:result.data.source as ActiveConversationPrompt["source"],breakoutRoomId:result.data.breakout_room_id,
    displayedAt:result.data.displayed_at
  };
}

async function closeInstance(admin:ServerClient,instanceId:string,status:"dismissed"|"replaced"|"expired",actorParticipantId?:string){
  const now=new Date().toISOString();
  const update=await admin.from("event_conversation_prompts").update({status,dismissed_at:now,dismissed_by_participant_id:actorParticipantId??null}).eq("id",instanceId).eq("status","active");
  if(update.error)throw update.error;
}

async function createRoomInstance({admin,eventId,eventFlightItemId,breakoutRoomId,prompt,source,participantId}:{admin:ServerClient;eventId:string;eventFlightItemId:string;breakoutRoomId:string;prompt:ConversationPrompt;source:"room_initial"|"room_another";participantId?:string}){
  const now=new Date().toISOString();
  const result=await admin.from("event_conversation_prompts").insert({
    event_id:eventId,event_flight_item_id:eventFlightItemId,breakout_room_id:breakoutRoomId,
    library_prompt_id:prompt.id,audience:"breakout",source,status:"active",displayed_at:now,
    requested_by_participant_id:participantId??null
  }).select("id").single();
  if(result.error)throw result.error;
  const action=await admin.from("event_conversation_prompt_actions").insert({
    event_id:eventId,prompt_instance_id:result.data.id,breakout_room_id:breakoutRoomId,
    participant_id:participantId??null,action:"displayed",metadata:{source}
  });
  if(action.error)throw action.error;
  return loadActiveInstance({admin,eventId,eventFlightItemId,breakoutRoomId});
}

async function chooseNextRoomPrompt({admin,eventId,eventFlightItemId,breakoutRoomId,stage,revealVisible,source,participantId}:{admin:ServerClient;eventId:string;eventFlightItemId:string;breakoutRoomId:string;stage:ConductorStage;revealVisible:boolean;source:"room_initial"|"room_another";participantId?:string}){
  const [eligible,history]=await Promise.all([
    loadEligibleConversationPrompts({admin,stage,audience:"breakout",revealVisible}),
    admin.from("event_conversation_prompts").select("library_prompt_id").eq("event_id",eventId).eq("event_flight_item_id",eventFlightItemId).eq("breakout_room_id",breakoutRoomId).order("created_at",{ascending:false}).limit(20)
  ]);
  if(history.error)throw history.error;
  const prompt=chooseRoomPrompt(eligible,`${breakoutRoomId}:${history.data?.length??0}`,(history.data??[]).map(row=>row.library_prompt_id));
  if(!prompt)return null;
  try{return await createRoomInstance({admin,eventId,eventFlightItemId,breakoutRoomId,prompt,source,participantId})}
  catch(error){
    if((error as {code?:string})?.code==="23505")return loadActiveInstance({admin,eventId,eventFlightItemId,breakoutRoomId});
    throw error;
  }
}

export async function loadParticipantConversationPrompt({admin,eventId,participantId}:{admin:ServerClient;eventId:string;participantId:string}){
  const eventResult=await admin.from("events").select("status,phase,current_flight_item_id,current_breakout_session_id,conductor_stage,conversation_prompts_enabled").eq("id",eventId).maybeSingle();
  if(eventResult.error)throw eventResult.error;
  const event=eventResult.data;
  if(!event||event.status!=="live"||event.phase==="ended"||!event.current_flight_item_id||!event.conversation_prompts_enabled)return{enabled:Boolean(event?.conversation_prompts_enabled),prompt:null};
  let breakoutRoomId:string|null=null;
  if(event.current_breakout_session_id){
    const memberResult=await admin.from("event_breakout_members").select("breakout_room_id,status").eq("session_id",event.current_breakout_session_id).eq("participant_id",participantId).maybeSingle();
    if(memberResult.error)throw memberResult.error;
    if(memberResult.data&&!["returned","failed","stayed_main"].includes(memberResult.data.status))breakoutRoomId=memberResult.data.breakout_room_id;
  }
  let active=await loadActiveInstance({admin,eventId,eventFlightItemId:event.current_flight_item_id,breakoutRoomId});
  const stage=event.conductor_stage as ConductorStage;
  const revealVisible=["reveal","debrief","close_tea"].includes(stage);
  if(active&&!isPromptEligible(active.prompt,{stage,audience:breakoutRoomId?"breakout":"host",revealVisible})){
    await closeInstance(admin,active.instanceId,"expired");active=null;
  }
  if(!active&&breakoutRoomId){
    const historyResult=await admin.from("event_conversation_prompts").select("id",{count:"exact",head:true})
      .eq("event_id",eventId).eq("event_flight_item_id",event.current_flight_item_id).eq("breakout_room_id",breakoutRoomId);
    if(historyResult.error)throw historyResult.error;
    if((historyResult.count??0)===0){
      active=await chooseNextRoomPrompt({admin,eventId,eventFlightItemId:event.current_flight_item_id,breakoutRoomId,stage,revealVisible,source:"room_initial"});
    }
  }
  return{enabled:true,prompt:active};
}

export async function actOnParticipantConversationPrompt({admin,eventId,participantId,instanceId,action}:{admin:ServerClient;eventId:string;participantId:string;instanceId:string;action:"dismiss"|"another"|"promote_curiosity"}){
  const instanceResult=await admin.from("event_conversation_prompts").select("id,event_id,event_flight_item_id,breakout_room_id,library_prompt_id,status").eq("id",instanceId).eq("event_id",eventId).maybeSingle();
  if(instanceResult.error)throw instanceResult.error;
  const instance=instanceResult.data;
  if(!instance||!instance.breakout_room_id||instance.status!=="active")throw new Error("conversation_prompt_unavailable");
  const memberResult=await admin.from("event_breakout_members").select("status").eq("breakout_room_id",instance.breakout_room_id).eq("participant_id",participantId).maybeSingle();
  if(memberResult.error)throw memberResult.error;
  if(!memberResult.data||["returned","failed","stayed_main"].includes(memberResult.data.status))throw new Error("conversation_prompt_not_member");
  const prompt=await loadPromptById(admin,instance.library_prompt_id);
  if(!prompt)throw new Error("conversation_prompt_unavailable");
  const now=new Date().toISOString();
  if(action==="promote_curiosity"){
    const cardResult=await admin.from("room_discovery_cards").select("id,locked_at").eq("breakout_room_id",instance.breakout_room_id).eq("event_flight_item_id",instance.event_flight_item_id).maybeSingle();
    if(cardResult.error)throw cardResult.error;
    if(!cardResult.data||cardResult.data.locked_at)throw new Error("conversation_prompt_curiosity_locked");
    const update=await admin.from("room_discovery_cards").update({curiosity:prompt.text,updated_at:now}).eq("id",cardResult.data.id).is("locked_at",null);
    if(update.error)throw update.error;
  }else{
    await closeInstance(admin,instance.id,action==="another"?"replaced":"dismissed",participantId);
  }
  const actionResult=await admin.from("event_conversation_prompt_actions").insert({
    event_id:eventId,prompt_instance_id:instance.id,breakout_room_id:instance.breakout_room_id,
    participant_id:participantId,action:action==="promote_curiosity"?"promoted_curiosity":action==="another"?"another_requested":"dismissed",
    metadata:{}
  });
  if(actionResult.error)throw actionResult.error;
  if(action!=="another")return{prompt:action==="dismiss"?null:await loadActiveInstance({admin,eventId,eventFlightItemId:instance.event_flight_item_id,breakoutRoomId:instance.breakout_room_id})};
  const eventResult=await admin.from("events").select("conductor_stage,conversation_prompts_enabled").eq("id",eventId).single();
  if(eventResult.error)throw eventResult.error;
  if(!eventResult.data.conversation_prompts_enabled)return{prompt:null};
  const stage=eventResult.data.conductor_stage as ConductorStage;
  return{prompt:await chooseNextRoomPrompt({admin,eventId,eventFlightItemId:instance.event_flight_item_id,breakoutRoomId:instance.breakout_room_id,stage,revealVisible:["reveal","debrief","close_tea"].includes(stage),source:"room_another",participantId})};
}
