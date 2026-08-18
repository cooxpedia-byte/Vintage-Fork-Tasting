import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe,expect,it } from "vitest";

const migration=readFileSync(resolve(process.cwd(),"supabase/migrations/0033_shared_brewing_experience.sql"),"utf8");
const commandRoute=readFileSync(resolve(process.cwd(),"src/app/api/events/[eventId]/command/route.ts"),"utf8");
const stateRoute=readFileSync(resolve(process.cwd(),"src/app/api/events/[eventId]/state/route.ts"),"utf8");

describe("authoritative shared brewing persistence",()=>{
  it("stores reconstructable brew instances and exact infusion notes",()=>{
    expect(migration).toContain("create table public.event_brews");
    for(const field of ["event_flight_item_id","infusion_number","started_at","duration_ms","status","paused_at","accumulated_pause_ms","host_id"]){
      expect(migration).toContain(field);
    }
    expect(migration).toContain("create table public.participant_brew_notes");
    expect(migration).toContain("primary key(participant_id,event_brew_id)");
    expect(migration).toContain("current_brew_id");
  });

  it("applies brew commands under the host lease with idempotency before stale rejection",()=>{
    expect(migration).toContain("create or replace function public.apply_shared_brew_command");
    expect(migration.indexOf("last_conductor_command_id=p_client_command_id")).toBeLessThan(migration.indexOf("stale_sequence"));
    for(const command of ["start_brew","restart_brew","start_next_infusion","end_brew_early"]){
      expect(migration).toContain(`p_command='${command}'`);
      expect(commandRoute).toContain(command);
    }
    expect(commandRoute).toContain('supabase.rpc("apply_shared_brew_command"');
  });

  it("keeps media transport out of the clock and gives reconnecting guests the brew record",()=>{
    expect(migration).toContain("Agora continues to carry media only");
    expect(migration).toContain("Clients calculate presentation time");
    expect(stateRoute).toContain('.from("event_brews")');
    expect(stateRoute).toContain("brew: currentBrewResult.data");
  });

  it("collects optional pouring and decanted signals as aggregates",()=>{
    expect(migration).toContain("'pouring','decanted'");
    expect(migration).toContain("'pouring',count(*)");
    expect(migration).toContain("'decanted',count(*)");
  });
});
