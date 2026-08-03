-- Supabase installs pgcrypto in the trusted extensions schema. Keep the
-- security-definer function's search path explicit so digest() resolves in
-- hosted environments without making any customer-writable schema trusted.

alter function public.save_solo_tasting_session(
  uuid,uuid,uuid,integer,jsonb,jsonb,jsonb,jsonb,uuid[]
) set search_path=public,extensions,pg_temp;

comment on function public.save_solo_tasting_session(uuid,uuid,uuid,integer,jsonb,jsonb,jsonb,jsonb,uuid[])
  is 'Owner-authenticated, revision-checked and idempotent save for one solo tasting card; pgcrypto resolves from the trusted extensions schema.';
