import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {describe,expect,it} from "vitest";

const source=(path:string)=>readFileSync(resolve(process.cwd(),path),"utf8");
const migration=source("supabase/migrations/0040_conversation_prompts.sql");
const command=source("src/app/api/events/[eventId]/command/route.ts");

describe("authoritative conversation prompts",()=>{
  it("stores a curated library, one active room prompt, and privacy-safe actions",()=>{
    for(const table of ["conversation_prompt_library","event_conversation_prompts","event_conversation_prompt_actions"])expect(migration).toContain(`create table public.${table}`);
    expect(migration).toContain("event_conversation_prompts_one_breakout_active_idx");
    expect(migration).toContain("no participant answer or transcript field exists");
  });

  it("keeps host publishing under the existing lease and sequence",()=>{
    expect(migration).toContain("create or replace function public.apply_conversation_prompt_command");
    expect(migration).toContain("lease_row.lease_token<>p_lease_token");
    expect(migration).toContain("event_row.sequence_number<>p_expected_sequence");
    for(const action of ["set_conversation_prompts_enabled","send_conversation_prompt"]){expect(migration).toContain(action);expect(command).toContain(action)}
  });

  it("enforces the First Sip and reveal boundaries without reading conversation content",()=>{
    expect(migration).toContain("Notice first. Name it when you''re ready.");
    expect(migration).toContain("not requires_reveal or allowed_stages");
    for(const forbidden of ["event_chat_messages","personal_notes","transcript","speech_detection"]){
      if(forbidden==="transcript")expect(migration.match(/transcript/gi)?.length).toBeLessThanOrEqual(3);
      else expect(migration).not.toContain(forbidden);
    }
  });
});
