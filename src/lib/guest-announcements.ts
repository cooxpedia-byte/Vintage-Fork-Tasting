import type { SessionPhase } from "@/types/domain";

export type GuestPhaseAnnouncementInput = {
  phase: SessionPhase;
  teaTitle: string | null;
  position: number;
  flightCount: number;
  betweenTeas: boolean;
  triviaClosed: boolean;
  participantRemoved: boolean;
};

export function getGuestPhaseAnnouncement({
  phase,
  teaTitle,
  position,
  flightCount,
  betweenTeas,
  triviaClosed,
  participantRemoved
}: GuestPhaseAnnouncementInput): string {
  if (participantRemoved) return "You’ve been removed from this tasting.";
  if (betweenTeas) return "This tea is complete. Waiting for the host to reveal the next tea.";

  const tea = teaTitle ?? "the current tea";
  const teaContext = position > 0 && flightCount > 0 ? `tea ${position} of ${flightCount}, ${tea}` : tea;

  switch (phase) {
    case "lobby": return "You’re in the tasting room. Waiting for the host to begin.";
    case "welcome": return "The tasting has started. Welcome to the table.";
    case "reveal": return `Now revealing ${teaContext}.`;
    case "brewing": return `Brewing has started for ${teaContext}.`;
    case "tasting": return `Tasting is open for ${teaContext}.`;
    case "trivia": return triviaClosed ? `Trivia has closed for ${teaContext}. The answer is now available.` : `Trivia is open for ${teaContext}.`;
    case "recap": return "Your tasting recap is ready.";
    case "ended": return "The tasting has ended. Your recap is ready.";
  }
}
