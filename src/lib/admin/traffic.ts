import type { SupabaseClient } from "@supabase/supabase-js";
import { salesPeriodRange, type SalesPeriodRange } from "./sales-periods";

export const TRAFFIC_PERIODS = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "week_to_date", label: "Week to date" },
  { value: "last_week", label: "Last week" },
  { value: "last_month", label: "Last month" },
] as const;

export type TrafficPeriod = (typeof TRAFFIC_PERIODS)[number]["value"];
export const DEFAULT_TRAFFIC_PERIOD: TrafficPeriod = "today";

export function parseTrafficPeriod(value: unknown): TrafficPeriod {
  return typeof value === "string" && TRAFFIC_PERIODS.some(period => period.value === value)
    ? value as TrafficPeriod
    : DEFAULT_TRAFFIC_PERIOD;
}

export function trafficPeriodRange(period: TrafficPeriod, now = new Date()): SalesPeriodRange {
  return salesPeriodRange(period === "today" ? "day" : period, now);
}

type TrafficContext = {
  period: TrafficPeriod;
  range: SalesPeriodRange;
  message: string;
};

type UnavailableTrafficOverview = TrafficContext & {
  status: "not_connected" | "unavailable";
  visitors: null;
  pageViews: null;
  averagePageViews: null;
  captureStartedAt: string | null;
};

export type TrafficOverview = TrafficContext & {
  status: "complete" | "partial";
  visitors: number;
  pageViews: number;
  averagePageViews: number | null;
  captureStartedAt: string;
} | UnavailableTrafficOverview;

export function unavailableTrafficOverview(period: TrafficPeriod = DEFAULT_TRAFFIC_PERIOD, now = new Date()): UnavailableTrafficOverview {
  return {
    period,
    range: trafficPeriodRange(period, now),
    status: "not_connected",
    visitors: null,
    pageViews: null,
    averagePageViews: null,
    captureStartedAt: null,
    message: "Website traffic data is not connected yet. Visitor and page view totals are unavailable for this period.",
  };
}

const captureDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Edmonton", year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
});

/**
 * Read an admin-only aggregate, never raw visitor identities. The source must
 * count distinct visitors across the whole interval, not add daily uniques.
 * Checkout events and commerce customer counts cannot establish site traffic.
 */
export async function loadTrafficOverview(client: SupabaseClient, period: TrafficPeriod, now = new Date()): Promise<TrafficOverview> {
  const unavailable = unavailableTrafficOverview(period, now);
  try {
    const response = await client.rpc("vf_admin_traffic_summary_v1", {
      p_start: unavailable.range.start, p_end: unavailable.range.end,
    }).abortSignal(AbortSignal.timeout(15000));
    if (response.error?.code === "PGRST202" || response.error?.code === "42883") return unavailable;
    if (response.error || !response.data || typeof response.data !== "object" || Array.isArray(response.data)) {
      throw new Error("Traffic summary is unavailable.");
    }
    const data = response.data as Record<string, unknown>;
    const visitors = data.visitors, pageViews = data.page_views;
    const captureStartedAt = typeof data.capture_started_at === "string" ? data.capture_started_at : "";
    const capturedFrom = Date.parse(captureStartedAt);
    if (typeof visitors !== "number" || !Number.isSafeInteger(visitors) || visitors < 0
      || typeof pageViews !== "number" || !Number.isSafeInteger(pageViews) || pageViews < visitors
      || visitors === 0 && pageViews !== 0
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(captureStartedAt)
      || !Number.isFinite(capturedFrom) || capturedFrom > now.getTime()) {
      throw new Error("Traffic summary is invalid.");
    }
    const began = captureDateFormatter.format(new Date(capturedFrom));
    if (capturedFrom >= Date.parse(unavailable.range.end)) return {
      ...unavailable, status: "unavailable", captureStartedAt,
      message: `Traffic measurement began ${began} Edmonton time. This period is earlier than the available data.`,
    };
    const partial = capturedFrom > Date.parse(unavailable.range.start);
    return {
      period, range: unavailable.range, status: partial ? "partial" : "complete",
      visitors, pageViews, averagePageViews: visitors > 0 ? pageViews / visitors : null, captureStartedAt,
      message: partial
        ? `Partial period: traffic measurement began ${began} Edmonton time. These totals include captured activity since then.`
        : "Traffic totals include captured website visits; unmeasured visits are not included. Average page views is total page views divided by visitors.",
    };
  } catch {
    return { ...unavailable, status: "unavailable", message: "Traffic totals could not be loaded. Please refresh." };
  }
}
