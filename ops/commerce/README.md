# Product units report: commerce database reader

`historical-product-units-v1.sql` belongs to the separate Vintage Fork commerce Supabase project `fugvpupuwgbnojkyptym`. It is an owner-only, aggregate reader over the saved previous-store order archive. It does not change orders, products, payments, inventory, or customer data. Do not apply it to the tasting app database.

The SQL SHA-256 is `0f264d91ba68d37d75ea66ecbfba8bb3ffa86b8583ed957f27938ea4505ed0e0`. On October 2, 2026, it passed a rollback-only live database test and was applied to the commerce project. Readback confirmed `authenticated` can execute the RPC while `anon` and `service_role` cannot. A simulated existing owner call returned 210 recorded Tea Advent Calendar units for year to date.

The source archive marks its payment and refund information unverified. The UI keeps new-store and previous-store counts separate and labels the combined figure an estimate. Products without a previous-store ID show archive and combined counts as unavailable.

`verify-historical-product-units-v1.sql` contains read-only permission and Advent Calendar aggregate checks.
