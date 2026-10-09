-- Run only after the positive fixture, in the same disposable local database.
-- The migration must subsequently fail with VF_MATCHA_NOTE_SOURCE_GATE_CHANGED.
\set ON_ERROR_STOP on
DO $fixture$
DECLARE
  target oid := 'vf_legacy_import_v1.vf_customer_note_context_v1(text,text)'::regprocedure;
  gate constant text := 'IF o.source NOT IN(''web'',''subscription_renewal'',''matcha_subscription'') THEN reason:=''order_unavailable''; END IF;';
  drifted_gate constant text := 'IF o.source NOT IN(''web'',''subscription_renewal'',''matcha_subscription'',''unexpected_source'') THEN reason:=''order_unavailable''; END IF;';
BEGIN
  EXECUTE replace(pg_get_functiondef(target), gate, drifted_gate);
END $fixture$;
