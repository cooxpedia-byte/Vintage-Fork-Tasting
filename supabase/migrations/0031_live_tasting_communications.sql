-- Tea-native live communication is intentionally separate from Agora media.
-- Chat persists with the tasting; reactions are short-lived social signals.

create table public.event_communication_settings (
  event_id uuid primary key references public.events(id) on delete cascade,
  chat_enabled boolean not null default true,
  reactions_enabled boolean not null default true,
  slow_mode_seconds integer not null default 0 check (slow_mode_seconds between 0 and 60),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.event_chat_messages (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  participant_id uuid references public.participants(id) on delete set null,
  author_user_id uuid references public.profiles(id) on delete set null,
  sender_key text not null check (char_length(sender_key) between 3 and 96),
  author_kind text not null check (author_kind in ('host','guest')),
  author_display_name text not null check (char_length(author_display_name) between 1 and 80),
  message_kind text not null default 'chat' check (message_kind in ('chat','broadcast')),
  body text not null check (char_length(body) between 1 and 600),
  event_flight_item_id uuid references public.event_flight_items(id) on delete set null,
  parent_message_id uuid references public.event_chat_messages(id) on delete set null,
  ask_host boolean not null default false,
  answered_at timestamptz,
  answered_by uuid references public.profiles(id) on delete set null,
  pinned_at timestamptz,
  pinned_by uuid references public.profiles(id) on delete set null,
  spotlighted_at timestamptz,
  spotlighted_by uuid references public.profiles(id) on delete set null,
  spotlight_anonymous boolean not null default false,
  spotlight_duration_seconds integer not null default 8 check (spotlight_duration_seconds between 6 and 10),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete set null,
  delete_reason text check (delete_reason is null or char_length(delete_reason) <= 240),
  client_id uuid not null,
  created_at timestamptz not null default now(),
  unique(sender_key,client_id),
  check ((author_kind='guest' and participant_id is not null) or author_kind='host')
);

create table public.event_reactions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  participant_id uuid references public.participants(id) on delete set null,
  author_user_id uuid references public.profiles(id) on delete set null,
  sender_key text not null check (char_length(sender_key) between 3 and 96),
  reaction_type text not null check (reaction_type in (
    'tea_cup','leaf','flower','honey_drop','spark','thinking','same','different','question'
  )),
  event_flight_item_id uuid references public.event_flight_items(id) on delete set null,
  client_id uuid not null,
  created_at timestamptz not null default now(),
  unique(sender_key,client_id)
);

create table public.event_communication_reads (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(event_id,user_id)
);

create table public.event_moderation_log (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.events(id) on delete cascade,
  moderator_user_id uuid references public.profiles(id) on delete set null,
  action text not null check (action in (
    'answer','pin','unpin','spotlight','broadcast','delete','remove_participant','report','settings'
  )),
  target_message_id uuid references public.event_chat_messages(id) on delete set null,
  reason text check (reason is null or char_length(reason) <= 240),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index event_chat_messages_event_created_idx
  on public.event_chat_messages(event_id,created_at desc);
create index event_chat_messages_questions_idx
  on public.event_chat_messages(event_id,ask_host,answered_at,created_at desc)
  where deleted_at is null;
create index event_chat_messages_pinned_idx
  on public.event_chat_messages(event_id,pinned_at desc)
  where pinned_at is not null and deleted_at is null;
create index event_reactions_event_created_idx
  on public.event_reactions(event_id,created_at desc);
create index event_moderation_log_event_created_idx
  on public.event_moderation_log(event_id,created_at desc);

create or replace function public.can_access_event_communication(p_event_id uuid,p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select p_user_id is not null and (
    public.can_manage_event(p_event_id,p_user_id)
    or exists(
      select 1 from public.participants p
      where p.event_id=p_event_id
        and p.user_id=p_user_id
        and p.status <> 'removed'
    )
  );
$$;

revoke all on function public.can_access_event_communication(uuid,uuid) from public,anon;
grant execute on function public.can_access_event_communication(uuid,uuid) to authenticated,service_role;

alter table public.event_communication_settings enable row level security;
alter table public.event_chat_messages enable row level security;
alter table public.event_reactions enable row level security;
alter table public.event_communication_reads enable row level security;
alter table public.event_moderation_log enable row level security;

create policy communication_settings_member_read on public.event_communication_settings
  for select to authenticated
  using (public.can_access_event_communication(event_id,auth.uid()));
create policy chat_messages_member_read on public.event_chat_messages
  for select to authenticated
  using (public.can_access_event_communication(event_id,auth.uid()));
create policy event_reactions_member_read on public.event_reactions
  for select to authenticated
  using (public.can_access_event_communication(event_id,auth.uid()));
create policy communication_reads_owner_read on public.event_communication_reads
  for select to authenticated
  using (user_id=auth.uid() and public.can_access_event_communication(event_id,auth.uid()));
create policy moderation_log_staff_read on public.event_moderation_log
  for select to authenticated
  using (public.can_manage_event(event_id,auth.uid()));

revoke all on public.event_communication_settings from anon,authenticated;
revoke all on public.event_chat_messages from anon,authenticated;
revoke all on public.event_reactions from anon,authenticated;
revoke all on public.event_communication_reads from anon,authenticated;
revoke all on public.event_moderation_log from anon,authenticated;
grant select(event_id,chat_enabled,reactions_enabled,slow_mode_seconds,updated_at)
  on public.event_communication_settings to authenticated;
grant select(id,event_id,author_kind,author_display_name,message_kind,body,event_flight_item_id,
  parent_message_id,ask_host,answered_at,pinned_at,spotlighted_at,spotlight_anonymous,
  spotlight_duration_seconds,deleted_at,client_id,created_at)
  on public.event_chat_messages to authenticated;
grant select(id,event_id,reaction_type,event_flight_item_id,client_id,created_at)
  on public.event_reactions to authenticated;
grant select on public.event_communication_reads to authenticated;
grant select on public.event_moderation_log to authenticated;

alter table public.event_chat_messages replica identity full;
alter table public.event_reactions replica identity full;
alter table public.event_communication_settings replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='event_chat_messages'
  ) then
    alter publication supabase_realtime add table public.event_chat_messages;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='event_reactions'
  ) then
    alter publication supabase_realtime add table public.event_reactions;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='event_communication_settings'
  ) then
    alter publication supabase_realtime add table public.event_communication_settings;
  end if;
end $$;

comment on table public.event_chat_messages is
  'Persistent tea-context chat. Moderation replaces deleted bodies before realtime delivery.';
comment on table public.event_reactions is
  'Short-retention tea-native reaction events; never flavor-map evidence.';
