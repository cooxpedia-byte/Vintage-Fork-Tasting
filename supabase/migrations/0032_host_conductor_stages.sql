-- A fine-grained tasting conductor runs beside the legacy session phase.
-- Agora remains media transport; this state is the authoritative room clock.

alter table public.events
  add column conductor_stage text not null default 'arrival',
  add column conductor_stage_started_at timestamptz not null default now(),
  add column conductor_stage_duration_seconds integer,
  add column conductor_paused_at timestamptz,
  add column conductor_remaining_seconds integer,
  add column conductor_sequence_version integer not null default 1,
  add column conductor_id uuid references public.profiles(id) on delete set null,
  add column last_conductor_command_id uuid,
  add constraint events_conductor_stage_check check (conductor_stage in (
    'arrival','prepare','brew','aroma','first_sip','explore','discuss','reveal','debrief','close_tea','transition'
  )),
  add constraint events_conductor_duration_check check (conductor_stage_duration_seconds is null or conductor_stage_duration_seconds between 1 and 7200),
  add constraint events_conductor_remaining_check check (conductor_remaining_seconds is null or conductor_remaining_seconds between 0 and 7200);

update public.events
set conductor_stage = case phase
  when 'lobby' then 'arrival'
  when 'welcome' then 'prepare'
  when 'reveal' then 'prepare'
  when 'brewing' then 'brew'
  when 'trivia' then 'discuss'
  when 'recap' then 'transition'
  when 'ended' then 'transition'
  else 'explore'
end,
conductor_stage_started_at=coalesce(updated_at,now()),
conductor_stage_duration_seconds=case when phase='brewing' and timer_started_at is not null and timer_ends_at is not null
  then greatest(1,ceil(extract(epoch from (timer_ends_at-timer_started_at)))::integer)
  else null end;

alter table public.event_public_state
  add column conductor_stage text not null default 'arrival',
  add column conductor_stage_started_at timestamptz not null default now(),
  add column conductor_stage_duration_seconds integer,
  add column conductor_paused_at timestamptz,
  add column conductor_remaining_seconds integer,
  add column conductor_sequence_version integer not null default 1;

update public.event_public_state state
set conductor_stage=event.conductor_stage,
    conductor_stage_started_at=event.conductor_stage_started_at,
     conductor_stage_duration_seconds=event.conductor_stage_duration_seconds,
     conductor_paused_at=event.conductor_paused_at,
     conductor_remaining_seconds=event.conductor_remaining_seconds,
     conductor_sequence_version=event.conductor_sequence_version
from public.events event
where event.id=state.event_id;

create table public.event_stage_signals (
  event_id uuid not null references public.events(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  event_flight_item_id uuid not null references public.event_flight_items(id) on delete cascade,
  stage text not null check (stage in ('prepare','brew')),
  signal text not null check (signal in ('ready','poured')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(event_id,participant_id,event_flight_item_id,stage)
);

create index event_stage_signals_event_stage_idx
  on public.event_stage_signals(event_id,event_flight_item_id,stage,signal);

alter table public.event_stage_signals enable row level security;
create policy event_stage_signals_member_read on public.event_stage_signals
  for select to authenticated
  using (
    public.can_manage_event(event_id,auth.uid())
    or exists(
      select 1 from public.participants participant
      where participant.id=event_stage_signals.participant_id
        and participant.event_id=event_stage_signals.event_id
        and participant.user_id=auth.uid()
        and participant.status <> 'removed'
    )
  );
revoke all on public.event_stage_signals from anon,authenticated;
grant select(event_id,participant_id,event_flight_item_id,stage,signal,created_at,updated_at)
  on public.event_stage_signals to authenticated;

create or replace function public.sync_event_public_state() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  insert into public.event_public_state(
    event_id,status,phase,sequence_number,current_flight_item_id,reveal_at,timer_ends_at,trivia_closes_at,
    conductor_stage,conductor_stage_started_at,conductor_stage_duration_seconds,conductor_paused_at,
    conductor_remaining_seconds,conductor_sequence_version,updated_at
  ) values(
    new.id,new.status,new.phase,new.sequence_number,new.current_flight_item_id,new.reveal_at,new.timer_ends_at,new.trivia_closes_at,
    new.conductor_stage,new.conductor_stage_started_at,new.conductor_stage_duration_seconds,new.conductor_paused_at,
    new.conductor_remaining_seconds,new.conductor_sequence_version,new.updated_at
  )
  on conflict(event_id) do update set
    status=excluded.status,
    phase=excluded.phase,
    sequence_number=excluded.sequence_number,
    current_flight_item_id=excluded.current_flight_item_id,
    reveal_at=excluded.reveal_at,
    timer_ends_at=excluded.timer_ends_at,
    trivia_closes_at=excluded.trivia_closes_at,
    conductor_stage=excluded.conductor_stage,
    conductor_stage_started_at=excluded.conductor_stage_started_at,
    conductor_stage_duration_seconds=excluded.conductor_stage_duration_seconds,
    conductor_paused_at=excluded.conductor_paused_at,
    conductor_remaining_seconds=excluded.conductor_remaining_seconds,
    conductor_sequence_version=excluded.conductor_sequence_version,
    updated_at=excluded.updated_at;
  return new;
end $$;

drop trigger if exists events_public_state_sync on public.events;
create trigger events_public_state_sync
after insert or update of status,phase,sequence_number,current_flight_item_id,reveal_at,timer_ends_at,trivia_closes_at,
  conductor_stage,conductor_stage_started_at,conductor_stage_duration_seconds,conductor_paused_at,
  conductor_remaining_seconds,conductor_sequence_version on public.events
for each row execute function public.sync_event_public_state();

create or replace function public.apply_conductor_command(
  p_event_id uuid,
  p_command text,
  p_expected_sequence bigint,
  p_lease_token uuid,
  p_client_command_id uuid,
  p_payload jsonb default '{}'::jsonb
)
returns public.events
language plpgsql security definer set search_path=public as $$
declare
  event_row public.events;
  lease_row public.host_control_leases;
  current_item public.event_flight_items;
  next_item public.event_flight_items;
  target_stage text;
  target_phase public.session_phase;
  stage_changed boolean := false;
  extend_seconds integer;
  paused_seconds integer;
begin
  select * into event_row from public.events where id=p_event_id for update;
  if event_row.id is null then raise exception 'event_not_found'; end if;
  if not public.can_manage_event(p_event_id,auth.uid()) then raise exception 'not_authorized'; end if;
  select * into lease_row from public.host_control_leases where event_id=p_event_id for update;
  if lease_row.holder_user_id <> auth.uid() or lease_row.lease_token <> p_lease_token or lease_row.expires_at <= now() then
    raise exception 'lease_lost';
  end if;
  if p_client_command_id is not null and event_row.last_conductor_command_id=p_client_command_id then return event_row; end if;
  if event_row.sequence_number <> p_expected_sequence then raise exception 'stale_sequence'; end if;
  if event_row.phase='ended' then raise exception 'event_ended'; end if;
  if event_row.current_flight_item_id is not null then
    select * into current_item from public.event_flight_items
    where id=event_row.current_flight_item_id and event_id=p_event_id;
  end if;
  target_stage=event_row.conductor_stage;
  target_phase=event_row.phase;

  if p_command in ('advance_stage','skip_stage') then
    if event_row.conductor_paused_at is not null then raise exception 'stage_paused'; end if;
    case event_row.conductor_stage
      when 'arrival' then
        if event_row.phase <> 'lobby' or event_row.status <> 'scheduled' then raise exception 'illegal_phase'; end if;
        if exists(select 1 from public.event_readiness(p_event_id) where not met) then raise exception 'not_ready'; end if;
        select * into current_item from public.event_flight_items where event_id=p_event_id order by position limit 1;
        if current_item.id is null then raise exception 'flight_missing'; end if;
        update public.participants set status='admitted',joined_at=coalesce(joined_at,now())
          where event_id=p_event_id and status in ('registered','waiting');
        event_row.status='live';
        event_row.current_flight_item_id=current_item.id;
        event_row.current_trivia_question_id=null;
        event_row.tasting_opened_flight_item_id=null;
        target_stage='prepare';
      when 'prepare' then target_stage='brew';
      when 'brew' then target_stage='aroma';
      when 'aroma' then target_stage='first_sip';
      when 'first_sip' then target_stage='explore';
      when 'explore' then target_stage='discuss';
      when 'discuss' then target_stage='reveal';
      when 'reveal' then target_stage='debrief';
      when 'debrief' then target_stage='close_tea';
      when 'close_tea' then target_stage='transition';
      when 'transition' then
        if event_row.phase='recap' then raise exception 'illegal_phase'; end if;
        select * into next_item from public.event_flight_items
          where event_id=p_event_id and position>current_item.position order by position limit 1;
        if next_item.id is null then
          target_phase='recap';
        else
          event_row.current_flight_item_id=next_item.id;
          event_row.current_trivia_question_id=null;
          event_row.tasting_opened_flight_item_id=null;
          current_item=next_item;
          target_stage='prepare';
        end if;
      else raise exception 'invalid_stage';
    end case;
    stage_changed=target_stage is distinct from event_row.conductor_stage or target_phase is distinct from event_row.phase;

  elsif p_command='go_back_stage' then
    if event_row.conductor_paused_at is not null then raise exception 'stage_paused'; end if;
    target_stage=case event_row.conductor_stage
      when 'prepare' then 'arrival'
      when 'brew' then 'prepare'
      when 'aroma' then 'brew'
      when 'first_sip' then 'aroma'
      when 'explore' then 'first_sip'
      when 'discuss' then 'explore'
      when 'reveal' then 'discuss'
      when 'debrief' then 'reveal'
      when 'close_tea' then 'debrief'
      when 'transition' then 'close_tea'
      else null end;
    if target_stage is null or target_stage='arrival' then raise exception 'first_stage'; end if;
    stage_changed=true;

  elsif p_command='jump_stage' then
    if event_row.current_flight_item_id is null then raise exception 'flight_missing'; end if;
    target_stage=nullif(p_payload->>'targetStage','');
    if target_stage is null or target_stage not in ('prepare','brew','aroma','first_sip','explore','discuss','reveal','debrief','close_tea','transition') then
      raise exception 'invalid_stage';
    end if;
    if target_stage=event_row.conductor_stage then raise exception 'invalid_stage'; end if;
    stage_changed=true;

  elsif p_command='pause_stage' then
    if event_row.conductor_paused_at is not null then raise exception 'stage_paused'; end if;
    event_row.conductor_paused_at=now();
    if event_row.timer_ends_at is not null then
      event_row.conductor_remaining_seconds=greatest(0,ceil(extract(epoch from (event_row.timer_ends_at-now())))::integer);
      event_row.timer_ends_at=null;
    end if;

  elsif p_command='resume_stage' then
    if event_row.conductor_paused_at is null then raise exception 'stage_not_paused'; end if;
    paused_seconds=greatest(0,extract(epoch from (now()-event_row.conductor_paused_at))::integer);
    event_row.conductor_stage_started_at=event_row.conductor_stage_started_at+make_interval(secs=>paused_seconds);
    if event_row.conductor_remaining_seconds is not null then
      event_row.timer_ends_at=now()+make_interval(secs=>event_row.conductor_remaining_seconds);
    end if;
    event_row.conductor_paused_at=null;
    event_row.conductor_remaining_seconds=null;

  elsif p_command='extend_stage' then
    if event_row.conductor_stage <> 'brew' then raise exception 'stage_not_timed'; end if;
    extend_seconds=coalesce((p_payload->>'seconds')::integer,30);
    if extend_seconds < 10 or extend_seconds > 300 then raise exception 'invalid_duration'; end if;
    event_row.conductor_stage_duration_seconds=coalesce(event_row.conductor_stage_duration_seconds,current_item.steep_seconds)+extend_seconds;
    if event_row.conductor_paused_at is not null then
      event_row.conductor_remaining_seconds=coalesce(event_row.conductor_remaining_seconds,0)+extend_seconds;
    else
      event_row.timer_ends_at=coalesce(event_row.timer_ends_at,now())+make_interval(secs=>extend_seconds);
    end if;
  else
    raise exception 'unknown_command';
  end if;

  if stage_changed then
    event_row.reveal_at=case when target_stage='reveal' then now()+interval '1500 milliseconds' else null end;
    if target_stage='prepare' then
      target_phase='welcome';
      event_row.timer_started_at=null;
      event_row.timer_ends_at=null;
      event_row.conductor_stage_duration_seconds=null;
      event_row.tasting_opened_flight_item_id=null;
    elsif target_stage='brew' then
      if current_item.id is null then raise exception 'flight_missing'; end if;
      target_phase='brewing';
      event_row.timer_started_at=now();
      event_row.timer_ends_at=now()+make_interval(secs=>current_item.steep_seconds);
      event_row.conductor_stage_duration_seconds=current_item.steep_seconds;
    elsif target_stage in ('aroma','first_sip','explore','discuss','reveal','debrief','close_tea','transition') then
      if target_stage <> 'transition' or target_phase <> 'recap' then target_phase='tasting'; end if;
      event_row.tasting_opened_flight_item_id=event_row.current_flight_item_id;
      event_row.timer_started_at=null;
      event_row.timer_ends_at=null;
      event_row.conductor_stage_duration_seconds=null;
    end if;
    event_row.conductor_stage=target_stage;
    event_row.conductor_stage_started_at=now();
    event_row.conductor_paused_at=null;
    event_row.conductor_remaining_seconds=null;
    event_row.conductor_sequence_version=event_row.conductor_sequence_version+1;
  end if;

  event_row.phase=target_phase;
  event_row.sequence_number=event_row.sequence_number+1;
  event_row.conductor_id=auth.uid();
  event_row.last_conductor_command_id=p_client_command_id;
  event_row.updated_at=now();

  update public.events set
    status=event_row.status,
    phase=event_row.phase,
    sequence_number=event_row.sequence_number,
    current_flight_item_id=event_row.current_flight_item_id,
    current_trivia_question_id=event_row.current_trivia_question_id,
    tasting_opened_flight_item_id=event_row.tasting_opened_flight_item_id,
    reveal_at=event_row.reveal_at,
    timer_started_at=event_row.timer_started_at,
    timer_ends_at=event_row.timer_ends_at,
    conductor_stage=event_row.conductor_stage,
    conductor_stage_started_at=event_row.conductor_stage_started_at,
    conductor_stage_duration_seconds=event_row.conductor_stage_duration_seconds,
    conductor_paused_at=event_row.conductor_paused_at,
    conductor_remaining_seconds=event_row.conductor_remaining_seconds,
    conductor_sequence_version=event_row.conductor_sequence_version,
    conductor_id=event_row.conductor_id,
    last_conductor_command_id=event_row.last_conductor_command_id,
    updated_at=event_row.updated_at
  where id=event_row.id returning * into event_row;

  insert into public.event_state_log(event_id,sequence_number,command,phase,actor_user_id,payload)
  values(event_row.id,event_row.sequence_number,p_command,event_row.phase,auth.uid(),jsonb_build_object(
    'conductor_stage',event_row.conductor_stage,
    'conductor_stage_started_at',event_row.conductor_stage_started_at,
    'conductor_stage_duration_seconds',event_row.conductor_stage_duration_seconds,
    'conductor_paused_at',event_row.conductor_paused_at,
    'current_flight_item_id',event_row.current_flight_item_id,
    'client_command_id',p_client_command_id,
    'command_payload',p_payload
  ));
  return event_row;
end $$;

revoke all on function public.apply_conductor_command(uuid,text,bigint,uuid,uuid,jsonb) from public,anon;
grant execute on function public.apply_conductor_command(uuid,text,bigint,uuid,uuid,jsonb) to authenticated;

create or replace function public.event_conductor_metrics(p_event_id uuid)
returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare
  event_row public.events;
  metrics jsonb;
begin
  if not public.can_manage_event(p_event_id,auth.uid()) then raise exception 'not_authorized'; end if;
  select * into event_row from public.events where id=p_event_id;
  if event_row.id is null then raise exception 'event_not_found'; end if;
  select jsonb_build_object(
    'participants',count(*) filter(where participant.status not in ('left','removed')),
    'connected',count(*) filter(where participant.status not in ('left','removed') and participant.last_seen_at >= now()-interval '45 seconds'),
    'ready',count(*) filter(where signal.signal='ready'),
    'poured',count(*) filter(where signal.signal='poured'),
    'observed',(select count(distinct response.participant_id) from public.tea_responses response
      where response.event_flight_item_id=event_row.current_flight_item_id
        and (nullif(btrim(response.first_impression),'') is not null or cardinality(response.descriptors)>0 or nullif(btrim(response.personal_notes),'') is not null)),
    'completed',(select count(distinct response.participant_id) from public.tea_responses response
      where response.event_flight_item_id=event_row.current_flight_item_id and response.completed_at is not null)
  ) into metrics
  from public.participants participant
  left join public.event_stage_signals signal
    on signal.participant_id=participant.id
    and signal.event_id=participant.event_id
    and signal.event_flight_item_id=event_row.current_flight_item_id
    and signal.stage=event_row.conductor_stage
  where participant.event_id=p_event_id;
  return coalesce(metrics,'{"participants":0,"connected":0,"ready":0,"poured":0,"observed":0,"completed":0}'::jsonb);
end $$;

revoke all on function public.event_conductor_metrics(uuid) from public,anon;
grant execute on function public.event_conductor_metrics(uuid) to authenticated;

comment on column public.events.conductor_stage is
  'Authoritative tasting stage. Separate from Agora transport and the legacy compatibility phase.';
comment on table public.event_stage_signals is
  'Low-content participant readiness signals; the host receives aggregate coverage only.';
