import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migrationPath = fileURLToPath(new URL(
  "../supabase/migrations/0018_tea_lab_foundation.sql",
  import.meta.url
));
const sql = readFileSync(migrationPath, "utf8");
const compactSql = sql.replace(/\s+/g, " ").toLowerCase();

const teaLabTables = [
  "flavor_descriptors",
  "personal_tea_records",
  "tasting_sessions",
  "tasting_cards",
  "brewing_setups",
  "tasting_card_private_notes",
  "tasting_card_descriptors",
  "tea_lab_operations"
];

const ownerTables = [
  "personal_tea_records",
  "tasting_sessions",
  "tasting_cards",
  "brewing_setups",
  "tasting_card_private_notes",
  "tasting_card_descriptors"
];

describe("Tea Lab foundation migration", () => {
  it("creates only additive Tea Lab tables and preserves live-event records", () => {
    for (const table of teaLabTables) {
      expect(compactSql).toContain(`create table public.${table}`);
    }

    for (const liveTable of ["events", "event_flight_items", "participants", "tea_responses"]) {
      expect(compactSql).not.toMatch(new RegExp(`(?:alter table|update|delete from|insert into) public\\.${liveTable}\\b`));
    }
  });

  it("enforces owner-consistent relationships and deletion cascades", () => {
    expect(compactSql).toContain("foreign key(session_id,owner_user_id) references public.tasting_sessions(id,owner_user_id) on delete cascade");
    expect(compactSql).toContain("foreign key(personal_tea_record_id,owner_user_id) references public.personal_tea_records(id,owner_user_id)");
    expect(compactSql).toContain("foreign key(card_id,owner_user_id) references public.tasting_cards(id,owner_user_id) on delete cascade");
    expect(compactSql).toContain("check (num_nonnulls(canonical_tea_id,personal_tea_record_id)=1)");
  });

  it("enables row-level security and keeps authenticated access read-only", () => {
    for (const table of teaLabTables) {
      expect(compactSql).toContain(`alter table public.${table} enable row level security`);
      expect(compactSql).toContain(`revoke all on public.${table} from public,anon,authenticated`);
    }
    for (const table of ownerTables) {
      expect(compactSql).toContain(`on public.${table} for select to authenticated using (owner_user_id=auth.uid())`);
      expect(compactSql).toContain(`grant select on public.${table} to authenticated`);
    }
    expect(compactSql).not.toMatch(/grant\s+(?:insert|update|delete|all)\s+on\s+public\.(?:personal_tea_records|tasting_sessions|tasting_cards|brewing_setups|tasting_card_private_notes|tasting_card_descriptors)\s+to\s+authenticated/);
  });

  it("makes completion owner-scoped, revision-checked, rating-gated, and idempotent", () => {
    expect(compactSql).toContain("create or replace function public.complete_tasting_session");
    expect(compactSql).toContain("v_owner_id uuid := auth.uid()");
    expect(compactSql).toContain("where id=p_session_id and owner_user_id=v_owner_id for update");
    expect(compactSql).toContain("if v_session.revision<>p_expected_revision then raise exception 'tea_lab_stale_revision'");
    expect(compactSql).toContain("if v_card_count<>1 then raise exception 'tea_lab_solo_requires_one_card'");
    expect(compactSql).toContain("if v_card.rating is null then raise exception 'tea_lab_rating_required'");
    expect(compactSql).toContain("operation_type<>'complete_session'");
    expect(compactSql).toContain("status='completed'");
    expect(compactSql).toContain("pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_operation_id::text,0))");
  });

  it("keeps deletion owner-scoped and retains an idempotency receipt after cascade", () => {
    expect(compactSql).toContain("create or replace function public.delete_tasting_session");
    expect(compactSql).toContain("operation_type<>'delete_session'");
    expect(compactSql).toContain("values(p_operation_id,v_owner_id,'delete_session',p_session_id,'delete',jsonb_build_object('deleted',true))");
    expect(compactSql).toContain("delete from public.tasting_sessions where id=p_session_id and owner_user_id=v_owner_id");
    expect(compactSql).not.toContain("target_id uuid not null references public.tasting_sessions");
  });

  it("expires operation receipts and restricts cleanup to the service role", () => {
    expect(compactSql).toContain("expires_at timestamptz not null default (now()+interval '30 days')");
    expect(compactSql).toContain("create or replace function public.purge_expired_tea_lab_operations()");
    expect(compactSql).toContain("revoke all on function public.purge_expired_tea_lab_operations() from public,anon,authenticated");
    expect(compactSql).toContain("grant execute on function public.purge_expired_tea_lab_operations() to service_role");
  });

  it("seeds the shipped descriptor vocabulary with stable IDs", () => {
    const seededDescriptors = sql.match(/'10000000-0000-4000-8000-0000000000(?:0[1-9]|1[0-2])'/g) ?? [];
    expect(seededDescriptors).toHaveLength(12);
    for (const legacy of ["honeyed", "orchid", "buttery", "toasted grain", "stone fruit", "cream", "green bean", "jasmine", "caramel", "mineral", "citrus peel", "sweet hay"]) {
      expect(compactSql).toContain(`array['${legacy}']`);
    }
  });
});
