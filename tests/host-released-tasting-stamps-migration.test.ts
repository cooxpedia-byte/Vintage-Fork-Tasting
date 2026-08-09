import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migration = readFileSync(fileURLToPath(new URL(
  "../supabase/migrations/0027_host_released_tasting_stamps.sql",
  import.meta.url
)), "utf8");
const sql = migration.toLowerCase().replace(/\s+/g, " ");

describe("host-released tasting stamps migration", () => {
  it("stores stamp release separately from guest completion", () => {
    expect(sql).toContain("add column if not exists stamp_released_at timestamptz");
    expect(sql).toContain("check (stamp_released_at is null or completed_at is not null)");
  });

  it("releases only eligible cards when the host advances to the next tea", () => {
    expect(sql).toContain("old.current_flight_item_id is distinct from new.current_flight_item_id");
    expect(sql).toContain("response.event_flight_item_id = old.current_flight_item_id");
    expect(sql).toContain("response.completed_at is not null");
    expect(sql).toContain("response.stamp_released_at is null");
  });

  it("releases every remaining eligible card when the host ends the event", () => {
    expect(sql).toContain("new.status = 'completed' and old.status is distinct from new.status");
    expect(sql).toContain("flight.event_id = new.id");
    expect(sql).toContain("after update of current_flight_item_id, status on public.events");
  });

  it("handles a guest submission racing the host transition", () => {
    expect(sql).toContain("release_late_tasting_stamp_after_host_progress");
    expect(sql).toContain("event_current_flight_item_id is distinct from new.event_flight_item_id");
    expect(sql).toContain("before insert or update of completed_at, event_flight_item_id on public.tea_responses");
  });

  it("preserves stamps for historical completed events without pre-stamping live events", () => {
    expect(sql).toContain("event.status = 'completed'");
    expect(sql).not.toContain("event.status = 'live'");
  });
});
