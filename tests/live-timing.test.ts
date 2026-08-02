import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { correctedNow, estimateClockOffset, triviaDeliveryStatus, TRIVIA_GRACE_MS } from "@/lib/live-timing";
import { createTriviaDeadlineToken, verifyTriviaDeadlineToken } from "@/lib/trivia-token";

describe("live clock synchronization", () => {
  it("estimates offset at the request midpoint", () => {
    expect(estimateClockOffset("2026-08-02T00:00:01.050Z", Date.parse("2026-08-02T00:00:00.900Z"), Date.parse("2026-08-02T00:00:01.000Z"))).toBe(100);
    expect(correctedNow(1_000, 100)).toBe(1_100);
  });
  it("uses all four timestamps when server processing time is known",()=>{
    expect(estimateClockOffset("2026-08-02T00:00:01.080Z",Date.parse("2026-08-02T00:00:00.900Z"),Date.parse("2026-08-02T00:00:01.000Z"),"2026-08-02T00:00:00.980Z")).toBe(80);
  });
});

describe("trivia recovery window", () => {
  const deadline = "2026-08-02T00:00:20.000Z";
  it("keeps an answer on time when delivery recovers inside the 90-second grace", () => {
    const result = triviaDeliveryStatus(deadline, "2026-08-02T00:00:19.900Z", Date.parse(deadline) + TRIVIA_GRACE_MS);
    expect(result).toMatchObject({ accepted: true, onTime: true });
  });
  it("records but excludes a late selection or delivery after grace", () => {
    expect(triviaDeliveryStatus(deadline, "2026-08-02T00:00:20.001Z", Date.parse(deadline) + 1).onTime).toBe(false);
    expect(triviaDeliveryStatus(deadline, "2026-08-02T00:00:19.000Z", Date.parse(deadline) + TRIVIA_GRACE_MS + 1).onTime).toBe(false);
  });
});

describe("signed trivia deadline tokens", () => {
  beforeEach(() => { process.env.SUPABASE_SECRET_KEY = "test-secret-that-is-long-enough-for-hmac"; });
  afterEach(() => { delete process.env.SUPABASE_SECRET_KEY; });
  it("round-trips valid event-scoped claims and rejects tampering", () => {
    const token = createTriviaDeadlineToken({ eventId:"event",participantId:"participant",flightItemId:"flight",questionId:"question",deadlineAt:"2026-08-02T00:00:20.000Z" });
    expect(verifyTriviaDeadlineToken(token)?.questionId).toBe("question");
    expect(verifyTriviaDeadlineToken(`${token.slice(0,-1)}x`)).toBeNull();
  });
});
