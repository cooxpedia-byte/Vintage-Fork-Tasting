import { beforeEach, describe, expect, it, vi } from "vitest";

const stubs = vi.hoisted(() => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  requireParticipant: vi.fn()
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: stubs.createClient }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: stubs.createAdminClient }));
vi.mock("@/lib/guest-token", () => ({ requireParticipant: stubs.requireParticipant }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { POST as answerTrivia } from "@/app/api/events/[eventId]/trivia/route";
import { POST as command } from "@/app/api/events/[eventId]/command/route";

const context = { params: Promise.resolve({ eventId: "event-1" }) };
const leaseToken = "00000000-0000-4000-8000-000000000001";
function hostRequest(action: string) {
  return new Request("https://example.test/command", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ command: action, expectedSequence: 3, leaseToken })
  });
}

beforeEach(() => vi.resetAllMocks());

describe("retired trivia server actions", () => {
  it("returns a final retired response for queued answers without accessing a database", async () => {
    const response = await answerTrivia();
    expect(response.status).toBe(410);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ code: "feature_retired" });
    expect(stubs.createAdminClient).not.toHaveBeenCalled();
    expect(stubs.requireParticipant).not.toHaveBeenCalled();
  });

  it.each(["open_trivia", "close_trivia"])("rejects a legacy %s command before any RPC", async action => {
    const response = await command(hostRequest(action), context);
    expect(response.status).toBe(410);
    expect(await response.json()).toMatchObject({ code: "feature_retired" });
    expect(stubs.createClient).not.toHaveBeenCalled();
  });

  it.each(["open_tasting", "return_to_tasting", "next_tea", "start_recap"])("preserves authenticated %s with lease and sequence guards", async action => {
    const event = { id: "event-1", phase: "tasting", sequence_number: 4 };
    const rpc = vi.fn().mockResolvedValue({ data: event, error: null });
    stubs.createClient.mockResolvedValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "host-1" } } }) }, rpc });
    const response = await command(hostRequest(action), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ event });
    expect(rpc).toHaveBeenCalledWith("apply_event_command", {
      p_event_id: "event-1", p_command: action, p_expected_sequence: 3, p_lease_token: leaseToken
    });
  });

  it("still requires authentication for active tasting commands", async () => {
    const rpc = vi.fn();
    stubs.createClient.mockResolvedValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) }, rpc });
    const response = await command(hostRequest("next_tea"), context);
    expect(response.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });
});
