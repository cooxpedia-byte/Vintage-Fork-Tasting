-- Tea Lab foundation: customer-owned solo sessions without changing the live-event model.

create table public.flavor_descriptors (
  id uuid primary key,
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  label text not null check (char_length(trim(label)) between 1 and 80),
  category text not null check (char_length(trim(category)) between 1 and 80),
  aliases text[] not null default '{}',
  active boolean not null default true,
  position integer not null unique check (position > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.flavor_descriptors(id,slug,label,category,aliases,position) values
  ('10000000-0000-4000-8000-000000000001','honeyed','Honeyed','Sweet',array['honeyed'],1),
  ('10000000-0000-4000-8000-000000000002','orchid','Orchid','Floral',array['orchid'],2),
  ('10000000-0000-4000-8000-000000000003','buttery','Buttery','Texture',array['buttery'],3),
  ('10000000-0000-4000-8000-000000000004','toasted-grain','Toasted grain','Roasted',array['toasted grain'],4),
  ('10000000-0000-4000-8000-000000000005','stone-fruit','Stone fruit','Fruit',array['stone fruit'],5),
  ('10000000-0000-4000-8000-000000000006','cream','Cream','Sweet',array['cream'],6),
  ('10000000-0000-4000-8000-000000000007','green-bean','Green bean','Vegetal',array['green bean'],7),
  ('10000000-0000-4000-8000-000000000008','jasmine','Jasmine','Floral',array['jasmine'],8),
  ('10000000-0000-4000-8000-000000000009','caramel','Caramel','Sweet',array['caramel'],9),
  ('10000000-0000-4000-8000-000000000010','mineral','Mineral','Mineral',array['mineral'],10),
  ('10000000-0000-4000-8000-000000000011','citrus-peel','Citrus peel','Fruit',array['citrus peel'],11),
  ('10000000-0000-4000-8000-000000000012','sweet-hay','Sweet hay','Vegetal',array['sweet hay'],12);

create table public.personal_tea_records (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  canonical_tea_id uuid references public.teas(id),
  name text not null check (char_length(trim(name)) between 1 and 160),
  producer text check (producer is null or char_length(trim(producer)) between 1 and 160),
  origin text check (origin is null or char_length(trim(origin)) between 1 and 160),
  tea_type text check (tea_type is null or char_length(trim(tea_type)) between 1 and 80),
  cultivar text check (cultivar is null or char_length(trim(cultivar)) between 1 and 120),
  harvest text check (harvest is null or char_length(trim(harvest)) between 1 and 120),
  product_identifier text check (product_identifier is null or char_length(trim(product_identifier)) between 1 and 160),
  lot_code text check (lot_code is null or char_length(trim(lot_code)) between 1 and 160),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,owner_user_id)
);

create table public.tasting_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null default 'solo' check (kind in ('solo')),
  status text not null default 'draft' check (status in ('draft','in_progress','completed')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  archived_at timestamptz,
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,owner_user_id),
  check ((status='completed') = (completed_at is not null))
);

create table public.tasting_cards (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  owner_user_id uuid not null,
  position integer not null default 1 check (position > 0),
  canonical_tea_id uuid references public.teas(id),
  personal_tea_record_id uuid,
  tea_name_snapshot text not null check (char_length(trim(tea_name_snapshot)) between 1 and 160),
  producer_snapshot text check (producer_snapshot is null or char_length(trim(producer_snapshot)) between 1 and 160),
  origin_snapshot text check (origin_snapshot is null or char_length(trim(origin_snapshot)) between 1 and 160),
  tea_type_snapshot text check (tea_type_snapshot is null or char_length(trim(tea_type_snapshot)) between 1 and 80),
  cultivar_snapshot text check (cultivar_snapshot is null or char_length(trim(cultivar_snapshot)) between 1 and 120),
  harvest_snapshot text check (harvest_snapshot is null or char_length(trim(harvest_snapshot)) between 1 and 120),
  product_identifier_snapshot text check (product_identifier_snapshot is null or char_length(trim(product_identifier_snapshot)) between 1 and 160),
  lot_code_snapshot text check (lot_code_snapshot is null or char_length(trim(lot_code_snapshot)) between 1 and 160),
  rating integer check (rating between 1 and 5),
  intensity text check (intensity is null or intensity in ('subtle','clear','dominant')),
  completed_at timestamptz,
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(session_id,position),
  unique(id,owner_user_id),
  constraint tasting_cards_session_owner_fk foreign key(session_id,owner_user_id)
    references public.tasting_sessions(id,owner_user_id) on delete cascade,
  constraint tasting_cards_personal_tea_owner_fk foreign key(personal_tea_record_id,owner_user_id)
    references public.personal_tea_records(id,owner_user_id),
  check (num_nonnulls(canonical_tea_id,personal_tea_record_id)=1),
  check (completed_at is null or rating is not null)
);

create table public.brewing_setups (
  card_id uuid primary key,
  owner_user_id uuid not null,
  leaf_grams numeric(7,2) check (leaf_grams is null or leaf_grams > 0 and leaf_grams <= 1000),
  water_ml integer check (water_ml is null or water_ml between 1 and 10000),
  water_temperature_c numeric(5,2) check (water_temperature_c is null or water_temperature_c between 0 and 100),
  water_source text check (water_source is null or char_length(trim(water_source)) between 1 and 160),
  vessel text check (vessel is null or char_length(trim(vessel)) between 1 and 160),
  initial_steep_seconds integer check (initial_steep_seconds is null or initial_steep_seconds between 1 and 86400),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint brewing_setups_card_owner_fk foreign key(card_id,owner_user_id)
    references public.tasting_cards(id,owner_user_id) on delete cascade
);

create table public.tasting_card_private_notes (
  card_id uuid primary key,
  owner_user_id uuid not null,
  first_impression text check (first_impression is null or char_length(first_impression) <= 600),
  personal_notes text check (personal_notes is null or char_length(personal_notes) <= 3000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tasting_card_private_notes_card_owner_fk foreign key(card_id,owner_user_id)
    references public.tasting_cards(id,owner_user_id) on delete cascade
);

create table public.tasting_card_descriptors (
  card_id uuid not null,
  descriptor_id uuid not null references public.flavor_descriptors(id),
  owner_user_id uuid not null,
  position integer not null check (position between 1 and 3),
  created_at timestamptz not null default now(),
  primary key(card_id,descriptor_id),
  unique(card_id,position),
  constraint tasting_card_descriptors_card_owner_fk foreign key(card_id,owner_user_id)
    references public.tasting_cards(id,owner_user_id) on delete cascade
);

create table public.tea_lab_operations (
  id uuid primary key,
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  operation_type text not null check (operation_type in ('complete_session','delete_session')),
  target_id uuid not null,
  request_fingerprint text not null check (char_length(request_fingerprint) between 1 and 200),
  result jsonb not null default '{}',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now()+interval '30 days'),
  check (expires_at > created_at)
);

create index personal_tea_records_owner_library_idx
  on public.personal_tea_records(owner_user_id,archived_at,lower(name));
create index tasting_sessions_owner_status_idx
  on public.tasting_sessions(owner_user_id,status,archived_at,updated_at desc);
create index tasting_sessions_owner_completed_idx
  on public.tasting_sessions(owner_user_id,completed_at desc) where completed_at is not null;
create index tasting_cards_owner_completed_idx
  on public.tasting_cards(owner_user_id,completed_at desc) where completed_at is not null;
create index tasting_card_descriptors_descriptor_idx
  on public.tasting_card_descriptors(descriptor_id,card_id);
create index tea_lab_operations_owner_target_idx
  on public.tea_lab_operations(owner_user_id,target_id,operation_type);
create index tea_lab_operations_expiry_idx
  on public.tea_lab_operations(expires_at);

create trigger flavor_descriptors_touch before update on public.flavor_descriptors
  for each row execute function public.touch_updated_at();
create trigger personal_tea_records_touch before update on public.personal_tea_records
  for each row execute function public.touch_updated_at();
create trigger tasting_sessions_touch before update on public.tasting_sessions
  for each row execute function public.touch_updated_at();
create trigger tasting_cards_touch before update on public.tasting_cards
  for each row execute function public.touch_updated_at();
create trigger brewing_setups_touch before update on public.brewing_setups
  for each row execute function public.touch_updated_at();
create trigger tasting_card_private_notes_touch before update on public.tasting_card_private_notes
  for each row execute function public.touch_updated_at();

alter table public.flavor_descriptors enable row level security;
alter table public.personal_tea_records enable row level security;
alter table public.tasting_sessions enable row level security;
alter table public.tasting_cards enable row level security;
alter table public.brewing_setups enable row level security;
alter table public.tasting_card_private_notes enable row level security;
alter table public.tasting_card_descriptors enable row level security;
alter table public.tea_lab_operations enable row level security;

create policy flavor_descriptors_authenticated_read on public.flavor_descriptors
  for select to authenticated using (true);
create policy personal_tea_records_owner_read on public.personal_tea_records
  for select to authenticated using (owner_user_id=auth.uid());
create policy tasting_sessions_owner_read on public.tasting_sessions
  for select to authenticated using (owner_user_id=auth.uid());
create policy tasting_cards_owner_read on public.tasting_cards
  for select to authenticated using (owner_user_id=auth.uid());
create policy brewing_setups_owner_read on public.brewing_setups
  for select to authenticated using (owner_user_id=auth.uid());
create policy tasting_card_private_notes_owner_read on public.tasting_card_private_notes
  for select to authenticated using (owner_user_id=auth.uid());
create policy tasting_card_descriptors_owner_read on public.tasting_card_descriptors
  for select to authenticated using (owner_user_id=auth.uid());

revoke all on public.flavor_descriptors from public,anon,authenticated;
revoke all on public.personal_tea_records from public,anon,authenticated;
revoke all on public.tasting_sessions from public,anon,authenticated;
revoke all on public.tasting_cards from public,anon,authenticated;
revoke all on public.brewing_setups from public,anon,authenticated;
revoke all on public.tasting_card_private_notes from public,anon,authenticated;
revoke all on public.tasting_card_descriptors from public,anon,authenticated;
revoke all on public.tea_lab_operations from public,anon,authenticated;

grant select on public.flavor_descriptors to authenticated;
grant select on public.personal_tea_records to authenticated;
grant select on public.tasting_sessions to authenticated;
grant select on public.tasting_cards to authenticated;
grant select on public.brewing_setups to authenticated;
grant select on public.tasting_card_private_notes to authenticated;
grant select on public.tasting_card_descriptors to authenticated;

grant all on public.flavor_descriptors to service_role;
grant all on public.personal_tea_records to service_role;
grant all on public.tasting_sessions to service_role;
grant all on public.tasting_cards to service_role;
grant all on public.brewing_setups to service_role;
grant all on public.tasting_card_private_notes to service_role;
grant all on public.tasting_card_descriptors to service_role;
grant all on public.tea_lab_operations to service_role;

create or replace function public.complete_tasting_session(
  p_session_id uuid,
  p_operation_id uuid,
  p_expected_revision integer
) returns public.tasting_sessions
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_owner_id uuid := auth.uid();
  v_session public.tasting_sessions;
  v_card public.tasting_cards;
  v_operation public.tea_lab_operations;
  v_card_count integer;
  v_fingerprint text := format('complete:%s',p_expected_revision);
  v_completed_at timestamptz := clock_timestamp();
begin
  if v_owner_id is null then raise exception 'tea_lab_authentication_required'; end if;
  if p_operation_id is null then raise exception 'tea_lab_invalid_operation_id'; end if;
  if p_expected_revision is null or p_expected_revision < 1 then raise exception 'tea_lab_invalid_revision'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_operation_id::text,0));

  select * into v_operation from public.tea_lab_operations
  where id=p_operation_id for update;
  if found then
    if v_operation.owner_user_id<>v_owner_id
      or v_operation.operation_type<>'complete_session'
      or v_operation.target_id<>p_session_id
      or v_operation.request_fingerprint<>v_fingerprint then
      raise exception 'tea_lab_idempotency_conflict';
    end if;
    select * into v_session from public.tasting_sessions
      where id=p_session_id and owner_user_id=v_owner_id;
    if not found then raise exception 'tea_lab_session_not_found'; end if;
    return v_session;
  end if;

  select * into v_session from public.tasting_sessions
    where id=p_session_id and owner_user_id=v_owner_id for update;
  if not found then raise exception 'tea_lab_session_not_found'; end if;

  if v_session.status='completed' then
    insert into public.tea_lab_operations(id,owner_user_id,operation_type,target_id,request_fingerprint,result)
    values(p_operation_id,v_owner_id,'complete_session',p_session_id,v_fingerprint,
      jsonb_build_object('status','completed','session_revision',v_session.revision));
    return v_session;
  end if;

  if v_session.kind<>'solo' then raise exception 'tea_lab_unsupported_session_kind'; end if;
  if v_session.revision<>p_expected_revision then raise exception 'tea_lab_stale_revision'; end if;

  select count(*) into v_card_count from public.tasting_cards
    where session_id=p_session_id and owner_user_id=v_owner_id;
  if v_card_count<>1 then raise exception 'tea_lab_solo_requires_one_card'; end if;

  select * into v_card from public.tasting_cards
    where session_id=p_session_id and owner_user_id=v_owner_id for update;
  if v_card.rating is null then raise exception 'tea_lab_rating_required'; end if;

  update public.tasting_cards set
    completed_at=coalesce(completed_at,v_completed_at),
    revision=revision+1,
    updated_at=now()
  where id=v_card.id and owner_user_id=v_owner_id;

  update public.tasting_sessions set
    status='completed',
    completed_at=v_completed_at,
    revision=revision+1,
    updated_at=now()
  where id=p_session_id and owner_user_id=v_owner_id
  returning * into v_session;

  insert into public.tea_lab_operations(id,owner_user_id,operation_type,target_id,request_fingerprint,result)
  values(p_operation_id,v_owner_id,'complete_session',p_session_id,v_fingerprint,
    jsonb_build_object('status','completed','session_revision',v_session.revision));

  return v_session;
end $$;

create or replace function public.delete_tasting_session(
  p_session_id uuid,
  p_operation_id uuid
) returns boolean
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_owner_id uuid := auth.uid();
  v_session public.tasting_sessions;
  v_operation public.tea_lab_operations;
begin
  if v_owner_id is null then raise exception 'tea_lab_authentication_required'; end if;
  if p_operation_id is null then raise exception 'tea_lab_invalid_operation_id'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_operation_id::text,0));

  select * into v_operation from public.tea_lab_operations
    where id=p_operation_id for update;
  if found then
    if v_operation.owner_user_id<>v_owner_id
      or v_operation.operation_type<>'delete_session'
      or v_operation.target_id<>p_session_id
      or v_operation.request_fingerprint<>'delete' then
      raise exception 'tea_lab_idempotency_conflict';
    end if;
    return true;
  end if;

  select * into v_session from public.tasting_sessions
    where id=p_session_id and owner_user_id=v_owner_id for update;
  if not found then raise exception 'tea_lab_session_not_found'; end if;

  insert into public.tea_lab_operations(id,owner_user_id,operation_type,target_id,request_fingerprint,result)
  values(p_operation_id,v_owner_id,'delete_session',p_session_id,'delete',jsonb_build_object('deleted',true));

  delete from public.tasting_sessions
    where id=p_session_id and owner_user_id=v_owner_id;
  return true;
end $$;

create or replace function public.purge_expired_tea_lab_operations()
returns bigint
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_deleted bigint;
begin
  delete from public.tea_lab_operations where expires_at<=now();
  get diagnostics v_deleted=row_count;
  return v_deleted;
end $$;

revoke all on function public.complete_tasting_session(uuid,uuid,integer) from public,anon;
grant execute on function public.complete_tasting_session(uuid,uuid,integer) to authenticated,service_role;
revoke all on function public.delete_tasting_session(uuid,uuid) from public,anon;
grant execute on function public.delete_tasting_session(uuid,uuid) to authenticated,service_role;
revoke all on function public.purge_expired_tea_lab_operations() from public,anon,authenticated;
grant execute on function public.purge_expired_tea_lab_operations() to service_role;

comment on table public.tasting_sessions is 'Customer-owned Tea Lab sessions; live events remain in public.events.';
comment on table public.tasting_cards is 'Customer-owned Tea Lab cards; live responses remain in public.tea_responses.';
comment on table public.tasting_card_private_notes is 'Owner-private Tea Lab prose, structurally separated from flavor observations.';
comment on table public.tea_lab_operations is 'Idempotency receipts retained for 30 days; contains no tasting prose or request bodies.';
