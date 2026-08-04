"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { TeaLabCardEditor } from "@/components/tea-lab/TeaLabCardEditor";
import { soloJournalSessionToDraft, type JournalSession } from "@/lib/tea-lab/journal";
import type { TeaLabDescriptorOption } from "@/lib/tea-lab/lab";
import { IndexedDbTeaLabOfflineStore } from "@/lib/tea-lab/indexed-db";
import type { TeaLabSoloDraft } from "@/lib/tea-lab/offline";
import { queueTeaLabArchive, queueTeaLabDeletion, queueTeaLabDraftSave, syncTeaLabOutbox } from "@/lib/tea-lab/outbox";

type TeaLabSessionActionsProps = {
  ownerUserId: string;
  session: JournalSession;
  descriptorOptions: TeaLabDescriptorOption[];
  children: ReactNode;
};

export function TeaLabSessionActions({ ownerUserId, session, descriptorOptions, children }: TeaLabSessionActionsProps) {
  const router = useRouter();
  const [busy, setBusy] = useState<"edit" | "archive" | "delete" | null>(null);
  const [editingDraft, setEditingDraft] = useState<TeaLabSoloDraft | null>(null);
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

  async function prepareDraft(store: IndexedDbTeaLabOfflineStore, replacement?: TeaLabSoloDraft) {
    const existing = await store.getDraft(ownerUserId, session.sourceId);
    const fallback = soloJournalSessionToDraft(ownerUserId, session);
    const base = replacement ?? existing ?? fallback;
    const next = {
      ...base,
      serverRevision: Math.max(base.serverRevision, existing?.serverRevision ?? 0, session.revision ?? 0),
      status: "completed" as const,
      archived: session.archivedAt !== null
    };
    await store.putDraft(next);
    return next;
  }

  function beginEdit() {
    setError("");
    setMessage("");
    setConfirmingDelete(false);
    setEditingDraft(soloJournalSessionToDraft(ownerUserId, session));
  }

  async function saveEdit() {
    if (!editingDraft?.tea || !editingDraft.tasting.rating) return;
    setBusy("edit");
    setError("");
    setMessage("");
    try {
      const store = new IndexedDbTeaLabOfflineStore();
      const draft = await prepareDraft(store, editingDraft);
      await queueTeaLabDraftSave(store, draft);
      await syncTeaLabOutbox(store, ownerUserId);
      const remaining = (await store.listOperations(ownerUserId)).filter(operation => operation.sessionId === session.sourceId);
      if (remaining.length === 0) {
        setMessage("Tasting card updated. Its Passport seal and original completion date are unchanged.");
        setEditingDraft(null);
        router.refresh();
      } else if (remaining.some(operation => operation.state === "conflict" || operation.state === "failed")) {
        setError("This tasting changed elsewhere. Reload the Journal before trying again; your edits remain on this device.");
      } else {
        setMessage("Your edits are saved on this device and will synchronize when available.");
      }
    } catch {
      setError("This tasting card could not be updated just now. Your existing card has not been discarded.");
    } finally {
      setBusy(null);
    }
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

  return <div className="journal-session-interactive">
    <div className="journal-session-swipe-row" tabIndex={0} aria-describedby={`journal-actions-hint-${session.sourceId}`}>
      {children}
      <div className="journal-session-action-rail" role="group" aria-label={`Actions for ${session.title}`}>
      <button className="btn btn-gold" type="button" disabled={busy !== null || editingDraft !== null} onClick={beginEdit}>Edit</button>
      <button className="btn btn-secondary" type="button" disabled={busy !== null || editingDraft !== null} onClick={() => void run("archive")}>
        {busy === "archive" ? "Saving…" : session.archivedAt ? "Restore" : "Archive"}
      </button>
      <button className="btn btn-danger" type="button" ref={deleteTriggerRef} disabled={busy !== null || editingDraft !== null} onClick={() => setConfirmingDelete(true)}>Delete</button>
      </div>
    </div>
    <div className="tea-lab-record-actions">
    {editingDraft && <TeaLabCardEditor
      draft={editingDraft}
      descriptorOptions={descriptorOptions}
      busy={busy === "edit"}
      onChange={setEditingDraft}
      onCancel={() => setEditingDraft(null)}
      onSave={() => void saveEdit()}
    />}
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
    </div>
  </div>;
}
