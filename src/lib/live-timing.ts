export const TRIVIA_GRACE_MS = 90_000;

export function estimateClockOffset(serverTime: string, requestStartedAt: number, responseReceivedAt: number, serverReceivedTime?: string) {
  const serverSent = new Date(serverTime).getTime();
  const serverReceived = serverReceivedTime ? new Date(serverReceivedTime).getTime() : NaN;
  if (!Number.isFinite(serverSent) || responseReceivedAt < requestStartedAt) return 0;
  if (Number.isFinite(serverReceived)) return ((serverReceived-requestStartedAt)+(serverSent-responseReceivedAt))/2;
  return serverSent - (requestStartedAt + responseReceivedAt) / 2;
}

export function correctedNow(localNow: number, clockOffsetMs: number) {
  return localNow + clockOffsetMs;
}

export function triviaDeliveryStatus(deadlineAt: string, answeredAt: string, receivedAt: number) {
  const deadline = new Date(deadlineAt).getTime();
  const answered = new Date(answeredAt).getTime();
  const valid = Number.isFinite(deadline) && Number.isFinite(answered);
  return {
    accepted: valid,
    onTime: valid && answered <= deadline && receivedAt <= deadline + TRIVIA_GRACE_MS,
    expiresAt: valid ? deadline + TRIVIA_GRACE_MS : 0
  };
}
