# Offline checkout loyalty acceptance

Run `node ops/tea-cellar-acceptance/checkout-acceptance.mjs` from the app checkout after the private restore inputs have been prepared by `restore-loader.mjs`.

The runner restores the archived canonical database into isolated PostgreSQL 17.5 via PGlite. It imports the current storefront's actual `supabase/shared-loyalty/store-bridge.mjs`; its transport accepts only explicit synthetic routes. Global network fetch is disabled during checkout cases. No payment provider or production database is called.

The same 12 case groups run before and after the actual item2 and item3 migrations. They cover:

- Trusted service execution, anonymous/customer denial, account connection conflicts, and verified activation.
- Reservation, exact retries, changed account/amount rejection, eligible-spend limits, and insufficient balance.
- Earning only after a verified paid context, whole-dollar calculation, and settlement retries.
- Cancellation/release, stale settlement rejection, proportional partial/full refund, and refund debt.
- Account-scoped history/quotes, cash-refund review, and a changed verification snapshot.
- Complete rollback of synthetic account and order activity, with exact historical row digests and totals.

Successful canonical RPCs and canonical REST reads execute as the restored `service_role`. Setup and preservation snapshots use the isolated restore administrator. Anonymous and customer-role denials are exercised under their actual roles.

`checkout-result.json` records source hashes, the restored engine, per-stage case names, effective service-role call counts, aggregate historical baselines, and synthetic totals separately. Each stage creates three synthetic wallets and 15 ledger entries, ends with 1,525 synthetic Leaves, then rolls all synthetic activity back. Historical totals remain 2,278 wallets, 202 ledger entries, and 14,973 Leaves.

Limits: this is a full archived-database rehearsal, not native multi-session concurrency testing. Provider verification and native-store commerce responses are synthetic. The bridge's existing rule requires review when only aggregate cash-refund information is available; refund tests supply explicit verified merchandise allocations to the canonical refund RPC. Live Stripe/PayPal callbacks, actual charges, cash refunds, and external scheduled delivery are not tested.
