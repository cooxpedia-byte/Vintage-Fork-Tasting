import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {describe,expect,it} from "vitest";

const source=(path:string)=>readFileSync(resolve(process.cwd(),path),"utf8");
const migration=source("supabase/migrations/0037_virtual_tea_cheers.sql");
const command=source("src/app/api/events/[eventId]/command/route.ts");
const state=source("src/app/api/events/[eventId]/state/route.ts");
const participantRoute=source("src/app/api/events/[eventId]/cheers/route.ts");

describe("Virtual Tea Cheers persistence boundary",()=>{
  it("stores one scheduled micro-moment and deduplicates each participant tap",()=>{
    expect(migration).toContain("create table public.event_cheers_sessions");
    expect(migration).toContain("create table public.event_cheers_participations");
    expect(migration).toContain("check(status in ('open','resolving','complete','cancelled'))");
    expect(migration).toContain("primary key(cheers_id,participant_id)");
    expect(migration).toContain("unique(cheers_id,client_id)");
    for(const field of ["opened_at","closes_at","resolve_at","triggered_by","sound_enabled"])expect(migration).toContain(field);
  });

  it("uses host lease, sequence, and client-command idempotency without changing stage",()=>{
    expect(migration).toContain("create or replace function public.apply_cheers_command");
    expect(migration).toContain("lease_row.lease_token<>p_lease_token");
    expect(migration).toContain("event_row.sequence_number<>p_expected_sequence");
    expect(migration).toContain("event_row.last_conductor_command_id=p_client_command_id");
    expect(command).toContain('supabase.rpc("apply_cheers_command"');
    expect(migration).not.toContain("conductor_stage=");
  });

  it("preserves privacy while retaining aggregate facilitation data",()=>{
    expect(migration).toContain("revoke all on public.event_cheers_sessions,public.event_cheers_participations from anon,authenticated");
    expect(participantRoute).toContain("loadHostCheers");
    expect(participantRoute).toContain("loadParticipantCheers");
    expect(state).toContain("participantId:participant.id");
    expect(participantRoute).not.toMatch(/camera|recording|screenshot/i);
  });

  it("lets timestamps resolve after host disconnect and keeps Agora as media only",()=>{
    expect(migration).toContain("resolve_at<=now()-interval '1650 milliseconds'");
    expect(migration).toContain("Agora continues to carry video and audio");
    expect(migration).not.toMatch(/agora[_-]rtc|agora channel/i);
  });
});
