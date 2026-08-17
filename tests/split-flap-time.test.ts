import { describe, expect, it } from "vitest";
import {
  SPLIT_FLAP_MAX_SECONDS,
  formatSplitFlapTime,
  normalizeSplitFlapSeconds,
  splitFlapTimeParts,
} from "../src/components/split-flap/time";

describe("split-flap timer time model", () => {
  it("formats a normal infusion duration", () => {
    expect(splitFlapTimeParts(3723)).toEqual({ hours: 1, minutes: 2, seconds: 3 });
    expect(formatSplitFlapTime(3723)).toBe("01:02:03");
  });

  it("clamps values to the physical six-flap range", () => {
    expect(normalizeSplitFlapSeconds(-10)).toBe(0);
    expect(normalizeSplitFlapSeconds(Number.NaN)).toBe(0);
    expect(normalizeSplitFlapSeconds(SPLIT_FLAP_MAX_SECONDS + 1)).toBe(SPLIT_FLAP_MAX_SECONDS);
    expect(formatSplitFlapTime(SPLIT_FLAP_MAX_SECONDS + 1)).toBe("99:59:59");
  });

  it("uses whole seconds for the mechanical display", () => {
    expect(formatSplitFlapTime(120.95)).toBe("00:02:00");
  });
});
