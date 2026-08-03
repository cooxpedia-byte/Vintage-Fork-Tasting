import { describe, expect, it } from "vitest";
import { getServerFeatureFlags } from "@/lib/feature-flags";

describe("server feature flags", () => {
  it("keeps Tea Lab disabled by default", () => {
    expect(getServerFeatureFlags({}).teaLab).toBe(false);
  });

  it("enables Tea Lab only for the exact approved value", () => {
    expect(getServerFeatureFlags({ TEA_LAB_ENABLED: "true" }).teaLab).toBe(true);
    expect(getServerFeatureFlags({ TEA_LAB_ENABLED: "false" }).teaLab).toBe(false);
    expect(getServerFeatureFlags({ TEA_LAB_ENABLED: "TRUE" }).teaLab).toBe(false);
    expect(getServerFeatureFlags({ TEA_LAB_ENABLED: "1" }).teaLab).toBe(false);
    expect(getServerFeatureFlags({ TEA_LAB_ENABLED: " true " }).teaLab).toBe(false);
  });

  it("returns an immutable flag snapshot", () => {
    expect(Object.isFrozen(getServerFeatureFlags({ TEA_LAB_ENABLED: "true" }))).toBe(true);
  });
});
