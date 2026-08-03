import { describe, expect, it } from "vitest";
import { buildJournalSessions, type SoloJournalSessionRow } from "@/lib/tea-lab/journal";
import { createSoloTeaDraft, type TeaLabOutboxOperation, type TeaLabSoloDraft } from "@/lib/tea-lab/offline";
import type { TeaLabOfflineStore } from "@/lib/tea-lab/offline-store";
import { queueTeaLabCompletion, queueTeaLabDeletion, syncTeaLabOutbox, type TeaLabOperationTransport } from "@/lib/tea-lab/outbox";
import { buildPassportSeals } from "@/lib/tea-lab/passport";

class AcceptanceStore implements TeaLabOfflineStore {
  drafts = new Map<string, TeaLabSoloDraft>();
  operations = new Map<string, TeaLabOutboxOperation>();
  key(owner: string, id: string) { return `${owner}:${id}`; }
  async getDraft(owner: string, session: string) { return structuredClone(this.drafts.get(this.key(owner, session)) ?? null); }
  async listDrafts(owner: string) { return [...this.drafts.values()].filter(draft => draft.ownerUserId === owner).map(value => structuredClone(value)); }
  async putDraft(draft: TeaLabSoloDraft) { this.drafts.set(this.key(draft.ownerUserId, draft.sessionId), structuredClone(draft)); }
  async saveDraftAndOperations(draft: TeaLabSoloDraft, operations: TeaLabOutboxOperation[]) {
    await this.putDraft(draft);
    for (const operation of operations) await this.putOperation(operation);
  }
  async replaceSessionOperations(draft: TeaLabSoloDraft, operations: TeaLabOutboxOperation[]) {
    await this.putDraft(draft);
    for (const [key, operation] of this.operations) if (operation.ownerUserId === draft.ownerUserId && operation.sessionId === draft.sessionId) this.operations.delete(key);
    for (const operation of operations) await this.putOperation(operation);
  }
  async listOperations(owner: string) {
    return [...this.operations.values()].filter(operation => operation.ownerUserId === owner).map(value => structuredClone(value)).sort((a, b) => a.sequence - b.sequence);
  }
  async putOperation(operation: TeaLabOutboxOperation) { this.operations.set(this.key(operation.ownerUserId, operation.id), structuredClone(operation)); }
  async deleteOperation(owner: string, operation: string) { this.operations.delete(this.key(owner, operation)); }
  async deleteSessionData(owner: string, session: string) {
    this.drafts.delete(this.key(owner, session));
    for (const [key, operation] of this.operations) if (operation.ownerUserId === owner && operation.sessionId === session) this.operations.delete(key);
  }
}

function ids(...values: string[]) {
  let index = 0;
  return () => values[index++] ?? `operation-${index}`;
}

function soloRow(draft: TeaLabSoloDraft): SoloJournalSessionRow {
  return {
    id: draft.sessionId,
    kind: "solo",
    status: "completed",
    revision: draft.serverRevision,
    started_at: draft.createdAt,
    completed_at: "2026-08-03T12:05:00.000Z",
    archived_at: null,
    cards: [{
      id: draft.cardId,
      position: 1,
      canonical_tea_id: draft.tea?.kind === "canonical" ? draft.tea.canonicalTeaId : null,
      personal_tea_record_id: draft.tea?.kind === "personal" ? draft.tea.personalTeaId : null,
      tea_name_snapshot: draft.tea?.kind === "personal" ? draft.tea.name : "Golden Yunnan",
      origin_snapshot: draft.tea?.kind === "personal" ? draft.tea.origin ?? null : "Yunnan",
      rating: draft.tasting.rating,
      intensity: draft.tasting.intensity,
      completed_at: "2026-08-03T12:05:00.000Z",
      private_notes: { first_impression: draft.tasting.firstImpression, personal_notes: draft.tasting.personalNotes },
      descriptor_links: []
    }]
  };
}

describe("Tea Lab MVP acceptance integration", () => {
  it("synchronizes one known-tea card and seal, then removes server and device evidence on deletion", async () => {
    const store = new AcceptanceStore();
    const base = createSoloTeaDraft("owner-1", ids("session-1", "card-1"), () => "2026-08-03T12:00:00.000Z");
    const draft: TeaLabSoloDraft = {
      ...base,
      tea: { kind: "canonical", canonicalTeaId: "tea-1" },
      tasting: { ...base.tasting, rating: 4, intensity: "clear", firstImpression: "Honeyed", personalNotes: "Private" }
    };
    await queueTeaLabCompletion(store, draft, ids("save-1", "complete-1"), () => "2026-08-03T12:01:00.000Z");
    let revision = 0;
    let saveCount = 0;
    let completionCount = 0;
    let deleted = false;
    const transport: TeaLabOperationTransport = async operation => {
      if (operation.kind === "delete") { deleted = true; return { outcome: "success" }; }
      revision += 1;
      if (operation.kind === "save") saveCount += 1;
      if (operation.kind === "complete") completionCount += 1;
      return {
        outcome: "success",
        session: {
          id: operation.sessionId,
          status: operation.kind === "complete" ? "completed" : "in_progress",
          revision,
          completedAt: operation.kind === "complete" ? "2026-08-03T12:05:00.000Z" : null,
          archivedAt: null
        }
      };
    };

    await syncTeaLabOutbox(store, "owner-1", transport);
    await syncTeaLabOutbox(store, "owner-1", transport);
    const completed = (await store.getDraft("owner-1", "session-1"))!;
    const rows = [soloRow(completed)];

    expect({ saveCount, completionCount }).toEqual({ saveCount: 1, completionCount: 1 });
    expect(buildJournalSessions([], rows).flatMap(session => session.cards)).toHaveLength(1);
    expect(buildPassportSeals([], rows).map(seal => seal.label)).toEqual(["Documented Tasting"]);

    await queueTeaLabDeletion(store, completed, ids("delete-1"));
    await syncTeaLabOutbox(store, "owner-1", transport);

    expect(deleted).toBe(true);
    expect(await store.getDraft("owner-1", "session-1")).toBeNull();
    expect(await store.listOperations("owner-1")).toEqual([]);
    expect(buildJournalSessions([], deleted ? [] : rows)).toEqual([]);
    expect(buildPassportSeals([], deleted ? [] : rows)).toEqual([]);
  });
});
