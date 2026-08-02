const UPCOMING_EVENT_STATUSES = new Set(["scheduled", "live"]);
const INACTIVE_PARTICIPANT_STATUSES = new Set(["left", "removed"]);

export function shouldShowUpcomingEvent(participantStatus: string, eventStatus: string): boolean {
  return UPCOMING_EVENT_STATUSES.has(eventStatus) && !INACTIVE_PARTICIPANT_STATUSES.has(participantStatus);
}
