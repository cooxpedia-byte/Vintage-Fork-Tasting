import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TeaLabDeleteOperation, TeaLabSaveOperation } from "@/lib/tea-lab/offline";

const stubs = vi.hoisted(() => ({ authenticatedFetch: vi.fn() }));

vi.mock("@/lib/authenticated-fetch", () => ({ authenticatedFetch: stubs.authenticatedFetch }));

import { fetchTeaLabSessionState, sendTeaLabOperation } from "@/lib/tea-lab/outbox";

const base = {
  schemaVersion: 1 as const,
  id: "operation-1",
  ownerUserId: "owner-1",
  sessionId: "session-1",
  state: "syncing" as const,
  sequence: 1,
  expectedRevision: 2,
  attempts: 1,
  lastErrorCode: null,
  createdAt: "2026-08-03T12:00:00.000Z",
  updatedAt: "2026-08-03T12:00:01.000Z"
};

const saveOperation: TeaLabSaveOperation = {
  ...base,
  kind: "save",
  payload: {
    cardId: "card-1",
    tea: { kind: "canonical", canonicalTeaId: "tea-1" },
    brewing: { waterMl: 100 },
    tasting: {
      firstImpression: null,
      descriptorIds: [],
      intensity: null,
      rating: 4,
      personalNotes: "Private notes"
    }
  }
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Tea Lab operation transport", () => {
  it("loads the current server revision for an explicit device-copy retry", async () => {
    stubs.authenticatedFetch.mockResolvedValue(new Response(JSON.stringify({
      session: { id: "session-1", status: "in_progress", revision: 5, completedAt: null, archivedAt: null }
    }), { status: 200, headers: { "content-type": "application/json" } }));

    await expect(fetchTeaLabSessionState("session-1")).resolves.toEqual({
      id: "session-1", status: "in_progress", revision: 5, completedAt: null, archivedAt: null
    });
    expect(stubs.authenticatedFetch).toHaveBeenCalledWith("/api/tea-lab/sessions/session-1", { method: "GET" });
  });

  it("sends the materialized save to the protected PR5 endpoint", async () => {
    stubs.authenticatedFetch.mockResolvedValue(new Response(JSON.stringify({
      session: { id: "session-1", status: "in_progress", revision: 3, completedAt: null, archivedAt: null }
    }), { status: 200, headers: { "content-type": "application/json" } }));

    const result = await sendTeaLabOperation(saveOperation);

    expect(stubs.authenticatedFetch).toHaveBeenCalledWith("/api/tea-lab/sessions/session-1", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        operationId: "operation-1",
        cardId: "card-1",
        expectedRevision: 2,
        tea: { kind: "canonical", canonicalTeaId: "tea-1" },
        brewing: { waterMl: 100 },
        tasting: saveOperation.payload.tasting
      })
    });
    expect(result).toEqual({
      outcome: "success",
      session: { id: "session-1", status: "in_progress", revision: 3, completedAt: null, archivedAt: null }
    });
  });

  it("classifies authentication, revision conflicts, and retryable failures", async () => {
    stubs.authenticatedFetch.mockResolvedValueOnce(new Response(JSON.stringify({ code: "authentication_required" }), { status: 401 }));
    await expect(sendTeaLabOperation(saveOperation)).resolves.toEqual({ outcome: "authentication", code: "authentication_required" });

    stubs.authenticatedFetch.mockResolvedValueOnce(new Response(JSON.stringify({ code: "revision_conflict" }), { status: 409 }));
    await expect(sendTeaLabOperation(saveOperation)).resolves.toEqual({ outcome: "conflict", code: "revision_conflict" });

    stubs.authenticatedFetch.mockResolvedValueOnce(new Response(JSON.stringify({ code: "operation_failed" }), { status: 503 }));
    await expect(sendTeaLabOperation(saveOperation)).resolves.toEqual({ outcome: "retry", code: "operation_failed" });
  });

  it("does not store arbitrary server prose as an error code", async () => {
    stubs.authenticatedFetch.mockResolvedValue(new Response(JSON.stringify({ code: "Private notes appeared here" }), { status: 400 }));

    await expect(sendTeaLabOperation(saveOperation)).resolves.toEqual({ outcome: "rejected", code: "http_400" });
  });

  it("treats an already-missing server session as confirmed deletion", async () => {
    const deletion: TeaLabDeleteOperation = { ...base, kind: "delete", payload: null, expectedRevision: null };
    stubs.authenticatedFetch.mockResolvedValue(new Response(JSON.stringify({ code: "session_not_found" }), { status: 404 }));

    await expect(sendTeaLabOperation(deletion)).resolves.toEqual({ outcome: "success" });
  });
});
