import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AgoraOperationTimeoutError,
  describeMediaError,
  withAgoraTimeout
} from "@/lib/agora-session";

const roomSource = readFileSync(resolve(process.cwd(), "src/components/live/AgoraVideoRoom.tsx"), "utf8");

afterEach(() => vi.useRealTimers());

describe("Agora video recovery", () => {
  it("bounds operations that would otherwise leave the room frozen", async () => {
    vi.useFakeTimers();
    const pending = withAgoraTimeout(new Promise<never>(() => undefined), 25, "Camera timed out");
    const expectation = expect(pending).rejects.toEqual(new AgoraOperationTimeoutError("Camera timed out"));

    await vi.advanceTimersByTimeAsync(25);
    await expectation;
  });

  it("turns browser media failures into recovery instructions", () => {
    const blocked = Object.assign(new Error("denied"), { name: "NotAllowedError" });
    const busy = Object.assign(new Error("busy"), { name: "NotReadableError" });

    expect(describeMediaError(blocked, "camera")).toContain("Allow it in the browser settings");
    expect(describeMediaError(busy, "microphone")).toContain("busy in another app");
    expect(describeMediaError(new AgoraOperationTimeoutError("late"), "camera")).toContain("stay in the room");
  });

  it("opens the room before local camera initialization", () => {
    expect(roomSource.indexOf('setStatus("joined")')).toBeLessThan(roomSource.indexOf("void initializeLocalMedia"));
    expect(roomSource).toContain("Connected. Opening camera…");
    expect(roomSource).toContain("Retry camera");
    expect(roomSource).toContain("Retry mic");
  });

  it("lets the host restart only video without changing tasting state", () => {
    expect(roomSource).toContain('presentation === "host"');
    expect(roomSource).toContain("Restart video");
    expect(roomSource).toContain("does not end or reset the tasting");
    expect(roomSource).toContain('await disconnectRoom("joining")');
    expect(roomSource).not.toContain("/command");
    expect(roomSource).not.toContain("phase:");
  });
});
