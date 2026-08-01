create or replace function public.join_event_guest(
  p_invite_code text,
  p_display_name text,
  p_email text,
  p_marketing_consent boolean,
  p_token_hash text,
  p_user_id uuid default null
) returns table(participant_id uuid, event_id uuid, phase public.session_phase, sequence_number bigint)
language plpgsql security definer set search_path = public as $$
declare e public.events; p public.participants; joined_count integer;
begin
  select * into e from public.events where upper(invite_code)=upper(trim(p_invite_code)) for update;
  if e.id is null then raise exception 'invite_invalid'; end if;
  if e.status='cancelled' then raise exception 'event_cancelled'; end if;
  if e.status not in ('scheduled','live') then raise exception 'event_not_open'; end if;
  select count(*) into joined_count from public.participants where event_id=e.id and status not in ('left','removed');

  if p_user_id is not null then
    select * into p from public.participants where event_id=e.id and user_id=p_user_id for update;
  end if;
  if p.id is null and joined_count >= e.capacity then raise exception 'event_full'; end if;

  if p.id is null then
    insert into public.participants(event_id,user_id,display_name,email,marketing_consent,status,joined_at,last_seen_at,delete_after)
    values(e.id,p_user_id,trim(p_display_name),nullif(lower(trim(p_email)),''),case when nullif(trim(p_email),'') is null then null else p_marketing_consent end,
      case when e.status='live' and e.phase<>'lobby' then 'admitted'::public.participant_status else 'waiting'::public.participant_status end,
      now(),now(),coalesce(e.completed_at,greatest(e.starts_at,now()))+interval '90 days') returning * into p;
  else
    update public.participants set display_name=trim(p_display_name), email=coalesce(nullif(lower(trim(p_email)),''),email),
      marketing_consent=case when nullif(trim(p_email),'') is null then marketing_consent else p_marketing_consent end,
      status=case when e.status='live' and e.phase<>'lobby' then 'admitted'::public.participant_status else 'waiting'::public.participant_status end,
      joined_at=coalesce(joined_at,now()),last_seen_at=now() where id=p.id returning * into p;
  end if;

  insert into public.participant_tokens(participant_id,token_hash,expires_at)
  values(p.id,p_token_hash,coalesce(e.completed_at,greatest(e.starts_at,now()))+interval '90 days')
  on conflict(participant_id) do update set token_hash=excluded.token_hash,expires_at=excluded.expires_at,created_at=now();

  return query select p.id,e.id,e.phase,e.sequence_number;
end $$;
