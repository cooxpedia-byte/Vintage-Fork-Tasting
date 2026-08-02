import { describe, expect, it } from "vitest";
import { parseEventStartTime } from "@/lib/event-start-time";

describe("parseEventStartTime", () => {
  it.each(["", "   ", "not-a-date"])("rejects an invalid start value: %j", value => {
    expect(parseEventStartTime(value)).toEqual({
      ok: false,
      error: "Choose a valid start date and time."
    });
  });

  it("converts a valid datetime-local value to ISO", () => {
    const value = "2026-08-31T10:00";
    expect(parseEventStartTime(value)).toEqual({
      ok: true,
      iso: new Date(value).toISOString()
    });
  });
});
