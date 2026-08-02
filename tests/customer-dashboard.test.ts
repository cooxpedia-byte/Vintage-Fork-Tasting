import { describe, expect, it } from "vitest";
import { parseCustomerDashboardSection, shouldShowUpcomingEvent } from "../src/lib/customer-dashboard";

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
