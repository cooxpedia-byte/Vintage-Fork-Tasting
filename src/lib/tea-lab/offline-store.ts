import type { TeaLabOutboxOperation, TeaLabSoloDraft } from "@/lib/tea-lab/offline";

export interface TeaLabOfflineStore {
  getDraft(ownerUserId: string, sessionId: string): Promise<TeaLabSoloDraft | null>;
  listDrafts(ownerUserId: string): Promise<TeaLabSoloDraft[]>;
  putDraft(draft: TeaLabSoloDraft): Promise<void>;
  saveDraftAndOperations(draft: TeaLabSoloDraft, operations: TeaLabOutboxOperation[]): Promise<void>;
  replaceSessionOperations(draft: TeaLabSoloDraft, operations: TeaLabOutboxOperation[]): Promise<void>;
  listOperations(ownerUserId: string): Promise<TeaLabOutboxOperation[]>;
  putOperation(operation: TeaLabOutboxOperation): Promise<void>;
  deleteOperation(ownerUserId: string, operationId: string): Promise<void>;
  deleteSessionData(ownerUserId: string, sessionId: string): Promise<void>;
}

export function teaLabDraftStorageKey(ownerUserId: string, sessionId: string): string {
  return `${ownerUserId}:${sessionId}`;
}

export function teaLabOperationStorageKey(ownerUserId: string, operationId: string): string {
  return `${ownerUserId}:${operationId}`;
}
