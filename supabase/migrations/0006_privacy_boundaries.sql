-- Prevent self-service role escalation. Customers may update only their display name.
revoke update on public.profiles from authenticated;
grant update(display_name) on public.profiles to authenticated;

-- Staff interfaces must not have direct table access to participant free-text notes or individual trivia choices.
-- Aggregate results are computed only in protected server routes.
drop policy if exists responses_staff_aggregate_read on public.tea_responses;
drop policy if exists answers_staff_read on public.trivia_answers;

-- Remove broad anonymous access to full event/flight/trivia records.
drop policy if exists events_guest_read on public.events;
drop policy if exists flight_guest_read on public.event_flight_items;
drop policy if exists trivia_guest_read on public.trivia_questions;

-- Account-linked customers can read only events and flight records they participated in.
create policy events_customer_read on public.events for select using (
  exists(select 1 from public.participants p where p.event_id=events.id and p.user_id=auth.uid())
);
create policy flight_customer_read on public.event_flight_items for select using (
  exists(
    select 1 from public.participants p
    where p.event_id=event_flight_items.event_id and p.user_id=auth.uid()
  )
);

-- Minimal Realtime feed for anonymous guest clients. No invite, video URL, host IDs,
-- future tea content, trivia answers, participant details, or private responses.
create table public.event_public_state (
  event_id uuid primary key references public.events(id) on delete cascade,
  status public.event_status not null,
  phase public.session_phase not null,
  sequence_number bigint not null,
  current_flight_item_id uuid,
  timer_ends_at timestamptz,
  trivia_closes_at timestamptz,
  updated_at timestamptz not null default now()
);

insert into public.event_public_state(event_id,status,phase,sequence_number,current_flight_item_id,timer_ends_at,trivia_closes_at,updated_at)
select id,status,phase,sequence_number,current_flight_item_id,timer_ends_at,trivia_closes_at,updated_at from public.events
on conflict(event_id) do update set status=excluded.status,phase=excluded.phase,sequence_number=excluded.sequence_number,
current_flight_item_id=excluded.current_flight_item_id,timer_ends_at=excluded.timer_ends_at,trivia_closes_at=excluded.trivia_closes_at,updated_at=excluded.updated_at;

create or replace function public.sync_event_public_state() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  insert into public.event_public_state(event_id,status,phase,sequence_number,current_flight_item_id,timer_ends_at,trivia_closes_at,updated_at)
  values(new.id,new.status,new.phase,new.sequence_number,new.current_flight_item_id,new.timer_ends_at,new.trivia_closes_at,new.updated_at)
  on conflict(event_id) do update set status=excluded.status,phase=excluded.phase,sequence_number=excluded.sequence_number,
    current_flight_item_id=excluded.current_flight_item_id,timer_ends_at=excluded.timer_ends_at,
    trivia_closes_at=excluded.trivia_closes_at,updated_at=excluded.updated_at;
  return new;
end $$;
create trigger events_public_state_sync after insert or update of status,phase,sequence_number,current_flight_item_id,timer_ends_at,trivia_closes_at on public.events
for each row execute function public.sync_event_public_state();

alter table public.event_public_state enable row level security;
grant select on public.event_public_state to anon,authenticated;
create policy public_state_read on public.event_public_state for select to anon,authenticated using (true);
revoke insert,update,delete on public.event_public_state from anon,authenticated;
alter publication supabase_realtime add table public.event_public_state;
