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
- Recap, leaderboard, room descriptors, Passport and customer tasting history
- Privacy-safe event analytics (data export remains Phase 2, as specified)
- RLS policies, protected RPCs, storage policies, retention cleanup and structured logs
- Responsive, keyboard accessible, reduced-motion aware interfaces
- Loading, empty, offline, stale-session, authorization and error states

## Delivery status

Read `LAUNCH_MANIFEST.md` for the complete MVP mapping, `DEPLOYMENT.md` for the production procedure, and `VALIDATION_REPORT.md` / `DELIVERY_NOTES.md` for the checks and remaining credential-dependent work.

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

### 5. Run

```bash
npm run dev
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

The supplied prototypes use a placeholder mark and explicitly instruct production to replace it with the approved logo. Replace `src/components/Brand.tsx` with the official transparent SVG/PNG asset while preserving its clear space and without recolouring, cropping or animating it. No official logo file was included in the four uploads, so the placeholder remains intentionally visible in this package.

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
