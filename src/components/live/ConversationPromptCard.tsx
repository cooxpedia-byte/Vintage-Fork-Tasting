"use client";

import {useCallback,useEffect,useState} from "react";
import type {ActiveConversationPrompt} from "@/lib/conversation-prompts";

type PromptResponse={enabled:boolean;prompt:ActiveConversationPrompt|null;error?:string};

export function ConversationPromptCard({eventId,active,canPromoteCuriosity=false,onAskHost,onCuriositySaved}:{eventId:string;active:boolean;canPromoteCuriosity?:boolean;onAskHost?:()=>Promise<void>;onCuriositySaved?:()=>Promise<void>}){
  const[prompt,setPrompt]=useState<ActiveConversationPrompt|null>(null);
  const[busy,setBusy]=useState(false);
  const[keptInstanceId,setKeptInstanceId]=useState<string|null>(null);
  const[message,setMessage]=useState<{instanceId:string;text:string}|null>(null);
  const[hiddenMainInstanceId,setHiddenMainInstanceId]=useState<string|null>(null);

  const refresh=useCallback(async()=>{
    if(!active){setPrompt(null);return}
    try{
      const response=await fetch(`/api/events/${eventId}/conversation-prompts`,{cache:"no-store"});
      if(!response.ok)return;
      const result=await response.json() as PromptResponse;
      setPrompt(result.enabled&&result.prompt?.instanceId!==hiddenMainInstanceId?result.prompt:null);
    }catch{/* Prompts are optional and never interrupt the tasting. */}
  },[active,eventId,hiddenMainInstanceId]);

  useEffect(()=>{
    const initial=window.setTimeout(()=>{void refresh()},0);
    if(!active)return()=>window.clearTimeout(initial);
    const interval=window.setInterval(()=>{void refresh()},5000);
    return()=>{window.clearTimeout(initial);window.clearInterval(interval)};
  },[active,refresh]);

  async function act(action:"dismiss"|"another"|"promote_curiosity"){
    if(!prompt||busy)return;
    if(action==="dismiss"&&prompt.audience==="main"){
      setHiddenMainInstanceId(prompt.instanceId);setPrompt(null);return;
    }
    setBusy(true);setMessage(null);
    try{
      const response=await fetch(`/api/events/${eventId}/conversation-prompts`,{
        method:"POST",headers:{"content-type":"application/json"},
        body:JSON.stringify({action,instanceId:prompt.instanceId})
      });
      const result=await response.json().catch(()=>({})) as {prompt?:ActiveConversationPrompt|null;error?:string};
      if(!response.ok)throw new Error(result.error??"That prompt action could not be completed.");
      if(action==="promote_curiosity"){
        setMessage({instanceId:prompt.instanceId,text:"Saved to Our Table curiosity."});
        await onCuriositySaved?.();
      }
      else setPrompt(result.prompt??null);
    }catch(error){setMessage({instanceId:prompt.instanceId,text:error instanceof Error?error.message:"That prompt action could not be completed."})}
    finally{setBusy(false)}
  }

  if(!active||!prompt)return null;
  const kept=keptInstanceId===prompt.instanceId;
  return <aside className={`conversation-prompt-card${kept?" kept":""}`} aria-labelledby={`conversation-prompt-${prompt.instanceId}`}>
    <div className="conversation-prompt-heading"><div><span className="eyebrow">Optional conversation prompt</span><span className="chip">{prompt.prompt.category}</span></div><button className="btn btn-quiet" type="button" disabled={busy} aria-label={prompt.audience==="breakout"?"Dismiss this prompt for the table":"Hide this prompt"} onClick={()=>void act("dismiss")}>Dismiss</button></div>
    <p id={`conversation-prompt-${prompt.instanceId}`}>{prompt.prompt.text}</p>
    <div className="conversation-prompt-actions">
      {prompt.audience==="breakout"&&<button className="btn btn-secondary" type="button" disabled={busy} onClick={()=>void act("another")}>{busy?"Changing…":"Another question"}</button>}
      <button className="btn btn-quiet" type="button" aria-pressed={kept} onClick={()=>setKeptInstanceId(value=>value===prompt.instanceId?null:prompt.instanceId)}>{kept?"Kept nearby":"Keep this"}</button>
      {prompt.audience==="breakout"&&canPromoteCuriosity&&<button className="btn btn-quiet" type="button" disabled={busy} onClick={()=>void act("promote_curiosity")}>Save curiosity</button>}
      {prompt.audience==="breakout"&&onAskHost&&<button className="btn btn-quiet" type="button" disabled={busy} onClick={()=>void onAskHost()}>Ask host</button>}
    </div>
    <small>Use it if it opens the conversation. No answer is collected.</small>
    {message?.instanceId===prompt.instanceId&&<span className="help" role="status">{message.text}</span>}
  </aside>;
}
