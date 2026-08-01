-- Close the remaining runtime/privacy gaps found during the first full framework build.

-- Reveal timing is durable and server-authored. Guests may preload the current tea,
-- but the public reveal and all follow-on commands are gated by this timestamp.
alter table public.events
  add column if not exists reveal_at timestamptz;

alter table public.event_public_state
  add column if not exists reveal_at timestamptz;

update public.event_public_state s
set reveal_at=e.reveal_at
from public.events e
where e.id=s.event_id;

create or replace function public.sync_event_public_state() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  insert into public.event_public_state(event_id,status,phase,sequence_number,current_flight_item_id,reveal_at,timer_ends_at,trivia_closes_at,updated_at)
  values(new.id,new.status,new.phase,new.sequence_number,new.current_flight_item_id,new.reveal_at,new.timer_ends_at,new.trivia_closes_at,new.updated_at)
  on conflict(event_id) do update set
    status=excluded.status,
    phase=excluded.phase,
    sequence_number=excluded.sequence_number,
    current_flight_item_id=excluded.current_flight_item_id,
    reveal_at=excluded.reveal_at,
    timer_ends_at=excluded.timer_ends_at,
    trivia_closes_at=excluded.trivia_closes_at,
    updated_at=excluded.updated_at;
  return new;
end $$;

drop trigger if exists events_public_state_sync on public.events;
create trigger events_public_state_sync
after insert or update of status,phase,sequence_number,current_flight_item_id,reveal_at,timer_ends_at,trivia_closes_at on public.events
for each row execute function public.sync_event_public_state();

-- A lease expires at 45 seconds. A late heartbeat cannot silently revive it.
create or replace function public.heartbeat_host_control(p_event_id uuid, p_lease_token uuid)
returns public.host_control_leases
language plpgsql security definer set search_path = public as $$
declare result public.host_control_leases;
begin
  update public.host_control_leases
  set heartbeat_at=now(), expires_at=now()+interval '45 seconds', updated_at=now()
  where event_id=p_event_id
    and holder_user_id=auth.uid()
    and lease_token=p_lease_token
    and expires_at > now()
  returning * into result;
  if result.event_id is null then raise exception 'lease_lost'; end if;
  return result;
end $$;

create or replace function public.apply_event_command(p_event_id uuid, p_command text, p_expected_sequence bigint, p_lease_token uuid)
returns public.events
language plpgsql security definer set search_path = public as $$
declare
  e public.events;
  lease public.host_control_leases;
  current_item public.event_flight_items;
  next_item public.event_flight_items;
  target_phase public.session_phase;
  trivia_is_closed boolean;
begin
  select * into e from public.events where id=p_event_id for update;
  if e.id is null then raise exception 'event_not_found'; end if;
  if not public.can_manage_event(p_event_id, auth.uid()) then raise exception 'not_authorized'; end if;
  select * into lease from public.host_control_leases where event_id=p_event_id for update;
  if lease.holder_user_id <> auth.uid() or lease.lease_token <> p_lease_token or lease.expires_at <= now() then raise exception 'lease_lost'; end if;
  if e.sequence_number <> p_expected_sequence then raise exception 'stale_sequence'; end if;
  if e.phase='ended' then raise exception 'event_ended'; end if;
  if e.current_flight_item_id is not null then
    select * into current_item from public.event_flight_items where id=e.current_flight_item_id and event_id=p_event_id;
  end if;
  trivia_is_closed := e.trivia_closes_at is not null and e.trivia_closes_at <= now();

  case p_command
    when 'open_session' then
      if e.phase <> 'lobby' or e.status <> 'scheduled' then raise exception 'illegal_phase'; end if;
      if exists(select 1 from public.event_readiness(p_event_id) where not met) then raise exception 'not_ready'; end if;
      select * into current_item from public.event_flight_items where event_id=p_event_id order by position limit 1;
      if current_item.id is null then raise exception 'flight_missing'; end if;
      update public.participants set status='admitted', joined_at=coalesce(joined_at,now()) where event_id=p_event_id and status in ('registered','waiting');
      target_phase='welcome';
      e.status='live';
      e.current_flight_item_id=current_item.id;
      e.tasting_opened_flight_item_id=null;
      e.reveal_at=null;

    when 'reveal_tea' then
      if not (
        e.phase='welcome'
        or (e.phase='tasting' and e.current_flight_item_id is distinct from e.tasting_opened_flight_item_id)
      ) then raise exception 'illegal_phase'; end if;
      if current_item.id is null then raise exception 'flight_missing'; end if;
      target_phase='reveal';
      e.reveal_at=now()+interval '1200 milliseconds';
      e.timer_started_at=null;
      e.timer_ends_at=null;
      e.trivia_opened_at=null;
      e.trivia_closes_at=null;

    when 'start_timer' then
      if e.phase not in ('reveal','brewing') then raise exception 'illegal_phase'; end if;
      if current_item.id is null then raise exception 'flight_missing'; end if;
      if e.phase='reveal' and (e.reveal_at is null or now() < e.reveal_at+interval '1400 milliseconds') then raise exception 'reveal_in_progress'; end if;
      target_phase='brewing';
      e.timer_started_at=now();
      e.timer_ends_at=now()+make_interval(secs=>current_item.steep_seconds);

    when 'open_tasting' then
      if e.phase not in ('reveal','brewing') then raise exception 'illegal_phase'; end if;
      if current_item.id is null then raise exception 'flight_missing'; end if;
      if e.phase='reveal' and (e.reveal_at is null or now() < e.reveal_at+interval '1400 milliseconds') then raise exception 'reveal_in_progress'; end if;
      target_phase='tasting';
      e.tasting_opened_flight_item_id=current_item.id;
      e.timer_started_at=null;
      e.timer_ends_at=null;

    when 'open_trivia' then
      if e.phase <> 'tasting' or e.tasting_opened_flight_item_id is distinct from e.current_flight_item_id then raise exception 'illegal_phase'; end if;
      if not exists(select 1 from public.trivia_questions where event_flight_item_id=e.current_flight_item_id) then raise exception 'trivia_missing'; end if;
      target_phase='trivia';
      e.trivia_opened_at=now();
      select now()+make_interval(secs=>answer_window_seconds)
        into e.trivia_closes_at
        from public.trivia_questions where event_flight_item_id=e.current_flight_item_id;

    when 'close_trivia' then
      if e.phase <> 'trivia' then raise exception 'illegal_phase'; end if;
      target_phase='trivia';
      e.trivia_closes_at=now();

    when 'return_to_tasting' then
      if e.phase <> 'trivia' or not trivia_is_closed then raise exception 'trivia_open'; end if;
      target_phase='tasting';

    when 'next_tea' then
      if e.tasting_opened_flight_item_id is distinct from e.current_flight_item_id then raise exception 'tasting_not_open'; end if;
      if e.phase not in ('tasting','trivia') or not trivia_is_closed then raise exception 'trivia_open'; end if;
      select * into next_item from public.event_flight_items
        where event_id=p_event_id and position>current_item.position order by position limit 1;
      if next_item.id is null then raise exception 'last_tea'; end if;
      target_phase='tasting';
      e.current_flight_item_id=next_item.id;
      e.reveal_at=null;
      e.timer_started_at=null;
      e.timer_ends_at=null;
      e.trivia_opened_at=null;
      e.trivia_closes_at=null;

    when 'start_recap' then
      if e.tasting_opened_flight_item_id is distinct from e.current_flight_item_id then raise exception 'tasting_not_open'; end if;
      if e.phase not in ('tasting','trivia') or not trivia_is_closed then raise exception 'trivia_open'; end if;
      if exists(select 1 from public.event_flight_items where event_id=p_event_id and position>current_item.position) then raise exception 'not_last_tea'; end if;
      target_phase='recap';

    when 'end_session' then
      if e.phase='lobby' then raise exception 'not_open'; end if;
      target_phase='ended';
      e.status='completed';
      e.completed_at=now();
      e.ends_at=coalesce(e.ends_at,now());
      update public.participants set delete_after=now()+interval '90 days' where event_id=p_event_id and user_id is null;
      update public.participant_tokens set expires_at=now()+interval '90 days' where participant_id in (select id from public.participants where event_id=p_event_id and user_id is null);

    else raise exception 'unknown_command';
  end case;

  e.phase=target_phase;
  e.sequence_number=e.sequence_number+1;
  e.updated_at=now();
  update public.events set
    status=e.status,
    phase=e.phase,
    sequence_number=e.sequence_number,
    current_flight_item_id=e.current_flight_item_id,
    tasting_opened_flight_item_id=e.tasting_opened_flight_item_id,
    reveal_at=e.reveal_at,
    timer_started_at=e.timer_started_at,
    timer_ends_at=e.timer_ends_at,
    trivia_opened_at=e.trivia_opened_at,
    trivia_closes_at=e.trivia_closes_at,
    completed_at=e.completed_at,
    ends_at=e.ends_at,
    updated_at=e.updated_at
  where id=e.id returning * into e;

  insert into public.event_state_log(event_id,sequence_number,command,phase,actor_user_id,payload)
  values(e.id,e.sequence_number,p_command,e.phase,auth.uid(),jsonb_build_object(
    'current_flight_item_id',e.current_flight_item_id,
    'tasting_opened_flight_item_id',e.tasting_opened_flight_item_id,
    'reveal_at',e.reveal_at,
    'timer_ends_at',e.timer_ends_at
  ));

  if p_command='end_session' then
    delete from public.host_control_leases where event_id=p_event_id;
  end if;
  return e;
end $$;

revoke all on function public.heartbeat_host_control(uuid,uuid) from public,anon;
grant execute on function public.heartbeat_host_control(uuid,uuid) to authenticated;
revoke all on function public.apply_event_command(uuid,text,bigint,uuid) from public,anon;
grant execute on function public.apply_event_command(uuid,text,bigint,uuid) to authenticated;

-- Authenticated clients need operational/history columns, never private email or
-- marketing consent. Admin-only email work must use a separately authorized server route.
revoke select on public.participants from anon,authenticated;
grant select (
  id,event_id,user_id,display_name,status,joined_at,left_at,last_seen_at,
  recap_claimed_at,delete_after,created_at,updated_at
) on public.participants to authenticated;
