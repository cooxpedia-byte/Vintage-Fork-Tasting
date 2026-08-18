-- Tea discovery identity is a private journey record, not a palate score,
-- credential, loyalty balance, or community ranking.

create table public.discovery_identity_definitions (
  id uuid primary key,
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (char_length(trim(name)) between 3 and 80),
  description text not null check (char_length(trim(description)) between 10 and 240),
  emblem text not null check (emblem in ('compass','flower','leaf','garden','moon','map','story','mountain')),
  criteria_version integer not null check (criteria_version > 0),
  criteria jsonb not null check (jsonb_typeof(criteria)='object'),
  source_metrics_version text not null check (char_length(source_metrics_version) between 3 and 40),
  sort_order integer not null unique check (sort_order > 0),
  surprise boolean not null default false,
  active boolean not null default true,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((retired_at is null)=active)
);

create table public.user_discovery_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  identity_reveals_enabled boolean not null default true,
  social_profile_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_discovery_identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  identity_definition_id uuid not null references public.discovery_identity_definitions(id) on delete restrict,
  criteria_version integer not null check (criteria_version > 0),
  source_metrics_version text not null check (char_length(source_metrics_version) between 3 and 40),
  earned_at timestamptz not null default now(),
  earned_event_id uuid references public.events(id) on delete set null,
  evidence_summary text not null check (char_length(trim(evidence_summary)) between 10 and 600),
  evidence jsonb not null default '{}' check (jsonb_typeof(evidence)='object'),
  is_featured boolean not null default false,
  visibility text not null default 'private' check (visibility in ('private','event','public')),
  hidden_at timestamptz,
  last_confirmed_at timestamptz not null default now(),
  last_evaluated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,identity_definition_id),
  check (hidden_at is null or not is_featured)
);

create table public.discovery_identity_recalculations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  source_event_id uuid references public.events(id) on delete set null,
  source_metrics_version text not null,
  idempotency_key text not null unique,
  metrics jsonb not null check (jsonb_typeof(metrics)='object'),
  newly_earned_identity_ids uuid[] not null default '{}',
  recalculated_at timestamptz not null default now()
);

create index user_discovery_identities_profile_idx
  on public.user_discovery_identities(user_id,is_featured desc,hidden_at,earned_at desc);
create index discovery_identity_recalculations_user_idx
  on public.discovery_identity_recalculations(user_id,recalculated_at desc);

create trigger discovery_identity_definitions_touch before update on public.discovery_identity_definitions
  for each row execute function public.touch_updated_at();
create trigger user_discovery_profiles_touch before update on public.user_discovery_profiles
  for each row execute function public.touch_updated_at();
create trigger user_discovery_identities_touch before update on public.user_discovery_identities
  for each row execute function public.touch_updated_at();

insert into public.discovery_identity_definitions
  (id,slug,name,description,emblem,criteria_version,criteria,source_metrics_version,sort_order,surprise)
values
  ('39000000-0000-4000-8000-000000000001','curious-palate','Curious Palate','A field journal shaped by several different families of tea.','compass',1,
    '{"kind":"tea_type_breadth","minimum_types":3,"minimum_distinct_teas":4}','discovery-v1',1,false),
  ('39000000-0000-4000-8000-000000000002','origin-wanderer','Origin Wanderer','A tea journey that has crossed several growing places and traditions.','map',1,
    '{"kind":"origin_breadth","minimum_origins":3}','discovery-v1',2,false),
  ('39000000-0000-4000-8000-000000000003','oolong-adventurer','Oolong Adventurer','A continuing exploration of oolong teas in more than one cup.','mountain',1,
    '{"kind":"tea_type_depth","tea_type_pattern":"oolong","minimum_distinct_teas":3}','discovery-v1',3,false),
  ('39000000-0000-4000-8000-000000000004','green-tea-gardener','Green Tea Gardener','A growing collection of distinct green-tea encounters.','garden',1,
    '{"kind":"tea_type_depth","tea_type_pattern":"green","minimum_distinct_teas":3}','discovery-v1',4,false),
  ('39000000-0000-4000-8000-000000000005','black-tea-wayfarer','Black Tea Wayfarer','A path through several distinct black-tea stories.','leaf',1,
    '{"kind":"tea_type_depth","tea_type_pattern":"black","minimum_distinct_teas":3}','discovery-v1',5,false),
  ('39000000-0000-4000-8000-000000000006','night-garden-explorer','Night Garden Explorer','An interest in herbal, tisane and rooibos cups.','moon',1,
    '{"kind":"tea_type_group_depth","tea_type_patterns":["herbal","tisane","rooibos"],"minimum_distinct_teas":3}','discovery-v1',6,true),
  ('39000000-0000-4000-8000-000000000007','floral-explorer','Floral Explorer','Floral notes have appeared often in your own tasting journal.','flower',1,
    '{"kind":"descriptor_category_depth","descriptor_category":"Floral","minimum_distinct_teas":3}','discovery-v1',7,true),
  ('39000000-0000-4000-8000-000000000008','tea-story-collector','Tea Story Collector','A collection shaped through more than one live tasting table.','story',1,
    '{"kind":"live_event_history","minimum_live_events":2,"minimum_distinct_teas":3}','discovery-v1',8,false)
on conflict (id) do nothing;

-- One normalized, owner-scoped history stream joins released live cards with
-- completed Tea Lab cards. It intentionally contains no ratings, correctness,
-- consensus, chat, speaking, spokesperson, demographic, or loyalty data.
create or replace function public.authoritative_discovery_history(p_user_id uuid)
returns table(
  source_kind text,
  source_record_id uuid,
  source_event_id uuid,
  tea_key text,
  tea_name text,
  tea_type text,
  origin text,
  completed_at timestamptz,
  descriptor_categories text[]
)
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select
    'live'::text,
    response.id,
    event.id,
    'canonical:'||tea.id::text,
    tea.name,
    nullif(trim(tea.tea_type),''),
    nullif(trim(tea.origin),''),
    response.stamp_released_at,
    coalesce(observations.categories,'{}'::text[])
  from public.participants participant
  join public.tea_responses response on response.participant_id=participant.id
  join public.event_flight_items flight on flight.id=response.event_flight_item_id
  join public.events event on event.id=flight.event_id and event.id=participant.event_id
  join public.teas tea on tea.id=flight.tea_id
  left join lateral (
    select array_agg(distinct descriptor.category) as categories
    from unnest(coalesce(response.descriptors,'{}'::text[])) selected(value)
    join public.flavor_descriptors descriptor on
      lower(regexp_replace(trim(selected.value),'[[:space:]_/-]+',' ','g'))
        = lower(regexp_replace(trim(descriptor.label),'[[:space:]_/-]+',' ','g'))
      or exists (
        select 1 from unnest(descriptor.aliases) alias(value)
        where lower(regexp_replace(trim(alias.value),'[[:space:]_/-]+',' ','g'))
          = lower(regexp_replace(trim(selected.value),'[[:space:]_/-]+',' ','g'))
      )
  ) observations on true
  where participant.user_id=p_user_id
    and participant.status<>'removed'
    and event.status='completed'
    and response.completed_at is not null
    and response.stamp_released_at is not null

  union all

  select
    'solo'::text,
    card.id,
    null::uuid,
    case
      when card.canonical_tea_id is not null then 'canonical:'||card.canonical_tea_id::text
      else 'personal:'||card.personal_tea_record_id::text
    end,
    card.tea_name_snapshot,
    nullif(trim(card.tea_type_snapshot),''),
    nullif(trim(card.origin_snapshot),''),
    card.completed_at,
    coalesce(observations.categories,'{}'::text[])
  from public.tasting_cards card
  join public.tasting_sessions session on session.id=card.session_id and session.owner_user_id=card.owner_user_id
  left join lateral (
    select array_agg(distinct descriptor.category) as categories
    from public.tasting_card_descriptors selected
    join public.flavor_descriptors descriptor on descriptor.id=selected.descriptor_id
    where selected.card_id=card.id and selected.owner_user_id=card.owner_user_id
  ) observations on true
  where card.owner_user_id=p_user_id
    and session.status='completed'
    and card.completed_at is not null
$$;

create or replace function public.discovery_metrics_for_user(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  with history as (
    select * from public.authoritative_discovery_history(p_user_id)
  ), distinct_teas as (
    select distinct on (tea_key) tea_key,tea_name,tea_type,origin,completed_at
    from history order by tea_key,completed_at desc
  ), type_counts as (
    select lower(tea_type) as label,count(*)::integer as value
    from distinct_teas where tea_type is not null group by lower(tea_type)
  ), descriptor_counts as (
    select category,count(distinct history.tea_key)::integer as value
    from history cross join lateral unnest(history.descriptor_categories) category
    group by category
  )
  select jsonb_build_object(
    'teas_explored',(select count(*) from distinct_teas),
    'tea_type_count',(select count(*) from type_counts),
    'origin_count',(select count(distinct lower(origin)) from distinct_teas where origin is not null),
    'live_tastings_completed',(select count(distinct source_event_id) from history where source_event_id is not null),
    'tea_type_distribution',coalesce((select jsonb_object_agg(label,value order by label) from type_counts),'{}'::jsonb),
    'origins',coalesce((select jsonb_agg(origin order by origin) from (select distinct origin from distinct_teas where origin is not null) found),'[]'::jsonb),
    'descriptor_family_distribution',coalesce((select jsonb_object_agg(category,value order by category) from descriptor_counts),'{}'::jsonb),
    'source_metrics_version','discovery-v1'
  )
$$;

create or replace function public.recalculate_discovery_identities(
  p_user_id uuid,
  p_source_event_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  definition record;
  metrics jsonb;
  identity_id uuid;
  newly_earned uuid[] := '{}';
  qualifies boolean;
  distinct_count integer;
  secondary_count integer;
  v_evidence_summary text;
  related_teas jsonb;
  v_evidence jsonb;
  criteria_kind text;
  idempotency text;
begin
  if p_user_id is null or not exists(select 1 from public.profiles where id=p_user_id) then
    raise exception 'discovery_user_unavailable';
  end if;
  if p_source_event_id is not null and not exists(select 1 from public.events where id=p_source_event_id and status='completed') then
    raise exception 'discovery_event_incomplete';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text,39));
  insert into public.user_discovery_profiles(user_id) values(p_user_id) on conflict(user_id) do nothing;
  metrics:=public.discovery_metrics_for_user(p_user_id);

  for definition in
    select * from public.discovery_identity_definitions where active order by sort_order
  loop
    qualifies:=false;
    distinct_count:=0;
    secondary_count:=0;
    related_teas:='[]'::jsonb;
    criteria_kind:=definition.criteria->>'kind';

    if criteria_kind='tea_type_breadth' then
      distinct_count:=(metrics->>'teas_explored')::integer;
      secondary_count:=(metrics->>'tea_type_count')::integer;
      qualifies:=distinct_count>=(definition.criteria->>'minimum_distinct_teas')::integer
        and secondary_count>=(definition.criteria->>'minimum_types')::integer;
      v_evidence_summary:=format('You have explored %s distinct teas across %s tea types.',distinct_count,secondary_count);
    elsif criteria_kind='origin_breadth' then
      distinct_count:=(metrics->>'origin_count')::integer;
      qualifies:=distinct_count>=(definition.criteria->>'minimum_origins')::integer;
      v_evidence_summary:=format('Your tasting history includes %s distinct growing origins.',distinct_count);
    elsif criteria_kind='tea_type_depth' then
      select count(distinct history.tea_key) into distinct_count
      from public.authoritative_discovery_history(p_user_id) history
      where lower(coalesce(history.tea_type,'')) like '%'||lower(definition.criteria->>'tea_type_pattern')||'%';
      qualifies:=distinct_count>=(definition.criteria->>'minimum_distinct_teas')::integer;
      v_evidence_summary:=format('You have recorded %s distinct %s tea%s.',distinct_count,definition.criteria->>'tea_type_pattern',case when distinct_count=1 then '' else 's' end);
    elsif criteria_kind='tea_type_group_depth' then
      select count(distinct history.tea_key) into distinct_count
      from public.authoritative_discovery_history(p_user_id) history
      where exists (
        select 1 from jsonb_array_elements_text(definition.criteria->'tea_type_patterns') pattern(value)
        where lower(coalesce(history.tea_type,'')) like '%'||lower(pattern.value)||'%'
      );
      qualifies:=distinct_count>=(definition.criteria->>'minimum_distinct_teas')::integer;
      v_evidence_summary:=format('You have recorded %s distinct herbal, tisane or rooibos cups.',distinct_count);
    elsif criteria_kind='descriptor_category_depth' then
      select count(distinct history.tea_key) into distinct_count
      from public.authoritative_discovery_history(p_user_id) history
      where (definition.criteria->>'descriptor_category')=any(history.descriptor_categories);
      qualifies:=distinct_count>=(definition.criteria->>'minimum_distinct_teas')::integer;
      v_evidence_summary:=format('%s notes have appeared in your own journal across %s distinct tea%s.',definition.criteria->>'descriptor_category',distinct_count,case when distinct_count=1 then '' else 's' end);
    elsif criteria_kind='live_event_history' then
      select count(distinct history.source_event_id),count(distinct history.tea_key)
      into secondary_count,distinct_count
      from public.authoritative_discovery_history(p_user_id) history
      where history.source_event_id is not null;
      qualifies:=secondary_count>=(definition.criteria->>'minimum_live_events')::integer
        and distinct_count>=(definition.criteria->>'minimum_distinct_teas')::integer;
      v_evidence_summary:=format('You have completed tasting cards for %s teas across %s live tasting tables.',distinct_count,secondary_count);
    else
      raise exception 'discovery_unknown_criteria_kind';
    end if;

    select coalesce(jsonb_agg(jsonb_build_object(
      'teaKey',recent.tea_key,'teaName',recent.tea_name,'origin',recent.origin,
      'completedAt',recent.completed_at,'source',recent.source_kind
    ) order by recent.completed_at desc),'[]'::jsonb)
    into related_teas
    from (
      select distinct on (history.tea_key)
        history.tea_key,history.tea_name,history.origin,history.completed_at,history.source_kind
      from public.authoritative_discovery_history(p_user_id) history
      where
        criteria_kind in ('tea_type_breadth','origin_breadth')
        or (criteria_kind='live_event_history' and history.source_event_id is not null)
        or (criteria_kind='tea_type_depth' and lower(coalesce(history.tea_type,'')) like '%'||lower(definition.criteria->>'tea_type_pattern')||'%')
        or (criteria_kind='tea_type_group_depth' and exists(
          select 1 from jsonb_array_elements_text(definition.criteria->'tea_type_patterns') pattern(value)
          where lower(coalesce(history.tea_type,'')) like '%'||lower(pattern.value)||'%'
        ))
        or (criteria_kind='descriptor_category_depth' and (definition.criteria->>'descriptor_category')=any(history.descriptor_categories))
      order by history.tea_key,history.completed_at desc
    ) recent;
    related_teas:=coalesce((select jsonb_agg(item) from (select item from jsonb_array_elements(related_teas) item limit 6) limited),'[]'::jsonb);

    v_evidence:=jsonb_build_object(
      'currentlyConfirmed',qualifies,
      'contributingTeaCount',distinct_count,
      'secondaryCount',secondary_count,
      'relatedTeas',related_teas,
      'criteria',definition.criteria,
      'criteriaVersion',definition.criteria_version,
      'sourceMetricsVersion',definition.source_metrics_version,
      'calculatedAt',clock_timestamp()
    );

    select earned.id into identity_id
    from public.user_discovery_identities earned
    where earned.user_id=p_user_id and earned.identity_definition_id=definition.id;

    if qualifies then
      if identity_id is null then
        insert into public.user_discovery_identities(
          user_id,identity_definition_id,criteria_version,source_metrics_version,
          earned_event_id,evidence_summary,evidence
        ) values(
          p_user_id,definition.id,definition.criteria_version,definition.source_metrics_version,
          p_source_event_id,v_evidence_summary,v_evidence
        ) returning id into identity_id;
        newly_earned:=array_append(newly_earned,identity_id);
      else
        update public.user_discovery_identities set
          evidence_summary=v_evidence_summary,
          evidence=v_evidence,
          last_confirmed_at=clock_timestamp(),
          last_evaluated_at=clock_timestamp()
        where id=identity_id;
      end if;
    elsif identity_id is not null then
      -- Earned identity stays in the collection; corrected history only changes
      -- its transparent current-confirmation state.
      update public.user_discovery_identities set
        evidence_summary=v_evidence_summary,
        evidence=v_evidence,
        last_evaluated_at=clock_timestamp()
      where id=identity_id;
    end if;
  end loop;

  idempotency:=case when p_source_event_id is not null
    then format('event:%s:user:%s:discovery-v1',p_source_event_id,p_user_id)
    else format('profile:%s:day:%s:discovery-v1',p_user_id,current_date)
  end;
  insert into public.discovery_identity_recalculations as audit(
    user_id,source_event_id,source_metrics_version,idempotency_key,metrics,newly_earned_identity_ids
  ) values(p_user_id,p_source_event_id,'discovery-v1',idempotency,metrics,newly_earned)
  on conflict(idempotency_key) do update set
    metrics=excluded.metrics,
    newly_earned_identity_ids=case
      when cardinality(audit.newly_earned_identity_ids)>0
        then audit.newly_earned_identity_ids
      else excluded.newly_earned_identity_ids
    end,
    recalculated_at=clock_timestamp();

  return jsonb_build_object('metrics',metrics,'newIdentityIds',to_jsonb(newly_earned));
end $$;

create or replace function public.set_my_discovery_identity_preferences(
  p_identity_id uuid,
  p_featured boolean,
  p_hidden boolean
) returns public.user_discovery_identities
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  owner_id uuid:=auth.uid();
  target public.user_discovery_identities;
begin
  if owner_id is null then raise exception 'discovery_authentication_required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner_id::text,39));
  select * into target from public.user_discovery_identities
    where id=p_identity_id and user_id=owner_id for update;
  if not found then raise exception 'discovery_identity_unavailable'; end if;
  if p_featured and not p_hidden and (
    select count(*) from public.user_discovery_identities
    where user_id=owner_id and id<>p_identity_id and is_featured and hidden_at is null
  )>=2 then raise exception 'discovery_feature_limit'; end if;

  update public.user_discovery_identities set
    is_featured=case when p_hidden then false else p_featured end,
    hidden_at=case when p_hidden then coalesce(hidden_at,clock_timestamp()) else null end,
    visibility='private'
  where id=p_identity_id and user_id=owner_id
  returning * into target;
  return target;
end $$;

create or replace function public.set_my_discovery_reveal_preference(p_enabled boolean)
returns public.user_discovery_profiles
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare result public.user_discovery_profiles;
begin
  if auth.uid() is null then raise exception 'discovery_authentication_required'; end if;
  insert into public.user_discovery_profiles(user_id,identity_reveals_enabled)
  values(auth.uid(),p_enabled)
  on conflict(user_id) do update set identity_reveals_enabled=excluded.identity_reveals_enabled
  returning * into result;
  return result;
end $$;

alter table public.discovery_identity_definitions enable row level security;
alter table public.user_discovery_profiles enable row level security;
alter table public.user_discovery_identities enable row level security;
alter table public.discovery_identity_recalculations enable row level security;

create policy discovery_identity_definitions_authenticated_read on public.discovery_identity_definitions
  for select to authenticated using (true);
create policy user_discovery_profiles_owner_read on public.user_discovery_profiles
  for select to authenticated using (user_id=auth.uid());
create policy user_discovery_identities_owner_read on public.user_discovery_identities
  for select to authenticated using (user_id=auth.uid());

revoke all on public.discovery_identity_definitions from public,anon,authenticated;
revoke all on public.user_discovery_profiles from public,anon,authenticated;
revoke all on public.user_discovery_identities from public,anon,authenticated;
revoke all on public.discovery_identity_recalculations from public,anon,authenticated;
grant select on public.discovery_identity_definitions to authenticated;
grant select on public.user_discovery_profiles to authenticated;
grant select on public.user_discovery_identities to authenticated;
grant all on public.discovery_identity_definitions to service_role;
grant all on public.user_discovery_profiles to service_role;
grant all on public.user_discovery_identities to service_role;
grant all on public.discovery_identity_recalculations to service_role;

revoke all on function public.authoritative_discovery_history(uuid) from public,anon,authenticated;
revoke all on function public.discovery_metrics_for_user(uuid) from public,anon,authenticated;
revoke all on function public.recalculate_discovery_identities(uuid,uuid) from public,anon,authenticated;
grant execute on function public.authoritative_discovery_history(uuid) to service_role;
grant execute on function public.discovery_metrics_for_user(uuid) to service_role;
grant execute on function public.recalculate_discovery_identities(uuid,uuid) to service_role;
revoke all on function public.set_my_discovery_identity_preferences(uuid,boolean,boolean) from public,anon;
revoke all on function public.set_my_discovery_reveal_preference(boolean) from public,anon;
grant execute on function public.set_my_discovery_identity_preferences(uuid,boolean,boolean) to authenticated,service_role;
grant execute on function public.set_my_discovery_reveal_preference(boolean) to authenticated,service_role;

comment on table public.discovery_identity_definitions is
  'Versioned, non-hierarchical journey identities. Never credentials, scores, ranks, or Gold Leaves.';
comment on function public.authoritative_discovery_history(uuid) is
  'Owner-scoped discovery evidence from completed live and solo tasting cards; private notes and social activity are excluded.';
comment on function public.recalculate_discovery_identities(uuid,uuid) is
  'Service-only, auditable identity calculation that never silently revokes an earned journey identity.';
