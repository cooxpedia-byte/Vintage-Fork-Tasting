import { describe, expect, it } from "vitest";
import { DEFAULT_SALES_PERIOD, parseSalesPeriod, salesPeriodRange } from "@/lib/admin/sales-periods";

describe("admin sales periods", () => {
  it("accepts only known, singular period values", () => {
    expect(parseSalesPeriod("last_year")).toBe("last_year");
    expect(parseSalesPeriod(undefined)).toBe(DEFAULT_SALES_PERIOD);
    expect(parseSalesPeriod(["day", "last_year"])).toBe(DEFAULT_SALES_PERIOD);
    expect(parseSalesPeriod("all_time")).toBe(DEFAULT_SALES_PERIOD);
  });

  it("uses Edmonton calendar boundaries for each requested period", () => {
    const now = new Date("2026-10-02T18:30:00.000Z");
    expect(salesPeriodRange("day", now)).toEqual({ start: "2026-10-02T06:00:00.000Z", end: now.toISOString() });
    expect(salesPeriodRange("week_to_date", now)).toEqual({ start: "2026-09-28T06:00:00.000Z", end: now.toISOString() });
    expect(salesPeriodRange("month_to_date", now)).toEqual({ start: "2026-10-01T06:00:00.000Z", end: now.toISOString() });
    expect(salesPeriodRange("last_week", now)).toEqual({ start: "2026-09-21T06:00:00.000Z", end: "2026-09-28T06:00:00.000Z" });
    expect(salesPeriodRange("last_month", now)).toEqual({ start: "2026-09-01T06:00:00.000Z", end: "2026-10-01T06:00:00.000Z" });
    expect(salesPeriodRange("year_to_date", now)).toEqual({ start: "2026-01-01T07:00:00.000Z", end: now.toISOString() });
    expect(salesPeriodRange("last_year", now)).toEqual({ start: "2025-01-01T07:00:00.000Z", end: "2026-01-01T07:00:00.000Z" });
  });

  it("handles week, month, and year rollovers", () => {
    const now = new Date("2027-01-02T18:00:00.000Z");
    expect(salesPeriodRange("week_to_date", now).start).toBe("2026-12-28T07:00:00.000Z");
    expect(salesPeriodRange("last_month", now)).toEqual({ start: "2026-12-01T07:00:00.000Z", end: "2027-01-01T07:00:00.000Z" });
    expect(salesPeriodRange("last_year", now)).toEqual({ start: "2026-01-01T07:00:00.000Z", end: "2027-01-01T07:00:00.000Z" });
  });

  it("preserves 23-hour and 25-hour local days at daylight saving transitions", () => {
    const spring = salesPeriodRange("last_week", new Date("2026-03-09T18:00:00.000Z"));
    expect(spring).toEqual({ start: "2026-03-02T07:00:00.000Z", end: "2026-03-09T06:00:00.000Z" });
    expect((Date.parse(spring.end) - Date.parse(spring.start)) / 3600000).toBe(167);
    const fall = salesPeriodRange("last_week", new Date("2026-11-02T18:00:00.000Z"));
    expect(fall).toEqual({ start: "2026-10-26T06:00:00.000Z", end: "2026-11-02T07:00:00.000Z" });
    expect((Date.parse(fall.end) - Date.parse(fall.start)) / 3600000).toBe(169);
  });

  it("uses an exclusive end that meets the next period's start", () => {
    const now = new Date("2026-10-05T06:00:00.000Z");
    expect(salesPeriodRange("last_week", now).end).toBe(salesPeriodRange("week_to_date", now).start);
    expect(salesPeriodRange("last_month", now).end).toBe(salesPeriodRange("month_to_date", now).start);
  });
});
