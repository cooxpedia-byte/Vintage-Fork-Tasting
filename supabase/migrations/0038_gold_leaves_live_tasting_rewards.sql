-- Gold Leaves live-tasting rewards use the canonical loyalty wallet and ledger.
-- Prerequisite: the production Tea Merchant + loyalty connection migrations that
-- define merchant_wallets, merchant_ledger_entries, and post_gold_leaves_entry.
-- Agora media, tasting observations, chat, reactions, Cheers, and discovery
-- content never determine an award amount or write to the wallet directly.

do $$
begin
  if to_regclass('public.merchant_wallets') is null
    or to_regclass('public.merchant_ledger_entries') is null
    or to_regprocedure('public.post_gold_leaves_entry(uuid,text,bigint,text,text,text,text,jsonb,boolean)') is null
  then
    raise exception 'canonical_gold_leaves_service_required';
  end if;
end $$;

create table public.live_tasting_reward_policies(
  id uuid primary key default gen_random_uuid(),
  rule_version text not null unique check(char_length(rule_version) between 3 and 60),
  active boolean not null default false,
  event_completion_leaves integer not null check(event_completion_leaves between 1 and 1000),
  max_leaves_per_participant_event integer not null check(max_leaves_per_participant_event between 1 and 1000),
  minimum_presence_seconds integer not null check(minimum_presence_seconds between 0 and 14400),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(event_completion_leaves<=max_leaves_per_participant_event)
);

create unique index live_tasting_reward_policy_active_idx
  on public.live_tasting_reward_policies(active) where active;

-- Five Leaves is the centrally governed V1 launch policy: one modest Study
-- Copy-scale acknowledgment, not a permanent hard-coded product entitlement.
insert into public.live_tasting_reward_policies(
  rule_version,active,event_completion_leaves,max_leaves_per_participant_event,minimum_presence_seconds
) values ('live-v1',true,5,5,600);

create table public.event_live_reward_settings(
  event_id uuid primary key references public.events(id) on delete cascade,
  policy_id uuid not null references public.live_tasting_reward_policies(id) on delete restrict,
  reward_mode_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.event_live_reward_completion_overrides(
  event_id uuid not null references public.events(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  granted_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key(event_id,participant_id)
);

create table public.event_live_reward_awards(
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  participant_id uuid references public.participants(id) on delete set null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reward_type text not null check(reward_type in ('event_complete')),
  amount integer not null check(amount between 1 and 1000),
  rule_version text not null,
  idempotency_key text not null unique check(char_length(idempotency_key) between 8 and 240),
  status text not null default 'queued' check(status in ('queued','processing','awarded','retry')),
  canonical_entry_id uuid unique references public.merchant_ledger_entries(id) on delete restrict,
  attempts integer not null default 0 check(attempts between 0 and 100),
  next_retry_at timestamptz not null default now(),
  last_error_code text,
  awarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(event_id,user_id,reward_type)
);

create index event_live_reward_awards_retry_idx
  on public.event_live_reward_awards(status,next_retry_at)
  where status in ('queued','retry');
create index event_live_reward_awards_event_idx
  on public.event_live_reward_awards(event_id,status,created_at desc);

alter table public.live_tasting_reward_policies enable row level security;
alter table public.event_live_reward_settings enable row level security;
alter table public.event_live_reward_completion_overrides enable row level security;
alter table public.event_live_reward_awards enable row level security;

revoke all on public.live_tasting_reward_policies,public.event_live_reward_settings,
  public.event_live_reward_completion_overrides,public.event_live_reward_awards
from public,anon,authenticated;
grant all on public.live_tasting_reward_policies,public.event_live_reward_settings,
  public.event_live_reward_completion_overrides,public.event_live_reward_awards
to service_role;

create or replace function public.initialize_live_tasting_reward_settings()
returns trigger language plpgsql security definer set search_path=public as $$
declare policy_id_value uuid;
begin
  select id into policy_id_value from public.live_tasting_reward_policies where active limit 1;
  if policy_id_value is not null then
    insert into public.event_live_reward_settings(event_id,policy_id,reward_mode_enabled)
    values(new.id,policy_id_value,true) on conflict(event_id) do nothing;
  end if;
  return new;
end $$;

create trigger events_initialize_live_rewards
after insert on public.events for each row execute function public.initialize_live_tasting_reward_settings();

-- Existing scheduled/live events can opt into V1; historical completed events
-- remain disabled so deployment never retroactively mints Leaves.
insert into public.event_live_reward_settings(event_id,policy_id,reward_mode_enabled)
select event.id,policy.id,event.status in ('scheduled','live')
from public.events event
cross join lateral(select id from public.live_tasting_reward_policies where active limit 1) policy
on conflict(event_id) do nothing;

create or replace function public.apply_live_tasting_reward_command(
  p_event_id uuid,p_command text,p_expected_sequence bigint,p_lease_token uuid,
  p_client_command_id uuid,p_payload jsonb default '{}'::jsonb
) returns public.events
language plpgsql security definer set search_path=public as $$
declare
  event_row public.events;lease_row public.host_control_leases;participant_id_value uuid;
  policy_id_value uuid;enabled_value boolean;
begin
  select * into event_row from public.events where id=p_event_id for update;
  if event_row.id is null then raise exception 'event_not_found'; end if;
  if not public.can_manage_event(p_event_id,auth.uid()) then raise exception 'not_authorized'; end if;
  select * into lease_row from public.host_control_leases where event_id=p_event_id for update;
  if lease_row.event_id is null or lease_row.holder_user_id<>auth.uid()
    or lease_row.lease_token<>p_lease_token or lease_row.expires_at<=now()
  then raise exception 'lease_lost'; end if;
  if p_client_command_id is not null and event_row.last_conductor_command_id=p_client_command_id then return event_row; end if;
  if event_row.sequence_number<>p_expected_sequence then raise exception 'stale_sequence'; end if;
  if event_row.phase='ended' or event_row.status<>'live' then raise exception 'event_not_live'; end if;

  select id into policy_id_value from public.live_tasting_reward_policies where active limit 1;
  if policy_id_value is null then raise exception 'reward_policy_unavailable'; end if;
  insert into public.event_live_reward_settings(event_id,policy_id,reward_mode_enabled)
    values(p_event_id,policy_id_value,true) on conflict(event_id) do nothing;

  if p_command='set_reward_mode' then
    enabled_value=coalesce((p_payload->>'rewardModeEnabled')::boolean,true);
    update public.event_live_reward_settings set reward_mode_enabled=enabled_value,updated_at=now()
      where event_id=p_event_id;
  elsif p_command='grant_reward_completion' then
    participant_id_value=(p_payload->>'participantId')::uuid;
    if not exists(select 1 from public.participants participant where participant.id=participant_id_value
      and participant.event_id=p_event_id and participant.status<>'removed')
    then raise exception 'reward_participant_unavailable'; end if;
    insert into public.event_live_reward_completion_overrides(event_id,participant_id,granted_by)
      values(p_event_id,participant_id_value,auth.uid()) on conflict(event_id,participant_id) do nothing;
  else raise exception 'unknown_command';
  end if;

  event_row.sequence_number=event_row.sequence_number+1;
  event_row.conductor_id=auth.uid();event_row.last_conductor_command_id=p_client_command_id;event_row.updated_at=now();
  update public.events set sequence_number=event_row.sequence_number,conductor_id=event_row.conductor_id,
    last_conductor_command_id=event_row.last_conductor_command_id,updated_at=event_row.updated_at
    where id=event_row.id returning * into event_row;
  insert into public.event_state_log(event_id,sequence_number,command,phase,actor_user_id,payload)
    values(event_row.id,event_row.sequence_number,p_command,event_row.phase,auth.uid(),jsonb_build_object(
      'client_command_id',p_client_command_id,'reward_mode_enabled',p_payload->>'rewardModeEnabled',
      'manual_completion_participant_id',p_payload->>'participantId'
    ));
  return event_row;
end $$;

create or replace function public.queue_live_tasting_completion_rewards(p_event_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  event_row public.events;settings_row public.event_live_reward_settings;
  policy_row public.live_tasting_reward_policies;participant_row public.participants;
  queued_count integer:=0;award_amount integer;
begin
  select * into event_row from public.events where id=p_event_id;
  if event_row.id is null then raise exception 'event_not_found'; end if;
  if event_row.status<>'completed' or event_row.phase<>'ended' then raise exception 'event_not_complete'; end if;
  select * into settings_row from public.event_live_reward_settings where event_id=p_event_id;
  if settings_row.event_id is null or not settings_row.reward_mode_enabled then
    return jsonb_build_object('queued',0,'reward_mode_enabled',false);
  end if;
  select * into policy_row from public.live_tasting_reward_policies where id=settings_row.policy_id;
  if policy_row.id is null then raise exception 'reward_policy_unavailable'; end if;
  award_amount=least(policy_row.event_completion_leaves,policy_row.max_leaves_per_participant_event);

  for participant_row in
    select participant.* from public.participants participant
    where participant.event_id=p_event_id and participant.user_id is not null and participant.status<>'removed'
      and (
        exists(select 1 from public.event_live_reward_completion_overrides completion_override
          where completion_override.event_id=p_event_id and completion_override.participant_id=participant.id)
        or (
          participant.joined_at is not null and participant.last_seen_at is not null
          and extract(epoch from (participant.last_seen_at-participant.joined_at))>=policy_row.minimum_presence_seconds
          and exists(
            select 1 from public.tea_responses response
            join public.event_flight_items flight_item on flight_item.id=response.event_flight_item_id
            where response.participant_id=participant.id and flight_item.event_id=p_event_id
              and response.completed_at is not null
          )
        )
      )
  loop
    insert into public.event_live_reward_awards(
      event_id,participant_id,user_id,reward_type,amount,rule_version,idempotency_key
    ) values(
      p_event_id,participant_row.id,participant_row.user_id,'event_complete',award_amount,policy_row.rule_version,
      format('live-tasting:%s:%s:event-complete:%s',p_event_id,participant_row.id,policy_row.rule_version)
    ) on conflict(event_id,user_id,reward_type) do nothing;
    if found then queued_count=queued_count+1; end if;
  end loop;
  return jsonb_build_object('queued',queued_count,'reward_mode_enabled',true,'rule_version',policy_row.rule_version);
end $$;

create or replace function public.process_live_tasting_rewards(p_event_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  award_row public.event_live_reward_awards;wallet_id_value uuid;entry_id_value uuid;
  awarded_count integer:=0;retry_count integer:=0;
begin
  for award_row in
    select award.* from public.event_live_reward_awards award
    where award.status in ('queued','retry') and award.next_retry_at<=now() and award.attempts<12
      and (p_event_id is null or award.event_id=p_event_id)
    order by award.created_at for update skip locked
  loop
    begin
      update public.event_live_reward_awards set status='processing',attempts=attempts+1,updated_at=now()
        where id=award_row.id;
      insert into public.merchant_wallets(owner_user_id) values(award_row.user_id)
        on conflict(owner_user_id) do nothing;
      select wallet.id into wallet_id_value from public.merchant_wallets wallet
        where wallet.owner_user_id=award_row.user_id;
      entry_id_value=public.post_gold_leaves_entry(
        p_wallet_id=>wallet_id_value,p_entry_type=>'adjustment',p_leaves_delta=>award_row.amount,
        p_source=>'live_tasting',p_source_reference=>award_row.event_id::text,
        p_idempotency_key=>award_row.idempotency_key,
        p_description=>'Gold Leaves earned for completing a live tea tasting',
        p_metadata=>jsonb_build_object('event_id',award_row.event_id,'reward_type',award_row.reward_type,'rule_version',award_row.rule_version),
        p_allow_negative_balance=>false
      );
      update public.event_live_reward_awards set status='awarded',canonical_entry_id=entry_id_value,
        awarded_at=coalesce(awarded_at,now()),last_error_code=null,updated_at=now() where id=award_row.id;
      awarded_count=awarded_count+1;
    exception when others then
      update public.event_live_reward_awards set status='retry',attempts=attempts+1,last_error_code=sqlstate,
        next_retry_at=now()+make_interval(secs=>least(3600,60*(award_row.attempts+1))),updated_at=now()
        where id=award_row.id;
      retry_count=retry_count+1;
    end;
  end loop;
  return jsonb_build_object('awarded',awarded_count,'retry',retry_count);
end $$;

revoke all on function public.apply_live_tasting_reward_command(uuid,text,bigint,uuid,uuid,jsonb) from public,anon;
grant execute on function public.apply_live_tasting_reward_command(uuid,text,bigint,uuid,uuid,jsonb) to authenticated;
revoke all on function public.queue_live_tasting_completion_rewards(uuid) from public,anon,authenticated;
grant execute on function public.queue_live_tasting_completion_rewards(uuid) to service_role;
revoke all on function public.process_live_tasting_rewards(uuid) from public,anon,authenticated;
grant execute on function public.process_live_tasting_rewards(uuid) to service_role;
revoke execute on function public.initialize_live_tasting_reward_settings() from public,anon,authenticated;

comment on table public.event_live_reward_awards is
  'Idempotent live-event award bridge and retry state. Canonical balances and ledger entries remain in the shared Gold Leaves service.';
comment on function public.queue_live_tasting_completion_rewards(uuid) is
  'Queues one capped completion award from presence plus deliberate tasting participation or an audited host exception; no sensory correctness is evaluated.';
