import { describe, expect, it } from "vitest";
import { shouldHoldGuestTransition } from "@/lib/guest-notes";

describe("guest notes transition protection", () => {
  it("holds a newer host transition while notes are active", () => {
    expect(shouldHoldGuestTransition({ currentSequence: 4, nextSequence: 5, notesActive: true, alreadyHolding: false })).toBe(true);
  });

  it("does not hold the initial snapshot or an unchanged sequence", () => {
    expect(shouldHoldGuestTransition({ currentSequence: null, nextSequence: 1, notesActive: true, alreadyHolding: false })).toBe(false);
    expect(shouldHoldGuestTransition({ currentSequence: 4, nextSequence: 4, notesActive: true, alreadyHolding: false })).toBe(false);
  });

  it("keeps the transition held until the guest chooses to view it", () => {
    expect(shouldHoldGuestTransition({ currentSequence: 4, nextSequence: 6, notesActive: false, alreadyHolding: true })).toBe(true);
  });
});
