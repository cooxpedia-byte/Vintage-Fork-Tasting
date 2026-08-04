import { describe, expect, it } from "vitest";
import { createSoloTeaDraft } from "@/lib/tea-lab/offline";
import { canNavigateTeaLabFlowStep, furthestTeaLabFlowStep, inferTeaLabFlowStep, isTeaSelectionReady, nextTeaLabRating, parseOptionalNumber, toggleTeaLabDescriptor } from "@/lib/tea-lab/lab-flow";

function draft() {
  return createSoloTeaDraft("owner-1", (() => {
    const ids = ["session-1", "card-1"];
    return () => ids.shift()!;
  })(), () => "2026-08-03T12:00:00.000Z");
}

describe("Tea Lab solo flow", () => {
  it("requires a catalogue selection or a named personal tea", () => {
    const empty = draft();
    expect(isTeaSelectionReady(empty)).toBe(false);
    expect(isTeaSelectionReady({ ...empty, tea: { kind: "personal", personalTeaId: "personal-1", name: "" } })).toBe(false);
    expect(isTeaSelectionReady({ ...empty, tea: { kind: "personal", personalTeaId: "personal-1", name: "Moonlight White" } })).toBe(true);
    expect(isTeaSelectionReady({ ...empty, tea: { kind: "canonical", canonicalTeaId: "tea-1" } })).toBe(true);
  });

  it("resumes at the first meaningful incomplete step", () => {
    const empty = draft();
    expect(inferTeaLabFlowStep(empty)).toBe("choose");
    const selected = { ...empty, tea: { kind: "canonical" as const, canonicalTeaId: "tea-1" } };
    expect(inferTeaLabFlowStep(selected)).toBe("brew");
    expect(inferTeaLabFlowStep({ ...selected, tasting: { ...selected.tasting, firstImpression: "Bright" } })).toBe("taste");
  });

  it("limits descriptor toggling to five and permits deselection", () => {
    expect(toggleTeaLabDescriptor(["one", "two", "three", "four", "five"], "six")).toEqual(["one", "two", "three", "four", "five"]);
    expect(toggleTeaLabDescriptor(["one", "two", "three", "four"], "five")).toEqual(["one", "two", "three", "four", "five"]);
    expect(toggleTeaLabDescriptor(["one", "two"], "one")).toEqual(["two"]);
  });

  it("keeps visited tasting steps available while locking unvisited future steps", () => {
    expect(canNavigateTeaLabFlowStep("taste", "choose")).toBe(true);
    expect(canNavigateTeaLabFlowStep("taste", "taste")).toBe(true);
    expect(canNavigateTeaLabFlowStep("taste", "review")).toBe(false);
    expect(furthestTeaLabFlowStep("review", "brew")).toBe("review");
    expect(furthestTeaLabFlowStep("brew", "taste")).toBe("taste");
  });

  it("normalizes optional numeric inputs", () => {
    expect(parseOptionalNumber("")).toBeNull();
    expect(parseOptionalNumber("85")).toBe(85);
    expect(parseOptionalNumber("not-a-number")).toBeNull();
  });

  it("supports the screen-reader radio pattern with arrow, Home, and End keys", () => {
    expect(nextTeaLabRating(3, "ArrowRight")).toBe(4);
    expect(nextTeaLabRating(5, "ArrowRight")).toBe(1);
    expect(nextTeaLabRating(1, "ArrowLeft")).toBe(5);
    expect(nextTeaLabRating(4, "Home")).toBe(1);
    expect(nextTeaLabRating(2, "End")).toBe(5);
    expect(nextTeaLabRating(2, "Enter")).toBeNull();
  });
});
