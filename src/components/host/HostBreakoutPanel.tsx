"use client";

import {useMemo,useState} from "react";
import {BREAKOUT_PROMPTS,breakoutRoomSizes,type BreakoutAssignmentMode} from "@/lib/breakouts";
import type {HostCommandPayload} from "@/lib/host-command";
import type {ConductorStage,EventCommand} from "@/types/domain";
import {HostDiscoveryPanel,type HostDiscoveryBoard} from "@/components/host/HostDiscoveryPanel";

export type BreakoutMetrics={
  active:boolean;
  session?:{id:string;status:"preparing"|"active"|"returning"|"complete";startsAt:string;endsAt:string;roomSize:number;assignmentMode:BreakoutAssignmentMode;prompt:string};
  rooms:Array<{id:string;roomNumber:number;status:string;snapshotExists:boolean;snapshot:string|null;participants:Array<{id:string;displayName:string;status:string}>;help:number;moreTime:number;ready:number}>;
};

export const EMPTY_BREAKOUT_METRICS:BreakoutMetrics={active:false,rooms:[]};

export function HostBreakoutPanel({stage,metrics,discoveryBoard,teaName,participantCount,now,busy,enabled,onCommand}:{stage:ConductorStage;metrics:BreakoutMetrics;discoveryBoard:HostDiscoveryBoard;teaName:string;participantCount:number;now:number;busy:boolean;enabled:boolean;onCommand:(command:EventCommand,payload?:HostCommandPayload)=>Promise<void>}){
  const [roomSize,setRoomSize]=useState(3);
  const [assignmentMode,setAssignmentMode]=useState<BreakoutAssignmentMode>("shuffle");
  const [durationSeconds,setDurationSeconds]=useState(300);
  const recommended=["first_sip","explore","discuss"].includes(stage);
  const sizes=useMemo(()=>breakoutRoomSizes(participantCount,roomSize),[participantCount,roomSize]);
  if(discoveryBoard.session&&discoveryBoard.session.status!=="active")return <HostDiscoveryPanel board={discoveryBoard} teaName={teaName} busy={busy} enabled={enabled} onCommand={onCommand}/>;
  if(metrics.active&&metrics.session){
    const remaining=Math.max(0,new Date(metrics.session.endsAt).getTime()-now);
    const returning=metrics.session.status==="returning"||remaining===0;
    const returnedCount=metrics.rooms.flatMap(room=>room.participants).filter(participant=>["returned","failed","stayed_main"].includes(participant.status)).length;
    const total=metrics.rooms.reduce((sum,room)=>sum+room.participants.length,0);
    return <section className="card host-breakout-panel" aria-labelledby="host-small-tables-title">
      <div className="host-breakout-heading"><div><p className="eyebrow">Tasting tables · {metrics.session.assignmentMode}</p><h2 id="host-small-tables-title">{returning?"Tables are returning":`${metrics.rooms.length} tasting tables are open`}</h2><p>{returning?`${returnedCount} of ${total} guests are back.`:"The main tasting stage is held while each table follows its own conversation."}</p></div><div className="breakout-clock"><strong>{formatClock(remaining)}</strong><span>{returning?"returning":"remaining"}</span></div></div>
      <div className="host-breakout-rooms">{metrics.rooms.map(room=><article className="host-breakout-room" key={room.id}><div className="row"><strong>Table {room.roomNumber}</strong><span className="spacer"/><span className={`chip ${room.help?"chip-warning":""}`}>{room.participants.filter(participant=>participant.status==="connected").length}/{room.participants.length} connected</span></div><p>{room.participants.map(participant=>participant.displayName).join(" · ")}</p><div className="row host-breakout-signals"><span>Help {room.help}</span><span>More time {room.moreTime}</span><span>Ready {room.ready}</span><span>Card gathering</span></div></article>)}</div>
      <div className="notice"><strong>Privacy boundary:</strong> You see names, connection health, explicit signals, and card readiness—never private notes, spoken transcripts, or table chat. Discovery content unlocks only when tables return.</div>
      <div className="row host-breakout-actions"><span className="help">Use Broadcast in conversation to reach every table.</span><span className="spacer"/><button className="btn btn-secondary" disabled={!enabled||busy||returning} onClick={()=>void onCommand("extend_breakouts",{seconds:60})}>+1 minute</button><button className="btn btn-secondary" disabled={!enabled||busy||returning} onClick={()=>void onCommand("extend_breakouts",{seconds:120})}>+2 minutes</button><button className="btn btn-danger" disabled={!enabled||busy||returning} onClick={()=>{if(window.confirm("Bring every small table back to the main tasting now?"))void onCommand("end_breakouts")}}>Bring back now</button></div>
    </section>;
  }
  return <section className={`card host-breakout-panel${recommended?" recommended":""}`} aria-labelledby="host-small-tables-title">
    <div className="card-header"><div><p className="eyebrow">Optional · after independent observation</p><h2 className="card-title" id="host-small-tables-title">Open tasting tables</h2></div>{recommended&&<span className="chip chip-success">Good moment</span>}</div>
    <p>Guests move to intimate 2–4-person Agora tables for one timed conversation, then return together. Their tasting inputs and private notes remain in place.</p>
    <div className="host-breakout-setup"><label>People per table<select value={roomSize} onChange={event=>setRoomSize(Number(event.target.value))}><option value={2}>2 people</option><option value={3}>3 people · default</option><option value={4}>4 people</option></select></label><label>Pairing<select value={assignmentMode} onChange={event=>setAssignmentMode(event.target.value as BreakoutAssignmentMode)}><option value="shuffle">Shuffle</option><option value="remix">Remix across teas</option></select></label><label>Duration<select value={durationSeconds} onChange={event=>setDurationSeconds(Number(event.target.value))}><option value={240}>4 minutes</option><option value={300}>5 minutes</option><option value={360}>6 minutes</option></select></label></div>
    <div className="row host-breakout-preview"><span className="chip">{sizes.length||0} table{sizes.length===1?"":"s"}</span>{sizes.map((size,index)=><span className="chip" key={index}>Table {index+1}: {size}</span>)}<span className="spacer"/><button className="btn btn-primary btn-attention" disabled={!enabled||busy||!recommended||participantCount<2} onClick={()=>void onCommand("launch_breakouts",{roomSize,assignmentMode,durationSeconds,prompt:BREAKOUT_PROMPTS[0]})}>{busy?"Opening tables…":"Open tasting tables"}</button></div>
    {participantCount<2?<p className="help">Continue together in the main tasting until another guest joins.</p>:!recommended?<p className="help">Available after First Sip, during Explore or Discuss, and before the Reveal.</p>:<p className="help">Guests see a 7-second transition card. A stage-aware optional prompt appears only after Agora connects the table.</p>}
  </section>;
}

function formatClock(ms:number){const total=Math.max(0,Math.ceil(ms/1000));return`${Math.floor(total/60)}:${String(total%60).padStart(2,"0")}`}
