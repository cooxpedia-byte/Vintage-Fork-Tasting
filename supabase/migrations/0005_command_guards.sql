create or replace function public.apply_event_command(p_event_id uuid, p_command text, p_expected_sequence bigint, p_lease_token uuid)
returns public.events
language plpgsql security definer set search_path = public as $$
declare e public.events; lease public.host_control_leases; current_item public.event_flight_items; next_item public.event_flight_items; target_phase public.session_phase;
begin
  select * into e from public.events where id=p_event_id for update;
  if e.id is null then raise exception 'event_not_found'; end if;
  if not public.can_manage_event(p_event_id, auth.uid()) then raise exception 'not_authorized'; end if;
  select * into lease from public.host_control_leases where event_id=p_event_id for update;
  if lease.holder_user_id <> auth.uid() or lease.lease_token <> p_lease_token or lease.expires_at <= now() then raise exception 'lease_lost'; end if;
  if e.sequence_number <> p_expected_sequence then raise exception 'stale_sequence'; end if;
  if e.phase='ended' then raise exception 'event_ended'; end if;
  if e.current_flight_item_id is not null then select * into current_item from public.event_flight_items where id=e.current_flight_item_id; end if;

  case p_command
    when 'open_session' then
      if e.phase <> 'lobby' or e.status <> 'scheduled' then raise exception 'illegal_phase'; end if;
      if exists(select 1 from public.event_readiness(p_event_id) where not met) then raise exception 'not_ready'; end if;
      select * into current_item from public.event_flight_items where event_id=p_event_id order by position limit 1;
      update public.participants set status='admitted', joined_at=coalesce(joined_at,now()) where event_id=p_event_id and status in ('registered','waiting');
      target_phase='welcome'; e.status='live'; e.current_flight_item_id=current_item.id;
    when 'reveal_tea' then
      if e.phase not in ('welcome','tasting') then raise exception 'illegal_phase'; end if;
      target_phase='reveal'; e.timer_started_at=null; e.timer_ends_at=null; e.trivia_opened_at=null; e.trivia_closes_at=null;
    when 'start_timer' then
      if e.phase not in ('reveal','brewing') then raise exception 'illegal_phase'; end if;
      if current_item.id is null then raise exception 'flight_missing'; end if;
      target_phase='brewing'; e.timer_started_at=now(); e.timer_ends_at=now()+make_interval(secs=>current_item.steep_seconds);
    when 'open_tasting' then
      if e.phase not in ('reveal','brewing') then raise exception 'illegal_phase'; end if;
      target_phase='tasting'; e.timer_started_at=null; e.timer_ends_at=null;
    when 'open_trivia' then
      if e.phase <> 'tasting' then raise exception 'illegal_phase'; end if;
      if not exists(select 1 from public.trivia_questions where event_flight_item_id=e.current_flight_item_id) then raise exception 'trivia_missing'; end if;
      target_phase='trivia'; e.trivia_opened_at=now();
      select now()+make_interval(secs=>answer_window_seconds) into e.trivia_closes_at from public.trivia_questions where event_flight_item_id=e.current_flight_item_id;
    when 'close_trivia' then
      if e.phase <> 'trivia' then raise exception 'illegal_phase'; end if;
      target_phase='trivia'; e.trivia_closes_at=now();
    when 'return_to_tasting' then
      if e.phase <> 'trivia' then raise exception 'illegal_phase'; end if;
      target_phase='tasting';
    when 'next_tea' then
      if e.phase not in ('tasting','trivia') then raise exception 'illegal_phase'; end if;
      select * into next_item from public.event_flight_items where event_id=p_event_id and position>current_item.position order by position limit 1;
      if next_item.id is null then raise exception 'last_tea'; end if;
      target_phase='tasting'; e.current_flight_item_id=next_item.id; e.timer_started_at=null; e.timer_ends_at=null; e.trivia_opened_at=null; e.trivia_closes_at=null;
    when 'start_recap' then
      if e.phase not in ('tasting','trivia') then raise exception 'illegal_phase'; end if;
      if exists(select 1 from public.event_flight_items where event_id=p_event_id and position>current_item.position) then raise exception 'not_last_tea'; end if;
      target_phase='recap';
    when 'end_session' then
      if e.phase='lobby' then raise exception 'not_open'; end if;
      target_phase='ended'; e.status='completed'; e.completed_at=now(); e.ends_at=coalesce(e.ends_at,now());
    else raise exception 'unknown_command';
  end case;

  e.phase=target_phase; e.sequence_number=e.sequence_number+1; e.updated_at=now();
  update public.events set status=e.status, phase=e.phase, sequence_number=e.sequence_number, current_flight_item_id=e.current_flight_item_id,
    timer_started_at=e.timer_started_at, timer_ends_at=e.timer_ends_at, trivia_opened_at=e.trivia_opened_at, trivia_closes_at=e.trivia_closes_at,
    completed_at=e.completed_at, ends_at=e.ends_at, updated_at=e.updated_at where id=e.id returning * into e;
  insert into public.event_state_log(event_id,sequence_number,command,phase,actor_user_id,payload)
    values(e.id,e.sequence_number,p_command,e.phase,auth.uid(),jsonb_build_object('current_flight_item_id',e.current_flight_item_id,'timer_ends_at',e.timer_ends_at));
  return e;
end $$;
