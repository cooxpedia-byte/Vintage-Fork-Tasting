-- Keep aggregate views out of the public API. Server routes use service-role access.
revoke all on public.event_analytics from anon, authenticated;
grant select on public.event_analytics to service_role;

-- Anonymous guest rows are accessed only through event-scoped server APIs and secure cookies.
revoke all on public.participant_tokens from anon, authenticated;

-- Limit function execution to the intended callers.
revoke all on function public.join_event_guest(text,text,text,boolean,text,uuid) from public, anon, authenticated;
grant execute on function public.join_event_guest(text,text,text,boolean,text,uuid) to service_role;
revoke all on function public.save_event_bundle(jsonb,jsonb) from public, anon;
grant execute on function public.save_event_bundle(jsonb,jsonb) to authenticated, service_role;
revoke all on function public.acquire_host_control(uuid,boolean) from public, anon;
grant execute on function public.acquire_host_control(uuid,boolean) to authenticated;
revoke all on function public.heartbeat_host_control(uuid,uuid) from public, anon;
grant execute on function public.heartbeat_host_control(uuid,uuid) to authenticated;
revoke all on function public.apply_event_command(uuid,text,bigint,uuid) from public, anon;
grant execute on function public.apply_event_command(uuid,text,bigint,uuid) to authenticated;
