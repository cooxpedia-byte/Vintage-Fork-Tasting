import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migrationPath = fileURLToPath(new URL(
  "../supabase/migrations/0022_tea_lab_tasting_photos.sql",
  import.meta.url
));
const sql = readFileSync(migrationPath, "utf8");
const compactSql = sql.replace(/\s+/g, " ").toLowerCase();

describe("Tea Lab private tasting photo migration", () => {
  it("binds every photo to an owner-consistent tasting card with cascade cleanup", () => {
    expect(compactSql).toContain("create table public.tasting_card_photos");
    expect(compactSql).toContain("foreign key(card_id,owner_user_id) references public.tasting_cards(id,owner_user_id) on delete cascade");
    expect(compactSql).toContain("storage_path like owner_user_id::text || '/' || card_id::text || '/' || id::text || '.%'");
  });

  it("keeps customer access owner-read-only and never exposes the bucket publicly", () => {
    expect(compactSql).toContain("alter table public.tasting_card_photos enable row level security");
    expect(compactSql).toContain("for select to authenticated using (owner_user_id=auth.uid())");
    expect(compactSql).toContain("revoke all on public.tasting_card_photos from public,anon,authenticated");
    expect(compactSql).toContain("grant select on public.tasting_card_photos to authenticated");
    expect(compactSql).not.toMatch(/grant\s+(?:insert|update|delete|all)\s+on\s+public\.tasting_card_photos\s+to\s+authenticated/);
    expect(compactSql).toContain("'tea-lab-photos', 'tea-lab-photos', false");
    expect(compactSql).not.toContain("create policy storage_");
  });

  it("limits count, size, and safe browser-displayable formats at the database boundary", () => {
    expect(compactSql).toContain("size_bytes between 1 and 8388608");
    expect(compactSql).toContain("content_type in ('image/jpeg','image/png','image/webp')");
    expect(compactSql).toContain("if v_count >= 6 then raise exception 'tea_lab_photo_limit_reached'");
    expect(compactSql).toContain("pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.card_id::text,0))");
    expect(compactSql).toContain("file_size_limit=excluded.file_size_limit");
  });
});
