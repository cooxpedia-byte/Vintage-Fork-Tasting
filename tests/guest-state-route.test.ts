import { beforeEach, describe, expect, it, vi } from "vitest";

const stubs = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  requireParticipant: vi.fn(),
  loggerError: vi.fn()
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: stubs.createAdminClient }));
vi.mock("@/lib/guest-token", () => ({ requireParticipant: stubs.requireParticipant }));
vi.mock("@/lib/logger", () => ({ logger: { error: stubs.loggerError } }));

import { GET } from "@/app/api/events/[eventId]/state/route";

function eventClient(result: { data: unknown; error: unknown }) {
  const builder = {
    select() { return builder; },
    eq() { return builder; },
    async single() { return result; }
  };
  return { from: vi.fn(() => builder) };
}

beforeEach(() => {
  vi.clearAllMocks();
  stubs.requireParticipant.mockResolvedValue({ id: "participant-1" });
});

describe("guest state integration failures", () => {
  it("returns a retryable server error when the shared event schema is unavailable", async () => {
    const error = { code: "42703", message: "missing column" };
    stubs.createAdminClient.mockReturnValue(eventClient({ data: null, error }));

    const response = await GET(new Request("https://example.test"), {
      params: Promise.resolve({ eventId: "event-1" })
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "We couldn’t load the current tasting state." });
    expect(stubs.loggerError).toHaveBeenCalledWith("guest_state_load_failed", error, { eventId: "event-1" });
  });

  it("keeps a genuinely missing event as a not-found response", async () => {
    stubs.createAdminClient.mockReturnValue(eventClient({ data: null, error: { code: "PGRST116" } }));

    const response = await GET(new Request("https://example.test"), {
      params: Promise.resolve({ eventId: "missing-event" })
    });

    expect(response.status).toBe(404);
    expect(stubs.loggerError).not.toHaveBeenCalled();
  });
});
