-- Protected Tea Lab draft and archive operations. All ownership comes from auth.uid().

alter table public.tea_lab_operations
  drop constraint if exists tea_lab_operations_operation_type_check;
alter table public.tea_lab_operations
  add constraint tea_lab_operations_operation_type_check
  check (operation_type in ('sync_session','complete_session','archive_session','delete_session'));

create or replace function public.save_solo_tasting_session(
  p_session_id uuid,
  p_card_id uuid,
  p_operation_id uuid,
  p_expected_revision integer,
  p_tea jsonb,
  p_card jsonb,
  p_brewing jsonb,
  p_private_notes jsonb,
  p_descriptor_ids uuid[]
) returns public.tasting_sessions
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_owner_id uuid := auth.uid();
  v_session public.tasting_sessions;
  v_card public.tasting_cards;
  v_existing_card public.tasting_cards;
  v_personal public.personal_tea_records;
  v_tea public.teas;
  v_operation public.tea_lab_operations;
  v_descriptor_ids uuid[] := coalesce(p_descriptor_ids,array[]::uuid[]);
  v_descriptor_count integer;
  v_distinct_descriptor_count integer;
  v_valid_descriptor_count integer;
  v_tea_kind text := p_tea->>'kind';
  v_canonical_tea_id uuid;
  v_personal_tea_id uuid;
  v_tea_name text;
  v_producer text;
  v_origin text;
  v_tea_type text;
  v_cultivar text;
  v_harvest text;
  v_product_identifier text;
  v_lot_code text;
  v_created boolean := false;
  v_fingerprint text := encode(digest(jsonb_build_object(
    'expected_revision',p_expected_revision,
    'card_id',p_card_id,
    'tea',coalesce(p_tea,'{}'::jsonb),
    'card',coalesce(p_card,'{}'::jsonb),
    'brewing',coalesce(p_brewing,'{}'::jsonb),
    'private_notes',coalesce(p_private_notes,'{}'::jsonb),
    'descriptor_ids',to_jsonb(coalesce(p_descriptor_ids,array[]::uuid[]))
  )::text,'sha256'),'hex');
begin
  if v_owner_id is null then raise exception 'tea_lab_authentication_required'; end if;
  if p_session_id is null or p_card_id is null or p_operation_id is null then
    raise exception 'tea_lab_invalid_operation_id';
  end if;
  if p_expected_revision is null or p_expected_revision < 0 then
    raise exception 'tea_lab_invalid_revision';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_operation_id::text,0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_session_id::text,1));

  select * into v_operation from public.tea_lab_operations
    where id=p_operation_id for update;
  if found then
    if v_operation.owner_user_id<>v_owner_id
      or v_operation.operation_type<>'sync_session'
      or v_operation.target_id<>p_session_id
      or v_operation.request_fingerprint<>v_fingerprint then
      raise exception 'tea_lab_idempotency_conflict';
    end if;
    select * into v_session from public.tasting_sessions
      where id=p_session_id and owner_user_id=v_owner_id;
    if not found then raise exception 'tea_lab_session_not_found'; end if;
    return v_session;
  end if;

  v_descriptor_count := cardinality(v_descriptor_ids);
  select count(distinct descriptor_id) into v_distinct_descriptor_count
    from unnest(v_descriptor_ids) as selected(descriptor_id);
  select count(*) into v_valid_descriptor_count from public.flavor_descriptors
    where id=any(v_descriptor_ids) and active;
  if v_descriptor_count>3
    or v_distinct_descriptor_count<>v_descriptor_count
    or v_valid_descriptor_count<>v_descriptor_count then
    raise exception 'tea_lab_invalid_descriptors';
  end if;

  if v_tea_kind='canonical' then
    v_canonical_tea_id := nullif(p_tea->>'canonicalTeaId','')::uuid;
    if v_canonical_tea_id is null then raise exception 'tea_lab_invalid_tea'; end if;
    select * into v_tea from public.teas
      where id=v_canonical_tea_id and retired_at is null;
    if not found then raise exception 'tea_lab_canonical_tea_not_found'; end if;
    v_tea_name := v_tea.name;
    v_producer := v_tea.producer;
    v_origin := v_tea.origin;
    v_tea_type := v_tea.tea_type;
  elsif v_tea_kind='personal' then
    v_personal_tea_id := nullif(p_tea->>'personalTeaId','')::uuid;
    v_tea_name := nullif(trim(p_tea->>'name'),'');
    v_producer := nullif(trim(p_tea->>'producer'),'');
    v_origin := nullif(trim(p_tea->>'origin'),'');
    v_tea_type := nullif(trim(p_tea->>'teaType'),'');
    v_cultivar := nullif(trim(p_tea->>'cultivar'),'');
    v_harvest := nullif(trim(p_tea->>'harvest'),'');
    v_product_identifier := nullif(trim(p_tea->>'productIdentifier'),'');
    v_lot_code := nullif(trim(p_tea->>'lotCode'),'');
    if v_personal_tea_id is null or v_tea_name is null then raise exception 'tea_lab_invalid_tea'; end if;

    select * into v_personal from public.personal_tea_records
      where id=v_personal_tea_id for update;
    if found and v_personal.owner_user_id<>v_owner_id then
      raise exception 'tea_lab_personal_tea_not_found';
    end if;

    insert into public.personal_tea_records(
      id,owner_user_id,name,producer,origin,tea_type,cultivar,harvest,product_identifier,lot_code
    ) values (
      v_personal_tea_id,v_owner_id,v_tea_name,v_producer,v_origin,v_tea_type,
      v_cultivar,v_harvest,v_product_identifier,v_lot_code
    ) on conflict(id) do update set
      name=excluded.name,
      producer=excluded.producer,
      origin=excluded.origin,
      tea_type=excluded.tea_type,
      cultivar=excluded.cultivar,
      harvest=excluded.harvest,
      product_identifier=excluded.product_identifier,
      lot_code=excluded.lot_code,
      updated_at=now()
    where personal_tea_records.owner_user_id=v_owner_id;
  else
    raise exception 'tea_lab_invalid_tea';
  end if;

  select * into v_session from public.tasting_sessions
    where id=p_session_id for update;
  if found then
    if v_session.owner_user_id<>v_owner_id then raise exception 'tea_lab_session_not_found'; end if;
    if v_session.kind<>'solo' then raise exception 'tea_lab_unsupported_session_kind'; end if;
    if v_session.revision<>p_expected_revision then raise exception 'tea_lab_stale_revision'; end if;
  else
    if p_expected_revision<>0 then raise exception 'tea_lab_stale_revision'; end if;
    insert into public.tasting_sessions(id,owner_user_id,kind,status,revision)
      values(p_session_id,v_owner_id,'solo','in_progress',1)
      returning * into v_session;
    v_created := true;
  end if;

  select * into v_existing_card from public.tasting_cards
    where session_id=p_session_id limit 1 for update;
  if found and v_existing_card.id<>p_card_id then raise exception 'tea_lab_card_id_conflict'; end if;

  select * into v_card from public.tasting_cards where id=p_card_id for update;
  if found and (v_card.owner_user_id<>v_owner_id or v_card.session_id<>p_session_id) then
    raise exception 'tea_lab_card_id_conflict';
  end if;
  if v_session.status='completed' and (p_card->>'rating') is null then
    raise exception 'tea_lab_rating_required';
  end if;

  insert into public.tasting_cards(
    id,session_id,owner_user_id,position,canonical_tea_id,personal_tea_record_id,
    tea_name_snapshot,producer_snapshot,origin_snapshot,tea_type_snapshot,
    cultivar_snapshot,harvest_snapshot,product_identifier_snapshot,lot_code_snapshot,
    rating,intensity
  ) values (
    p_card_id,p_session_id,v_owner_id,1,v_canonical_tea_id,v_personal_tea_id,
    v_tea_name,v_producer,v_origin,v_tea_type,v_cultivar,v_harvest,v_product_identifier,v_lot_code,
    (p_card->>'rating')::integer,nullif(p_card->>'intensity','')
  ) on conflict(id) do update set
    canonical_tea_id=excluded.canonical_tea_id,
    personal_tea_record_id=excluded.personal_tea_record_id,
    tea_name_snapshot=excluded.tea_name_snapshot,
    producer_snapshot=excluded.producer_snapshot,
    origin_snapshot=excluded.origin_snapshot,
    tea_type_snapshot=excluded.tea_type_snapshot,
    cultivar_snapshot=excluded.cultivar_snapshot,
    harvest_snapshot=excluded.harvest_snapshot,
    product_identifier_snapshot=excluded.product_identifier_snapshot,
    lot_code_snapshot=excluded.lot_code_snapshot,
    rating=excluded.rating,
    intensity=excluded.intensity,
    revision=tasting_cards.revision+1,
    updated_at=now()
  where tasting_cards.owner_user_id=v_owner_id and tasting_cards.session_id=p_session_id
  returning * into v_card;
  if not found then raise exception 'tea_lab_card_id_conflict'; end if;

  if num_nonnulls(
    (p_brewing->>'leafGrams')::numeric,
    (p_brewing->>'waterMl')::integer,
    (p_brewing->>'waterTemperatureC')::numeric,
    nullif(p_brewing->>'waterSource',''),
    nullif(p_brewing->>'vessel',''),
    (p_brewing->>'initialSteepSeconds')::integer
  )=0 then
    delete from public.brewing_setups where card_id=p_card_id and owner_user_id=v_owner_id;
  else
    insert into public.brewing_setups(
      card_id,owner_user_id,leaf_grams,water_ml,water_temperature_c,water_source,vessel,initial_steep_seconds
    ) values (
      p_card_id,v_owner_id,(p_brewing->>'leafGrams')::numeric,(p_brewing->>'waterMl')::integer,
      (p_brewing->>'waterTemperatureC')::numeric,nullif(p_brewing->>'waterSource',''),
      nullif(p_brewing->>'vessel',''),(p_brewing->>'initialSteepSeconds')::integer
    ) on conflict(card_id) do update set
      leaf_grams=excluded.leaf_grams,
      water_ml=excluded.water_ml,
      water_temperature_c=excluded.water_temperature_c,
      water_source=excluded.water_source,
      vessel=excluded.vessel,
      initial_steep_seconds=excluded.initial_steep_seconds,
      updated_at=now()
    where brewing_setups.owner_user_id=v_owner_id;
  end if;

  if num_nonnulls(
    nullif(p_private_notes->>'firstImpression',''),
    nullif(p_private_notes->>'personalNotes','')
  )=0 then
    delete from public.tasting_card_private_notes where card_id=p_card_id and owner_user_id=v_owner_id;
  else
    insert into public.tasting_card_private_notes(card_id,owner_user_id,first_impression,personal_notes)
    values(
      p_card_id,v_owner_id,nullif(p_private_notes->>'firstImpression',''),
      nullif(p_private_notes->>'personalNotes','')
    ) on conflict(card_id) do update set
      first_impression=excluded.first_impression,
      personal_notes=excluded.personal_notes,
      updated_at=now()
    where tasting_card_private_notes.owner_user_id=v_owner_id;
  end if;

  delete from public.tasting_card_descriptors where card_id=p_card_id and owner_user_id=v_owner_id;
  insert into public.tasting_card_descriptors(card_id,descriptor_id,owner_user_id,position)
    select p_card_id,descriptor_id,v_owner_id,ordinality::integer
    from unnest(v_descriptor_ids) with ordinality as selected(descriptor_id,ordinality);

  if not v_created then
    update public.tasting_sessions set
      status=case when status='completed' then status else 'in_progress' end,
      revision=revision+1,
      updated_at=now()
    where id=p_session_id and owner_user_id=v_owner_id
    returning * into v_session;
  end if;

  insert into public.tea_lab_operations(id,owner_user_id,operation_type,target_id,request_fingerprint,result)
  values(
    p_operation_id,v_owner_id,'sync_session',p_session_id,v_fingerprint,
    jsonb_build_object('status',v_session.status,'session_revision',v_session.revision)
  );
  return v_session;
end $$;

create or replace function public.set_tasting_session_archived(
  p_session_id uuid,
  p_operation_id uuid,
  p_expected_revision integer,
  p_archived boolean
) returns public.tasting_sessions
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_owner_id uuid := auth.uid();
  v_session public.tasting_sessions;
  v_operation public.tea_lab_operations;
  v_fingerprint text := format('archive:%s:%s',p_expected_revision,p_archived);
begin
  if v_owner_id is null then raise exception 'tea_lab_authentication_required'; end if;
  if p_operation_id is null then raise exception 'tea_lab_invalid_operation_id'; end if;
  if p_expected_revision is null or p_expected_revision<1 then raise exception 'tea_lab_invalid_revision'; end if;
  if p_archived is null then raise exception 'tea_lab_invalid_archive_state'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_operation_id::text,0));

  select * into v_operation from public.tea_lab_operations
    where id=p_operation_id for update;
  if found then
    if v_operation.owner_user_id<>v_owner_id
      or v_operation.operation_type<>'archive_session'
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
  if v_session.revision<>p_expected_revision then raise exception 'tea_lab_stale_revision'; end if;

  update public.tasting_sessions set
    archived_at=case when p_archived then coalesce(archived_at,clock_timestamp()) else null end,
    revision=revision+1,
    updated_at=now()
  where id=p_session_id and owner_user_id=v_owner_id
  returning * into v_session;

  insert into public.tea_lab_operations(id,owner_user_id,operation_type,target_id,request_fingerprint,result)
  values(
    p_operation_id,v_owner_id,'archive_session',p_session_id,v_fingerprint,
    jsonb_build_object('archived',p_archived,'session_revision',v_session.revision)
  );
  return v_session;
end $$;

revoke all on function public.save_solo_tasting_session(uuid,uuid,uuid,integer,jsonb,jsonb,jsonb,jsonb,uuid[]) from public,anon;
grant execute on function public.save_solo_tasting_session(uuid,uuid,uuid,integer,jsonb,jsonb,jsonb,jsonb,uuid[]) to authenticated,service_role;
revoke all on function public.set_tasting_session_archived(uuid,uuid,integer,boolean) from public,anon;
grant execute on function public.set_tasting_session_archived(uuid,uuid,integer,boolean) to authenticated,service_role;

comment on function public.save_solo_tasting_session(uuid,uuid,uuid,integer,jsonb,jsonb,jsonb,jsonb,uuid[])
  is 'Owner-authenticated, revision-checked and idempotent save for one solo tasting card.';
comment on function public.set_tasting_session_archived(uuid,uuid,integer,boolean)
  is 'Owner-authenticated, revision-checked and idempotent archive or restore operation.';
