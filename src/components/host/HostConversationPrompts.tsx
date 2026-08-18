"use client";

import {useCallback,useEffect,useState} from "react";
import type {ConversationPrompt} from "@/lib/conversation-prompts";
import type {HostCommandPayload} from "@/lib/host-command";
import type {EventCommand} from "@/types/domain";

type HostPromptSnapshot={
  enabled:boolean;
  stage:string;
  suggestions:ConversationPrompt[];
  active:{main:boolean;breakoutCount:number};
  breakoutsActive:boolean;
};

export function HostConversationPrompts({eventId,busy,enabled,onCommand}:{eventId:string;busy:boolean;enabled:boolean;onCommand:(command:EventCommand,payload?:HostCommandPayload)=>Promise<void>}){
  const[snapshot,setSnapshot]=useState<HostPromptSnapshot|null>(null);
  const[offset,setOffset]=useState(0);
  const[localBusy,setLocalBusy]=useState(false);

  const refresh=useCallback(async()=>{
    try{
      const response=await fetch(`/api/events/${eventId}/conversation-prompts/host?offset=${offset}`,{cache:"no-store"});
      if(response.ok)setSnapshot(await response.json() as HostPromptSnapshot);
    }catch{/* Private suggestions can fail quietly without affecting the room. */}
  },[eventId,offset]);

  useEffect(()=>{
    const initial=window.setTimeout(()=>{void refresh()},0);
    const interval=window.setInterval(()=>{void refresh()},5000);
    return()=>{window.clearTimeout(initial);window.clearInterval(interval)};
  },[refresh]);

  async function command(commandName:EventCommand,payload:HostCommandPayload){
    setLocalBusy(true);
    try{await onCommand(commandName,payload);await refresh()}
    finally{setLocalBusy(false)}
  }

  if(!snapshot)return null;
  const controlsEnabled=enabled&&!busy&&!localBusy;
  return <section className="card host-conversation-prompts" aria-labelledby="host-conversation-prompts-title">
    <div className="card-header"><div><p className="eyebrow">Private host view · {snapshot.stage.replaceAll("_"," ")}</p><h2 className="card-title" id="host-conversation-prompts-title">Conversation prompts</h2></div><button className="btn btn-secondary" type="button" disabled={!controlsEnabled} onClick={()=>void command("set_conversation_prompts_enabled",{conversationPromptsEnabled:!snapshot.enabled})}>{snapshot.enabled?"Disable prompts":"Enable prompts"}</button></div>
    <p>Optional stage-aware ideas. Read, send, or ignore them; nothing advances the tasting.</p>
    {!snapshot.enabled?<div className="notice">Prompts are hidden from guests. Your live video and conversation continue normally.</div>:snapshot.suggestions.length?<div className="host-prompt-suggestions">{snapshot.suggestions.map(prompt=><article key={prompt.id}><span className="chip">{prompt.category}</span><p>{prompt.text}</p><div className="row"><button className="btn btn-secondary" type="button" disabled={!controlsEnabled} onClick={()=>void command("send_conversation_prompt",{conversationPromptId:prompt.id,conversationPromptTarget:"main"})}>Send to main room</button>{snapshot.breakoutsActive&&prompt.audience!=="host"&&<button className="btn btn-secondary" type="button" disabled={!controlsEnabled} onClick={()=>void command("send_conversation_prompt",{conversationPromptId:prompt.id,conversationPromptTarget:"breakouts"})}>Send to small tables</button>}</div></article>)}</div>:<p className="help">No prompt is suggested for this moment. Let the tasting breathe.</p>}
    <div className="row host-prompt-footer"><span className="help">{snapshot.active.main?"One prompt is in the main room. ":""}{snapshot.active.breakoutCount?`${snapshot.active.breakoutCount} tasting-table prompt${snapshot.active.breakoutCount===1?" is":"s are"} active.`:""}</span><span className="spacer"/><button className="btn btn-quiet" type="button" disabled={!snapshot.enabled||snapshot.suggestions.length<2} onClick={()=>setOffset(value=>value+3)}>Another set of ideas</button></div>
  </section>;
}
