const FORBIDDEN_CROSS_GUEST_FIELDS = ["leaderboard", "descriptorLeaders"] as const;

type ForbiddenCrossGuestField = (typeof FORBIDDEN_CROSS_GUEST_FIELDS)[number];

export function protectGuestState<T extends Record<string, unknown>>(
  payload: T
): Omit<T, ForbiddenCrossGuestField> {
  const safePayload = { ...payload };
  for (const field of FORBIDDEN_CROSS_GUEST_FIELDS) delete safePayload[field];
  return safePayload;
}
