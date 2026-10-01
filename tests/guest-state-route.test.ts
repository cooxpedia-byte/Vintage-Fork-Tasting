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
  it.each(["trivia", "recap"])("keeps notes available during legacy %s without consulting the retired game", async phase => {
    const responses = [{ id: "response-1", event_flight_item_id: "flight-1", personal_notes: "Keep my note." }];
    const results: Record<string, unknown> = {
      events: { id: "event-1", phase, status: "live", current_flight_item_id: "flight-1", tasting_opened_flight_item_id: "flight-1", current_trivia_question_id: "old-question" },
      event_flight_items: [{ id: "flight-1", position: 1, reveal_title: "Green tea" }],
      tea_responses: responses,
      event_analytics: { average_rating: 4 }
    };
    const queries: Array<{ table: string; column: string; value: string }> = [];
    const from = vi.fn((table: string) => {
      if (!(table in results)) throw new Error("Retired game tables are unavailable");
      const result = { data: results[table], error: null };
      const builder = {
        select() { return builder; },
        eq(column: string, value: string) { queries.push({ table, column, value }); return builder; },
        order() { return Promise.resolve(result); },
        single() { return Promise.resolve(result); },
        maybeSingle() { return Promise.resolve(result); },
        then(resolve: (value: unknown) => unknown) { return Promise.resolve(result).then(resolve); }
      };
      return builder;
    });
    stubs.createAdminClient.mockReturnValue({ from });
    const response = await GET(new Request("https://example.test"), { params: Promise.resolve({ eventId: "event-1" }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ trivia: null, participantTrivia: null, responses, currentItem: { id: "flight-1" } });
    expect(queries).toContainEqual({ table: "tea_responses", column: "participant_id", value: "participant-1" });
    expect(from).not.toHaveBeenCalledWith("trivia_questions");
    expect(from).not.toHaveBeenCalledWith("trivia_answers");
  });

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
