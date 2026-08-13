import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migrationPath = fileURLToPath(new URL(
  "../supabase/migrations/0028_tea_lab_card_descriptor_limit.sql",
  import.meta.url
));
const compactSql = readFileSync(migrationPath, "utf8").replace(/\s+/g, " ").toLowerCase();

describe("Tea Lab card descriptor limit migration", () => {
  it("raises the ordered card descriptor position limit to five", () => {
    expect(compactSql).toContain("public.tasting_card_descriptors");
    expect(compactSql).toContain("pg_get_constraintdef(oid)");
    expect(compactSql).toContain("check (position between 1 and 5) not valid");
    expect(compactSql).toContain("validate constraint tasting_card_descriptors_position_max_five");
  });

  it("does not widen customer table grants", () => {
    expect(compactSql).not.toMatch(/grant\s+(?:insert|update|delete|all)/);
  });
});
