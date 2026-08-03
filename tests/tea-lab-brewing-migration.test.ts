import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TEA_LAB_BREWING_STYLE_IDS } from "@/lib/tea-lab/offline";

const migrationPath = fileURLToPath(new URL(
  "../supabase/migrations/0023_tea_lab_brewing_styles.sql",
  import.meta.url
));
const sql = readFileSync(migrationPath, "utf8");
const compactSql = sql.replace(/\s+/g, " ").toLowerCase();

describe("Tea Lab brewing styles migration", () => {
  it("adds style metadata and ordered, owner-consistent stage records", () => {
    expect(compactSql).toContain("add column if not exists brewing_style text");
    expect(compactSql).toContain("create table public.tasting_card_brew_stages");
    expect(compactSql).toContain("primary key (card_id,stage_number)");
    expect(compactSql).toContain("foreign key (card_id,owner_user_id) references public.tasting_cards(id,owner_user_id) on delete cascade");
    expect(compactSql).toContain("stage_number between 1 and 20");
    for (const style of TEA_LAB_BREWING_STYLE_IDS) expect(compactSql).toContain(`'${style}'`);
  });

  it("keeps stage prose owner-private and authenticated access read-only", () => {
    expect(compactSql).toContain("alter table public.tasting_card_brew_stages enable row level security");
    expect(compactSql).toContain("revoke all on public.tasting_card_brew_stages from public,anon,authenticated");
    expect(compactSql).toContain("for select to authenticated using (owner_user_id=auth.uid())");
    expect(compactSql).toContain("grant select on public.tasting_card_brew_stages to authenticated");
    expect(compactSql).not.toMatch(/grant\s+(?:insert|update|delete|all)\s+on\s+public\.tasting_card_brew_stages\s+to\s+authenticated/);
  });

  it("extends the atomic save operation without weakening revision or idempotency checks", () => {
    expect(compactSql).toContain("create or replace function public.save_solo_tasting_session_v2");
    expect(compactSql).toContain("v_session := public.save_solo_tasting_session(");
    expect(compactSql).toContain("its request fingerprint already covers the complete p_brewing document");
    expect(compactSql).toContain("delete from public.tasting_card_brew_stages where card_id=p_card_id and owner_user_id=v_owner_id");
    expect(compactSql).toContain("grant execute on function public.save_solo_tasting_session_v2(uuid,uuid,uuid,integer,jsonb,jsonb,jsonb,jsonb,uuid[]) to authenticated,service_role");
  });
});
