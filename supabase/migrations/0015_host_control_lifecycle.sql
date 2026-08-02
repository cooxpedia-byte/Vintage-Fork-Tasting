-- Host control exists only while a scheduled or live event can be operated.
-- Reloading or opening a second tab for the current holder reuses the active
-- lease instead of rotating its token and disabling the original console.
create or replace function public.acquire_host_control(p_event_id uuid, p_force boolean default false)
returns public.host_control_leases
language plpgsql security definer set search_path = public as $$
declare
  existing public.host_control_leases;
  result public.host_control_leases;
  e public.events;
  actor_role public.user_role;
begin
  if auth.uid() is null or not public.can_manage_event(p_event_id, auth.uid()) then
    raise exception 'not_authorized';
  end if;

  select * into e from public.events where id=p_event_id;
  if e.id is null then raise exception 'event_not_found'; end if;
  if e.status not in ('scheduled','live') or e.phase='ended' then
    raise exception 'event_not_controllable';
  end if;

  select role into actor_role from public.profiles where id=auth.uid();
  select * into existing from public.host_control_leases where event_id=p_event_id for update;

  if existing.event_id is not null and existing.expires_at > now() then
    if existing.holder_user_id=auth.uid() then
      update public.host_control_leases
      set heartbeat_at=now(),expires_at=now()+interval '45 seconds',updated_at=now()
      where event_id=p_event_id
      returning * into result;
      return result;
    end if;
    if not p_force then raise exception 'control_held'; end if;
    if existing.heartbeat_at > now()-interval '15 seconds' then raise exception 'control_healthy'; end if;
    if actor_role <> 'admin' and auth.uid() <> e.backup_host_user_id then raise exception 'not_authorized'; end if;
  end if;

  insert into public.host_control_leases(event_id,holder_user_id,lease_token,expires_at,heartbeat_at)
  values(p_event_id,auth.uid(),gen_random_uuid(),now()+interval '45 seconds',now())
  on conflict(event_id) do update set
    holder_user_id=excluded.holder_user_id,
    lease_token=excluded.lease_token,
    expires_at=excluded.expires_at,
    heartbeat_at=excluded.heartbeat_at,
    updated_at=now()
  returning * into result;

  return result;
end $$;

revoke all on function public.acquire_host_control(uuid,boolean) from public,anon;
grant execute on function public.acquire_host_control(uuid,boolean) to authenticated;
