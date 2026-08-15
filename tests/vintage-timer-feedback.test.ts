import { describe, expect, it } from "vitest";

import {
  VINTAGE_TIMER_AUDIO_EVENTS,
  VINTAGE_TIMER_HAPTIC_EVENTS,
  vintageTimerDetentPlan,
  vintageTimerPitchRate
} from "@/lib/vintage-timer-feedback";

describe("vintage timer feedback contract", () => {
  it("keeps the required shared event vocabulary stable", () => {
    expect(VINTAGE_TIMER_AUDIO_EVENTS).toEqual([
      "wheelDetent",
      "wheelSettle",
      "buttonDown",
      "buttonRelease",
      "startMechanical",
      "startRelay",
      "timerCompletePrimary",
      "timerCompleteSecondary"
    ]);
    expect(VINTAGE_TIMER_HAPTIC_EVENTS).toEqual([
      "selectionDetent",
      "wheelSettle",
      "softPress",
      "mechanicalEngage",
      "startTimer",
      "timerComplete"
    ]);
  });

  it("keeps detent pitch character within plus or minus three percent", () => {
    const rates = Array.from({ length: 18 }, (_, sequence) => vintageTimerPitchRate(sequence));
    expect(new Set(rates).size).toBeGreaterThanOrEqual(4);
    expect(Math.min(...rates)).toBeGreaterThanOrEqual(.97);
    expect(Math.max(...rates)).toBeLessThanOrEqual(1.03);
  });

  it("preserves slow detents and caps very fast overlapping voices", () => {
    expect(vintageTimerDetentPlan(4, 48)).toEqual({ count: 4, spacingMs: 48 });
    const fast = vintageTimerDetentPlan(60, 12);
    expect(fast.count).toBe(7);
    expect(fast.spacingMs).toBeGreaterThanOrEqual(12);
  });
});
