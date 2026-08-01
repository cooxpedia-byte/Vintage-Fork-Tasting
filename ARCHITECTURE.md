# Architecture and state contract

## Trust boundaries

### Browser-owned

- selected UI tab
- reduced-motion/sound preferences
- unsent personal-note draft cached under event + participant + flight item
- transient connection indicators

### Server-owned

- event status and `SessionPhase`
- monotonic `sequence_number`
- current flight item
- the flight item whose tasting interaction has explicitly opened
- server-scheduled `reveal_at` and its ceremony gate
- timer start/end timestamps
- trivia open/close timestamps
- participant status and ownership
- host-control lease
- all durable responses, scores, Passport history and saved teas

## Real-time flow

1. A host command posts the current sequence number and lease token.
2. Postgres locks the event and lease rows.
3. The command is rejected if the client is stale, the lease expired, the role lacks access, or the transition is illegal.
4. Postgres increments `sequence_number`, writes the state and appends an immutable `event_state_log` entry.
5. Supabase Realtime broadcasts the committed full event row to authorised staff and a separate minimal `event_public_state` row to guests.
6. Guests use that minimal signal only to know that state changed, then fetch their event-scoped snapshot through the secure API; future teas, video links, and correct trivia answers are never exposed by the public channel.
7. Guests and staff accept only snapshots at or above the last sequence they have seen.
8. A reconnecting client fetches `/api/events/[eventId]/state` or its staff snapshot instead of reconstructing state locally.

## Host control

`host_control_leases` permits one controlling staff user per event. The lease lasts 45 seconds and is renewed every 5 seconds. A late heartbeat cannot revive an expired lease. A second staff device remains read-only while the lease is healthy. From 15–45 seconds without a heartbeat, only the assigned backup or an administrator may force takeover; after expiry, any authorized event staff member may claim control.

## Guest identity

Anonymous guests are not given broad database access. Joining creates a participant and a random 256-bit token. Only its SHA-256 hash is stored. The raw token is held in a Secure, HttpOnly, SameSite cookie scoped to the site and used by event-specific server routes.

A signed-in customer is additionally linked through `participants.user_id`, which makes completed tasting history available in `/dashboard` under RLS.

## Privacy

Staff results surfaces never display private free-text tasting notes. Authenticated browser sessions have column-level access only to operational participant fields; email and marketing consent remain behind separately authorized server work. Pilot export is intentionally absent. Any future Phase 2 export needs separate authorization, an audit record and the same absolute exclusion of guest note text.

## Retention

Anonymous participant rows receive a `delete_after` timestamp and are removed by the daily authenticated cron. Account-linked history remains until the customer deletes it or the business retention policy requires removal.
