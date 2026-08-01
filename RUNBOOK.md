# Live-event operating runbook

## 30 minutes before

1. Confirm Vercel and Supabase status.
2. Open the event editor and confirm all readiness checks.
3. Confirm the assigned backup host can sign in.
4. Open Zoom/Meet, admit the backup host and enable captions.
5. Open the host console on the primary device and keep it connected to power.
6. Open the live console on the backup device; verify it says watching.

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
