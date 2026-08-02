import { describe, expect, it } from "vitest";
import { canAcquireHostControl } from "../src/lib/host-control";

describe("host control event lifecycle", () => {
  it("allows control for scheduled and live events", () => {
    expect(canAcquireHostControl("scheduled", "lobby")).toBe(true);
    expect(canAcquireHostControl("live", "welcome")).toBe(true);
    expect(canAcquireHostControl("live", "recap")).toBe(true);
  });

  it("blocks control for draft, completed, cancelled, and ended events", () => {
    expect(canAcquireHostControl("draft", "lobby")).toBe(false);
    expect(canAcquireHostControl("completed", "ended")).toBe(false);
    expect(canAcquireHostControl("cancelled", "lobby")).toBe(false);
    expect(canAcquireHostControl("live", "ended")).toBe(false);
  });
});
