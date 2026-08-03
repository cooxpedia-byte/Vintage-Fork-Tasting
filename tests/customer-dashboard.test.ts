import { describe, expect, it } from "vitest";
import { formatCustomerEventDate, formatCustomerEventDateTime, parseCustomerDashboardSection, shouldShowJournalEvent, shouldShowUpcomingEvent, summarizeCustomerResponses } from "../src/lib/customer-dashboard";

describe("customer dashboard event timezone", () => {
  it("formats event times in their configured timezone", () => {
    const startsAt = "2026-08-02T18:00:00.000Z";

    expect(formatCustomerEventDateTime(startsAt, "America/Edmonton")).toContain("12:00 p.m.");
    expect(formatCustomerEventDateTime(startsAt, "UTC")).toContain("6:00 p.m.");
  });

  it("keeps date-only history on the event's calendar day", () => {
    expect(formatCustomerEventDate("2026-08-02T02:00:00.000Z", "America/Edmonton")).toBe("August 1, 2026");
  });

  it("uses the launch timezone when legacy data has no valid timezone", () => {
    const startsAt = "2026-08-02T18:00:00.000Z";

    expect(formatCustomerEventDateTime(startsAt, null)).toBe(formatCustomerEventDateTime(startsAt, "America/Edmonton"));
    expect(formatCustomerEventDateTime(startsAt, "not/a-timezone")).toBe(formatCustomerEventDateTime(startsAt, "America/Edmonton"));
  });
});

describe("customer dashboard upcoming events", () => {
  it("shows active participant records for scheduled and live events", () => {
    expect(shouldShowUpcomingEvent("waiting", "scheduled")).toBe(true);
    expect(shouldShowUpcomingEvent("active", "live")).toBe(true);
  });

  it("hides left and removed participant records", () => {
    expect(shouldShowUpcomingEvent("left", "scheduled")).toBe(false);
    expect(shouldShowUpcomingEvent("removed", "live")).toBe(false);
  });

  it("does not treat draft, completed, or cancelled events as upcoming", () => {
    expect(shouldShowUpcomingEvent("waiting", "draft")).toBe(false);
    expect(shouldShowUpcomingEvent("active", "completed")).toBe(false);
    expect(shouldShowUpcomingEvent("waiting", "cancelled")).toBe(false);
  });
});

describe("customer dashboard section URLs", () => {
  it("accepts every dashboard section", () => {
    expect(parseCustomerDashboardSection("home")).toBe("home");
    expect(parseCustomerDashboardSection("journal")).toBe("journal");
    expect(parseCustomerDashboardSection("passport")).toBe("passport");
    expect(parseCustomerDashboardSection("saved")).toBe("saved");
  });

  it("falls back to home for missing or invalid sections", () => {
    expect(parseCustomerDashboardSection(undefined)).toBe("home");
    expect(parseCustomerDashboardSection("unknown")).toBe("home");
  });
});

describe("customer dashboard shipped collections", () => {
  const responses = [
    { id: "complete-saved", completed_at: "2026-08-02T18:00:00.000Z", saved: true, rating: 5 },
    { id: "complete-unsaved", completed_at: "2026-08-02T18:05:00.000Z", saved: false, rating: 3 },
    { id: "draft-saved", completed_at: null, saved: true, rating: null }
  ];

  it("keeps Journal history restricted to completed events", () => {
    expect(shouldShowJournalEvent("completed")).toBe(true);
    expect(shouldShowJournalEvent("draft")).toBe(false);
    expect(shouldShowJournalEvent("scheduled")).toBe(false);
    expect(shouldShowJournalEvent("live")).toBe(false);
    expect(shouldShowJournalEvent("cancelled")).toBe(false);
  });

  it("derives Passport only from completed responses", () => {
    expect(summarizeCustomerResponses(responses).completed.map(response => response.id)).toEqual([
      "complete-saved",
      "complete-unsaved"
    ]);
  });

  it("keeps Saved Teas independent from completion", () => {
    expect(summarizeCustomerResponses(responses).saved.map(response => response.id)).toEqual([
      "complete-saved",
      "draft-saved"
    ]);
  });

  it("calculates the average only from completed rated teas", () => {
    expect(summarizeCustomerResponses(responses).average).toBe(4);
  });
});
