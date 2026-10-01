import { describe, expect, it } from "vitest";
import { buildCellarRecords } from "@/lib/tea-lab/cellar";
import type { LiveJournalEventRow, SoloJournalSessionRow } from "@/lib/tea-lab/journal";

const live: LiveJournalEventRow = {
  id: "event-1", title: "Evening tasting", starts_at: "2026-09-01T18:00:00.000Z", location_mode: "in_person", participant_id: "participant-1",
  responses: [{ id: "response-1", rating: 4, first_impression: "Floral", personal_notes: "A private memory", descriptors: ["honey"], intensity: "clear", saved: false, completed_at: "2026-09-01T19:00:00.000Z", stamp_released_at: null, flight: { id: "flight-1", reveal_title: "Autumn tea", position: 1, tea: { name: "Autumn tea", origin: "Yunnan" } } }]
};
const solo: SoloJournalSessionRow = {
  id: "session-1", kind: "solo", status: "completed", revision: 3, started_at: "2026-09-02T10:00:00.000Z", completed_at: "2026-09-02T11:00:00.000Z", archived_at: "2026-09-03T12:00:00.000Z",
  cards: [{ id: "card-1", position: 1, tea_name_snapshot: "Morning green", producer_snapshot: "Tea farm", origin_snapshot: "Japan", tea_type_snapshot: "Green", rating: 5, intensity: "clear", completed_at: "2026-09-02T11:00:00.000Z", private_notes: { first_impression: "Fresh", personal_notes: "Use cooler water" }, descriptor_links: [], brewing: { brewing_style: "gongfu", leaf_grams: 4, water_ml: 120, water_temperature_c: 80, water_source: "Filtered", vessel: "Small pot", initial_steep_seconds: 30 }, brew_stages: [{ stage_number: 1, label: "First infusion", duration_seconds: 30, temperature_c: 80, notes: "Sweet finish" }], photos: [{ id: "photo-1", storage_path: "owner/card/photo.jpg", signed_url: "https://photos.example.test/private", alt_text: "Tea leaves", created_at: "2026-09-02T10:30:00.000Z", upload_status: "ready" }] }]
};

describe("personal Tea Cellar records", () => {
  it("retains completed live notes without requiring a host stamp or market eligibility", () => {
    const record = buildCellarRecords([live], [])[0];
    expect(record).toMatchObject({ id: "live:response-1", source: "live", recordedAt: live.responses[0].completed_at, card: { sourceId: "response-1", sealClass: null, personalNotes: "A private memory", rating: 4 } });
    const released = structuredClone(live);
    released.responses[0].stamp_released_at = "2026-09-01T20:00:00.000Z";
    expect(buildCellarRecords([released], [])[0].id).toBe(record.id);
  });

  it("preserves archived history, notes, brewing stages and photos without rewriting input", () => {
    const before = structuredClone(solo);
    const record = buildCellarRecords([], [solo])[0];
    expect(record).toMatchObject({ id: "solo:card-1", archived: true, card: { sourceId: "card-1", personalNotes: "Use cooler water", brewing: { leafGrams: 4, waterMl: 120, stages: [{ notes: "Sweet finish" }] }, photos: [{ id: "photo-1", url: "https://photos.example.test/private" }] } });
    expect(solo).toEqual(before);
    expect(record).not.toHaveProperty("leafPrice");
    expect(record).not.toHaveProperty("listingEligible");
  });

  it("leaves in-progress notes in the Lab and excludes incomplete live responses", () => {
    const draft = structuredClone(solo); draft.status = "in_progress"; draft.archived_at = null;
    const unfinished = structuredClone(live); unfinished.responses[0].completed_at = null;
    expect(buildCellarRecords([unfinished], [draft])).toEqual([]);
  });

  it("deduplicates stable record IDs and sorts by recorded date", () => {
    const records = buildCellarRecords([live, live], [solo, solo]);
    expect(records.map(r => r.id)).toEqual(["solo:card-1", "live:response-1"]);
  });
});
