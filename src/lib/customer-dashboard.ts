const UPCOMING_EVENT_STATUSES = new Set(["scheduled", "live"]);
const INACTIVE_PARTICIPANT_STATUSES = new Set(["left", "removed"]);
const CUSTOMER_DASHBOARD_SECTIONS = new Set(["home", "journal", "passport", "saved"]);

export type CustomerDashboardSection = "home" | "journal" | "passport" | "saved";

export function shouldShowUpcomingEvent(participantStatus: string, eventStatus: string): boolean {
  return UPCOMING_EVENT_STATUSES.has(eventStatus) && !INACTIVE_PARTICIPANT_STATUSES.has(participantStatus);
}

export function parseCustomerDashboardSection(value: string | string[] | undefined): CustomerDashboardSection {
  const section = Array.isArray(value) ? value[0] : value;
  return section && CUSTOMER_DASHBOARD_SECTIONS.has(section) ? section as CustomerDashboardSection : "home";
}
