import type { SupabaseClient } from "@supabase/supabase-js";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AdminTrafficOverview } from "@/components/admin/AdminTrafficOverview";
import { loadTrafficOverview, parseTrafficPeriod, trafficPeriodRange, unavailableTrafficOverview } from "@/lib/admin/traffic";

const now = new Date("2026-10-09T18:30:00.000Z");
const source = { visitors: 4, page_views: 11, capture_started_at: "2026-09-01T06:00:00.000Z" };

function client(data: unknown = source, error: { code: string } | null = null) {
  const rpc = vi.fn().mockReturnValue({ abortSignal: vi.fn().mockResolvedValue({ data, error }) });
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

describe("admin traffic reporting", () => {
  it("accepts only the five requested singular periods", () => {
    for (const period of ["today", "yesterday", "week_to_date", "last_week", "last_month"]) expect(parseTrafficPeriod(period)).toBe(period);
    for (const value of [undefined, "month_to_date", ["today", "yesterday"], "all_time"]) expect(parseTrafficPeriod(value)).toBe("today");
  });

  it("uses Edmonton midnight and Monday week boundaries", () => {
    expect(trafficPeriodRange("today", now)).toEqual({ start: "2026-10-09T06:00:00.000Z", end: now.toISOString() });
    expect(trafficPeriodRange("yesterday", now)).toEqual({ start: "2026-10-08T06:00:00.000Z", end: "2026-10-09T06:00:00.000Z" });
    expect(trafficPeriodRange("week_to_date", now)).toEqual({ start: "2026-10-05T06:00:00.000Z", end: now.toISOString() });
    expect(trafficPeriodRange("last_week", now)).toEqual({ start: "2026-09-28T06:00:00.000Z", end: "2026-10-05T06:00:00.000Z" });
    expect(trafficPeriodRange("last_month", now)).toEqual({ start: "2026-09-01T06:00:00.000Z", end: "2026-10-01T06:00:00.000Z" });
  });

  it("requests an authorized whole-period aggregate and derives average views", async () => {
    const database = client();
    const report = await loadTrafficOverview(database.client, "yesterday", now);
    expect(database.rpc).toHaveBeenCalledWith("vf_admin_traffic_summary_v1", {
      p_start: "2026-10-08T06:00:00.000Z", p_end: "2026-10-09T06:00:00.000Z",
    });
    expect(report).toMatchObject({ status: "complete", visitors: 4, pageViews: 11, averagePageViews: 2.75 });
  });

  it("distinguishes an unconnected source from real zero traffic", async () => {
    for (const code of ["PGRST202", "42883"]) {
      const missing = await loadTrafficOverview(client(null, { code }).client, "today", now);
      expect(missing).toMatchObject({ status: "not_connected", visitors: null, pageViews: null, averagePageViews: null });
    }
    const empty = await loadTrafficOverview(client({ ...source, visitors: 0, page_views: 0 }).client, "today", now);
    expect(empty).toMatchObject({ status: "complete", visitors: 0, pageViews: 0, averagePageViews: null });
  });

  it.each([{ visitors: 0, page_views: 0 }, { visitors: 4, page_views: 11 }])
  ("hides raw totals while measurement has a disabled/null capture start %#", async totals => {
    const report = await loadTrafficOverview(client({ ...source, ...totals, capture_started_at: null,
      limited_events: 0, capture_limited: false }).client, "today", now);
    expect(report).toMatchObject({ status: "unavailable", visitors: null, pageViews: null,
      averagePageViews: null, captureStartedAt: null });
    expect(report.message).toContain("Traffic measurement is not active");
  });

  it("does not show historical zeroes before capture started", async () => {
    const report = await loadTrafficOverview(client({ ...source, visitors: 0, page_views: 0, capture_started_at: "2026-10-09T12:00:00.000Z" }).client, "last_month", now);
    expect(report).toMatchObject({ status: "unavailable", visitors: null, pageViews: null });
    expect(report.message).toContain("This period is earlier than the available data");
  });

  it("labels incomplete periods with when measurement began", async () => {
    const report = await loadTrafficOverview(client({ ...source, capture_started_at: "2026-10-09T12:00:00.000Z" }).client, "week_to_date", now);
    expect(report).toMatchObject({ status: "partial", visitors: 4, pageViews: 11, averagePageViews: 2.75 });
    expect(report.message).toContain("Partial period");
    expect(report.message).toContain("Oct 9, 2026");
  });

  it.each([
    { limited_events: 571 },
    { capture_limited: true, limited_events: 0 },
  ])("marks limited or interrupted capture as incomplete without exposing dropped counts %#", async coverage => {
    const report = await loadTrafficOverview(client({ ...source, ...coverage }).client, "today", now);
    expect(report).toMatchObject({ status: "partial", captureLimited: true,
      visitors: 4, pageViews: 11, averagePageViews: 2.75 });
    expect(report.message).toContain("Incomplete capture");
    expect(JSON.stringify(report)).not.toContain("571");
    expect(report).not.toHaveProperty("limited_events");
  });

  it("preserves both the start-of-capture and coverage warnings", async () => {
    const report = await loadTrafficOverview(client({ ...source, capture_started_at: "2026-10-09T12:00:00.000Z",
      capture_limited: true }).client, "today", now);
    expect(report.status).toBe("partial");
    expect(report.message).toContain("Partial period");
    expect(report.message).toContain("Incomplete capture");
  });

  it("keeps periods before capture unavailable even when capture limits are present", async () => {
    const report = await loadTrafficOverview(client({ ...source, capture_started_at: "2026-10-09T12:00:00.000Z",
      limited_events: 1, capture_limited: true }).client, "last_month", now);
    expect(report).toMatchObject({ status: "unavailable", visitors: null, pageViews: null });
    expect(report.message).toContain("This period is earlier than the available data");
  });

  it("accepts an unlimited source with optional coverage fields omitted or clear", async () => {
    for (const coverage of [{}, { limited_events: 0, capture_limited: false }]) {
      const report = await loadTrafficOverview(client({ ...source, ...coverage }).client, "today", now);
      expect(report).toMatchObject({ status: "complete", captureLimited: false, visitors: 4, pageViews: 11 });
    }
  });

  it("never forwards raw browser identities or provider fields into the dashboard result", async () => {
    const report = await loadTrafficOverview(client({ ...source, visitor_ids: ["private-canary"],
      ip: "private-canary", referrer: "private-canary", page_urls: ["private-canary"],
      user_agent: "private-canary", retention_days: 63 }).client, "today", now);
    expect(report.status).toBe("complete");
    expect(JSON.stringify(report)).not.toContain("private-canary");
    expect(report).not.toHaveProperty("retention_days");
  });

  it.each([
    { ...source, visitors: -1 }, { ...source, visitors: 1.5 }, { ...source, visitors: "4" },
    { ...source, visitors: Number.MAX_SAFE_INTEGER + 1 }, { ...source, page_views: 3 },
    { ...source, visitors: 0 }, { ...source, capture_started_at: "invalid" },
    { ...source, capture_started_at: "2026-11-01T00:00:00.000Z" }, null, [source],
    { ...source, limited_events: -1 }, { ...source, limited_events: 1.5 },
    { ...source, limited_events: "1" }, { ...source, limited_events: null },
    { ...source, limited_events: Number.MAX_SAFE_INTEGER + 1 },
    { ...source, capture_limited: "true" }, { ...source, capture_limited: null },
  ])("hides invalid or inconsistent source totals %#", async data => {
    const report = await loadTrafficOverview(client(data).client, "today", now);
    expect(report).toMatchObject({ status: "unavailable", visitors: null, pageViews: null, averagePageViews: null });
  });

  it("does not display totals on a permission or transport failure", async () => {
    const denied = await loadTrafficOverview(client(null, { code: "42501" }).client, "today", now);
    expect(denied.status).toBe("unavailable");
    expect(denied.message).toContain("could not be loaded");
    const disconnected = { rpc: vi.fn().mockReturnValue({ abortSignal: vi.fn().mockRejectedValue(new Error("private-provider-detail")) }) };
    const failed = await loadTrafficOverview(disconnected as unknown as SupabaseClient, "today", now);
    expect(failed).toMatchObject({ status: "unavailable", visitors: null, pageViews: null });
    expect(JSON.stringify(failed)).not.toContain("private-provider-detail");
  });
});

describe("admin traffic section", () => {
  it("offers the requested periods, preserves sales, and shows unavailable rather than zero", () => {
    const traffic = unavailableTrafficOverview("last_week", now);
    const output = renderToStaticMarkup(createElement(AdminTrafficOverview, { traffic, salesPeriod: "yesterday" }));
    expect(output).toContain('aria-labelledby="admin-traffic-heading"');
    expect(output).toContain('type="hidden" name="salesPeriod" value="yesterday"');
    expect(output).toContain('name="trafficPeriod"');
    expect(output).toContain('value="last_week" selected=""');
    for (const label of ["Today", "Yesterday", "Week to date", "Last week", "Last month"]) expect(output).toContain(`>${label}</option>`);
    for (const label of ["Visitors", "Total page views", "Average page views"]) expect(output).toContain(`<span>${label}</span><strong aria-label="Unavailable">—</strong>`);
    expect(output).toContain("Website traffic data is not connected yet");
  });

  it("renders real counts and partial-period notices", async () => {
    const traffic = await loadTrafficOverview(client({ ...source, capture_started_at: "2026-10-09T12:00:00.000Z" }).client, "today", now);
    const output = renderToStaticMarkup(createElement(AdminTrafficOverview, { traffic, salesPeriod: "month_to_date" }));
    expect(output).toContain("Visitors</span><strong>4</strong>");
    expect(output).toContain("Total page views</span><strong>11</strong>");
    expect(output).toContain("Average page views</span><strong>2.75</strong>");
    expect(output).toContain("Today · Partial period");
    expect(output).toContain("Distinct consenting browsers");
    expect(output).toContain("Recorded public page views on vintagefork.ca");
    expect(output).toContain("Private pages and mobile app visits are excluded");
  });

  it("shows accepted counts with incomplete coverage rather than an exact dropped count", async () => {
    const traffic = await loadTrafficOverview(client({ ...source, limited_events: 571 }).client, "today", now);
    const output = renderToStaticMarkup(createElement(AdminTrafficOverview, { traffic, salesPeriod: "month_to_date" }));
    expect(output).toContain("Visitors</span><strong>4</strong>");
    expect(output).toContain("Total page views</span><strong>11</strong>");
    expect(output.match(/Today · Incomplete capture/g)).toHaveLength(3);
    expect(output).toContain("measurement gaps or capture limits");
    expect(output).not.toContain("571");
  });

  it("shows unavailable metrics for inactive measurement and periods before capture", async () => {
    for (const [period, capture_started_at] of [["today", null], ["last_month", "2026-10-09T12:00:00.000Z"]] as const) {
      const traffic = await loadTrafficOverview(client({ ...source, capture_started_at }).client, period, now);
      const output = renderToStaticMarkup(createElement(AdminTrafficOverview, { traffic, salesPeriod: "yesterday" }));
      expect(output.match(/aria-label="Unavailable">—/g)).toHaveLength(3);
      expect(output).not.toContain("Visitors</span><strong>4</strong>");
      expect(output).toContain(period === "today" ? "Traffic measurement is not active" : "This period is earlier than the available data");
    }
  });
});
