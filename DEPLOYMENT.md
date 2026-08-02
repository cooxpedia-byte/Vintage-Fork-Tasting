# Production deployment: tasting.vintagefork.ca

## Prerequisites

- A private Git repository containing this directory.
- A Supabase production project and a separate staging project.
- A Vercel project connected to the repository.
- DNS access for `vintagefork.ca`.
- Two staff Auth users for host and backup-host testing.

## 1. Validate locally

```bash
npm install
# Commit the generated package-lock.json before production promotion.
npm run typecheck
npm run lint
npm run test
npm run build
```

Create `.env.local` from `.env.example`, then run:

```bash
npm run preflight
npm run dev
```

## 2. Apply the database

Use the Supabase CLI against staging first:

```bash
supabase login
supabase link --project-ref STAGING_PROJECT_REF
supabase db push
```

Load optional sample data only in staging:

```bash
psql "$SUPABASE_DATABASE_URL" -f supabase/seed/seed.sql
```

Run the full `QA_CHECKLIST.md` with multiple browsers. After acceptance, link the production project and apply the same numbered migrations.

## 3. Configure Auth and staff

In Supabase Auth settings:

- Site URL: `https://tasting.vintagefork.ca`
- Add the production callback and approved Vercel preview callback URLs.
- Create staff accounts, then set `profiles.role` to `admin` or `host`.
- Assign a different host and backup host to each scheduled event.

## 4. Configure Vercel

Add every variable from `.env.example` to Production and Preview. Use different Supabase projects for each environment.

Required production values:

```text
NEXT_PUBLIC_SITE_URL=https://tasting.vintagefork.ca
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_SECRET_KEY=...
SUPABASE_DATABASE_URL=...
CRON_SECRET=<at least 32 random characters>
```

Run `npm run preflight` as a deployment check before `next build` or in CI. Use `npm ci` after the lockfile is committed. Deploy a preview, complete QA, then promote the approved commit.

## 5. Configure the hostname and HTTPS

Add `tasting.vintagefork.ca` to the Vercel project. Copy the DNS record Vercel displays into the DNS provider for `vintagefork.ca`. Wait for verification and confirm the production certificate is valid before sharing an invite.

## 6. Backups and retention

- Enable the Supabase backup/PITR level required by the business before the first paid event.
- Verify a current backup before each production migration.
- Test one restoration into a disposable project before launch.
- Configure Vercel Cron to call `/api/cron/retention` with `Authorization: Bearer $CRON_SECRET` daily.
- Never run the sample seed against production.

## 7. Logs and alerts

Structured server events are emitted to Vercel Runtime Logs and caught errors are sent to Sentry when `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` are configured. Alert on repeated 5xx responses, rejected host commands, lost leases, retention failures and database capacity/storage warnings. Configure `SENTRY_AUTH_TOKEN` during builds if source-map upload is required.

Production preflight also requires recent `AUTH_EMAIL_VERIFIED_AT` and `BACKUP_RESTORE_VERIFIED_AT` evidence. Run `npm run verify:operations` after deploying migrations to confirm CSP/frame protection, closed anonymous event-state access, required email confirmation, a recent successful retention run and a current backup/PITR.

## 8. Rollback

1. Stop publishing new invite links.
2. Promote the last known-good Vercel deployment.
3. Do not manually reverse a database migration during a live event.
4. Restore into a separate Supabase project if data recovery is required, verify it, then switch environment variables during a controlled maintenance window.
5. Record the event ID, sequence number and timestamps in `RUNBOOK.md` incident format.
