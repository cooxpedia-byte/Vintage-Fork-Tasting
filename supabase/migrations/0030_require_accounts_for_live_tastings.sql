-- Every live-tasting seat belongs to a signed-in Vintage Fork account.
-- The nullable parameter remains in the signature for compatibility with the
-- existing server call, but anonymous joins are rejected at the database edge.
create or replace function public.join_event_guest(
  p_invite_code text,
  p_display_name text,
  p_email text,
  p_marketing_consent boolean,
  p_token_hash text,
  p_user_id uuid default null
) returns table(participant_id uuid, event_id uuid, phase public.session_phase, sequence_number bigint)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  event_row public.events;
  participant_row public.participants;
  joined_count integer;
begin
  if p_user_id is null then raise exception 'account_required'; end if;

  select events_row.* into event_row
  from public.events as events_row
  where upper(events_row.invite_code)=upper(trim(p_invite_code))
  for update;

  if event_row.id is null then raise exception 'invite_invalid'; end if;
  if event_row.status='cancelled' then raise exception 'event_cancelled'; end if;
  if event_row.status not in ('scheduled','live') then raise exception 'event_not_open'; end if;

  select count(*) into joined_count
  from public.participants as joined_participant
  where joined_participant.event_id=event_row.id
    and joined_participant.status not in ('left','removed');

  select existing_participant.* into participant_row
  from public.participants as existing_participant
  where existing_participant.event_id=event_row.id
    and existing_participant.user_id=p_user_id
  for update;

  if participant_row.id is null and joined_count >= event_row.capacity then raise exception 'event_full'; end if;

  if participant_row.id is null then
    insert into public.participants(
      event_id,user_id,display_name,email,marketing_consent,status,
      joined_at,last_seen_at,recap_claimed_at,delete_after
    ) values(
      event_row.id,
      p_user_id,
      trim(p_display_name),
      nullif(lower(trim(p_email)),''),
      null,
      case when event_row.status='live' and event_row.phase<>'lobby' then 'admitted'::public.participant_status else 'waiting'::public.participant_status end,
      now(),
      now(),
      now(),
      null
    ) returning * into participant_row;
  else
    update public.participants as existing_participant set
      display_name=trim(p_display_name),
      email=coalesce(nullif(lower(trim(p_email)),''),existing_participant.email),
      marketing_consent=existing_participant.marketing_consent,
      status=case when event_row.status='live' and event_row.phase<>'lobby' then 'admitted'::public.participant_status else 'waiting'::public.participant_status end,
      joined_at=coalesce(existing_participant.joined_at,now()),
      last_seen_at=now(),
      recap_claimed_at=coalesce(existing_participant.recap_claimed_at,now()),
      delete_after=null
    where existing_participant.id=participant_row.id
    returning existing_participant.* into participant_row;
  end if;

  insert into public.participant_tokens(participant_id,token_hash,expires_at)
  values(
    participant_row.id,
    p_token_hash,
    coalesce(event_row.completed_at,greatest(event_row.starts_at,now()))+interval '90 days'
  )
  on conflict on constraint participant_tokens_pkey do update set
    token_hash=excluded.token_hash,
    expires_at=excluded.expires_at,
    created_at=now();

  return query select participant_row.id,event_row.id,event_row.phase,event_row.sequence_number;
end $$;

revoke all on function public.join_event_guest(text,text,text,boolean,text,uuid) from public,anon,authenticated;
grant execute on function public.join_event_guest(text,text,text,boolean,text,uuid) to service_role;

-- Earlier account-linked seats inherited the anonymous 90-day deletion date.
-- Preserve those existing tasting responses and released cards as well.
update public.participants
set delete_after=null,
    recap_claimed_at=coalesce(recap_claimed_at,now())
where user_id is not null
  and delete_after is not null;
