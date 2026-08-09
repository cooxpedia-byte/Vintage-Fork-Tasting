const MOBILE_HOME_ROUTE = "vintagefork://live-events";

export function liveEventsPath(): string {
  return "/live-events";
}

export function guestEventPath(inviteCode: string): string {
  const normalized = inviteCode.trim().toUpperCase();
  if (!normalized || !/^[A-Z0-9-]+$/.test(normalized)) {
    throw new Error("invalid_invite_code");
  }
  return `/event/${encodeURIComponent(normalized)}`;
}

export function hostEventPath(eventId: string): string {
  const normalized = eventId.trim();
  if (!normalized || !/^[a-zA-Z0-9-]+$/.test(normalized)) {
    throw new Error("invalid_event_id");
  }
  return `/admin/events/${encodeURIComponent(normalized)}/live`;
}

export function mobileHomeLiveEventsUrl(): string {
  return MOBILE_HOME_ROUTE;
}
