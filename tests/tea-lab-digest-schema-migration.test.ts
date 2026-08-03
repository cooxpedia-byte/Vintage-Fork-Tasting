import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migrationPath = fileURLToPath(new URL(
  "../supabase/migrations/0021_tea_lab_digest_schema.sql",
  import.meta.url
));
const sql = readFileSync(migrationPath, "utf8").replace(/\s+/g, " ").toLowerCase();

describe("Tea Lab hosted pgcrypto compatibility migration", () => {
  it("adds only the trusted extensions schema to the protected save function", () => {
    expect(sql).toContain("alter function public.save_solo_tasting_session(");
    expect(sql).toContain("set search_path=public,extensions,pg_temp");
    expect(sql).not.toMatch(/\b(?:create|alter|drop|truncate|delete from)\s+(?:table\s+)?public\./);
    expect(sql).not.toContain("grant ");
  });
});
