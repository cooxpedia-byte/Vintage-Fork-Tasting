-- Owner-protected personal-tea Library archive and restore operation.

alter table public.tea_lab_operations
  drop constraint if exists tea_lab_operations_operation_type_check;
alter table public.tea_lab_operations
  add constraint tea_lab_operations_operation_type_check
  check (operation_type in ('sync_session','complete_session','archive_session','delete_session','archive_personal_tea'));

create or replace function public.set_personal_tea_record_archived(
  p_personal_tea_id uuid,
  p_operation_id uuid,
  p_archived boolean
) returns public.personal_tea_records
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_owner_id uuid := auth.uid();
  v_tea public.personal_tea_records;
  v_operation public.tea_lab_operations;
  v_fingerprint text := format('archive_personal_tea:%s',p_archived);
begin
  if v_owner_id is null then raise exception 'tea_lab_authentication_required'; end if;
  if p_personal_tea_id is null or p_operation_id is null then raise exception 'tea_lab_invalid_operation_id'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_operation_id::text,0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_personal_tea_id::text,1));

  select * into v_operation from public.tea_lab_operations
    where id=p_operation_id for update;
  if found then
    if v_operation.owner_user_id<>v_owner_id
      or v_operation.operation_type<>'archive_personal_tea'
      or v_operation.target_id<>p_personal_tea_id
      or v_operation.request_fingerprint<>v_fingerprint then
      raise exception 'tea_lab_idempotency_conflict';
    end if;
    select * into v_tea from public.personal_tea_records
      where id=p_personal_tea_id and owner_user_id=v_owner_id;
    if not found then raise exception 'tea_lab_personal_tea_not_found'; end if;
    return v_tea;
  end if;

  select * into v_tea from public.personal_tea_records
    where id=p_personal_tea_id and owner_user_id=v_owner_id for update;
  if not found then raise exception 'tea_lab_personal_tea_not_found'; end if;

  update public.personal_tea_records set
    archived_at=case when p_archived then coalesce(archived_at,clock_timestamp()) else null end,
    updated_at=now()
  where id=p_personal_tea_id and owner_user_id=v_owner_id
  returning * into v_tea;

  insert into public.tea_lab_operations(id,owner_user_id,operation_type,target_id,request_fingerprint,result)
  values(
    p_operation_id,v_owner_id,'archive_personal_tea',p_personal_tea_id,v_fingerprint,
    jsonb_build_object('archived',p_archived)
  );
  return v_tea;
end $$;

revoke all on function public.set_personal_tea_record_archived(uuid,uuid,boolean) from public,anon;
grant execute on function public.set_personal_tea_record_archived(uuid,uuid,boolean) to authenticated,service_role;

comment on function public.set_personal_tea_record_archived(uuid,uuid,boolean)
  is 'Owner-authenticated and idempotent archive or restore operation for a private personal tea record.';
