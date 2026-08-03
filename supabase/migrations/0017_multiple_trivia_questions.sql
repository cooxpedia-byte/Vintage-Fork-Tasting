-- Allow an event tea to carry an ordered sequence of up to ten trivia questions.
alter table public.trivia_questions
  drop constraint if exists trivia_questions_event_flight_item_id_key;

alter table public.trivia_questions
  add column position integer;

update public.trivia_questions set position=1 where position is null;

alter table public.trivia_questions
  alter column position set not null,
  add constraint trivia_questions_position_range check (position between 1 and 10),
  add constraint trivia_questions_flight_position_unique unique(event_flight_item_id,position);

alter table public.events
  add column current_trivia_question_id uuid,
  add constraint events_current_trivia_question_fk
    foreign key (current_trivia_question_id) references public.trivia_questions(id) on delete set null;

-- Preserve the active or just-completed question if this is applied during a live round.
update public.events e
set current_trivia_question_id=(
  select tq.id
  from public.trivia_questions tq
  where tq.event_flight_item_id=e.current_flight_item_id
  order by tq.position
  limit 1
)
where (e.phase='trivia' or e.trivia_closes_at is not null)
  and e.current_trivia_question_id is null;

create or replace function public.save_event_bundle(p_event jsonb, p_flight jsonb)
returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_event_id uuid := nullif(p_event->>'id','')::uuid;
  saved_id uuid;
  flight_item jsonb;
  trivia jsonb;
  trivia_item jsonb;
  saved_flight_id uuid;
  event_slug text;
  event_invite text;
  position_no integer := 0;
  trivia_position integer;
begin
  if auth.uid() is null or not public.is_staff(auth.uid()) then raise exception 'not_authorized'; end if;
  if not exists(select 1 from public.profiles where id=(p_event->>'host_user_id')::uuid and role in ('host','admin')) then raise exception 'invalid_host'; end if;
  if nullif(p_event->>'backup_host_user_id','') is not null and not exists(select 1 from public.profiles where id=(p_event->>'backup_host_user_id')::uuid and role in ('host','admin')) then raise exception 'invalid_backup'; end if;
  if jsonb_typeof(p_flight) <> 'array' then raise exception 'invalid_flight'; end if;
  event_slug := coalesce(nullif(p_event->>'slug',''), lower(regexp_replace(p_event->>'title','[^a-zA-Z0-9]+','-','g')) || '-' || substr(encode(gen_random_bytes(4),'hex'),1,6));
  event_invite := coalesce(nullif(p_event->>'invite_code',''), upper(substr(encode(gen_random_bytes(6),'hex'),1,10)));

  if v_event_id is null then
    insert into public.events(title,slug,invite_code,status,location_mode,starts_at,timezone,capacity,venue_name,venue_address,video_call_url,owner_user_id,host_user_id,backup_host_user_id)
    values(
      trim(p_event->>'title'), event_slug, event_invite, coalesce((p_event->>'status')::public.event_status,'draft'),
      (p_event->>'location_mode')::public.location_mode, (p_event->>'starts_at')::timestamptz,
      coalesce(nullif(p_event->>'timezone',''),'America/Edmonton'), (p_event->>'capacity')::integer,
      nullif(p_event->>'venue_name',''), nullif(p_event->>'venue_address',''), nullif(p_event->>'video_call_url',''),
      auth.uid(), (p_event->>'host_user_id')::uuid, nullif(p_event->>'backup_host_user_id','')::uuid
    ) returning id into saved_id;
  else
    if not public.can_manage_event(v_event_id,auth.uid()) then raise exception 'not_authorized'; end if;
    if exists(select 1 from public.events e where e.id=v_event_id and e.status in ('live','completed','cancelled')) then raise exception 'event_locked'; end if;
    update public.events e set
      title=trim(p_event->>'title'), slug=event_slug, invite_code=event_invite,
      status=coalesce((p_event->>'status')::public.event_status,status), location_mode=(p_event->>'location_mode')::public.location_mode,
      starts_at=(p_event->>'starts_at')::timestamptz, timezone=coalesce(nullif(p_event->>'timezone',''),'America/Edmonton'),
      capacity=(p_event->>'capacity')::integer, venue_name=nullif(p_event->>'venue_name',''), venue_address=nullif(p_event->>'venue_address',''),
      video_call_url=nullif(p_event->>'video_call_url',''), host_user_id=(p_event->>'host_user_id')::uuid,
      backup_host_user_id=nullif(p_event->>'backup_host_user_id','')::uuid
    where e.id=v_event_id returning e.id into saved_id;
    delete from public.event_flight_items fi where fi.event_id=saved_id;
  end if;

  for flight_item in select value from jsonb_array_elements(p_flight) loop
    position_no := position_no + 1;
    insert into public.event_flight_items(event_id,tea_id,position,reveal_title,reveal_description,brewing_instructions,steep_seconds,temperature_c,leaf_grams,water_ml)
    values(
      saved_id, (flight_item->>'tea_id')::uuid, position_no,
      coalesce(nullif(flight_item->>'reveal_title',''), (select name from public.teas where id=(flight_item->>'tea_id')::uuid)),
      coalesce(flight_item->>'reveal_description',''), coalesce(flight_item->>'brewing_instructions',''),
      (flight_item->>'steep_seconds')::integer, nullif(flight_item->>'temperature_c','')::numeric,
      nullif(flight_item->>'leaf_grams','')::numeric, nullif(flight_item->>'water_ml','')::integer
    ) returning id into saved_flight_id;

    trivia := flight_item->'trivia';
    if jsonb_typeof(trivia)='object' then
      trivia := jsonb_build_array(trivia);
    elsif trivia is not null and jsonb_typeof(trivia) not in ('array','null') then
      raise exception 'invalid_trivia';
    end if;
    if jsonb_typeof(trivia)='array' then
      if jsonb_array_length(trivia) > 10 then raise exception 'trivia_limit'; end if;
      trivia_position := 0;
      for trivia_item in select value from jsonb_array_elements(trivia) loop
        trivia_position := trivia_position + 1;
        insert into public.trivia_questions(event_flight_item_id,position,question,options,correct_index,explanation,answer_window_seconds)
        values(
          saved_flight_id,
          trivia_position,
          coalesce(trivia_item->>'question',''),
          coalesce(trivia_item->'options','["",""]'::jsonb),
          coalesce((trivia_item->>'correct_index')::integer,0),
          nullif(trivia_item->>'explanation',''),
          coalesce((trivia_item->>'answer_window_seconds')::integer,20)
        );
      end loop;
    end if;
  end loop;

  if (select count(*) from public.event_flight_items fi where fi.event_id=saved_id) > 0 then
    update public.events e set
      current_flight_item_id=(select fi.id from public.event_flight_items fi where fi.event_id=saved_id order by position limit 1),
      current_trivia_question_id=null
    where id=saved_id;
  end if;
  if coalesce(p_event->>'status','draft')='scheduled' and exists(select 1 from public.event_readiness(saved_id) where not met) then raise exception 'not_ready'; end if;
  return saved_id;
end $$;

create or replace function public.event_readiness(p_event_id uuid)
returns table(key text, met boolean, message text)
language sql stable security definer set search_path = public as $$
  with e as (select * from public.events where id = p_event_id),
  f as (select * from public.event_flight_items where event_id = p_event_id),
  q as (select tq.* from public.trivia_questions tq join f on f.id = tq.event_flight_item_id)
  select 'title', exists(select 1 from e where length(trim(title)) >= 3), 'Event title is set.' union all
  select 'starts_at', exists(select 1 from e where starts_at is not null), 'Start time is set.' union all
  select 'location', exists(select 1 from e where (location_mode='remote' and video_call_url is not null) or (location_mode='in_person' and venue_name is not null and venue_address is not null)), 'Location details are complete.' union all
  select 'capacity', exists(select 1 from e where capacity between 1 and 100), 'Capacity is valid.' union all
  select 'host', exists(select 1 from e join public.profiles p on p.id=e.host_user_id where p.role in ('host','admin')), 'Host is assigned.' union all
  select 'backup', exists(select 1 from e join public.profiles p on p.id=e.backup_host_user_id where p.role in ('host','admin') and e.backup_host_user_id <> e.host_user_id), 'Backup host is assigned.' union all
  select 'flight', exists(select 1 from f), 'At least one tea is in the flight.' union all
  select 'steep', exists(select 1 from f) and not exists(select 1 from f where steep_seconds is null or steep_seconds < 1), 'Every tea has a steep time.' union all
  select 'reveal', exists(select 1 from f) and not exists(select 1 from f where length(trim(reveal_description)) = 0), 'Every tea has reveal text.' union all
  select 'brewing', exists(select 1 from f) and not exists(select 1 from f where length(trim(brewing_instructions)) = 0), 'Every tea has brewing guidance.' union all
  select 'trivia', exists(select 1 from f) and not exists(
    select 1 from f
    where (select count(*) from q where q.event_flight_item_id=f.id) not between 1 and 10
      or exists(
        select 1 from q
        where q.event_flight_item_id=f.id
          and (length(trim(q.question))=0 or not public.valid_trivia_options(q.options,q.correct_index))
      )
  ), 'Every tea has 1 to 10 complete trivia questions.' union all
  select 'invite', exists(select 1 from e where invite_code is not null), 'Invite code is active.';
$$;

-- Keep response metrics independent of the number of trivia questions on a tea.
create or replace view public.event_analytics as
select
  e.id as event_id,
  (
    select count(*)
    from public.participants p
    where p.event_id=e.id and p.status <> 'removed'
  ) as participants,
  (
    select count(distinct tr.participant_id)
    from public.tea_responses tr
    join public.participants p on p.id=tr.participant_id
    where p.event_id=e.id and tr.completed_at is not null
  ) as completed_participants,
  (
    select round(avg(tr.rating)::numeric,2)
    from public.tea_responses tr
    join public.participants p on p.id=tr.participant_id
    where p.event_id=e.id
  ) as average_rating,
  (
    select count(*)
    from public.tea_responses tr
    join public.participants p on p.id=tr.participant_id
    where p.event_id=e.id and tr.saved
  ) as tea_saves,
  (
    select count(*)
    from public.trivia_answers ta
    join public.participants p on p.id=ta.participant_id
    join public.trivia_questions tq on tq.id=ta.trivia_question_id
    join public.event_flight_items fi on fi.id=tq.event_flight_item_id
    where p.event_id=e.id and fi.event_id=e.id and ta.on_time
  ) as trivia_answers,
  (
    select count(*)
    from public.trivia_answers ta
    join public.participants p on p.id=ta.participant_id
    join public.trivia_questions tq on tq.id=ta.trivia_question_id
    join public.event_flight_items fi on fi.id=tq.event_flight_item_id
    where p.event_id=e.id and fi.event_id=e.id and ta.on_time and ta.is_correct
  ) as trivia_correct
from public.events e;

create or replace function public.apply_event_command(p_event_id uuid, p_command text, p_expected_sequence bigint, p_lease_token uuid)
returns public.events
language plpgsql security definer set search_path = public as $$
declare
  e public.events;
  lease public.host_control_leases;
  current_item public.event_flight_items;
  next_item public.event_flight_items;
  current_question public.trivia_questions;
  next_question public.trivia_questions;
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
  if e.current_trivia_question_id is not null then
    select * into current_question from public.trivia_questions
      where id=e.current_trivia_question_id and event_flight_item_id=e.current_flight_item_id;
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
      e.current_trivia_question_id=null;
      e.tasting_opened_flight_item_id=null;
      e.reveal_at=null;

    when 'reveal_tea' then
      if not (
        e.phase='welcome'
        or (e.phase='tasting' and e.current_flight_item_id is distinct from e.tasting_opened_flight_item_id)
      ) then raise exception 'illegal_phase'; end if;
      if current_item.id is null then raise exception 'flight_missing'; end if;
      target_phase='reveal';
      e.current_trivia_question_id=null;
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
      select * into next_question from public.trivia_questions
        where event_flight_item_id=e.current_flight_item_id
          and (current_question.id is null or position>current_question.position)
        order by position limit 1;
      if next_question.id is null then
        if current_question.id is null then raise exception 'trivia_missing'; end if;
        raise exception 'trivia_complete';
      end if;
      target_phase='trivia';
      e.current_trivia_question_id=next_question.id;
      e.trivia_opened_at=now();
      e.trivia_closes_at=now()+make_interval(secs=>next_question.answer_window_seconds);

    when 'close_trivia' then
      if e.phase <> 'trivia' or current_question.id is null then raise exception 'illegal_phase'; end if;
      target_phase='trivia';
      e.trivia_closes_at=now();

    when 'return_to_tasting' then
      if e.phase <> 'trivia' or not trivia_is_closed then raise exception 'trivia_open'; end if;
      target_phase='tasting';

    when 'next_tea' then
      if e.tasting_opened_flight_item_id is distinct from e.current_flight_item_id then raise exception 'tasting_not_open'; end if;
      if e.phase not in ('tasting','trivia') or not trivia_is_closed then raise exception 'trivia_open'; end if;
      if current_question.id is null or exists(
        select 1 from public.trivia_questions
        where event_flight_item_id=e.current_flight_item_id and position>current_question.position
      ) then raise exception 'trivia_incomplete'; end if;
      select * into next_item from public.event_flight_items
        where event_id=p_event_id and position>current_item.position order by position limit 1;
      if next_item.id is null then raise exception 'last_tea'; end if;
      target_phase='tasting';
      e.current_flight_item_id=next_item.id;
      e.current_trivia_question_id=null;
      e.reveal_at=null;
      e.timer_started_at=null;
      e.timer_ends_at=null;
      e.trivia_opened_at=null;
      e.trivia_closes_at=null;

    when 'start_recap' then
      if e.tasting_opened_flight_item_id is distinct from e.current_flight_item_id then raise exception 'tasting_not_open'; end if;
      if e.phase not in ('tasting','trivia') or not trivia_is_closed then raise exception 'trivia_open'; end if;
      if current_question.id is null or exists(
        select 1 from public.trivia_questions
        where event_flight_item_id=e.current_flight_item_id and position>current_question.position
      ) then raise exception 'trivia_incomplete'; end if;
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
    current_trivia_question_id=e.current_trivia_question_id,
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
    'current_trivia_question_id',e.current_trivia_question_id,
    'tasting_opened_flight_item_id',e.tasting_opened_flight_item_id,
    'reveal_at',e.reveal_at,
    'timer_ends_at',e.timer_ends_at
  ));

  if p_command='end_session' then
    delete from public.host_control_leases where event_id=p_event_id;
  end if;
  return e;
end $$;

revoke all on function public.save_event_bundle(jsonb,jsonb) from public,anon;
grant execute on function public.save_event_bundle(jsonb,jsonb) to authenticated,service_role;
revoke all on function public.event_readiness(uuid) from public,anon,authenticated;
grant execute on function public.event_readiness(uuid) to service_role;
revoke all on function public.apply_event_command(uuid,text,bigint,uuid) from public,anon;
grant execute on function public.apply_event_command(uuid,text,bigint,uuid) to authenticated;
