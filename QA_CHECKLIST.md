# Launch QA checklist

Run this against a Vercel preview connected to a non-production Supabase project.

## Authentication and permissions

- Customer login, password reset and logout work on Safari, Chrome and a mobile browser.
- Host can open only assigned events; unrelated staff receive Unauthorized.
- Customer cannot load `/admin` or call admin APIs.
- Supabase secret key is absent from browser bundles and network responses.
- Session refresh works after leaving a tab open for at least one hour.

## Event setup

- Create remote and in-person events.
- Host and backup cannot be the same person.
- Add/edit/retire tea-library records; retired teas remain visible in history but disappear from new flights.
- Reorder teas and verify flight positions persist.
- Every tea has reveal text, brewing instructions, steep time and one valid trivia question.
- Invite code is unique, stable for the launch MVP, and cannot admit guests beyond capacity.
- Capacity cannot be set below joined participants.
- Live/completed events reject setup edits.

## Guest flow

- Invalid, cancelled, full and completed invites show the correct terminal state.
- Guest can join with only a name; marketing consent remains null without an email.
- Optional email is validated and never silently opts into marketing.
- Waiting-room count updates as browsers join/leave.
- Reloading keeps the guest in the same event without asking for the name again.
- Reloading or reopening the event in the same browser reuses the existing participant session instead of creating another row.

## Live synchronization

Test with one host, one backup/observer and at least three guest browsers.

- Only one host has control.
- Host reveal requires a 600ms hold, a release, and a separate deliberate commit.
- Every phase change appears on all guests without manual reload.
- Stale host command is rejected and the console refreshes.
- Reveal is scheduled from the server timestamp and timer/tasting controls remain locked until the ceremony gate ends.
- Timer remaining time remains correct after reload, sleep/wake and reconnection.
- Guest cannot start, stop or reset the timer.
- Host disconnect for >45 seconds permits recovery; guests do not move phases during the gap.
- Reconnecting guest receives the current state, not an earlier animation.
- Ended event cannot be reopened.

## Responses and trivia

- First impression is optional.
- Descriptor limit is three.
- Rating is 1–5.
- Offline personal notes survive reload and sync later.
- Server rejects a response for the wrong flight item.
- Trivia accepts only one answer per participant.
- Correct answer is hidden until close/deadline.
- Guest state never includes participant rankings or room-wide descriptor frequencies.

## Customer dashboard

- Completed event appears for account-linked participant.
- Passport includes only completed teas.
- Saved tea does not add to cart or initiate payment.
- Historical first impressions and personal notes render only for the linked customer and remain private under RLS.
- Logout and session recovery are reliable.

## Accessibility

- Complete all critical flows with keyboard only.
- Focus is visible and logical.
- Screen reader announces errors and phase changes.
- 200% and 400% zoom remain usable.
- Tap targets are at least 44px; guest primary targets are at least 48px.
- `prefers-reduced-motion` suppresses ceremonial motion.
- Contrast is checked against WCAG AA.

## Production operations

- Database backup/PITR is enabled and a restore has been tested.
- Vercel Runtime Logs are visible and an intentional test error is captured.
- Retention cron authenticates and runs.
- Pilot routes expose no data-export action or endpoint.
- DNS resolves `tasting.vintagefork.ca` and HTTPS is valid.
- Supabase Auth Site URL and redirect URLs use the production hostname.
