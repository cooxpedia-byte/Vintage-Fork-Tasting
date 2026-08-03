const FORBIDDEN_CROSS_GUEST_FIELDS = ["leaderboard", "descriptorLeaders"] as const;

type ForbiddenCrossGuestField = (typeof FORBIDDEN_CROSS_GUEST_FIELDS)[number];

export function maskEmail(address: string): string {
  const [local, domain] = address.trim().split("@");
  if (!local || !domain) return "your email";
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"•".repeat(Math.max(3, Math.min(6, local.length - visible.length)))}@${domain}`;
}

export function protectGuestState<T extends Record<string, unknown>>(
  payload: T
): Omit<T, ForbiddenCrossGuestField> {
  const safePayload = { ...payload };
  for (const field of FORBIDDEN_CROSS_GUEST_FIELDS) delete safePayload[field];
  return safePayload;
}

type BrowserStorage = Pick<Storage, "key" | "length" | "removeItem">;

export function clearGuestDeviceData(
  localStore: BrowserStorage,
  sessionStore: Pick<Storage, "removeItem">,
  eventId: string,
  participantId: string
) {
  const prefix = `vf:draft:${eventId}:${participantId}:`;
  const matchingKeys: string[] = [];
  for (let index = 0; index < localStore.length; index += 1) {
    const key = localStore.key(index);
    if (key?.startsWith(prefix)) matchingKeys.push(key);
  }
  for (const key of matchingKeys) localStore.removeItem(key);
  sessionStore.removeItem("pending_trivia_answer");
}
