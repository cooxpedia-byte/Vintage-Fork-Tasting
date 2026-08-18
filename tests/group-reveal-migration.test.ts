import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source=(path:string)=>readFileSync(resolve(process.cwd(),path),"utf8");
const migration=source("supabase/migrations/0036_group_discovery_consensus_reveal.sql");
const command=source("src/app/api/events/[eventId]/command/route.ts");
const state=source("src/app/api/events/[eventId]/state/route.ts");
const hostRoute=source("src/app/api/events/[eventId]/group-reveal/route.ts");

describe("group reveal persistence boundary",()=>{
  it("adds aroma inputs and an authoritative, versioned reveal record",()=>{
    expect(migration).toContain("add column aroma_descriptors");
    expect(migration).toContain("create table public.event_group_reveals");
    for(const field of ["reveal_state","revealed_at","room_card_ids","aroma_aggregate","taste_aggregate","timeline_events","post_reveal_entries","fingerprint_version","host_annotations"])expect(migration).toContain(field);
    expect(migration).toContain("check(reveal_state in ('hidden','aroma','taste','combined','timeline','fingerprint'))");
  });

  it("applies reveal commands through the host lease, sequence, and idempotency contract",()=>{
    expect(migration).toContain("create or replace function public.apply_group_reveal_command");
    expect(migration).toContain("lease_row.lease_token<>p_lease_token");
    expect(migration).toContain("event_row.sequence_number<>p_expected_sequence");
    expect(migration).toContain("event_row.last_conductor_command_id=p_client_command_id");
    expect(command).toContain('supabase.rpc("apply_group_reveal_command"');
    expect(command).toContain("groupRevealCommands");
  });

  it("builds fingerprints on the server after explicit event-manager authorization",()=>{
    expect(command).toContain("canManageAgoraEvent(user.id,profileResult.data?.role,fingerprintEvent)");
    expect(command).toContain("groupRevealFingerprint");
    expect(hostRoute).toContain("canManageAgoraEvent(user.id, profileResult.data?.role, eventResult.data)");
    expect(hostRoute.indexOf("canManageAgoraEvent")).toBeLessThan(hostRoute.indexOf("loadGroupRevealSnapshot({ admin"));
  });

  it("loads the same reveal snapshot for the participant without direct table privileges",()=>{
    expect(state).toContain("loadGroupRevealSnapshot");
    expect(state).toContain("participantId:participant.id");
    expect(migration).toContain("revoke all on public.event_group_reveals from anon,authenticated");
    expect(migration).not.toContain("event_group_reveals_participant_read");
  });

  it("keeps reveal authority separate from Agora media transport",()=>{
    expect(migration).toContain("Agora remains media transport");
    expect(migration.toLocaleLowerCase()).not.toContain("agora channel");
  });
});
