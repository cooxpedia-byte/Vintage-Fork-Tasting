-- Remote tastings use the event-scoped Agora room built into the host and
-- guest interfaces. External Zoom or Google Meet URLs are no longer required.
-- Keep video_call_url nullable for historical records and emergency rollback.

alter table public.events
  drop constraint if exists location_details;

alter table public.events
  add constraint location_details check (
    location_mode = 'remote'
    or (
      location_mode = 'in_person'
      and venue_name is not null
      and venue_address is not null
    )
    or status = 'draft'
  );

create or replace function public.event_readiness(p_event_id uuid)
returns table(key text, met boolean, message text)
language sql stable security definer set search_path = public as $$
  with e as (select * from public.events where id = p_event_id),
  f as (select * from public.event_flight_items where event_id = p_event_id),
  q as (select tq.* from public.trivia_questions tq join f on f.id = tq.event_flight_item_id)
  select 'title', exists(select 1 from e where length(trim(title)) >= 3), 'Event title is set.' union all
  select 'starts_at', exists(select 1 from e where starts_at is not null), 'Start time is set.' union all
  select 'location', exists(select 1 from e where location_mode='remote' or (location_mode='in_person' and venue_name is not null and venue_address is not null)), 'Event format details are complete.' union all
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

revoke all on function public.event_readiness(uuid) from public,anon,authenticated;
grant execute on function public.event_readiness(uuid) to service_role;
