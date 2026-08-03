-- Participant-scoped recap delivery and accountless deletion controls.

create table public.recap_email_deliveries (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  recipient_email text not null check (char_length(recipient_email) between 3 and 254),
  status text not null default 'queued' check (status in ('queued','sent','failed')),
  attempt_number smallint not null check (attempt_number between 1 and 4),
  provider_message_id text,
  error_code text,
  requested_at timestamptz not null default now(),
  completed_at timestamptz
);
create index recap_email_deliveries_participant_requested_idx
  on public.recap_email_deliveries(participant_id,requested_at desc);

create table public.participant_deletion_tokens (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index participant_deletion_tokens_participant_idx
  on public.participant_deletion_tokens(participant_id,expires_at desc);

alter table public.recap_email_deliveries enable row level security;
alter table public.participant_deletion_tokens enable row level security;
revoke all on public.recap_email_deliveries from public,anon,authenticated;
revoke all on public.participant_deletion_tokens from public,anon,authenticated;
grant all on public.recap_email_deliveries to service_role;
grant all on public.participant_deletion_tokens to service_role;

create or replace function public.reserve_recap_email_delivery(
  p_participant_id uuid,
  p_recipient_email text
) returns table(delivery_id uuid,attempts_remaining integer)
language plpgsql security definer set search_path=public as $$
declare
  participant_event_id uuid;
  attempts_used integer;
  reserved_id uuid;
begin
  select p.event_id into participant_event_id
  from public.participants p
  where p.id=p_participant_id
  for update;

  if participant_event_id is null then raise exception 'participant_not_found'; end if;

  select count(*)::integer into attempts_used
  from public.recap_email_deliveries d
  where d.participant_id=p_participant_id
    and d.requested_at>now()-interval '24 hours';

  if attempts_used>=4 then raise exception 'recap_email_limit'; end if;

  insert into public.recap_email_deliveries(
    participant_id,event_id,recipient_email,attempt_number
  ) values (
    p_participant_id,participant_event_id,lower(trim(p_recipient_email)),attempts_used+1
  ) returning id into reserved_id;

  return query select reserved_id,3-attempts_used;
end $$;

revoke all on function public.reserve_recap_email_delivery(uuid,text) from public,anon,authenticated;
grant execute on function public.reserve_recap_email_delivery(uuid,text) to service_role;
