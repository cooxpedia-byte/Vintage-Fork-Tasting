"use client";

import {useEffect,useRef,useState} from "react";
import {playGoldLeafRewardFeedback} from "@/components/InterfaceFeedback";
import {GoldLeafIcon} from "@/components/live/GoldLeafIcon";
import {AGORA_SPEECH_ACTIVITY_EVENT} from "@/lib/agora-session";
import type {ConductorStage} from "@/lib/conductor";
import {isRewardPresentationSuppressed,liveRewardStatusCopy,type ParticipantLiveRewardsSnapshot} from "@/lib/live-rewards";

export function LiveGoldLeaves({eventId,stage,cheersActive=false,feedbackEnabled=false}:{eventId:string;stage:ConductorStage;cheersActive?:boolean;feedbackEnabled?:boolean}){
  const[snapshot,setSnapshot]=useState<ParticipantLiveRewardsSnapshot|null>(null);
  const[speechActive,setSpeechActive]=useState(false);
  const[reducedMotion,setReducedMotion]=useState(false);
  const[celebrating,setCelebrating]=useState(false);
  const[announcement,setAnnouncement]=useState("");
  const celebrationTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const suppressed=isRewardPresentationSuppressed(stage,cheersActive,speechActive);

  useEffect(()=>{
    const media=window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync=()=>setReducedMotion(media.matches);
    const speech=(event:Event)=>setSpeechActive(Boolean((event as CustomEvent<boolean>).detail));
    sync();media.addEventListener?.("change",sync);window.addEventListener(AGORA_SPEECH_ACTIVITY_EVENT,speech);
    return()=>{media.removeEventListener?.("change",sync);window.removeEventListener(AGORA_SPEECH_ACTIVITY_EVENT,speech)};
  },[]);
  useEffect(()=>{
    let active=true;
    const refresh=async()=>{
      try{
        const response=await fetch(`/api/events/${eventId}/live-rewards`,{cache:"no-store"});
        if(!response.ok)return;
        const result=await response.json() as {snapshot?:ParticipantLiveRewardsSnapshot};
        if(active&&result.snapshot)setSnapshot(result.snapshot);
      }catch{/* Gold Leaves reconcile independently; the tasting continues. */}
    };
    const first=window.setTimeout(()=>void refresh(),0);
    const interval=window.setInterval(()=>void refresh(),4000);
    return()=>{active=false;window.clearTimeout(first);window.clearInterval(interval)};
  },[eventId]);
  useEffect(()=>{
    const award=snapshot?.award;
    if(!award||award.status!=="awarded"||suppressed||celebrating)return;
    const seenKey=`vf:live-reward-seen:${award.id}`;
    try{if(sessionStorage.getItem(seenKey)==="yes")return}catch{/* A private session marker is optional. */}
    const start=window.setTimeout(()=>{
      try{sessionStorage.setItem(seenKey,"yes")}catch{/* A private session marker is optional. */}
      setCelebrating(true);
      setAnnouncement(`${award.amount} Gold ${award.amount===1?"Leaf":"Leaves"} added. Your balance is ${snapshot.balance??0}.`);
      playGoldLeafRewardFeedback(feedbackEnabled,reducedMotion);
      celebrationTimer.current=setTimeout(()=>setCelebrating(false),4400);
    },0);
    return()=>window.clearTimeout(start);
  },[celebrating,feedbackEnabled,reducedMotion,snapshot,suppressed]);
  useEffect(()=>()=>{if(celebrationTimer.current)clearTimeout(celebrationTimer.current)},[]);

  if(!snapshot?.available)return null;
  const pending=Boolean(snapshot.award&&snapshot.award.status!=="awarded");
  return <aside className={`live-gold-leaves ${suppressed?"live-gold-leaves-quiet":""} ${celebrating?"live-gold-leaves-celebrating":""}`} aria-label="Your Gold Leaves">
    {celebrating&&snapshot.award&&<div className="gold-leaf-settle" aria-hidden="true"><GoldLeafIcon/><GoldLeafIcon/><GoldLeafIcon/></div>}
    {celebrating&&snapshot.award&&<div className="gold-leaf-confirmation"><strong>+{snapshot.award.amount} Gold {snapshot.award.amount===1?"Leaf":"Leaves"}</strong><span>New balance {snapshot.balance??0}</span></div>}
    <details>
      <summary data-feedback-silent><GoldLeafIcon/><strong>{snapshot.balance??"—"}</strong><span>{snapshot.label}</span>{pending&&<i aria-label="Pending">…</i>}</summary>
      <div className="live-gold-leaves-detail"><strong>Your private Gold Leaves balance</strong><p>{snapshot.award?`${liveRewardStatusCopy(snapshot.award.status)}${snapshot.award.status==="awarded"?` +${snapshot.award.amount} from this tasting.`:""}`:"Completion rewards appear here after the tasting."}</p><p className="help">Gold Leaves share one balance across Tea Cellar, Mobile Home, Tea Merchant, and eligible Vintage Fork rewards.</p></div>
    </details>
    <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</span>
  </aside>;
}
