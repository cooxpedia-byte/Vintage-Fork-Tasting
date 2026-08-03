import { formatGuestTimer, getGuestTimerAnnouncement } from "@/lib/guest-timer";

export function BrewingTimer({ remainingMs }: { remainingMs: number }) {
  const clock = formatGuestTimer(remainingMs);
  const announcement = getGuestTimerAnnouncement(remainingMs);
  return <>
    <div className="timer-ring" role="timer" aria-live="off" aria-label={`Brewing timer, ${clock} remaining`}>
      <div><div className="timer-readout">{clock}</div><small className="muted">host controlled</small></div>
    </div>
    <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</span>
  </>;
}
