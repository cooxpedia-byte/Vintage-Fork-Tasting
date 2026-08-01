-- Vintage Fork Tasting launch schema
create extension if not exists pgcrypto;

create type public.user_role as enum ('customer','host','admin');
create type public.event_status as enum ('draft','scheduled','live','completed','cancelled');
create type public.location_mode as enum ('remote','in_person');
create type public.session_phase as enum ('lobby','welcome','reveal','brewing','tasting','trivia','recap','ended');
create type public.participant_status as enum ('registered','waiting','admitted','active','left','removed');
create type public.intensity_level as enum ('subtle','clear','dominant');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  role public.user_role not null default 'customer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.teas (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  producer text,
  origin text,
  tea_type text,
  default_character text,
  default_brewing text,
  default_steep_seconds integer check (default_steep_seconds between 1 and 3600),
  image_path text,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  invite_code text unique,
  status public.event_status not null default 'draft',
  location_mode public.location_mode not null default 'remote',
  starts_at timestamptz not null,
  ends_at timestamptz,
  timezone text not null default 'America/Edmonton',
  capacity integer not null default 12 check (capacity between 1 and 100),
  venue_name text,
  venue_address text,
  video_call_url text,
  owner_user_id uuid not null references public.profiles(id),
  host_user_id uuid not null references public.profiles(id),
  backup_host_user_id uuid references public.profiles(id),
  phase public.session_phase not null default 'lobby',
  sequence_number bigint not null default 0,
  current_flight_item_id uuid,
  timer_started_at timestamptz,
  timer_ends_at timestamptz,
  trivia_opened_at timestamptz,
  trivia_closes_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint different_backup check (backup_host_user_id is null or backup_host_user_id <> host_user_id),
  constraint location_details check (
    (location_mode = 'remote' and video_call_url is not null)
    or (location_mode = 'in_person' and venue_name is not null and venue_address is not null)
    or status = 'draft'
  )
);

create table public.event_flight_items (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  tea_id uuid not null references public.teas(id),
  position integer not null check (position > 0),
  reveal_title text not null,
  reveal_description text not null default '',
  brewing_instructions text not null default '',
  steep_seconds integer not null check (steep_seconds between 1 and 3600),
  temperature_c numeric(5,2),
  leaf_grams numeric(6,2),
  water_ml integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(event_id, position)
);

alter table public.events add constraint events_current_flight_fk
  foreign key (current_flight_item_id) references public.event_flight_items(id) on delete set null;

create table public.trivia_questions (
  id uuid primary key default gen_random_uuid(),
  event_flight_item_id uuid not null unique references public.event_flight_items(id) on delete cascade,
  question text not null,
  options jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 4),
  correct_index integer not null check (correct_index between 0 and 3),
  explanation text,
  answer_window_seconds integer not null default 20 check (answer_window_seconds between 10 and 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.participants (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  display_name text not null check (char_length(display_name) between 1 and 40),
  email text,
  marketing_consent boolean,
  status public.participant_status not null default 'registered',
  joined_at timestamptz,
  left_at timestamptz,
  last_seen_at timestamptz,
  recap_claimed_at timestamptz,
  delete_after timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index participants_event_idx on public.participants(event_id);
create index participants_user_idx on public.participants(user_id);
create unique index participants_event_user_unique on public.participants(event_id, user_id) where user_id is not null;

create table public.participant_tokens (
  participant_id uuid primary key references public.participants(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.tea_responses (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants(id) on delete cascade,
  event_flight_item_id uuid not null references public.event_flight_items(id) on delete cascade,
  first_impression text,
  descriptors text[] not null default '{}',
  intensity public.intensity_level,
  rating integer check (rating between 1 and 5),
  personal_notes text,
  saved boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(participant_id, event_flight_item_id),
  check (cardinality(descriptors) <= 3)
);

create table public.trivia_answers (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants(id) on delete cascade,
  trivia_question_id uuid not null references public.trivia_questions(id) on delete cascade,
  selected_index integer not null check (selected_index between 0 and 3),
  is_correct boolean not null,
  answered_at timestamptz not null default now(),
  unique(participant_id, trivia_question_id)
);

create table public.host_control_leases (
  event_id uuid primary key references public.events(id) on delete cascade,
  holder_user_id uuid not null references public.profiles(id),
  lease_token uuid not null default gen_random_uuid(),
  expires_at timestamptz not null,
  heartbeat_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.event_state_log (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.events(id) on delete cascade,
  sequence_number bigint not null,
  command text not null,
  phase public.session_phase not null,
  actor_user_id uuid references public.profiles(id),
  payload jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique(event_id, sequence_number)
);

create table public.event_media (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete cascade,
  tea_id uuid references public.teas(id) on delete cascade,
  storage_path text not null unique,
  media_type text not null,
  alt_text text,
  uploaded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  check ((event_id is not null)::int + (tea_id is not null)::int = 1)
);

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger teas_touch before update on public.teas for each row execute function public.touch_updated_at();
create trigger events_touch before update on public.events for each row execute function public.touch_updated_at();
create trigger flight_touch before update on public.event_flight_items for each row execute function public.touch_updated_at();
create trigger trivia_touch before update on public.trivia_questions for each row execute function public.touch_updated_at();
create trigger participants_touch before update on public.participants for each row execute function public.touch_updated_at();
create trigger responses_touch before update on public.tea_responses for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)), 'customer')
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.is_staff(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id = uid and role in ('host','admin'));
$$;

create or replace function public.can_manage_event(p_event_id uuid, uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.events e join public.profiles p on p.id = uid
    where e.id = p_event_id
      and (p.role = 'admin' or uid in (e.owner_user_id, e.host_user_id, e.backup_host_user_id))
  );
$$;

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
  select 'host', exists(select 1 from e where host_user_id is not null), 'Host is assigned.' union all
  select 'backup', exists(select 1 from e where backup_host_user_id is not null and backup_host_user_id <> host_user_id), 'Backup host is assigned.' union all
  select 'flight', exists(select 1 from f), 'At least one tea is in the flight.' union all
  select 'steep', not exists(select 1 from f where steep_seconds is null or steep_seconds < 1), 'Every tea has a steep time.' union all
  select 'reveal', not exists(select 1 from f where length(trim(reveal_description)) = 0), 'Every tea has reveal text.' union all
  select 'brewing', not exists(select 1 from f where length(trim(brewing_instructions)) = 0), 'Every tea has brewing guidance.' union all
  select 'trivia', (select count(*) from q) = (select count(*) from f), 'Every tea has trivia.' union all
  select 'invite', exists(select 1 from e where invite_code is not null), 'Invite code is active.';
$$;

create or replace function public.acquire_host_control(p_event_id uuid, p_force boolean default false)
returns public.host_control_leases
language plpgsql security definer set search_path = public as $$
declare existing public.host_control_leases; result public.host_control_leases;
begin
  if auth.uid() is null or not public.can_manage_event(p_event_id, auth.uid()) then raise exception 'not_authorized'; end if;
  select * into existing from public.host_control_leases where event_id = p_event_id for update;
  if existing.event_id is not null and existing.expires_at > now() and existing.holder_user_id <> auth.uid() and not p_force then
    raise exception 'control_held';
  end if;
  insert into public.host_control_leases(event_id, holder_user_id, lease_token, expires_at, heartbeat_at)
  values(p_event_id, auth.uid(), gen_random_uuid(), now() + interval '45 seconds', now())
  on conflict(event_id) do update set holder_user_id=excluded.holder_user_id, lease_token=excluded.lease_token, expires_at=excluded.expires_at, heartbeat_at=excluded.heartbeat_at, updated_at=now()
  returning * into result;
  return result;
end $$;

create or replace function public.heartbeat_host_control(p_event_id uuid, p_lease_token uuid)
returns public.host_control_leases
language plpgsql security definer set search_path = public as $$
declare result public.host_control_leases;
begin
  update public.host_control_leases set heartbeat_at=now(), expires_at=now()+interval '45 seconds', updated_at=now()
  where event_id=p_event_id and holder_user_id=auth.uid() and lease_token=p_lease_token and expires_at > now()-interval '15 seconds'
  returning * into result;
  if result.event_id is null then raise exception 'lease_lost'; end if;
  return result;
end $$;

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
      if e.phase <> 'lobby' then raise exception 'illegal_phase'; end if;
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

create or replace view public.event_analytics as
select e.id as event_id,
  count(distinct p.id) filter (where p.status <> 'removed') as participants,
  count(distinct tr.participant_id) filter (where tr.completed_at is not null) as completed_participants,
  round(avg(tr.rating)::numeric,2) as average_rating,
  count(*) filter (where tr.saved) as tea_saves,
  count(ta.id) as trivia_answers,
  count(ta.id) filter (where ta.is_correct) as trivia_correct
from public.events e
left join public.participants p on p.event_id=e.id
left join public.event_flight_items fi on fi.event_id=e.id
left join public.tea_responses tr on tr.participant_id=p.id and tr.event_flight_item_id=fi.id
left join public.trivia_questions tq on tq.event_flight_item_id=fi.id
left join public.trivia_answers ta on ta.participant_id=p.id and ta.trivia_question_id=tq.id
group by e.id;

alter table public.profiles enable row level security;
alter table public.teas enable row level security;
alter table public.events enable row level security;
alter table public.event_flight_items enable row level security;
alter table public.trivia_questions enable row level security;
alter table public.participants enable row level security;
alter table public.participant_tokens enable row level security;
alter table public.tea_responses enable row level security;
alter table public.trivia_answers enable row level security;
alter table public.host_control_leases enable row level security;
alter table public.event_state_log enable row level security;
alter table public.event_media enable row level security;

create policy profiles_self_read on public.profiles for select using (id=auth.uid() or public.is_staff(auth.uid()));
create policy profiles_self_update on public.profiles for update using (id=auth.uid()) with check (id=auth.uid());
create policy teas_staff_all on public.teas for all using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));
create policy teas_public_read on public.teas for select using (retired_at is null);
create policy events_staff_all on public.events for all using (public.can_manage_event(id,auth.uid())) with check (public.is_staff(auth.uid()));
create policy events_guest_read on public.events for select using (invite_code is not null and status in ('scheduled','live','completed'));
create policy flight_staff_all on public.event_flight_items for all using (public.can_manage_event(event_id,auth.uid())) with check (public.can_manage_event(event_id,auth.uid()));
create policy flight_guest_read on public.event_flight_items for select using (exists(select 1 from public.events e where e.id=event_id and e.invite_code is not null and e.status in ('scheduled','live','completed')));
create policy trivia_staff_all on public.trivia_questions for all using (exists(select 1 from public.event_flight_items fi where fi.id=event_flight_item_id and public.can_manage_event(fi.event_id,auth.uid()))) with check (exists(select 1 from public.event_flight_items fi where fi.id=event_flight_item_id and public.can_manage_event(fi.event_id,auth.uid())));
create policy trivia_guest_read on public.trivia_questions for select using (exists(select 1 from public.event_flight_items fi join public.events e on e.id=fi.event_id where fi.id=event_flight_item_id and e.invite_code is not null and e.status in ('live','completed')));
create policy participants_staff_read on public.participants for select using (public.can_manage_event(event_id,auth.uid()));
create policy participants_customer_read on public.participants for select using (user_id=auth.uid());
create policy responses_customer_all on public.tea_responses for all using (exists(select 1 from public.participants p where p.id=participant_id and p.user_id=auth.uid())) with check (exists(select 1 from public.participants p where p.id=participant_id and p.user_id=auth.uid()));
create policy responses_staff_aggregate_read on public.tea_responses for select using (exists(select 1 from public.participants p where p.id=participant_id and public.can_manage_event(p.event_id,auth.uid())));
create policy answers_customer_read on public.trivia_answers for select using (exists(select 1 from public.participants p where p.id=participant_id and p.user_id=auth.uid()));
create policy answers_staff_read on public.trivia_answers for select using (exists(select 1 from public.participants p where p.id=participant_id and public.can_manage_event(p.event_id,auth.uid())));
create policy leases_staff_read on public.host_control_leases for select using (public.can_manage_event(event_id,auth.uid()));
create policy log_staff_read on public.event_state_log for select using (public.can_manage_event(event_id,auth.uid()));
create policy media_staff_all on public.event_media for all using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

-- Realtime publication. Safe tables expose only rows permitted by RLS.
alter publication supabase_realtime add table public.events;
alter publication supabase_realtime add table public.participants;
alter publication supabase_realtime add table public.host_control_leases;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('tasting-media','tasting-media',false,10485760,array['image/jpeg','image/png','image/webp','audio/mpeg','audio/ogg'])
on conflict(id) do nothing;
create policy storage_staff_write on storage.objects for all to authenticated
using (bucket_id='tasting-media' and public.is_staff(auth.uid()))
with check (bucket_id='tasting-media' and public.is_staff(auth.uid()));
create policy storage_signed_read on storage.objects for select to authenticated
using (bucket_id='tasting-media');
