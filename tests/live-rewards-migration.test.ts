import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {describe,expect,it} from "vitest";

const source=(path:string)=>readFileSync(resolve(process.cwd(),path),"utf8");
const migration=source("supabase/migrations/0038_gold_leaves_live_tasting_rewards.sql");
const command=source("src/app/api/events/[eventId]/command/route.ts");
const cron=source("src/app/api/cron/retention/route.ts");

describe("Gold Leaves live-tasting authority",()=>{
  it("requires and posts into the canonical loyalty service rather than creating a second wallet",()=>{
    expect(migration).toContain("canonical_gold_leaves_service_required");
    expect(migration).toContain("public.post_gold_leaves_entry(");
    expect(migration).toContain("references public.merchant_ledger_entries(id)");
    expect(migration).not.toMatch(/create table public\.merchant_wallets|create table public\.merchant_ledger_entries/);
    expect(migration).toContain("Canonical balances and ledger entries remain in the shared Gold Leaves service");
  });

  it("centrally versions a fixed completion award and hard participant/event cap",()=>{
    expect(migration).toContain("create table public.live_tasting_reward_policies");
    expect(migration).toContain("event_completion_leaves<=max_leaves_per_participant_event");
    expect(migration).toContain("values ('live-v1',true,5,5,600)");
    expect(migration).toContain("least(policy_row.event_completion_leaves,policy_row.max_leaves_per_participant_event)");
    expect(migration).not.toContain("tea_completion_leaves");
  });

  it("uses presence plus deliberate completion or an audited manual exception without sensory correctness",()=>{
    expect(migration).toContain("participant.last_seen_at-participant.joined_at");
    expect(migration).toContain("response.completed_at is not null");
    expect(migration).toContain("event_live_reward_completion_overrides");
    expect(migration).toContain("granted_by");
    expect(migration).not.toMatch(/descriptors|first_impression|rating|correct_index|camera|microphone/);
  });

  it("deduplicates, caps retries, and never blocks end_session when loyalty is delayed",()=>{
    expect(migration).toContain("unique(event_id,user_id,reward_type)");
    expect(migration).toContain("idempotency_key text not null unique");
    expect(migration).toContain("p_source=>'live_tasting'");
    expect(migration).toContain("status='retry',attempts=attempts+1");
    expect(command).toContain('logger.warn("live_reward_processing_deferred"');
    expect(cron).toContain('admin.rpc("process_live_tasting_rewards"');
  });

  it("keeps historical events disabled and all award processing service-only",()=>{
    expect(migration).toContain("event.status in ('scheduled','live')");
    expect(migration).toContain("grant execute on function public.queue_live_tasting_completion_rewards(uuid) to service_role");
    expect(migration).toContain("grant execute on function public.process_live_tasting_rewards(uuid) to service_role");
    expect(migration).toContain("revoke all on public.live_tasting_reward_policies");
  });
});
