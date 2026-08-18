-- The Living Tasting Map is an immutable sensory event stream with privacy-safe projections.
-- Agora remains video transport; Supabase/Postgres owns map time, state, replay, and fingerprints.

create table public.living_tasting_map_sessions(
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  event_flight_item_id uuid not null references public.event_flight_items(id) on delete cascade,
  status text not null default 'ready' check(status in ('ready','live','paused','frozen','replaying','committed')),
  duration_seconds integer not null default 720 check(duration_seconds between 60 and 1800),
  visibility_mode text not null default 'quiet_start' check(visibility_mode in ('quiet_start','shared_live')),
  custom_notes_enabled boolean not null default true,
  started_at timestamptz,
  paused_at timestamptz,
  accumulated_pause_ms bigint not null default 0 check(accumulated_pause_ms>=0),
  frozen_at timestamptz,
  replay_started_at timestamptz,
  replay_paused_at timestamptz,
  replay_position_ms integer not null default 0 check(replay_position_ms>=0),
  replay_duration_seconds integer not null default 40 check(replay_duration_seconds between 20 and 120),
  version bigint not null default 1,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(event_id,event_flight_item_id)
);

create table public.living_tasting_map_observation_events(
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.living_tasting_map_sessions(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  event_flight_item_id uuid not null references public.event_flight_items(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  layer text not null check(layer in ('aroma','taste')),
  flavor_key text not null check(char_length(flavor_key) between 1 and 80),
  flavor_label text not null check(char_length(flavor_label) between 1 and 80),
  family text not null check(family in ('floral','fruit','sweet','roasted','earthy','mineral','vegetal','spice','nutty','savoury')),
  is_custom boolean not null default false,
  intensity integer not null check(intensity between 0 and 100),
  action text not null check(action in ('add','update','remove')),
  elapsed_ms integer not null check(elapsed_ms between 0 and 1800000),
  client_sequence integer not null check(client_sequence>=0),
  client_id uuid not null,
  server_time timestamptz not null default clock_timestamp(),
  unique(session_id,participant_id,client_id)
);

create index living_map_events_projector_idx on public.living_tasting_map_observation_events(session_id,elapsed_ms,server_time,id);
create index living_map_events_active_idx on public.living_tasting_map_observation_events(session_id,participant_id,layer,flavor_key,server_time desc);

create table public.living_tasting_map_snapshots(
  id bigint generated always as identity primary key,
  session_id uuid not null references public.living_tasting_map_sessions(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  event_flight_item_id uuid not null references public.event_flight_items(id) on delete cascade,
  captured_at timestamptz not null default now(),
  elapsed_ms integer not null check(elapsed_ms between 0 and 1800000),
  aggregate_payload jsonb not null,
  source_event_count integer not null default 0 check(source_event_count>=0),
  is_prompt_marker boolean not null default false,
  projector_version integer not null default 1
);

create index living_map_snapshots_latest_idx on public.living_tasting_map_snapshots(session_id,id desc);
create index living_map_snapshots_realtime_idx on public.living_tasting_map_snapshots(event_id,event_flight_item_id,id desc);

create table public.living_tasting_map_moderation_actions(
  id bigint generated always as identity primary key,
  session_id uuid not null references public.living_tasting_map_sessions(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  flavor_key text not null check(char_length(flavor_key) between 1 and 80),
  action text not null check(action in ('hide','restore')),
  reason text check(reason is null or char_length(reason)<=240),
  actor_user_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index living_map_moderation_latest_idx on public.living_tasting_map_moderation_actions(session_id,flavor_key,id desc);

create table public.living_tasting_map_fingerprints(
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.living_tasting_map_sessions(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  event_flight_item_id uuid not null references public.event_flight_items(id) on delete cascade,
  final_snapshot jsonb not null,
  replay_manifest jsonb not null,
  generated_patterns jsonb not null default '[]'::jsonb,
  version integer not null default 1 check(version>0),
  committed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.living_tasting_map_sessions enable row level security;
alter table public.living_tasting_map_observation_events enable row level security;
alter table public.living_tasting_map_snapshots enable row level security;
alter table public.living_tasting_map_moderation_actions enable row level security;
alter table public.living_tasting_map_fingerprints enable row level security;

create policy living_map_sessions_member_read on public.living_tasting_map_sessions for select to authenticated using(
  public.can_manage_event(event_id,auth.uid()) or exists(
    select 1 from public.participants participant where participant.event_id=living_tasting_map_sessions.event_id
      and participant.user_id=auth.uid() and participant.status<>'removed'
  )
);
create policy living_map_snapshots_member_read on public.living_tasting_map_snapshots for select to authenticated using(
  public.can_manage_event(event_id,auth.uid()) or exists(
    select 1 from public.participants participant where participant.event_id=living_tasting_map_snapshots.event_id
      and participant.user_id=auth.uid() and participant.status<>'removed'
  )
);
create policy living_map_fingerprints_member_read on public.living_tasting_map_fingerprints for select to authenticated using(
  public.can_manage_event(event_id,auth.uid()) or exists(
    select 1 from public.participants participant where participant.event_id=living_tasting_map_fingerprints.event_id
      and participant.user_id=auth.uid() and participant.status<>'removed'
  )
);

revoke all on public.living_tasting_map_sessions,public.living_tasting_map_observation_events,
  public.living_tasting_map_snapshots,public.living_tasting_map_moderation_actions,public.living_tasting_map_fingerprints from anon,authenticated;
grant select on public.living_tasting_map_sessions,public.living_tasting_map_snapshots,public.living_tasting_map_fingerprints to authenticated;

alter publication supabase_realtime add table public.living_tasting_map_snapshots;

create or replace function public.apply_living_tasting_map_command(
  p_event_id uuid,p_command text,p_expected_sequence bigint,p_lease_token uuid,p_client_command_id uuid,p_payload jsonb default '{}'::jsonb
) returns public.events
language plpgsql security definer set search_path=public as $$
declare
  event_row public.events;lease_row public.host_control_leases;map_row public.living_tasting_map_sessions;
  pause_ms bigint;seek_ms integer;configured_duration integer;configured_visibility text;configured_custom boolean;
begin
  select * into event_row from public.events where id=p_event_id for update;
  if event_row.id is null then raise exception 'event_not_found'; end if;
  if not public.can_manage_event(p_event_id,auth.uid()) then raise exception 'not_authorized'; end if;
  select * into lease_row from public.host_control_leases where event_id=p_event_id for update;
  if lease_row.event_id is null or lease_row.holder_user_id<>auth.uid() or lease_row.lease_token<>p_lease_token or lease_row.expires_at<=now() then raise exception 'lease_lost'; end if;
  if p_client_command_id is not null and event_row.last_conductor_command_id=p_client_command_id then return event_row; end if;
  if event_row.sequence_number<>p_expected_sequence then raise exception 'stale_sequence'; end if;
  if event_row.status<>'live' or event_row.phase='ended' then raise exception 'living_map_event_unavailable'; end if;
  if event_row.current_flight_item_id is null then raise exception 'flight_missing'; end if;

  insert into public.living_tasting_map_sessions(event_id,event_flight_item_id,created_by)
    values(p_event_id,event_row.current_flight_item_id,auth.uid()) on conflict(event_id,event_flight_item_id) do nothing;
  select * into map_row from public.living_tasting_map_sessions
    where event_id=p_event_id and event_flight_item_id=event_row.current_flight_item_id for update;

  if p_command='configure_living_map' then
    if map_row.status<>'ready' then raise exception 'living_map_already_started'; end if;
    configured_duration=coalesce((p_payload->>'durationSeconds')::integer,map_row.duration_seconds);
    configured_visibility=coalesce(nullif(p_payload->>'visibilityMode',''),map_row.visibility_mode);
    configured_custom=coalesce((p_payload->>'customNotesEnabled')::boolean,map_row.custom_notes_enabled);
    if configured_duration<60 or configured_duration>1800 then raise exception 'living_map_duration_invalid'; end if;
    if configured_visibility not in ('quiet_start','shared_live') then raise exception 'living_map_visibility_invalid'; end if;
    map_row.duration_seconds=configured_duration;map_row.visibility_mode=configured_visibility;map_row.custom_notes_enabled=configured_custom;
  elsif p_command='start_living_map' then
    if event_row.conductor_stage not in ('aroma','first_sip','explore','discuss') then raise exception 'living_map_stage_unavailable'; end if;
    if map_row.status<>'ready' then raise exception 'living_map_already_started'; end if;
    map_row.status='live';map_row.started_at=clock_timestamp();map_row.paused_at=null;map_row.accumulated_pause_ms=0;
  elsif p_command='pause_living_map' then
    if map_row.status<>'live' then raise exception 'living_map_not_live'; end if;
    map_row.status='paused';map_row.paused_at=clock_timestamp();
  elsif p_command='resume_living_map' then
    if map_row.status<>'paused' or map_row.paused_at is null then raise exception 'living_map_not_paused'; end if;
    pause_ms=greatest(0,extract(epoch from (clock_timestamp()-map_row.paused_at))*1000)::bigint;
    map_row.accumulated_pause_ms=map_row.accumulated_pause_ms+pause_ms;map_row.status='live';map_row.paused_at=null;
  elsif p_command='freeze_living_map' then
    if map_row.status not in ('live','paused') then raise exception 'living_map_not_live'; end if;
    if map_row.paused_at is not null then
      pause_ms=greatest(0,extract(epoch from (clock_timestamp()-map_row.paused_at))*1000)::bigint;
      map_row.accumulated_pause_ms=map_row.accumulated_pause_ms+pause_ms;
    end if;
    map_row.status='frozen';map_row.paused_at=null;map_row.frozen_at=clock_timestamp();map_row.replay_position_ms=0;
  elsif p_command='start_living_map_replay' then
    if map_row.status not in ('frozen','replaying') or not exists(select 1 from public.living_tasting_map_fingerprints where session_id=map_row.id) then raise exception 'living_map_fingerprint_unavailable'; end if;
    map_row.status='replaying';map_row.replay_started_at=clock_timestamp();map_row.replay_paused_at=null;map_row.replay_position_ms=0;
  elsif p_command='pause_living_map_replay' then
    if map_row.status<>'replaying' or map_row.replay_started_at is null or map_row.replay_paused_at is not null then raise exception 'living_map_replay_not_running'; end if;
    map_row.replay_position_ms=least(map_row.duration_seconds*1000,map_row.replay_position_ms+round(extract(epoch from (clock_timestamp()-map_row.replay_started_at))*1000*(map_row.duration_seconds::numeric/map_row.replay_duration_seconds))::integer);
    map_row.replay_paused_at=clock_timestamp();
  elsif p_command='resume_living_map_replay' then
    if map_row.status<>'replaying' or map_row.replay_paused_at is null then raise exception 'living_map_replay_not_paused'; end if;
    map_row.replay_started_at=clock_timestamp();map_row.replay_paused_at=null;
  elsif p_command='seek_living_map_replay' then
    if map_row.status<>'replaying' then raise exception 'living_map_replay_unavailable'; end if;
    seek_ms=coalesce((p_payload->>'replayPositionMs')::integer,-1);
    if seek_ms<0 or seek_ms>map_row.duration_seconds*1000 then raise exception 'living_map_seek_invalid'; end if;
    map_row.replay_position_ms=seek_ms;map_row.replay_started_at=clock_timestamp();
  elsif p_command='commit_living_map_fingerprint' then
    if map_row.status not in ('frozen','replaying') or not exists(select 1 from public.living_tasting_map_fingerprints where session_id=map_row.id) then raise exception 'living_map_fingerprint_unavailable'; end if;
    update public.living_tasting_map_fingerprints set committed_at=coalesce(committed_at,clock_timestamp()),updated_at=clock_timestamp() where session_id=map_row.id;
    map_row.status='committed';
  elsif p_command='reopen_living_map' then
    if map_row.status not in ('frozen','replaying') or exists(select 1 from public.living_tasting_map_fingerprints where session_id=map_row.id and committed_at is not null) then raise exception 'living_map_reopen_unavailable'; end if;
    delete from public.living_tasting_map_fingerprints where session_id=map_row.id;
    map_row.status='live';map_row.frozen_at=null;map_row.replay_started_at=null;map_row.replay_paused_at=null;map_row.replay_position_ms=0;
  else raise exception 'unknown_command'; end if;

  update public.living_tasting_map_sessions set status=map_row.status,duration_seconds=map_row.duration_seconds,
    visibility_mode=map_row.visibility_mode,custom_notes_enabled=map_row.custom_notes_enabled,started_at=map_row.started_at,
    paused_at=map_row.paused_at,accumulated_pause_ms=map_row.accumulated_pause_ms,frozen_at=map_row.frozen_at,
    replay_started_at=map_row.replay_started_at,replay_paused_at=map_row.replay_paused_at,replay_position_ms=map_row.replay_position_ms,
    version=version+1,updated_at=clock_timestamp() where id=map_row.id returning * into map_row;

  event_row.sequence_number=event_row.sequence_number+1;event_row.last_conductor_command_id=p_client_command_id;event_row.conductor_id=auth.uid();event_row.updated_at=clock_timestamp();
  update public.events set sequence_number=event_row.sequence_number,last_conductor_command_id=event_row.last_conductor_command_id,
    conductor_id=event_row.conductor_id,updated_at=event_row.updated_at where id=event_row.id returning * into event_row;
  insert into public.event_state_log(event_id,sequence_number,command,phase,actor_user_id,payload)
    values(event_row.id,event_row.sequence_number,p_command,event_row.phase,auth.uid(),jsonb_build_object('living_map_session_id',map_row.id,'living_map_status',map_row.status,'command_payload',p_payload));
  return event_row;
end $$;

revoke all on function public.apply_living_tasting_map_command(uuid,text,bigint,uuid,uuid,jsonb) from public,anon;
grant execute on function public.apply_living_tasting_map_command(uuid,text,bigint,uuid,uuid,jsonb) to authenticated;

comment on table public.living_tasting_map_observation_events is 'Immutable source of truth for participant aroma/taste additions, revisions, and removals.';
comment on table public.living_tasting_map_snapshots is 'Anonymous, versioned projections safe for the shared live map and Supabase Realtime.';
comment on table public.living_tasting_map_fingerprints is 'Frozen map, deterministic replay manifest, and neutral pattern statements kept distinct from raw events.';
