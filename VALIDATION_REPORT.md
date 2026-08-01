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
- Replace the placeholder brand mark with the approved logo asset.
