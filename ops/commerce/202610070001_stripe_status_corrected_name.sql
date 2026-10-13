-- Target: existing commerce project fugvpupuwgbnojkyptym.
-- Customer display-name corrections must not disable fulfillment controls.
-- All payment, email, address, total, inventory and refund checks remain exact.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='15s';
DO $migration$
DECLARE definition text; field text;
BEGIN
  definition := pg_get_functiondef('vf_legacy_import_v1.vf_admin_stripe_native_safe_v1(uuid)'::regprocedure);
  IF encode(sha256(convert_to(definition,'UTF8')),'hex') <> '5099b4740ef67b145c9bf7e6ba44062701190643570d5687a3bb05d742aa563b' THEN
    RAISE EXCEPTION 'Status verification rule changed; re-review required';
  END IF;
  FOREACH field IN ARRAY ARRAY['a.shipping_address','a.contact_snapshot','o.shipping_address','o.billing_address'] LOOP
    IF length(definition)-length(replace(definition,field||',','')) <> length(field||',') THEN
      RAISE EXCEPTION 'Unexpected status comparison shape';
    END IF;
    definition := replace(definition,field||',','('||field||' - ''name''),');
  END LOOP;
  EXECUTE definition;
END $migration$;
COMMIT;
