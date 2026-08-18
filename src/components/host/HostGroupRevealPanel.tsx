"use client";

import { GroupDiscoveryReveal, flavorMentionedByRooms } from "@/components/live/GroupDiscoveryReveal";
import type { GroupRevealSnapshot } from "@/lib/group-reveal";
import type { HostCommandPayload } from "@/lib/host-command";
import type { EventCommand } from "@/types/domain";

export function HostGroupRevealPanel({snapshot,teaName,producerNote,busy,enabled,onCommand}:{snapshot:GroupRevealSnapshot|null;teaName:string;producerNote:string|null;busy:boolean;enabled:boolean;onCommand:(command:EventCommand,payload?:HostCommandPayload)=>Promise<void>}){
  if(!snapshot)return <section className="card host-group-reveal"><p>Loading the group portrait…</p></section>;
  const visible=snapshot.state!=="hidden";
  const combined=["combined","timeline","fingerprint"].includes(snapshot.state);
  const highlightedRooms=snapshot.highlightedFlavor?flavorMentionedByRooms(snapshot,snapshot.highlightedFlavor):[];
  const setHighlight=(key:string|null)=>void onCommand(key?"highlight_group_flavor":"clear_group_flavor",key?{flavorKey:key}:{});
  return <section className="card host-group-reveal" aria-labelledby="host-group-reveal-title"><div className="card-header"><div><p className="eyebrow">Signature reveal · host conductor</p><h2 className="card-title" id="host-group-reveal-title">Group discovery</h2><p>Guide attention to patterns without grading. Guests see the same shared state after each confirmed command.</p></div><span className={`chip ${visible?"chip-live":""}`}>{snapshot.state}</span></div>
    <div className="host-group-reveal-controls" aria-label="Group reveal controls">
      <button className="btn btn-secondary" disabled={!enabled||busy} onClick={()=>void onCommand("reveal_group_aroma")}>Show aroma portrait</button>
      <button className="btn btn-secondary" disabled={!enabled||busy} onClick={()=>void onCommand("reveal_group_taste")}>Show taste portrait</button>
      <button className="btn btn-primary" disabled={!enabled||busy||!visible} onClick={()=>void onCommand("combine_group_reveal")}>Combine layers</button>
      <button className="btn btn-secondary" disabled={!enabled||busy||!combined} onClick={()=>void onCommand("show_group_timeline",{timelineIndex:0})}>Open timeline</button>
      <button className="btn btn-secondary" disabled={!enabled||busy||!combined} onClick={()=>void onCommand(snapshot.producerNotesVisible?"hide_group_producer_notes":"show_group_producer_notes")}>{snapshot.producerNotesVisible?"Hide producer notes":"Open producer notes"}</button>
      <button className="btn btn-primary btn-attention" disabled={!enabled||busy||!combined} onClick={()=>void onCommand("freeze_group_fingerprint")}>{snapshot.fingerprintVersion?"Freeze new version":"Freeze fingerprint"}</button>
    </div>
    {snapshot.state==="timeline"&&snapshot.timeline.length>0&&<div className="host-group-timeline-controls" aria-label="Timeline moments">{snapshot.timeline.map((event,index)=><button className={snapshot.timelineIndex===index?"active":""} type="button" key={event.id} disabled={!enabled||busy} onClick={()=>void onCommand("set_group_timeline",{timelineIndex:index})}>{index+1}. {event.label}</button>)}</div>}
    <GroupDiscoveryReveal snapshot={snapshot} teaName={teaName} producerNote={producerNote} presentation="host" onHighlight={setHighlight}/>
    {snapshot.highlightedFlavor&&<div className="notice"><strong>Observation highlighted.</strong> {highlightedRooms.length?`Mentioned by Table ${highlightedRooms.join(", Table ")}.`:"No returned table card used this exact observation."}</div>}
    <div className="row host-group-reveal-footer"><button className="btn btn-quiet" disabled={!enabled||busy||!visible} onClick={()=>void onCommand("return_group_discussion")}>Return to discussion</button><span className="help">Chat, tea reactions, and Agora video stay available throughout.</span></div>
  </section>;
}
