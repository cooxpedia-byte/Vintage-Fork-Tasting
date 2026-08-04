import { beforeEach, describe, expect, it, vi } from "vitest";

const stubs = vi.hoisted(() => ({
  requireStaff: vi.fn(),
  createClient: vi.fn(),
  loggerError: vi.fn(),
  loggerWarn: vi.fn(),
  notFound: vi.fn(() => { throw new Error("not found"); })
}));

vi.mock("@/lib/auth", () => ({ requireStaff: stubs.requireStaff }));
vi.mock("@/lib/supabase/server", () => ({ createClient: stubs.createClient }));
vi.mock("@/lib/logger", () => ({ logger: { error: stubs.loggerError, warn: stubs.loggerWarn } }));
vi.mock("next/navigation", () => ({ notFound: stubs.notFound }));
vi.mock("@/components/host/HostConsole", () => ({ HostConsole: () => null }));

import LivePage from "@/app/admin/events/[event-id]/live/page";

function queryClient() {
  const eventBuilder = {
    select() { return eventBuilder; },
    eq() { return eventBuilder; },
    async single() { return { data: null, error: { code: "42703" } }; }
  };
  const listBuilder = {
    select() { return listBuilder; },
    eq() { return listBuilder; },
    async order() { return { data: null, error: { code: "42703" } }; }
  };
  const profileBuilder = {
    select() { return profileBuilder; },
    eq() { return profileBuilder; },
    async single() { return { data: { display_name: "Host" }, error: null }; }
  };
  return {
    from(table: string) {
      if (table === "events") return eventBuilder;
      if (table === "profiles") return profileBuilder;
      return listBuilder;
    }
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  stubs.requireStaff.mockResolvedValue({ user: { id: "user-1", email: "host@example.test" }, role: "admin" });
  stubs.createClient.mockResolvedValue(queryClient());
});

describe("live host console page", () => {
  it("reports schema failures instead of rendering the event as missing", async () => {
    await expect(LivePage({ params: Promise.resolve({ "event-id": "event-1" }) }))
      .rejects.toThrow("Unable to load the live console.");

    expect(stubs.notFound).not.toHaveBeenCalled();
    expect(stubs.loggerError).toHaveBeenCalledWith("host_console_load_failed", undefined, {
      eventId: "event-1",
      failures: [
        { source: "event", code: "42703" },
        { source: "flight", code: "42703" },
        { source: "participants", code: "42703" }
      ]
    });
  });
});
