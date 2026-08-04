import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TEA_DESCRIPTOR_PALETTE } from "@/lib/tea-lab/descriptors";

const migration = readFileSync(fileURLToPath(new URL(
  "../supabase/migrations/0024_tea_lab_descriptor_palette.sql",
  import.meta.url
)), "utf8");
const compactSql = migration.toLowerCase().replace(/\s+/g, "");

describe("Tea Lab descriptor palette migration", () => {
  it("upserts the exact application palette without removing linked descriptors", () => {
    const seededIds = migration.match(/\('(?:10000000|20000000)-0000-4000-8000-\d{12}'/g) ?? [];
    expect(seededIds).toHaveLength(81);

    for (const descriptor of TEA_DESCRIPTOR_PALETTE) {
      const aliases = descriptor.aliases.length > 0
        ? `array[${descriptor.aliases.map(alias => `'${alias}'`).join(",")}]`
        : "array[]::text[]";
      const expectedTuple = `('${descriptor.id}','${descriptor.slug}','${descriptor.label}','${descriptor.category}',${aliases},${descriptor.position})`;
      expect(compactSql).toContain(expectedTuple.toLowerCase().replace(/\s+/g, ""));
    }

    expect(compactSql).toContain("onconflict(id)doupdateset");
    expect(compactSql).toContain("active=true");
    expect(compactSql).not.toContain("deletefrompublic.flavor_descriptors");
    expect(compactSql).not.toContain("truncate");
  });
});
