"use client";

import {useEffect,useRef,useState,type CSSProperties} from "react";
import {playTeaCheersFeedback} from "@/components/InterfaceFeedback";
import {TeaReactionIcon} from "@/components/live/TeaReactionIcon";
import {cheersBeat,cheersSteamCount,type ParticipantCheersSnapshot} from "@/lib/cheers";
import {correctedNow} from "@/lib/live-timing";

export function VirtualTeaCheers({eventId,initialSnapshot,clockOffsetMs=0,feedbackEnabled=false}:{eventId:string;initialSnapshot:ParticipantCheersSnapshot|null;clockOffsetMs?:number;feedbackEnabled?:boolean}){
  const[snapshot,setSnapshot]=useState(initialSnapshot);
  const[now,setNow]=useState(()=>correctedNow(Date.now(),clockOffsetMs));
  const[announcement,setAnnouncement]=useState(()=>initialSnapshot?`${initialSnapshot.invitation} One button is available to join.`:"");
  const[reducedMotion,setReducedMotion]=useState(false);
  const playedCollective=useRef<string|null>(null);

  useEffect(()=>{
    const media=window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync=()=>setReducedMotion(media.matches);
    sync();
    media.addEventListener?.("change",sync);
    return()=>media.removeEventListener?.("change",sync);
  },[]);
  useEffect(()=>{
    const tick=()=>setNow(correctedNow(Date.now(),clockOffsetMs));
    tick();
    const interval=window.setInterval(tick,100);
    return()=>window.clearInterval(interval);
  },[clockOffsetMs,snapshot?.id]);
  const snapshotId=snapshot?.id??null;
  useEffect(()=>{
    if(!snapshotId)return;
    let active=true;
    const refresh=async()=>{
      try{
        const response=await fetch(`/api/events/${eventId}/cheers`,{cache:"no-store"});
        if(!response.ok)return;
        const result=await response.json() as {snapshot?:ParticipantCheersSnapshot|null};
        if(active&&"snapshot" in result)setSnapshot(result.snapshot??null);
      }catch{/* The authoritative event-state poll remains the fallback. */}
    };
    const interval=window.setInterval(()=>void refresh(),550);
    return()=>{active=false;window.clearInterval(interval)};
  },[eventId,snapshotId]);
  const beat=snapshot?cheersBeat(snapshot,now):null;
  useEffect(()=>{
    if(!snapshot||beat!=="clink"||playedCollective.current===snapshot.id)return;
    playedCollective.current=snapshot.id;
    playTeaCheersFeedback("collective",feedbackEnabled&&snapshot.soundEnabled,reducedMotion);
    setAnnouncement("The room raises its cups together. Clink.");
  },[beat,feedbackEnabled,reducedMotion,snapshot]);

  if(!snapshot)return null;
  if(beat==="cancelled"||beat==="resolved")return null;
  const canJoin=!snapshot.joined&&beat==="invitation"&&now>=new Date(snapshot.openedAt).getTime();
  const steam=Array.from({length:cheersSteamCount(snapshot.richness)},(_,index)=>index);
  const join=()=>{
    if(!canJoin)return;
    const cheersId=snapshot.id;
    setSnapshot(current=>current?.id===cheersId?{...current,joined:true}:current);
    setAnnouncement("Your cup is raised.");
    playTeaCheersFeedback("personal",feedbackEnabled&&snapshot.soundEnabled,reducedMotion);
    void fetch(`/api/events/${eventId}/cheers`,{
      method:"POST",headers:{"content-type":"application/json"},
      body:JSON.stringify({cheersId,clientId:crypto.randomUUID()})
    }).catch(()=>undefined);
  };

  return <aside className={`virtual-tea-cheers virtual-tea-cheers-${beat} ${reducedMotion?"reduced-motion":""}`} aria-labelledby="virtual-tea-cheers-title" data-richness={snapshot.richness}>
    <div className="virtual-tea-cheers-steam" aria-hidden="true">{steam.map(index=><i key={index} style={{"--steam-index":index} as CSSProperties}/>)}</div>
    <p className="eyebrow">Shared tea moment</p>
    <h2 id="virtual-tea-cheers-title">{beat==="clink"?"Together.":snapshot.invitation}</h2>
    <p className="virtual-tea-cheers-copy">{beat==="gathering"?"The room is gathering around the cup.":beat==="clink"?"A warm shared clink.":snapshot.joined?"Your cup is raised.":"Join if the moment feels right."}</p>
    <button className="virtual-tea-cheers-cup" type="button" disabled={!canJoin} aria-pressed={snapshot.joined} aria-label={snapshot.joined?"Your cup is raised":"Raise your cup"} data-feedback-silent onClick={join}>
      <span className="virtual-tea-cheers-cup-rings" aria-hidden="true"/>
      <TeaReactionIcon type="tea_cup"/>
      <span>{snapshot.joined?"Cup raised":"Raise your cup"}</span>
    </button>
    <div className="virtual-tea-cheers-room" aria-hidden="true"><span/><span/><span/></div>
    <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</span>
  </aside>;
}
