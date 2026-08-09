import { RtcRole, RtcTokenBuilder } from "agora-token";

export const AGORA_TOKEN_TTL_SECONDS = 60 * 60;

const AGORA_KEY_PATTERN = /^[a-f0-9]{32}$/i;

export function agoraChannelName(eventId: string) {
  const compactId = eventId.replace(/[^a-zA-Z0-9]/g, "");
  if (!compactId) throw new Error("Invalid tasting event ID.");
  return `vf_${compactId}`;
}

export function agoraUserAccount(kind: "host" | "guest", id: string) {
  const compactId = id.replace(/[^a-zA-Z0-9]/g, "");
  if (!compactId) throw new Error("Invalid tasting participant ID.");
  return `${kind}_${compactId}`;
}

export function getAgoraConfiguration() {
  const appId = process.env.NEXT_PUBLIC_AGORA_APP_ID?.trim() ?? "";
  const appCertificate = process.env.AGORA_APP_CERTIFICATE?.trim() ?? "";
  if (!AGORA_KEY_PATTERN.test(appId) || !AGORA_KEY_PATTERN.test(appCertificate)) return null;
  return { appId, appCertificate };
}

export function createAgoraRtcToken({
  appId,
  appCertificate,
  channel,
  account,
  expiresInSeconds = AGORA_TOKEN_TTL_SECONDS
}: {
  appId: string;
  appCertificate: string;
  channel: string;
  account: string;
  expiresInSeconds?: number;
}) {
  return RtcTokenBuilder.buildTokenWithUserAccount(
    appId,
    appCertificate,
    channel,
    account,
    RtcRole.PUBLISHER,
    expiresInSeconds,
    expiresInSeconds
  );
}
