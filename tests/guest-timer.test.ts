import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BrewingTimer } from "@/components/guest/BrewingTimer";
import { formatGuestTimer, getGuestTimerAnnouncement } from "@/lib/guest-timer";

describe("guest brewing timer announcements", () => {
  it("formats the visible countdown", () => {
    expect(formatGuestTimer(61_001)).toBe("1:02");
    expect(formatGuestTimer(5_000)).toBe("0:05");
    expect(formatGuestTimer(-1)).toBe("0:00");
  });

  it("announces only useful final milestones", () => {
    expect(getGuestTimerAnnouncement(10_000)).toBe("Brewing timer: 10 seconds remaining.");
    expect(getGuestTimerAnnouncement(9_000)).toBe("");
    expect(getGuestTimerAnnouncement(5_000)).toBe("Brewing timer: 5 seconds remaining.");
    expect(getGuestTimerAnnouncement(4_000)).toBe("");
    expect(getGuestTimerAnnouncement(0)).toBe("Brewing timer complete.");
  });

  it("keeps the changing clock out of the live region", () => {
    const html = renderToStaticMarkup(createElement(BrewingTimer, { remainingMs: 10_000 }));

    expect(html).toContain('role="timer"');
    expect(html).toContain('aria-live="off"');
    expect(html).toContain('aria-label="Brewing timer, 0:10 remaining"');
    expect(html).toContain('role="status"');
    expect(html).toContain("Brewing timer: 10 seconds remaining.");
  });
});
