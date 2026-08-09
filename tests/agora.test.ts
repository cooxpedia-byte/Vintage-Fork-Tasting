import { afterEach, describe, expect, it, vi } from "vitest";
import {
  agoraChannelName,
  agoraUserAccount,
  createAgoraRtcToken,
  getAgoraConfiguration
} from "@/lib/agora";

afterEach(() => vi.unstubAllEnvs());

describe("Agora live tasting security", () => {
  it("derives stable channels and opaque accounts from server-owned IDs", () => {
    expect(agoraChannelName("aa11-bb22-cc33")).toBe("vf_aa11bb22cc33");
    expect(agoraUserAccount("host", "aa11-bb22")).toBe("host_aa11bb22");
    expect(agoraUserAccount("guest", "cc33-dd44")).toBe("guest_cc33dd44");
  });

  it("requires both a valid App ID and server-only certificate", () => {
    vi.stubEnv("NEXT_PUBLIC_AGORA_APP_ID", "a".repeat(32));
    vi.stubEnv("AGORA_APP_CERTIFICATE", "");
    expect(getAgoraConfiguration()).toBeNull();

    vi.stubEnv("AGORA_APP_CERTIFICATE", "b".repeat(32));
    expect(getAgoraConfiguration()).toEqual({
      appId: "a".repeat(32),
      appCertificate: "b".repeat(32)
    });
  });

  it("issues an AccessToken2 RTC publisher token", () => {
    const token = createAgoraRtcToken({
      appId: "a".repeat(32),
      appCertificate: "b".repeat(32),
      channel: "vf_testevent",
      account: "guest_testparticipant",
      expiresInSeconds: 600
    });
    expect(token.startsWith("007")).toBe(true);
    expect(token.length).toBeGreaterThan(100);
  });
});
