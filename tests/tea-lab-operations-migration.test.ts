import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migrationPath = fileURLToPath(new URL(
  "../supabase/migrations/0019_tea_lab_protected_operations.sql",
  import.meta.url
));
const sql = readFileSync(migrationPath, "utf8");
const compactSql = sql.replace(/\s+/g, " ").toLowerCase();

describe("Tea Lab protected operations migration", () => {
  it("adds only the required operation classes without granting direct customer writes", () => {
    expect(compactSql).toContain("check (operation_type in ('sync_session','complete_session','archive_session','delete_session'))");
    expect(compactSql).not.toMatch(/grant\s+(?:insert|update|delete|all)\s+on\s+public\.(?:personal_tea_records|tasting_sessions|tasting_cards|brewing_setups|tasting_card_private_notes|tasting_card_descriptors)\s+to\s+authenticated/);
  });

  it("derives ownership from authentication and hides cross-owner records", () => {
    expect(compactSql).toContain("v_owner_id uuid := auth.uid()");
    expect(compactSql).not.toContain("p_owner_user_id");
    expect(compactSql).toContain("if v_session.owner_user_id<>v_owner_id then raise exception 'tea_lab_session_not_found'");
    expect(compactSql).toContain("if found and v_personal.owner_user_id<>v_owner_id then raise exception 'tea_lab_personal_tea_not_found'");
  });

  it("makes draft synchronization atomic, replay-safe, and revision checked", () => {
    expect(compactSql).toContain("create or replace function public.save_solo_tasting_session");
    expect(compactSql).toContain("security definer set search_path=public,pg_temp");
    expect(compactSql).toContain("pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_operation_id::text,0))");
    expect(compactSql).toContain("pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_session_id::text,1))");
    expect(compactSql).toContain("v_operation.operation_type<>'sync_session'");
    expect(compactSql).toContain("v_operation.request_fingerprint<>v_fingerprint");
    expect(compactSql).toContain("if v_session.revision<>p_expected_revision then raise exception 'tea_lab_stale_revision'");
    expect(compactSql).toContain("if p_expected_revision<>0 then raise exception 'tea_lab_stale_revision'");
    expect(compactSql).toContain("'private_notes',coalesce(p_private_notes,'{}'::jsonb)");
    expect(compactSql).toContain("encode(digest(");
    expect(compactSql).not.toMatch(/jsonb_build_object\([^;]*firstimpression/);
  });

  it("supports canonical and owner-private teas without mutating the permanent catalogue", () => {
    expect(compactSql).toContain("if v_tea_kind='canonical'");
    expect(compactSql).toContain("where id=v_canonical_tea_id and retired_at is null");
    expect(compactSql).toContain("elsif v_tea_kind='personal'");
    expect(compactSql).toContain("insert into public.personal_tea_records");
    expect(compactSql).not.toMatch(/(?:update|insert into|delete from) public\.teas\b/);
  });

  it("enforces the solo descriptor limit and preserves completion evidence during corrections", () => {
    expect(compactSql).toContain("if v_descriptor_count>3");
    expect(compactSql).toContain("or v_distinct_descriptor_count<>v_descriptor_count");
    expect(compactSql).toContain("where id=any(v_descriptor_ids) and active");
    expect(compactSql).toContain("if v_session.status='completed' and (p_card->>'rating') is null then raise exception 'tea_lab_rating_required'");
    expect(compactSql).toContain("status=case when status='completed' then status else 'in_progress' end");
    expect(compactSql).not.toMatch(/completed_at\s*=\s*null/);
  });

  it("makes archive and restore owner-scoped, revision checked, and idempotent", () => {
    expect(compactSql).toContain("create or replace function public.set_tasting_session_archived");
    expect(compactSql).toContain("v_operation.operation_type<>'archive_session'");
    expect(compactSql).toContain("where id=p_session_id and owner_user_id=v_owner_id for update");
    expect(compactSql).toContain("archived_at=case when p_archived then coalesce(archived_at,clock_timestamp()) else null end");
    expect(compactSql).toContain("grant execute on function public.set_tasting_session_archived(uuid,uuid,integer,boolean) to authenticated,service_role");
  });
});
