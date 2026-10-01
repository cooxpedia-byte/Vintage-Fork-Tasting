# Tea Cellar retirement — unpublished item 3 candidate

**Nothing in this folder has been applied to a live database.** The candidate retires trading, card progression, trivia, discovery games, living tasting map games and their reward issuance while preserving personal records, historical rows, wallets and checkout loyalty. Source definitions came from the item 1 canonical database archive, not a new live schema read.

`apply.sql` changes definitions and trigger attachments only. It contains no executed data rewrite, deletion, wallet adjustment, reward conversion or backfill. `rollback.sql` is a separate, explicit restoration of item 3; it does not reverse item 2 or recreate its two progression hooks.

## Runtime result

`node ops/tea-cellar-retirement/test.mjs` passed **33 cases** on actual **PostgreSQL 17.5 (170005)** using official `@electric-sql/pglite` **0.3.16**, in ephemeral WebAssembly memory. ESLint passed for `test.mjs` and `build.mjs`. `test-result-pglite.json` records each case, engine identity, source SHA-256 hashes and all 35 protected function metadata fingerprints.

The isolated package is expected at `../pglite-tests/pg17/node_modules/@electric-sql/pglite` relative to this repository root. No application dependencies were installed or changed for the harness. It accepts no connection string, server address or persistence directory. The fixture refuses a nonempty database or a database without its explicit synthetic PGlite opt-in. All inserted identifiers, notes and balances are synthetic; the fixture imports selected schema objects and real function bodies, never archived customer rows, auth implementation, production ACLs or secrets.

The tests exercise actual item 2 followed by item 3; apply/rollback idempotence; all 21 callable retired RPCs; INSERT rejection on all 25 tables; action UPDATE rejection on nine populated tables; exact guard attachment definitions on all 25; personal card completion/live notes; event start/next/recap and stamp release; historical-flight preservation; empty-draft structural editing; participant privacy deletion/FK cleanup; catalogue FK nulling; preserved generic earn/redeem idempotency; function OID/owner/ACL preservation; and atomic refusals for function, trigger, protected dependency and partial-state drift. Rollback restores exact archived definitions and attachments without rewriting current rows.

This is a selected-schema fixture, **not item 4's full restored-database rehearsal**. Native multi-session locking/concurrency, deployed Supabase role/RLS behavior, full customer privacy deletion and store-bridge reserve/settle/release/connect acceptance remain item 4 checks. Those checkout functions are definition-preserved in the receipt; the harness does not claim a complete checkout test.

## Reviewed closure

`manifest.json` is the exact signature/source/metadata inventory. The 29 denied definitions comprise 21 callable RPCs and eight unattached trigger functions:

- Marketplace and progression: `claim_live_tasting_shield`, `get_merchant_market`, `get_my_merchant_cards`, `publish_merchant_listing`, `purchase_study_copy`, `record_verified_tasting`, `refresh_merchant_card_progress`, `refresh_my_merchant_cards`, `set_marketplace_reaction`, `set_merchant_listing_status`, and the three `sync_merchant_progress_from_*` functions.
- Discovery: `add_discovery_card_member`, `apply_discovery_presentation_command`, `authoritative_discovery_history`, `create_discovery_presentation`, `create_room_discovery_card`, `discovery_metrics_for_user`, `event_discovery_board`, `lock_room_discovery_card`, `recalculate_discovery_identities`, `set_my_discovery_identity_preferences`, `set_my_discovery_reveal_preference`.
- Game rewards/map: `apply_live_tasting_reward_command`, `apply_living_tasting_map_command`, `initialize_live_tasting_reward_settings`, `process_live_tasting_rewards`, `queue_live_tasting_completion_rewards`.

They retain their identities, signatures/defaults, return types, owners and existing ACLs. Each now raises `feature_retired` (SQLSTATE `55000`) before any effect. SQL readers are changed to PL/pgSQL only to implement that refusal. Pure geographic tea metadata and the harmless price arithmetic helper remain available.

Three narrowly revised definitions preserve live tasting:

- `apply_event_command`: refuses open/close trivia; allows leaving old trivia phases, advancing teas and starting recap without trivia prerequisites. Authentication, control lease, sequence checks, non-game phase checks, event logs and stamp provenance remain.
- `event_readiness`: removes the trivia requirement, retaining all other readiness requirements.
- `save_event_bundle`: ignores incoming game payload. For existing flights linked to any archived historical child FK, retains IDs and permits title/reveal/brewing/detail edits only with the same ordered teas/count. Structural edits return `event_flight_history_preserved` atomically. Truly empty drafts continue to support adding, reordering and removing teas. The editor locks the event and existing flight rows before checking history. The check covers trivia, responses/revisions, breakouts, brews, chats/reactions, cheers, conversation prompts, group reveals, stage signals, living-map records, reveal samples, room cards and tasting-opened provenance. New-schema dependencies require rereview at release.

Seven exact trigger attachments are detached:

| Table | Trigger |
| --- | --- |
| `tea_catalog_prices` | `tea_catalog_prices_resolve_tea` |
| `tea_catalog_prices` | `tea_catalog_prices_sync_merchant_progress` |
| `events` | `events_initialize_live_rewards` |
| `event_breakout_members` | `breakout_members_add_discovery_member` |
| `event_breakout_rooms` | `breakout_rooms_create_discovery_card` |
| `event_breakout_rooms` | `breakout_rooms_lock_discovery_card` |
| `event_breakout_sessions` | `breakout_sessions_create_discovery_presentation` |

The catalogue resolver is detached because it would otherwise remap an FK being erased and update `synced_at`, obstructing privacy cleanup. Its unchanged function remains in the protected set. Core breakout operations and guards remain; closing a room no longer locks or creates retired discovery records.

The 25 frozen tables receive a BEFORE INSERT OR UPDATE guard:

- `merchant_card_progress`, `merchant_tasting_verifications`, `merchant_listings`, `merchant_study_copies`, `merchant_transactions`, `merchant_reactions`, `tea_catalog_prices`.
- `trivia_questions`, `trivia_answers`.
- `discovery_identity_definitions`, `discovery_identity_recalculations`, `user_discovery_identities`, `user_discovery_profiles`, `room_discovery_cards`, `room_discovery_card_items`, `event_discovery_presentations`.
- `living_tasting_map_sessions`, `living_tasting_map_observation_events`, `living_tasting_map_snapshots`, `living_tasting_map_fingerprints`, `living_tasting_map_moderation_actions`.
- `live_tasting_reward_policies`, `event_live_reward_settings`, `event_live_reward_completion_overrides`, `event_live_reward_awards`.

Existing historical rows are left in place, including queued game awards and active listing statuses. Queued game rewards are frozen, not credited or voided; any outstanding business obligation needs a separate reviewed decision. No existing Leaves are removed. Existing DELETE permissions and FK actions remain unchanged. Narrow monotonic UPDATE exceptions permit only reviewed FK fields becoming NULL and the existing participant scrub's removal of participant IDs, quotes and attribution/spokesperson state. They cannot re-add identities, content, awards, prices or game state; there is no caller, role, custom-setting or trigger-depth bypass.

## Wallet and release protections

The candidate keeps `merchant_wallets`, `merchant_ledger_entries`, account/identity links and all checkout RPCs unchanged, including `ensure_current_customer`, `post_gold_leaves_entry`, WordPress earn/redeem/refund helpers, and `gold_leaves_reserve_store_v1`, `gold_leaves_release_store_v1`, `gold_leaves_settle_store_v1`, `gold_leaves_connect_store_v1`. It neither migrates nor re-credits reserved balances. The generic ledger writer intentionally remains callable under its existing permissions because checkout shares it. Unknown privileged external callers using that generic writer are outside this closure; game-specific writer RPCs are denied regardless of caller.

Both scripts require PostgreSQL 17, require item 2 hooks to be absent (including renamed copies), take bounded locks/timeouts, verify exact original-or-retired source and metadata, table column shapes and trigger definitions/enabled state, and reject mixed/partial/unexpected attachments. Apply also refuses drift in any of the 35 protected dependencies. Rollback intentionally does not refuse an unrelated protected-function hotfix and never overwrites it. Existing changed-function OIDs, owners and ACLs survive CREATE OR REPLACE; the new guard helper is revoked from PUBLIC.

`cron-audit.json` records archive coverage and the root agent's separate read-only live confirmation at `2026-10-01T01:57:41.446Z`: `cron.job` did not exist and `pg_cron` was not installed. No scheduler change is necessary for that captured state. External HTTP/Edge schedulers were not enumerated and may still attempt denied RPCs.

Before a future release: obtain/reconcile a fresh preservation snapshot, verify current schema and dependencies against this manifest, complete item 4's restored-database and checkout/privacy rehearsal, and apply item 2 before item 3 during the reviewed deployment. A drift refusal requires rereview, never bypassing the guard. Keep rollback explicit; it re-enables the retired marketplace and game capabilities.

## Offline reproduction

From the repository root:

```sh
python3 ops/tea-cellar-retirement/build-source.py
node ops/tea-cellar-retirement/build.mjs
node ops/tea-cellar-retirement/test.mjs
./node_modules/.bin/eslint ops/tea-cellar-retirement/test.mjs ops/tea-cellar-retirement/build.mjs
```

The first command requires the private archived schema and local `pg_restore`; it extracts schema only, validates selected bodies for credential/URL/UUID literals and writes no customer data. Regeneration changes the reviewable SQL/manifest; rerun the behavior suite afterward. The test command itself needs only committed fixture/candidate files and the pinned isolated PGlite package.
