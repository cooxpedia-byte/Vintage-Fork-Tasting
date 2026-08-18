import { describe, expect, it } from "vitest";
import {
  CONDUCTOR_STAGES,
  conductorElapsedMs,
  conductorPrimaryLabel,
  conductorRemainingMs,
  conductorStageDistance,
  nextConductorStage,
  previousConductorStage,
  resolveConductorStage
} from "@/lib/conductor";

describe("host conductor stage model", () => {
  it("keeps the tasting sequence explicit and ordered", () => {
    expect(CONDUCTOR_STAGES.map(stage => stage.id)).toEqual([
      "arrival", "prepare", "brew", "aroma", "first_sip", "explore",
      "discuss", "reveal", "debrief", "close_tea", "transition"
    ]);
    expect(nextConductorStage("brew")).toBe("aroma");
    expect(previousConductorStage("reveal")).toBe("discuss");
    expect(conductorStageDistance("first_sip", "reveal")).toBe(3);
  });

  it("falls back from legacy phases without making Agora part of stage state", () => {
    expect(resolveConductorStage({ phase:"lobby", conductor_stage:null })).toBe("arrival");
    expect(resolveConductorStage({ phase:"brewing", conductor_stage:null })).toBe("brew");
    expect(resolveConductorStage({ phase:"tasting", conductor_stage:null })).toBe("explore");
    expect(resolveConductorStage({ phase:"tasting", conductor_stage:"discuss" })).toBe("discuss");
    expect(JSON.stringify(CONDUCTOR_STAGES)).not.toContain("agora");
  });

  it("calculates server-authored elapsed and remaining time, including a pause", () => {
    const running={phase:"brewing" as const,conductor_stage:"brew",conductor_stage_started_at:"2026-08-18T00:00:00.000Z",conductor_stage_duration_seconds:180,conductor_paused_at:null,conductor_remaining_seconds:null};
    expect(conductorElapsedMs(running,Date.parse("2026-08-18T00:01:00.000Z"))).toBe(60_000);
    expect(conductorRemainingMs(running,Date.parse("2026-08-18T00:01:00.000Z"))).toBe(120_000);
    expect(conductorRemainingMs({...running,conductor_paused_at:"2026-08-18T00:00:45.000Z",conductor_remaining_seconds:135},Date.parse("2026-08-18T00:02:00.000Z"))).toBe(135_000);
  });

  it("gives the rail one concrete primary action per stage", () => {
    expect(conductorPrimaryLabel("prepare",null,195)).toBe("Start brew · 3:15");
    expect(conductorPrimaryLabel("discuss",null,195)).toBe("Show what emerged");
    expect(conductorPrimaryLabel("transition","Spring Darjeeling",195)).toBe("Prepare Spring Darjeeling");
  });
});
