import { createHmac, timingSafeEqual } from "node:crypto";

export type TriviaDeadlineClaims = {
  version: 1;
  eventId: string;
  participantId: string;
  flightItemId: string;
  questionId: string;
  deadlineAt: string;
};

function signingSecret() {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error("Missing trivia-token signing secret.");
  return createHmac("sha256", secret).update("vintage-fork:trivia-deadline:v1").digest();
}

export function createTriviaDeadlineToken(claims: Omit<TriviaDeadlineClaims, "version">) {
  const payload = Buffer.from(JSON.stringify({ version: 1, ...claims } satisfies TriviaDeadlineClaims)).toString("base64url");
  const signature = createHmac("sha256", signingSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyTriviaDeadlineToken(token: string): TriviaDeadlineClaims | null {
  const [payload, suppliedSignature, extra] = token.split(".");
  if (!payload || !suppliedSignature || extra) return null;
  const expectedSignature = createHmac("sha256", signingSecret()).update(payload).digest();
  let supplied: Buffer;
  try { supplied = Buffer.from(suppliedSignature, "base64url"); }
  catch { return null; }
  if (supplied.length !== expectedSignature.length || !timingSafeEqual(supplied, expectedSignature)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<TriviaDeadlineClaims>;
    if (claims.version !== 1 || !claims.eventId || !claims.participantId || !claims.flightItemId || !claims.questionId || !claims.deadlineAt) return null;
    if (!Number.isFinite(new Date(claims.deadlineAt).getTime())) return null;
    return claims as TriviaDeadlineClaims;
  } catch { return null; }
}
