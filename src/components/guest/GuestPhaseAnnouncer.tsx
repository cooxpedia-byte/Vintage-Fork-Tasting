export function GuestPhaseAnnouncer({ message }: { message: string }) {
  return <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{message}</span>;
}
