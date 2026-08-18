"use client";

import {useMemo,useState} from "react";
import {GoldLeafIcon} from "@/components/live/GoldLeafIcon";
import type {HostCommandPayload} from "@/lib/host-command";
import type {HostLiveRewardsSnapshot} from "@/lib/live-rewards";
import type {EventCommand} from "@/types/domain";

type RewardParticipant={id:string;display_name:string;status:string};

export function HostLiveRewardsControl({snapshot,participants,busy,enabled,onCommand}:{snapshot:HostLiveRewardsSnapshot|null;participants:RewardParticipant[];busy:boolean;enabled:boolean;onCommand:(command:EventCommand,payload?:HostCommandPayload)=>Promise<void>}){
  const[participantId,setParticipantId]=useState("");
  const candidates=useMemo(()=>participants.filter(participant=>participant.status!=="removed"&&!snapshot?.manualCompletionParticipantIds.includes(participant.id)),[participants,snapshot]);
  if(!snapshot)return <section className="host-live-rewards"><p>Loading the Gold Leaves policy…</p></section>;
  if(!snapshot.available)return <section className="host-live-rewards"><p><strong>Gold Leaves are unavailable.</strong> The tasting remains fully usable.</p></section>;
  const toggle=()=>void onCommand("set_reward_mode",{rewardModeEnabled:!snapshot.enabled});
  const grant=()=>{if(participantId)void onCommand("grant_reward_completion",{participantId}).then(()=>setParticipantId(""))};
  return <section className="host-live-rewards" aria-labelledby="host-live-rewards-title">
    <div className="host-live-rewards-heading"><GoldLeafIcon/><div><p className="eyebrow">Private acknowledgment · centrally governed</p><h2 id="host-live-rewards-title">Gold Leaves</h2><p>{snapshot.completionLeaves} Leaves for eligible event completion · hard cap {snapshot.eventCap}</p></div></div>
    <div className="host-live-rewards-summary" aria-label="Aggregate Gold Leaves summary"><span><strong>{snapshot.eligibleCount}</strong> eligible</span><span><strong>{snapshot.awardedCount}</strong> awarded</span><span><strong>{snapshot.totalAwarded}</strong> Leaves total</span>{snapshot.pendingCount>0&&<span><strong>{snapshot.pendingCount}</strong> pending</span>}{snapshot.retryCount>0&&<span><strong>{snapshot.retryCount}</strong> reconciling</span>}</div>
    <div className="host-live-rewards-actions"><button className={`btn ${snapshot.enabled?"btn-gold":"btn-secondary"}`} type="button" aria-pressed={snapshot.enabled} disabled={!enabled||busy} onClick={toggle}>Rewards {snapshot.enabled?"on":"off"}</button><details><summary>Completion exception</summary><div className="host-live-rewards-exception"><label>Guest<select value={participantId} onChange={event=>setParticipantId(event.target.value)}><option value="">Choose a guest</option>{candidates.map(participant=><option value={participant.id} key={participant.id}>{participant.display_name}</option>)}</select></label><button className="btn btn-secondary" type="button" disabled={!enabled||busy||!participantId} onClick={grant}>Grant completion</button><p className="help">Use only for accessibility or technical edge cases. This is audited and never changes the centrally configured amount.</p></div></details></div>
    <p className="help">No Leaves are paid for flavors, chat, reactions, speaking, breakouts, spokesperson roles, or Cheers. No participant ranking is shown.</p>
  </section>;
}
