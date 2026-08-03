import { describe, expect, it } from "vitest";
import { buildPassportSeals } from "@/lib/tea-lab/passport";
import type { LiveJournalEventRow, SoloJournalSessionRow } from "@/lib/tea-lab/journal";

const live: LiveJournalEventRow = {
  id: "event-1", title: "Live table", starts_at: "2026-08-01T18:00:00.000Z", location_mode: "in_person", participant_id: "participant-1",
  responses: [
    { id: "response-1", rating: 5, first_impression: null, personal_notes: null, descriptors: [], intensity: "dominant", saved: false, completed_at: "2026-08-01T18:30:00.000Z", flight: { id: "flight-1", reveal_title: "Golden", position: 1, tea: { name: "Golden Yunnan", origin: "Yunnan" } } },
    { id: "response-2", rating: null, first_impression: null, personal_notes: null, descriptors: [], intensity: null, saved: false, completed_at: null, flight: { id: "flight-2", reveal_title: "Skipped", position: 2, tea: null } }
  ]
};

function solo(archived_at: string | null): SoloJournalSessionRow {
  return {
    id: "session-1", kind: "solo", status: "completed", revision: 3,
    started_at: "2026-08-02T10:00:00.000Z", completed_at: "2026-08-02T10:30:00.000Z", archived_at,
    cards: [{
      id: "card-1", position: 1, tea_name_snapshot: "Moonlight White", producer_snapshot: "Spring House", origin_snapshot: "Yunnan", tea_type_snapshot: "White",
      rating: 4, intensity: "clear", completed_at: "2026-08-02T10:30:00.000Z",
      brewing: { leaf_grams: 5, water_ml: 125, water_temperature_c: 85, water_source: "Filtered", vessel: "Gaiwan", initial_steep_seconds: 35 },
      photos: [{ id: "photo-1", storage_path: "private/photo.jpg", signed_url: "https://signed.example/photo.jpg", alt_text: null, created_at: "2026-08-02T10:15:00.000Z", upload_status: "ready" }],
      private_notes: { first_impression: "Apricot", personal_notes: "Soft finish" }, descriptor_links: []
    }]
  };
}

describe("Tea Lab Passport derivation", () => {
  it("distinguishes verified live evidence from documented solo evidence", () => {
    const seals = buildPassportSeals([live], [solo(null)]);

    expect(seals.map(seal => seal.label)).toEqual(["Documented Tasting", "Live Event Verified"]);
    expect(seals.map(seal => seal.id)).toEqual(["documented_tasting:card-1", "live_event_verified:response-1"]);
    expect(seals.some(seal => seal.teaName === "Skipped")).toBe(false);
  });

  it("retains a solo seal when its source session is archived", () => {
    expect(buildPassportSeals([], [solo("2026-08-03T10:00:00.000Z")])[0]).toMatchObject({
      label: "Documented Tasting",
      archived: true
    });
  });

  it("carries the complete private journal record into the digital card", () => {
    const seal = buildPassportSeals([], [solo(null)])[0];

    expect(seal.card).toMatchObject({
      teaName: "Moonlight White",
      producer: "Spring House",
      teaType: "White",
      rating: 4,
      intensity: "clear",
      firstImpression: "Apricot",
      personalNotes: "Soft finish",
      brewing: { leafGrams: 5, waterMl: 125, vessel: "Gaiwan", initialSteepSeconds: 35 },
      photos: [{ id: "photo-1", url: "https://signed.example/photo.jpg" }]
    });
  });
});
