export function formatGuestTimer(remainingMs: number): string {
  const total = Math.max(0, Math.ceil(remainingMs / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function getGuestTimerAnnouncement(remainingMs: number): string {
  const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
  if (seconds === 10) return "Brewing timer: 10 seconds remaining.";
  if (seconds === 5) return "Brewing timer: 5 seconds remaining.";
  if (seconds === 0) return "Brewing timer complete.";
  return "";
}
