# Hotfix 1.0.3

- Fixes Next.js TypeScript build failure in authenticated admin API routes where Supabase profile rows were inferred as `never`.
- Adds explicit runtime-safe profile role typing in event, tea, and media API routes.
- Retains all fixes from 1.0.2, including authenticated writes and migration 0010.
