# Item 4 — local acceptance of the combined retirement

This folder rehearses the unpublished item 2 and item 3 candidates. It performs no production writes, network requests or payment operations. The application and migration sources are unchanged from item 3; item 4 adds acceptance coverage and evidence.

## Results

- Application: **378 tests in 89 files**, TypeScript and ESLint passed. The item 3 production build remains applicable because application sources, configuration and dependencies have not changed.
- Restored-data preservation: **9 case groups** passed. All **18,240 rows in 122 archived table-data sections** match the original archive and remain unchanged through item 2, item 3, repeat application, both rollbacks and reapplication. Function definitions, owners, grants, RLS policies and sequence state are checked. The archived private photo's bytes still match its custody hash.
- Checkout: **12 case groups before and 12 after retirement**, using the exact existing bridge and restored canonical account/wallet functions. Actual service-role executions test grants and data access. Cases cover account linking, reservation, earning, spending, retries, cancellation, partial/full merchandise refunds, overspending and account boundaries. Every synthetic transaction rolls back.
- Personal records: **10 case groups** passed using the actual authenticated database role and archived RPCs. Save, completion, retry, stale-revision refusal, archive, restore and deletion work. RLS isolates eight private tables. Notes, brewing details, descriptors and photo metadata remain usable, and record operations do not change wallets or ledger entries.
- New application acceptance cases exercise populated owner-scoped dashboards, archived and unstamped cards, private photo reads, old Merchant deep links, resumed live tasting notes and forged ownership/event boundaries.

The preserved canonical snapshot contains **2,278 wallets, 14,973 Gold Leaves, 202 ledger entries and 2,276 store links**. These are backup/rehearsal totals, not a new live balance reading. Every wallet reconciles to its ledger and account mapping.

## Reproduction

The archive and decoded SQL remain outside the repository in restricted private directories. No customer rows, media or role credentials are committed here. Scripts use an isolated in-memory PostgreSQL 17.5 instance from the pinned local PGlite 0.3.16 package. They accept no remote database address. `restore-loader.mjs` restores original owners, effective role capabilities/grants, `auth.uid`, policies and application objects, then turns row security on for acceptance.

From the repository root, with the existing private item 1 backup and local dependencies available:

```sh
python3 ops/tea-cellar-acceptance/restore-prepare.py
node ops/tea-cellar-acceptance/restore-rehearsal.mjs
node ops/tea-cellar-acceptance/checkout-acceptance.mjs
node ops/tea-cellar-acceptance/records-test.mjs
npm run typecheck
npm run lint
npm test -- --reporter=dot
```

Each database runner creates its own isolated restore. Receipts contain source hashes, aggregate counts and test names; private diagnostics remain outside the repository. Read `RESTORE.md` and `checkout-README.md` for the specific rehearsal contracts.

## Limits and next release step

All public, authentication and storage schema/data objects were restored. Eight objects belonging to the unavailable Supabase Vault extension were omitted. Role login credentials/default settings were intentionally omitted; local restore administrators and role-membership grantor provenance were adapted for isolation.

The Mac cannot initialize a native PostgreSQL cluster because its SysV shared-memory slots are exhausted, even with mmap/posix settings. No host settings were changed. There is no running Docker server. This rehearsal therefore does **not** establish native multi-session lock contention or hosted authentication, Storage, Realtime and payment-provider delivery. Bridge payment verification is injected synthetic context; no Stripe or PayPal transaction was sent. Cash refunds without verified merchandise allocation retain the existing review requirement.

Item 5 remains a separate coordinated release: fresh backup and balance reconciliation, exact schema/source drift checks, reviewed deployment order (item 2 then item 3), bounded locks with automatic transaction rollback on failure, and checks of live checkout and personal records after deployment. A schema refusal must be reviewed rather than bypassed. Item 3 rollback precedes item 2 rollback and restores the retired capabilities without rewriting current customer balances or history.
