# Gold Leaves spendable balance and refund debt

This candidate keeps refunds working while enforcing nonnegative spendable Gold Leaves. Production application is a separate, authorized release action. The SQL files do not contact a database automatically.

## Accounting contract

`merchant_wallets.balance` remains the balance exposed by existing account and checkout APIs, and now always means spendable Leaves. The new `refund_debt bigint NOT NULL DEFAULT 0` records earned Leaves reversed by a refund after those Leaves were already spent. Three validated checks require `balance >= 0`, `refund_debt >= 0`, and `balance = 0 OR refund_debt = 0`.

The preserved economic invariant is:

```text
wallet.balance - wallet.refund_debt = sum(wallet ledger leaves_delta)
```

Historical ledger rows are never rewritten. Each new ledger `balance_after` remains the signed economic net, including negative values. A refund can create debt only through the existing trusted `p_allow_negative_balance` path. Ordinary spending still fails when there are insufficient Leaves. Every subsequent credit, including checkout earnings and reservation releases, repays debt before it produces spendable Leaves. Idempotency and wallet row locking remain unchanged.

For example, a wallet with 10 spendable Leaves receiving a 100-Leaf refund reversal becomes `balance = 0`, `refund_debt = 90`, and ledger `balance_after = -90`. A subsequent 40-Leaf credit reduces debt to 50; a later 60-Leaf credit clears it and leaves 10 spendable.

## Scope

Only two existing function definitions change, with their signatures, owners, ACLs, and OIDs retained by `CREATE OR REPLACE FUNCTION`:

- `post_gold_leaves_entry`: computes signed net using `numeric`, verifies that both nonnegative projections fit `bigint`, posts the signed journal entry, and projects spendable balance and debt.
- `gold_leaves_migration_audit_v1`: preserves the economic meaning of existing balance totals and historical comparisons using signed net, and adds `currentWalletSpendableTotal` and `currentWalletRefundDebtTotal`.

No checkout/refund RPC signature, order state transition, customer identity, wallet owner, ledger row, account, tasting record, or historical reward changes. Existing account and store bridge balance fields remain spendable. A separate debt notice in the UI is outside this database change.

The arithmetic range is deliberately symmetric: signed net must be between `-9223372036854775807` and `9223372036854775807`. The minimum signed bigint cannot be represented as a nonnegative bigint debt, so that projection fails atomically with SQLSTATE `22003` before a journal entry is inserted.

## Application and guard behavior

`apply.sql` is transactional, has a 5-second lock timeout and a 60-second statement timeout, and requires PostgreSQL 17. It locks the wallet and ledger tables before reconciliation and DDL. It verifies the exact reviewed original or applied function definitions, expected wallet columns/defaults, exact constraint definitions, and complete migration state. Unexpected checks, wallet row triggers, partial state, function drift, and ledger mismatches are refused.

Application additionally refuses preexisting negative wallet balances; it does not silently convert them. The fresh reviewed live preflight had 2,278 wallets, 14,973 Leaves, no negative balances, and no ledger mismatches. These are evidence from that capture, not a substitute for release-time checks. Adding the constant default debt column does not issue an `UPDATE`, so original balances and `updated_at` values remain unchanged. Repeating the complete applied migration is safe; damaged or partially applied states are refused.

The retired `purchase_study_copy(uuid)` denial is fingerprinted as a prerequisite. Its former marketplace implementation updated wallet columns directly and must not be restored while the split balance/debt representation is active. The application guard also refuses unreviewed wallet triggers so rollback cannot introduce hidden row-trigger side effects.

## Explicit rollback

`rollback.sql` is a separate operator action with the same transaction, lock, shape, definition, and reconciliation guards. It restores the two original function definitions, converts only indebted wallets to their former signed balance (`balance - refund_debt`), and removes the added column/checks. It does not forgive debt, modify journal entries, or change wallet `updated_at` timestamps. With no outstanding debt, original wallet rows remain untouched.

Rollback can therefore restore negative legacy balances. Reapplication then refuses until that legacy debt is naturally repaid or an explicit conversion migration is reviewed. Roll this migration back before restoring any old marketplace writer. A dependent view or other new object using `refund_debt` causes the column drop to fail atomically; the script never uses `CASCADE`.

## Provenance and rehearsal

`manifest.json` records the exact before/after definitions, function metadata captured from the live read-only inspection, source hashes, checks, and accounting invariant. `build.py` reconstructs the SQL from the scoped `work/balance-guard/live-functions.json`, `live-preflight.json`, and the existing retirement manifest. It performs no database calls. Selected definitions contain no customer rows or embedded credentials. Rebuilding requires those same local source receipts; it is not a production execution step.

Independent acceptance tests and their receipt are maintained separately by the acceptance reviewer. They use the isolated restored PostgreSQL 17 database, released retirement migrations, and synthetic customers/orders; no real refunds or production writes are part of rehearsal. Release should proceed only after those tests pass and the fresh private preservation baseline has been verified.

The independent rehearsal completed on PostgreSQL 17.5 (PGlite 0.3.16) at `2026-10-01T04:03:58.613Z`: all 13 acceptance groups passed, including all 12 existing checkout bridge groups. `test-result.json` records the source hashes and coverage. The tests verify every archived table's historical rows, unchanged ledger data, unchanged unrelated functions, function identity/owners/ACLs, repeat application, native and WooCommerce refunds, repayment by credits/earnings/releases, insufficient-funds refusal, bigint boundaries, retry atomicity, and both rollback paths. They executed no network calls or production mutations.

With the existing private restore sources and isolated runtime available, run from the repository root:

```sh
node ops/gold-leaves-balance-guard/test.mjs
```

The runner also rehearses the parent's release wrapper from `work/balance-guard/atomic-apply.sql`; that wrapper's hash is in the receipt. This is a single-session PostgreSQL WASM rehearsal, so it makes no native concurrency claim. Provider verification and bridge transport are injected locally; no payment-provider operation is represented as a live test. Private restore input and diagnostic files are outside this committed folder.
