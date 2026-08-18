-- Virtual Tea Cheers is an authoritative micro-moment layered over the conductor.
-- Agora continues to carry video and audio; Cheers timing and participation never use the media channel.

create table public.event_cheers_sessions(
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  event_flight_item_id uuid references public.event_flight_items(id) on delete set null,
  context text not null check(context in ('first_sip','welcome_back','final','spontaneous')),
  invitation text not null check(char_length(invitation) between 1 and 120),
  opened_at timestamptz not null,
  closes_at timestamptz not null,
  resolve_at timestamptz not null,
  window_seconds integer not null check(window_seconds in (5,8,10)),
  status text not null default 'open' check(status in ('open','resolving','complete','cancelled')),
  sound_enabled boolean not null default true,
  triggered_by uuid not null references public.profiles(id) on delete restrict,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(closes_at>opened_at and resolve_at>=closes_at)
);

create table public.event_cheers_participations(
  cheers_id uuid not null references public.event_cheers_sessions(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  client_id uuid not null,
  tapped_at timestamptz not null default now(),
  tap_delay_ms integer not null default 0 check(tap_delay_ms>=0),
  primary key(cheers_id,participant_id),
  unique(cheers_id,client_id)
);

create index cheers_sessions_event_opened_idx on public.event_cheers_sessions(event_id,opened_at desc);
create index cheers_participations_timing_idx on public.event_cheers_participations(cheers_id,tapped_at);

alter table public.event_cheers_sessions enable row level security;
alter table public.event_cheers_participations enable row level security;

-- Session and participation rows are service/RPC only. Hosts receive an aggregate count; no identity list is exposed.
revoke all on public.event_cheers_sessions,public.event_cheers_participations from anon,authenticated;

create or replace function public.apply_cheers_command(
  p_event_id uuid,p_command text,p_expected_sequence bigint,p_lease_token uuid,p_client_command_id uuid,p_payload jsonb default '{}'::jsonb
) returns public.events
language plpgsql security definer set search_path=public as $$
declare
  event_row public.events;lease_row public.host_control_leases;cheers_row public.event_cheers_sessions;
  window_seconds integer;context_value text;invitation_value text;sound_value boolean;opened_at_value timestamptz;
begin
  select * into event_row from public.events where id=p_event_id for update;
  if event_row.id is null then raise exception 'event_not_found'; end if;
  if not public.can_manage_event(p_event_id,auth.uid()) then raise exception 'not_authorized'; end if;
  select * into lease_row from public.host_control_leases where event_id=p_event_id for update;
  if lease_row.event_id is null or lease_row.holder_user_id<>auth.uid() or lease_row.lease_token<>p_lease_token or lease_row.expires_at<=now() then raise exception 'lease_lost'; end if;
  if p_client_command_id is not null and event_row.last_conductor_command_id=p_client_command_id then return event_row; end if;
  if event_row.sequence_number<>p_expected_sequence then raise exception 'stale_sequence'; end if;
  if event_row.phase='ended' or event_row.status<>'live' then raise exception 'event_not_live'; end if;

  update public.event_cheers_sessions set status='complete',completed_at=coalesce(completed_at,now()),updated_at=now()
    where event_id=p_event_id and status in ('open','resolving') and resolve_at<=now()-interval '1650 milliseconds';
  select * into cheers_row from public.event_cheers_sessions where event_id=p_event_id and status in ('open','resolving') order by opened_at desc limit 1 for update;

  if p_command='open_cheers' then
    if cheers_row.id is not null then raise exception 'cheers_already_open'; end if;
    window_seconds=coalesce((p_payload->>'cheersWindowSeconds')::integer,8);
    if window_seconds not in (5,8,10) then raise exception 'invalid_cheers_window'; end if;
    context_value=coalesce(nullif(p_payload->>'cheersContext',''),'spontaneous');
    if context_value not in ('first_sip','welcome_back','final','spontaneous') then raise exception 'invalid_cheers_context'; end if;
    invitation_value=case context_value
      when 'first_sip' then 'Raise your cup.'
      when 'welcome_back' then 'Welcome back. Raise your cup.'
      when 'final' then 'To what we discovered together.'
      else 'Cheers.' end;
    sound_value=coalesce((p_payload->>'cheersSoundEnabled')::boolean,true);
    opened_at_value=now()+interval '350 milliseconds';
    insert into public.event_cheers_sessions(event_id,event_flight_item_id,context,invitation,opened_at,closes_at,resolve_at,window_seconds,sound_enabled,triggered_by)
      values(p_event_id,event_row.current_flight_item_id,context_value,invitation_value,opened_at_value,opened_at_value+make_interval(secs=>window_seconds),opened_at_value+make_interval(secs=>window_seconds)+interval '650 milliseconds',window_seconds,sound_value,auth.uid());
  elsif p_command='resolve_cheers' then
    if cheers_row.id is null then raise exception 'cheers_not_open'; end if;
    update public.event_cheers_sessions set status='resolving',closes_at=now(),resolve_at=now()+interval '650 milliseconds',updated_at=now() where id=cheers_row.id;
  elsif p_command='cancel_cheers' then
    if cheers_row.id is null then raise exception 'cheers_not_open'; end if;
    update public.event_cheers_sessions set status='cancelled',completed_at=now(),updated_at=now() where id=cheers_row.id;
  else raise exception 'unknown_command';
  end if;

  event_row.sequence_number=event_row.sequence_number+1;
  event_row.conductor_id=auth.uid();event_row.last_conductor_command_id=p_client_command_id;event_row.updated_at=now();
  update public.events set sequence_number=event_row.sequence_number,conductor_id=event_row.conductor_id,
    last_conductor_command_id=event_row.last_conductor_command_id,updated_at=event_row.updated_at where id=event_row.id returning * into event_row;
  insert into public.event_state_log(event_id,sequence_number,command,phase,actor_user_id,payload)
    values(event_row.id,event_row.sequence_number,p_command,event_row.phase,auth.uid(),jsonb_build_object(
      'client_command_id',p_client_command_id,'cheers_context',p_payload->>'cheersContext','cheers_window_seconds',p_payload->>'cheersWindowSeconds'
    ));
  return event_row;
end $$;

revoke all on function public.apply_cheers_command(uuid,text,bigint,uuid,uuid,jsonb) from public,anon;
grant execute on function public.apply_cheers_command(uuid,text,bigint,uuid,uuid,jsonb) to authenticated;

comment on table public.event_cheers_sessions is 'Authoritative shared-cup micro-moments. Timestamps resolve without holding the conductor or Agora media.';
comment on table public.event_cheers_participations is 'Deduplicated one-tap Cheers participation. Identity is never exposed in participant-facing state.';
