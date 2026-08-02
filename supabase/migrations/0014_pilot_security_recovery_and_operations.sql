-- Paid-pilot hardening: remove globally enumerable live state, make trivia
-- delivery idempotent/recoverable, retain reveal-sync evidence, and prove cron runs.

drop policy if exists public_state_read on public.event_public_state;
revoke all on public.event_public_state from anon, authenticated;
do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='event_public_state'
  ) then
    alter publication supabase_realtime drop table public.event_public_state;
  end if;
end $$;

alter table public.trivia_answers
  add column if not exists idempotency_key uuid,
  add column if not exists original_answered_at timestamptz,
  add column if not exists on_time boolean;

update public.trivia_answers
set idempotency_key=coalesce(idempotency_key,gen_random_uuid()),
    original_answered_at=coalesce(original_answered_at,answered_at),
    on_time=coalesce(on_time,true);

alter table public.trivia_answers
  alter column idempotency_key set not null,
  alter column original_answered_at set not null,
  alter column on_time set not null;
create unique index if not exists trivia_answers_idempotency_unique
  on public.trivia_answers(participant_id,idempotency_key);

create or replace view public.event_analytics as
select e.id as event_id,
  count(distinct p.id) filter (where p.status <> 'removed') as participants,
  count(distinct tr.participant_id) filter (where tr.completed_at is not null) as completed_participants,
  round(avg(tr.rating)::numeric,2) as average_rating,
  count(*) filter (where tr.saved) as tea_saves,
  count(ta.id) filter (where ta.on_time) as trivia_answers,
  count(ta.id) filter (where ta.on_time and ta.is_correct) as trivia_correct
from public.events e
left join public.participants p on p.event_id=e.id
left join public.event_flight_items fi on fi.event_id=e.id
left join public.tea_responses tr on tr.participant_id=p.id and tr.event_flight_item_id=fi.id
left join public.trivia_questions tq on tq.event_flight_item_id=fi.id
left join public.trivia_answers ta on ta.participant_id=p.id and ta.trivia_question_id=tq.id
group by e.id;

create table public.reveal_sync_samples (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.events(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  flight_item_id uuid not null references public.event_flight_items(id) on delete cascade,
  sequence_number bigint not null,
  reveal_at timestamptz not null,
  ready_at timestamptz,
  rendered_at timestamptz,
  clock_offset_ms integer,
  round_trip_ms integer,
  reveal_skew_ms integer,
  reduced_motion boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(participant_id,sequence_number)
);
alter table public.reveal_sync_samples enable row level security;
revoke all on public.reveal_sync_samples from public,anon,authenticated;
grant all on public.reveal_sync_samples to service_role;
grant usage,select on sequence public.reveal_sync_samples_id_seq to service_role;

create or replace function public.record_reveal_sync_sample(
  p_event_id uuid,
  p_participant_id uuid,
  p_flight_item_id uuid,
  p_sequence_number bigint,
  p_reveal_at timestamptz,
  p_ready_at timestamptz,
  p_rendered_at timestamptz,
  p_clock_offset_ms integer,
  p_round_trip_ms integer,
  p_reveal_skew_ms integer,
  p_reduced_motion boolean
) returns void language sql set search_path=public as $$
  insert into public.reveal_sync_samples(
    event_id,participant_id,flight_item_id,sequence_number,reveal_at,ready_at,rendered_at,
    clock_offset_ms,round_trip_ms,reveal_skew_ms,reduced_motion,updated_at
  ) values (
    p_event_id,p_participant_id,p_flight_item_id,p_sequence_number,p_reveal_at,p_ready_at,p_rendered_at,
    p_clock_offset_ms,p_round_trip_ms,p_reveal_skew_ms,p_reduced_motion,now()
  )
  on conflict(participant_id,sequence_number) do update set
    ready_at=coalesce(reveal_sync_samples.ready_at,excluded.ready_at),
    rendered_at=coalesce(reveal_sync_samples.rendered_at,excluded.rendered_at),
    clock_offset_ms=excluded.clock_offset_ms,
    round_trip_ms=excluded.round_trip_ms,
    reveal_skew_ms=coalesce(reveal_sync_samples.reveal_skew_ms,excluded.reveal_skew_ms),
    reduced_motion=excluded.reduced_motion,
    updated_at=now();
$$;
revoke all on function public.record_reveal_sync_sample(uuid,uuid,uuid,bigint,timestamptz,timestamptz,timestamptz,integer,integer,integer,boolean) from public,anon,authenticated;
grant execute on function public.record_reveal_sync_sample(uuid,uuid,uuid,bigint,timestamptz,timestamptz,timestamptz,integer,integer,integer,boolean) to service_role;

create table public.operational_job_runs (
  id bigint generated always as identity primary key,
  job_name text not null,
  status text not null check (status in ('succeeded','failed')),
  started_at timestamptz not null,
  completed_at timestamptz not null default now(),
  details jsonb not null default '{}'
);
create index operational_job_runs_latest_idx on public.operational_job_runs(job_name,completed_at desc);
alter table public.operational_job_runs enable row level security;
revoke all on public.operational_job_runs from public,anon,authenticated;
grant all on public.operational_job_runs to service_role;
grant usage,select on sequence public.operational_job_runs_id_seq to service_role;
