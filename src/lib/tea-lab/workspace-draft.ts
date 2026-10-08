import type { TeaLabSoloDraft } from "@/lib/tea-lab/offline";

/** Background storage reads may confirm an earlier autosave while the user is still editing. */
export function reconcileTeaLabActiveDraft(
  active: TeaLabSoloDraft,
  stored: TeaLabSoloDraft,
  hasUnsavedEdits: boolean
): TeaLabSoloDraft {
  if (active.ownerUserId !== stored.ownerUserId || active.sessionId !== stored.sessionId
    || stored.serverRevision < active.serverRevision) return active;
  if (!hasUnsavedEdits) return stored;
  return {
    ...active,
    serverRevision: stored.serverRevision,
    lastSyncedAt: stored.lastSyncedAt,
    status: active.status === "draft" && stored.status === "in_progress" ? "in_progress" : active.status
  };
}
