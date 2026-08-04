import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createTeaLabOperationBase,
  createSoloTeaDraft,
  resolveTeaLabSaveIndicator,
  type TeaLabOutboxOperation,
  type TeaLabSoloDraft
} from "@/lib/tea-lab/offline";
import {
  createTeaLabDraftAutosave,
  queueTeaLabArchive,
  queueTeaLabCompletion,
  queueTeaLabDeletion,
  queueTeaLabDraftSave,
  retryTeaLabConflictWithDeviceDraft,
  retryTeaLabConflictWithDeviceDraftForCompletion,
  shouldRefreshTeaLabReadModels,
  syncTeaLabOutbox,
  type TeaLabOperationTransport
} from "@/lib/tea-lab/outbox";
import {
  teaLabDraftStorageKey,
  teaLabOperationStorageKey,
  type TeaLabOfflineStore
} from "@/lib/tea-lab/offline-store";

function clone<T>(value: T): T {
  return structuredClone(value);
}

class MemoryTeaLabStore implements TeaLabOfflineStore {
  drafts = new Map<string, TeaLabSoloDraft>();
  operations = new Map<string, TeaLabOutboxOperation>();

  async getDraft(ownerUserId: string, sessionId: string) {
    const draft = this.drafts.get(teaLabDraftStorageKey(ownerUserId, sessionId));
    return draft ? clone(draft) : null;
  }

  async listDrafts(ownerUserId: string) {
    return [...this.drafts.values()].filter(draft => draft.ownerUserId === ownerUserId).map(clone);
  }

  async putDraft(draft: TeaLabSoloDraft) {
    this.drafts.set(teaLabDraftStorageKey(draft.ownerUserId, draft.sessionId), clone(draft));
  }

  async saveDraftAndOperations(draft: TeaLabSoloDraft, operations: TeaLabOutboxOperation[]) {
    await this.putDraft(draft);
    for (const operation of operations) await this.putOperation(operation);
  }

  async replaceSessionOperations(draft: TeaLabSoloDraft, operations: TeaLabOutboxOperation[]) {
    await this.putDraft(draft);
    for (const [key, operation] of this.operations) {
      if (operation.ownerUserId === draft.ownerUserId && operation.sessionId === draft.sessionId) this.operations.delete(key);
    }
    for (const operation of operations) await this.putOperation(operation);
  }

  async listOperations(ownerUserId: string) {
    return [...this.operations.values()]
      .filter(operation => operation.ownerUserId === ownerUserId)
      .map(clone)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.sequence - right.sequence || left.id.localeCompare(right.id));
  }

  async putOperation(operation: TeaLabOutboxOperation) {
    this.operations.set(teaLabOperationStorageKey(operation.ownerUserId, operation.id), clone(operation));
  }

  async deleteOperation(ownerUserId: string, operationId: string) {
    this.operations.delete(teaLabOperationStorageKey(ownerUserId, operationId));
  }

  async deleteSessionData(ownerUserId: string, sessionId: string) {
    this.drafts.delete(teaLabDraftStorageKey(ownerUserId, sessionId));
    for (const [key, operation] of this.operations) {
      if (operation.ownerUserId === ownerUserId && operation.sessionId === sessionId) this.operations.delete(key);
    }
  }
}

function idFactory(...ids: string[]) {
  let index = 0;
  return () => ids[index++] ?? `generated-${index}`;
}

function clockFactory() {
  let tick = 0;
  return () => new Date(Date.UTC(2026, 7, 3, 12, 0, 0, tick++)).toISOString();
}

function tastingDraft(ownerUserId = "owner-1", sessionId = "session-1", cardId = "card-1"): TeaLabSoloDraft {
  const base = createSoloTeaDraft(ownerUserId, idFactory(sessionId, cardId), () => "2026-08-03T12:00:00.000Z");
  return {
    ...base,
    tea: {
      kind: "personal",
      personalTeaId: `personal-${sessionId}`,
      name: "Moonlight White",
      origin: "Yunnan"
    },
    tasting: {
      firstImpression: "Soft apricot",
      descriptorIds: ["descriptor-1"],
      intensity: "clear",
      rating: 4,
      personalNotes: "Private steep notes"
    }
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("Tea Lab offline outbox", () => {
  it("refreshes server read models after completion, archive, or deletion synchronization", () => {
    const base = {
      schemaVersion: 1 as const,
      id: "operation-1",
      ownerUserId: "owner-1",
      sessionId: "session-1",
      payload: null,
      state: "pending" as const,
      sequence: 1,
      expectedRevision: 2,
      attempts: 0,
      lastErrorCode: null,
      createdAt: "2026-08-03T12:00:00.000Z",
      updatedAt: "2026-08-03T12:00:00.000Z"
    };

    expect(shouldRefreshTeaLabReadModels([{ ...base, kind: "complete" }])).toBe(true);
    expect(shouldRefreshTeaLabReadModels([{ ...base, kind: "archive", payload: { archived: true } }])).toBe(true);
    expect(shouldRefreshTeaLabReadModels([{ ...base, kind: "delete", expectedRevision: null }])).toBe(true);
    expect(shouldRefreshTeaLabReadModels([])).toBe(false);
  });

  it("debounces meaningful edits and persists the latest complete draft", async () => {
    vi.useFakeTimers();
    const saved: TeaLabSoloDraft[] = [];
    const autosave = createTeaLabDraftAutosave(async draft => { saved.push(draft); }, 400);
    const first = tastingDraft();
    const second = { ...first, tasting: { ...first.tasting, personalNotes: "Latest" } };

    autosave.schedule(first);
    autosave.schedule(second);
    await vi.advanceTimersByTimeAsync(399);
    expect(saved).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);

    expect(saved).toHaveLength(1);
    expect(saved[0].tasting.personalNotes).toBe("Latest");
  });

  it("creates stable session/card IDs and owner-qualified storage keys", () => {
    const draft = createSoloTeaDraft("owner-1", idFactory("session-1", "card-1"), () => "2026-08-03T12:00:00.000Z");

    expect(draft).toMatchObject({ ownerUserId: "owner-1", sessionId: "session-1", cardId: "card-1", serverRevision: 0 });
    expect(teaLabDraftStorageKey("owner-1", "session-1")).toBe("owner-1:session-1");
    expect(teaLabDraftStorageKey("owner-2", "session-1")).toBe("owner-2:session-1");
    expect(teaLabOperationStorageKey("owner-1", "operation-1")).toBe("owner-1:operation-1");
  });

  it("coalesces an unsent draft save while keeping its stable operation ID", async () => {
    const store = new MemoryTeaLabStore();
    const clock = clockFactory();
    const first = await queueTeaLabDraftSave(store, tastingDraft(), idFactory("operation-1"), clock);
    const changed = {
      ...first.draft,
      tasting: { ...first.draft.tasting, personalNotes: "Latest private notes" }
    };
    const second = await queueTeaLabDraftSave(store, changed, idFactory("operation-2"), clock);
    const operations = await store.listOperations("owner-1");

    expect(second.operation?.id).toBe("operation-1");
    expect(operations).toHaveLength(1);
    expect(operations[0].kind).toBe("save");
    expect(operations[0].payload).toMatchObject({ tasting: { personalNotes: "Latest private notes" } });
  });

  it("rebases a queued UI snapshot onto the latest confirmed server revision", async () => {
    const store = new MemoryTeaLabStore();
    const clock = clockFactory();
    const staleUiDraft = tastingDraft();
    await queueTeaLabDraftSave(store, staleUiDraft, idFactory("save-1"), clock);
    await syncTeaLabOutbox(store, "owner-1", async operation => ({
      outcome: "success",
      session: { id: operation.sessionId, status: "in_progress", revision: 1, completedAt: null, archivedAt: null }
    }), clock);

    const changedStaleSnapshot = {
      ...staleUiDraft,
      tasting: { ...staleUiDraft.tasting, personalNotes: "Typed before the prior response returned" }
    };
    await queueTeaLabDraftSave(store, changedStaleSnapshot, idFactory("save-2"), clock);
    const sent: Array<number | null> = [];
    await syncTeaLabOutbox(store, "owner-1", async operation => {
      sent.push(operation.expectedRevision);
      return {
        outcome: "success",
        session: { id: operation.sessionId, status: "in_progress", revision: 2, completedAt: null, archivedAt: null }
      };
    }, clock);

    expect(sent).toEqual([1]);
    expect(await store.getDraft("owner-1", "session-1")).toMatchObject({
      serverRevision: 2,
      tasting: { personalNotes: "Typed before the prior response returned" }
    });
  });

  it("serializes background synchronization with a newer autosave from the same owner", async () => {
    const store = new MemoryTeaLabStore();
    const clock = clockFactory();
    const staleUiDraft = tastingDraft();
    await queueTeaLabDraftSave(store, staleUiDraft, idFactory("save-1"), clock);

    let releaseTransport: () => void = () => undefined;
    const transportPaused = new Promise<void>(resolve => { releaseTransport = resolve; });
    let markTransportStarted: () => void = () => undefined;
    const transportStarted = new Promise<void>(resolve => { markTransportStarted = resolve; });
    const firstSync = syncTeaLabOutbox(store, "owner-1", async operation => {
      markTransportStarted();
      await transportPaused;
      return {
        outcome: "success",
        session: { id: operation.sessionId, status: "in_progress", revision: 1, completedAt: null, archivedAt: null }
      };
    }, clock);
    await transportStarted;

    const changedWhileSyncing = {
      ...staleUiDraft,
      tasting: { ...staleUiDraft.tasting, personalNotes: "Typed while the prior save was syncing" }
    };
    let autosaveFinished = false;
    const autosave = queueTeaLabDraftSave(store, changedWhileSyncing, idFactory("save-2"), clock)
      .then(result => { autosaveFinished = true; return result; });
    await Promise.resolve();
    expect(autosaveFinished).toBe(false);

    releaseTransport();
    await firstSync;
    await autosave;

    const sent: Array<number | null> = [];
    await syncTeaLabOutbox(store, "owner-1", async operation => {
      sent.push(operation.expectedRevision);
      return {
        outcome: "success",
        session: { id: operation.sessionId, status: "in_progress", revision: 2, completedAt: null, archivedAt: null }
      };
    }, clock);

    expect(sent).toEqual([1]);
    expect(await store.getDraft("owner-1", "session-1")).toMatchObject({
      serverRevision: 2,
      tasting: { personalNotes: "Typed while the prior save was syncing" }
    });
  });

  it("requeues an explicitly chosen device copy against the reviewed server revision", async () => {
    const store = new MemoryTeaLabStore();
    const draft = { ...tastingDraft(), serverRevision: 2 };
    await store.putDraft(draft);
    await store.putOperation({
      ...createTeaLabOperationBase(draft, 1, idFactory("conflict-1"), () => "2026-08-03T12:00:00.000Z"),
      kind: "save",
      payload: {
        cardId: draft.cardId,
        tea: draft.tea!,
        brewing: draft.brewing,
        tasting: draft.tasting
      },
      expectedRevision: 2,
      attempts: 1,
      state: "conflict",
      lastErrorCode: "revision_conflict"
    });

    await retryTeaLabConflictWithDeviceDraft(store, draft, 3, idFactory("retry-1"), clockFactory());
    const operations = await store.listOperations("owner-1");

    expect(operations).toHaveLength(1);
    expect(operations[0]).toMatchObject({ id: "retry-1", kind: "save", state: "pending", expectedRevision: null });
    expect(await store.getDraft("owner-1", "session-1")).toMatchObject({ serverRevision: 3 });
  });

  it("saves and completes a reviewed device copy after resolving its revision conflict", async () => {
    const store = new MemoryTeaLabStore();
    const draft = { ...tastingDraft(), serverRevision: 2 };
    await store.putDraft(draft);
    await store.putOperation({
      ...createTeaLabOperationBase(draft, 1, idFactory("conflict-1"), () => "2026-08-03T12:00:00.000Z"),
      kind: "save",
      payload: {
        cardId: draft.cardId,
        tea: draft.tea!,
        brewing: draft.brewing,
        tasting: draft.tasting
      },
      expectedRevision: 2,
      attempts: 1,
      state: "conflict",
      lastErrorCode: "revision_conflict"
    });

    await retryTeaLabConflictWithDeviceDraftForCompletion(
      store,
      draft,
      3,
      idFactory("retry-save", "retry-complete"),
      clockFactory()
    );

    expect((await store.listOperations("owner-1")).map(operation => operation.kind)).toEqual(["save", "complete"]);
    expect(await store.getDraft("owner-1", "session-1")).toMatchObject({
      serverRevision: 3,
      status: "completion_pending"
    });

    let revision = 3;
    const sent: Array<{ kind: string; expectedRevision: number | null }> = [];
    await syncTeaLabOutbox(store, "owner-1", async operation => {
      sent.push({ kind: operation.kind, expectedRevision: operation.expectedRevision });
      revision += 1;
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
    }, clockFactory());

    expect(sent).toEqual([
      { kind: "save", expectedRevision: 3 },
      { kind: "complete", expectedRevision: 4 }
    ]);
    expect(await store.getDraft("owner-1", "session-1")).toMatchObject({
      serverRevision: 5,
      status: "completed"
    });
  });

  it("keeps an unnamed manual tea on the device without queuing an invalid server save", async () => {
    const store = new MemoryTeaLabStore();
    const draft = {
      ...tastingDraft(),
      tea: { kind: "personal" as const, personalTeaId: "manual-tea-1", name: "   ", origin: "" }
    };

    const result = await queueTeaLabDraftSave(store, draft, idFactory("save-1"), clockFactory());

    expect(result.operation).toBeNull();
    expect(await store.getDraft("owner-1", "session-1")).toMatchObject({ tea: { name: "   " } });
    expect(await store.listOperations("owner-1")).toEqual([]);
  });

  it("queues save before completion and injects each confirmed server revision", async () => {
    const store = new MemoryTeaLabStore();
    const clock = clockFactory();
    await queueTeaLabCompletion(store, tastingDraft(), idFactory("save-1", "complete-1"), clock);
    const sent: Array<{ kind: string; expectedRevision: number | null }> = [];
    const transport: TeaLabOperationTransport = vi.fn(async operation => {
      sent.push({ kind: operation.kind, expectedRevision: operation.expectedRevision });
      return operation.kind === "save"
        ? { outcome: "success" as const, session: { id: operation.sessionId, status: "in_progress", revision: 1, completedAt: null, archivedAt: null } }
        : { outcome: "success" as const, session: { id: operation.sessionId, status: "completed", revision: 2, completedAt: "2026-08-03T12:05:00.000Z", archivedAt: null } };
    });

    const summary = await syncTeaLabOutbox(store, "owner-1", transport, clock);
    const savedDraft = await store.getDraft("owner-1", "session-1");

    expect(sent).toEqual([
      { kind: "save", expectedRevision: 0 },
      { kind: "complete", expectedRevision: 1 }
    ]);
    expect(summary).toMatchObject({ attempted: 2, succeeded: 2, pending: 0 });
    expect(await store.listOperations("owner-1")).toEqual([]);
    expect(savedDraft).toMatchObject({ serverRevision: 2, status: "completed" });
  });

  it("keeps a corrected completed card completed after saving", async () => {
    const store = new MemoryTeaLabStore();
    const completed = { ...tastingDraft(), status: "completed" as const, serverRevision: 2 };
    const corrected = {
      ...completed,
      tasting: { ...completed.tasting, personalNotes: "Corrected private notes" }
    };
    await queueTeaLabDraftSave(store, corrected, idFactory("correction-1"), clockFactory());

    await syncTeaLabOutbox(store, "owner-1", async operation => ({
      outcome: "success",
      session: {
        id: operation.sessionId,
        status: "completed",
        revision: 3,
        completedAt: "2026-08-03T12:05:00.000Z",
        archivedAt: null
      }
    }), clockFactory());

    expect(await store.getDraft("owner-1", "session-1")).toMatchObject({
      serverRevision: 3,
      status: "completed",
      tasting: { personalNotes: "Corrected private notes" }
    });
  });

  it("replays the same operation and revision after an unconfirmed network attempt", async () => {
    const store = new MemoryTeaLabStore();
    const clock = clockFactory();
    await queueTeaLabDraftSave(store, tastingDraft(), idFactory("operation-1"), clock);
    const firstTransport: TeaLabOperationTransport = vi.fn(async () => ({ outcome: "retry" as const, code: "network_unavailable" }));

    await syncTeaLabOutbox(store, "owner-1", firstTransport, clock);
    const retained = (await store.listOperations("owner-1"))[0];

    expect(retained).toMatchObject({ id: "operation-1", expectedRevision: 0, attempts: 1, state: "pending" });

    const secondTransport: TeaLabOperationTransport = vi.fn(async operation => ({
      outcome: "success" as const,
      session: { id: operation.sessionId, status: "in_progress", revision: 1, completedAt: null, archivedAt: null }
    }));
    await syncTeaLabOutbox(store, "owner-1", secondTransport, clock);

    expect(secondTransport).toHaveBeenCalledWith(expect.objectContaining({ id: "operation-1", expectedRevision: 0, attempts: 2 }));
    expect(await store.listOperations("owner-1")).toEqual([]);
  });

  it("retains operations across expired authentication and retries after sign-in", async () => {
    const store = new MemoryTeaLabStore();
    const clock = clockFactory();
    await queueTeaLabDraftSave(store, tastingDraft(), idFactory("operation-1"), clock);

    const first = await syncTeaLabOutbox(store, "owner-1", async () => ({ outcome: "authentication", code: "authentication_required" }), clock);
    expect(first.authenticationRequired).toBe(true);
    expect((await store.listOperations("owner-1"))[0]).toMatchObject({ state: "authentication", expectedRevision: 0 });

    await syncTeaLabOutbox(store, "owner-1", async operation => ({
      outcome: "success",
      session: { id: operation.sessionId, status: "in_progress", revision: 1, completedAt: null, archivedAt: null }
    }), clock);
    expect(await store.listOperations("owner-1")).toEqual([]);
  });

  it("blocks only the conflicted session and continues another owner's in-scope session", async () => {
    const store = new MemoryTeaLabStore();
    const clock = clockFactory();
    await queueTeaLabCompletion(store, tastingDraft("owner-1", "session-1", "card-1"), idFactory("save-1", "complete-1"), clock);
    await queueTeaLabDraftSave(store, tastingDraft("owner-1", "session-2", "card-2"), idFactory("save-2"), clock);
    const sent: string[] = [];

    const summary = await syncTeaLabOutbox(store, "owner-1", async operation => {
      sent.push(`${operation.sessionId}:${operation.kind}`);
      if (operation.sessionId === "session-1") return { outcome: "conflict", code: "revision_conflict" };
      return {
        outcome: "success",
        session: { id: operation.sessionId, status: "in_progress", revision: 1, completedAt: null, archivedAt: null }
      };
    }, clock);

    expect(sent).toEqual(["session-1:save", "session-2:save"]);
    expect(summary).toMatchObject({ succeeded: 1, conflicts: 1 });
    expect((await store.listOperations("owner-1")).filter(operation => operation.sessionId === "session-1")).toHaveLength(2);
  });

  it("clears only the owning user's session after confirmed deletion", async () => {
    const store = new MemoryTeaLabStore();
    const clock = clockFactory();
    const ownerDraft = { ...tastingDraft("owner-1"), serverRevision: 2 };
    const otherDraft = { ...tastingDraft("owner-2"), serverRevision: 2 };
    await store.putDraft(ownerDraft);
    await store.putDraft(otherDraft);
    await queueTeaLabDeletion(store, ownerDraft, idFactory("delete-1"), clock);

    await syncTeaLabOutbox(store, "owner-1", async () => ({ outcome: "success" }), clock);

    expect(await store.getDraft("owner-1", "session-1")).toBeNull();
    expect(await store.getDraft("owner-2", "session-1")).not.toBeNull();
  });

  it("archives a completed session through the revision-checked outbox and keeps its seal evidence", async () => {
    const store = new MemoryTeaLabStore();
    const draft = { ...tastingDraft(), status: "completed" as const, serverRevision: 2 };
    await store.putDraft(draft);
    await queueTeaLabArchive(store, draft, true, idFactory("archive-1"), clockFactory());
    const sent: Array<{ kind: string; expectedRevision: number | null }> = [];

    await syncTeaLabOutbox(store, "owner-1", async operation => {
      sent.push({ kind: operation.kind, expectedRevision: operation.expectedRevision });
      return {
        outcome: "success",
        session: { id: operation.sessionId, status: "completed", revision: 3, completedAt: "2026-08-03T12:05:00.000Z", archivedAt: "2026-08-03T12:10:00.000Z" }
      };
    }, clockFactory());

    expect(sent).toEqual([{ kind: "archive", expectedRevision: 2 }]);
    expect(await store.getDraft("owner-1", "session-1")).toMatchObject({ archived: true, status: "completed", serverRevision: 3 });
  });

  it("removes a never-sent local draft without creating a server deletion", async () => {
    const store = new MemoryTeaLabStore();
    const draft = tastingDraft();
    await store.putDraft(draft);

    const operation = await queueTeaLabDeletion(store, draft, idFactory("delete-1"), clockFactory());

    expect(operation).toBeNull();
    expect(await store.getDraft("owner-1", "session-1")).toBeNull();
    expect(await store.listOperations("owner-1")).toEqual([]);
  });

  it("reports saving, device-only, authentication, and conflict states accurately", () => {
    const base = {
      schemaVersion: 1 as const,
      id: "operation-1",
      ownerUserId: "owner-1",
      sessionId: "session-1",
      kind: "complete" as const,
      payload: null,
      state: "pending" as const,
      sequence: 1,
      expectedRevision: null,
      attempts: 0,
      lastErrorCode: null,
      createdAt: "2026-08-03T12:00:00.000Z",
      updatedAt: "2026-08-03T12:00:00.000Z"
    };

    expect(resolveTeaLabSaveIndicator([], true)).toEqual({ state: "saved", label: "Saved." });
    expect(resolveTeaLabSaveIndicator([base], false).state).toBe("device");
    expect(resolveTeaLabSaveIndicator([{ ...base, state: "syncing" }], true).state).toBe("saving");
    expect(resolveTeaLabSaveIndicator([{ ...base, state: "authentication" }], true).state).toBe("authentication");
    expect(resolveTeaLabSaveIndicator([{ ...base, state: "conflict" }], true).state).toBe("attention");
  });
});
