import { afterEach, describe, expect, it, vi } from "vitest";

import {
  VINTAGE_TIMER_AUDIO_EVENTS,
  VINTAGE_TIMER_COMPLETION_CHIME,
  VINTAGE_TIMER_HAPTIC_EVENTS,
  playVintageTimerHaptic,
  vintageTimerDetentPlan,
  vintageTimerPitchRate,
  vintageTimerVibrationPattern
} from "@/lib/vintage-timer-feedback";

afterEach(() => {
  vi.unstubAllGlobals();
});

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

  it("requests semantic selection haptics through the optional mobile bridge", () => {
    const postMessage = vi.fn();
    const vibrate = vi.fn();
    vi.stubGlobal("window", {
      VintageForkMobile: { postMessage },
      localStorage: { getItem: () => null },
      matchMedia: () => ({ matches: false }),
      setTimeout
    });
    vi.stubGlobal("navigator", { vibrate });

    playVintageTimerHaptic("selectionDetent", { count: 1, intervalMs: 72 });

    expect(postMessage).toHaveBeenCalledWith(JSON.stringify({
      type: "vintageTimerFeedback",
      event: "selectionDetent",
      count: 1,
      intervalMs: 72
    }));
    expect(vibrate).not.toHaveBeenCalled();
  });

  it("falls back safely when the native haptic bridge is unavailable or rejects", () => {
    const vibrate = vi.fn();
    vi.stubGlobal("window", {
      localStorage: { getItem: () => null },
      matchMedia: () => ({ matches: false }),
      setTimeout
    });
    vi.stubGlobal("navigator", { vibrate });
    expect(() => playVintageTimerHaptic("selectionDetent")).not.toThrow();
    expect(vibrate).toHaveBeenCalledWith(16);

    vi.stubGlobal("window", {
      VintageForkMobile: { postMessage: () => { throw new Error("bridge unavailable"); } },
      localStorage: { getItem: () => null },
      matchMedia: () => ({ matches: false }),
      setTimeout
    });
    expect(() => playVintageTimerHaptic("selectionDetent")).not.toThrow();
  });

  it("finishes with simultaneous sharp, resounding C6-E6-G6 bells after the mechanical cue", () => {
    expect(VINTAGE_TIMER_COMPLETION_CHIME).toEqual({
      notes: [
        { name: "C6", frequencyHz: 1046.502, level: .92 },
        { name: "E6", frequencyHz: 1318.51, level: .72 },
        { name: "G6", frequencyHz: 1567.982, level: .8 }
      ],
      delayMs: 1180,
      durationMs: 2600,
      attackMs: 4
    });
  });
});
