export type EventStartTimeResult =
  | { ok: true; iso: string }
  | { ok: false; error: string };

export function parseEventStartTime(value: string): EventStartTimeResult {
  if (!value.trim()) return { ok: false, error: "Choose a valid start date and time." };

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return { ok: false, error: "Choose a valid start date and time." };
  }

  return { ok: true, iso: parsed.toISOString() };
}
