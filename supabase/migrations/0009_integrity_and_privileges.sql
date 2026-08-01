-- Validate trivia structurally at the database boundary, not only in the browser.
create or replace function public.valid_trivia_options(p_options jsonb, p_correct_index integer)
returns boolean language sql immutable set search_path=public as $$
  select jsonb_typeof(p_options)='array'
    and jsonb_array_length(p_options) between 2 and 4
    and p_correct_index >= 0
    and p_correct_index < jsonb_array_length(p_options)
    and not exists (
      select 1 from jsonb_array_elements_text(p_options) as option_value(value)
      where length(trim(value))=0
    );
$$;

alter table public.trivia_questions
  add constraint trivia_correct_index_in_range check (correct_index < jsonb_array_length(options));

-- Drafts may retain incomplete question text/options. Scheduling uses this one
-- server readiness contract to require complete, nonblank trivia for every tea.
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
    select 1 from f left join q on q.event_flight_item_id=f.id
    where q.id is null or length(trim(q.question))=0 or not public.valid_trivia_options(q.options,q.correct_index)
  ), 'Every tea has complete trivia.' union all
  select 'invite', exists(select 1 from e where invite_code is not null), 'Invite code is active.';
$$;

-- Keep participant responses and answers scoped to their own event even when
-- service-role routes perform the write.
create or replace function public.validate_tea_response_scope() returns trigger
language plpgsql set search_path=public as $$
declare participant_event uuid; flight_event uuid;
begin
  select event_id into participant_event from public.participants where id=new.participant_id;
  select event_id into flight_event from public.event_flight_items where id=new.event_flight_item_id;
  if participant_event is null or flight_event is null or participant_event <> flight_event then raise exception 'response_event_mismatch'; end if;
  return new;
end $$;
create trigger tea_response_scope before insert or update of participant_id,event_flight_item_id on public.tea_responses
for each row execute function public.validate_tea_response_scope();

create or replace function public.validate_trivia_answer_scope() returns trigger
language plpgsql set search_path=public as $$
declare participant_event uuid; question_event uuid; option_count integer;
begin
  select event_id into participant_event from public.participants where id=new.participant_id;
  select fi.event_id, jsonb_array_length(tq.options) into question_event, option_count
    from public.trivia_questions tq join public.event_flight_items fi on fi.id=tq.event_flight_item_id
    where tq.id=new.trivia_question_id;
  if participant_event is null or question_event is null or participant_event <> question_event then raise exception 'answer_event_mismatch'; end if;
  if new.selected_index < 0 or new.selected_index >= option_count then raise exception 'answer_option_invalid'; end if;
  return new;
end $$;
create trigger trivia_answer_scope before insert or update of participant_id,trivia_question_id,selected_index on public.trivia_answers
for each row execute function public.validate_trivia_answer_scope();

-- Capacity can never be reduced below guests who still hold a place.
create or replace function public.enforce_event_capacity() returns trigger
language plpgsql set search_path=public as $$
declare occupied integer;
begin
  select count(*) into occupied from public.participants where event_id=new.id and status not in ('left','removed');
  if new.capacity < occupied then raise exception 'capacity_below_joined'; end if;
  return new;
end $$;
create trigger event_capacity_guard before update of capacity on public.events
for each row execute function public.enforce_event_capacity();

-- Account-linked customers may read their history but cannot bypass live server
-- phase checks with direct table writes.
drop policy if exists responses_customer_all on public.tea_responses;
create policy responses_customer_read on public.tea_responses for select using (
  exists(select 1 from public.participants p where p.id=tea_responses.participant_id and p.user_id=auth.uid())
);
revoke insert,update,delete on public.tea_responses from authenticated;
revoke insert,update,delete on public.trivia_answers from authenticated;

-- Event setup writes are transactional through save_event_bundle; live state writes
-- are transactional through apply_event_command.
revoke insert,update,delete on public.events from authenticated;
revoke insert,update,delete on public.event_flight_items from authenticated;
revoke insert,update,delete on public.trivia_questions from authenticated;

-- Security-definer helpers have explicit execution boundaries.
revoke all on function public.is_staff(uuid) from public,anon;
grant execute on function public.is_staff(uuid) to authenticated,service_role;
revoke all on function public.can_manage_event(uuid,uuid) from public,anon;
grant execute on function public.can_manage_event(uuid,uuid) to authenticated,service_role;
revoke all on function public.event_readiness(uuid) from public,anon,authenticated;
grant execute on function public.event_readiness(uuid) to service_role;
