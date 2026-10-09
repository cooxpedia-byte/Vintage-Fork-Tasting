/** Calendar periods for the staff sales total, in the store's local time zone. */
export const SALES_PERIODS = [
  { value: "day", label: "Day" },
  { value: "yesterday", label: "Yesterday" },
  { value: "week_to_date", label: "Week to date" },
  { value: "month_to_date", label: "Month to date" },
  { value: "last_week", label: "Last week" },
  { value: "last_month", label: "Last month" },
  { value: "year_to_date", label: "Year to date" },
  { value: "last_year", label: "Last year" },
] as const;

export type SalesPeriod = (typeof SALES_PERIODS)[number]["value"];
export type SalesPeriodRange = { start: string; end: string };
export const DEFAULT_SALES_PERIOD: SalesPeriod = "month_to_date";

export function parseSalesPeriod(value: unknown): SalesPeriod {
  return typeof value === "string" && SALES_PERIODS.some(period => period.value === value)
    ? value as SalesPeriod
    : DEFAULT_SALES_PERIOD;
}

const localFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Edmonton",
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

type CalendarDate = { year: number; month: number; day: number };

function localParts(value: Date): CalendarDate & { hour: number; minute: number; second: number } {
  const parts = Object.fromEntries(localFormatter.formatToParts(value).map(part => [part.type, Number(part.value)]));
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

function calendarDate(value: Date): CalendarDate {
  const { year, month, day } = localParts(value);
  return { year, month, day };
}

function dateWithDayOffset(date: CalendarDate, days: number): CalendarDate {
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
}

/** Convert an Edmonton calendar midnight to UTC, including daylight saving changes. */
function localMidnight(date: CalendarDate): string {
  const wallClock = Date.UTC(date.year, date.month - 1, date.day);
  let instant = wallClock;
  for (let attempt = 0; attempt < 3; attempt++) {
    const local = localParts(new Date(instant));
    const observedWallClock = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second);
    instant += wallClock - observedWallClock;
  }
  const actual = localParts(new Date(instant));
  if (actual.year !== date.year || actual.month !== date.month || actual.day !== date.day || actual.hour !== 0 || actual.minute !== 0 || actual.second !== 0) {
    throw new Error("Unable to determine the store's calendar boundary.");
  }
  return new Date(instant).toISOString();
}

/** Half-open [start, end) interval for a selected local calendar period. */
export function salesPeriodRange(period: SalesPeriod, now = new Date()): SalesPeriodRange {
  if (!Number.isFinite(now.getTime())) throw new Error("Invalid current time.");
  const today = calendarDate(now);
  const mondayOffset = (new Date(Date.UTC(today.year, today.month - 1, today.day)).getUTCDay() + 6) % 7;
  const thisMonday = dateWithDayOffset(today, -mondayOffset);
  const thisMonth = { year: today.year, month: today.month, day: 1 };
  const thisYear = { year: today.year, month: 1, day: 1 };

  switch (period) {
    case "day": return { start: localMidnight(today), end: now.toISOString() };
    case "yesterday": return yesterdaySalesRange(now);
    case "week_to_date": return { start: localMidnight(thisMonday), end: now.toISOString() };
    case "month_to_date": return { start: localMidnight(thisMonth), end: now.toISOString() };
    case "last_week": return { start: localMidnight(dateWithDayOffset(thisMonday, -7)), end: localMidnight(thisMonday) };
    case "last_month": return { start: localMidnight({ year: today.month === 1 ? today.year - 1 : today.year, month: today.month === 1 ? 12 : today.month - 1, day: 1 }), end: localMidnight(thisMonth) };
    case "year_to_date": return { start: localMidnight(thisYear), end: now.toISOString() };
    case "last_year": return { start: localMidnight({ year: today.year - 1, month: 1, day: 1 }), end: localMidnight(thisYear) };
  }
}

/** The previous complete Edmonton calendar day, including 23/25-hour DST days. */
export function yesterdaySalesRange(now = new Date()): SalesPeriodRange {
  if (!Number.isFinite(now.getTime())) throw new Error("Invalid current time.");
  const today = calendarDate(now);
  return { start: localMidnight(dateWithDayOffset(today, -1)), end: localMidnight(today) };
}
