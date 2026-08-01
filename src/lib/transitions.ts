import type { EventCommand, SessionPhase } from "@/types/domain";

export const COMMAND_PHASES: Record<EventCommand, SessionPhase[]> = {
  open_session: ["lobby"],
  reveal_tea: ["welcome", "tasting"],
  start_timer: ["reveal", "brewing"],
  open_tasting: ["reveal", "brewing"],
  open_trivia: ["tasting"],
  close_trivia: ["trivia"],
  return_to_tasting: ["trivia"],
  next_tea: ["tasting", "trivia"],
  start_recap: ["tasting", "trivia"],
  end_session: ["welcome", "reveal", "brewing", "tasting", "trivia", "recap"]
};

export function canRunCommand(phase: SessionPhase, command: EventCommand): boolean {
  return COMMAND_PHASES[command].includes(phase);
}

export function commandLabel(command: EventCommand): string {
  return ({
    open_session: "Open the tasting",
    reveal_tea: "Reveal tea",
    start_timer: "Start timer",
    open_tasting: "Open tasting",
    open_trivia: "Open trivia",
    close_trivia: "Close trivia",
    return_to_tasting: "Return to tasting",
    next_tea: "Next tea",
    start_recap: "Start recap",
    end_session: "End tasting"
  } satisfies Record<EventCommand, string>)[command];
}
