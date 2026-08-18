export type SharedBrewStatus = "ready" | "running" | "paused" | "complete" | "cancelled";

export type SharedBrew = {
  id: string;
  event_id: string;
  event_flight_item_id: string;
  infusion_number: number;
  started_at: string;
  duration_ms: number;
  status: SharedBrewStatus;
  paused_at: string | null;
  accumulated_pause_ms: number;
  host_id: string;
  completed_at: string | null;
};

export type SharedBrewPhase = "countdown" | "running" | "paused" | "complete" | "cancelled";

export function sharedBrewRemainingMs(brew: SharedBrew, nowMs: number) {
  if (brew.status === "complete" || brew.status === "cancelled") return 0;
  const startedAt = new Date(brew.started_at).getTime();
  const effectiveNow = brew.paused_at ? new Date(brew.paused_at).getTime() : nowMs;
  return Math.max(0, startedAt + brew.duration_ms + brew.accumulated_pause_ms - effectiveNow);
}

export function sharedBrewCountdownMs(brew: SharedBrew, nowMs: number) {
  if (brew.status === "complete" || brew.status === "cancelled") return 0;
  return Math.max(0, new Date(brew.started_at).getTime() - nowMs);
}

export function sharedBrewPhase(brew: SharedBrew, nowMs: number): SharedBrewPhase {
  if (brew.status === "cancelled") return "cancelled";
  if (brew.status === "complete" || sharedBrewRemainingMs(brew, nowMs) === 0) return "complete";
  if (brew.status === "paused") return "paused";
  if (sharedBrewCountdownMs(brew, nowMs) > 0) return "countdown";
  return "running";
}

export function sharedBrewMilestone(previousSeconds: number | null, seconds: number) {
  if (previousSeconds === null || seconds >= previousSeconds) return "";
  if (previousSeconds > 30 && seconds <= 30) return "30 seconds remaining. Prepare to pour.";
  if (previousSeconds > 10 && seconds <= 10) return "10 seconds remaining.";
  if (previousSeconds > 3 && seconds <= 3) return "3 seconds remaining.";
  if (previousSeconds > 0 && seconds === 0) return "Infusion complete. Pour now.";
  return "";
}

export function sharedBrewStatusCopy(phase: SharedBrewPhase) {
  if (phase === "countdown") return "Ready?";
  if (phase === "running") return "Infusing together";
  if (phase === "paused") return "Paused by host";
  if (phase === "cancelled") return "Brew restarted";
  return "Infusion complete · Pour now";
}
