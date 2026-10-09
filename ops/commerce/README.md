# Product units report: commerce database reader

`historical-product-units-v1.sql` belongs to the separate Vintage Fork commerce Supabase project `fugvpupuwgbnojkyptym`. It is an owner-only, aggregate reader over the saved previous-store order archive. It does not change orders, products, payments, inventory, or customer data. Do not apply it to the tasting app database.

The SQL SHA-256 is `0f264d91ba68d37d75ea66ecbfba8bb3ffa86b8583ed957f27938ea4505ed0e0`. On October 2, 2026, it passed a rollback-only live database test and was applied to the commerce project. Readback confirmed `authenticated` can execute the RPC while `anon` and `service_role` cannot. A simulated existing owner call returned 210 recorded Tea Advent Calendar units for year to date.

The source archive marks its payment and refund information unverified. The UI keeps new-store and previous-store counts separate and labels the combined figure an estimate. Products without a previous-store ID show archive and combined counts as unavailable.

`verify-historical-product-units-v1.sql` contains read-only permission and Advent Calendar aggregate checks.

## Unified admin order search

`order-search-v2.sql` adds one owner-only, read-only search over customer names, exact order numbers, delivery postal codes, and delivery cities in both stores. It keeps `vf_admin_order_search_v1` available while the website changes over to the v2 RPC. The new RPC ranks name matches first and returns `matchedBy` so the interface can explain each result.

Apply this script as `postgres` to the pinned **commerce** project after verifying a fresh backup, then run `verify-order-search-v2.sql` there. The verifier checks permissions, result shape, source filtering, and representative matches without printing customer details. Install and verify v2 before deploying website code that calls it. These `ops/commerce` scripts are not part of `supabase/migrations`; `supabase db push` will not install the function.

## Matcha invoice orders in the admin dashboard

The native order detail accepts saved `matcha_subscription` rows with nonempty Stripe subscription and invoice IDs. Order lists, email status, private notes and operation readers already accept their native UUID references. Generic order status changes remain unavailable for Matcha orders; fulfillment uses the Matcha invoice ledger.

`matcha-admin-orders-v1.sql` expands the existing customer-note context's source gate to include Matcha. Apply it separately as `postgres` to **commerce** project `fugvpupuwgbnojkyptym`, after reviewing the current helper definition and backup. Its guarded replacement retains the current body, owner, grants, configuration, authorization and recipient/version fences. It fails if the expected source gate or function contract has changed, and supports repeated application. It does not create or deliver notes or change orders.

The storefront's `202610080001_matcha_invoice_orders.sql` migration must already be installed in the commerce project to create these native order records from the verified Matcha ledger. Neither the dashboard change nor this note-context patch backfills previously paid invoices. Any missing historical order needs a separate reviewed reconciliation against its ledger/payment evidence.

Local regression checks:

```sh
npm test -- tests/native-order-detail.test.ts tests/matcha-admin-orders.test.ts tests/customer-order-note-integration.test.ts tests/private-order-note-integration.test.ts tests/customer-order-notes.test.ts tests/order-email-status.test.ts
```

`tests/matcha-admin-orders-v1.sql` is a destructive fixture for an **empty disposable local database only**. It creates synthetic tables, roles and the existing context helper, applies the patch twice, and checks authorization, saved recipients, recipient/version changes, unknown sources, unchanged web/renewal/imported results, and unchanged function metadata. Run it through `psql -v ON_ERROR_STOP=1 -f ops/commerce/tests/matcha-admin-orders-v1.sql` using an explicitly selected local socket and test database. Never run this fixture against the commerce or tasting database.

After the positive fixture, run `tests/matcha-admin-orders-changed-gate.sql` in that same local database, then run the patch again with `ON_ERROR_STOP=1`. This rejection test must exit nonzero with `VF_MATCHA_NOTE_SOURCE_GATE_CHANGED`, preserving the unexpected helper definition rather than replacing it.
