import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {describe,expect,it} from "vitest";

const source=(path:string)=>readFileSync(resolve(process.cwd(),path),"utf8");
const migration=source("supabase/migrations/0035_room_discovery_cards.sql");
const command=source("src/app/api/events/[eventId]/command/route.ts");
const guestAction=source("src/app/api/events/[eventId]/discovery-cards/route.ts");
const generator=source("src/lib/discovery-cards-server.ts");

describe("authoritative room discovery cards",()=>{
  it("creates one canonical card per breakout room, atomic items, a presentation state, and lock-on-return",()=>{
    for(const table of ["room_discovery_cards","room_discovery_card_items","event_discovery_presentations"])expect(migration).toContain(`create table public.${table}`);
    expect(migration).toContain("breakout_room_id uuid not null unique");
    expect(migration).toContain("unique(card_id,category,normalized_key)");
    expect(migration).toContain("lock_room_discovery_card");
    expect(migration).toContain("locked_at=coalesce(locked_at,now())");
  });

  it("keeps card and presenter commands under the existing host lease and sequence",()=>{
    expect(migration).toContain("create or replace function public.apply_discovery_presentation_command");
    expect(migration).toContain("lease_row.lease_token<>p_lease_token");
    expect(migration).toContain("event_row.sequence_number<>p_expected_sequence");
    for(const action of ["open_discovery_card","compare_discovery_card","surface_discovery_curiosity","close_discovery_cards","invite_discovery_spokesperson","complete_discovery_share"]){expect(migration).toContain(action);expect(command).toContain(action)}
  });

  it("generates only from structured sensory fields and protects table/private content",()=>{
    for(const field of ["first_impression","descriptors","intensity"])expect(generator).toContain(field);
    expect(generator).not.toContain("personal_notes");
    expect(generator).not.toContain("event_chat_messages");
    expect(migration).toContain("private notes, table chat, audio, or transcripts");
    expect(guestAction).toContain("Only members of this table can change its card");
    expect(guestAction).toContain("This card locked when the table returned");
    expect(migration).toContain("Removing an item never changes a participant tea response or revision");
  });
});
