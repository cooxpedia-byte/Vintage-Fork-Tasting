"use client";

import { useMemo, useState } from "react";
import {
  CONDUCTOR_STAGES,
  conductorElapsedMs,
  conductorPrimaryLabel,
  formatDuration,
  getConductorStage,
  previousConductorStage,
  resolveConductorStage
} from "@/lib/conductor";
import type { ConductorStage, EventCommand, SessionPhase } from "@/types/domain";
import { sharedBrewPhase, sharedBrewRemainingMs, type SharedBrew } from "@/lib/shared-brewing";

export type ConductorMetrics = {
  participants: number;
  connected: number;
  ready: number;
  poured: number;
  pouring: number;
  decanted: number;
  observed: number;
  completed: number;
};

type RailEvent = {
  phase: SessionPhase;
  conductor_stage: ConductorStage;
  conductor_stage_started_at: string | null;
  conductor_stage_duration_seconds: number | null;
  conductor_paused_at: string | null;
  conductor_remaining_seconds: number | null;
};

export function HostConductorRail({
  event,
  teaNumber,
  teaTitle,
  nextTeaTitle,
  brewSeconds,
  brew,
  metrics,
  now,
  busy,
  enabled,
  watchingLabel,
  optionalAction,
  onCommand,
  onEnd
}: {
  event: RailEvent;
  teaNumber: number | null;
  teaTitle: string | null;
  nextTeaTitle: string | null;
  brewSeconds: number;
  brew: SharedBrew | null;
  metrics: ConductorMetrics;
  now: number;
  busy: boolean;
  enabled: boolean;
  watchingLabel: string;
  optionalAction: null | { label: string; command: EventCommand };
  onCommand: (command: EventCommand, payload?: { targetStage?: ConductorStage; seconds?: number; durationSeconds?: number; countdownSeconds?: number }) => Promise<void>;
  onEnd: () => void;
}) {
  const [jumpTarget, setJumpTarget] = useState<ConductorStage>(() => resolveConductorStage(event));
  const [countdownSeconds, setCountdownSeconds] = useState(3);
  const [durationSeconds,setDurationSeconds]=useState(brewSeconds);
  const stage = resolveConductorStage(event);
  const definition = getConductorStage(stage);
  const paused = Boolean(event.conductor_paused_at);
  const elapsedSeconds = Math.floor(conductorElapsedMs(event, now) / 1000);
  const primaryLabel = conductorPrimaryLabel(stage, nextTeaTitle, brewSeconds);
  const brewPhase = brew ? sharedBrewPhase(brew, now) : null;
  const brewRemaining = brew ? Math.ceil(sharedBrewRemainingMs(brew, now) / 1000) : brewSeconds;
  const confidence = useMemo(() => {
    if (stage === "prepare") return `${metrics.ready} of ${metrics.participants} ready`;
    if (stage === "brew") return `${metrics.pouring} pouring · ${metrics.decanted} decanted`;
    if (["discuss", "reveal"].includes(stage)) return `${metrics.observed} of ${metrics.participants} have added observations`;
    if (stage === "close_tea") return `${metrics.completed} of ${metrics.participants} have completed this tea`;
    return `${metrics.connected} of ${metrics.participants} connected`;
  }, [metrics, stage]);

  async function skip() {
    const inputBypassed = ["first_sip", "explore", "close_tea"].includes(stage);
    if (inputBypassed && !window.confirm(`Skip ${definition.label}? Participants can keep their drafts and return to their notes later.`)) return;
    await onCommand("skip_stage");
  }

  async function jump() {
    if (jumpTarget === stage) return;
    if (!window.confirm(`Jump the room from ${definition.label} to ${getConductorStage(jumpTarget).label}? Drafts will be preserved.`)) return;
    await onCommand("jump_stage", { targetStage: jumpTarget });
  }

  return <footer className="conductor-rail" aria-label="Host conductor">
    <div className="conductor-rail-context">
      <span className="eyebrow">{teaNumber ? `Tea ${teaNumber}` : "Live tasting"}</span>
      <strong>{teaTitle ?? "Room arrival"}</strong>
      <span>{definition.label} · {formatDuration(elapsedSeconds)} elapsed{paused ? " · paused" : ""}</span>
    </div>
    <div className="conductor-rail-primary">
      <span className="conductor-confidence" role="status">{confidence}</span>
      {enabled
        ? paused
          ? <button className="btn btn-primary btn-attention" disabled={busy} onClick={() => void onCommand("resume_stage")}>{busy ? "Applying…" : "Resume infusion"}</button>
          : stage === "prepare"
            ? <button className="btn btn-primary btn-attention" disabled={busy} onClick={() => void onCommand("start_brew", { durationSeconds, countdownSeconds })}>{busy ? "Starting…" : `Start brew · ${formatDuration(durationSeconds)}`}</button>
            : stage === "brew" && brewPhase !== "complete"
              ? <button className="btn btn-primary conductor-brew-running" disabled>{brewPhase === "countdown" ? "Shared countdown" : `Brewing · ${formatDuration(brewRemaining)}`}</button>
              : <button className="btn btn-primary btn-attention" disabled={busy || event.phase === "recap"} onClick={() => void onCommand("advance_stage")}>{busy ? "Applying…" : stage === "brew" ? "Open Aroma" : primaryLabel}</button>
        : <button className="btn btn-secondary" disabled>{watchingLabel}</button>}
      <small>Next: {stage === "transition" ? nextTeaTitle ? "Prepare" : "Event recap" : getConductorStage(CONDUCTOR_STAGES[CONDUCTOR_STAGES.findIndex(candidate => candidate.id === stage) + 1]?.id ?? stage).label}</small>
    </div>
    <details className="conductor-more">
      <summary>More</summary>
      <div className="conductor-more-menu">
        <button type="button" disabled={!enabled || busy || (stage==="brew"&&brewPhase==="complete")} onClick={() => void onCommand(paused ? "resume_stage" : "pause_stage")}>{paused ? "Resume" : "Pause"}</button>
        {(["prepare","brew"] as ConductorStage[]).includes(stage)&&<label>Infusion duration<input type="number" min={1} max={7200} value={durationSeconds} disabled={!enabled||busy||(stage==="brew"&&brewPhase!=="complete")} onChange={change=>setDurationSeconds(Math.min(7200,Math.max(1,Number(change.target.value)||1)))} /><span className="help">seconds · preset {brewSeconds}</span></label>}
        {(stage === "prepare"||(stage==="brew"&&brewPhase==="complete")) && <label>Shared start<select value={countdownSeconds} disabled={!enabled || busy} onChange={change => setCountdownSeconds(Number(change.target.value))}><option value={3}>3–2–1 countdown</option><option value={0}>Start immediately</option></select></label>}
        {stage === "brew" && <div className="conductor-brew-extensions" aria-label="Extend infusion">{[15,30,60].map(seconds=><button type="button" key={seconds} disabled={!enabled||busy||brewPhase==="complete"} onClick={() => void onCommand("extend_stage", { seconds })}>+{seconds}s</button>)}</div>}
        {stage === "brew" && brewPhase !== "complete" && <button type="button" disabled={!enabled||busy} onClick={() => { if(window.confirm("End this infusion early? Participants will see Pour now, and the room will remain in the brew stage."))void onCommand("end_brew_early") }}>End brew early…</button>}
        {stage === "brew" && brewPhase === "complete" && <button type="button" disabled={!enabled||busy} onClick={() => void onCommand("start_next_infusion", { durationSeconds,countdownSeconds })}>Start next infusion</button>}
        {stage === "brew" && <button type="button" disabled={!enabled||busy} onClick={() => { if(window.confirm("Restart this infusion? The current brew will be preserved as cancelled and everyone will receive a new shared countdown."))void onCommand("restart_brew", { durationSeconds,countdownSeconds }) }}>Restart infusion…</button>}
        <button type="button" disabled={!enabled || busy || stage === "prepare" || !previousConductorStage(stage)} onClick={() => void onCommand("go_back_stage")}>Go back one stage</button>
        <button type="button" disabled={!enabled || busy || event.phase === "recap"} onClick={() => void skip()}>Skip this stage</button>
        {optionalAction && <button type="button" disabled={!enabled || busy} onClick={() => void onCommand(optionalAction.command)}>{optionalAction.label}</button>}
        <label>Jump to stage<select value={jumpTarget} disabled={!enabled || busy || stage === "arrival"} onChange={change => setJumpTarget(change.target.value as ConductorStage)}>{CONDUCTOR_STAGES.filter(candidate => candidate.id !== "arrival").map(candidate => <option value={candidate.id} key={candidate.id}>{candidate.label}</option>)}</select></label>
        <button type="button" disabled={!enabled || busy || stage === "arrival" || jumpTarget === stage} onClick={() => void jump()}>Confirm jump</button>
        <button type="button" className="danger" disabled={!enabled || busy} onClick={onEnd}>End tasting…</button>
      </div>
    </details>
  </footer>;
}
