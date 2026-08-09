import { describe, expect, it } from "vitest";
import { guestEventPath, hostEventPath, liveEventsPath, mobileHomeLiveEventsUrl } from "@/lib/live-events-routes";

describe("canonical live-event routes", () => {
  it("exposes the Mobile Home hub and native return route", () => {
    expect(liveEventsPath()).toBe("/live-events");
    expect(mobileHomeLiveEventsUrl()).toBe("vintagefork://live-events");
  });

  it("normalizes invitation codes and keeps guests on the shared room", () => {
    expect(guestEventPath(" mountain-7 ")).toBe("/event/MOUNTAIN-7");
    expect(() => guestEventPath("not/a/code")).toThrow("invalid_invite_code");
  });

  it("keeps Admin launch links on the authoritative host console", () => {
    expect(hostEventPath("event-42")).toBe("/admin/events/event-42/live");
    expect(() => hostEventPath("../../event-42")).toThrow("invalid_event_id");
  });
});
