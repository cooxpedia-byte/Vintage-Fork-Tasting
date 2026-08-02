import { describe, expect, it } from "vitest";
import { getHostRecoveryView, isHostConsoleCurrent } from "../src/lib/host-recovery";

describe("host console recovery state", () => {
  it("unlocks commands only after both the connection and snapshot are current", () => {
    expect(isHostConsoleCurrent("online", "current")).toBe(true);
    expect(isHostConsoleCurrent("online", "catching_up")).toBe(false);
    expect(isHostConsoleCurrent("reconnecting", "current")).toBe(false);
    expect(isHostConsoleCurrent("offline", "stale")).toBe(false);
  });

  it("gives the host distinct catching-up, reconnecting, and offline messages", () => {
    expect(getHostRecoveryView("online", "catching_up")).toMatchObject({ label: "Catching up", tone: "warning" });
    expect(getHostRecoveryView("reconnecting", "stale")).toMatchObject({ label: "Reconnecting", tone: "warning" });
    expect(getHostRecoveryView("offline", "stale")).toMatchObject({ label: "Offline", tone: "error" });
  });
});
