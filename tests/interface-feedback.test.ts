import { describe, expect, it } from "vitest";
import { getInterfaceFeedbackVibrationMs, resolveInterfaceFeedbackEnabled } from "@/lib/interface-feedback";

describe("interface feedback preferences", () => {
  it("keeps the guest flow opt-in while defaulting dashboards on", () => {
    expect(resolveInterfaceFeedbackEnabled(null, false)).toBe(false);
    expect(resolveInterfaceFeedbackEnabled(null, true)).toBe(true);
  });

  it("honors an explicit stored preference across experiences", () => {
    expect(resolveInterfaceFeedbackEnabled("on", false)).toBe(true);
    expect(resolveInterfaceFeedbackEnabled("off", true)).toBe(false);
  });

  it("keeps pulses brief and suppresses them for reduced motion", () => {
    expect(getInterfaceFeedbackVibrationMs("tap", false)).toBe(6);
    expect(getInterfaceFeedbackVibrationMs("selection", false)).toBe(7);
    expect(getInterfaceFeedbackVibrationMs("confirm", false)).toBe(10);
    expect(getInterfaceFeedbackVibrationMs("confirm", true)).toBe(0);
  });
});
