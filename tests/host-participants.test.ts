import { describe, expect, it } from "vitest";
import { isActiveRoomParticipant } from "../src/lib/host-participants";

const now = Date.parse("2026-08-02T18:00:00.000Z");

describe("host console active participant counts", () => {
  it("requires a real recent check-in", () => {
    expect(isActiveRoomParticipant({ status: "waiting", last_seen_at: null }, now)).toBe(false);
    expect(isActiveRoomParticipant({ status: "admitted", last_seen_at: "2026-08-02T17:59:30.000Z" }, now)).toBe(true);
    expect(isActiveRoomParticipant({ status: "active", last_seen_at: "2026-08-02T17:59:15.000Z" }, now)).toBe(false);
    expect(isActiveRoomParticipant({ status: "active", last_seen_at: "not-a-date" }, now)).toBe(false);
  });

  it("never counts guests who left or were removed", () => {
    const recent = "2026-08-02T17:59:59.000Z";
    expect(isActiveRoomParticipant({ status: "left", last_seen_at: recent }, now)).toBe(false);
    expect(isActiveRoomParticipant({ status: "removed", last_seen_at: recent }, now)).toBe(false);
  });

  it("does not guess before the console clock starts", () => {
    expect(isActiveRoomParticipant({ status: "active", last_seen_at: "2026-08-02T17:59:59.000Z" }, null)).toBe(false);
  });
});
