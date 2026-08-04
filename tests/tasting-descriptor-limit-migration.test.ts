import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migrationPath = fileURLToPath(new URL(
  "../supabase/migrations/0025_tasting_descriptor_limit.sql",
  import.meta.url
));
const sql = readFileSync(migrationPath, "utf8");
const compactSql = sql.replace(/\s+/g, " ").toLowerCase();

describe("tasting descriptor limit migration", () => {
  it("raises the live-tasting database limit to five", () => {
    expect(compactSql).toContain("tea_responses_descriptors_max_five");
    expect(compactSql).toContain("check (cardinality(descriptors) <= 5)");
    expect(compactSql).toContain("pg_get_constraintdef(oid)");
  });

  it("raises the protected Tea Lab save guard to five and fails closed on drift", () => {
    expect(compactSql).toContain("public.save_solo_tasting_session(uuid,uuid,uuid,integer,jsonb,jsonb,jsonb,jsonb,uuid[])");
    expect(compactSql).toContain("select pg_get_functiondef(v_signature)");
    expect(compactSql).toContain("'v_descriptor_count>5'");
    expect(compactSql).toContain("raise exception 'unexpected save_solo_tasting_session descriptor guard'");
  });

  it("does not widen direct customer write grants", () => {
    expect(compactSql).not.toMatch(/grant\s+(?:insert|update|delete|all)/);
  });
});
