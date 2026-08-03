# ADR-0001: Tea Lab Data Sources, Ownership, and Privacy Boundaries

| Field | Value |
|---|---|
| Status | Accepted |
| Date | August 3, 2026 |
| Decision owners | Vintage Fork product owner and implementation team |
| Product rules | [Tea Lab MVP Product Rules](./TEA_LAB_MVP_PRODUCT_RULES.md) |

## Context

Vintage Fork 1.1.0 already has a production event model:

- events and event flight items provide the controlled live context;
- participants connect guest activity to an optional customer account;
- `tea_responses` store rating, descriptors, intensity, first impression, private notes, saved state, and completion time;
- event completion and setup locking protect historical and operational integrity;
- the customer dashboard reads account-linked participants and responses directly;
- Passport is presented from completed responses rather than a separate award ledger;
- Saved Teas is presented from response-level `saved` flags; and
- participant deletion cascades through that participant's event data.

Tea Lab adds customer-created solo sessions with broader brewing details, reusable personal teas, durable offline work, and later blend and recipe extensions. Treating live responses and solo cards as identical write records would either force solo behavior through the host-controlled event engine or require copying live data. Both options would weaken the current event and privacy contracts.

## Decision

Tea Lab will use **separate authoritative write models with a unified customer-facing read model**.

### 1. Preserve the live-event write model

The following existing records remain authoritative and are not backfilled into Tea Lab tables:

- `events`;
- `event_flight_items`;
- `participants`;
- `tea_responses`;
- live trivia and state records; and
- their existing deletion, retention, and access paths.

Tea Lab does not call live response or event-command endpoints to operate a solo session.

### 2. Add a customer-owned Tea Lab write model

The first schema migration for Tea Lab will introduce these logical records. Exact SQL types and indexes are implementation details, but the relationships and boundaries are required.

#### `tasting_sessions`

- client-generated UUID primary key;
- `owner_user_id` referencing the authenticated profile;
- `kind`, initially restricted to `solo`;
- `status`: `draft`, `in_progress`, or `completed`;
- `started_at`, `completed_at`, and nullable `archived_at`;
- positive integer `revision`; and
- created/updated timestamps.

The model permits multiple cards per session, but the Solo MVP enforces exactly one.

#### `personal_tea_records`

- UUID primary key;
- owning customer;
- optional canonical `tea_id` link;
- customer-entered name and optional descriptive identity fields;
- optional unverified product and lot text;
- nullable `archived_at`; and
- created/updated timestamps.

A personal record is private and cannot mutate its optional canonical tea. Archiving it removes it from the default picker and Library without altering historical card snapshots.

#### `tasting_cards`

- client-generated UUID primary key;
- owning session;
- stable position within the session;
- either a canonical tea reference or a personal tea reference;
- tea identity snapshot fields required to preserve historical meaning;
- rating, overall intensity, and completion timestamp;
- positive integer `revision`; and
- created/updated timestamps.

The source, owner, and original completion time cannot be changed after completion. Owner corrections to other solo fields increment the revision.

#### `brewing_setups`

- one-to-one card relationship;
- optional leaf grams, water millilitres, temperature Celsius, water source, vessel, and initial steep seconds; and
- created/updated timestamps.

Numeric values receive bounded server validation. Absence is allowed in the MVP.

#### `tasting_card_private_notes`

- one-to-one card relationship;
- first impression;
- personal notes; and
- created/updated timestamps.

Private prose is separated from structured observations so a later analytics query cannot accidentally select it alongside aggregatable data.

#### `flavor_descriptors`

- stable identifier;
- canonical label;
- category and optional parent/category metadata;
- aliases for legacy mapping;
- active/retired state; and
- ordering metadata.

#### `tasting_card_descriptors`

- card and descriptor foreign keys;
- optional ordering metadata; and
- a uniqueness constraint preventing the same descriptor from being attached twice.

The Solo MVP permits no more than three descriptors per card. The server enforces the limit.

### 3. Build an application-level Journal adapter

Journal will query both sources and map them to a shared domain type rather than copying records.

The type must include at least:

- source-qualified ID;
- source kind (`live` or `solo`);
- verification/seal class;
- session title and date;
- tea identity snapshot;
- rating, intensity, and display descriptors;
- private notes visible only to the owner; and
- completion and archive information.

Initial implementation should perform authenticated server-side queries and mapping. A database view may be considered later only if it preserves row-level security using an explicitly reviewed security model.

### 4. Derive Passport presentation

No award or stamp table is introduced in the Solo MVP.

- Completed live response → `live_event_verified`
- Completed solo card → `documented_tasting`

This makes retries naturally idempotent and makes permanent deletion remove the derived seal. A durable achievement ledger may be introduced later for rules that cannot be derived directly from source evidence.

### 5. Adapt Library without migrating saved responses

Existing response-level saved flags remain unchanged. The Library read model may group multiple references to the same canonical tea for display. Personal tea records are shown as private reusable items.

Removing a personal tea from the Library archives the personal record; historical cards retain their snapshots. Existing event-data deletion continues to control saved flags originating from that event.

### 6. Route writes through protected server operations

Authenticated clients do not receive unrestricted direct write access to Tea Lab tables.

Server operations must:

1. authenticate the user;
2. derive owner identity from the authenticated session, never the request body;
3. validate input with shared schemas;
4. enforce legal state transitions and revision checks;
5. perform multi-record changes transactionally where required;
6. return privacy-safe errors; and
7. avoid logging request bodies or private prose.

Row-level security remains enabled as defense in depth. Policies restrict reads and all permitted writes to the owning user, while grants are limited to the access actually used by the application.

### 7. Use client IDs, operation IDs, and revisions for offline work

The client creates stable UUIDs for a session, card, and synchronization operation before contacting the server.

The server records or otherwise recognizes operation IDs so replaying an accepted operation returns the same outcome. A monotonically increasing record revision prevents silent overwrites from stale tabs or devices.

A stale revision returns a conflict response. The local outbox retains the operation and the interface asks the customer to reconcile the device and server copies. Authentication failure never deletes the outbox.

### 8. Keep archive separate from deletion

`archived_at` is reversible and affects default visibility only.

Permanent deletion of a solo session is an authenticated, owner-scoped transaction that cascades through:

- its cards;
- brewing setups;
- structured descriptor links;
- private notes; and
- associated device drafts after server confirmation.

Canonical Vintage Fork tea records are never deleted by this operation. Deleting live tasting data remains on the existing participant-scoped privacy path.

### 9. Defer verified batches and generic ingredients

The existing permanent tea library has no verified batch or barcode inventory model. The Solo MVP accepts optional user-entered product and lot text and labels it unverified.

A future verified batch model requires an operational source, identifier ownership, correction policy, and barcode/QR mapping. Generic herbs, spices, flavorings, and allergen-bearing ingredients are also deferred; the first Blender release will combine teas only.

### 10. Establish consent before community analytics

MVP structured observations remain owner-only. Community aggregation requires a separate accepted decision covering consent records, policy versions, withdrawal, de-identification, minimum sample sizes, moderation, data retention, and administrative visibility.

Private prose is excluded regardless of consent for structured aggregation.

## Invariants

The implementation must preserve all of these:

1. A Tea Lab row has exactly one customer owner.
2. Customer identity is derived from authentication, not client-supplied owner IDs.
3. A live response is never copied to create its Journal representation.
4. A solo session never changes an event, participant, event flight item, or live response.
5. A personal tea never changes a canonical tea.
6. Historical cards retain tea identity snapshots even if a referenced tea is edited, retired, or archived.
7. Private prose cannot be selected by staff analytics or community aggregation paths.
8. Replaying an accepted offline operation cannot create a second session, card, completion, or seal.
9. Archive is reversible; deletion is not.
10. Deleting a tasting cannot delete a canonical tea record.
11. Existing live-event privacy, locking, recap, retention, and deletion semantics remain intact.

## Consequences

### Positive

- Live-event risk is minimized because its state machine and tables remain untouched.
- Journal can evolve without maintaining duplicate historical cards.
- Customer deletion has one authoritative source record to remove.
- Offline replay can be made deterministic.
- Stable flavor IDs are collected before Blender predictions depend on them.
- Private prose is structurally isolated from later computational features.

### Costs

- Journal and Library require adapter logic across two sources.
- Some concepts, such as Passport seals, remain derived rather than directly queryable as one table.
- Revision conflicts require explicit interface handling.
- Verified batches, barcode scanning, and generic ingredients cannot be claimed in the first release.

These costs are accepted because they avoid destabilizing the shipped live-event product and preserve privacy and deletion correctness.

## Rejected alternatives

### Put solo sessions through the live-event engine

Rejected because solo sessions do not need host leases, synchronized phases, trivia, event capacity, or immutable event setup.

### Copy completed live responses into `tasting_cards`

Rejected because copies could diverge after private-note edits, saved-tea changes, account claims, retention, or participant deletion.

### Replace `tea_responses` with a generalized card table immediately

Rejected because it creates unnecessary migration and regression risk in the shipped guest, recap, results, deletion, and customer-dashboard flows.

### Store all card content in one JSON document

Rejected because ownership, validation, privacy separation, taxonomy integrity, querying, and future migration would be harder to enforce.

### Add an achievement ledger in the MVP

Rejected because both initial seal classes are directly derivable from completion evidence. A ledger would add synchronization and deletion obligations without adding capability.

## Follow-up implementation decisions

PR 2 first establishes the live-workflow regression baseline and Tea Lab feature flag without changing production behavior.

PR 3 then turns this logical model into a reviewed migration with:

- constraints and bounded values;
- indexes for owner, status, completion date, session, and descriptor queries;
- row-level security and explicit grants;
- transactional completion and deletion functions or equivalent protected server transactions;
- idempotency-operation storage/retention details; and
- migration-level ownership, isolation, and cascade tests.

Any change to the invariants in this ADR requires a superseding ADR.
