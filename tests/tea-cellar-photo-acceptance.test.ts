import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const stubs = vi.hoisted(() => ({
  createRequestClient: vi.fn(),
  createAdminClient: vi.fn(),
  loggerError: vi.fn()
}));

vi.mock("@/lib/supabase/request-auth", () => ({ createRequestClient: stubs.createRequestClient }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: stubs.createAdminClient }));
vi.mock("@/lib/logger", () => ({ logger: { error: stubs.loggerError } }));

import { GET } from "@/app/api/tea-lab/photos/route";
import { TEA_LAB_PHOTO_BUCKET } from "@/lib/tea-lab/photos";

const owner = "owner-1";
const ownCard = "10000000-0000-4000-8000-000000000102";
const otherCard = "10000000-0000-4000-8000-000000000202";
const missingCard = "10000000-0000-4000-8000-000000000302";
const privateUrl = "https://photos.example.test/owner-ready?token=temporary";

function photo(id: string, cardId: string, ownerId: string, status: "ready" | "uploading") {
  return {
    id, card_id: cardId, owner_user_id: ownerId, storage_path: `${ownerId}/${cardId}/${id}.jpg`,
    content_type: "image/jpeg", size_bytes: 1200, upload_status: status, alt_text: "Private tasting leaves",
    created_at: "2026-09-01T18:30:00.000Z"
  };
}

const ownReady = photo("own-ready", ownCard, owner, "ready");
const ownUploading = photo("own-uploading", ownCard, owner, "uploading");
const otherReady = photo("other-ready", otherCard, "owner-2", "ready");

/** Return real filtered fixtures, so removing either owner/card predicate changes the result. */
function fixtureClient() {
  const tables: Record<string, Array<Record<string, unknown>>> = {
    tasting_cards: [
      { id: ownCard, owner_user_id: owner, session: { status: "completed" } },
      { id: otherCard, owner_user_id: "owner-2", session: { status: "completed" } }
    ],
    tasting_card_photos: [ownReady, ownUploading, otherReady,
      photo("owner-other-card", otherCard, owner, "ready"),
      photo("other-owner-same-card", ownCard, "owner-2", "ready")]
  };
  const from = vi.fn((table: string) => {
    if (!(table in tables)) throw new Error(`Unexpected table ${table}`);
    let rows = tables[table];
    const builder = {
      select() { return builder; },
      eq(column: string, value: unknown) { rows = rows.filter(row => row[column] === value); return builder; },
      async maybeSingle() { return { data: rows[0] ?? null, error: null }; },
      async order() { return { data: rows, error: null }; }
    };
    return builder;
  });
  return { from };
}

function request(cardId = ownCard) {
  return new Request(`https://example.test/api/tea-lab/photos?cardId=${cardId}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("TEA_LAB_ENABLED", "true");
});
afterEach(() => vi.unstubAllEnvs());

describe("personal Tea Cellar photo acceptance", () => {
  it("requires authentication before querying or signing personal photos", async () => {
    const client = fixtureClient();
    stubs.createRequestClient.mockResolvedValue({ client, user: null });

    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(client.from).not.toHaveBeenCalled();
    expect(stubs.createAdminClient).not.toHaveBeenCalled();
  });

  it.each([otherCard, missingCard])("returns the same not-found result for inaccessible card %s without signing", async cardId => {
    const client = fixtureClient();
    stubs.createRequestClient.mockResolvedValue({ client, user: { id: owner } });

    const response = await GET(request(cardId));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Tasting card not found." });
    expect(client.from).not.toHaveBeenCalledWith("tasting_card_photos");
    expect(stubs.createAdminClient).not.toHaveBeenCalled();
  });

  it("reads an owner's completed record and signs only its ready photos", async () => {
    stubs.createRequestClient.mockResolvedValue({ client: fixtureClient(), user: { id: owner } });
    const createSignedUrls = vi.fn(async () => ({ data: [{ path: ownReady.storage_path, signedUrl: privateUrl }], error: null }));
    const storageFrom = vi.fn(() => ({ createSignedUrls }));
    stubs.createAdminClient.mockReturnValue({ storage: { from: storageFrom } });

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(storageFrom).toHaveBeenCalledExactlyOnceWith(TEA_LAB_PHOTO_BUCKET);
    expect(createSignedUrls).toHaveBeenCalledExactlyOnceWith([ownReady.storage_path], 3600);
    expect(body).toEqual({ photos: [
      { id: ownReady.id, url: privateUrl, altText: ownReady.alt_text, createdAt: ownReady.created_at, status: "ready" },
      { id: ownUploading.id, url: null, altText: ownUploading.alt_text, createdAt: ownUploading.created_at, status: "uploading" }
    ] });
    expect(JSON.stringify(body)).not.toContain("storage_path");
    expect(JSON.stringify(body)).not.toContain("owner_user_id");
  });

  it("returns a recoverable error when private photo signing fails", async () => {
    stubs.createRequestClient.mockResolvedValue({ client: fixtureClient(), user: { id: owner } });
    stubs.createAdminClient.mockReturnValue({ storage: { from: () => ({
      createSignedUrls: vi.fn(async () => ({ data: null, error: { message: "Signing unavailable" } }))
    }) } });

    const response = await GET(request());

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Photos could not be loaded." });
  });
});
