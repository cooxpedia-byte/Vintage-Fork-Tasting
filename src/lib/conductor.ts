import type { SessionPhase } from "@/types/domain";

export const CONDUCTOR_STAGES = [
  { id: "arrival", label: "Arrival", instruction: "Join the room, check audio and video, and settle in.", primarySurface: "Host welcome", legacyPhase: "lobby", video: "expanded", communication: "normal" },
  { id: "prepare", label: "Prepare", instruction: "Meet the tea and get your cup, leaf, and water ready.", primarySurface: "Tea setup", legacyPhase: "welcome", video: "normal", communication: "normal" },
  { id: "brew", label: "Brew", instruction: "Follow the shared timer. Pour when your tea is ready.", primarySurface: "Shared brew timer", legacyPhase: "brewing", video: "normal", communication: "normal" },
  { id: "aroma", label: "Aroma", instruction: "Smell first. Notice before you name.", primarySurface: "Aroma workspace", legacyPhase: "tasting", video: "recessed", communication: "quiet" },
  { id: "first_sip", label: "First Sip", instruction: "First sip. Just notice.", primarySurface: "Independent first impression", legacyPhase: "tasting", video: "recessed", communication: "quiet" },
  { id: "explore", label: "Explore", instruction: "Follow what changes as the tea opens and cools.", primarySurface: "Tasting tools", legacyPhase: "tasting", video: "normal", communication: "normal" },
  { id: "discuss", label: "Discuss", instruction: "Compare experiences. Different impressions belong in the room.", primarySurface: "People and conversation", legacyPhase: "tasting", video: "expanded", communication: "prominent" },
  { id: "reveal", label: "Reveal", instruction: "See what emerged across the room.", primarySurface: "Shared discoveries", legacyPhase: "tasting", video: "normal", communication: "normal" },
  { id: "debrief", label: "Debrief", instruction: "Return to the cup and notice what changed.", primarySurface: "Reflection", legacyPhase: "tasting", video: "expanded", communication: "prominent" },
  { id: "close_tea", label: "Close Tea", instruction: "Save what matters from this tea.", primarySurface: "Tasting card", legacyPhase: "tasting", video: "normal", communication: "normal" },
  { id: "transition", label: "Transition", instruction: "Rinse your cup and prepare for the next shared moment.", primarySurface: "Next tea setup", legacyPhase: "tasting", video: "normal", communication: "normal" }
] as const;

export type ConductorStage = (typeof CONDUCTOR_STAGES)[number]["id"];
export type ConductorVideoEmphasis = (typeof CONDUCTOR_STAGES)[number]["video"];
export type ConductorCommunicationEmphasis = (typeof CONDUCTOR_STAGES)[number]["communication"];

export type ConductorEventState = {
  phase: SessionPhase;
  conductor_stage?: string | null;
  conductor_stage_started_at?: string | null;
  conductor_stage_duration_seconds?: number | null;
  conductor_paused_at?: string | null;
  conductor_remaining_seconds?: number | null;
};

const STAGE_IDS = new Set<string>(CONDUCTOR_STAGES.map(stage => stage.id));

export function isConductorStage(value: unknown): value is ConductorStage {
  return typeof value === "string" && STAGE_IDS.has(value);
}

export function resolveConductorStage(event: Pick<ConductorEventState, "phase" | "conductor_stage">): ConductorStage {
  if (isConductorStage(event.conductor_stage)) return event.conductor_stage;
  switch (event.phase) {
    case "lobby": return "arrival";
    case "welcome":
    case "reveal": return "prepare";
    case "brewing": return "brew";
    case "trivia": return "discuss";
    case "recap":
    case "ended": return "transition";
    case "tasting": return "explore";
  }
}

export function getConductorStage(stage: ConductorStage) {
  return CONDUCTOR_STAGES.find(candidate => candidate.id === stage) ?? CONDUCTOR_STAGES[0];
}

export function nextConductorStage(stage: ConductorStage): ConductorStage | null {
  const index = CONDUCTOR_STAGES.findIndex(candidate => candidate.id === stage);
  return index >= 0 ? CONDUCTOR_STAGES[index + 1]?.id ?? null : null;
}

export function previousConductorStage(stage: ConductorStage): ConductorStage | null {
  const index = CONDUCTOR_STAGES.findIndex(candidate => candidate.id === stage);
  return index > 0 ? CONDUCTOR_STAGES[index - 1]?.id ?? null : null;
}

export function conductorStageDistance(from: ConductorStage, to: ConductorStage) {
  return Math.abs(
    CONDUCTOR_STAGES.findIndex(candidate => candidate.id === from)
      - CONDUCTOR_STAGES.findIndex(candidate => candidate.id === to)
  );
}

export function conductorElapsedMs(event: ConductorEventState, now: number) {
  if (!event.conductor_stage_started_at) return 0;
  const effectiveNow = event.conductor_paused_at ? new Date(event.conductor_paused_at).getTime() : now;
  return Math.max(0, effectiveNow - new Date(event.conductor_stage_started_at).getTime());
}

export function conductorRemainingMs(event: ConductorEventState, now: number) {
  if (event.conductor_paused_at && event.conductor_remaining_seconds !== null && event.conductor_remaining_seconds !== undefined) {
    return Math.max(0, event.conductor_remaining_seconds * 1000);
  }
  if (!event.conductor_stage_started_at || !event.conductor_stage_duration_seconds) return null;
  return Math.max(0, event.conductor_stage_duration_seconds * 1000 - conductorElapsedMs(event, now));
}

export function conductorPrimaryLabel(stage: ConductorStage, nextTeaTitle: string | null, brewSeconds: number) {
  switch (stage) {
    case "arrival": return "Welcome the room";
    case "prepare": return `Start brew · ${formatDuration(brewSeconds)}`;
    case "brew": return "Open aroma";
    case "aroma": return "Invite first sip";
    case "first_sip": return "Open exploration";
    case "explore": return "Open discussion";
    case "discuss": return "Show what emerged";
    case "reveal": return "Guide reflection";
    case "debrief": return "Complete this tea";
    case "close_tea": return "Move to transition";
    case "transition": return nextTeaTitle ? `Prepare ${nextTeaTitle}` : "Start the event recap";
  }
}

export function formatDuration(seconds: number) {
  const safe = Math.max(0, Math.round(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}
