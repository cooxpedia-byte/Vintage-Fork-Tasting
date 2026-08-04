begin;

do $$
declare
  v_constraint record;
begin
  for v_constraint in
    select conname
    from pg_constraint
    where conrelid = 'public.tea_responses'::regclass
      and contype = 'c'
      and position('cardinality(descriptors)' in lower(pg_get_constraintdef(oid))) > 0
  loop
    execute format(
      'alter table public.tea_responses drop constraint %I',
      v_constraint.conname
    );
  end loop;
end;
$$;

alter table public.tea_responses
  add constraint tea_responses_descriptors_max_five
  check (cardinality(descriptors) <= 5);

do $$
declare
  v_definition text;
  v_signature regprocedure := 'public.save_solo_tasting_session(uuid,uuid,uuid,integer,jsonb,jsonb,jsonb,jsonb,uuid[])'::regprocedure;
begin
  select pg_get_functiondef(v_signature)
  into v_definition;

  if v_definition ~ 'v_descriptor_count[[:space:]]*>[[:space:]]*3' then
    v_definition := regexp_replace(
      v_definition,
      'v_descriptor_count[[:space:]]*>[[:space:]]*3',
      'v_descriptor_count>5',
      'g'
    );
    execute v_definition;
  elsif v_definition !~ 'v_descriptor_count[[:space:]]*>[[:space:]]*5' then
    raise exception 'Unexpected save_solo_tasting_session descriptor guard';
  end if;
end;
$$;

commit;
