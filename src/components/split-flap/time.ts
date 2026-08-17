export const SPLIT_FLAP_MAX_HOURS = 99;
export const SPLIT_FLAP_MAX_SECONDS = SPLIT_FLAP_MAX_HOURS * 60 * 60 + 59 * 60 + 59;

export type SplitFlapTimeParts = {
  hours: number;
  minutes: number;
  seconds: number;
};

export function normalizeSplitFlapSeconds(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(SPLIT_FLAP_MAX_SECONDS, Math.max(0, Math.floor(value)));
}

export function splitFlapTimeParts(value: number): SplitFlapTimeParts {
  const totalSeconds = normalizeSplitFlapSeconds(value);

  return {
    hours: Math.floor(totalSeconds / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}

export function formatSplitFlapTime(value: number): string {
  const { hours, minutes, seconds } = splitFlapTimeParts(value);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
