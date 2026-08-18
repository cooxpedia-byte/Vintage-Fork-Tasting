import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {describe,expect,it} from "vitest";

const source=(path:string)=>readFileSync(resolve(process.cwd(),path),"utf8");
const migration=source("supabase/migrations/0041_living_tasting_map.sql");
const route=source("src/app/api/events/[eventId]/living-map/route.ts");
const command=source("src/app/api/events/[eventId]/command/route.ts");

describe("Living Tasting Map persistence boundary",()=>{
  it("stores the live round, immutable observations, projections, moderation, and the distinct fingerprint",()=>{
    for(const table of ["living_tasting_map_sessions","living_tasting_map_observation_events","living_tasting_map_snapshots","living_tasting_map_moderation_actions","living_tasting_map_fingerprints"])expect(migration).toContain(`create table public.${table}`);
    expect(migration).toContain("Immutable source of truth");
    expect(migration).toContain("final_snapshot jsonb not null");
    expect(migration).toContain("replay_manifest jsonb not null");
    expect(migration).toContain("generated_patterns jsonb not null");
  });

  it("keeps raw participant observations server-only while broadcasting anonymous snapshots",()=>{
    expect(migration).toContain("revoke all on public.living_tasting_map_sessions,public.living_tasting_map_observation_events");
    expect(migration).not.toMatch(/grant select on public\.living_tasting_map_observation_events/);
    expect(migration).not.toMatch(/create policy living_map_observation/);
    expect(migration).toContain("alter publication supabase_realtime add table public.living_tasting_map_snapshots");
    expect(route).toContain("participantId:context.viewer.kind===\"guest\"?context.viewer.id:null");
  });

  it("uses the existing host lease, sequence, and idempotency contract for every map command",()=>{
    expect(migration).toContain("create or replace function public.apply_living_tasting_map_command");
    expect(migration).toContain("lease_row.lease_token<>p_lease_token");
    expect(migration).toContain("event_row.sequence_number<>p_expected_sequence");
    expect(migration).toContain("event_row.last_conductor_command_id=p_client_command_id");
    for(const name of ["configure_living_map","start_living_map","pause_living_map","resume_living_map","freeze_living_map","start_living_map_replay","seek_living_map_replay","commit_living_map_fingerprint","reopen_living_map"])expect(command).toContain(name);
  });

  it("dual-writes active observations for the existing recap and keeps Agora video-only",()=>{
    expect(route).toContain('admin.from("tea_responses").upsert');
    expect(route).toContain('admin.from("living_tasting_map_observation_events").upsert');
    expect(route).not.toContain("agora-rtc-sdk-ng");
    expect(migration).toContain("Agora remains video transport");
  });
});
