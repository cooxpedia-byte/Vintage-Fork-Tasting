"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { authenticatedFetch } from "@/lib/authenticated-fetch";

export function PersonalTeaActions({ teaId, archived }: { teaId: string; archived: boolean }) {
  const router = useRouter();
  const operationRef = useRef<{ archived: boolean; id: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function updateArchive() {
    const nextArchived = !archived;
    const operation = operationRef.current?.archived === nextArchived
      ? operationRef.current
      : { archived: nextArchived, id: crypto.randomUUID() };
    operationRef.current = operation;
    setBusy(true);
    setError("");
    try {
      const response = await authenticatedFetch(`/api/tea-lab/personal-teas/${teaId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ operationId: operation.id, archived: nextArchived })
      });
      if (!response.ok) {
        setError(response.status === 409
          ? "This tea changed elsewhere. Reload before trying again."
          : "This private tea could not be changed just now.");
        return;
      }
      operationRef.current = null;
      router.refresh();
    } catch {
      setError("This private tea could not be changed just now.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="tea-lab-record-actions">
    <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => void updateArchive()}>{busy ? "Saving…" : archived ? "Restore to Library" : "Archive from Library"}</button>
    {error && <p className="help error-text" role="alert">{error}</p>}
  </div>;
}
