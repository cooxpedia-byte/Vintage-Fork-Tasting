# Tea Lab MVP Release Runbook

| Field | Value |
|---|---|
| Scope | Solo Tasting Session MVP |
| Code gate | Complete locally |
| Environment gate | Pending on a migrated staging project |
| Default release state | `TEA_LAB_ENABLED=false` |
| Required migrations | `0018`, `0019`, `0020`, `0021`, `0022`, `0023`, `0024`, then `0025` |

Tea Lab must remain disabled until both the automated code gate and the staging acceptance gate have passed. A successful build is not evidence that a remote database has the required schema.

## 1. Automated code gate

Run from a clean checkout:

```bash
npm ci
npm run check
npm run build
```

The gate covers feature-off regression behavior, schema and RLS contracts, protected routes, idempotent operations, IndexedDB namespacing, outbox recovery, private photo uploads, Journal/Library/Passport derivation, shared digital-card rendering, archive/delete behavior, release preflight, and rendered accessibility semantics.

## 2. Prepare staging with the feature off

1. Confirm staging uses a non-production Supabase project.
2. Set `TEA_LAB_ENABLED=false`.
3. Verify a current database backup or disposable staging reset point.
4. Apply migrations `0018_tea_lab_foundation.sql`, `0019_tea_lab_protected_operations.sql`, `0020_tea_lab_library_operations.sql`, `0021_tea_lab_digest_schema.sql`, `0022_tea_lab_tasting_photos.sql`, `0023_tea_lab_brewing_styles.sql`, `0024_tea_lab_descriptor_palette.sql`, and `0025_tasting_descriptor_limit.sql` in order. `0021` makes the protected save function compatible with Supabase's trusted `extensions` schema; `0022` adds owner-private tasting photo metadata and the private photo bucket; `0023` adds brewing styles and owner-private ordered stage notes; `0024` expands the stable sensory vocabulary while preserving all existing descriptor IDs and links; `0025` raises the protected Tea Lab and live-tasting descriptor limits to five.
5. Confirm the migration history and inspect the new tables, policies, grants, seeded descriptors, and protected functions.
6. Deploy the application while the flag remains false and rerun the shipped live-event regression checklist.

Do not compensate for a failed migration by manually editing production tables or grants.

## 3. Staging acceptance scenarios

Use at least two customer accounts, one ordinary staff account, two browser tabs, and one mobile browser.

| # | Scenario | Automated evidence | Staging evidence required |
|---:|---|---|---|
| 1 | Known saved/canonical tea completes once and appears once in Journal | Outbox, route, adapter, and rendered-dashboard tests | Complete against staging database and verify one session/card |
| 2 | Unknown tea remains private, reusable, and absent from the permanent catalogue | Personal-tea migration, Library adapter, and route tests | Create, reuse, archive, and restore with a second catalogue check |
| 3 | Offline refresh and reconnect produce exactly one completed card | IndexedDB and retry/idempotency tests | Repeat with browser offline controls and a hard refresh |
| 4 | Expired authentication retains the completed device draft | Authentication outbox tests | Expire the staging session, sign in again, and synchronize |
| 5 | Repeated completion produces one card and one derived seal | Completion migration and Passport derivation tests | Replay the same operation ID against staging |
| 6 | Two tabs produce an explicit revision conflict | Revision and conflict tests | Edit the same session in two tabs and inspect both copies |
| 7 | Customer and staff privacy boundaries reject cross-owner reads | RLS, ownership, route, and privacy-log tests | Attempt reads as a second customer and ordinary staff client |
| 8 | Permanent deletion removes server descendants, photo objects, local draft, Journal entry, and seal | Cascade migration, outbox, photo cleanup, and lifecycle render tests | Delete on staging and inspect all related tables, the private bucket, and IndexedDB behavior |
| 9 | Existing live completion/deletion semantics remain unchanged | Guest deletion and customer-dashboard regression tests | Complete and delete a staging live tasting with the flag off and on |
| 10 | Keyboard, screen reader, 200%/400% zoom, and reduced motion remain usable | Semantic render, rating-keyboard, focus, CSS, and browser checks | Complete the full workflow with assistive technology and supported browsers |
| 11 | Active-tasting camera/library photos become a private slider in the same card opened by Journal and Passport | Photo migration, route, card adapter, and slider render tests | Add at least two photos, complete, open from both surfaces, test the slider, and attempt a cross-customer read |
| 12 | Brewing style selection loads the appropriate editable stage flow and preserves private notes in the Journal | Brewing definition, migration, route, adapter, and rendered-workspace tests | Complete one Gongfu wash-by-wash tasting and one non-infusion method, then verify ordered stages after refresh |
| 13 | Flavor selection exposes the complete categorized vocabulary, aliases and five-choice limit in Tea Lab and live tasting | Palette, migration, journal adapter, and rendered-picker tests | Search by an alias such as peach or nori, select and remove descriptors across categories, verify a sixth selection is blocked, then confirm the saved terms after refresh |

Record the tester, environment, deployed commit, browser/device matrix, timestamps, and evidence links for every scenario. A failure keeps the feature disabled.

## 4. Record release evidence

After all eight migrations and all thirteen scenarios pass, set these deployment-secret timestamps to the actual verification time:

```text
TEA_LAB_MIGRATIONS_VERIFIED_AT=<ISO-8601 timestamp>
TEA_LAB_ACCEPTANCE_VERIFIED_AT=<ISO-8601 timestamp>
```

Both timestamps must be no older than 30 days when `TEA_LAB_ENABLED=true`; `npm run preflight` rejects activation otherwise. Never invent or pre-fill these timestamps.

## 5. Enable and observe

1. Enable Tea Lab on the approved Preview deployment first.
2. Run `npm run preflight` and repeat a short known-tea, manual-tea, offline, privacy, and deletion smoke pass.
3. Confirm operational logs contain only record IDs and safe error classifications—never tasting prose.
4. Enable production during a controlled window with no live-event operational changes in progress.
5. Watch authentication failures, revision conflicts, API 5xx rates, sync retries, and database capacity.

With the flag on, a critical Tea Lab read or descriptor-seed failure produces the generic safe dashboard error and logs only safe source/error codes. It does not silently downgrade to the shipped dashboard. Use the flag-off rollback to restore the shipped customer experience.

## 6. Rollback

1. Set `TEA_LAB_ENABLED=false` and redeploy or promote the last flag-off configuration.
2. Confirm the shipped Home, Tastings, Passport, and Saved Teas dashboard returns.
3. Leave migrations and Tea Lab data in place; disabling the flag must not delete or rewrite stored records.
4. Do not manually reverse migrations during a live event.
5. Preserve device drafts and investigate with safe operation IDs and error codes only.

Re-enable only after the failed acceptance or operational condition has been corrected and new evidence has been recorded.
