export const CONNECTION_HEALTH_EVENT = "vf:connection-health";
export const CONNECTION_RETRY_EVENT = "vf:connection-retry";

export type ConnectionHealthDetail = { source: string; healthy: boolean };
export type ConnectionIssues = Record<string, true>;

export function updateConnectionIssues(current: ConnectionIssues, detail: ConnectionHealthDetail): ConnectionIssues {
  const next = { ...current };
  if (detail.healthy) delete next[detail.source];
  else next[detail.source] = true;
  return next;
}

export function getConnectionNotice(online: boolean, issues: ConnectionIssues): string | null {
  if (!online) return "You’re offline. Personal notes remain on this device; live actions wait until the connection returns.";
  if (Object.keys(issues).length) return "We can’t reach part of the tasting service. Your notes remain on this device; live updates and actions may be delayed.";
  return null;
}

export function reportConnectionIssue(source: string) { dispatchConnectionHealth({ source, healthy: false }); }
export function reportConnectionHealthy(source: string) { dispatchConnectionHealth({ source, healthy: true }); }

export function requestConnectionRetry() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CONNECTION_RETRY_EVENT));
}

export function listenForConnectionRetry(listener: () => void) {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(CONNECTION_RETRY_EVENT, listener);
  return () => window.removeEventListener(CONNECTION_RETRY_EVENT, listener);
}

function dispatchConnectionHealth(detail: ConnectionHealthDetail) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(CONNECTION_HEALTH_EVENT, { detail }));
}
