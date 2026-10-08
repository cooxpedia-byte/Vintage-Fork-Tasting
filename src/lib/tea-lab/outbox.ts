"use client";

import { authenticatedFetch } from "@/lib/authenticated-fetch";
import { listenForConnectionRetry } from "@/lib/connection-health";
import type { TeaLabSessionResult } from "@/lib/tea-lab/api";
import { chooseDraftForHydration } from "@/lib/tea-lab/lab";
import { teaLabBrewingValidationError } from "@/lib/tea-lab/lab-flow";
import {
  createTeaLabOperationBase,
  type TeaLabArchiveOperation,
  type TeaLabCompleteOperation,
  type TeaLabDeleteOperation,
  type TeaLabOutboxOperation,
  type TeaLabSaveOperation,
  type TeaLabSoloDraft
} from "@/lib/tea-lab/offline";
import { compareTeaLabOperations, type TeaLabOfflineStore } from "@/lib/tea-lab/offline-store";

type IdFactory = () => string;
type Clock = () => string;

const defaultIdFactory: IdFactory = () => crypto.randomUUID();
const defaultClock: Clock = () => new Date().toISOString();
const ownerMutationChains = new Map<string, Promise<void>>();
const ownerSyncChains = new Map<string, Promise<void>>();

async function withCrossTabOwnerLock<T>(name: string, work: () => Promise<T>): Promise<T> {
  if (typeof navigator === "undefined" || !navigator.locks) return work();
  return navigator.locks.request(name, { mode: "exclusive" }, work);
}

async function withOwnerLock<T>(
  name: string,
  chains: Map<string, Promise<void>>,
  work: () => Promise<T>
): Promise<T> {
  const previous = chains.get(name) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(() => withCrossTabOwnerLock(name, work));
  const settled = current.then(() => undefined, () => undefined);
  chains.set(name, settled);
  try {
    return await current;
  } finally {
    if (chains.get(name) === settled) chains.delete(name);
  }
}

function withOwnerMutationLock<T>(ownerUserId: string, work: () => Promise<T>): Promise<T> {
  return withOwnerLock(`tea-lab:${ownerUserId}`, ownerMutationChains, work);
}

export type TeaLabTransportResult =
  | { outcome: "success"; session?: TeaLabSessionResult }
  | { outcome: "authentication"; code: string }
  | { outcome: "conflict"; code: string }
  | { outcome: "rejected"; code: string }
  | { outcome: "retry"; code: string };

export type TeaLabOperationTransport = (operation: TeaLabOutboxOperation) => Promise<TeaLabTransportResult>;

export type TeaLabSyncSummary = {
  attempted: number;
  succeeded: number;
  pending: number;
  authenticationRequired: boolean;
  conflicts: number;
  failed: number;
};

export function shouldRefreshTeaLabReadModels(operations: TeaLabOutboxOperation[]): boolean {
  return operations.some(operation => operation.kind === "complete" || operation.kind === "archive" || operation.kind === "delete");
}

export function createTeaLabDraftAutosave(
  save: (draft: TeaLabSoloDraft) => Promise<unknown>,
  delayMs = 400,
  onError: (error: unknown) => void = () => undefined
) {
  let pending: TeaLabSoloDraft | null = null;
  let latestScheduledVersion = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let chain: Promise<unknown> = Promise.resolve();

  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (!pending) return chain;
    const draft = pending;
    const version = latestScheduledVersion;
    pending = null;
    const work = chain.catch(() => undefined).then(async () => {
      try {
        return await save(draft);
      } catch (error) {
        if (version === latestScheduledVersion && !pending) pending = draft;
        throw error;
      }
    });
    chain = work;
    return work;
  };

  const schedule = (draft: TeaLabSoloDraft) => {
    pending = draft;
    latestScheduledVersion += 1;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { void flush().catch(onError); }, delayMs);
  };

  return {
    schedule,
    flush,
    dispose: flush
  };
}

function nextSequence(operations: TeaLabOutboxOperation[]): number {
  return operations.reduce((highest, operation) => Math.max(highest, operation.sequence), 0) + 1;
}

function snapshotSavePayload(draft: TeaLabSoloDraft): TeaLabSaveOperation["payload"] {
  if (!draft.tea || (draft.tea.kind === "personal" && !draft.tea.name.trim())) {
    throw new Error("Choose a tea before queuing a server save.");
  }
  return {
    cardId: draft.cardId,
    tea: draft.tea.kind === "personal" ? {
      ...draft.tea,
      producer: optionalSaveText(draft.tea.producer),
      origin: optionalSaveText(draft.tea.origin),
      teaType: optionalSaveText(draft.tea.teaType),
      cultivar: optionalSaveText(draft.tea.cultivar),
      harvest: optionalSaveText(draft.tea.harvest),
      productIdentifier: optionalSaveText(draft.tea.productIdentifier),
      lotCode: optionalSaveText(draft.tea.lotCode)
    } : { ...draft.tea },
    brewing: {
      ...draft.brewing,
      waterSource: optionalSaveText(draft.brewing.waterSource),
      vessel: optionalSaveText(draft.brewing.vessel),
      preparationNotes: optionalSaveText(draft.brewing.preparationNotes),
      stages: draft.brewing.stages?.map(stage => ({ ...stage, notes: optionalSaveText(stage.notes) }))
    },
    tasting: { ...draft.tasting, descriptorIds: [...draft.tasting.descriptorIds] }
  };
}

function optionalSaveText(value: string | null | undefined): string | null | undefined {
  return typeof value === "string" ? value.trim() || null : value;
}

function saveOperationForDraft(
  draft: TeaLabSoloDraft,
  operations: TeaLabOutboxOperation[],
  idFactory: IdFactory,
  clock: Clock
): TeaLabSaveOperation {
  const existing = operations.find((operation): operation is TeaLabSaveOperation =>
    operation.sessionId === draft.sessionId
      && operation.kind === "save"
      && operation.state === "pending"
      && operation.attempts === 0
      && operation.expectedRevision === null
  );
  const now = clock();
  if (existing) return { ...existing, payload: snapshotSavePayload(draft), updatedAt: now };
  return {
    ...createTeaLabOperationBase(draft, nextSequence(operations), idFactory, () => now),
    kind: "save",
    payload: snapshotSavePayload(draft)
  };
}

function updatedDraft(draft: TeaLabSoloDraft, clock: Clock, status = draft.status): TeaLabSoloDraft {
  return { ...draft, status, updatedAt: clock() };
}

async function rebaseDraftOnConfirmedServerState(store: TeaLabOfflineStore, draft: TeaLabSoloDraft) {
  const stored = await store.getDraft(draft.ownerUserId, draft.sessionId);
  if (!stored || stored.serverRevision <= draft.serverRevision) return draft;
  return {
    ...draft,
    serverRevision: stored.serverRevision,
    status: stored.status === "completed" ? "completed" : draft.status,
    lastSyncedAt: stored.lastSyncedAt
  };
}

async function persistTeaLabDraftUnlocked(store: TeaLabOfflineStore, draft: TeaLabSoloDraft, clock: Clock) {
  const rebased = await rebaseDraftOnConfirmedServerState(store, draft);
  const next = updatedDraft(rebased, clock, rebased.tea && rebased.status === "draft" ? "in_progress" : rebased.status);
  await store.putDraft(next);
  return next;
}

export async function persistTeaLabDraft(store: TeaLabOfflineStore, draft: TeaLabSoloDraft, clock: Clock = defaultClock) {
  return withOwnerMutationLock(draft.ownerUserId, () => persistTeaLabDraftUnlocked(store, draft, clock));
}

export async function hydrateTeaLabDraftFromServer(
  store: TeaLabOfflineStore,
  serverDraft: TeaLabSoloDraft,
  shouldPreserveLocal: () => boolean = () => false
): Promise<TeaLabSoloDraft | null> {
  return withOwnerMutationLock(serverDraft.ownerUserId, async () => {
    const [local, operations] = await Promise.all([
      store.getDraft(serverDraft.ownerUserId, serverDraft.sessionId),
      store.listOperations(serverDraft.ownerUserId)
    ]);
    if (shouldPreserveLocal()) return local;
    const hydrated = chooseDraftForHydration(local, serverDraft,
      operations.some(operation => operation.sessionId === serverDraft.sessionId));
    if (hydrated !== local) await store.putDraft(hydrated);
    return hydrated;
  });
}

async function queueTeaLabDraftSaveUnlocked(
  store: TeaLabOfflineStore,
  draft: TeaLabSoloDraft,
  idFactory: IdFactory,
  clock: Clock
) {
  if (!draft.tea || (draft.tea.kind === "personal" && !draft.tea.name.trim()) || teaLabBrewingValidationError(draft.brewing)) {
    return { draft: await persistTeaLabDraftUnlocked(store, draft, clock), operation: null };
  }
  const rebased = await rebaseDraftOnConfirmedServerState(store, draft);
  const operations = await store.listOperations(rebased.ownerUserId);
  const nextDraft = updatedDraft(rebased, clock, rebased.status === "draft" ? "in_progress" : rebased.status);
  const operation = saveOperationForDraft(nextDraft, operations, idFactory, clock);
  await store.saveDraftAndOperations(nextDraft, [operation]);
  return { draft: nextDraft, operation };
}

export async function queueTeaLabDraftSave(
  store: TeaLabOfflineStore,
  draft: TeaLabSoloDraft,
  idFactory: IdFactory = defaultIdFactory,
  clock: Clock = defaultClock
) {
  return withOwnerMutationLock(draft.ownerUserId, () => queueTeaLabDraftSaveUnlocked(store, draft, idFactory, clock));
}

async function queueTeaLabCompletionUnlocked(
  store: TeaLabOfflineStore,
  draft: TeaLabSoloDraft,
  idFactory: IdFactory,
  clock: Clock
) {
  if (!draft.tea || (draft.tea.kind === "personal" && !draft.tea.name.trim())) {
    throw new Error("Choose a tea before completing this tasting.");
  }
  if (!draft.tasting.rating) throw new Error("Add a rating before completing this tasting.");
  const brewingError = teaLabBrewingValidationError(draft.brewing);
  if (brewingError) throw new Error(brewingError);
  const rebased = await rebaseDraftOnConfirmedServerState(store, draft);
  const operations = await store.listOperations(rebased.ownerUserId);
  const nextDraft = updatedDraft(rebased, clock, "completion_pending");
  const saveOperation = saveOperationForDraft(nextDraft, operations, idFactory, clock);
  const withSave = operations.some(operation => operation.id === saveOperation.id)
    ? operations.map(operation => operation.id === saveOperation.id ? saveOperation : operation)
    : [...operations, saveOperation];
  const existingCompletion = withSave.find((operation): operation is TeaLabCompleteOperation =>
    operation.sessionId === draft.sessionId && operation.kind === "complete"
  );
  const completionOperation: TeaLabCompleteOperation = existingCompletion
    ? existingCompletion.attempts === 0 && existingCompletion.expectedRevision === null && existingCompletion.sequence < saveOperation.sequence
      ? { ...existingCompletion, sequence: nextSequence(withSave), updatedAt: clock() }
      : existingCompletion
    : {
    ...createTeaLabOperationBase(nextDraft, nextSequence(withSave), idFactory, clock),
    kind: "complete",
    payload: null
  };
  await store.saveDraftAndOperations(nextDraft, [saveOperation, completionOperation]);
  return { draft: nextDraft, saveOperation, completionOperation };
}

export async function queueTeaLabCompletion(
  store: TeaLabOfflineStore,
  draft: TeaLabSoloDraft,
  idFactory: IdFactory = defaultIdFactory,
  clock: Clock = defaultClock
) {
  return withOwnerMutationLock(draft.ownerUserId, () => queueTeaLabCompletionUnlocked(store, draft, idFactory, clock));
}

async function retryTeaLabConflictWithDeviceDraftUnlocked(
  store: TeaLabOfflineStore,
  draft: TeaLabSoloDraft,
  latestServerRevision: number,
  idFactory: IdFactory,
  clock: Clock
) {
  if (!Number.isInteger(latestServerRevision) || latestServerRevision <= draft.serverRevision) {
    throw new Error("The latest server version is still loading. Try again in a moment.");
  }
  const completionPending = draft.status === "completion_pending";
  const rebased = {
    ...updatedDraft(draft, clock, completionPending ? "in_progress" : draft.status),
    serverRevision: latestServerRevision,
    lastSyncedAt: null
  };
  await store.replaceSessionOperations(rebased, []);
  return completionPending
    ? queueTeaLabCompletionUnlocked(store, rebased, idFactory, clock)
    : queueTeaLabDraftSaveUnlocked(store, rebased, idFactory, clock);
}

export async function retryTeaLabConflictWithDeviceDraft(
  store: TeaLabOfflineStore,
  draft: TeaLabSoloDraft,
  latestServerRevision: number,
  idFactory: IdFactory = defaultIdFactory,
  clock: Clock = defaultClock
) {
  return withOwnerMutationLock(draft.ownerUserId, () => retryTeaLabConflictWithDeviceDraftUnlocked(
    store,
    draft,
    latestServerRevision,
    idFactory,
    clock
  ));
}

export async function retryTeaLabConflictWithDeviceDraftForCompletion(
  store: TeaLabOfflineStore,
  draft: TeaLabSoloDraft,
  latestServerRevision: number,
  idFactory: IdFactory = defaultIdFactory,
  clock: Clock = defaultClock
) {
  return withOwnerMutationLock(draft.ownerUserId, async () => {
    const retried = await retryTeaLabConflictWithDeviceDraftUnlocked(
      store,
      draft,
      latestServerRevision,
      idFactory,
      clock
    );
    return draft.status === "completion_pending"
      ? retried
      : queueTeaLabCompletionUnlocked(store, retried.draft, idFactory, clock);
  });
}

async function retryTeaLabBlockedDeviceDraftUnlocked(
  store: TeaLabOfflineStore,
  draft: TeaLabSoloDraft,
  latestServerRevision: number,
  complete: boolean,
  idFactory: IdFactory,
  clock: Clock
) {
  if (!Number.isInteger(latestServerRevision) || latestServerRevision < 0) {
    throw new Error("The latest server version could not be checked.");
  }
  const rebased = {
    ...updatedDraft(draft, clock, "in_progress"),
    serverRevision: Math.max(draft.serverRevision, latestServerRevision),
    lastSyncedAt: null
  };
  await store.replaceSessionOperations(rebased, []);
  return complete
    ? queueTeaLabCompletionUnlocked(store, rebased, idFactory, clock)
    : queueTeaLabDraftSaveUnlocked(store, rebased, idFactory, clock);
}

export async function retryTeaLabBlockedDeviceDraft(
  store: TeaLabOfflineStore,
  draft: TeaLabSoloDraft,
  latestServerRevision: number,
  complete: boolean,
  idFactory: IdFactory = defaultIdFactory,
  clock: Clock = defaultClock
) {
  return withOwnerMutationLock(draft.ownerUserId, () => retryTeaLabBlockedDeviceDraftUnlocked(
    store,
    draft,
    latestServerRevision,
    complete,
    idFactory,
    clock
  ));
}

export async function queueTeaLabArchive(
  store: TeaLabOfflineStore,
  draft: TeaLabSoloDraft,
  archived: boolean,
  idFactory: IdFactory = defaultIdFactory,
  clock: Clock = defaultClock
) {
  return withOwnerMutationLock(draft.ownerUserId, async () => {
    const rebased = await rebaseDraftOnConfirmedServerState(store, draft);
    const operations = await store.listOperations(rebased.ownerUserId);
    const nextDraft = { ...updatedDraft(rebased, clock), archived };
    const operation: TeaLabArchiveOperation = {
      ...createTeaLabOperationBase(nextDraft, nextSequence(operations), idFactory, clock),
      kind: "archive",
      payload: { archived }
    };
    await store.saveDraftAndOperations(nextDraft, [operation]);
    return { draft: nextDraft, operation };
  });
}

export async function queueTeaLabDeletion(
  store: TeaLabOfflineStore,
  draft: TeaLabSoloDraft,
  idFactory: IdFactory = defaultIdFactory,
  clock: Clock = defaultClock
) {
  return withOwnerMutationLock(draft.ownerUserId, async () => {
    const rebased = await rebaseDraftOnConfirmedServerState(store, draft);
    const operations = await store.listOperations(rebased.ownerUserId);
    const sessionOperations = operations.filter(operation => operation.sessionId === rebased.sessionId);
    if (rebased.serverRevision === 0 && sessionOperations.every(operation => operation.attempts === 0)) {
      await store.deleteSessionData(rebased.ownerUserId, rebased.sessionId);
      return null;
    }
    const existing = operations.find((operation): operation is TeaLabDeleteOperation =>
      operation.sessionId === draft.sessionId && operation.kind === "delete"
    );
    const operation: TeaLabDeleteOperation = existing ?? {
      ...createTeaLabOperationBase(rebased, nextSequence(operations), idFactory, clock),
      kind: "delete",
      payload: null
    };
    await store.replaceSessionOperations(updatedDraft(rebased, clock), [operation]);
    return operation;
  });
}

function safeCode(value: unknown, fallback: string): string {
  return typeof value === "string" && /^[a-z0-9_]{1,80}$/.test(value) ? value : fallback;
}

async function withTeaLabRequestDeadline<T>(work: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      const error = new Error("The tasting service took too long to respond. Try syncing again.");
      error.name = "TimeoutError";
      controller.abort(error);
      reject(error);
    }, 30000);
  });
  try {
    return await Promise.race([work(controller.signal), deadline]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function responseBody(response: Response): Promise<Record<string, unknown>> {
  const value = await response.json().catch(() => null);
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function sessionFromBody(body: Record<string, unknown>): TeaLabSessionResult | undefined {
  if (!body.session || typeof body.session !== "object") return undefined;
  const session = body.session as Record<string, unknown>;
  if (typeof session.id !== "string" || typeof session.status !== "string" || typeof session.revision !== "number") return undefined;
  return {
    id: session.id,
    status: session.status,
    revision: session.revision,
    completedAt: typeof session.completedAt === "string" ? session.completedAt : null,
    archivedAt: typeof session.archivedAt === "string" ? session.archivedAt : null
  };
}

export async function fetchTeaLabSessionState(sessionId: string): Promise<TeaLabSessionResult | null> {
  const { response, body } = await withTeaLabRequestDeadline(async signal => {
    const response = await authenticatedFetch(`/api/tea-lab/sessions/${sessionId}`, { method: "GET", signal });
    return { response, body: await responseBody(response) };
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(response.status === 401
    ? "Your session ended. Sign in again before saving this tasting."
    : "The latest saved version could not be checked.");
  const session = sessionFromBody(body);
  if (!session) throw new Error("The latest saved version could not be checked.");
  return session;
}

export const sendTeaLabOperation: TeaLabOperationTransport = async operation => {
  if (operation.kind !== "delete" && operation.expectedRevision === null) {
    return { outcome: "rejected", code: "missing_revision" };
  }
  let method: "PUT" | "POST" | "PATCH" | "DELETE";
  let endpoint = `/api/tea-lab/sessions/${operation.sessionId}`;
  let body: Record<string, unknown>;

  if (operation.kind === "save") {
    method = "PUT";
    body = {
      operationId: operation.id,
      cardId: operation.payload.cardId,
      expectedRevision: operation.expectedRevision,
      tea: operation.payload.tea,
      brewing: operation.payload.brewing,
      tasting: operation.payload.tasting
    };
  } else if (operation.kind === "complete") {
    method = "POST";
    endpoint += "/complete";
    body = { operationId: operation.id, expectedRevision: operation.expectedRevision };
  } else if (operation.kind === "archive") {
    method = "PATCH";
    body = { operationId: operation.id, expectedRevision: operation.expectedRevision, archived: operation.payload.archived };
  } else {
    method = "DELETE";
    body = { operationId: operation.id };
  }

  try {
    const { response, responseData } = await withTeaLabRequestDeadline(async signal => {
      const response = await authenticatedFetch(endpoint, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal
      });
      return { response, responseData: await responseBody(response) };
    });
    const code = safeCode(responseData.code, `http_${response.status}`);
    if (response.ok || (operation.kind === "delete" && response.status === 404 && code === "session_not_found")) {
      if (operation.kind === "delete") return { outcome: "success" };
      const session = sessionFromBody(responseData);
      return session ? { outcome: "success", session } : { outcome: "retry", code: "invalid_response" };
    }
    if (response.status === 401) return { outcome: "authentication", code };
    if (response.status === 409) return { outcome: "conflict", code };
    if (response.status === 408 || response.status === 429 || response.status >= 500) return { outcome: "retry", code };
    return { outcome: "rejected", code };
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      return { outcome: "retry", code: "request_timeout" };
    }
    const message = error instanceof Error ? error.message : "";
    if (message.includes("session ended") || message.includes("sign in again")) {
      return { outcome: "authentication", code: "authentication_required" };
    }
    return { outcome: "retry", code: "network_unavailable" };
  }
};

function withOperationState(
  operation: TeaLabOutboxOperation,
  state: TeaLabOutboxOperation["state"],
  code: string | null,
  clock: Clock
): TeaLabOutboxOperation {
  return { ...operation, state, lastErrorCode: code, updatedAt: clock() };
}

async function materializeExpectedRevision(
  store: TeaLabOfflineStore,
  operation: TeaLabOutboxOperation,
  clock: Clock
): Promise<TeaLabOutboxOperation | null> {
  if (operation.kind === "delete" || operation.expectedRevision !== null) return operation;
  const draft = await store.getDraft(operation.ownerUserId, operation.sessionId);
  const revision = draft?.serverRevision;
  if (revision === undefined || ((operation.kind === "complete" || operation.kind === "archive") && revision < 1)) {
    await store.putOperation(withOperationState(operation, "failed", "missing_server_revision", clock));
    return null;
  }
  const materialized = { ...operation, expectedRevision: revision, updatedAt: clock() };
  await store.putOperation(materialized);
  return materialized;
}

async function applySuccessfulOperation(
  store: TeaLabOfflineStore,
  operation: TeaLabOutboxOperation,
  result: Extract<TeaLabTransportResult, { outcome: "success" }>,
  clock: Clock
) {
  if (operation.kind === "delete") {
    await store.deleteSessionData(operation.ownerUserId, operation.sessionId);
    return;
  }
  if (!result.session) throw new Error("Tea Lab synchronization returned no session.");
  const draft = await store.getDraft(operation.ownerUserId, operation.sessionId);
  if (draft) {
    const pendingArchive = (await store.listOperations(operation.ownerUserId))
      .filter((queued): queued is TeaLabArchiveOperation => queued.sessionId === operation.sessionId && queued.kind === "archive" && queued.id !== operation.id)
      .sort(compareTeaLabOperations).at(-1);
    const status = operation.kind === "complete"
      ? "completed"
      : draft.status === "completion_pending" ? draft.status : result.session.status === "completed" ? "completed" : "in_progress";
    await store.putDraft({
      ...draft,
      serverRevision: result.session.revision,
      status,
      archived: pendingArchive ? pendingArchive.payload.archived : result.session.archivedAt !== null,
      lastSyncedAt: clock()
    });
  }
  await store.deleteOperation(operation.ownerUserId, operation.id);
}

async function syncTeaLabOutboxUnlocked(
  store: TeaLabOfflineStore,
  ownerUserId: string,
  transport: TeaLabOperationTransport,
  clock: Clock
): Promise<TeaLabSyncSummary> {
  const blockedSessions = new Set<string>();
  const processedOperations = new Set<string>();
  let attempted = 0;
  let succeeded = 0;
  let authenticationRequired = false;
  let conflicts = 0;
  let failed = 0;

  while (true) {
    const operation = await withOwnerMutationLock(ownerUserId, async () => {
      const operations = (await store.listOperations(ownerUserId)).sort(compareTeaLabOperations);
      for (const queued of operations) {
        if (queued.ownerUserId !== ownerUserId || processedOperations.has(queued.id) || blockedSessions.has(queued.sessionId)) continue;
        processedOperations.add(queued.id);
        if (queued.state === "conflict" || queued.state === "failed") {
          if (queued.state === "conflict") conflicts += 1;
          else failed += 1;
          blockedSessions.add(queued.sessionId);
          continue;
        }
        const claimed = {
          ...queued,
          state: "syncing" as const,
          attempts: queued.attempts + 1,
          lastErrorCode: null,
          updatedAt: clock()
        };
        await store.putOperation(claimed);
        const materialized = await materializeExpectedRevision(store, claimed, clock);
        if (materialized) return materialized;
        failed += 1;
        blockedSessions.add(queued.sessionId);
      }
      return null;
    });
    if (!operation) break;

    attempted += 1;
    const result = await transport(operation);
    const stop = await withOwnerMutationLock(ownerUserId, async () => {
      const stillQueued = (await store.listOperations(ownerUserId)).some(queued => queued.id === operation.id);
      if (result.outcome === "success") {
        try {
          await applySuccessfulOperation(store, operation, result, clock);
          succeeded += 1;
        } catch {
          if (stillQueued) await store.putOperation(withOperationState(operation, "pending", "invalid_response", clock));
          return true;
        }
        return false;
      }
      if (!stillQueued) return false;
      if (result.outcome === "authentication") {
        await store.putOperation(withOperationState(operation, "authentication", result.code, clock));
        authenticationRequired = true;
        return true;
      }
      if (result.outcome === "conflict" || result.outcome === "rejected") {
        await store.putOperation(withOperationState(operation, result.outcome === "conflict" ? "conflict" : "failed", result.code, clock));
        if (result.outcome === "conflict") conflicts += 1;
        else failed += 1;
        blockedSessions.add(operation.sessionId);
        return false;
      }
      await store.putOperation(withOperationState(operation, "pending", result.code, clock));
      return true;
    });
    if (stop) break;
  }

  const remaining = await store.listOperations(ownerUserId);
  return {
    attempted,
    succeeded,
    pending: remaining.filter(operation => operation.state === "pending" || operation.state === "syncing").length,
    authenticationRequired,
    conflicts,
    failed
  };
}

export async function syncTeaLabOutbox(
  store: TeaLabOfflineStore,
  ownerUserId: string,
  transport: TeaLabOperationTransport = sendTeaLabOperation,
  clock: Clock = defaultClock
): Promise<TeaLabSyncSummary> {
  return withOwnerLock(`tea-lab:sync:${ownerUserId}`, ownerSyncChains, () => syncTeaLabOutboxUnlocked(store, ownerUserId, transport, clock));
}

export function createTeaLabSyncRunner(
  store: TeaLabOfflineStore,
  ownerUserId: string,
  transport: TeaLabOperationTransport = sendTeaLabOperation,
  clock: Clock = defaultClock
) {
  let running: Promise<TeaLabSyncSummary> | null = null;
  return () => {
    if (!running) running = syncTeaLabOutbox(store, ownerUserId, transport, clock).finally(() => { running = null; });
    return running;
  };
}

export function startTeaLabSyncTriggers(run: () => Promise<unknown>) {
  if (typeof window === "undefined" || typeof document === "undefined") return () => undefined;
  const retry = () => { void run(); };
  const foreground = () => { if (document.visibilityState === "visible") retry(); };
  retry();
  window.addEventListener("online", retry);
  document.addEventListener("visibilitychange", foreground);
  const stopConnectionRetry = listenForConnectionRetry(retry);
  return () => {
    window.removeEventListener("online", retry);
    document.removeEventListener("visibilitychange", foreground);
    stopConnectionRetry();
  };
}
