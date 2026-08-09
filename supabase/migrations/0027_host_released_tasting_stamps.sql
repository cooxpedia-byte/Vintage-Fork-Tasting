-- A guest completing a tasting card makes the card eligible for a stamp.
-- The stamp itself is released only by host progress: advancing to the next
-- tea releases the previous tea, and ending the event releases every eligible
-- card that has not already been stamped.

alter table public.tea_responses
  add column if not exists stamp_released_at timestamptz;

alter table public.tea_responses
  drop constraint if exists tea_responses_stamp_requires_completion;

alter table public.tea_responses
  add constraint tea_responses_stamp_requires_completion
  check (stamp_released_at is null or completed_at is not null) not valid;

alter table public.tea_responses
  validate constraint tea_responses_stamp_requires_completion;

-- Existing completed events have already crossed the host-controlled release
-- boundary, so retain their historical Passport stamps during rollout.
update public.tea_responses response
set stamp_released_at = coalesce(event.completed_at, response.completed_at)
from public.event_flight_items flight
join public.events event on event.id = flight.event_id
where response.event_flight_item_id = flight.id
  and response.completed_at is not null
  and response.stamp_released_at is null
  and event.status = 'completed';

create or replace function public.release_tasting_stamps_on_host_progress()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- `next_tea` changes the current flight item. Release only completed cards
  -- for the tea the host just left.
  if old.current_flight_item_id is not null
    and old.current_flight_item_id is distinct from new.current_flight_item_id then
    update public.tea_responses response
    set stamp_released_at = coalesce(response.stamp_released_at, clock_timestamp())
    where response.event_flight_item_id = old.current_flight_item_id
      and response.completed_at is not null
      and response.stamp_released_at is null;
  end if;

  -- `end_session` completes the event. Release any eligible card still
  -- waiting, including the final tea and an early-ended current tea.
  if new.status = 'completed' and old.status is distinct from new.status then
    update public.tea_responses response
    set stamp_released_at = coalesce(response.stamp_released_at, new.completed_at, clock_timestamp())
    where response.completed_at is not null
      and response.stamp_released_at is null
      and exists (
        select 1
        from public.event_flight_items flight
        where flight.id = response.event_flight_item_id
          and flight.event_id = new.id
      );
  end if;

  return new;
end $$;

drop trigger if exists events_release_tasting_stamps on public.events;
create trigger events_release_tasting_stamps
after update of current_flight_item_id, status on public.events
for each row execute function public.release_tasting_stamps_on_host_progress();

-- Close the submission/host-command race in either order. If a completed card
-- arrives just after the host transaction has already crossed its release
-- boundary, stamp that card immediately because the host release already
-- happened.
create or replace function public.release_late_tasting_stamp_after_host_progress()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  event_status public.event_status;
  event_current_flight_item_id uuid;
begin
  if new.completed_at is null or new.stamp_released_at is not null then
    return new;
  end if;

  select event.status, event.current_flight_item_id
  into event_status, event_current_flight_item_id
  from public.event_flight_items flight
  join public.events event on event.id = flight.event_id
  where flight.id = new.event_flight_item_id;

  if event_status = 'completed'
    or event_current_flight_item_id is distinct from new.event_flight_item_id then
    new.stamp_released_at = clock_timestamp();
  end if;

  return new;
end $$;

drop trigger if exists tea_responses_release_late_stamp on public.tea_responses;
create trigger tea_responses_release_late_stamp
before insert or update of completed_at, event_flight_item_id on public.tea_responses
for each row execute function public.release_late_tasting_stamp_after_host_progress();
