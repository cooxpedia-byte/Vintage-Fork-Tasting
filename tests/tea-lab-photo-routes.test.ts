import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const stubs = vi.hoisted(() => ({
  createRequestClient: vi.fn(),
  createAdminClient: vi.fn(),
  loggerError: vi.fn()
}));

vi.mock("@/lib/supabase/request-auth", () => ({ createRequestClient: stubs.createRequestClient }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: stubs.createAdminClient }));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: stubs.loggerError }
}));

import { POST } from "@/app/api/tea-lab/photos/route";

const cardId = "10000000-0000-4000-8000-000000000102";

function uploadRequest() {
  return new Request("https://example.test/api/tea-lab/photos", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ cardId, contentType: "image/jpeg", sizeBytes: 1200 })
  });
}

function queryClient(status = "in_progress") {
  const cardBuilder = {
    select: vi.fn(() => cardBuilder),
    eq: vi.fn(() => cardBuilder),
    maybeSingle: vi.fn(async () => ({ data: { id: cardId, session: { status } }, error: null }))
  };
  const countBuilder = {
    select: vi.fn(() => countBuilder),
    eq: vi.fn(() => countBuilder),
    then: (resolve: (value: { count: number; error: null }) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve({ count: 0, error: null }).then(resolve, reject)
  };
  const from = vi.fn((table: string) => table === "tasting_cards" ? cardBuilder : countBuilder);
  return { from, cardBuilder, countBuilder };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("TEA_LAB_ENABLED", "true");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Tea Lab tasting photo routes", () => {
  it("does not authenticate or allocate storage while Tea Lab is disabled", async () => {
    vi.stubEnv("TEA_LAB_ENABLED", "false");

    const response = await POST(uploadRequest());

    expect(response.status).toBe(404);
    expect(stubs.createRequestClient).not.toHaveBeenCalled();
    expect(stubs.createAdminClient).not.toHaveBeenCalled();
  });

  it("requires an authenticated owner before preparing an upload", async () => {
    stubs.createRequestClient.mockResolvedValue({ client: {}, user: null });

    const response = await POST(uploadRequest());

    expect(response.status).toBe(401);
    expect(stubs.createAdminClient).not.toHaveBeenCalled();
  });

  it("creates an owner- and card-namespaced signed upload for an active tasting", async () => {
    const client = queryClient();
    stubs.createRequestClient.mockResolvedValue({ client, user: { id: "owner-1" } });
    const insert = vi.fn(async () => ({ error: null }));
    const createSignedUploadUrl = vi.fn(async () => ({ data: { token: "signed-token" }, error: null }));
    stubs.createAdminClient.mockReturnValue({
      from: vi.fn(() => ({ insert })),
      storage: { from: vi.fn(() => ({ createSignedUploadUrl })) }
    });

    const response = await POST(uploadRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.token).toBe("signed-token");
    expect(body.path).toMatch(new RegExp(`^owner-1/${cardId}/[0-9a-f-]+\\.jpg$`));
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      card_id: cardId,
      owner_user_id: "owner-1",
      storage_path: body.path,
      upload_status: "uploading"
    }));
  });

  it("locks photo additions as soon as the tasting is completed", async () => {
    const client = queryClient("completed");
    stubs.createRequestClient.mockResolvedValue({ client, user: { id: "owner-1" } });

    const response = await POST(uploadRequest());

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "Photos can only be added while the tasting is in progress." });
    expect(stubs.createAdminClient).not.toHaveBeenCalled();
  });
});
