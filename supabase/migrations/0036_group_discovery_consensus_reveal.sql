-- Group Discovery Reveal turns private structured observations into an anonymous room portrait.
-- Agora remains media transport. Reveal authority, idempotency, and recovery live in database state.

alter table public.tea_responses
  add column aroma_descriptors text[] not null default '{}',
  add column aroma_intensity text check(aroma_intensity is null or aroma_intensity in ('subtle','clear','dominant'));

create table public.event_group_reveals(
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  event_flight_item_id uuid not null references public.event_flight_items(id) on delete cascade,
  reveal_state text not null default 'hidden' check(reveal_state in ('hidden','aroma','taste','combined','timeline','fingerprint')),
  revealed_at timestamptz,
  highlighted_flavor text check(highlighted_flavor is null or char_length(highlighted_flavor)<=100),
  timeline_index integer check(timeline_index is null or timeline_index>=0),
  producer_notes_visible boolean not null default false,
  room_card_ids uuid[] not null default '{}',
  aroma_aggregate jsonb,
  taste_aggregate jsonb,
  timeline_events jsonb not null default '[]'::jsonb,
  post_reveal_entries jsonb not null default '[]'::jsonb,
  fingerprint jsonb,
  fingerprint_version integer not null default 0 check(fingerprint_version>=0),
  frozen_at timestamptz,
  host_annotations jsonb not null default '[]'::jsonb,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(event_id,event_flight_item_id)
);

create index event_group_reveals_event_tea_idx on public.event_group_reveals(event_id,event_flight_item_id);

alter table public.event_group_reveals enable row level security;
create policy event_group_reveals_staff_read on public.event_group_reveals for select to authenticated
  using(public.can_manage_event(event_id,auth.uid()));
revoke all on public.event_group_reveals from anon,authenticated;
grant select on public.event_group_reveals to authenticated;

create or replace function public.apply_group_reveal_command(
  p_event_id uuid,p_command text,p_expected_sequence bigint,p_lease_token uuid,p_client_command_id uuid,p_payload jsonb default '{}'::jsonb
) returns public.events
language plpgsql security definer set search_path=public as $$
declare
  event_row public.events;lease_row public.host_control_leases;reveal_row public.event_group_reveals;
  flavor_key text;timeline_position integer;fingerprint_payload jsonb;
begin
  select * into event_row from public.events where id=p_event_id for update;
  if event_row.id is null then raise exception 'event_not_found'; end if;
  if not public.can_manage_event(p_event_id,auth.uid()) then raise exception 'not_authorized'; end if;
  select * into lease_row from public.host_control_leases where event_id=p_event_id for update;
  if lease_row.event_id is null or lease_row.holder_user_id<>auth.uid() or lease_row.lease_token<>p_lease_token or lease_row.expires_at<=now() then raise exception 'lease_lost'; end if;
  if p_client_command_id is not null and event_row.last_conductor_command_id=p_client_command_id then return event_row; end if;
  if event_row.sequence_number<>p_expected_sequence then raise exception 'stale_sequence'; end if;
  if event_row.phase='ended' or event_row.status<>'live' then raise exception 'event_not_live'; end if;
  if event_row.current_flight_item_id is null then raise exception 'flight_missing'; end if;
  if event_row.conductor_stage<>'reveal' and p_command<>'return_group_discussion' then raise exception 'group_reveal_stage_unavailable'; end if;

  insert into public.event_group_reveals(event_id,event_flight_item_id,updated_by)
    values(p_event_id,event_row.current_flight_item_id,auth.uid())
    on conflict(event_id,event_flight_item_id) do nothing;
  select * into reveal_row from public.event_group_reveals
    where event_id=p_event_id and event_flight_item_id=event_row.current_flight_item_id for update;

  if p_command='reveal_group_aroma' then
    reveal_row.reveal_state='aroma';
    reveal_row.revealed_at=coalesce(reveal_row.revealed_at,now());
  elsif p_command='reveal_group_taste' then
    reveal_row.reveal_state='taste';
    reveal_row.revealed_at=coalesce(reveal_row.revealed_at,now());
  elsif p_command='combine_group_reveal' then
    if reveal_row.revealed_at is null then raise exception 'group_reveal_not_started'; end if;
    reveal_row.reveal_state='combined';
  elsif p_command='show_group_timeline' then
    if reveal_row.revealed_at is null then raise exception 'group_reveal_not_started'; end if;
    reveal_row.reveal_state='timeline';
    reveal_row.timeline_index=coalesce((p_payload->>'timelineIndex')::integer,0);
  elsif p_command='set_group_timeline' then
    if reveal_row.reveal_state<>'timeline' then raise exception 'group_timeline_unavailable'; end if;
    timeline_position=coalesce((p_payload->>'timelineIndex')::integer,-1);
    if timeline_position<0 then raise exception 'group_timeline_unavailable'; end if;
    reveal_row.timeline_index=timeline_position;
  elsif p_command='highlight_group_flavor' then
    if reveal_row.revealed_at is null then raise exception 'group_reveal_not_started'; end if;
    flavor_key=nullif(btrim(p_payload->>'flavorKey'),'');
    if flavor_key is null or char_length(flavor_key)>100 then raise exception 'group_flavor_unavailable'; end if;
    reveal_row.highlighted_flavor=flavor_key;
  elsif p_command='clear_group_flavor' then
    reveal_row.highlighted_flavor=null;
  elsif p_command='show_group_producer_notes' then
    if reveal_row.reveal_state not in ('combined','timeline','fingerprint') then raise exception 'producer_notes_too_early'; end if;
    reveal_row.producer_notes_visible=true;
  elsif p_command='hide_group_producer_notes' then
    reveal_row.producer_notes_visible=false;
  elsif p_command='freeze_group_fingerprint' then
    if reveal_row.reveal_state not in ('combined','timeline','fingerprint') then raise exception 'group_fingerprint_too_early'; end if;
    fingerprint_payload=p_payload->'fingerprint';
    if fingerprint_payload is null or jsonb_typeof(fingerprint_payload)<>'object' then raise exception 'group_fingerprint_missing'; end if;
    reveal_row.reveal_state='fingerprint';
    reveal_row.fingerprint=fingerprint_payload;
    reveal_row.fingerprint_version=reveal_row.fingerprint_version+1;
    reveal_row.frozen_at=now();
    reveal_row.aroma_aggregate=fingerprint_payload->'aroma';
    reveal_row.taste_aggregate=fingerprint_payload->'taste';
    reveal_row.timeline_events=coalesce(fingerprint_payload->'timeline','[]'::jsonb);
  elsif p_command='return_group_discussion' then
    if event_row.conductor_stage<>'reveal' then raise exception 'group_reveal_stage_unavailable'; end if;
    event_row.conductor_stage='discuss';
    event_row.conductor_stage_started_at=now();
    event_row.conductor_sequence_version=event_row.conductor_sequence_version+1;
  else raise exception 'unknown_command';
  end if;

  select coalesce(array_agg(card.id order by card.created_at),'{}'::uuid[]) into reveal_row.room_card_ids
    from public.room_discovery_cards card
    where card.event_id=p_event_id and card.event_flight_item_id=event_row.current_flight_item_id;
  update public.event_group_reveals set
    reveal_state=reveal_row.reveal_state,revealed_at=reveal_row.revealed_at,
    highlighted_flavor=reveal_row.highlighted_flavor,timeline_index=reveal_row.timeline_index,
    producer_notes_visible=reveal_row.producer_notes_visible,room_card_ids=reveal_row.room_card_ids,
    aroma_aggregate=reveal_row.aroma_aggregate,taste_aggregate=reveal_row.taste_aggregate,
    timeline_events=reveal_row.timeline_events,post_reveal_entries=reveal_row.post_reveal_entries,
    fingerprint=reveal_row.fingerprint,fingerprint_version=reveal_row.fingerprint_version,
    frozen_at=reveal_row.frozen_at,updated_by=auth.uid(),updated_at=now()
    where id=reveal_row.id;

  event_row.sequence_number=event_row.sequence_number+1;
  event_row.conductor_id=auth.uid();
  event_row.last_conductor_command_id=p_client_command_id;
  event_row.updated_at=now();
  update public.events set sequence_number=event_row.sequence_number,conductor_stage=event_row.conductor_stage,
    conductor_stage_started_at=event_row.conductor_stage_started_at,conductor_sequence_version=event_row.conductor_sequence_version,
    conductor_id=event_row.conductor_id,last_conductor_command_id=event_row.last_conductor_command_id,updated_at=event_row.updated_at
    where id=event_row.id returning * into event_row;
  insert into public.event_state_log(event_id,sequence_number,command,phase,actor_user_id,payload)
    values(event_row.id,event_row.sequence_number,p_command,event_row.phase,auth.uid(),jsonb_build_object(
      'group_reveal_state',reveal_row.reveal_state,'group_reveal_id',reveal_row.id,'client_command_id',p_client_command_id,
      'command_payload',p_payload-'fingerprint'
    ));
  return event_row;
end $$;

revoke all on function public.apply_group_reveal_command(uuid,text,bigint,uuid,uuid,jsonb) from public,anon;
grant execute on function public.apply_group_reveal_command(uuid,text,bigint,uuid,uuid,jsonb) to authenticated;

comment on table public.event_group_reveals is
  'Authoritative, recoverable presentation state for anonymous aroma/taste consensus reveals and frozen event fingerprints.';
comment on column public.event_group_reveals.host_annotations is
  'Host-authored context kept separate from participant aggregates and never treated as a score or correct answer.';
