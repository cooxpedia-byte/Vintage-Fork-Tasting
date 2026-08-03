import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GuestPhaseAnnouncer } from "@/components/guest/GuestPhaseAnnouncer";
import { getGuestPhaseAnnouncement, type GuestPhaseAnnouncementInput } from "@/lib/guest-announcements";

const tasting: GuestPhaseAnnouncementInput = {
  phase: "tasting",
  teaTitle: "Golden Dawn",
  position: 2,
  flightCount: 4,
  betweenTeas: false,
  triviaClosed: false,
  participantRemoved: false
};

describe("guest phase announcements", () => {
  it("describes the current tea and host-driven phase", () => {
    expect(getGuestPhaseAnnouncement({ ...tasting, phase: "lobby" })).toBe("You’re in the tasting room. Waiting for the host to begin.");
    expect(getGuestPhaseAnnouncement({ ...tasting, phase: "welcome" })).toBe("The tasting has started. Welcome to the table.");
    expect(getGuestPhaseAnnouncement({ ...tasting, phase: "reveal" })).toBe("Now revealing tea 2 of 4, Golden Dawn.");
    expect(getGuestPhaseAnnouncement(tasting)).toBe("Tasting is open for tea 2 of 4, Golden Dawn.");
    expect(getGuestPhaseAnnouncement({ ...tasting, phase: "brewing" })).toBe("Brewing has started for tea 2 of 4, Golden Dawn.");
    expect(getGuestPhaseAnnouncement({ ...tasting, phase: "trivia" })).toBe("Trivia is open for tea 2 of 4, Golden Dawn.");
    expect(getGuestPhaseAnnouncement({ ...tasting, phase: "recap" })).toBe("Your tasting recap is ready.");
    expect(getGuestPhaseAnnouncement({ ...tasting, phase: "ended" })).toBe("The tasting has ended. Your recap is ready.");
  });

  it("announces state changes that do not change the database phase", () => {
    expect(getGuestPhaseAnnouncement({ ...tasting, betweenTeas: true })).toBe("This tea is complete. Waiting for the host to reveal the next tea.");
    expect(getGuestPhaseAnnouncement({ ...tasting, phase: "trivia", triviaClosed: true })).toBe("Trivia has closed for tea 2 of 4, Golden Dawn. The answer is now available.");
  });

  it("prioritizes removal over the room phase", () => {
    expect(getGuestPhaseAnnouncement({ ...tasting, participantRemoved: true })).toBe("You’ve been removed from this tasting.");
  });

  it("renders a persistent, polite and atomic live region", () => {
    const html = renderToStaticMarkup(createElement(GuestPhaseAnnouncer, { message: "Brewing has started." }));

    expect(html).toContain('class="sr-only"');
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-atomic="true"');
  });
});
