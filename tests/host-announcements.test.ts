import { describe, expect, it } from "vitest";
import { getHostPhaseAnnouncement, getHostPrimaryAnnouncement } from "../src/lib/host-announcements";

describe("host console announcements", () => {
  it("announces phase changes with the current tea", () => {
    expect(getHostPhaseAnnouncement("brewing", "Dong Ding")).toBe("The room is now brewing Dong Ding.");
    expect(getHostPhaseAnnouncement("trivia", "Ruby 18")).toBe("The room is now in trivia for Ruby 18.");
    expect(getHostPhaseAnnouncement("ended", null)).toBe("The tasting has ended.");
  });

  it("announces the next action and command lock states", () => {
    expect(getHostPrimaryAnnouncement({ consoleCurrent: true, holder: true, phase: "welcome", label: "Reveal Dong Ding now", disabled: false })).toBe("Next action: Reveal Dong Ding now.");
    expect(getHostPrimaryAnnouncement({ consoleCurrent: true, holder: true, phase: "reveal", label: "Reveal in progress", disabled: true })).toBe("Next action unavailable: Reveal in progress.");
    expect(getHostPrimaryAnnouncement({ consoleCurrent: false, holder: true, phase: "brewing", label: "Open the tasting", disabled: false })).toBe("Host controls are paused while the console reconnects.");
    expect(getHostPrimaryAnnouncement({ consoleCurrent: true, holder: false, phase: "brewing", label: "Open the tasting", disabled: false })).toBe("Host controls are unavailable. You are watching this tasting.");
  });
});
