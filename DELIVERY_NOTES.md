# Delivery notes

## Completed in this package

- Consolidated Next.js application with the four required connected surfaces.
- Eleven ordered Supabase migrations covering schema, RLS, Realtime, host lease, state transitions, privacy boundaries, reveal timing and database integrity.
- Admin event and tea-library workflows, live host console, guest session and customer dashboard.
- Deployment, QA, recovery, retention and operating documentation.
- Original prototypes retained under `public/reference/` for parity review.
- Dependency versions pinned in `package.json` rather than broad application-runtime ranges.

## Validation performed in this environment

- Installed the pinned dependency graph and committed `package-lock.json`.
- `npm run typecheck`, `npm run lint`, `npm run test` and `npm run build` pass.
- Four state-transition unit tests pass.
- Production dependency audit reports zero known vulnerabilities.
- `package.json` is valid and all eleven migrations are uniquely numbered and contiguous.
- The production build generates all 27 page/API routes successfully.

See `VALIDATION_REPORT.md` for the exact checks and limits.

## Credential-bound validation still required

Apply the migrations to a staging Supabase project and run the multi-browser scenarios in `QA_CHECKLIST.md`. Production deployment still requires the owner’s Supabase, Vercel and DNS credentials.

## Approved brand asset

The approved Vintage Fork mark is tracked at `public/brand/vintage-fork-icon.jpg` and is rendered through the shared `Brand` component. Preserve its clear space and do not recolour, crop or animate it.

## Feature-gated Tea Lab extension

The workspace now also contains the Tea Lab Solo Tasting MVP delivered through additive migrations `0018`–`0022`. It includes the four-step solo flow, owner-namespaced IndexedDB recovery, idempotent synchronization, unified Journal, private Library, source-qualified Passport seals, archive/restore, permanent deletion, private tasting photos, hosted Supabase pgcrypto compatibility and fail-closed release controls.

This extension is code-complete but not authorized for production activation. A focused staging photo/card scenario has passed, but the full eleven-scenario environment gate remains pending. Keep Preview and Production on `TEA_LAB_ENABLED=false` and follow `docs/tea-lab/TEA_LAB_RELEASE_RUNBOOK.md` before activation.
