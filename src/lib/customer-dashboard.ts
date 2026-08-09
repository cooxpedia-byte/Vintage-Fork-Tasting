const UPCOMING_EVENT_STATUSES = new Set(["scheduled", "live"]);
const INACTIVE_PARTICIPANT_STATUSES = new Set(["left", "removed"]);
const CUSTOMER_DASHBOARD_SECTIONS = new Set(["home", "journal", "passport", "saved", "merchant"]);
const DEFAULT_EVENT_TIME_ZONE = "America/Edmonton";

export type CustomerDashboardSection = "home" | "journal" | "passport" | "saved" | "merchant";

function supportedEventTimeZone(timeZone: string | null | undefined): string {
  if (!timeZone) return DEFAULT_EVENT_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone }).format();
    return timeZone;
  } catch {
    return DEFAULT_EVENT_TIME_ZONE;
  }
}

export function formatCustomerEventDateTime(value: string, timeZone?: string | null): string {
  return new Date(value).toLocaleString("en-CA", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: supportedEventTimeZone(timeZone)
  });
}

export function formatCustomerEventDate(value: string, timeZone?: string | null): string {
  return new Date(value).toLocaleDateString("en-CA", {
    dateStyle: "long",
    timeZone: supportedEventTimeZone(timeZone)
  });
}

type CustomerResponseSummary = {
  completed_at: string | null;
  saved: boolean;
  rating: number | null;
};

export function shouldShowUpcomingEvent(participantStatus: string, eventStatus: string): boolean {
  return UPCOMING_EVENT_STATUSES.has(eventStatus) && !INACTIVE_PARTICIPANT_STATUSES.has(participantStatus);
}

export function shouldShowJournalEvent(eventStatus: string): boolean {
  return eventStatus === "completed";
}

export function summarizeCustomerResponses<T extends CustomerResponseSummary>(responses: T[]) {
  const completed = responses.filter(response => Boolean(response.completed_at));
  const saved = responses.filter(response => response.saved);
  const rated = completed.filter(response => response.rating !== null);
  const average = rated.length
    ? rated.reduce((sum, response) => sum + (response.rating ?? 0), 0) / rated.length
    : 0;

  return { completed, saved, average };
}

export function parseCustomerDashboardSection(value: string | string[] | undefined): CustomerDashboardSection {
  const section = Array.isArray(value) ? value[0] : value;
  if (section === "tea-cellar") return "passport";
  if (section === "tea-merchant") return "merchant";
  return section && CUSTOMER_DASHBOARD_SECTIONS.has(section) ? section as CustomerDashboardSection : "home";
}
