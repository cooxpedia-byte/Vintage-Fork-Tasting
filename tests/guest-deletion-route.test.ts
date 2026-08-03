import { beforeEach, describe, expect, it, vi } from "vitest";

const stubs = vi.hoisted(() => ({
  cookies: vi.fn(),
  cookieDelete: vi.fn(),
  requireParticipant: vi.fn(),
  createAdminClient: vi.fn(),
  loggerInfo: vi.fn(),
  loggerError: vi.fn()
}));

vi.mock("next/headers", () => ({ cookies: stubs.cookies }));
vi.mock("@/lib/guest-token", () => ({
  guestCookieName: (eventId: string) => `vf_guest_${eventId}`,
  hashGuestToken: (token: string) => `hashed_${token}`,
  requireParticipant: stubs.requireParticipant
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: stubs.createAdminClient }));
vi.mock("@/lib/logger", () => ({
  logger: { info: stubs.loggerInfo, error: stubs.loggerError }
}));

import { DELETE } from "@/app/api/events/[eventId]/privacy/route";

beforeEach(() => {
  vi.clearAllMocks();
  stubs.cookies.mockResolvedValue({ delete: stubs.cookieDelete });
});

function deletionAdmin(deletedId: string | null) {
  const filters: Array<[string, string]> = [];
  const tables: string[] = [];
  const builder = {
    delete() { return builder; },
    eq(column: string, value: string) { filters.push([column, value]); return builder; },
    select() { return builder; },
    async maybeSingle() {
      return { data: deletedId ? { id: deletedId } : null, error: null };
    }
  };
  const admin = {
    from(table: string) { tables.push(table); return builder; }
  };
  stubs.createAdminClient.mockReturnValue(admin);
  return { filters, tables };
}

describe("participant-scoped tasting deletion", () => {
  it("deletes only the authenticated participant within the requested event", async () => {
    const eventId = "00000000-0000-4000-8000-000000000001";
    const participantId = "00000000-0000-4000-8000-000000000002";
    stubs.requireParticipant.mockResolvedValue({ id: participantId });
    const { filters, tables } = deletionAdmin(participantId);

    const response = await DELETE(new Request("https://example.test/privacy", { method: "DELETE" }), {
      params: Promise.resolve({ eventId })
    });

    expect(response.status).toBe(200);
    expect(tables).toEqual(["participants"]);
    expect(filters).toEqual([
      ["id", participantId],
      ["event_id", eventId]
    ]);
    expect(stubs.cookieDelete).toHaveBeenCalledWith(`vf_guest_${eventId}`);
    expect(stubs.loggerInfo).toHaveBeenCalledWith("guest_tasting_data_deleted", {
      eventId,
      source: "guest_session"
    });
  });

  it("does not issue a delete without a valid participant identity", async () => {
    const eventId = "00000000-0000-4000-8000-000000000001";
    stubs.requireParticipant.mockResolvedValue(null);
    const { tables } = deletionAdmin(null);

    const response = await DELETE(new Request("https://example.test/privacy", { method: "DELETE" }), {
      params: Promise.resolve({ eventId })
    });

    expect(response.status).toBe(401);
    expect(tables).toEqual([]);
    expect(stubs.cookieDelete).not.toHaveBeenCalled();
  });
});
