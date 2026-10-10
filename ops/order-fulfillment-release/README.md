# Shared order completion release

Paid Matcha invoice orders lacked a status capability even though their detail pages opened. The shared order control now offers **Mark completed** on every eligible processing order. Matcha completion requires a staff fulfillment reference and uses the existing invoice fulfillment ledger before projecting the order and items. Completed POS orders open normally and remain terminal.

## Database release

The application uses `public.vf_admin_set_order_status_v2`. Install the guarded database patch before deploying this application. The previous v1 signature remains compatible for existing web and imported callers. This release does not complete any real order or call a payment provider.

`apply.template.sql` is a review template. Its commerce project and Stripe account identifiers are placeholders; the exact tested operational artifact is retained privately. Only substitute the already verified live account, then repeat the schema/definition guards, synthetic tests and rolled-back live validation. Do not execute the placeholder template. Customer records, live function captures and credentials are intentionally excluded from this public directory.

Exact applied operational artifact SHA256: `c187fe1ea9efc37d5c4fd476574f83fc894061ff976adb83a73d9cfb9fdbd36c`.

Rollback SHA256: `8655f73e4c4ff532de7a2189c0cdfe334c2fa882336218a3b13f728fa3ee8ea7`.

The patch preserves owner binding, function ownership and execute permissions, payment/invoice lineage, refund and review fences, source/revision checks, replay protection and the completion email queue. Matcha locks follow the existing invoice materializer order, including payment allocation rows before payment proof is evaluated. Unsupported ordinary renewals remain read-only until independent payment evidence exists. The inventory enforcement pause is preserved; verified Stripe web completion does not require a stock commit marker.

## Validation and recovery

All 902 application tests, TypeScript, lint and production webpack build passed. The isolated PostgreSQL harness passed 32 synthetic checks, including completion/email atomicity, exact replay, payment races, invoice-first concurrency, refund/review rejection, Stripe with inventory paused, PayPal/imported compatibility and terminal POS protection. `acceptance.json` records the checks and exact operational hashes. Imported contact lookup uses synthetic fixtures; native completion dependencies are current schema-only captures.

Live installation is permitted only after an exact-artifact transaction successfully installs, validates function/security contracts and eligibility, then rolls back. Installation repeats the same assertions before committing; a separate read-only verifier confirms the committed state. Release verification opens the live completion forms without submitting them. Real fulfillment remains a staff decision.

Restore the previous application before using `rollback.sql`. The guarded rollback restores only the prior function definitions and removes the two new functions. It never reverses fulfillment history, order audit entries or queued notifications. Stop if the installed function bodies or metadata have changed.
