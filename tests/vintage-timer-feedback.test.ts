import { describe, expect, it } from "vitest";

import {
  VINTAGE_TIMER_AUDIO_EVENTS,
  VINTAGE_TIMER_COMPLETION_CHIME,
  VINTAGE_TIMER_HAPTIC_EVENTS,
  vintageTimerDetentPlan,
  vintageTimerPitchRate,
  vintageTimerVibrationPattern
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
      "timerCompleteSecondary",
      "timerCompleteChime"
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

  it("keeps every detent at one exact pitch for an even mechanical groove", () => {
    const rates = Array.from({ length: 18 }, (_, sequence) => vintageTimerPitchRate(sequence));
    expect(new Set(rates)).toEqual(new Set([1]));
  });

  it("keeps one non-overlapping wheel cadence at every scroll velocity", () => {
    expect(vintageTimerDetentPlan(4, 48)).toEqual({ count: 4, spacingMs: 64 });
    expect(vintageTimerDetentPlan(2, 90)).toEqual({ count: 2, spacingMs: 90 });
    const fast = vintageTimerDetentPlan(60, 12);
    expect(fast).toEqual({ count: 60, spacingMs: 64 });
  });

  it("uses one strong short web nudge for every wheel detent", () => {
    expect(vintageTimerVibrationPattern("selectionDetent")).toBe(16);
  });

  it("finishes with two sharp, resounding bell phrases after the mechanical cue", () => {
    expect(VINTAGE_TIMER_COMPLETION_CHIME.phrases.map(phrase =>
      phrase.map(bell => bell.note)
    )).toEqual([
      ["A5", "C6", "E6"],
      ["C6", "G6", "E6"]
    ]);
    expect(VINTAGE_TIMER_COMPLETION_CHIME.phrases.map(phrase =>
      phrase.map(bell => bell.frequencyHz)
    )).toEqual([
      [880, 1046.502, 1318.51],
      [1046.502, 1567.982, 1318.51]
    ]);
    expect(VINTAGE_TIMER_COMPLETION_CHIME.delayMs).toBe(1180);
    expect(VINTAGE_TIMER_COMPLETION_CHIME.durationMs).toBe(2400);
    expect(VINTAGE_TIMER_COMPLETION_CHIME.attackMs).toBe(4);
    expect(VINTAGE_TIMER_COMPLETION_CHIME.strikeIntervalMs).toBe(1);
    expect(VINTAGE_TIMER_COMPLETION_CHIME.phraseGapMs).toBe(720);
    expect(VINTAGE_TIMER_COMPLETION_CHIME.phraseGapMs)
      .toBeGreaterThan(VINTAGE_TIMER_COMPLETION_CHIME.strikeIntervalMs);
  });
});
