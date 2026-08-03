import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const stubs = vi.hoisted(() => ({
  createRequestClient: vi.fn(),
  loggerError: vi.fn(),
  loggerWarn: vi.fn()
}));

vi.mock("@/lib/supabase/request-auth", () => ({ createRequestClient: stubs.createRequestClient }));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: stubs.loggerWarn, error: stubs.loggerError }
}));

import { DELETE, PATCH, PUT } from "@/app/api/tea-lab/sessions/[sessionId]/route";
import { POST as COMPLETE } from "@/app/api/tea-lab/sessions/[sessionId]/complete/route";

const sessionId = "10000000-0000-4000-8000-000000000101";
const cardId = "10000000-0000-4000-8000-000000000102";
const operationId = "10000000-0000-4000-8000-000000000103";
const personalTeaId = "10000000-0000-4000-8000-000000000104";
const descriptorId = "10000000-0000-4000-8000-000000000001";
const context = { params: Promise.resolve({ sessionId }) };

function request(method: string, body: unknown) {
  return new Request(`https://example.test/api/tea-lab/sessions/${sessionId}`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

function savePayload() {
  return {
    operationId,
    cardId,
    expectedRevision: 0,
    tea: {
      kind: "personal",
      personalTeaId,
      name: "Moonlight White",
      origin: "Yunnan"
    },
    brewing: {
      style: "gongfu",
      leafGrams: 5,
      waterMl: 100,
      waterTemperatureC: 85,
      preparationNotes: "Porcelain gaiwan",
      stages: [{ label: "Infusion 1", durationSeconds: 10, temperatureC: 85, notes: "Soft apricot" }]
    },
    tasting: {
      firstImpression: "Soft apricot",
      descriptorIds: [descriptorId],
      intensity: "clear",
      rating: 4,
      personalNotes: "Keep this private"
    }
  };
}

function authenticatedRpc(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn(async () => result);
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    then: (resolve: (value: { data: unknown[]; error: null }) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve)
  };
  stubs.createRequestClient.mockResolvedValue({ client: { rpc, from: vi.fn(() => builder) }, user: { id: "owner-1" } });
  return rpc;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("TEA_LAB_ENABLED", "true");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Tea Lab solo-session routes", () => {
  it("returns not found without authenticating or touching the database when disabled", async () => {
    vi.stubEnv("TEA_LAB_ENABLED", "false");

    const response = await PUT(request("PUT", savePayload()), context);

    expect(response.status).toBe(404);
    expect(stubs.createRequestClient).not.toHaveBeenCalled();
  });

  it("requires an authenticated customer", async () => {
    const rpc = vi.fn();
    stubs.createRequestClient.mockResolvedValue({ client: { rpc }, user: null });

    const response = await PUT(request("PUT", savePayload()), context);

    expect(response.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects client-supplied ownership fields", async () => {
    const rpc = authenticatedRpc({ data: null, error: null });
    const payload = { ...savePayload(), ownerUserId: "another-user" };

    const response = await PUT(request("PUT", payload), context);

    expect(response.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("saves a validated personal-tea draft through the protected RPC", async () => {
    const rpc = authenticatedRpc({
      data: {
        id: sessionId,
        owner_user_id: "owner-1",
        status: "in_progress",
        revision: 1,
        completed_at: null,
        archived_at: null
      },
      error: null
    });

    const response = await PUT(request("PUT", savePayload()), context);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("save_solo_tasting_session_v2", {
      p_session_id: sessionId,
      p_card_id: cardId,
      p_operation_id: operationId,
      p_expected_revision: 0,
      p_tea: {
        kind: "personal",
        personalTeaId,
        name: "Moonlight White",
        origin: "Yunnan"
      },
      p_card: { rating: 4, intensity: "clear" },
      p_brewing: {
        style: "gongfu",
        leafGrams: 5,
        waterMl: 100,
        waterTemperatureC: 85,
        preparationNotes: "Porcelain gaiwan",
        stages: [{ label: "Infusion 1", durationSeconds: 10, temperatureC: 85, notes: "Soft apricot" }]
      },
      p_private_notes: {
        firstImpression: "Soft apricot",
        personalNotes: "Keep this private"
      },
      p_descriptor_ids: [descriptorId]
    });
    expect(body).toEqual({
      session: {
        id: sessionId,
        status: "in_progress",
        revision: 1,
        completedAt: null,
        archivedAt: null
      }
    });
    expect(JSON.stringify(body)).not.toContain("owner_user_id");
  });

  it("rejects oversized or malformed private brewing stages before the RPC", async () => {
    const rpc = authenticatedRpc({ data: null, error: null });
    const payload = savePayload();
    payload.brewing.stages = Array.from({ length: 21 }, (_, index) => ({
      label: `Infusion ${index + 1}`,
      durationSeconds: 10,
      temperatureC: 85,
      notes: "Private"
    }));

    const response = await PUT(request("PUT", payload), context);

    expect(response.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns a privacy-safe revision conflict without logging private error details", async () => {
    const rpc = authenticatedRpc({
      data: null,
      error: { message: "tea_lab_stale_revision", details: "Keep this private" }
    });

    const response = await PUT(request("PUT", savePayload()), context);
    const body = await response.json();

    expect(rpc).toHaveBeenCalledOnce();
    expect(response.status).toBe(409);
    expect(body).toEqual({
      error: "This tasting changed elsewhere. Review the latest version before saving again.",
      code: "revision_conflict"
    });
    expect(JSON.stringify(body)).not.toContain("Keep this private");
    expect(stubs.loggerWarn).toHaveBeenCalledWith("tea_lab_session_save_rejected", {
      sessionId,
      operationId,
      code: "revision_conflict"
    });
    expect(JSON.stringify(stubs.loggerWarn.mock.calls)).not.toContain("Keep this private");
  });

  it("archives and restores only through the revision-checked RPC", async () => {
    const rpc = authenticatedRpc({
      data: { id: sessionId, status: "completed", revision: 3, completed_at: "2026-08-03T10:00:00.000Z", archived_at: "2026-08-03T11:00:00.000Z" },
      error: null
    });

    const response = await PATCH(request("PATCH", { operationId, expectedRevision: 2, archived: true }), context);

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("set_tasting_session_archived", {
      p_session_id: sessionId,
      p_operation_id: operationId,
      p_expected_revision: 2,
      p_archived: true
    });
  });

  it("completes through the existing atomic idempotent operation", async () => {
    const rpc = authenticatedRpc({
      data: { id: sessionId, status: "completed", revision: 2, completed_at: "2026-08-03T10:00:00.000Z", archived_at: null },
      error: null
    });

    const response = await COMPLETE(request("POST", { operationId, expectedRevision: 1 }), context);

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("complete_tasting_session", {
      p_session_id: sessionId,
      p_operation_id: operationId,
      p_expected_revision: 1
    });
  });

  it("deletes through the owner-scoped idempotent operation", async () => {
    const rpc = authenticatedRpc({ data: true, error: null });

    const response = await DELETE(request("DELETE", { operationId }), context);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("delete_tasting_session", {
      p_session_id: sessionId,
      p_operation_id: operationId
    });
  });
});
