import { describe, expect, it } from "vitest";
import {
  buildArchivedJournalSessions,
  buildJournalSessions,
  mapLegacyJournalDescriptor,
  mapLiveEventToJournalSession,
  mapSoloSessionToJournalSession,
  soloJournalSessionToDraft,
  type LiveJournalEventRow,
  type SoloJournalSessionRow
} from "@/lib/tea-lab/journal";

const liveEvent: LiveJournalEventRow = {
  id: "event-1",
  title: "Summer tea table",
  starts_at: "2026-08-01T18:00:00.000Z",
  timezone: "America/Edmonton",
  location_mode: "remote",
  participant_id: "participant-1",
  responses: [
    {
      id: "response-2",
      rating: null,
      first_impression: null,
      personal_notes: null,
      descriptors: ["Unexpected smoke"],
      intensity: null,
      saved: false,
      completed_at: null,
      stamp_released_at: null,
      flight: { id: "flight-2", reveal_title: "Second tea", position: 2, tea: null }
    },
    {
      id: "response-1",
      rating: 5,
      first_impression: "Golden and bright",
      personal_notes: "Try with cooler water",
      descriptors: ["Honeyed", "stone fruit"],
      intensity: "dominant",
      saved: true,
      completed_at: "2026-08-01T18:30:00.000Z",
      stamp_released_at: "2026-08-01T18:35:00.000Z",
      flight: { id: "flight-1", reveal_title: "First tea", position: 1, tea: { name: "Golden Yunnan", origin: "Yunnan" } }
    }
  ]
};

function soloSession(overrides: Partial<SoloJournalSessionRow> = {}): SoloJournalSessionRow {
  return {
    id: "session-1",
    kind: "solo",
    status: "completed",
    started_at: "2026-08-02T10:00:00.000Z",
    completed_at: "2026-08-02T10:30:00.000Z",
    archived_at: null,
    revision: 2,
    cards: [{
      id: "card-1",
      position: 1,
      personal_tea_record_id: "personal-tea-1",
      tea_name_snapshot: "Moonlight White",
      producer_snapshot: "White2Tea",
      origin_snapshot: "Yunnan",
      tea_type_snapshot: "White",
      rating: 4,
      intensity: "clear",
      completed_at: "2026-08-02T10:30:00.000Z",
      brewing: [{ brewing_style: "gongfu", leaf_grams: 5, water_ml: 100, water_temperature_c: 85, water_source: "Filtered", vessel: "Gaiwan", initial_steep_seconds: 10, preparation_notes: "Warm vessel" }],
      brew_stages: [
        { stage_number: 2, label: "Infusion 2", duration_seconds: 15, temperature_c: 85, notes: "Floral" },
        { stage_number: 1, label: "Infusion 1", duration_seconds: 10, temperature_c: 85, notes: "Apricot" }
      ],
      private_notes: [{ first_impression: "Soft apricot", personal_notes: "Excellent on steep three" }],
      descriptor_links: [
        {
          descriptor_id: "descriptor-2",
          position: 2,
          descriptor: { id: "descriptor-2", label: "Stone fruit" }
        },
        {
          descriptor_id: "descriptor-1",
          position: 1,
          descriptor: [{ id: "descriptor-1", label: "Honeyed" }]
        }
      ]
    }],
    ...overrides
  };
}

describe("Tea Lab Journal adapters", () => {
  it("maps known legacy descriptors without rewriting unknown observations", () => {
    expect(mapLegacyJournalDescriptor(" Stone   Fruit ")).toEqual({
      stableId: "10000000-0000-4000-8000-000000000005",
      label: "Stone fruit",
      mapped: true
    });
    expect(mapLegacyJournalDescriptor("silken")).toEqual({
      stableId: "20000000-0000-4000-8000-000000000069",
      label: "Silky",
      mapped: true
    });
    expect(mapLegacyJournalDescriptor("Unexpected smoke")).toEqual({
      stableId: null,
      label: "Unexpected smoke",
      mapped: false
    });
  });

  it("adapts live history with source-qualified IDs, private notes, and derived verification", () => {
    const session = mapLiveEventToJournalSession(liveEvent);

    expect(session.id).toBe("live-session:event-1:participant-1");
    expect(session.source).toBe("live");
    expect(session.timeZone).toBe("America/Edmonton");
    expect(session.contextLabel).toBe("Remote");
    expect(session.cards.map(card => card.id)).toEqual(["live:response-1", "live:response-2"]);
    expect(session.cards[0]).toMatchObject({
      teaName: "Golden Yunnan",
      origin: "Yunnan",
      firstImpression: "Golden and bright",
      personalNotes: "Try with cooler water",
      sealClass: "live_event_verified"
    });
    expect(session.cards[0].descriptors.map(descriptor => descriptor.stableId)).toEqual([
      "10000000-0000-4000-8000-000000000001",
      "10000000-0000-4000-8000-000000000005"
    ]);
    expect(session.cards[1]).toMatchObject({
      teaName: "Second tea",
      completedAt: null,
      sealClass: null
    });
    expect(session.cards[1].descriptors[0].mapped).toBe(false);
  });

  it("adapts solo rows while preserving snapshots and relation ordering", () => {
    const input = soloSession();
    const session = mapSoloSessionToJournalSession(input);

    expect(session).toMatchObject({
      id: "solo-session:session-1",
      source: "solo",
      title: "Solo tasting",
      occurredAt: "2026-08-02T10:30:00.000Z",
      completedAt: "2026-08-02T10:30:00.000Z",
      archivedAt: null,
      status: "completed"
    });
    expect(session.cards[0]).toMatchObject({
      id: "solo:card-1",
      teaName: "Moonlight White",
      origin: "Yunnan",
      firstImpression: "Soft apricot",
      personalNotes: "Excellent on steep three",
      sealClass: "documented_tasting",
      brewing: {
        style: "gongfu",
        preparationNotes: "Warm vessel",
        stages: [
          { label: "Infusion 1", durationSeconds: 10, temperatureC: 85, notes: "Apricot" },
          { label: "Infusion 2", durationSeconds: 15, temperatureC: 85, notes: "Floral" }
        ]
      }
    });
    expect(session.cards[0].descriptors).toEqual([
      { stableId: "descriptor-1", label: "Honeyed", mapped: true },
      { stableId: "descriptor-2", label: "Stone fruit", mapped: true }
    ]);
    expect(input.cards?.[0].descriptor_links?.[0].position).toBe(2);
  });

  it("reconstructs an editable completed draft without changing its completion evidence", () => {
    const session = mapSoloSessionToJournalSession(soloSession());
    const draft = soloJournalSessionToDraft("owner-1", session);

    expect(draft).toMatchObject({
      ownerUserId: "owner-1",
      sessionId: "session-1",
      cardId: "card-1",
      serverRevision: 2,
      status: "completed",
      tea: {
        kind: "personal",
        personalTeaId: "personal-tea-1",
        name: "Moonlight White",
        producer: "White2Tea",
        origin: "Yunnan",
        teaType: "White"
      },
      brewing: {
        style: "gongfu",
        leafGrams: 5,
        waterMl: 100,
        stages: [
          { label: "Infusion 1", notes: "Apricot" },
          { label: "Infusion 2", notes: "Floral" }
        ]
      },
      tasting: {
        firstImpression: "Soft apricot",
        descriptorIds: ["descriptor-1", "descriptor-2"],
        rating: 4,
        personalNotes: "Excellent on steep three"
      },
      createdAt: "2026-08-02T10:30:00.000Z",
      lastSyncedAt: "2026-08-02T10:30:00.000Z"
    });
  });

  it("combines sources newest-first and excludes draft, archived, and incomplete solo records", () => {
    const sessions = buildJournalSessions([liveEvent], [
      soloSession(),
      soloSession({ id: "draft", status: "draft", completed_at: null }),
      soloSession({ id: "archived", archived_at: "2026-08-03T00:00:00.000Z" }),
      soloSession({
        id: "incomplete-card",
        cards: [{ ...soloSession().cards![0], id: "incomplete", completed_at: null, rating: null }]
      })
    ]);

    expect(sessions.map(session => session.id)).toEqual([
      "solo-session:session-1",
      "live-session:event-1:participant-1"
    ]);
    expect(sessions.flatMap(session => session.cards).map(card => card.id)).toEqual([
      "solo:card-1",
      "live:response-1",
      "live:response-2"
    ]);
  });

  it("keeps a submitted live card unstamped until the host releases it", () => {
    const pending = structuredClone(liveEvent);
    pending.responses[1].stamp_released_at = null;

    const session = mapLiveEventToJournalSession(pending);

    expect(session.cards[0]).toMatchObject({ completedAt: null, sealClass: null });
  });

  it("offers completed archived solo sessions through a separate reversible view", () => {
    const sessions = buildArchivedJournalSessions([
      soloSession(),
      soloSession({ id: "archived", archived_at: "2026-08-03T00:00:00.000Z", revision: 4 }),
      soloSession({ id: "draft", status: "draft", completed_at: null, archived_at: "2026-08-04T00:00:00.000Z" })
    ]);

    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ id: "solo-session:archived", revision: 4, archivedAt: "2026-08-03T00:00:00.000Z" });
  });
});
