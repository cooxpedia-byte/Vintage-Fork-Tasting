import { describe, expect, it } from "vitest";
import { chooseDraftForHydration, mapServerDraftToOfflineDraft, type TeaLabServerDraftRow } from "@/lib/tea-lab/lab";

const serverRow: TeaLabServerDraftRow = {
  id: "session-1",
  status: "in_progress",
  started_at: "2026-08-03T10:00:00.000Z",
  updated_at: "2026-08-03T10:30:00.000Z",
  revision: 3,
  archived_at: null,
  cards: [{
    id: "card-1",
    canonical_tea_id: null,
    personal_tea_record_id: "personal-1",
    tea_name_snapshot: "Moonlight White",
    producer_snapshot: "Small Farm",
    origin_snapshot: "Yunnan",
    tea_type_snapshot: "White",
    cultivar_snapshot: null,
    harvest_snapshot: "Spring 2026",
    product_identifier_snapshot: null,
    lot_code_snapshot: "Lot 7",
    rating: 4,
    intensity: "clear",
    brewing: [{ leaf_grams: 5, water_ml: 100, water_temperature_c: 85, water_source: "Filtered", vessel: "Gaiwan", initial_steep_seconds: 20 }],
    private_notes: { first_impression: "Apricot", personal_notes: "Private" },
    descriptor_links: [{ descriptor_id: "descriptor-2", position: 2 }, { descriptor_id: "descriptor-1", position: 1 }]
  }]
};

describe("Tea Lab server draft hydration", () => {
  it("restores the complete private working copy and descriptor order", () => {
    const draft = mapServerDraftToOfflineDraft("owner-1", serverRow);

    expect(draft).toMatchObject({
      ownerUserId: "owner-1",
      sessionId: "session-1",
      cardId: "card-1",
      serverRevision: 3,
      status: "in_progress",
      tea: { kind: "personal", personalTeaId: "personal-1", name: "Moonlight White", lotCode: "Lot 7" },
      brewing: { leafGrams: 5, waterMl: 100, vessel: "Gaiwan" },
      tasting: { firstImpression: "Apricot", personalNotes: "Private", descriptorIds: ["descriptor-1", "descriptor-2"] }
    });
  });

  it("uses canonical identity without turning it into a personal record", () => {
    const draft = mapServerDraftToOfflineDraft("owner-1", {
      ...serverRow,
      cards: [{ ...serverRow.cards![0], canonical_tea_id: "tea-1", personal_tea_record_id: null }]
    });

    expect(draft?.tea).toEqual({ kind: "canonical", canonicalTeaId: "tea-1" });
  });

  it("never overwrites pending device work during hydration", () => {
    const server = mapServerDraftToOfflineDraft("owner-1", serverRow)!;
    const local = { ...server, serverRevision: 2, tasting: { ...server.tasting, personalNotes: "Unsynced device edit" } };

    expect(chooseDraftForHydration(local, server, true)).toBe(local);
    expect(chooseDraftForHydration(local, server, false)).toBe(server);
  });
});
