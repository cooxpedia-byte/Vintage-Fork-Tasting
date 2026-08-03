import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const stubs = vi.hoisted(() => ({
  createRequestClient: vi.fn(),
  loggerError: vi.fn(),
  loggerWarn: vi.fn()
}));

vi.mock("@/lib/supabase/request-auth", () => ({ createRequestClient: stubs.createRequestClient }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: stubs.loggerWarn, error: stubs.loggerError } }));

import { PATCH } from "@/app/api/tea-lab/personal-teas/[teaId]/route";

const teaId = "10000000-0000-4000-8000-000000000201";
const operationId = "10000000-0000-4000-8000-000000000202";
const context = { params: Promise.resolve({ teaId }) };

function request(body: unknown) {
  return new Request(`https://example.test/api/tea-lab/personal-teas/${teaId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("TEA_LAB_ENABLED", "true");
});

afterEach(() => vi.unstubAllEnvs());

describe("Tea Lab personal-tea route", () => {
  it("does not authenticate or touch the database when Tea Lab is disabled", async () => {
    vi.stubEnv("TEA_LAB_ENABLED", "false");

    const response = await PATCH(request({ operationId, archived: true }), context);

    expect(response.status).toBe(404);
    expect(stubs.createRequestClient).not.toHaveBeenCalled();
  });

  it("archives through the owner-protected idempotent RPC", async () => {
    const rpc = vi.fn(async () => ({
      data: { id: teaId, archived_at: "2026-08-03T12:00:00.000Z", updated_at: "2026-08-03T12:00:00.000Z" },
      error: null
    }));
    stubs.createRequestClient.mockResolvedValue({ client: { rpc }, user: { id: "owner-1" } });

    const response = await PATCH(request({ operationId, archived: true }), context);

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("set_personal_tea_record_archived", {
      p_personal_tea_id: teaId,
      p_operation_id: operationId,
      p_archived: true
    });
    expect(await response.json()).toEqual({
      personalTea: { id: teaId, archivedAt: "2026-08-03T12:00:00.000Z", updatedAt: "2026-08-03T12:00:00.000Z" }
    });
  });

  it("rejects ownership-shaped client fields before calling the RPC", async () => {
    const rpc = vi.fn();
    stubs.createRequestClient.mockResolvedValue({ client: { rpc }, user: { id: "owner-1" } });

    const response = await PATCH(request({ operationId, archived: true, ownerUserId: "other-owner" }), context);

    expect(response.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns a privacy-safe not-found response for cross-owner records", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: "tea_lab_personal_tea_not_found", details: "private tea prose" } }));
    stubs.createRequestClient.mockResolvedValue({ client: { rpc }, user: { id: "owner-1" } });

    const response = await PATCH(request({ operationId, archived: true }), context);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({ error: "That personal tea was not found.", code: "tea_not_found" });
    expect(JSON.stringify(stubs.loggerWarn.mock.calls)).not.toContain("private tea prose");
  });
});
