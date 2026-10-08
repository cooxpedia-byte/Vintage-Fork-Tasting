import { describe, expect, it } from "vitest";
import { createSoloTeaDraft, type TeaLabSoloDraft } from "@/lib/tea-lab/offline";
import { reconcileTeaLabActiveDraft } from "@/lib/tea-lab/workspace-draft";

function draft(): TeaLabSoloDraft {
  const ids = ["session-1", "card-1"];
  const base = createSoloTeaDraft("owner-1", () => ids.shift()!, () => "2026-10-07T12:00:00.000Z");
  return {
    ...base, tea: { kind: "personal", personalTeaId: "tea-1", name: "Moonlight White" },
    brewing: { style: "gongfu" }, tasting: { ...base.tasting, rating: 4, personalNotes: "First edit" }
  };
}

describe("Tea Lab active draft reconciliation", () => {
  it("retains a newer edit when an earlier autosave finishes syncing", () => {
    const firstEdit = draft();
    const secondEdit = { ...firstEdit, tasting: { ...firstEdit.tasting, personalNotes: "Second edit while first save is in flight" } };
    const confirmedFirstEdit = {
      ...firstEdit, status: "in_progress" as const, serverRevision: 1, lastSyncedAt: "2026-10-07T12:00:01.000Z"
    };
    const active = reconcileTeaLabActiveDraft(secondEdit, confirmedFirstEdit, true);

    expect(active.tasting.personalNotes).toBe("Second edit while first save is in flight");
    expect(active).toMatchObject({ serverRevision: 1, lastSyncedAt: "2026-10-07T12:00:01.000Z", status: "in_progress" });
    const confirmedSecondEdit = { ...active, serverRevision: 2, lastSyncedAt: "2026-10-07T12:00:02.000Z" };
    expect(reconcileTeaLabActiveDraft(active, confirmedSecondEdit, false)).toBe(confirmedSecondEdit);
  });

  it("adopts a confirmed completion only after local edits have been persisted", () => {
    const active = { ...draft(), status: "completion_pending" as const };
    const completed = { ...active, status: "completed" as const, serverRevision: 2 };
    expect(reconcileTeaLabActiveDraft(active, completed, false)).toBe(completed);
  });

  it("ignores stale storage reads and another session or owner", () => {
    const active = { ...draft(), serverRevision: 2 };
    expect(reconcileTeaLabActiveDraft(active, { ...active, serverRevision: 1 }, false)).toBe(active);
    expect(reconcileTeaLabActiveDraft(active, { ...active, sessionId: "session-2" }, false)).toBe(active);
    expect(reconcileTeaLabActiveDraft(active, { ...active, ownerUserId: "owner-2" }, false)).toBe(active);
  });
});
