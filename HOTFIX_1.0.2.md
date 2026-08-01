# Hotfix 1.0.2

Fixes two launch-blocking issues:

- Admin sessions expiring during event and tea saves. Admin writes now carry the current Supabase access token and retry session refresh before submitting.
- Event creation failures caused by `gen_random_bytes` schema lookup and ambiguous `event_id` references. Migration `0010_event_bundle_and_session_hardening.sql` replaces the database function safely.

After deploying the code, run `npx supabase db push --include-all` from this project folder to apply migration 0010.
