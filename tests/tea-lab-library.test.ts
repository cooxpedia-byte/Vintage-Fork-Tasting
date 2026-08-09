import { describe, expect, it } from "vitest";
import { buildTeaLibrary, type PersonalTeaRecordRow } from "@/lib/tea-lab/library";
import type { LiveJournalEventRow, SoloJournalSessionRow } from "@/lib/tea-lab/journal";

const liveEvents: LiveJournalEventRow[] = [{
  id: "event-1",
  title: "Tea table",
  starts_at: "2026-08-01T18:00:00.000Z",
  location_mode: "remote",
  participant_id: "participant-1",
  responses: [
    {
      id: "response-1", rating: 4, first_impression: null, personal_notes: null, descriptors: [], intensity: "clear", saved: true,
      completed_at: "2026-08-01T18:30:00.000Z",
      stamp_released_at: "2026-08-01T18:35:00.000Z",
      flight: { id: "flight-1", reveal_title: "Golden", position: 1, tea: { id: "tea-1", name: "Golden Yunnan", producer: "Farm", origin: "Yunnan", tea_type: "Black" } }
    },
    {
      id: "response-2", rating: 5, first_impression: null, personal_notes: null, descriptors: [], intensity: "dominant", saved: true,
      completed_at: "2026-08-01T18:40:00.000Z",
      stamp_released_at: "2026-08-01T18:45:00.000Z",
      flight: { id: "flight-2", reveal_title: "Golden again", position: 2, tea: { id: "tea-1", name: "Golden Yunnan", producer: "Farm", origin: "Yunnan", tea_type: "Black" } }
    },
    {
      id: "response-3", rating: 3, first_impression: null, personal_notes: null, descriptors: [], intensity: "subtle", saved: false,
      completed_at: "2026-08-01T18:50:00.000Z",
      stamp_released_at: "2026-08-01T18:55:00.000Z",
      flight: { id: "flight-3", reveal_title: "Not saved", position: 3, tea: { id: "tea-2", name: "Not saved", origin: null } }
    }
  ]
}];

const personalRows: PersonalTeaRecordRow[] = [
  {
    id: "personal-1", canonical_tea_id: null, name: "Moonlight White", producer: null, origin: "Yunnan", tea_type: "White",
    cultivar: null, harvest: "Spring 2026", product_identifier: null, lot_code: "Lot 7", archived_at: null,
    created_at: "2026-08-02T10:00:00.000Z", updated_at: "2026-08-02T10:00:00.000Z"
  },
  {
    id: "personal-2", canonical_tea_id: null, name: "Old sample", producer: null, origin: null, tea_type: null,
    cultivar: null, harvest: null, product_identifier: null, lot_code: null, archived_at: "2026-08-03T10:00:00.000Z",
    created_at: "2026-08-01T10:00:00.000Z", updated_at: "2026-08-03T10:00:00.000Z"
  }
];

const soloRows: SoloJournalSessionRow[] = [{
  id: "session-1", kind: "solo", status: "completed", revision: 2,
  started_at: "2026-08-02T10:00:00.000Z", completed_at: "2026-08-02T10:30:00.000Z", archived_at: null,
  cards: [{
    id: "card-1", position: 1, canonical_tea_id: null, personal_tea_record_id: "personal-1", tea_name_snapshot: "Moonlight White",
    origin_snapshot: "Yunnan", rating: 4, intensity: "clear", completed_at: "2026-08-02T10:30:00.000Z",
    private_notes: null, descriptor_links: []
  }]
}];

describe("Tea Lab Library adapter", () => {
  it("groups repeated saved canonical references without rewriting the source responses", () => {
    const items = buildTeaLibrary(liveEvents, personalRows, soloRows);
    const saved = items.find(item => item.id === "canonical:tea-1");

    expect(saved).toMatchObject({ kind: "saved_canonical", name: "Golden Yunnan", savedReferences: 2 });
    expect(items.some(item => item.name === "Not saved")).toBe(false);
    expect(liveEvents[0].responses).toHaveLength(3);
  });

  it("includes active and archived private teas with completed solo-use counts", () => {
    const items = buildTeaLibrary(liveEvents, personalRows, soloRows);

    expect(items.find(item => item.id === "personal:personal-1")).toMatchObject({ documentedTastings: 1, archivedAt: null, lotCode: "Lot 7" });
    expect(items.find(item => item.id === "personal:personal-2")?.archivedAt).toBe("2026-08-03T10:00:00.000Z");
    expect(items.at(-1)?.id).toBe("personal:personal-2");
  });
});
