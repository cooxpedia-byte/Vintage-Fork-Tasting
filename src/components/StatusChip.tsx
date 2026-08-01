import type { EventStatus, SessionPhase } from "@/types/domain";

export function StatusChip({ value }: { value: EventStatus | SessionPhase | string }) {
  const live = ["live", "welcome", "reveal", "brewing", "tasting", "trivia", "recap"].includes(value);
  const success = ["scheduled", "completed", "ended"].includes(value);
  const warning = ["draft", "lobby"].includes(value);
  return <span className={`chip ${live ? "chip-live" : success ? "chip-success" : warning ? "chip-warning" : ""}`}>{value.replaceAll("_", " ")}</span>;
}
