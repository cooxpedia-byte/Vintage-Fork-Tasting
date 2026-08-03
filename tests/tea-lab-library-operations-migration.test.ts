import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migrationPath = fileURLToPath(new URL("../supabase/migrations/0020_tea_lab_library_operations.sql", import.meta.url));
const compactSql = readFileSync(migrationPath, "utf8").replace(/\s+/g, " ").toLowerCase();

describe("Tea Lab Library operations migration", () => {
  it("adds the personal-tea archive receipt without direct customer writes", () => {
    expect(compactSql).toContain("'archive_personal_tea'");
    expect(compactSql).not.toMatch(/grant\s+(?:insert|update|delete|all)\s+on\s+public\.personal_tea_records\s+to\s+authenticated/);
  });

  it("derives ownership from auth and makes archive or restore idempotent", () => {
    expect(compactSql).toContain("create or replace function public.set_personal_tea_record_archived");
    expect(compactSql).toContain("v_owner_id uuid := auth.uid()");
    expect(compactSql).not.toContain("p_owner_user_id");
    expect(compactSql).toContain("where id=p_personal_tea_id and owner_user_id=v_owner_id for update");
    expect(compactSql).toContain("v_operation.operation_type<>'archive_personal_tea'");
    expect(compactSql).toContain("v_operation.request_fingerprint<>v_fingerprint");
    expect(compactSql).toContain("archived_at=case when p_archived then coalesce(archived_at,clock_timestamp()) else null end");
    expect(compactSql).toContain("grant execute on function public.set_personal_tea_record_archived(uuid,uuid,boolean) to authenticated,service_role");
  });
});
