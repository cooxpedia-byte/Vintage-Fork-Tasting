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
  it("permits recap from the final closed-trivia surface", () => {
    expect(canRunCommand("trivia", "start_recap")).toBe(true);
  });
  it("treats ended as terminal", () => {
    for (const command of ["open_session","reveal_tea","start_timer","open_tasting","open_trivia","close_trivia","return_to_tasting","next_tea","start_recap","end_session"] as const) {
      expect(canRunCommand("ended", command)).toBe(false);
    }
  });
});
