-- Conversation prompts are a lightweight facilitation layer beside Agora media.
-- They never collect answers, inspect speech, advance the conductor, or affect rewards.

alter table public.events
  add column conversation_prompts_enabled boolean not null default true;

create table public.conversation_prompt_library(
  id uuid primary key default gen_random_uuid(),
  prompt_key text not null unique check(prompt_key ~ '^[a-z0-9_]+$'),
  prompt_text text not null check(char_length(prompt_text) between 1 and 140),
  category text not null check(category in ('notice','compare','change','contrast','language','memory','revisit','curiosity','social','reflection')),
  allowed_stages text[] not null check(
    cardinality(allowed_stages)>0
    and allowed_stages <@ array['prepare','brew','aroma','first_sip','explore','discuss','reveal','debrief','close_tea']::text[]
  ),
  audience text not null default 'all' check(audience in ('host','breakout','all')),
  difficulty text not null default 'basic' check(difficulty in ('basic','standard','advanced')),
  requires_reveal boolean not null default false,
  tea_context_tags text[] not null default array['universal']::text[],
  locale text not null default 'en-CA' check(char_length(locale) between 2 and 16),
  active boolean not null default true,
  version integer not null default 1 check(version>0),
  sort_order integer not null default 100 check(sort_order>=0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(not requires_reveal or allowed_stages <@ array['reveal','debrief','close_tea']::text[]),
  check(not ('first_sip'=any(allowed_stages)) or prompt_text='Notice first. Name it when you''re ready.')
);

create table public.event_conversation_prompts(
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  event_flight_item_id uuid not null references public.event_flight_items(id) on delete cascade,
  breakout_room_id uuid references public.event_breakout_rooms(id) on delete cascade,
  library_prompt_id uuid not null references public.conversation_prompt_library(id) on delete restrict,
  audience text not null check(audience in ('main','breakout')),
  source text not null check(source in ('host','room_initial','room_another')),
  status text not null default 'active' check(status in ('active','dismissed','replaced','expired')),
  requested_by_participant_id uuid references public.participants(id) on delete set null,
  published_by_user_id uuid references public.profiles(id) on delete set null,
  displayed_at timestamptz not null default now(),
  dismissed_at timestamptz,
  dismissed_by_participant_id uuid references public.participants(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check((audience='main' and breakout_room_id is null) or (audience='breakout' and breakout_room_id is not null)),
  check((status='active' and dismissed_at is null) or status<>'active')
);

create unique index event_conversation_prompts_one_main_active_idx
  on public.event_conversation_prompts(event_id,event_flight_item_id)
  where status='active' and audience='main';
create unique index event_conversation_prompts_one_breakout_active_idx
  on public.event_conversation_prompts(breakout_room_id,event_flight_item_id)
  where status='active' and audience='breakout';
create index event_conversation_prompts_history_idx
  on public.event_conversation_prompts(event_id,event_flight_item_id,breakout_room_id,created_at desc);

create table public.event_conversation_prompt_actions(
  id bigint generated always as identity primary key,
  event_id uuid not null references public.events(id) on delete cascade,
  prompt_instance_id uuid not null references public.event_conversation_prompts(id) on delete cascade,
  breakout_room_id uuid references public.event_breakout_rooms(id) on delete cascade,
  participant_id uuid references public.participants(id) on delete set null,
  actor_user_id uuid references public.profiles(id) on delete set null,
  action text not null check(action in ('displayed','dismissed','another_requested','host_sent','promoted_curiosity')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index event_conversation_prompt_actions_event_idx
  on public.event_conversation_prompt_actions(event_id,created_at desc);

alter table public.conversation_prompt_library enable row level security;
alter table public.event_conversation_prompts enable row level security;
alter table public.event_conversation_prompt_actions enable row level security;
revoke all on public.conversation_prompt_library,public.event_conversation_prompts,public.event_conversation_prompt_actions from anon,authenticated;

insert into public.conversation_prompt_library(prompt_key,prompt_text,category,allowed_stages,audience,difficulty,requires_reveal,sort_order) values
  ('prepare_ritual','What ritual helps you settle into a tasting?','social',array['prepare'],'all','basic',false,10),
  ('prepare_hope','What are you hoping to notice today?','curiosity',array['prepare'],'all','basic',false,20),
  ('brew_memory','What does this brewing moment remind you of?','memory',array['brew'],'all','basic',false,30),
  ('brew_curiosity','What are you curious to meet in this cup?','curiosity',array['brew'],'all','basic',false,40),
  ('aroma_return','What shifted when you returned to the aroma?','revisit',array['aroma'],'all','basic',false,50),
  ('first_sip_neutral','Notice first. Name it when you''re ready.','notice',array['first_sip'],'all','basic',false,60),
  ('explore_present','What feels most present right now?','notice',array['explore'],'all','basic',false,70),
  ('explore_aroma_taste','How did aroma and taste point differently?','compare',array['explore','discuss'],'all','standard',false,80),
  ('explore_cooling','What changed as the cup cooled?','change',array['explore','discuss'],'all','basic',false,90),
  ('explore_apart','Where are your impressions pulling apart?','contrast',array['explore','discuss'],'all','standard',false,100),
  ('explore_image','What image fits what you cannot quite name?','language',array['explore','discuss'],'all','standard',false,110),
  ('explore_memory','What memory, place, or season does this evoke?','memory',array['explore','discuss'],'all','basic',false,120),
  ('explore_revisit','What do you notice now that you missed earlier?','revisit',array['explore','discuss'],'all','standard',false,130),
  ('explore_infusion','What question would you carry into another infusion?','curiosity',array['explore','discuss'],'all','standard',false,140),
  ('discuss_listening','What did someone else help you notice?','social',array['discuss','debrief'],'all','basic',false,150),
  ('discuss_agreement','Where did your table agree without needing consensus?','compare',array['discuss'],'all','standard',false,160),
  ('discuss_difference','Which difference made the tea more interesting?','contrast',array['discuss','debrief'],'all','standard',false,170),
  ('reveal_surprise','What pattern surprised you after the reveal?','reflection',array['reveal','debrief'],'all','standard',true,180),
  ('reveal_clarity','What became clearer when the group portrait appeared?','compare',array['reveal','debrief'],'all','standard',true,190),
  ('debrief_changed','What changed after hearing the room?','reflection',array['debrief'],'all','basic',false,200),
  ('close_recognize','What would help you recognize this tea again?','memory',array['close_tea'],'all','basic',false,210),
  ('close_remember','What will you remember from this cup?','reflection',array['close_tea'],'all','basic',false,220);

create or replace function public.apply_conversation_prompt_command(
  p_event_id uuid,
  p_command text,
  p_expected_sequence bigint,
  p_lease_token uuid,
  p_client_command_id uuid,
  p_payload jsonb default '{}'::jsonb
)
returns public.events
language plpgsql security definer set search_path=public as $$
declare
  event_row public.events;
  lease_row public.host_control_leases;
  prompt_row public.conversation_prompt_library;
  breakout_session_row public.event_breakout_sessions;
  room_row record;
  prompt_instance_id uuid;
  prompt_id uuid;
  prompt_target text;
  prompt_enabled boolean;
begin
  select * into event_row from public.events where id=p_event_id for update;
  if event_row.id is null then raise exception 'event_not_found'; end if;
  if not public.can_manage_event(p_event_id,auth.uid()) then raise exception 'not_authorized'; end if;
  select * into lease_row from public.host_control_leases where event_id=p_event_id for update;
  if lease_row.event_id is null or lease_row.holder_user_id<>auth.uid() or lease_row.lease_token<>p_lease_token or lease_row.expires_at<=now() then
    raise exception 'lease_lost';
  end if;
  if p_client_command_id is not null and event_row.last_conductor_command_id=p_client_command_id then return event_row; end if;
  if event_row.sequence_number<>p_expected_sequence then raise exception 'stale_sequence'; end if;
  if event_row.status<>'live' or event_row.phase='ended' then raise exception 'event_not_live'; end if;

  if p_command='set_conversation_prompts_enabled' then
    if not (p_payload ? 'conversationPromptsEnabled') then raise exception 'conversation_prompt_unavailable'; end if;
    prompt_enabled=(p_payload->>'conversationPromptsEnabled')::boolean;
    event_row.conversation_prompts_enabled=prompt_enabled;
    if not prompt_enabled then
      update public.event_conversation_prompts set status='dismissed',dismissed_at=now(),updated_at=now()
        where event_id=p_event_id and status='active';
    end if;
  elsif p_command='send_conversation_prompt' then
    if not event_row.conversation_prompts_enabled then raise exception 'conversation_prompt_disabled'; end if;
    if event_row.current_flight_item_id is null then raise exception 'conversation_prompt_unavailable'; end if;
    prompt_id=nullif(p_payload->>'conversationPromptId','')::uuid;
    prompt_target=nullif(p_payload->>'conversationPromptTarget','');
    select * into prompt_row from public.conversation_prompt_library where id=prompt_id and active;
    if prompt_row.id is null
      or not (event_row.conductor_stage=any(prompt_row.allowed_stages))
      or prompt_row.difficulty='advanced'
      or (prompt_row.requires_reveal and event_row.conductor_stage not in ('reveal','debrief','close_tea'))
      or (event_row.conductor_stage='first_sip' and prompt_row.prompt_text<>'Notice first. Name it when you''re ready.')
    then raise exception 'conversation_prompt_unavailable'; end if;

    if prompt_target='main' then
      if prompt_row.audience not in ('host','all') then raise exception 'conversation_prompt_unavailable'; end if;
      update public.event_conversation_prompts set status='replaced',dismissed_at=now(),updated_at=now()
        where event_id=p_event_id and event_flight_item_id=event_row.current_flight_item_id and audience='main' and status='active';
      insert into public.event_conversation_prompts(
        event_id,event_flight_item_id,library_prompt_id,audience,source,published_by_user_id
      ) values(p_event_id,event_row.current_flight_item_id,prompt_row.id,'main','host',auth.uid()) returning id into prompt_instance_id;
      insert into public.event_conversation_prompt_actions(event_id,prompt_instance_id,actor_user_id,action,metadata)
        values(p_event_id,prompt_instance_id,auth.uid(),'host_sent',jsonb_build_object('target','main'));
      insert into public.event_conversation_prompt_actions(event_id,prompt_instance_id,actor_user_id,action,metadata)
        values(p_event_id,prompt_instance_id,auth.uid(),'displayed',jsonb_build_object('source','host'));
    elsif prompt_target='breakouts' then
      if prompt_row.audience not in ('breakout','all') then raise exception 'conversation_prompt_unavailable'; end if;
      select * into breakout_session_row from public.event_breakout_sessions
        where id=event_row.current_breakout_session_id and event_id=p_event_id and event_flight_item_id=event_row.current_flight_item_id and status='active';
      if breakout_session_row.id is null then raise exception 'conversation_prompt_breakouts_unavailable'; end if;
      update public.event_conversation_prompts prompt set status='replaced',dismissed_at=now(),updated_at=now()
        where prompt.event_id=p_event_id and prompt.event_flight_item_id=event_row.current_flight_item_id and prompt.audience='breakout'
          and prompt.status='active' and exists(
            select 1 from public.event_breakout_rooms room where room.id=prompt.breakout_room_id and room.session_id=breakout_session_row.id
          );
      for room_row in select id from public.event_breakout_rooms where session_id=breakout_session_row.id and status='open' order by room_number loop
        insert into public.event_conversation_prompts(
          event_id,event_flight_item_id,breakout_room_id,library_prompt_id,audience,source,published_by_user_id
        ) values(p_event_id,event_row.current_flight_item_id,room_row.id,prompt_row.id,'breakout','host',auth.uid()) returning id into prompt_instance_id;
        insert into public.event_conversation_prompt_actions(event_id,prompt_instance_id,breakout_room_id,actor_user_id,action,metadata)
          values(p_event_id,prompt_instance_id,room_row.id,auth.uid(),'host_sent',jsonb_build_object('target','breakouts'));
        insert into public.event_conversation_prompt_actions(event_id,prompt_instance_id,breakout_room_id,actor_user_id,action,metadata)
          values(p_event_id,prompt_instance_id,room_row.id,auth.uid(),'displayed',jsonb_build_object('source','host'));
      end loop;
    else
      raise exception 'conversation_prompt_target_invalid';
    end if;
  else
    raise exception 'unknown_command';
  end if;

  event_row.sequence_number=event_row.sequence_number+1;
  event_row.conductor_id=auth.uid();
  event_row.last_conductor_command_id=p_client_command_id;
  event_row.updated_at=now();
  update public.events set
    conversation_prompts_enabled=event_row.conversation_prompts_enabled,
    sequence_number=event_row.sequence_number,
    conductor_id=event_row.conductor_id,
    last_conductor_command_id=event_row.last_conductor_command_id,
    updated_at=event_row.updated_at
  where id=event_row.id returning * into event_row;
  insert into public.event_state_log(event_id,sequence_number,command,phase,actor_user_id,payload)
    values(event_row.id,event_row.sequence_number,p_command,event_row.phase,auth.uid(),jsonb_build_object(
      'prompt_id',prompt_id,'target',prompt_target,'enabled',event_row.conversation_prompts_enabled,'client_command_id',p_client_command_id
    ));
  return event_row;
end $$;

revoke all on function public.apply_conversation_prompt_command(uuid,text,bigint,uuid,uuid,jsonb) from public,anon;
grant execute on function public.apply_conversation_prompt_command(uuid,text,bigint,uuid,uuid,jsonb) to authenticated;

comment on table public.conversation_prompt_library is 'Admin-curated, stage-aware facilitation prompts; never generated from private notes, chat, profiles, or speech.';
comment on table public.event_conversation_prompt_actions is 'Privacy-safe prompt interaction metadata only; no participant answer or transcript field exists.';
