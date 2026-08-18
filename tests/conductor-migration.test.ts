import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration=readFileSync(resolve(process.cwd(),"supabase/migrations/0032_host_conductor_stages.sql"),"utf8");
const commandRoute=readFileSync(resolve(process.cwd(),"src/app/api/events/[eventId]/command/route.ts"),"utf8");
const signalRoute=readFileSync(resolve(process.cwd(),"src/app/api/events/[eventId]/stage-signal/route.ts"),"utf8");

describe("authoritative conductor persistence", () => {
  it("stores public stage state separately from the compatibility phase", () => {
    for (const column of ["conductor_stage","conductor_stage_started_at","conductor_stage_duration_seconds","conductor_paused_at","conductor_remaining_seconds","conductor_sequence_version"]) {
      expect(migration).toContain(column);
    }
    expect(migration).toContain("Separate from Agora transport and the legacy compatibility phase");
    expect(migration.toLocaleLowerCase()).not.toContain("agora channel");
  });

  it("applies host commands atomically, with idempotency before stale-sequence rejection", () => {
    expect(migration).toContain("create or replace function public.apply_conductor_command");
    expect(migration.indexOf("last_conductor_command_id=p_client_command_id")).toBeLessThan(migration.indexOf("stale_sequence"));
    expect(migration).toContain("where id=p_event_id for update");
    expect(migration).toContain("event_row.conductor_sequence_version=event_row.conductor_sequence_version+1");
    expect(commandRoute).toContain("conductorCommands.has(parsed.data.command)");
    expect(commandRoute).toContain('supabase.rpc("apply_conductor_command"');
  });

  it("uses server timestamps for brew and the synchronized reveal", () => {
    expect(migration).toContain("event_row.timer_ends_at=now()+make_interval(secs=>current_item.steep_seconds)");
    expect(migration).toContain("target_stage='reveal' then now()+interval '1500 milliseconds'");
    expect(migration).toContain("event_row.conductor_stage_started_at=now()");
  });

  it("keeps readiness low-content and exposes only aggregate host metrics", () => {
    expect(migration).toContain("create table public.event_stage_signals");
    expect(migration).toContain("signal text not null check (signal in ('ready','poured'))");
    expect(migration).toContain("create or replace function public.event_conductor_metrics");
    expect(signalRoute).toContain('.upsert({');
    expect(commandRoute).not.toContain("stage-signal");
  });
});
