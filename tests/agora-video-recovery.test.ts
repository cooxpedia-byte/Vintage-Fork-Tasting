import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AGORA_ACTIVE_SPEAKER_HOLD_MS,
  AGORA_ACTIVE_SPEAKER_LEVEL,
  AGORA_OPERATION_TIMEOUT_MS,
  agoraErrorCode,
  AgoraOperationTimeoutError,
  describeAgoraConnectionError,
  describeMediaError,
  selectAgoraActiveSpeaker,
  selectAgoraVideoCodec,
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

  it("selects a video codec supported by the host browser", () => {
    expect(selectAgoraVideoCodec(["VP8", "H264"])).toBe("vp8");
    expect(selectAgoraVideoCodec(["H264"])).toBe("h264");
    expect(selectAgoraVideoCodec([])).toBe("vp8");
  });

  it("describes network failures without starting an unconfigured cloud proxy", () => {
    const networkError = Object.assign(new Error("gateway"), { code: "CAN_NOT_GET_GATEWAY_SERVER" });
    expect(agoraErrorCode(networkError)).toBe("CAN_NOT_GET_GATEWAY_SERVER");
    expect(describeAgoraConnectionError(networkError)).toContain("could not reach Agora");
    expect(describeAgoraConnectionError(new AgoraOperationTimeoutError("late"))).toContain("reconnect video");
  });

  it("allows Agora's built-in Safari and TLS recovery to finish", () => {
    expect(AGORA_OPERATION_TIMEOUT_MS.join).toBe(45_000);
  });

  it("promotes only a loud participant whose camera is visible", () => {
    const levels = [
      { id: "local", level: AGORA_ACTIVE_SPEAKER_LEVEL + 2 },
      { id: "guest-one", level: 82 },
      { id: "guest-camera-off", level: 99 }
    ];
    expect(selectAgoraActiveSpeaker(levels, new Set(["local", "guest-one"]))).toBe("guest-one");
    expect(selectAgoraActiveSpeaker([{ id: "guest-one", level: AGORA_ACTIVE_SPEAKER_LEVEL - 1 }], new Set(["guest-one"]))).toBeNull();
    expect(AGORA_ACTIVE_SPEAKER_HOLD_MS).toBeGreaterThan(3_000);
  });

  it("opens the room before local camera initialization", () => {
    expect(roomSource.indexOf('setStatus("joined")')).toBeLessThan(roomSource.indexOf("void initializeLocalMedia"));
    expect(roomSource).toContain("Connected. Opening camera…");
    expect(roomSource).toContain("Retry camera");
    expect(roomSource).toContain("Retry mic");
    expect(roomSource).toContain("checkSystemRequirements");
    expect(roomSource).toContain("getSupportedCodec");
    expect(roomSource).not.toContain("startProxyServer(5)");
    expect(roomSource).not.toContain("Trying secure fallback");
    expect(roomSource).toContain("enableAudioVolumeIndicator");
    expect(roomSource).toContain('client.on("volume-indicator"');
    expect(roomSource).toContain("Speaker view");
    expect(roomSource).toContain("Grid view");
    expect(roomSource).toContain("visibleRemoteUsers");
    expect(roomSource).toContain('const localVideoTile = <article className="agora-video-tile agora-video-tile-local"');
    expect(roomSource).toContain('className="agora-video-stage"');
    expect(roomSource).not.toContain('activeSpeakerId === "local"');
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
