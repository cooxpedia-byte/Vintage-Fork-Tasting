import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {describe,expect,it} from "vitest";

const migration=readFileSync(resolve(process.cwd(),"supabase/migrations/0039_tea_discovery_identity.sql"),"utf8");

describe("tea discovery identity authority",()=>{
  it("keeps identity, history, loyalty, and certification as separate data concepts",()=>{
    expect(migration).toContain("create table public.discovery_identity_definitions");
    expect(migration).toContain("create table public.user_discovery_identities");
    expect(migration).toContain("Never credentials, scores, ranks, or Gold Leaves");
    expect(migration).not.toMatch(/create table public\.(merchant_wallets|merchant_ledger_entries)/);
    expect(migration).not.toMatch(/palate_score|accuracy_score|global_rank|reputation_points/);
  });

  it("derives evidence only from authoritative completed live and solo tasting cards",()=>{
    expect(migration).toContain("create or replace function public.authoritative_discovery_history");
    expect(migration).toContain("response.stamp_released_at is not null");
    expect(migration).toContain("session.status='completed'");
    expect(migration).toContain("card.completed_at is not null");
    expect(migration).not.toMatch(/event_chat_messages|event_reactions|trivia_answers|merchant_wallets|merchant_ledger_entries|event_breakout_members/);
  });

  it("ships eight versioned, warm identities with distinct-tea anti-farming thresholds",()=>{
    expect(migration.match(/'39000000-0000-4000-8000-00000000000[1-8]'/g)).toHaveLength(8);
    expect(migration).toContain("'curious-palate','Curious Palate'");
    expect(migration).toContain("'floral-explorer','Floral Explorer'");
    expect(migration).toContain("'tea-story-collector','Tea Story Collector'");
    expect(migration).toContain('"minimum_distinct_teas"');
    expect(migration).toContain("'discovery-v1'");
  });

  it("preserves earned history through corrections and records reproducible recalculations",()=>{
    expect(migration).toContain("create table public.discovery_identity_recalculations");
    expect(migration).toContain("last_evaluated_at");
    expect(migration).toContain("Earned identity stays in the collection");
    expect(migration).toContain("currentlyConfirmed");
    expect(migration).toContain("idempotency_key text not null unique");
  });

  it("keeps profiles private, limits featured identities, and makes calculation service-only",()=>{
    expect(migration).toContain("visibility text not null default 'private'");
    expect(migration).toContain(")>=2 then raise exception 'discovery_feature_limit'");
    expect(migration).toContain("user_discovery_identities_owner_read");
    expect(migration).toContain("grant execute on function public.recalculate_discovery_identities(uuid,uuid) to service_role");
    expect(migration).toContain("set_my_discovery_reveal_preference");
  });
});
