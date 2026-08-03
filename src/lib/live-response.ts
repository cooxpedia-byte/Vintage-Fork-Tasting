import type { EventStatus, SessionPhase } from "@/types/domain";

type LiveResponseEvent = {
  status: EventStatus;
  phase: SessionPhase;
  current_flight_item_id: string | null;
  tasting_opened_flight_item_id: string | null;
};

export type LiveResponseWindowDecision =
  | { allowed: true }
  | { allowed: false; message: string };

export function evaluateLiveResponseWindow(
  event: LiveResponseEvent | null,
  flightItemId: string
): LiveResponseWindowDecision {
  if (!event || event.status !== "live" || !["tasting", "trivia", "recap"].includes(event.phase)) {
    return { allowed: false, message: "The host has not opened tasting responses." };
  }
  if (event.phase !== "recap" && event.tasting_opened_flight_item_id !== event.current_flight_item_id) {
    return { allowed: false, message: "The host has not opened this tea for responses." };
  }
  if (event.phase !== "recap" && event.current_flight_item_id !== flightItemId) {
    return { allowed: false, message: "The room has moved to another tea." };
  }
  return { allowed: true };
}
