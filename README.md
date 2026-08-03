# Vintage Fork Tasting Web Application

Production-oriented launch codebase for `tasting.vintagefork.ca`, consolidated from the four supplied standalone prototypes. The repository is ready for staging integration, but it is not already deployed because hosting, database and DNS credentials are not included:

- Guest Live Tasting → `/event/[invite-code]`
- Customer Dashboard → `/dashboard`
- Admin Dashboard → `/admin`
- Live Host Console → `/admin/events/[event-id]/live`

The original standalone files are preserved under `public/reference/` for visual and behavioural parity checks. They are **not** served as the production application and their demo `localStorage` state is not authoritative.

## Architecture

- **Next.js 16 App Router + TypeScript** for the web application and server routes.
- **Supabase Auth** for customer, host and administrator accounts.
- **Supabase Postgres** for events, flights, trivia, participants, responses, Passport history and analytics.
- **Supabase Realtime** for event-state changes and Presence.
- **Supabase Storage** for tea/event images and optional audio assets.
- **Vercel** deployment at `tasting.vintagefork.ca` with automatic HTTPS.

The central rule is: **the database is authoritative**. Host commands execute through `apply_event_command(...)`, which locks the event row, verifies role, active host-control lease, expected sequence number and legal phase transition before committing a new state.

## Implemented launch MVP

- Admin and customer email/password authentication, recovery and logout
- Optional account-free guest participation with a secure, event-scoped HttpOnly token
- Event creation/editing, permanent tea-library management, tea ordering, event-specific brewing settings and trivia
- Invite-code generation and seat-capacity enforcement in one database transaction
- Waiting room and participant presence
- Exclusive host-control lease with heartbeat, observer mode and takeover recovery
- Server-authoritative phase transitions, scheduled tea reveals, reveal ceremony gate and timer end timestamps
- Aroma/flavour capture, intensity, rating, private notes and saved teas
- Trivia locking and scoring
- Participant-private recap, Passport and customer tasting history
- Guest recap email with a time-limited, accountless tasting-data deletion link
- Self-service deletion of participant-scoped notes, ratings, trivia answers, stamps and saved teas without deleting an account
- Privacy-safe event analytics (data export remains Phase 2, as specified)
- RLS policies, protected RPCs, storage policies, retention cleanup and structured logs
- Responsive, keyboard accessible, reduced-motion aware interfaces
- Loading, empty, offline, stale-session, authorization and error states

## Delivery status

Read `LAUNCH_MANIFEST.md` for the complete MVP mapping, `DEPLOYMENT.md` for the production procedure, and `VALIDATION_REPORT.md` / `DELIVERY_NOTES.md` for the checks and remaining credential-dependent work.

The feature-gated Tea Lab Solo Tasting MVP is also implemented in the workspace, including offline drafts, unified Journal, private Library, derived Passport seals and owner-safe lifecycle controls. It remains disabled pending the separate staging gate in `docs/tea-lab/TEA_LAB_RELEASE_RUNBOOK.md`.

## Local setup

### 1. Install dependencies

```bash
npm install
```

The committed `package-lock.json` provides reproducible installs; use `npm ci` in CI/Docker. Node 22 through 26 is supported.

### 2. Create a Supabase project

Install the Supabase CLI, link the project, then apply migrations:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

Migrations are in `supabase/migrations/`.

### 3. Create staff users

Create users in Supabase Authentication, then assign roles:

```sql
update public.profiles
set role = 'admin', display_name = 'Salar Melli'
where id = 'AUTH_USER_UUID';

update public.profiles
set role = 'host', display_name = 'Backup Host Name'
where id = 'SECOND_AUTH_USER_UUID';
```

At least two staff accounts are recommended so each event can have a different host and backup host.

### 4. Environment variables

Copy `.env.example` to `.env.local` and fill in:

```bash
cp .env.example .env.local
```

Use the current Supabase **publishable key** in `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and the server-only **secret key** in `SUPABASE_SECRET_KEY`. Never expose the secret key to the browser.

`TEA_LAB_ENABLED` is a server-side release flag. It is disabled when missing or set to `false`; only the exact value `true` enables Tea Lab. Keep it `false` until migrations `0018`–`0022` and the [Tea Lab release runbook](docs/tea-lab/TEA_LAB_RELEASE_RUNBOOK.md) have passed. Flag-on preflight also requires recent `TEA_LAB_MIGRATIONS_VERIFIED_AT` and `TEA_LAB_ACCEPTANCE_VERIFIED_AT` evidence.

Guest recap delivery uses Brevo SMTP. Configure `BREVO_SMTP_USER`, `BREVO_SMTP_KEY` and a Brevo-verified sender in `RECAP_EMAIL_FROM`; keep all three server-only. The default relay is `smtp-relay.brevo.com:587`.

### 5. Run

```bash
npm run dev
```

For a local production-parity run, build first and then start the prepared standalone server. The start command loads `.env.local` when present and otherwise uses environment variables injected by the hosting platform.

```bash
npm run build
npm start
```

Open `http://localhost:3000/admin/login`.

## Production deployment to tasting.vintagefork.ca

1. Push this directory to a private GitHub repository.
2. Import the repository into Vercel.
3. Add all variables from `.env.example` to Vercel Production and Preview environments.
4. Set `NEXT_PUBLIC_SITE_URL=https://tasting.vintagefork.ca`.
5. Generate a long random `CRON_SECRET` and configure it in Vercel.
6. Deploy a preview and complete the QA checklist in `QA_CHECKLIST.md`.
7. Add `tasting.vintagefork.ca` in Vercel Project → Domains.
8. Add the DNS record Vercel supplies at the DNS provider controlling `vintagefork.ca`.
9. Promote the verified deployment to production. Vercel provisions HTTPS automatically after DNS verification.
10. In Supabase, configure the Site URL and redirect allow-list for both the production domain and the Vercel preview domain.

## Backups and recovery

- Enable the Supabase plan that provides the required backup retention and Point-in-Time Recovery for launch.
- Before each production migration, create/verify a fresh backup.
- Never edit production schema manually. Add a numbered migration and run it first against a staging project.
- Test restoration before the first paid public event.

## Error logging

Server routes emit structured JSON logs through `src/lib/logger.ts`, visible in Vercel Runtime Logs. Sentry is initialized for browser, Node and Edge errors when `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` are configured; default PII and session replay are disabled.

Recommended alerts:

- HTTP 5xx on `/api/events/*`
- `host_command_failed`, `host_command_rejected`, or `lease_lost`
- Realtime disconnections during a live event
- retention cron failure
- database storage or auth rate-limit warnings

## Logo asset

The approved Vintage Fork mark is tracked at `public/brand/vintage-fork-icon.jpg` and rendered by the shared `Brand` component. Preserve its clear space and do not recolour, crop or animate it.

## Important launch boundaries

- Zoom/Meet carries voice, video and captions. This application does not record conferencing audio, video or transcripts.
- `localStorage` is used only for local-first draft notes and harmless UI preference recovery. Event phase, timer, trivia status, participant ownership and host control are never authoritative in the browser.
- Do not expose unfinished navigation. Add a feature only when its route and server action are implemented.
- Do not switch a live event’s flight, host, backup host or trivia configuration. Database functions reject locked-event edits.
- Pilot event export is intentionally absent. The UX specification defers a separately authorized and audited export path to Phase 2.

## Commands

```bash
npm run dev
npm run preflight
npm run typecheck
npm run lint
npm run test
npm run build
npm start
```

## Reference prototype mapping

| Production component | Source reference |
|---|---|
| `src/components/guest/GuestExperience.tsx` | `public/reference/guest-live-tasting.html` |
| `src/components/dashboard/CustomerDashboard.tsx` | `public/reference/customer-dashboard.html` |
| `src/app/admin/*`, `src/components/admin/*` | `public/reference/admin-dashboard.html` |
| `src/components/host/HostConsole.tsx` | `public/reference/live-host-console.html` |
