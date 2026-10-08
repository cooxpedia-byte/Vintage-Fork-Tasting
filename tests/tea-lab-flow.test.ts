import { describe, expect, it } from "vitest";
import { createSoloTeaDraft } from "@/lib/tea-lab/offline";
import { canNavigateTeaLabFlowStep, furthestTeaLabFlowStep, inferTeaLabFlowStep, isTeaLabRatingReady, isTeaSelectionReady, navigableTeaLabFlowStep, nextTeaLabRating, parseOptionalNumber, teaLabBrewingValidationError, toggleTeaLabDescriptor } from "@/lib/tea-lab/lab-flow";

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
    expect(inferTeaLabFlowStep({ ...selected, tasting: { ...selected.tasting, firstImpression: "Bright" } })).toBe("brew");
    expect(inferTeaLabFlowStep({ ...selected, brewing: { style: "gongfu" } })).toBe("taste");
    expect(inferTeaLabFlowStep({ ...selected, brewing: { style: "gongfu", waterMl: -1 }, tasting: { ...selected.tasting, rating: 4 } })).toBe("brew");
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

  it("re-locks visited future steps when an earlier required answer is cleared", () => {
    const empty = draft();
    const selected = { ...empty, tea: { kind: "canonical" as const, canonicalTeaId: "tea-1" } };
    const brewed = { ...selected, brewing: { style: "gongfu" as const } };
    const rated = { ...brewed, tasting: { ...brewed.tasting, rating: 4 } };
    expect(navigableTeaLabFlowStep(empty, "review")).toBe("choose");
    expect(navigableTeaLabFlowStep(selected, "review")).toBe("brew");
    expect(navigableTeaLabFlowStep(brewed, "review")).toBe("taste");
    expect(navigableTeaLabFlowStep(rated, "review")).toBe("review");
    expect(navigableTeaLabFlowStep(rated, "brew")).toBe("brew");
  });

  it.each([0, -1, 6, 2.5, Number.NaN])("rejects an invalid rating of %s", rating => {
    expect(isTeaLabRatingReady(rating)).toBe(false);
  });

  it.each([
    [{ leafGrams: 0 }, "leaf weight"],
    [{ leafGrams: -2 }, "leaf weight"],
    [{ leafGrams: 1001 }, "leaf weight"],
    [{ waterMl: 0 }, "whole water amount"],
    [{ waterMl: 150.5 }, "whole water amount"],
    [{ waterMl: 10001 }, "whole water amount"],
    [{ waterTemperatureC: 101 }, "water temperature"],
    [{ initialSteepSeconds: 216001 }, "initial steep"],
    [{ stages: [{ label: "Infusion 1", durationSeconds: 216001 }] }, "stage 1"],
    [{ stages: [{ label: " ", durationSeconds: 10 }] }, "stage 1"],
    [{ stages: [{ label: "Infusion 1", temperatureC: -1 }] }, "stage 1"]
  ])("keeps an invalid brewing record from progressing: %j", (brewing, message) => {
    expect(teaLabBrewingValidationError(brewing)).toContain(message);
  });

  it("accepts optional brewing blanks and every server-supported boundary", () => {
    expect(teaLabBrewingValidationError({})).toBeNull();
    expect(teaLabBrewingValidationError({
      style: "cold_brew", leafGrams: 1000, waterMl: 10000, waterTemperatureC: 0,
      initialSteepSeconds: 216000, stages: [{ label: "Cold steep", durationSeconds: 216000, temperatureC: 100 }]
    })).toBeNull();
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
