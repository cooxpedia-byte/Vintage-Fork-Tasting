# Canonical archive restore and preservation rehearsal

The unpublished item 2 and item 3 SQL candidates passed **9 archive restoration/preservation cases** in actual PostgreSQL **17.5** through pinned `@electric-sql/pglite` **0.3.16**. `restore-result.json` contains aggregate evidence, source hashes and limitations. The loader, rehearsal and probe passed ESLint.

This used the complete item 1 canonical archive as input, with explicit exclusions for the unavailable Supabase Vault extension. It restored **1,691 archive entries and 122 table-data sections**, including every archived `public`, `auth` and `storage` object. Eight Vault extension/dependent entries were excluded and are listed in the receipt. This is substantially broader than item 3's synthetic selected-schema fixture, but it is not an exact hosted Supabase environment.

Every restored table matched the original archive's exact COPY field bytes as a **row multiset**, including duplicate multiplicity and row counts. The two auth tables changed physical row order during restoration; their complete row multisets matched exactly. Physical heap order is not a preservation requirement. Those 122 table digests remained unchanged after item 2, item 3, repeated item 3, both separate rollbacks and reapplication of both candidates. The original function/trigger definitions, owners, ACLs, RLS policies, table privileges and sequence state returned exactly after rollback. All 35 protected function definitions/ACLs remained unchanged after item 3.

The recorded **2,278 wallets, 14,973 Leaves, 202 ledger entries and 2,276 store links** reconcile with zero ledger/balance or owner/mapping mismatches. Captured canonical media files retained their original custody byte counts and SHA-256 hashes. No customer rows, media bytes, credentials or raw restored schema were placed in this repository. No live changes were made.

## Reproduction

From the repository root, with the existing private backup and isolated PGlite package available:

```sh
python3 ops/tea-cellar-acceptance/restore-prepare.py
node ops/tea-cellar-acceptance/restore-rehearsal.mjs
./node_modules/.bin/eslint ops/tea-cellar-acceptance/restore-loader.mjs ops/tea-cellar-acceptance/restore-rehearsal.mjs ops/tea-cellar-acceptance/restore-probe.mjs
```

The preparer uses local PostgreSQL 17 `pg_restore` to decode the existing archive. It makes no remote call or new snapshot. Decoded SQL, detailed diagnostics and table-level private hashes are stored only in the sibling `work/acceptance-private` directory (0700; files 0600). Full archive rows load into ephemeral PGlite memory; no server, network endpoint or persistent database directory is created. Final output is aggregate-only. Failure details remain in the private directory, while stdout prints a fixed failure category.

`restore-loader.mjs` exports `createRestoredDatabase()`, returning `{ db, metadata }`. Callers must close `db` in `finally`. Each call creates an independent restored database. Other acceptance modules can use synthetic data inside transactions and roll it back; original auth functions, profile-creation triggers, roles, privileges and RLS policies are present. The loader resets `row_security=on` after pg_dump's restore-only preamble, matching normal application sessions.

The receipt fingerprints the native archive, decoded SQL, separate `roles.sql`, all four applied/rolled-back SQL files, loader and rehearsal. No application dependencies were changed. PGlite is loaded from the existing isolated package at `../pglite-tests/pg17/node_modules/@electric-sql/pglite`, relative to this repository root.

## Deliberate isolation adaptations and limits

- Original role capabilities and membership options are restored. Login credentials and per-role defaults are omitted, every imported role is NOLOGIN, and membership grantor provenance is assigned to the local restore administrator. Two isolated administrative roles are added so archived `postgres` can retain its original non-superuser capabilities and object ownership. This is not a login/authentication-service rehearsal.
- The unsupported `supabase_vault` extension and its eight dependent archive entries are excluded. No placeholder security implementation replaces them. `pgcrypto`, `uuid-ossp`, `pg_stat_statements`, auth/public/storage definitions and archived policies are restored.
- RLS and function execution can be exercised through explicit local roles and JWT session settings, but hosted GoTrue authentication, Storage HTTP service behavior and Realtime delivery are not reproduced.
- Native PostgreSQL 17.11 initialization was attempted with explicit `shared_memory_type=mmap` and `dynamic_shared_memory_type=posix`. macOS still refused the required small SysV shared-memory segment. No sysctl, IPC resources or host services were changed. Docker CLI was present, but no running Docker server was available; none was started or installed.
- PGlite has one in-memory PostgreSQL session. **Native simultaneous-session locking/concurrency remains unverified.** Sequential retry/idempotency checks are separate evidence and cannot substitute for concurrency acceptance.
- This rehearsal uses the item 1 snapshot, not current production state. A future release still requires the reviewed fresh snapshot/schema checks and explicit deployment authorization. Existing held obligations and generic privileged external ledger writers remain subject to the item 3 documented scope.
