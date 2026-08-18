import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {describe,expect,it} from "vitest";

const source=(path:string)=>readFileSync(resolve(process.cwd(),path),"utf8");
const migration=source("supabase/migrations/0034_small_tasting_rooms.sql");
const commandRoute=source("src/app/api/events/[eventId]/command/route.ts");
const stateRoute=source("src/app/api/events/[eventId]/state/route.ts");
const tokenRoute=source("src/app/api/events/[eventId]/agora-token/route.ts");

describe("authoritative small tasting rooms",()=>{
  it("stores sessions, rooms, members, explicit signals, snapshots, and observation revisions",()=>{
    for(const table of ["event_breakout_sessions","event_breakout_rooms","event_breakout_members","event_breakout_signals","tea_response_revisions"])expect(migration).toContain(`create table public.${table}`);
    expect(migration).toContain("current_breakout_session_id");
    expect(migration).toContain("breakout_room_id");
    expect(stateRoute).toContain("memberStatus");
  });

  it("runs launch, extend, and return under the existing host lease and sequence",()=>{
    expect(migration).toContain("create or replace function public.apply_breakout_command");
    expect(migration.indexOf("last_conductor_command_id=p_client_command_id")).toBeLessThan(migration.indexOf("stale_sequence"));
    for(const command of ["launch_breakouts","extend_breakouts","end_breakouts"]){expect(migration).toContain(`p_command='${command}'`);expect(commandRoute).toContain(command)}
    expect(commandRoute).toContain("assignBreakoutRooms");
    expect(commandRoute).toContain("breakoutPriorPairs");
    expect(migration).toContain("guard_active_breakout_transition");
  });

  it("enforces table privacy in the database and never exposes host transcripts",()=>{
    expect(migration).toContain("breakout_member.breakout_room_id=event_chat_messages.breakout_room_id");
    expect(migration).toContain("breakout_member.breakout_room_id=event_reactions.breakout_room_id");
    expect(migration).toContain("no audio or transcript is captured");
    expect(migration).toContain("never what others said");
    expect(migration).toContain("scrub_deleted_participant_live_content");
    expect(migration).not.toContain("sentiment");
  });

  it("issues media credentials only for the requesting guest's authoritative assignment",()=>{
    expect(tokenRoute).toContain("agoraBreakoutChannelName");
    expect(tokenRoute).toContain('member.breakout_room_id!==requestedBreakoutRoomId');
    expect(tokenRoute).toContain('identity.kind!=="guest"');
  });
});
