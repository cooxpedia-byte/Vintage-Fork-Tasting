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
- API and realtime failures show the connection banner even when `navigator.onLine` remains true; “Retry now” requests a fresh guest snapshot.
- A network exception during join, tasting-response save, saved-tea change or recap claim always restores the action button and presents a retryable error.
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
- Recap trivia shows only that guest's correct and answered counts, never the room trivia aggregate.
- Every recap tea can be saved or unsaved, including after the session ends, and the saved count updates immediately after confirmation.
- A tea without a completed tasting response is labeled “Not tasted,” never “Not rated.”
- Completed guest can send a participant-only recap to the stored email or a corrected address; one initial send and no more than three retries are allowed per 24 hours.
- Recap email contains a 90-day deletion link and does not include another guest's name, responses or descriptors.
- Active guest and accountless email-link flows both require confirmation before deleting tasting data.
- Deletion removes only that participant's notes, ratings, trivia answers, stamps, saved teas, guest token and recap records; any customer/staff account remains intact.

## Customer dashboard

- Completed event appears for account-linked participant.
- Passport includes only completed teas.
- Saved tea does not add to cart or initiate payment.
- Historical first impressions and personal notes render only for the linked customer and remain private under RLS.
- Logout and session recovery are reliable.

## Tea Lab MVP

Run the complete [Tea Lab release runbook](docs/tea-lab/TEA_LAB_RELEASE_RUNBOOK.md) on a migrated staging project before setting `TEA_LAB_ENABLED=true` anywhere.

- With the flag off, the shipped Home, Tastings, Passport and Saved Teas experience is unchanged and Tea Lab tables are not queried.
- With the flag on but a critical Tea Lab read unavailable, the dashboard shows the generic safe error state, logs only safe source/error codes and never renders a partial Tea Lab view.
- Complete known and manually entered teas and verify exactly one Journal card and source-qualified Passport seal each.
- Refresh offline at every solo step, complete offline, reconnect and verify exactly one server card.
- Expire authentication with a completed device draft, sign in again and verify no data loss.
- Reuse, archive and restore a private personal tea without adding it to the permanent catalogue.
- Archive and restore a solo tasting; its seal remains. Permanently delete it; its Journal entry and seal disappear.
- Edit the same solo session in two tabs and verify an explicit revision conflict.
- Verify a second customer and ordinary staff client cannot read the session, brew or private prose.
- Add at least two camera/library photos, complete the tasting, open the same private card from Journal and Passport, test the slider, and verify a second customer cannot read the metadata or objects.
- Confirm logs contain safe IDs/codes and never first impressions, private notes or manual tea prose.
- Complete the flow with keyboard and screen reader; verify rating arrow keys, deletion-confirmation focus, 200%/400% zoom and reduced motion.

## Accessibility

- Complete all critical flows with keyboard only.
- Focus is visible and logical.
- Screen reader announces errors and phase changes.
- Guest registration, tasting, trivia, saved-tea, recap, claim and privacy failures are exposed as atomic alerts.
- Guest lobby, welcome, reveal, brewing, tasting, trivia, between-tea, recap, ended and removal changes are announced once through the persistent phase live region.
- Brewing time remains readable on demand, while automatic announcements occur only at 10 seconds, 5 seconds and completion.
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
