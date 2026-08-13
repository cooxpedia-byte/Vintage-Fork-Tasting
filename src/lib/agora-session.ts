export const AGORA_OPERATION_TIMEOUT_MS = {
  token: 10_000,
  // Agora's Web SDK performs its own network/TLS recovery inside join().
  // Safari can need more than 15 seconds to complete that recovery.
  join: 45_000,
  proxyJoin: 25_000,
  media: 12_000,
  publish: 10_000,
  leave: 5_000
} as const;

export type AgoraVideoCodec = "vp8" | "h264";

export class AgoraOperationTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgoraOperationTimeoutError";
  }
}

export async function withAgoraTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  message: string
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new AgoraOperationTimeoutError(message)), timeoutMs);
      })
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export function describeMediaError(error: unknown, device: "camera" | "microphone") {
  const label = device === "camera" ? "Camera" : "Microphone";
  const name = error instanceof Error ? error.name : "";
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";

  if (error instanceof AgoraOperationTimeoutError) {
    return `${label} did not respond. You can stay in the room and retry it.`;
  }
  if (name === "NotAllowedError" || code.includes("PERMISSION_DENIED")) {
    return `${label} permission is blocked. Allow it in the browser settings, then retry.`;
  }
  if (name === "NotFoundError" || code.includes("NOT_FOUND")) {
    return `No ${device} was found on this device.`;
  }
  if (name === "NotReadableError" || code.includes("NOT_READABLE")) {
    return `${label} is busy in another app. Close the other app, then retry.`;
  }
  return `${label} could not start. You can stay in the room and retry it.`;
}

export function selectAgoraVideoCodec(supportedVideoCodecs: string[]): AgoraVideoCodec {
  const supported = supportedVideoCodecs.map(codec => codec.toUpperCase());
  if (supported.includes("VP8")) return "vp8";
  if (supported.includes("H264")) return "h264";
  return "vp8";
}

export function agoraErrorCode(error: unknown) {
  if (!error || typeof error !== "object") return "UNKNOWN";
  if ("code" in error && error.code) return String(error.code).toUpperCase();
  if (error instanceof Error && error.name) return error.name.toUpperCase();
  return "UNKNOWN";
}

export function describeAgoraConnectionError(error: unknown) {
  const code = agoraErrorCode(error);
  const reference = code === "UNKNOWN" ? "" : ` Reference: ${code}.`;
  if (error instanceof AgoraOperationTimeoutError || [
    "TIMEOUT",
    "NETWORK",
    "GATEWAY",
    "MULTI_UNILBS",
    "NO_ICE_CANDIDATE",
    "ICE_FAILED",
    "WS_",
    "EXTERNAL_SIGNAL_ABORT",
    "VOID_GATEWAY_ADDRESS",
    "OPERATION_ABORTED"
  ].some(value => code.includes(value))) {
    return `The video connection could not reach Agora. The tasting is still running; reconnect video or try another network.${reference}`;
  }
  if (code.includes("NOT_SUPPORTED")) {
    return `This browser cannot run the live video room. Update it or use current Chrome, Edge, or Safari.${reference}`;
  }
  if (code.includes("UID_CONFLICT")) {
    return `The previous video connection is still closing. Wait a few seconds, then reconnect.${reference}`;
  }
  return `The video room could not connect. The tasting is still running; reconnect when ready.${reference}`;
}
