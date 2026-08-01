create or replace function public.save_event_bundle(p_event jsonb, p_flight jsonb)
returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_event_id uuid := nullif(p_event->>'id','')::uuid;
  saved_id uuid;
  flight_item jsonb;
  trivia jsonb;
  saved_flight_id uuid;
  event_slug text;
  event_invite text;
  position_no integer := 0;
begin
  if auth.uid() is null or not public.is_staff(auth.uid()) then raise exception 'not_authorized'; end if;
  if not exists(select 1 from public.profiles where id=(p_event->>'host_user_id')::uuid and role in ('host','admin')) then raise exception 'invalid_host'; end if;
  if nullif(p_event->>'backup_host_user_id','') is not null and not exists(select 1 from public.profiles where id=(p_event->>'backup_host_user_id')::uuid and role in ('host','admin')) then raise exception 'invalid_backup'; end if;
  if jsonb_typeof(p_flight) <> 'array' then raise exception 'invalid_flight'; end if;
  event_slug := coalesce(nullif(p_event->>'slug',''), lower(regexp_replace(p_event->>'title','[^a-zA-Z0-9]+','-','g')) || '-' || substr(encode(gen_random_bytes(4),'hex'),1,6));
  event_invite := coalesce(nullif(p_event->>'invite_code',''), upper(substr(encode(gen_random_bytes(6),'hex'),1,10)));

  if v_event_id is null then
    insert into public.events(title,slug,invite_code,status,location_mode,starts_at,timezone,capacity,venue_name,venue_address,video_call_url,owner_user_id,host_user_id,backup_host_user_id)
    values(
      trim(p_event->>'title'), event_slug, event_invite, coalesce((p_event->>'status')::public.event_status,'draft'),
      (p_event->>'location_mode')::public.location_mode, (p_event->>'starts_at')::timestamptz,
      coalesce(nullif(p_event->>'timezone',''),'America/Edmonton'), (p_event->>'capacity')::integer,
      nullif(p_event->>'venue_name',''), nullif(p_event->>'venue_address',''), nullif(p_event->>'video_call_url',''),
      auth.uid(), (p_event->>'host_user_id')::uuid, nullif(p_event->>'backup_host_user_id','')::uuid
    ) returning id into saved_id;
  else
    if not public.can_manage_event(v_event_id,auth.uid()) then raise exception 'not_authorized'; end if;
    if exists(select 1 from public.events e where e.id=v_event_id and e.status in ('live','completed','cancelled')) then raise exception 'event_locked'; end if;
    update public.events e set
      title=trim(p_event->>'title'), slug=event_slug, invite_code=event_invite,
      status=coalesce((p_event->>'status')::public.event_status,status), location_mode=(p_event->>'location_mode')::public.location_mode,
      starts_at=(p_event->>'starts_at')::timestamptz, timezone=coalesce(nullif(p_event->>'timezone',''),'America/Edmonton'),
      capacity=(p_event->>'capacity')::integer, venue_name=nullif(p_event->>'venue_name',''), venue_address=nullif(p_event->>'venue_address',''),
      video_call_url=nullif(p_event->>'video_call_url',''), host_user_id=(p_event->>'host_user_id')::uuid,
      backup_host_user_id=nullif(p_event->>'backup_host_user_id','')::uuid
    where e.id=v_event_id returning e.id into saved_id;
    delete from public.event_flight_items fi where fi.event_id=saved_id;
  end if;

  for flight_item in select value from jsonb_array_elements(p_flight) loop
    position_no := position_no + 1;
    insert into public.event_flight_items(event_id,tea_id,position,reveal_title,reveal_description,brewing_instructions,steep_seconds,temperature_c,leaf_grams,water_ml)
    values(
      saved_id, (flight_item->>'tea_id')::uuid, position_no,
      coalesce(nullif(flight_item->>'reveal_title',''), (select name from public.teas where id=(flight_item->>'tea_id')::uuid)),
      coalesce(flight_item->>'reveal_description',''), coalesce(flight_item->>'brewing_instructions',''),
      (flight_item->>'steep_seconds')::integer, nullif(flight_item->>'temperature_c','')::numeric,
      nullif(flight_item->>'leaf_grams','')::numeric, nullif(flight_item->>'water_ml','')::integer
    ) returning id into saved_flight_id;
    trivia := flight_item->'trivia';
    if trivia is not null and jsonb_typeof(trivia)='object' then
      insert into public.trivia_questions(event_flight_item_id,question,options,correct_index,explanation,answer_window_seconds)
      values(saved_flight_id, trivia->>'question', trivia->'options', (trivia->>'correct_index')::integer, nullif(trivia->>'explanation',''), coalesce((trivia->>'answer_window_seconds')::integer,20));
    end if;
  end loop;

  if (select count(*) from public.event_flight_items fi where fi.event_id=saved_id) > 0 then
    update public.events e set current_flight_item_id=(select fi.id from public.event_flight_items fi where fi.event_id=saved_id order by position limit 1) where id=saved_id;
  end if;
  if coalesce(p_event->>'status','draft')='scheduled' and exists(select 1 from public.event_readiness(saved_id) where not met) then raise exception 'not_ready'; end if;
  return saved_id;
end $$;
