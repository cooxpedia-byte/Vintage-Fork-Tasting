import { describe, expect, it } from "vitest";
import {
  adjustTeaLabDuration,
  collapseUneditedDefaultInfusions,
  createDefaultTeaLabBrewStages,
  durationInputToSeconds,
  durationSecondsToInput,
  formatTeaLabDuration,
  getTeaLabBrewingStyle,
  nextTeaLabBrewStageLabel,
  splitTeaLabDuration,
  TEA_LAB_MAX_DURATION_SECONDS,
  TEA_LAB_BREWING_STYLES
} from "@/lib/tea-lab/brewing";
import { TEA_LAB_BREWING_STYLE_IDS } from "@/lib/tea-lab/offline";

describe("Tea Lab brewing flows", () => {
  it("ships one complete, editable definition for every supported style", () => {
    expect(TEA_LAB_BREWING_STYLES).toHaveLength(TEA_LAB_BREWING_STYLE_IDS.length);
    expect(new Set(TEA_LAB_BREWING_STYLES.map(style => style.id))).toEqual(new Set(TEA_LAB_BREWING_STYLE_IDS));
    for (const style of TEA_LAB_BREWING_STYLES) {
      expect(style.summary.length).toBeGreaterThan(20);
      expect(style.setupGuidance.length).toBeGreaterThanOrEqual(2);
      expect(style.stages.length).toBeGreaterThan(0);
      expect(style.stages.length).toBeLessThanOrEqual(20);
      expect(style.stages.every(stage => stage.label && stage.notePrompt)).toBe(true);
    }
  });

  it("gives Gongfu separate rinse and infusion notes and numbers added infusions correctly", () => {
    const stages = createDefaultTeaLabBrewStages("gongfu");

    expect(stages.map(stage => stage.label)).toEqual(["Rinse (optional)", "Infusion 1"]);
    expect(nextTeaLabBrewStageLabel("gongfu", stages)).toBe("Infusion 2");
    expect(nextTeaLabBrewStageLabel("matcha_usucha", createDefaultTeaLabBrewStages("matcha_usucha"))).toBe("Infusion 1");
  });

  it("starts numbered infusion methods with one infusion and preserves distinct preparation stages", () => {
    for (const style of ["gongfu", "chaozhou_gongfu", "sencha_kyusu", "gyokuro"] as const) {
      expect(createDefaultTeaLabBrewStages(style).filter(stage => /^Infusion \d+$/.test(stage.label)).map(stage => stage.label))
        .toEqual(["Infusion 1"]);
    }

    expect(createDefaultTeaLabBrewStages("matcha_usucha").map(stage => stage.label)).toEqual(["Sift and add water", "Whisk"]);
    expect(createDefaultTeaLabBrewStages("masala_chai").map(stage => stage.label)).toEqual(["Spice decoction", "Tea simmer", "Milk and sweetener finish"]);
  });

  it("compacts old untouched defaults without removing user-edited infusions", () => {
    const oldDefaults = [
      { label: "Infusion 1", durationSeconds: 10, temperatureC: null, notes: null },
      { label: "Infusion 2", durationSeconds: 15, temperatureC: null, notes: null },
      { label: "Infusion 3", durationSeconds: 20, temperatureC: null, notes: null }
    ];
    expect(collapseUneditedDefaultInfusions("gongfu", oldDefaults).map(stage => stage.label)).toEqual(["Infusion 1"]);
    expect(collapseUneditedDefaultInfusions("gongfu", [
      ...oldDefaults.slice(0, 2),
      { ...oldDefaults[2], notes: "Still floral" }
    ]).map(stage => stage.label)).toEqual(["Infusion 1", "Infusion 3"]);
  });

  it("keeps display-unit conversion lossless at persisted second precision", () => {
    expect(durationSecondsToInput(14400, "hours")).toBe(4);
    expect(durationInputToSeconds("1.5", "hours")).toBe(5400);
    expect(durationInputToSeconds("2.5", "minutes")).toBe(150);
    expect(durationInputToSeconds("", "seconds")).toBeNull();
    expect(getTeaLabBrewingStyle("cold_brew")?.durationUnit).toBe("hours");
  });

  it("formats persisted durations in readable mixed units", () => {
    expect(formatTeaLabDuration(20)).toBe("20 sec");
    expect(formatTeaLabDuration(2880)).toBe("48 min");
    expect(formatTeaLabDuration(5400)).toBe("1 hr 30 min");
    expect(formatTeaLabDuration(172800)).toBe("48 hr");
    expect(formatTeaLabDuration(null)).toBeNull();
  });

  it("carries duration-wheel seconds and minutes into the next column", () => {
    expect(splitTeaLabDuration(adjustTeaLabDuration(59, "seconds", 1))).toEqual({
      hours: 0,
      minutes: 1,
      seconds: 0
    });
    expect(splitTeaLabDuration(adjustTeaLabDuration(3599, "seconds", 1))).toEqual({
      hours: 1,
      minutes: 0,
      seconds: 0
    });
    expect(splitTeaLabDuration(adjustTeaLabDuration(59 * 60, "minutes", 1))).toEqual({
      hours: 1,
      minutes: 0,
      seconds: 0
    });
    expect(splitTeaLabDuration(adjustTeaLabDuration(60, "seconds", -1))).toEqual({
      hours: 0,
      minutes: 0,
      seconds: 59
    });
  });

  it("caps the duration wheel at 99 hours, 59 minutes and 59 seconds", () => {
    expect(splitTeaLabDuration(TEA_LAB_MAX_DURATION_SECONDS)).toEqual({
      hours: 99,
      minutes: 59,
      seconds: 59
    });
    expect(adjustTeaLabDuration(TEA_LAB_MAX_DURATION_SECONDS, "seconds", 1))
      .toBe(TEA_LAB_MAX_DURATION_SECONDS);
    expect(adjustTeaLabDuration(99 * 3600, "hours", 1)).toBe(99 * 3600);
    expect(adjustTeaLabDuration(99 * 3600 + 59 * 60 + 10, "minutes", 1))
      .toBe(99 * 3600 + 59 * 60 + 10);
    expect(adjustTeaLabDuration(0, "seconds", -1)).toBe(0);
  });
});
