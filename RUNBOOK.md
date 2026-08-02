# Live-event operating runbook

## 30 minutes before

1. Run `npm run preflight` and `npm run verify:operations`; do not open a paid room unless both pass.
2. Confirm Vercel and Supabase status and confirm Sentry has received a recent test event.
3. Open the event editor and confirm all readiness checks.
4. Confirm the assigned backup host can sign in.
5. Open Zoom/Meet, admit the backup host and enable captions.
6. Open the host console on the primary device and keep it connected to power.
7. Open the live console on the backup device; verify it says watching.

## When guests arrive

- Confirm participant count and presence health.
- Do not change event setup after guests begin joining unless necessary.
- Copy the active invite only from the event or live console so the event code and capacity guidance are current.

## Connection failure

- Guests remain on the last committed server phase.
- Do not repeatedly click commands while reconnecting.
- If the primary host returns within the lease window, control continues.
- After lease expiry, the backup host takes control and proceeds from the current server snapshot.

## Incorrect command

There is deliberately no backwards phase command. Pause verbally in Zoom/Meet, explain the correction, and continue from the current state. Do not edit database rows manually during an event.

## Incident capture

Record:

- event ID
- timestamp with timezone
- user/device involved
- last visible phase and sequence number
- Vercel request/log identifier
- whether guests were affected

Do not include private tasting notes in incident reports.

## After the event

1. End the tasting in the console.
2. Confirm recap/leaderboard loads for a test guest.
3. Review the privacy-safe event results in Admin.
4. Review error logs and event-state history.
5. Confirm the customer dashboard contains the completed event for an account-linked test participant.
6. Confirm the latest `operational_job_runs` retention record remains successful after the next scheduled cron.

## Paid-pilot evidence

- Authentication email: set `AUTH_TEST_EMAIL` to a controlled inbox, run `npm run verify:auth-email`, follow the recovery link, save a temporary password and sign in. Record the successful UTC time in `AUTH_EMAIL_VERIFIED_AT`.
- Backups: verify a completed backup/PITR in Supabase, perform the restore rehearsal in an isolated project, and record the successful UTC time in `BACKUP_RESTORE_VERIFIED_AT`.
- Retention: `npm run verify:operations` requires a successful durable cron record from the last 26 hours.
- Reveal synchronization: after a rehearsal, query `reveal_sync_samples` and require the p95 absolute `reveal_skew_ms` to remain below the agreed pilot threshold.
- 100-client load: use an empty scheduled event whose title begins `[LOAD TEST]`, set the guarded `LOAD_TEST_*` variables, and run `npm run test:load`. The harness deletes only the participants it created.
