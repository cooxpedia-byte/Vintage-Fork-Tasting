-- Room Discovery Cards carry structured, privacy-safe table discoveries back to the main room.
-- They never ingest private notes, table chat, audio, or transcripts.

create table public.room_discovery_cards(
  id uuid primary key default gen_random_uuid(),
  breakout_room_id uuid not null unique references public.event_breakout_rooms(id) on delete cascade,
  session_id uuid not null references public.event_breakout_sessions(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  event_flight_item_id uuid not null references public.event_flight_items(id) on delete cascade,
  participant_ids uuid[] not null default '{}'::uuid[],
  curiosity text check(curiosity is null or char_length(curiosity)<=240),
  room_quote text check(room_quote is null or char_length(room_quote)<=240),
  room_quote_attributed boolean not null default false,
  room_quote_participant_id uuid references public.participants(id) on delete set null,
  spokesperson_participant_id uuid references public.participants(id) on delete set null,
  spokesperson_state text not null default 'none' check(spokesperson_state in ('none','volunteered','invited','accepted','passed','shared')),
  source_version bigint not null default 0,
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check((room_quote_attributed and room_quote_participant_id is not null) or not room_quote_attributed)
);

create table public.room_discovery_card_items(
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.room_discovery_cards(id) on delete cascade,
  category text not null check(category in ('shared','unique','changed','contrasting')),
  item_text text not null check(char_length(btrim(item_text)) between 1 and 120),
  normalized_key text not null check(char_length(normalized_key) between 1 and 120),
  source text not null check(source in ('structured','participant')),
  prevalence_count integer check(prevalence_count is null or prevalence_count>0),
  prevalence_total integer not null check(prevalence_total>=0),
  attribution_participant_id uuid references public.participants(id) on delete set null,
  created_by uuid references public.participants(id) on delete set null,
  removed_by uuid references public.participants(id) on delete set null,
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(card_id,category,normalized_key),
  check(prevalence_count is null or (prevalence_total>0 and prevalence_count<=prevalence_total))
);

create table public.event_discovery_presentations(
  breakout_session_id uuid primary key references public.event_breakout_sessions(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  open_card_ids uuid[] not null default '{}'::uuid[],
  surfaced_curiosity_card_id uuid references public.room_discovery_cards(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  check(cardinality(open_card_ids)<=2)
);

create index room_discovery_cards_event_tea_idx on public.room_discovery_cards(event_id,event_flight_item_id,created_at desc);
create index room_discovery_card_items_card_idx on public.room_discovery_card_items(card_id,category) where removed_at is null;

alter table public.room_discovery_cards enable row level security;
alter table public.room_discovery_card_items enable row level security;
alter table public.event_discovery_presentations enable row level security;

create policy room_discovery_cards_staff_read on public.room_discovery_cards for select to authenticated
  using(public.can_manage_event(event_id,auth.uid()));
create policy room_discovery_items_staff_read on public.room_discovery_card_items for select to authenticated
  using(exists(select 1 from public.room_discovery_cards card where card.id=room_discovery_card_items.card_id and public.can_manage_event(card.event_id,auth.uid())));
create policy discovery_presentations_staff_read on public.event_discovery_presentations for select to authenticated
  using(public.can_manage_event(event_id,auth.uid()));

revoke all on public.room_discovery_cards,public.room_discovery_card_items,public.event_discovery_presentations from anon,authenticated;
grant select on public.room_discovery_cards,public.room_discovery_card_items,public.event_discovery_presentations to authenticated;

create or replace function public.create_room_discovery_card() returns trigger
language plpgsql security definer set search_path=public as $$
declare session_row public.event_breakout_sessions;
begin
  select * into session_row from public.event_breakout_sessions where id=new.session_id;
  insert into public.room_discovery_cards(breakout_room_id,session_id,event_id,event_flight_item_id)
    values(new.id,new.session_id,new.event_id,session_row.event_flight_item_id)
    on conflict(breakout_room_id) do nothing;
  return new;
end $$;

create trigger breakout_rooms_create_discovery_card after insert on public.event_breakout_rooms
for each row execute function public.create_room_discovery_card();

create or replace function public.add_discovery_card_member() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  update public.room_discovery_cards set participant_ids=array_append(participant_ids,new.participant_id),updated_at=now()
    where breakout_room_id=new.breakout_room_id and not new.participant_id=any(participant_ids);
  return new;
end $$;

create trigger breakout_members_add_discovery_member after insert on public.event_breakout_members
for each row execute function public.add_discovery_card_member();

create or replace function public.create_discovery_presentation() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  insert into public.event_discovery_presentations(breakout_session_id,event_id) values(new.id,new.event_id)
    on conflict(breakout_session_id) do nothing;
  return new;
end $$;

create trigger breakout_sessions_create_discovery_presentation after insert on public.event_breakout_sessions
for each row execute function public.create_discovery_presentation();

create or replace function public.lock_room_discovery_card() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if old.status='open' and new.status in ('returning','closed') then
    update public.room_discovery_cards set locked_at=coalesce(locked_at,now()),updated_at=now() where breakout_room_id=new.id;
  end if;
  return new;
end $$;

create trigger breakout_rooms_lock_discovery_card after update of status on public.event_breakout_rooms
for each row execute function public.lock_room_discovery_card();

create or replace function public.event_discovery_board(p_event_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare event_row public.events;session_row public.event_breakout_sessions;presentation_row public.event_discovery_presentations;cards jsonb;
begin
  if not public.can_manage_event(p_event_id,auth.uid()) then raise exception 'not_authorized'; end if;
  select * into event_row from public.events where id=p_event_id;
  if event_row.id is null then raise exception 'event_not_found'; end if;
  select * into session_row from public.event_breakout_sessions
    where event_id=p_event_id and event_flight_item_id=event_row.current_flight_item_id and status in ('active','returning','complete')
    order by created_at desc limit 1;
  if session_row.id is null then return '{"session":null,"cards":[],"openCardIds":[]}'::jsonb; end if;
  update public.room_discovery_cards card set spokesperson_participant_id=null,spokesperson_state='none',updated_at=now()
    from public.participants participant
    where card.session_id=session_row.id and card.spokesperson_participant_id=participant.id and participant.status in ('left','removed');
  select * into presentation_row from public.event_discovery_presentations where breakout_session_id=session_row.id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',card.id,'breakoutRoomId',card.breakout_room_id,'roomNumber',room.room_number,
    'participantCount',cardinality(card.participant_ids),'lockedAt',card.locked_at,'sourceVersion',card.source_version,
    'curiosity',card.curiosity,'roomQuote',card.room_quote,
    'quoteAttributed',card.room_quote_attributed,'spokespersonState',card.spokesperson_state,
    'spokespersonParticipantId',card.spokesperson_participant_id,
    'spokespersonName',(select participant.display_name from public.participants participant where participant.id=card.spokesperson_participant_id),
    'participants',(select coalesce(jsonb_agg(jsonb_build_object('id',participant.id,'displayName',participant.display_name) order by participant.display_name),'[]'::jsonb)
      from public.event_breakout_members member join public.participants participant on participant.id=member.participant_id where member.breakout_room_id=card.breakout_room_id),
    'items',(select coalesce(jsonb_agg(jsonb_build_object(
      'id',item.id,'category',item.category,'text',item.item_text,'normalizedKey',item.normalized_key,'source',item.source,
      'prevalenceCount',item.prevalence_count,'prevalenceTotal',item.prevalence_total
    ) order by item.category,item.prevalence_count desc nulls last,item.created_at),'[]'::jsonb)
      from public.room_discovery_card_items item where item.card_id=card.id and item.removed_at is null)
  ) order by room.room_number),'[]'::jsonb) into cards
  from public.room_discovery_cards card join public.event_breakout_rooms room on room.id=card.breakout_room_id
  where card.session_id=session_row.id;
  return jsonb_build_object(
    'session',jsonb_build_object('id',session_row.id,'status',session_row.status,'eventFlightItemId',session_row.event_flight_item_id,'completedAt',session_row.completed_at),
    'cards',cards,'openCardIds',coalesce(presentation_row.open_card_ids,'{}'::uuid[]),
    'surfacedCuriosityCardId',presentation_row.surfaced_curiosity_card_id
  );
end $$;

revoke all on function public.event_discovery_board(uuid) from public,anon;
grant execute on function public.event_discovery_board(uuid) to authenticated;

create or replace function public.apply_discovery_presentation_command(
  p_event_id uuid,p_command text,p_expected_sequence bigint,p_lease_token uuid,p_client_command_id uuid,p_payload jsonb default '{}'::jsonb
) returns public.events
language plpgsql security definer set search_path=public as $$
declare
  event_row public.events;lease_row public.host_control_leases;session_row public.event_breakout_sessions;
  presentation_row public.event_discovery_presentations;card_row public.room_discovery_cards;
  card_id uuid;participant_id uuid;open_cards uuid[];
begin
  select * into event_row from public.events where id=p_event_id for update;
  if event_row.id is null then raise exception 'event_not_found'; end if;
  if not public.can_manage_event(p_event_id,auth.uid()) then raise exception 'not_authorized'; end if;
  select * into lease_row from public.host_control_leases where event_id=p_event_id for update;
  if lease_row.event_id is null or lease_row.holder_user_id<>auth.uid() or lease_row.lease_token<>p_lease_token or lease_row.expires_at<=now() then raise exception 'lease_lost'; end if;
  if p_client_command_id is not null and event_row.last_conductor_command_id=p_client_command_id then return event_row; end if;
  if event_row.sequence_number<>p_expected_sequence then raise exception 'stale_sequence'; end if;
  if event_row.phase='ended' or event_row.status<>'live' then raise exception 'event_not_live'; end if;
  select * into session_row from public.event_breakout_sessions
    where event_id=p_event_id and event_flight_item_id=event_row.current_flight_item_id and status in ('returning','complete')
    order by created_at desc limit 1;
  if session_row.id is null then raise exception 'discovery_board_unavailable'; end if;
  select * into presentation_row from public.event_discovery_presentations where breakout_session_id=session_row.id for update;
  card_id=nullif(p_payload->>'cardId','')::uuid;
  if card_id is not null then
    select * into card_row from public.room_discovery_cards where id=card_id and session_id=session_row.id for update;
    if card_row.id is null then raise exception 'discovery_card_unavailable'; end if;
  end if;

  if p_command='open_discovery_card' then
    if card_row.id is null then raise exception 'discovery_card_unavailable'; end if;
    update public.event_discovery_presentations set open_card_ids=array[card_id],surfaced_curiosity_card_id=null,updated_by=auth.uid(),updated_at=now()
      where breakout_session_id=session_row.id;
  elsif p_command='compare_discovery_card' then
    if card_row.id is null then raise exception 'discovery_card_unavailable'; end if;
    open_cards=coalesce(presentation_row.open_card_ids,'{}'::uuid[]);
    if card_id=any(open_cards) then null;
    elsif cardinality(open_cards)=0 then open_cards=array[card_id];
    elsif cardinality(open_cards)=1 then open_cards=array_append(open_cards,card_id);
    else open_cards=array[open_cards[2],card_id];
    end if;
    update public.event_discovery_presentations set open_card_ids=open_cards,surfaced_curiosity_card_id=null,updated_by=auth.uid(),updated_at=now()
      where breakout_session_id=session_row.id;
  elsif p_command='surface_discovery_curiosity' then
    if card_row.id is null or card_row.curiosity is null then raise exception 'discovery_curiosity_unavailable'; end if;
    update public.event_discovery_presentations set open_card_ids=array[card_id],surfaced_curiosity_card_id=card_id,updated_by=auth.uid(),updated_at=now()
      where breakout_session_id=session_row.id;
  elsif p_command='close_discovery_cards' then
    update public.event_discovery_presentations set open_card_ids='{}'::uuid[],surfaced_curiosity_card_id=null,updated_by=auth.uid(),updated_at=now()
      where breakout_session_id=session_row.id;
  elsif p_command='invite_discovery_spokesperson' then
    if card_row.id is null then raise exception 'discovery_card_unavailable'; end if;
    participant_id=coalesce(nullif(p_payload->>'participantId','')::uuid,card_row.spokesperson_participant_id);
    if participant_id is null or not exists(select 1 from public.event_breakout_members member where member.breakout_room_id=card_row.breakout_room_id and member.participant_id=participant_id) then
      raise exception 'discovery_spokesperson_unavailable';
    end if;
    update public.room_discovery_cards set spokesperson_participant_id=participant_id,spokesperson_state='invited',updated_at=now() where id=card_id;
    update public.event_discovery_presentations set open_card_ids=array[card_id],updated_by=auth.uid(),updated_at=now() where breakout_session_id=session_row.id;
  elsif p_command='complete_discovery_share' then
    if card_row.id is null or card_row.spokesperson_state not in ('accepted','invited') then raise exception 'discovery_spokesperson_unavailable'; end if;
    update public.room_discovery_cards set spokesperson_state='shared',updated_at=now() where id=card_id;
  else raise exception 'unknown_command';
  end if;

  event_row.sequence_number=event_row.sequence_number+1;event_row.conductor_id=auth.uid();
  event_row.last_conductor_command_id=p_client_command_id;event_row.updated_at=now();
  update public.events set sequence_number=event_row.sequence_number,conductor_id=event_row.conductor_id,
    last_conductor_command_id=event_row.last_conductor_command_id,updated_at=event_row.updated_at
    where id=event_row.id returning * into event_row;
  insert into public.event_state_log(event_id,sequence_number,command,phase,actor_user_id,payload)
    values(event_row.id,event_row.sequence_number,p_command,event_row.phase,auth.uid(),jsonb_build_object(
      'breakout_session_id',session_row.id,'card_id',card_id,'client_command_id',p_client_command_id
    ));
  return event_row;
end $$;

revoke all on function public.apply_discovery_presentation_command(uuid,text,bigint,uuid,uuid,jsonb) from public,anon;
grant execute on function public.apply_discovery_presentation_command(uuid,text,bigint,uuid,uuid,jsonb) to authenticated;

create or replace function public.scrub_deleted_participant_live_content() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  delete from public.event_reactions where participant_id=old.id;
  delete from public.event_chat_messages where participant_id=old.id;
  update public.event_breakout_rooms set snapshot=null,snapshot_submitted_by=null,snapshot_submitted_at=null,updated_at=now()
    where snapshot_submitted_by=old.id;
  delete from public.room_discovery_card_items where created_by=old.id or attribution_participant_id=old.id;
  update public.room_discovery_cards set
    participant_ids=array_remove(participant_ids,old.id),
    room_quote=case when room_quote_participant_id=old.id then null else room_quote end,
    room_quote_attributed=case when room_quote_participant_id=old.id then false else room_quote_attributed end,
    room_quote_participant_id=case when room_quote_participant_id=old.id then null else room_quote_participant_id end,
    spokesperson_participant_id=case when spokesperson_participant_id=old.id then null else spokesperson_participant_id end,
    spokesperson_state=case when spokesperson_participant_id=old.id then 'none' else spokesperson_state end,
    updated_at=now()
    where old.id=any(participant_ids) or room_quote_participant_id=old.id or spokesperson_participant_id=old.id;
  return old;
end $$;

comment on table public.room_discovery_cards is 'Canonical room-level return artifact; private notes, chat, audio, and transcripts are excluded.';
comment on table public.room_discovery_card_items is 'Atomic editable discoveries. Removing an item never changes a participant tea response or revision.';
