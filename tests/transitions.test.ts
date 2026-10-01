import { describe, expect, it } from "vitest";
import { canRunCommand } from "@/lib/transitions";

describe("server phase contract mirrored by the client", () => {
  it("allows the host to open only from the lobby", () => {
    expect(canRunCommand("lobby", "open_session")).toBe(true);
    expect(canRunCommand("welcome", "open_session")).toBe(false);
  });
  it("does not allow reveal from brewing", () => {
    expect(canRunCommand("brewing", "reveal_tea")).toBe(false);
  });
  it("permits recovery and recap from a legacy trivia phase", () => {
    expect(canRunCommand("trivia", "start_recap")).toBe(true);
    expect(canRunCommand("trivia", "return_to_tasting")).toBe(true);
  });
  it("never offers retired trivia commands", () => {
    for (const phase of ["lobby", "welcome", "reveal", "brewing", "tasting", "trivia", "recap", "ended"] as const) {
      expect(canRunCommand(phase, "open_trivia")).toBe(false);
      expect(canRunCommand(phase, "close_trivia")).toBe(false);
    }
  });
  it("treats ended as terminal", () => {
    for (const command of ["open_session","reveal_tea","start_timer","open_tasting","open_trivia","close_trivia","return_to_tasting","next_tea","start_recap","end_session"] as const) {
      expect(canRunCommand("ended", command)).toBe(false);
    }
  });
});
