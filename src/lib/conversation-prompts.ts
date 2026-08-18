import type {ConductorStage} from "@/types/domain";
import { DISCOVERY_FIRST_COPY } from "@/lib/discovery-first";

export const CONVERSATION_PROMPT_CATEGORIES=[
  "notice","compare","change","contrast","language","memory","revisit","curiosity","social","reflection"
] as const;

export type ConversationPromptCategory=typeof CONVERSATION_PROMPT_CATEGORIES[number];
export type ConversationPromptAudience="host"|"breakout"|"all";
export type ConversationPromptDifficulty="basic"|"standard"|"advanced";

export type ConversationPrompt={
  id:string;
  text:string;
  category:ConversationPromptCategory;
  allowedStages:ConductorStage[];
  audience:ConversationPromptAudience;
  difficulty:ConversationPromptDifficulty;
  requiresReveal:boolean;
  teaContextTags:string[];
  locale:string;
  version:number;
};

export type ActiveConversationPrompt={
  instanceId:string;
  prompt:ConversationPrompt;
  audience:"main"|"breakout";
  source:"host"|"room_initial"|"room_another";
  breakoutRoomId:string|null;
  displayedAt:string;
};

const POST_REVEAL_STAGES=new Set<ConductorStage>(["reveal","debrief","close_tea"]);

export function isPromptEligible(
  prompt:ConversationPrompt,
  {stage,audience,revealVisible,advancedEnabled=false}:{stage:ConductorStage;audience:"host"|"breakout";revealVisible:boolean;advancedEnabled?:boolean}
){
  if(!prompt.allowedStages.includes(stage))return false;
  if(prompt.audience!=="all"&&prompt.audience!==audience)return false;
  if(prompt.requiresReveal&&(!revealVisible||!POST_REVEAL_STAGES.has(stage)))return false;
  if(prompt.difficulty==="advanced"&&!advancedEnabled)return false;
  if(stage==="first_sip"&&prompt.text!==DISCOVERY_FIRST_COPY.noticeWhenReady)return false;
  return true;
}

export function promptSuggestions(prompts:ConversationPrompt[],stage:ConductorStage,offset=0){
  if(!prompts.length)return[];
  const limit=stage==="first_sip"?1:3;
  const start=Math.abs(Math.trunc(offset))%prompts.length;
  return Array.from({length:Math.min(limit,prompts.length)},(_,index)=>prompts[(start+index)%prompts.length]!);
}

export function chooseRoomPrompt(prompts:ConversationPrompt[],seed:string,excludedIds:string[]=[]){
  const excluded=new Set(excludedIds);
  const available=prompts.filter(prompt=>!excluded.has(prompt.id));
  const pool=available.length?available:prompts;
  if(!pool.length)return null;
  let hash=2166136261;
  for(let index=0;index<seed.length;index+=1){hash^=seed.charCodeAt(index);hash=Math.imul(hash,16777619)}
  return pool[(hash>>>0)%pool.length]??null;
}

export function promptWordCount(value:string){
  return value.trim().split(/\s+/).filter(Boolean).length;
}
