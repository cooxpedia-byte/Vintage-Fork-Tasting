-- Private photos captured during a solo Tea Lab tasting.

create table public.tasting_card_photos (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null,
  owner_user_id uuid not null,
  storage_path text not null unique,
  content_type text not null check (content_type in ('image/jpeg','image/png','image/webp')),
  size_bytes integer not null check (size_bytes between 1 and 8388608),
  upload_status text not null default 'uploading' check (upload_status in ('uploading','ready')),
  alt_text text check (alt_text is null or char_length(trim(alt_text)) between 1 and 240),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tasting_card_photos_card_owner_fk foreign key(card_id,owner_user_id)
    references public.tasting_cards(id,owner_user_id) on delete cascade,
  constraint tasting_card_photos_owner_path_check check (
    storage_path like owner_user_id::text || '/' || card_id::text || '/' || id::text || '.%'
  )
);

create index tasting_card_photos_owner_card_idx
  on public.tasting_card_photos(owner_user_id,card_id,created_at);

create trigger tasting_card_photos_touch before update on public.tasting_card_photos
  for each row execute function public.touch_updated_at();

create or replace function public.enforce_tasting_card_photo_limit()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_count integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.card_id::text,0));
  select count(*) into v_count
    from public.tasting_card_photos
    where card_id=new.card_id and owner_user_id=new.owner_user_id;
  if v_count >= 6 then raise exception 'tea_lab_photo_limit_reached'; end if;
  return new;
end $$;

create trigger tasting_card_photos_limit before insert on public.tasting_card_photos
  for each row execute function public.enforce_tasting_card_photo_limit();

alter table public.tasting_card_photos enable row level security;

create policy tasting_card_photos_owner_read on public.tasting_card_photos
  for select to authenticated using (owner_user_id=auth.uid());

revoke all on public.tasting_card_photos from public,anon,authenticated;
grant select on public.tasting_card_photos to authenticated;
grant all on public.tasting_card_photos to service_role;

revoke all on function public.enforce_tasting_card_photo_limit() from public,anon,authenticated;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values (
  'tea-lab-photos',
  'tea-lab-photos',
  false,
  8388608,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update set
  public=false,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

comment on table public.tasting_card_photos
  is 'Owner-private photo metadata for solo Tea Lab cards. Objects are accessed only through short-lived signed URLs.';
