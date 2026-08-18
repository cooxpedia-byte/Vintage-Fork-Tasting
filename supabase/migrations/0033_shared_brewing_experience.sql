-- Shared brewing is an authoritative tasting ritual. Agora continues to carry media only.

create table public.event_brews (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  event_flight_item_id uuid not null references public.event_flight_items(id) on delete cascade,
  infusion_number integer not null default 1 check (infusion_number between 1 and 20),
  started_at timestamptz not null,
  duration_ms bigint not null check (duration_ms between 1000 and 7200000),
  status text not null default 'ready' check (status in ('ready','running','paused','complete','cancelled')),
  paused_at timestamptz,
  accumulated_pause_ms bigint not null default 0 check (accumulated_pause_ms between 0 and 86400000),
  host_id uuid not null references public.profiles(id) on delete restrict,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index event_brews_event_item_idx
  on public.event_brews(event_id,event_flight_item_id,infusion_number,created_at desc);

create table public.participant_brew_notes (
  participant_id uuid not null references public.participants(id) on delete cascade,
  event_brew_id uuid not null references public.event_brews(id) on delete cascade,
  note text not null default '' check (char_length(note)<=1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(participant_id,event_brew_id)
);

alter table public.events
  add column current_brew_id uuid references public.event_brews(id) on delete set null;

alter table public.event_public_state
  add column current_brew_id uuid;

with inserted as (
  insert into public.event_brews(
    event_id,event_flight_item_id,infusion_number,started_at,duration_ms,status,paused_at,host_id
  )
  select event.id,event.current_flight_item_id,1,coalesce(event.timer_started_at,event.conductor_stage_started_at,now()),
    coalesce(event.conductor_stage_duration_seconds,1)::bigint*1000,
    case when event.conductor_paused_at is null then 'running' else 'paused' end,
    event.conductor_paused_at,coalesce(event.conductor_id,event.host_user_id)
  from public.events event
  where event.conductor_stage='brew' and event.current_flight_item_id is not null and event.current_brew_id is null
  returning event_id,id
)
update public.events event set current_brew_id=inserted.id
from inserted where inserted.event_id=event.id;

update public.event_public_state state set current_brew_id=event.current_brew_id
from public.events event where event.id=state.event_id;

alter table public.event_brews enable row level security;
alter table public.participant_brew_notes enable row level security;
create policy event_brews_staff_read on public.event_brews
  for select to authenticated using (public.can_manage_event(event_id,auth.uid()));
create policy participant_brew_notes_member_read on public.participant_brew_notes
  for select to authenticated using (
    exists(
      select 1 from public.event_brews brew where brew.id=event_brew_id and public.can_manage_event(brew.event_id,auth.uid())
    ) or exists(
      select 1 from public.participants participant
      where participant.id=participant_id and participant.user_id=auth.uid() and participant.status<>'removed'
    )
  );
revoke all on public.event_brews from anon,authenticated;
revoke all on public.participant_brew_notes from anon,authenticated;
grant select on public.event_brews to authenticated;
grant select on public.participant_brew_notes to authenticated;

alter table public.event_stage_signals
  drop constraint event_stage_signals_signal_check,
  add constraint event_stage_signals_signal_check check (signal in ('ready','poured','pouring','decanted'));

create or replace function public.sync_event_public_state() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  insert into public.event_public_state(
    event_id,status,phase,sequence_number,current_flight_item_id,reveal_at,timer_ends_at,trivia_closes_at,
    conductor_stage,conductor_stage_started_at,conductor_stage_duration_seconds,conductor_paused_at,
    conductor_remaining_seconds,conductor_sequence_version,current_brew_id,updated_at
  ) values(
    new.id,new.status,new.phase,new.sequence_number,new.current_flight_item_id,new.reveal_at,new.timer_ends_at,new.trivia_closes_at,
    new.conductor_stage,new.conductor_stage_started_at,new.conductor_stage_duration_seconds,new.conductor_paused_at,
    new.conductor_remaining_seconds,new.conductor_sequence_version,new.current_brew_id,new.updated_at
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
    current_brew_id=excluded.current_brew_id,
    updated_at=excluded.updated_at;
  return new;
end $$;

drop trigger if exists events_public_state_sync on public.events;
create trigger events_public_state_sync
after insert or update of status,phase,sequence_number,current_flight_item_id,reveal_at,timer_ends_at,trivia_closes_at,
  conductor_stage,conductor_stage_started_at,conductor_stage_duration_seconds,conductor_paused_at,
  conductor_remaining_seconds,conductor_sequence_version,current_brew_id on public.events
for each row execute function public.sync_event_public_state();

create or replace function public.sync_current_brew_from_conductor() returns trigger
language plpgsql security definer set search_path=public as $$
declare
  created_brew_id uuid;
  pause_delta_ms bigint;
begin
  if new.conductor_stage='prepare' and new.current_flight_item_id is distinct from old.current_flight_item_id and new.current_brew_id is not null then
    update public.events set current_brew_id=null where id=new.id;
    return new;
  end if;

  if old.conductor_stage='brew' and new.conductor_stage<>'brew' and old.current_brew_id is not null then
    update public.event_brews set
      status=case when status='cancelled' then status else 'complete' end,
      completed_at=case when status='cancelled' then completed_at else coalesce(completed_at,now()) end,
      paused_at=null,
      updated_at=now()
    where id=old.current_brew_id;
  end if;

  if new.conductor_stage='brew' and new.current_brew_id is null and new.current_flight_item_id is not null then
    insert into public.event_brews(
      event_id,event_flight_item_id,infusion_number,started_at,duration_ms,status,host_id
    ) values(
      new.id,new.current_flight_item_id,1,coalesce(new.timer_started_at,now()),
      coalesce(new.conductor_stage_duration_seconds,1)::bigint*1000,'running',coalesce(new.conductor_id,new.host_user_id)
    ) returning id into created_brew_id;
    update public.events set current_brew_id=created_brew_id where id=new.id;
    return new;
  end if;

  if new.conductor_stage='brew' and new.current_brew_id is not null then
    if old.conductor_paused_at is null and new.conductor_paused_at is not null then
      update public.event_brews set status='paused',paused_at=new.conductor_paused_at,updated_at=now()
        where id=new.current_brew_id and status not in ('complete','cancelled');
    elsif old.conductor_paused_at is not null and new.conductor_paused_at is null then
      select greatest(0,(extract(epoch from (now()-paused_at))*1000)::bigint) into pause_delta_ms
        from public.event_brews where id=new.current_brew_id;
      update public.event_brews set
        status='running',paused_at=null,
        accumulated_pause_ms=accumulated_pause_ms+coalesce(pause_delta_ms,0),updated_at=now()
        where id=new.current_brew_id and status='paused';
    end if;
    if new.conductor_stage_duration_seconds is distinct from old.conductor_stage_duration_seconds then
      update public.event_brews set duration_ms=new.conductor_stage_duration_seconds::bigint*1000,updated_at=now()
        where id=new.current_brew_id and status not in ('complete','cancelled');
    end if;
  end if;
  return new;
end $$;

create trigger events_current_brew_sync
after update of conductor_stage,conductor_paused_at,conductor_stage_duration_seconds,current_brew_id on public.events
for each row execute function public.sync_current_brew_from_conductor();

create or replace function public.apply_shared_brew_command(
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
  item_row public.event_flight_items;
  brew_row public.event_brews;
  next_brew public.event_brews;
  duration_seconds integer;
  countdown_seconds integer;
  infusion_number integer;
  brew_start timestamptz;
begin
  select * into event_row from public.events where id=p_event_id for update;
  if event_row.id is null then raise exception 'event_not_found'; end if;
  if not public.can_manage_event(p_event_id,auth.uid()) then raise exception 'not_authorized'; end if;
  select * into lease_row from public.host_control_leases where event_id=p_event_id for update;
  if lease_row.holder_user_id<>auth.uid() or lease_row.lease_token<>p_lease_token or lease_row.expires_at<=now() then
    raise exception 'lease_lost';
  end if;
  if p_client_command_id is not null and event_row.last_conductor_command_id=p_client_command_id then return event_row; end if;
  if event_row.sequence_number<>p_expected_sequence then raise exception 'stale_sequence'; end if;
  if event_row.phase='ended' then raise exception 'event_ended'; end if;
  if event_row.current_flight_item_id is null then raise exception 'flight_missing'; end if;
  select * into item_row from public.event_flight_items
    where id=event_row.current_flight_item_id and event_id=p_event_id;
  if item_row.id is null then raise exception 'flight_missing'; end if;
  if event_row.current_brew_id is not null then
    select * into brew_row from public.event_brews where id=event_row.current_brew_id for update;
  end if;

  duration_seconds=coalesce((p_payload->>'durationSeconds')::integer,item_row.steep_seconds);
  countdown_seconds=coalesce((p_payload->>'countdownSeconds')::integer,3);
  if duration_seconds<1 or duration_seconds>7200 then raise exception 'invalid_duration'; end if;
  if countdown_seconds<0 or countdown_seconds>5 then raise exception 'invalid_countdown'; end if;
  brew_start=now()+make_interval(secs=>countdown_seconds);

  if p_command='start_brew' then
    if event_row.conductor_stage<>'prepare' then raise exception 'brew_not_ready'; end if;
    infusion_number=1;
  elsif p_command='restart_brew' then
    if event_row.conductor_stage<>'brew' or brew_row.id is null then raise exception 'brew_not_running'; end if;
    update public.event_brews set status='cancelled',completed_at=now(),paused_at=null,updated_at=now() where id=brew_row.id;
    infusion_number=brew_row.infusion_number;
  elsif p_command='start_next_infusion' then
    if event_row.conductor_stage<>'brew' or brew_row.id is null then raise exception 'brew_not_running'; end if;
    update public.event_brews set status='complete',completed_at=coalesce(completed_at,now()),paused_at=null,updated_at=now() where id=brew_row.id;
    infusion_number=brew_row.infusion_number+1;
  elsif p_command='end_brew_early' then
    if event_row.conductor_stage<>'brew' or brew_row.id is null then raise exception 'brew_not_running'; end if;
    update public.event_brews set status='complete',completed_at=now(),paused_at=null,updated_at=now() where id=brew_row.id;
    update public.events set
      timer_ends_at=now(),conductor_paused_at=null,conductor_remaining_seconds=0,
      sequence_number=sequence_number+1,conductor_id=auth.uid(),last_conductor_command_id=p_client_command_id,updated_at=now()
      where id=p_event_id returning * into event_row;
    insert into public.event_state_log(event_id,sequence_number,command,phase,actor_user_id,payload)
      values(event_row.id,event_row.sequence_number,p_command,event_row.phase,auth.uid(),jsonb_build_object(
        'brew_id',brew_row.id,'infusion_number',brew_row.infusion_number,'client_command_id',p_client_command_id
      ));
    return event_row;
  else
    raise exception 'unknown_command';
  end if;

  delete from public.event_stage_signals
    where event_id=p_event_id and event_flight_item_id=item_row.id and stage='brew';

  insert into public.event_brews(
    event_id,event_flight_item_id,infusion_number,started_at,duration_ms,status,host_id
  ) values(
    p_event_id,item_row.id,infusion_number,brew_start,duration_seconds::bigint*1000,'running',auth.uid()
  ) returning * into next_brew;

  update public.events set
    phase='brewing',conductor_stage='brew',conductor_stage_started_at=now(),
    conductor_stage_duration_seconds=duration_seconds,conductor_paused_at=null,conductor_remaining_seconds=null,
    timer_started_at=brew_start,timer_ends_at=brew_start+make_interval(secs=>duration_seconds),
    current_brew_id=next_brew.id,sequence_number=sequence_number+1,
    conductor_sequence_version=conductor_sequence_version+case when event_row.conductor_stage='prepare' then 1 else 0 end,
    conductor_id=auth.uid(),last_conductor_command_id=p_client_command_id,updated_at=now()
  where id=p_event_id returning * into event_row;

  insert into public.event_state_log(event_id,sequence_number,command,phase,actor_user_id,payload)
    values(event_row.id,event_row.sequence_number,p_command,event_row.phase,auth.uid(),jsonb_build_object(
      'brew_id',next_brew.id,'infusion_number',next_brew.infusion_number,'started_at',next_brew.started_at,
      'duration_ms',next_brew.duration_ms,'countdown_seconds',countdown_seconds,
      'current_flight_item_id',event_row.current_flight_item_id,'client_command_id',p_client_command_id
    ));
  return event_row;
end $$;

revoke all on function public.apply_shared_brew_command(uuid,text,bigint,uuid,uuid,jsonb) from public,anon;
grant execute on function public.apply_shared_brew_command(uuid,text,bigint,uuid,uuid,jsonb) to authenticated;

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
    'connected',count(*) filter(where participant.status not in ('left','removed') and participant.last_seen_at>=now()-interval '45 seconds'),
    'ready',count(*) filter(where signal.signal='ready'),
    'pouring',count(*) filter(where signal.signal='pouring'),
    'decanted',count(*) filter(where signal.signal='decanted'),
    'poured',count(*) filter(where signal.signal in ('poured','pouring','decanted')),
    'observed',(select count(distinct response.participant_id) from public.tea_responses response
      where response.event_flight_item_id=event_row.current_flight_item_id
        and (nullif(btrim(response.first_impression),'') is not null or cardinality(response.descriptors)>0 or nullif(btrim(response.personal_notes),'') is not null)),
    'completed',(select count(distinct response.participant_id) from public.tea_responses response
      where response.event_flight_item_id=event_row.current_flight_item_id and response.completed_at is not null)
  ) into metrics
  from public.participants participant
  left join public.event_stage_signals signal
    on signal.participant_id=participant.id and signal.event_id=participant.event_id
    and signal.event_flight_item_id=event_row.current_flight_item_id and signal.stage=event_row.conductor_stage
  where participant.event_id=p_event_id;
  return coalesce(metrics,'{"participants":0,"connected":0,"ready":0,"pouring":0,"decanted":0,"poured":0,"observed":0,"completed":0}'::jsonb);
end $$;

revoke all on function public.event_conductor_metrics(uuid) from public,anon;
grant execute on function public.event_conductor_metrics(uuid) to authenticated;

comment on table public.event_brews is
  'Authoritative server-timestamped brew instances. Clients calculate presentation time and Agora never carries timer state.';
comment on column public.events.current_brew_id is
  'Current shared infusion; retained separately from stage so reconnecting clients can reconstruct the clock.';
comment on table public.participant_brew_notes is
  'Private participant notes keyed to an exact infusion; they are not readiness gates or shared room content.';
