# Validation report

Validation performed on 1 August 2026 (America/Edmonton) in the delivery workspace.

## Passed

- Installed the exact locked dependency graph: **399 packages audited, 0 known vulnerabilities**.
- Ran `npm run typecheck`: **passed**.
- Ran `npm run lint`: **passed**.
- Ran `npm run test`: **4 of 4 tests passed**.
- Ran `npm run build`: **passed**, producing all **27** page/API routes.
- Started the production server and smoke-tested `/admin/login` (**200**) and the protected retention route without a secret (**401**).
- Verified all **11** Supabase migrations are uniquely numbered and contiguous from `0001` through `0011`.
- Confirmed reveal scheduling, the ceremony gate, five-second host heartbeat, strict lease expiry and lease release are server-owned in migration `0011`.
- Confirmed authenticated participant-table grants exclude `email` and `marketing_consent`.
- Confirmed Pilot CSV/JSON export controls and endpoint are absent, matching the final Admin UX specification.

## Credential-bound checks still required

- Apply migrations to a staging Supabase project.
- Test Auth redirects, RLS, Realtime, Storage and the retention cron with real credentials.
- Run the multi-browser and multi-device scenarios in `QA_CHECKLIST.md`.
- Verify DNS and HTTPS on `tasting.vintagefork.ca`.
- Confirm the tracked approved logo renders correctly on the target deployment.

## Tea Lab validation addendum — 3 August 2026

### Passed locally

- `npm run typecheck` and `npm run lint` pass.
- `npm run test` passes **198 tests across 53 files**.
- The optimized Next.js production build passes with the feature-gated Tea Lab routes included.
- `npm audit --audit-level=high` reports zero production or development dependency vulnerabilities.
- Migrations `0018` through `0022` have automated ownership, RLS, grant, hosted-pgcrypto compatibility, idempotency, revision, cascade, signed-photo and privacy-contract assertions.
- The customer dashboard restores the shipped experience when the flag is off. With the flag on, critical Tea Lab read or seed failures surface the generic safe dashboard error without logging private details.
- Desktop and mobile browser checks covered the Lab workflow and the Library, Journal and Passport navigation/empty states.
- Staging migration `0022` was applied only to `Vintage-fork-staging` (`fugvpupuwgbnojkyptym`) and verified with RLS enabled, a private 8 MB bucket, and authenticated `SELECT`-only metadata access.
- A disposable staging customer completed a photographed tasting; the same full digital card opened from Journal and Passport, a second customer received zero metadata rows and a `404`, completed-card upload returned `409`, and permanent deletion left zero metadata rows and zero storage objects.
- Release preflight rejects `TEA_LAB_ENABLED=true` without recent migration and acceptance evidence.

### Environment-bound Tea Lab checks still required

- Complete all eleven scenarios in `docs/tea-lab/TEA_LAB_RELEASE_RUNBOOK.md` with the required browser/device and assistive-technology matrix. The focused photo/card staging scenario is complete; the full gate remains pending.
- Record genuine `TEA_LAB_MIGRATIONS_VERIFIED_AT` and `TEA_LAB_ACCEPTANCE_VERIFIED_AT` timestamps only after those checks pass.
- Keep `TEA_LAB_ENABLED=false` in Preview and Production until the environment gate is complete.
