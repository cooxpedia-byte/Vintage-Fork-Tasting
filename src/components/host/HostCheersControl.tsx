"use client";

import {useEffect,useState} from "react";
import {CHEERS_CONTEXT_LABELS,defaultCheersContext,type CheersContext,type HostCheersSnapshot} from "@/lib/cheers";
import type {HostCommandPayload} from "@/lib/host-command";
import type {ConductorStage} from "@/lib/conductor";
import type {EventCommand} from "@/types/domain";

export function HostCheersControl({eventId,initialSnapshot,stage,busy,enabled,onCommand}:{eventId:string;initialSnapshot:HostCheersSnapshot|null;stage:ConductorStage;busy:boolean;enabled:boolean;onCommand:(command:EventCommand,payload?:HostCommandPayload)=>Promise<void>}){
  const[snapshot,setSnapshot]=useState(initialSnapshot);
  const[windowSeconds,setWindowSeconds]=useState<5|8|10>(8);
  const[context,setContext]=useState<CheersContext>(()=>defaultCheersContext(stage));
  const[soundEnabled,setSoundEnabled]=useState(true);
  const snapshotId=snapshot?.id??null;
  useEffect(()=>{
    if(!snapshotId)return;
    let active=true;
    const refresh=async()=>{
      try{
        const response=await fetch(`/api/events/${eventId}/cheers`,{cache:"no-store"});
        if(!response.ok)return;
        const result=await response.json() as {snapshot?:HostCheersSnapshot|null};
        if(active&&"snapshot" in result)setSnapshot(result.snapshot??null);
      }catch{/* The host console refresh remains the fallback. */}
    };
    const interval=window.setInterval(()=>void refresh(),550);
    return()=>{active=false;window.clearInterval(interval)};
  },[eventId,snapshotId]);
  const open=()=>void onCommand("open_cheers",{cheersWindowSeconds:windowSeconds,cheersContext:context,cheersSoundEnabled:soundEnabled});

  return <section className={`host-cheers-control ${snapshot?"host-cheers-control-live":""}`} aria-labelledby="host-cheers-title">
    <div><p className="eyebrow">Micro-moment · Agora stays live</p><h2 id="host-cheers-title">{snapshot?snapshot.invitation:"Virtual tea Cheers"}</h2>{snapshot?<p><strong>{snapshot.joinedCount} {snapshot.joinedCount===1?"cup":"cups"} raised</strong> · aggregate only</p>:<p>Invite one shared cup raise without changing the conductor stage.</p>}</div>
    {snapshot?<div className="host-cheers-live-actions"><span className="chip chip-live">{snapshot.status}</span><button className="btn btn-primary" disabled={!enabled||busy} onClick={()=>void onCommand("resolve_cheers")}>Resolve now</button><button className="btn btn-quiet" disabled={!enabled||busy} onClick={()=>void onCommand("cancel_cheers")}>Cancel</button></div>:<div className="host-cheers-actions"><button className="btn btn-primary btn-attention host-cheers-primary" disabled={!enabled||busy} onClick={open}>Cheers</button><details><summary>Cheers settings</summary><div className="host-cheers-settings"><label>Moment<select value={context} onChange={event=>setContext(event.target.value as CheersContext)}>{(Object.keys(CHEERS_CONTEXT_LABELS) as CheersContext[]).map(value=><option key={value} value={value}>{CHEERS_CONTEXT_LABELS[value]}</option>)}</select></label><label>Window<select value={windowSeconds} onChange={event=>setWindowSeconds(Number(event.target.value) as 5|8|10)}>{[5,8,10].map(value=><option key={value} value={value}>{value} seconds</option>)}</select></label><label className="row"><input type="checkbox" checked={soundEnabled} onChange={event=>setSoundEnabled(event.target.checked)}/> Warm clink sound</label></div></details></div>}
  </section>;
}
