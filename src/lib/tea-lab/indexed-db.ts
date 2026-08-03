"use client";

import type { TeaLabOutboxOperation, TeaLabSoloDraft } from "@/lib/tea-lab/offline";
import {
  teaLabDraftStorageKey,
  teaLabOperationStorageKey,
  type TeaLabOfflineStore
} from "@/lib/tea-lab/offline-store";

const DATABASE_NAME = "vintage-fork-tea-lab";
const DATABASE_VERSION = 1;
const DRAFT_STORE = "drafts";
const OPERATION_STORE = "operations";

type StoredDraft = TeaLabSoloDraft & { storageKey: string };
type StoredOperation = TeaLabOutboxOperation & { storageKey: string };

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result), { once: true });
    request.addEventListener("error", () => reject(request.error ?? new Error("IndexedDB request failed.")), { once: true });
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve(), { once: true });
    transaction.addEventListener("abort", () => reject(transaction.error ?? new Error("IndexedDB transaction was aborted.")), { once: true });
    transaction.addEventListener("error", () => reject(transaction.error ?? new Error("IndexedDB transaction failed.")), { once: true });
  });
}

function assertNamespace(ownerUserId: string, recordId: string) {
  if (!ownerUserId || !recordId) throw new Error("Tea Lab device records require an owner and record identifier.");
}

function removeStorageKey<T extends { storageKey: string }>(record: T): Omit<T, "storageKey"> {
  const { storageKey, ...value } = record;
  void storageKey;
  return value;
}

export class IndexedDbTeaLabOfflineStore implements TeaLabOfflineStore {
  private readonly database: Promise<IDBDatabase>;

  constructor(factory?: IDBFactory) {
    const indexedDbFactory = factory ?? (typeof indexedDB === "undefined" ? null : indexedDB);
    if (!indexedDbFactory) throw new Error("IndexedDB is unavailable on this device.");
    this.database = this.open(indexedDbFactory);
  }

  private open(factory: IDBFactory): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = factory.open(DATABASE_NAME, DATABASE_VERSION);
      request.addEventListener("upgradeneeded", () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(DRAFT_STORE)) {
          const drafts = database.createObjectStore(DRAFT_STORE, { keyPath: "storageKey" });
          drafts.createIndex("owner", "ownerUserId", { unique: false });
        }
        if (!database.objectStoreNames.contains(OPERATION_STORE)) {
          const operations = database.createObjectStore(OPERATION_STORE, { keyPath: "storageKey" });
          operations.createIndex("owner", "ownerUserId", { unique: false });
          operations.createIndex("ownerSession", ["ownerUserId", "sessionId"], { unique: false });
        }
      }, { once: true });
      request.addEventListener("success", () => resolve(request.result), { once: true });
      request.addEventListener("error", () => reject(request.error ?? new Error("Tea Lab device storage could not be opened.")), { once: true });
      request.addEventListener("blocked", () => reject(new Error("Tea Lab device storage upgrade is blocked.")), { once: true });
    });
  }

  async getDraft(ownerUserId: string, sessionId: string): Promise<TeaLabSoloDraft | null> {
    assertNamespace(ownerUserId, sessionId);
    const database = await this.database;
    const transaction = database.transaction(DRAFT_STORE, "readonly");
    const stored = await requestResult(transaction.objectStore(DRAFT_STORE).get(
      teaLabDraftStorageKey(ownerUserId, sessionId)
    ) as IDBRequest<StoredDraft | undefined>);
    return stored ? removeStorageKey(stored) : null;
  }

  async listDrafts(ownerUserId: string): Promise<TeaLabSoloDraft[]> {
    assertNamespace(ownerUserId, "drafts");
    const database = await this.database;
    const transaction = database.transaction(DRAFT_STORE, "readonly");
    const records = await requestResult(transaction.objectStore(DRAFT_STORE).index("owner").getAll(ownerUserId) as IDBRequest<StoredDraft[]>);
    return records.map(removeStorageKey).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async putDraft(draft: TeaLabSoloDraft): Promise<void> {
    assertNamespace(draft.ownerUserId, draft.sessionId);
    const database = await this.database;
    const transaction = database.transaction(DRAFT_STORE, "readwrite");
    transaction.objectStore(DRAFT_STORE).put({
      ...draft,
      storageKey: teaLabDraftStorageKey(draft.ownerUserId, draft.sessionId)
    } satisfies StoredDraft);
    await transactionComplete(transaction);
  }

  async saveDraftAndOperations(draft: TeaLabSoloDraft, operations: TeaLabOutboxOperation[]): Promise<void> {
    assertNamespace(draft.ownerUserId, draft.sessionId);
    if (operations.some(operation => operation.ownerUserId !== draft.ownerUserId || operation.sessionId !== draft.sessionId)) {
      throw new Error("Tea Lab operations cannot cross an owner or session namespace.");
    }
    const database = await this.database;
    const transaction = database.transaction([DRAFT_STORE, OPERATION_STORE], "readwrite");
    transaction.objectStore(DRAFT_STORE).put({
      ...draft,
      storageKey: teaLabDraftStorageKey(draft.ownerUserId, draft.sessionId)
    } satisfies StoredDraft);
    const operationStore = transaction.objectStore(OPERATION_STORE);
    for (const operation of operations) {
      operationStore.put({
        ...operation,
        storageKey: teaLabOperationStorageKey(operation.ownerUserId, operation.id)
      } satisfies StoredOperation);
    }
    await transactionComplete(transaction);
  }

  async replaceSessionOperations(draft: TeaLabSoloDraft, operations: TeaLabOutboxOperation[]): Promise<void> {
    assertNamespace(draft.ownerUserId, draft.sessionId);
    if (operations.some(operation => operation.ownerUserId !== draft.ownerUserId || operation.sessionId !== draft.sessionId)) {
      throw new Error("Tea Lab operations cannot cross an owner or session namespace.");
    }
    const database = await this.database;
    const transaction = database.transaction([DRAFT_STORE, OPERATION_STORE], "readwrite");
    transaction.objectStore(DRAFT_STORE).put({
      ...draft,
      storageKey: teaLabDraftStorageKey(draft.ownerUserId, draft.sessionId)
    } satisfies StoredDraft);
    const operationStore = transaction.objectStore(OPERATION_STORE);
    const records = await requestResult(operationStore.index("ownerSession").getAll(
      [draft.ownerUserId, draft.sessionId]
    ) as IDBRequest<StoredOperation[]>);
    for (const record of records) operationStore.delete(record.storageKey);
    for (const operation of operations) {
      operationStore.put({
        ...operation,
        storageKey: teaLabOperationStorageKey(operation.ownerUserId, operation.id)
      } satisfies StoredOperation);
    }
    await transactionComplete(transaction);
  }

  async listOperations(ownerUserId: string): Promise<TeaLabOutboxOperation[]> {
    assertNamespace(ownerUserId, "operations");
    const database = await this.database;
    const transaction = database.transaction(OPERATION_STORE, "readonly");
    const records = await requestResult(transaction.objectStore(OPERATION_STORE).index("owner").getAll(ownerUserId) as IDBRequest<StoredOperation[]>);
    return records.map(record => removeStorageKey(record) as TeaLabOutboxOperation).sort((left, right) =>
      left.createdAt.localeCompare(right.createdAt) || left.sequence - right.sequence || left.id.localeCompare(right.id)
    );
  }

  async putOperation(operation: TeaLabOutboxOperation): Promise<void> {
    assertNamespace(operation.ownerUserId, operation.id);
    const database = await this.database;
    const transaction = database.transaction(OPERATION_STORE, "readwrite");
    transaction.objectStore(OPERATION_STORE).put({
      ...operation,
      storageKey: teaLabOperationStorageKey(operation.ownerUserId, operation.id)
    } satisfies StoredOperation);
    await transactionComplete(transaction);
  }

  async deleteOperation(ownerUserId: string, operationId: string): Promise<void> {
    assertNamespace(ownerUserId, operationId);
    const database = await this.database;
    const transaction = database.transaction(OPERATION_STORE, "readwrite");
    transaction.objectStore(OPERATION_STORE).delete(teaLabOperationStorageKey(ownerUserId, operationId));
    await transactionComplete(transaction);
  }

  async deleteSessionData(ownerUserId: string, sessionId: string): Promise<void> {
    assertNamespace(ownerUserId, sessionId);
    const database = await this.database;
    const transaction = database.transaction([DRAFT_STORE, OPERATION_STORE], "readwrite");
    transaction.objectStore(DRAFT_STORE).delete(teaLabDraftStorageKey(ownerUserId, sessionId));
    const operationStore = transaction.objectStore(OPERATION_STORE);
    const records = await requestResult(operationStore.index("ownerSession").getAll([ownerUserId, sessionId]) as IDBRequest<StoredOperation[]>);
    for (const record of records) operationStore.delete(record.storageKey);
    await transactionComplete(transaction);
  }
}
