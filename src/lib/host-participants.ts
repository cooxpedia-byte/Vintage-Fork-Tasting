const ACTIVE_ROOM_WINDOW_MS = 45_000;

type ParticipantPresence = {
  status: string;
  last_seen_at: string | null;
};

export function isActiveRoomParticipant(participant: ParticipantPresence, now: number | null): boolean {
  if (now === null || participant.last_seen_at === null) return false;
  if (participant.status === "left" || participant.status === "removed") return false;

  const lastSeenAt = new Date(participant.last_seen_at).getTime();
  if (!Number.isFinite(lastSeenAt)) return false;

  return now - lastSeenAt < ACTIVE_ROOM_WINDOW_MS;
}
