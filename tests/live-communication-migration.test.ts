import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/0031_live_tasting_communications.sql"), "utf8");
const retention = readFileSync(resolve(process.cwd(), "src/app/api/cron/retention/route.ts"), "utf8");

describe("live communication schema", () => {
  it("separates persistent chat, ephemeral reactions, read state and moderation evidence", () => {
    expect(migration).toContain("create table public.event_chat_messages");
    expect(migration).toContain("create table public.event_reactions");
    expect(migration).toContain("create table public.event_communication_reads");
    expect(migration).toContain("create table public.event_moderation_log");
    expect(migration).toContain("event_flight_item_id");
  });

  it("allows member reads for realtime but leaves all writes behind the authenticated API", () => {
    expect(migration).toContain("alter table public.event_chat_messages enable row level security");
    expect(migration).toContain("public.can_access_event_communication(event_id,auth.uid())");
    expect(migration).toContain("revoke all on public.event_chat_messages from anon,authenticated");
    expect(migration).toContain("grant select(id,event_id,author_kind,author_display_name");
    expect(migration).not.toContain("grant insert on public.event_chat_messages to authenticated");
    expect(migration).not.toContain("grant update on public.event_chat_messages to authenticated");
  });

  it("does not expose reaction sender identity through the realtime column grant", () => {
    expect(migration).toContain("grant select(id,event_id,reaction_type,event_flight_item_id,client_id,created_at)");
    expect(migration).not.toContain("grant select on public.event_reactions to authenticated");
    expect(migration).toContain("alter publication supabase_realtime add table public.event_reactions");
  });

  it("keeps reactions short-lived while chat persists with the event", () => {
    expect(retention).toContain('admin.from("event_reactions").delete()');
    expect(retention).toContain("7 * 24 * 60 * 60 * 1000");
    expect(retention).not.toContain('admin.from("event_chat_messages").delete()');
  });
});
