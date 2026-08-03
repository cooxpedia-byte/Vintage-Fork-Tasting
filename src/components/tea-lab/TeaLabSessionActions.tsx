"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { JournalSession } from "@/lib/tea-lab/journal";
import { IndexedDbTeaLabOfflineStore } from "@/lib/tea-lab/indexed-db";
import type { TeaLabSoloDraft } from "@/lib/tea-lab/offline";
import { queueTeaLabArchive, queueTeaLabDeletion, syncTeaLabOutbox } from "@/lib/tea-lab/outbox";

type TeaLabSessionActionsProps = {
  ownerUserId: string;
  session: JournalSession;
};

function actionDraft(ownerUserId: string, session: JournalSession): TeaLabSoloDraft {
  const card = session.cards[0];
  return {
    schemaVersion: 1,
    ownerUserId,
    sessionId: session.sourceId,
    cardId: card?.sourceId ?? crypto.randomUUID(),
    serverRevision: session.revision ?? 0,
    status: "completed",
    archived: session.archivedAt !== null,
    tea: null,
    brewing: {},
    tasting: {
      firstImpression: card?.firstImpression ?? null,
      descriptorIds: card?.descriptors.flatMap(descriptor => descriptor.stableId ? [descriptor.stableId] : []) ?? [],
      intensity: card?.intensity === "subtle" || card?.intensity === "clear" || card?.intensity === "dominant" ? card.intensity : null,
      rating: card?.rating ?? null,
      personalNotes: card?.personalNotes ?? null
    },
    createdAt: session.occurredAt,
    updatedAt: session.completedAt ?? session.occurredAt,
    lastSyncedAt: session.completedAt
  };
}

export function TeaLabSessionActions({ ownerUserId, session }: TeaLabSessionActionsProps) {
  const router = useRouter();
  const [busy, setBusy] = useState<"archive" | "delete" | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const deleteTriggerRef = useRef<HTMLButtonElement>(null);
  const cancelDeleteRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (confirmingDelete) cancelDeleteRef.current?.focus();
  }, [confirmingDelete]);

  function cancelDelete() {
    setConfirmingDelete(false);
    queueMicrotask(() => deleteTriggerRef.current?.focus());
  }

  async function prepareDraft(store: IndexedDbTeaLabOfflineStore) {
    const existing = await store.getDraft(ownerUserId, session.sourceId);
    const fallback = actionDraft(ownerUserId, session);
    const next = existing ? {
      ...existing,
      serverRevision: Math.max(existing.serverRevision, session.revision ?? 0),
      status: "completed" as const,
      archived: session.archivedAt !== null
    } : fallback;
    await store.putDraft(next);
    return next;
  }

  async function run(kind: "archive" | "delete") {
    if (session.source !== "solo" || session.revision === null) return;
    setBusy(kind);
    setError("");
    setMessage("");
    try {
      const store = new IndexedDbTeaLabOfflineStore();
      const draft = await prepareDraft(store);
      if (kind === "archive") await queueTeaLabArchive(store, draft, session.archivedAt === null);
      else await queueTeaLabDeletion(store, draft);
      await syncTeaLabOutbox(store, ownerUserId);
      const remaining = (await store.listOperations(ownerUserId)).filter(operation => operation.sessionId === session.sourceId);
      if (remaining.length === 0) {
        setMessage(kind === "delete" ? "Tasting permanently deleted." : session.archivedAt ? "Tasting restored." : "Tasting archived.");
        setConfirmingDelete(false);
        router.refresh();
      } else if (remaining.some(operation => operation.state === "conflict" || operation.state === "failed")) {
        setError("This tasting changed elsewhere. Your device copy is safe; reload before trying again.");
      } else {
        setMessage(kind === "delete"
          ? "Deletion is saved on this device and will finish when synchronization is available."
          : "This change is saved on this device and will synchronize when available.");
      }
    } catch {
      setError("This tasting could not be changed just now. Your existing record has not been discarded.");
    } finally {
      setBusy(null);
    }
  }

  return <div className="tea-lab-record-actions">
    <div className="row">
      <button className="btn btn-secondary" type="button" disabled={busy !== null} onClick={() => void run("archive")}>
        {busy === "archive" ? "Saving…" : session.archivedAt ? "Restore tasting" : "Archive tasting"}
      </button>
      <button className="btn btn-quiet danger" type="button" ref={deleteTriggerRef} disabled={busy !== null} onClick={() => setConfirmingDelete(true)}>Delete permanently</button>
    </div>
    {confirmingDelete && <div className="notice error" role="alertdialog" aria-labelledby={`delete-${session.sourceId}`}>
      <strong id={`delete-${session.sourceId}`}>Permanently delete this tasting?</strong>
      <p style={{ margin: "6px 0 12px" }}>Its brew, descriptors, private notes, Journal card, and Documented Tasting seal will be removed. This cannot be undone.</p>
      <div className="row">
        <button className="btn btn-secondary" type="button" ref={cancelDeleteRef} disabled={busy !== null} onClick={cancelDelete}>Cancel</button>
        <button className="btn btn-danger" type="button" disabled={busy !== null} onClick={() => void run("delete")}>{busy === "delete" ? "Deleting…" : "Delete tasting"}</button>
      </div>
    </div>}
    {message && <p className="help" role="status" aria-live="polite">{message}</p>}
    {error && <p className="help error-text" role="alert">{error}</p>}
  </div>;
}
