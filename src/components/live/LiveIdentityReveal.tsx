"use client";

import {useEffect,useMemo,useState} from "react";
import {DiscoveryEmblem} from "@/components/dashboard/DiscoveryEmblem";
import {AGORA_SPEECH_ACTIVITY_EVENT} from "@/lib/agora-session";
import type {ConductorStage} from "@/lib/conductor";
import {isIdentityRevealSuppressed,type EventDiscoveryIdentitySnapshot} from "@/lib/discovery-identity";

export function LiveIdentityReveal({eventId,active,stage,cheersActive=false}:{eventId:string;active:boolean;stage:ConductorStage;cheersActive?:boolean}){
  const[snapshot,setSnapshot]=useState<EventDiscoveryIdentitySnapshot|null>(null);
  const[speechActive,setSpeechActive]=useState(false);
  const[dismissed,setDismissed]=useState(false);
  const[reducedMotion,setReducedMotion]=useState(false);
  const suppressed=isIdentityRevealSuppressed(stage,cheersActive,speechActive);
  const unseen=useMemo(()=>snapshot?.identities.filter(identity=>{
    try{return sessionStorage.getItem(`vf:discovery-identity-seen:${eventId}:${identity.id}`)!=="yes"}catch{return true}
  })??[],[eventId,snapshot]);

  useEffect(()=>{
    const media=window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync=()=>setReducedMotion(media.matches);
    const speech=(event:Event)=>setSpeechActive(Boolean((event as CustomEvent<boolean>).detail));
    sync();media.addEventListener?.("change",sync);window.addEventListener(AGORA_SPEECH_ACTIVITY_EVENT,speech);
    return()=>{media.removeEventListener?.("change",sync);window.removeEventListener(AGORA_SPEECH_ACTIVITY_EVENT,speech)};
  },[]);
  useEffect(()=>{
    if(!active)return;
    let mounted=true;
    const refresh=async()=>{
      try{
        const response=await fetch(`/api/events/${eventId}/discovery-identity`,{cache:"no-store"});
        if(!response.ok)return;
        const result=await response.json() as {snapshot?:EventDiscoveryIdentitySnapshot};
        if(mounted&&result.snapshot)setSnapshot(result.snapshot);
      }catch{/* Identity is an optional post-tasting layer. */}
    };
    const first=window.setTimeout(()=>void refresh(),250);
    const interval=window.setInterval(()=>void refresh(),5000);
    return()=>{mounted=false;window.clearTimeout(first);window.clearInterval(interval)};
  },[active,eventId]);

  function close(){
    for(const identity of unseen){try{sessionStorage.setItem(`vf:discovery-identity-seen:${eventId}:${identity.id}`,"yes")}catch{/* Session dismissal is optional. */}}
    setDismissed(true);
  }
  async function disableReveals(){
    close();
    try{await fetch("/api/discovery-profile",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"set_reveals",enabled:false})})}catch{/* The local dismissal still succeeds. */}
  }

  if(!active||dismissed||suppressed||!snapshot?.accountLinked||!snapshot.identityRevealsEnabled||unseen.length===0)return null;
  const identity=unseen[0];
  return <aside className={`live-identity-reveal ${reducedMotion?"reduced-motion":""}`} role="status" aria-live="polite" aria-label="New tea discovery identity">
    <button className="live-identity-reveal-close" type="button" aria-label="Dismiss discovery identity for this session" onClick={close}>×</button>
    <DiscoveryEmblem kind={identity.emblem}/><div><p className="eyebrow">A new page in your tea journey</p><h2>{identity.name}</h2><p>{identity.description}</p><div className="live-identity-evidence"><strong>What this reflects</strong><span>{identity.evidenceSummary}</span></div><div className="live-identity-actions"><a className="btn btn-secondary" href="/dashboard?section=discovery">View private Discovery Profile</a><button className="btn btn-quiet" type="button" onClick={()=>void disableReveals()}>Turn off future reveals</button></div></div>
  </aside>;
}
