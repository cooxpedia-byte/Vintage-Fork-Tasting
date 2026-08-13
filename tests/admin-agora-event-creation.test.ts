import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { eventSchema } from "@/lib/validation";

function source(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), "utf8");
}

const editor = source("src/components/admin/EventEditor.tsx");
const migration = source("supabase/migrations/0029_agora_remote_events.sql")
  .toLowerCase()
  .replace(/\s+/g, " ");

const baseEvent = {
  title: "Remote tea tasting",
  startsAt: "2026-08-13T18:00:00.000Z",
  locationMode: "remote" as const,
  capacity: 24,
  hostUserId: "00000000-0000-4000-8000-000000000001"
};

describe("Agora event creation", () => {
  it("does not request or require an external meeting link", () => {
    expect(editor).not.toContain("Zoom or Meet link");
    expect(editor).not.toContain('htmlFor="call-url"');
    expect(editor).toContain("No Zoom or Google Meet link is needed.");
    expect(eventSchema.safeParse(baseEvent).success).toBe(true);
  });

  it("still requires complete venue details for scheduled in-person events", () => {
    expect(eventSchema.safeParse({ ...baseEvent, locationMode: "in_person" }).success).toBe(false);
    expect(eventSchema.safeParse({
      ...baseEvent,
      locationMode: "in_person",
      venueName: "Vintage Fork Tea Room",
      venueAddress: "123 Tea Lane"
    }).success).toBe(true);
  });

  it("makes remote database readiness depend on the built-in room, not video_call_url", () => {
    expect(migration).toContain("location_mode = 'remote' or");
    expect(migration).toContain("select 'location', exists(select 1 from e where location_mode='remote' or");
    expect(migration).not.toContain("location_mode='remote' and video_call_url is not null");
    expect(migration).toContain("revoke all on function public.event_readiness(uuid)");
  });
});
