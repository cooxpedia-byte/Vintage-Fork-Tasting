begin;

-- The protected save function and customer UI accept up to five descriptors,
-- but the original ordered-link constraint still capped positions at three.
-- Replace any legacy position check defensively so existing hosted projects
-- converge even if PostgreSQL generated a different constraint name.
do $$
declare
  v_constraint record;
begin
  for v_constraint in
    select conname
    from pg_constraint
    where conrelid = 'public.tasting_card_descriptors'::regclass
      and contype = 'c'
      and position('position' in lower(pg_get_constraintdef(oid))) > 0
  loop
    execute format(
      'alter table public.tasting_card_descriptors drop constraint %I',
      v_constraint.conname
    );
  end loop;
end;
$$;

alter table public.tasting_card_descriptors
  add constraint tasting_card_descriptors_position_max_five
  check (position between 1 and 5) not valid;

alter table public.tasting_card_descriptors
  validate constraint tasting_card_descriptors_position_max_five;

commit;
