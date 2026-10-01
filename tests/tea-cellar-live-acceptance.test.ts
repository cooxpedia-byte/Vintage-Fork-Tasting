import { beforeEach, describe, expect, it, vi } from "vitest";

const stubs = vi.hoisted(() => ({ createAdminClient: vi.fn(), requireParticipant: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: stubs.createAdminClient }));
vi.mock("@/lib/guest-token", () => ({ requireParticipant: stubs.requireParticipant }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));

import { POST } from "@/app/api/events/[eventId]/response/route";

const eventId = "10000000-0000-4000-8000-000000000100";
const otherEventId = "10000000-0000-4000-8000-000000000200";
const flightId = "10000000-0000-4000-8000-000000000101";
const foreignFlightId = "10000000-0000-4000-8000-000000000201";
const participantId = "participant-1";
const otherParticipantId = "participant-2";
const originalCompletion = "2026-09-01T18:30:00.000Z";
const context = { params: Promise.resolve({ eventId }) };

type Row = Record<string, unknown>;

/** Model the route's persistence and filters; any game/market table access fails. */
function fixture(phase: "trivia" | "recap", opened = true) {
  const tables: Record<string, Row[]> = {
    participants: [
      { id: participantId, event_id: eventId, status: "active" },
      { id: otherParticipantId, event_id: eventId, status: "active" }
    ],
    events: [{ id: eventId, status: "live", phase, current_flight_item_id: flightId, tasting_opened_flight_item_id: opened ? flightId : null }],
    event_flight_items: [{ id: flightId, event_id: eventId }, { id: foreignFlightId, event_id: otherEventId }],
    tea_responses: [
      { participant_id: otherParticipantId, event_flight_item_id: flightId, personal_notes: "Someone else's private notes", completed_at: "2026-08-01T18:30:00.000Z" },
      { participant_id: participantId, event_flight_item_id: flightId, personal_notes: "My earlier notes", completed_at: originalCompletion }
    ]
  };
  const upserts = vi.fn((payload: Row, options: { onConflict: string }) => {
    const columns = options.onConflict.split(",");
    const row = tables.tea_responses.find(candidate => columns.every(column => candidate[column] === payload[column]));
    if (row) Object.assign(row, payload);
    else tables.tea_responses.push({ ...payload });
    return Promise.resolve({ error: null });
  });
  const from = vi.fn((table: string) => {
    if (!(table in tables)) throw new Error(`Retired or unexpected table ${table}`);
    let rows = tables[table];
    let update: Row | null = null;
    const result = () => {
      if (update) rows.forEach(row => Object.assign(row, update));
      return { data: rows, error: null };
    };
    const builder = {
      select() { return builder; },
      eq(column: string, value: unknown) { rows = rows.filter(row => row[column] === value); return builder; },
      update(value: Row) { update = value; return builder; },
      async single() { return { ...result(), data: rows[0] ?? null }; },
      async maybeSingle() { return { ...result(), data: rows[0] ?? null }; },
      upsert: upserts,
      then(resolve: (value: ReturnType<typeof result>) => unknown) { return Promise.resolve(result()).then(resolve); }
    };
    return builder;
  });
  stubs.createAdminClient.mockReturnValue({ from });
  return { tables, upserts };
}

function request(overrides: Row = {}) {
  return new Request(`https://example.test/api/events/${eventId}/response`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      flightItemId: flightId, personalNotes: "My revised private notes", firstImpression: "Honey and flowers",
      descriptors: ["honey"], intensity: "clear", rating: 4, saved: true, completed: false, ...overrides
    })
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  stubs.requireParticipant.mockResolvedValue({ id: participantId, event_id: eventId, status: "active" });
});

describe("personal live notes after game retirement", () => {
  it("saves notes from an old trivia screen without changing the original completion or another participant", async () => {
    const { tables, upserts } = fixture("trivia");
    const otherBefore = structuredClone(tables.tea_responses[0]);

    const response = await POST(request(), context);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(upserts).toHaveBeenCalledOnce();
    expect(tables.tea_responses[1]).toMatchObject({
      participant_id: participantId, personal_notes: "My revised private notes", first_impression: "Honey and flowers",
      descriptors: ["honey"], intensity: "clear", rating: 4, saved: true, completed_at: originalCompletion
    });
    expect(tables.tea_responses[0]).toEqual(otherBefore);
  });

  it("refuses legacy notes until the host has opened that tea", async () => {
    const { tables, upserts } = fixture("trivia", false);
    const before = structuredClone(tables.tea_responses);

    const response = await POST(request(), context);

    expect(response.status).toBe(409);
    expect(upserts).not.toHaveBeenCalled();
    expect(tables.tea_responses).toEqual(before);
  });

  it("keeps recap updates scoped to the server participant even when client ownership is forged", async () => {
    const { tables, upserts } = fixture("recap");
    const otherBefore = structuredClone(tables.tea_responses[0]);

    const response = await POST(request({ participantId: otherParticipantId, participant_id: otherParticipantId, ownerUserId: "another-owner" }), context);

    expect(response.status).toBe(200);
    expect(upserts).toHaveBeenCalledOnce();
    expect(tables.tea_responses[1]).toMatchObject({ participant_id: participantId, personal_notes: "My revised private notes", completed_at: originalCompletion });
    expect(tables.tea_responses[0]).toEqual(otherBefore);
  });

  it("rejects a tea from another event during recap without changing any notes", async () => {
    const { tables, upserts } = fixture("recap");
    const before = structuredClone(tables.tea_responses);

    const response = await POST(request({ flightItemId: foreignFlightId }), context);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "That tea does not belong to this tasting." });
    expect(upserts).not.toHaveBeenCalled();
    expect(tables.tea_responses).toEqual(before);
  });
});
