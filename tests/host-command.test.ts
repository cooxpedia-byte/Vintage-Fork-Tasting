import { describe, expect, it, vi } from "vitest";
import { requestHostCommand } from "../src/lib/host-command";

const request = {
  eventId: "event-1",
  command: "end_session" as const,
  expectedSequence: 7,
  leaseToken: "00000000-0000-4000-8000-000000000000"
};

describe("host command requests", () => {
  it("returns the authoritative event after a successful command", async () => {
    const event = { id: "event-1", phase: "ended", sequence_number: 8 };
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ event }), { status: 200 }));

    await expect(requestHostCommand(request, fetcher)).resolves.toEqual({ kind: "applied", event });
  });

  it("returns a server rejection without treating the result as uncertain", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ error: "The room moved on another device." }), { status: 409 }));

    await expect(requestHostCommand(request, fetcher)).resolves.toEqual({
      kind: "rejected",
      message: "The room moved on another device."
    });
  });

  it("turns a dropped request into an unconfirmed result instead of throwing", async () => {
    const fetcher = vi.fn(async () => { throw new TypeError("network unavailable"); });

    await expect(requestHostCommand(request, fetcher)).resolves.toEqual({ kind: "unconfirmed" });
  });

  it("treats an incomplete success response as unconfirmed", async () => {
    const fetcher = vi.fn(async () => new Response("{}", { status: 200 }));

    await expect(requestHostCommand(request, fetcher)).resolves.toEqual({ kind: "unconfirmed" });
  });
});
