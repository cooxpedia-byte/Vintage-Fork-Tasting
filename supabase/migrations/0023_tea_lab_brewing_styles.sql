-- Style-aware Tea Lab brewing records. Stage notes remain owner-private and read-only to customers.

alter table public.brewing_setups
  add column if not exists brewing_style text,
  add column if not exists preparation_notes text;

alter table public.brewing_setups
  drop constraint if exists brewing_setups_brewing_style_check,
  add constraint brewing_setups_brewing_style_check check (
    brewing_style is null or brewing_style in (
      'western','tea_bag','grandpa','bowl','gongfu','chaozhou_gongfu','sencha_kyusu','gyokuro',
      'matcha_usucha','matcha_koicha','cold_brew','flash_chilled','koridashi','masala_chai','karak_chai',
      'turkish_cay','moroccan_mint','samovar','kashmiri_kahwa','hong_kong_milk_tea','herbal_decoction','custom'
    )
  ),
  drop constraint if exists brewing_setups_preparation_notes_check,
  add constraint brewing_setups_preparation_notes_check check (
    preparation_notes is null or char_length(preparation_notes)<=1200
  );

create table public.tasting_card_brew_stages (
  card_id uuid not null,
  owner_user_id uuid not null,
  stage_number integer not null check (stage_number between 1 and 20),
  label text not null check (char_length(trim(label)) between 1 and 80),
  duration_seconds integer check (duration_seconds between 1 and 86400),
  temperature_c numeric(5,2) check (temperature_c between 0 and 100),
  notes text check (notes is null or char_length(notes)<=600),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (card_id,stage_number),
  foreign key (card_id,owner_user_id) references public.tasting_cards(id,owner_user_id) on delete cascade
);

create index tasting_card_brew_stages_owner_idx
  on public.tasting_card_brew_stages(owner_user_id,card_id,stage_number);

alter table public.tasting_card_brew_stages enable row level security;
revoke all on public.tasting_card_brew_stages from public,anon,authenticated;
grant select on public.tasting_card_brew_stages to authenticated;
grant all on public.tasting_card_brew_stages to service_role;

create policy tasting_card_brew_stages_owner_read on public.tasting_card_brew_stages
  for select to authenticated using (owner_user_id=auth.uid());

create or replace function public.save_solo_tasting_session_v2(
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
  v_style text := nullif(trim(p_brewing->>'style'),'');
  v_preparation_notes text := nullif(p_brewing->>'preparationNotes','');
  v_stages jsonb := coalesce(p_brewing->'stages','[]'::jsonb);
  v_stage jsonb;
  v_stage_number bigint;
  v_stage_count integer;
begin
  if v_owner_id is null then raise exception 'tea_lab_authentication_required'; end if;
  if coalesce(jsonb_typeof(p_brewing),'object')<>'object' then
    raise exception 'tea_lab_invalid_brewing';
  end if;
  if v_style is not null and v_style not in (
    'western','tea_bag','grandpa','bowl','gongfu','chaozhou_gongfu','sencha_kyusu','gyokuro',
    'matcha_usucha','matcha_koicha','cold_brew','flash_chilled','koridashi','masala_chai','karak_chai',
    'turkish_cay','moroccan_mint','samovar','kashmiri_kahwa','hong_kong_milk_tea','herbal_decoction','custom'
  ) then raise exception 'tea_lab_invalid_brewing_style'; end if;
  if v_preparation_notes is not null and char_length(v_preparation_notes)>1200 then
    raise exception 'tea_lab_invalid_brewing_notes';
  end if;
  if jsonb_typeof(v_stages)<>'array' then raise exception 'tea_lab_invalid_brew_stages'; end if;
  v_stage_count := jsonb_array_length(v_stages);
  if v_stage_count>20 then raise exception 'tea_lab_invalid_brew_stages'; end if;

  for v_stage,v_stage_number in
    select stage.value,stage.ordinality
    from jsonb_array_elements(v_stages) with ordinality as stage(value,ordinality)
  loop
    if jsonb_typeof(v_stage)<>'object'
      or nullif(trim(v_stage->>'label'),'') is null
      or char_length(trim(v_stage->>'label'))>80
      or (v_stage->>'notes') is not null and char_length(v_stage->>'notes')>600 then
      raise exception 'tea_lab_invalid_brew_stage';
    end if;
  end loop;

  -- The original operation owns revision checking, idempotency, tea snapshots, and core brew fields.
  -- Its request fingerprint already covers the complete p_brewing document, including v2 fields.
  v_session := public.save_solo_tasting_session(
    p_session_id,p_card_id,p_operation_id,p_expected_revision,p_tea,p_card,
    p_brewing,p_private_notes,p_descriptor_ids
  );

  if v_session.owner_user_id<>v_owner_id then raise exception 'tea_lab_session_not_found'; end if;

  if v_style is not null or v_preparation_notes is not null or v_stage_count>0 then
    insert into public.brewing_setups(card_id,owner_user_id,brewing_style,preparation_notes)
    values(p_card_id,v_owner_id,v_style,v_preparation_notes)
    on conflict(card_id) do update set
      brewing_style=excluded.brewing_style,
      preparation_notes=excluded.preparation_notes,
      updated_at=now()
    where brewing_setups.owner_user_id=v_owner_id;
  else
    update public.brewing_setups set
      brewing_style=null,
      preparation_notes=null,
      updated_at=now()
    where card_id=p_card_id and owner_user_id=v_owner_id;
  end if;

  delete from public.tasting_card_brew_stages
    where card_id=p_card_id and owner_user_id=v_owner_id;
  insert into public.tasting_card_brew_stages(
    card_id,owner_user_id,stage_number,label,duration_seconds,temperature_c,notes
  )
  select
    p_card_id,v_owner_id,stage.ordinality::integer,trim(stage.value->>'label'),
    nullif(stage.value->>'durationSeconds','')::integer,
    nullif(stage.value->>'temperatureC','')::numeric,
    nullif(stage.value->>'notes','')
  from jsonb_array_elements(v_stages) with ordinality as stage(value,ordinality);

  return v_session;
end $$;

revoke all on function public.save_solo_tasting_session_v2(uuid,uuid,uuid,integer,jsonb,jsonb,jsonb,jsonb,uuid[]) from public,anon;
grant execute on function public.save_solo_tasting_session_v2(uuid,uuid,uuid,integer,jsonb,jsonb,jsonb,jsonb,uuid[]) to authenticated,service_role;

comment on table public.tasting_card_brew_stages is
  'Owner-private, ordered stage notes for style-aware solo tasting records.';
comment on function public.save_solo_tasting_session_v2(uuid,uuid,uuid,integer,jsonb,jsonb,jsonb,jsonb,uuid[]) is
  'Atomically saves a solo tasting plus private, style-aware brewing stages.';
