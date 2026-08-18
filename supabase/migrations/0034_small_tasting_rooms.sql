-- Small Tasting Rooms preserve Vintage Fork state while Agora changes media channels.
-- No spoken conversation is recorded, transcribed, scored, or summarized.

create table public.event_breakout_sessions(
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  event_flight_item_id uuid not null references public.event_flight_items(id) on delete cascade,
  origin_stage text not null,
  status text not null default 'preparing' check(status in ('preparing','active','returning','complete','cancelled')),
  room_size integer not null default 3 check(room_size between 2 and 4),
  assignment_mode text not null default 'shuffle' check(assignment_mode in ('shuffle','remix')),
  prompt text not null check(char_length(prompt) between 1 and 240),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  host_id uuid not null references public.profiles(id) on delete restrict,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(ends_at>starts_at)
);

create table public.event_breakout_rooms(
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.event_breakout_sessions(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  room_number integer not null check(room_number between 1 and 200),
  prompt text not null check(char_length(prompt) between 1 and 240),
  status text not null default 'open' check(status in ('open','returning','closed')),
  snapshot text check(snapshot is null or char_length(snapshot)<=500),
  snapshot_submitted_by uuid references public.participants(id) on delete set null,
  snapshot_submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(session_id,room_number)
);

create table public.event_breakout_members(
  session_id uuid not null references public.event_breakout_sessions(id) on delete cascade,
  breakout_room_id uuid not null references public.event_breakout_rooms(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  status text not null default 'assigned' check(status in ('assigned','joining','connected','left','returned','failed','stayed_main')),
  assigned_at timestamptz not null default now(),
  joined_at timestamptz,
  returned_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key(session_id,participant_id)
);

create table public.event_breakout_signals(
  session_id uuid not null references public.event_breakout_sessions(id) on delete cascade,
  breakout_room_id uuid not null references public.event_breakout_rooms(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  signal text not null check(signal in ('help','more_time','ready')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(session_id,participant_id)
);

create table public.tea_response_revisions(
  id bigint generated always as identity primary key,
  participant_id uuid not null references public.participants(id) on delete cascade,
  event_flight_item_id uuid not null references public.event_flight_items(id) on delete cascade,
  breakout_room_id uuid references public.event_breakout_rooms(id) on delete set null,
  source text not null check(source in ('private','breakout','main_room')),
  observation jsonb not null,
  created_at timestamptz not null default now()
);

create index breakout_sessions_event_created_idx on public.event_breakout_sessions(event_id,created_at desc);
create index breakout_members_room_idx on public.event_breakout_members(breakout_room_id,status);
create index breakout_signals_room_idx on public.event_breakout_signals(breakout_room_id,signal);
create index response_revisions_timeline_idx on public.tea_response_revisions(participant_id,event_flight_item_id,created_at);

alter table public.events add column current_breakout_session_id uuid references public.event_breakout_sessions(id) on delete set null;
alter table public.event_public_state add column current_breakout_session_id uuid;
alter table public.event_chat_messages add column breakout_room_id uuid references public.event_breakout_rooms(id) on delete set null;
alter table public.event_reactions add column breakout_room_id uuid references public.event_breakout_rooms(id) on delete set null;

create index event_chat_messages_breakout_created_idx on public.event_chat_messages(event_id,breakout_room_id,created_at desc);
create index event_reactions_breakout_created_idx on public.event_reactions(event_id,breakout_room_id,created_at desc);

alter table public.event_breakout_sessions enable row level security;
alter table public.event_breakout_rooms enable row level security;
alter table public.event_breakout_members enable row level security;
alter table public.event_breakout_signals enable row level security;
alter table public.tea_response_revisions enable row level security;

create policy breakout_sessions_staff_read on public.event_breakout_sessions for select to authenticated
  using(public.can_manage_event(event_id,auth.uid()));
create policy breakout_rooms_staff_read on public.event_breakout_rooms for select to authenticated
  using(public.can_manage_event(event_id,auth.uid()));
create policy breakout_members_staff_read on public.event_breakout_members for select to authenticated
  using(exists(select 1 from public.event_breakout_sessions breakout_session where breakout_session.id=event_breakout_members.session_id and public.can_manage_event(breakout_session.event_id,auth.uid())));
create policy breakout_signals_staff_read on public.event_breakout_signals for select to authenticated
  using(exists(select 1 from public.event_breakout_sessions breakout_session where breakout_session.id=event_breakout_signals.session_id and public.can_manage_event(breakout_session.event_id,auth.uid())));
create policy response_revisions_owner_read on public.tea_response_revisions for select to authenticated
  using(exists(select 1 from public.participants participant where participant.id=tea_response_revisions.participant_id and participant.user_id=auth.uid()));

revoke all on public.event_breakout_sessions,public.event_breakout_rooms,public.event_breakout_members,public.event_breakout_signals,public.tea_response_revisions from anon,authenticated;
grant select on public.event_breakout_sessions,public.event_breakout_rooms,public.event_breakout_members,public.event_breakout_signals,public.tea_response_revisions to authenticated;
grant select(breakout_room_id) on public.event_chat_messages to authenticated;
grant select(breakout_room_id) on public.event_reactions to authenticated;

drop policy if exists chat_messages_member_read on public.event_chat_messages;
create policy chat_messages_member_read on public.event_chat_messages for select to authenticated using(
  public.can_access_event_communication(event_id,auth.uid()) and (
    breakout_room_id is null or (ask_host and public.can_manage_event(event_id,auth.uid())) or exists(
      select 1 from public.event_breakout_members breakout_member
      join public.participants participant on participant.id=breakout_member.participant_id
      where breakout_member.breakout_room_id=event_chat_messages.breakout_room_id and participant.user_id=auth.uid()
    )
  )
);
drop policy if exists event_reactions_member_read on public.event_reactions;
create policy event_reactions_member_read on public.event_reactions for select to authenticated using(
  public.can_access_event_communication(event_id,auth.uid()) and (
    breakout_room_id is null or exists(
      select 1 from public.event_breakout_members breakout_member
      join public.participants participant on participant.id=breakout_member.participant_id
      where breakout_member.breakout_room_id=event_reactions.breakout_room_id and participant.user_id=auth.uid()
    )
  )
);

create or replace function public.sync_event_public_state() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  insert into public.event_public_state(
    event_id,status,phase,sequence_number,current_flight_item_id,reveal_at,timer_ends_at,trivia_closes_at,
    conductor_stage,conductor_stage_started_at,conductor_stage_duration_seconds,conductor_paused_at,
    conductor_remaining_seconds,conductor_sequence_version,current_brew_id,current_breakout_session_id,updated_at
  ) values(
    new.id,new.status,new.phase,new.sequence_number,new.current_flight_item_id,new.reveal_at,new.timer_ends_at,new.trivia_closes_at,
    new.conductor_stage,new.conductor_stage_started_at,new.conductor_stage_duration_seconds,new.conductor_paused_at,
    new.conductor_remaining_seconds,new.conductor_sequence_version,new.current_brew_id,new.current_breakout_session_id,new.updated_at
  )
  on conflict(event_id) do update set
    status=excluded.status,phase=excluded.phase,sequence_number=excluded.sequence_number,
    current_flight_item_id=excluded.current_flight_item_id,reveal_at=excluded.reveal_at,
    timer_ends_at=excluded.timer_ends_at,trivia_closes_at=excluded.trivia_closes_at,
    conductor_stage=excluded.conductor_stage,conductor_stage_started_at=excluded.conductor_stage_started_at,
    conductor_stage_duration_seconds=excluded.conductor_stage_duration_seconds,conductor_paused_at=excluded.conductor_paused_at,
    conductor_remaining_seconds=excluded.conductor_remaining_seconds,conductor_sequence_version=excluded.conductor_sequence_version,
    current_brew_id=excluded.current_brew_id,current_breakout_session_id=excluded.current_breakout_session_id,updated_at=excluded.updated_at;
  return new;
end $$;

drop trigger if exists events_public_state_sync on public.events;
create trigger events_public_state_sync after insert or update of
  status,phase,sequence_number,current_flight_item_id,reveal_at,timer_ends_at,trivia_closes_at,
  conductor_stage,conductor_stage_started_at,conductor_stage_duration_seconds,conductor_paused_at,
  conductor_remaining_seconds,conductor_sequence_version,current_brew_id,current_breakout_session_id on public.events
for each row execute function public.sync_event_public_state();

create or replace function public.apply_breakout_command(
  p_event_id uuid,p_command text,p_expected_sequence bigint,p_lease_token uuid,p_client_command_id uuid,p_payload jsonb default '{}'::jsonb
) returns public.events
language plpgsql security definer set search_path=public as $$
declare
  event_row public.events;lease_row public.host_control_leases;session_row public.event_breakout_sessions;
  room_json jsonb;member_json jsonb;room_row public.event_breakout_rooms;new_session_id uuid;
  room_number integer:=0;duration_seconds integer;extend_seconds integer;assigned_count integer:=0;
  prompt_text text;mode_text text;target_size integer;session_start timestamptz;
begin
  select * into event_row from public.events where id=p_event_id for update;
  if event_row.id is null then raise exception 'event_not_found'; end if;
  if not public.can_manage_event(p_event_id,auth.uid()) then raise exception 'not_authorized'; end if;
  select * into lease_row from public.host_control_leases where event_id=p_event_id for update;
  if lease_row.event_id is null or lease_row.holder_user_id<>auth.uid() or lease_row.lease_token<>p_lease_token or lease_row.expires_at<=now() then raise exception 'lease_lost'; end if;
  if p_client_command_id is not null and event_row.last_conductor_command_id=p_client_command_id then return event_row; end if;
  if event_row.sequence_number<>p_expected_sequence then raise exception 'stale_sequence'; end if;
  if event_row.phase='ended' or event_row.status<>'live' then raise exception 'event_not_live'; end if;

  if event_row.current_breakout_session_id is not null then
    select * into session_row from public.event_breakout_sessions where id=event_row.current_breakout_session_id for update;
  end if;

  if p_command='launch_breakouts' then
    if event_row.location_mode<>'remote' then raise exception 'breakout_video_required'; end if;
    if event_row.conductor_stage not in ('first_sip','explore','discuss') then raise exception 'breakout_stage_unavailable'; end if;
    if session_row.id is not null and session_row.status in ('preparing','active','returning') then raise exception 'breakout_already_active'; end if;
    duration_seconds=coalesce((p_payload->>'durationSeconds')::integer,300);
    target_size=coalesce((p_payload->>'roomSize')::integer,3);
    mode_text=coalesce(nullif(p_payload->>'assignmentMode',''),'shuffle');
    prompt_text=coalesce(nullif(btrim(p_payload->>'prompt'),''),'What was the first thing you noticed?');
    if duration_seconds<120 or duration_seconds>600 then raise exception 'invalid_breakout_duration'; end if;
    if target_size<2 or target_size>4 then raise exception 'invalid_breakout_size'; end if;
    if mode_text not in ('shuffle','remix') then raise exception 'invalid_breakout_mode'; end if;
    if char_length(prompt_text)>240 then raise exception 'invalid_breakout_prompt'; end if;
    if jsonb_typeof(p_payload->'assignments')<>'array' or jsonb_array_length(p_payload->'assignments')=0 then raise exception 'breakout_assignments_missing'; end if;
    session_start=now()+interval '7 seconds';
    insert into public.event_breakout_sessions(event_id,event_flight_item_id,origin_stage,status,room_size,assignment_mode,prompt,starts_at,ends_at,host_id)
      values(p_event_id,event_row.current_flight_item_id,event_row.conductor_stage,'active',target_size,mode_text,prompt_text,session_start,session_start+make_interval(secs=>duration_seconds),auth.uid())
      returning id into new_session_id;
    for room_json in select value from jsonb_array_elements(p_payload->'assignments') loop
      room_number=room_number+1;
      if jsonb_typeof(room_json)<>'array' or jsonb_array_length(room_json)<2 or jsonb_array_length(room_json)>4 then raise exception 'invalid_breakout_assignment'; end if;
      insert into public.event_breakout_rooms(session_id,event_id,room_number,prompt)
        values(new_session_id,p_event_id,room_number,prompt_text) returning * into room_row;
      for member_json in select value from jsonb_array_elements(room_json) loop
        insert into public.event_breakout_members(session_id,breakout_room_id,participant_id)
          select new_session_id,room_row.id,participant.id from public.participants participant
          where participant.id=(member_json#>>'{}')::uuid and participant.event_id=p_event_id and participant.status not in ('left','removed');
        if not found then raise exception 'invalid_breakout_participant'; end if;
        assigned_count=assigned_count+1;
      end loop;
    end loop;
    if assigned_count<2 then raise exception 'breakout_assignments_missing'; end if;
    event_row.current_breakout_session_id=new_session_id;

  elsif p_command='extend_breakouts' then
    if session_row.id is null or session_row.status<>'active' then raise exception 'breakout_not_active'; end if;
    extend_seconds=coalesce((p_payload->>'seconds')::integer,60);
    if extend_seconds not in (60,120) then raise exception 'invalid_breakout_extension'; end if;
    update public.event_breakout_sessions set ends_at=ends_at+make_interval(secs=>extend_seconds),updated_at=now() where id=session_row.id;

  elsif p_command='end_breakouts' then
    if session_row.id is null or session_row.status not in ('preparing','active') then raise exception 'breakout_not_active'; end if;
    update public.event_breakout_sessions set status='returning',ends_at=now(),updated_at=now() where id=session_row.id;
    update public.event_breakout_rooms set status='returning',updated_at=now() where session_id=session_row.id;
  else raise exception 'unknown_command';
  end if;

  event_row.sequence_number=event_row.sequence_number+1;event_row.conductor_id=auth.uid();
  event_row.last_conductor_command_id=p_client_command_id;event_row.updated_at=now();
  update public.events set sequence_number=event_row.sequence_number,current_breakout_session_id=event_row.current_breakout_session_id,
    conductor_id=event_row.conductor_id,last_conductor_command_id=event_row.last_conductor_command_id,updated_at=event_row.updated_at
    where id=event_row.id returning * into event_row;
  insert into public.event_state_log(event_id,sequence_number,command,phase,actor_user_id,payload)
    values(event_row.id,event_row.sequence_number,p_command,event_row.phase,auth.uid(),jsonb_build_object(
      'breakout_session_id',event_row.current_breakout_session_id,'client_command_id',p_client_command_id,'command_payload',p_payload-'assignments'
    ));
  return event_row;
end $$;

revoke all on function public.apply_breakout_command(uuid,text,bigint,uuid,uuid,jsonb) from public,anon;
grant execute on function public.apply_breakout_command(uuid,text,bigint,uuid,uuid,jsonb) to authenticated;

create or replace function public.event_breakout_metrics(p_event_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare event_row public.events;session_row public.event_breakout_sessions;rooms jsonb;all_returned boolean;
begin
  if not public.can_manage_event(p_event_id,auth.uid()) then raise exception 'not_authorized'; end if;
  select * into event_row from public.events where id=p_event_id;
  if event_row.current_breakout_session_id is null then return '{"active":false,"rooms":[]}'::jsonb; end if;
  select * into session_row from public.event_breakout_sessions where id=event_row.current_breakout_session_id for update;
  if session_row.status='active' and session_row.ends_at<=now() then
    update public.event_breakout_sessions set status='returning',updated_at=now() where id=session_row.id returning * into session_row;
    update public.event_breakout_rooms set status='returning',updated_at=now() where session_id=session_row.id;
  end if;
  select not exists(select 1 from public.event_breakout_members where session_id=session_row.id and status not in ('returned','failed','stayed_main')) into all_returned;
  if session_row.status='returning' and (all_returned or session_row.ends_at<now()-interval '30 seconds') then
    update public.event_breakout_sessions set status='complete',completed_at=now(),updated_at=now() where id=session_row.id returning * into session_row;
    update public.event_breakout_rooms set status='closed',updated_at=now() where session_id=session_row.id;
    update public.events set current_breakout_session_id=null,updated_at=now() where id=p_event_id;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',room.id,'roomNumber',room.room_number,'status',room.status,'snapshotExists',room.snapshot is not null,
    'snapshot',case when session_row.status in ('returning','complete') then room.snapshot else null end,
    'participants',(select coalesce(jsonb_agg(jsonb_build_object('id',participant.id,'displayName',participant.display_name,'status',member.status) order by participant.display_name),'[]'::jsonb)
      from public.event_breakout_members member join public.participants participant on participant.id=member.participant_id where member.breakout_room_id=room.id),
    'help',(select count(*) from public.event_breakout_signals signal where signal.breakout_room_id=room.id and signal.signal='help'),
    'moreTime',(select count(*) from public.event_breakout_signals signal where signal.breakout_room_id=room.id and signal.signal='more_time'),
    'ready',(select count(*) from public.event_breakout_signals signal where signal.breakout_room_id=room.id and signal.signal='ready')
  ) order by room.room_number),'[]'::jsonb) into rooms from public.event_breakout_rooms room where room.session_id=session_row.id;
  return jsonb_build_object('active',session_row.status<>'complete','session',jsonb_build_object(
    'id',session_row.id,'status',session_row.status,'startsAt',session_row.starts_at,'endsAt',session_row.ends_at,
    'roomSize',session_row.room_size,'assignmentMode',session_row.assignment_mode,'prompt',session_row.prompt
  ),'rooms',rooms);
end $$;

revoke all on function public.event_breakout_metrics(uuid) from public,anon;
grant execute on function public.event_breakout_metrics(uuid) to authenticated;

create or replace function public.guard_active_breakout_transition() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if old.current_breakout_session_id is not null
    and new.current_breakout_session_id=old.current_breakout_session_id
    and exists(select 1 from public.event_breakout_sessions breakout_session where breakout_session.id=old.current_breakout_session_id and breakout_session.status in ('preparing','active','returning'))
    and (new.conductor_stage is distinct from old.conductor_stage
      or new.current_flight_item_id is distinct from old.current_flight_item_id
      or new.phase is distinct from old.phase
      or new.status is distinct from old.status)
  then raise exception 'breakout_active';
  end if;
  return new;
end $$;

create trigger events_guard_active_breakout_transition before update on public.events
for each row execute function public.guard_active_breakout_transition();

create or replace function public.scrub_deleted_participant_live_content() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  delete from public.event_reactions where participant_id=old.id;
  delete from public.event_chat_messages where participant_id=old.id;
  update public.event_breakout_rooms set snapshot=null,snapshot_submitted_by=null,snapshot_submitted_at=null,updated_at=now()
    where snapshot_submitted_by=old.id;
  return old;
end $$;

create trigger participants_scrub_live_content before delete on public.participants
for each row execute function public.scrub_deleted_participant_live_content();

comment on table public.event_breakout_sessions is 'Authoritative timed small-table sessions; no audio or transcript is captured.';
comment on table public.tea_response_revisions is 'Participant-authored observation timeline. breakout_room_id marks when an observation emerged, never what others said.';
