# Launch MVP manifest

This manifest maps every requested launch requirement to its implementation. It is a code-delivery manifest, not proof that the application is already deployed to production.

| # | Launch requirement | Implementation evidence |
|---:|---|---|
| 1 | Admin login | `/admin/login`, `LoginForm`, `requireStaff`, Supabase Auth session refresh in `src/proxy.ts` |
| 2 | Customer login and optional guest participation | `/login`, `/signup`, `/event/[invite-code]`, `/api/events/join`; anonymous guest token is Secure/HttpOnly and event-scoped |
| 3 | Event creation and editing | `/admin/events/new`, `/admin/events/[event-id]`, `EventEditor`, transactional `save_event_bundle` RPC |
| 4 | Tea selection and ordering | `/admin/teas`, `/admin/teas/[tea-id]`, `TeaEditor`, ordered event flight editor |
| 5 | Trivia setup | Per-tea question editor with 2–4 answers, one correct index and 10–60 second window; database readiness validation |
| 6 | Invitation link and event-code generation | Unique invite code generated inside `save_event_bundle`; production URL built from `NEXT_PUBLIC_SITE_URL` |
| 7 | Participant waiting room | Guest lobby UI and durable `waiting`/`admitted` participant statuses |
| 8 | Real-time participant presence | Supabase Presence plus durable participant heartbeat and last-seen health |
| 9 | Host-controlled session start | `open_session` command through server-validated `apply_event_command` RPC |
| 10 | Synchronized tea reveals | Hold-to-arm/tap-to-commit host control, durable server `reveal_at`, client/server clock-offset correction, 1.2-second scheduling buffer, invite-scoped payload-free Realtime signal, reveal-skew samples and a server-enforced 1.4-second ceremony gate |
| 11 | Synchronized brewing timer | Server stores `timer_started_at`/`timer_ends_at`; clients derive remaining time from the committed end timestamp |
| 12 | Aroma and flavour response collection | First impression, max-three descriptors, intensity, rating and local-first personal notes |
| 13 | Trivia questions and scoring | Time-bounded answer API, one-answer uniqueness, server-calculated correctness, delayed answer reveal |
| 14 | Results and recap | Participant-private guest recap plus staff-only `/admin/events/[event-id]/results` and event aggregates |
| 15 | Completed Tea Passport | Every completed tea response becomes a Passport stamp in guest recap and customer dashboard |
| 16 | Saved customer tasting history | Participant claim flow links an event to a verified account; `/dashboard` reads history under RLS |
| 17 | Basic event analytics | `event_analytics` view and results route; export is intentionally absent from the Pilot and remains Phase 2 |
| 18 | Reliable logout, session recovery and permissions | `/logout`, password recovery/callback, proxy session refresh, role checks, RLS, protected RPCs, lease recovery |

## Shared architecture

- Shared Vintage Fork tokens and components: `src/app/globals.css`, `Brand`, `SiteHeader`, `StatusChip`.
- Central schema and state transitions: `supabase/migrations/` and `src/lib/transitions.ts`.
- Server-authoritative live state: events table, monotonic sequence, current flight item, explicit tasting-open marker and immutable state log.
- Real-time: authenticated staff channels and invite-scoped guest signals; participant snapshots remain cookie-authenticated server reads.
- Media: private `tasting-media` bucket and signed-upload endpoint.
- Loading/offline/error: global loading and error routes, branded invalid-invite states, offline banner, stale-command recovery and empty states.
- Responsive/accessibility: keyboard focus, skip link, reduced motion, responsive dashboard/host/guest layouts and minimum control sizes.

## Launch boundaries

- Conferencing remains in Zoom or Meet; this application does not carry or record audio/video.
- Personal notes are private. Staff analytics do not include free-text notes, and authenticated clients cannot select participant email or consent columns directly.
- `localStorage` is used only for a participant’s scoped, local-first note draft. It never controls event phase, timer, host lease, trivia status or permissions.
- Mobile app packaging is intentionally absent.
