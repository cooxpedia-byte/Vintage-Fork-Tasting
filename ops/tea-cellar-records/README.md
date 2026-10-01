# Personal tasting records: unapplied database candidate

This is item 2 of the clean break. It has **not been applied to any live database**.
The application source baseline is GitHub main `4ea9eaaf`; the trigger definitions
were read from the canonical database preservation archive captured October 1,
2026. This folder contains synthetic test data only.

`apply.sql` atomically detaches two canonical database triggers:

- `tasting_cards_sync_merchant_progress` on `public.tasting_cards`.
- `tea_responses_sync_merchant_progress` on `public.tea_responses`.

The first fires on solo record insert and completion/tea-identity updates. The
second fires on live response insert and updates that include `completed_at` or
`stamp_released_at`. The current live notes POST includes `completed_at` on every
upsert, so removing only the first trigger would leave live notes coupled to
marketplace pricing and progression.

Both hooks call derived progression refresh, which can rebuild progression and
update active/paused listing prices and snapshots. Personal records should not
depend on that work succeeding. The candidate changes only these attachments.
It does not rewrite notes, card IDs, ownership, market history, function bodies,
permissions, wallets, ledger entries, checkout state or authentication. Existing
touch, scope-validation and stamp-release triggers remain attached. The
storefront database has separate tasting tables without these two hooks; this
candidate is for the canonical wallet/tasting schema only.

The exact definitions and normal enabled state must match before either hook is
removed. Both already absent is an idempotent no-op. Mixed presence, definition
drift, disabled hooks, or renamed/duplicate attachments to either progression
function are refused. The two record tables are locked for the brief transaction
with a five-second lock timeout; no partial detachment commits on error.
These checks cover the reviewed two hooks, not arbitrary future functions or
every possible new trigger. A new schema requires another review.

Record readers must use the owner-scoped personal record tables, not merchant
read RPCs. `get_my_merchant_cards` and `refresh_my_merchant_cards` can initialize
a wallet and rebuild progression. Their shutdown, catalog-driven refresh,
marketplace permissions/routes and game/reward producers are **item 3**, and are
not changed here. Existing protected save/complete/archive RPCs retain their
ownership, revision and retry rules. No new client-controlled bypass is added.

`rollback.sql` is a separate manual candidate. It reattaches only the two exact
original hooks after equivalent drift checks. It does not refresh progression
or revert customer data; future record writes would again invoke the old hooks.
Nothing in this folder invokes rollback automatically.

## Local behavior test

**Actual result: all 16 cases passed on PostgreSQL 17.5 (170005), running through
official `@electric-sql/pglite` 0.3.16 in ephemeral WebAssembly memory.** The
machine-readable receipt is `test-result-pglite.json`; it records every case,
engine build, completion time and the exact tested source hashes. The runner also
passes the repository's ESLint configuration.

From this application checkout, reproduce without changing application dependencies:

```sh
npm install --prefix ../pglite-tests/pg17 --cache ../pglite-tests/cache \
  --ignore-scripts --no-audit --no-fund --save-exact @electric-sql/pglite@0.3.16
node ops/tea-cellar-records/test.mjs
```

An alternate absolute package directory can be passed as the sole runner argument.
The runner requires that exact package version and actual PostgreSQL 17.5 engine.
It supplies no persistence directory or connection settings, starts no native
server and does not change host shared-memory resources. This PGlite version uses
the built-in `template1` database despite its database-name option. The fixture
permits that name only with explicit synthetic opt-in, an Emscripten engine and
PostgreSQL 17; it still requires an empty public schema. Two negative cases prove
that missing opt-in and nonempty fixture state are refused. The native fixture
database-name guard remains intact.

The 16 cases cover both fixture guards, apply, repeat apply, personal/live record
writes, rollback, repeat rollback, apply/rollback rejection of definition drift,
disabled hooks, partial state and duplicate attachments, plus the positive control.
Failures explicitly roll back the in-memory connection before proving that all
data, functions and trigger definitions remain unchanged.

The WebAssembly run does not exercise native multi-session lock contention or a
full application/checkout acceptance flow. It executes the actual unapplied
`apply.sql` and `rollback.sql` unchanged; no production database is contacted.

### Optional native PostgreSQL runner

`test.py` requires an **already running**, disposable PostgreSQL 17 instance
exposed through a local Unix socket, and a newly created empty database named
`vf_records_test_<suffix>`. It will not start a server, create/drop databases,
read saved credentials, or connect to a network hostname. The caller owns setup
and cleanup. Example, replacing the socket/database/owner with local test values:

```sh
python3 ops/tea-cellar-records/test.py \
  --host /absolute/path/to/local/test/socket \
  --port 5432 \
  --database vf_records_test_example \
  --username local_test_owner
```

The fixture exercises actual PostgreSQL triggers and record writes. Its synthetic
progression function deliberately changes mock prices, wallets and ledger values
if reached. Save, completion and live upsert after detachment must preserve all
economic state while keeping record IDs, attachments and unrelated trigger
behavior. Tests also cover repeat application, separate/repeated rollback,
changed definitions, disabled triggers, partial state and duplicate attachments.
A positive control proves both restored hooks can reach the mock economic effects.
The fixture does not recreate the full application, authentication system or
checkout integration, and is not a live customer acceptance test.

The native runner was not executed because native PostgreSQL could not initialize
with the host's available SysV shared-memory resources. No host resource settings
were changed. The PostgreSQL 17 WebAssembly behavior run above completed instead.
Keep the SQL unapplied until the combined candidate is reviewed and publication
is separately authorized.
