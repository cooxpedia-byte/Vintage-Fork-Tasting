export const AGORA_OPERATION_TIMEOUT_MS = {
  token: 10_000,
  join: 15_000,
  media: 12_000,
  publish: 10_000,
  leave: 5_000
} as const;

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
