import type { SessionPhase } from "@/types/domain";

export function getHostPhaseAnnouncement(phase: SessionPhase, teaTitle: string | null): string {
  const tea = teaTitle ?? "the current tea";
  switch (phase) {
    case "lobby": return "The room is in the lobby.";
    case "welcome": return "The tasting is open. Guests are on the welcome screen.";
    case "reveal": return `The room is now revealing ${tea}.`;
    case "brewing": return `The room is now brewing ${tea}.`;
    case "tasting": return `The room is now tasting ${tea}.`;
    case "trivia": return `The room is now in trivia for ${tea}.`;
    case "recap": return "The room is now in the recap.";
    case "ended": return "The tasting has ended.";
  }
}

export function getHostPrimaryAnnouncement({
  consoleCurrent,
  holder,
  phase,
  label,
  disabled
}: {
  consoleCurrent: boolean;
  holder: boolean;
  phase: SessionPhase;
  label: string | null;
  disabled: boolean;
}): string {
  if (phase === "ended") return "Next action: See results.";
  if (!consoleCurrent) return "Host controls are paused while the console reconnects.";
  if (!holder) return "Host controls are unavailable. You are watching this tasting.";
  if (!label) return "There is no next phase action right now.";
  return disabled ? `Next action unavailable: ${label}.` : `Next action: ${label}.`;
}
