import { beforeEach, describe, expect, it, vi } from "vitest";

const stubs = vi.hoisted(() => ({
  createRequestClient: vi.fn(),
  loggerError: vi.fn()
}));

vi.mock("@/lib/supabase/request-auth", () => ({ createRequestClient: stubs.createRequestClient }));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), error: stubs.loggerError }
}));

import { POST } from "@/app/api/admin/events/route";

beforeEach(() => {
  vi.clearAllMocks();
});

function staffClient(rpcError: string) {
  const profileBuilder = {
    select() { return profileBuilder; },
    eq() { return profileBuilder; },
    async single() { return { data: { role: "admin" }, error: null }; }
  };
  const rpc = vi.fn(async () => ({ data: null, error: { message: rpcError } }));
  return {
    client: {
      from: vi.fn(() => profileBuilder),
      rpc
    },
    rpc
  };
}

describe("locked event edit regression", () => {
  it("preserves the database lock rejection for live and completed events", async () => {
    const { client, rpc } = staffClient("event_locked");
    stubs.createRequestClient.mockResolvedValue({
      client,
      user: { id: "00000000-0000-4000-8000-000000000001" }
    });

    const response = await POST(new Request("https://example.test/api/admin/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event: { title: "Locked event" }, flight: [] })
    }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: "A live or completed event cannot be edited." });
    expect(rpc).toHaveBeenCalledWith("save_event_bundle", {
      p_event: { title: "Locked event" },
      p_flight: []
    });
    expect(stubs.loggerError).toHaveBeenCalledWith(
      "event_save_failed",
      { message: "event_locked" },
      { userId: "00000000-0000-4000-8000-000000000001" }
    );
  });
});
