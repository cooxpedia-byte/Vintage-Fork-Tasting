-- Commerce project fugvpupuwgbnojkyptym only. This is not a tasting migration.
-- Expand one existing note source gate while retaining its current function
-- body, owner, authorization, recipient/version fences, configuration and ACL.
-- No orders, deliveries or notes are written by this patch.
BEGIN;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $patch$
DECLARE
  function_oid oid := to_regprocedure('vf_legacy_import_v1.vf_customer_note_context_v1(text,text)');
  before_proc pg_proc%rowtype;
  after_proc pg_proc%rowtype;
  old_gate constant text := 'IF o.source NOT IN(''web'',''subscription_renewal'') THEN reason:=''order_unavailable''; END IF;';
  new_gate constant text := 'IF o.source NOT IN(''web'',''subscription_renewal'',''matcha_subscription'') THEN reason:=''order_unavailable''; END IF;';
  expected_body text;
BEGIN
  IF function_oid IS NULL THEN RAISE EXCEPTION 'VF_MATCHA_NOTE_CONTEXT_MISSING'; END IF;
  SELECT * INTO STRICT before_proc FROM pg_proc WHERE oid = function_oid;
  IF NOT before_proc.prosecdef OR before_proc.provolatile <> 's'
    OR before_proc.prorettype <> 'jsonb'::regtype
    OR NOT coalesce('search_path=pg_catalog' = ANY(before_proc.proconfig), false)
    OR position('vf_legacy_import_v1.vf_admin_is_owner_v1()' IN before_proc.prosrc) = 0
    OR position('recipient_missing_or_invalid' IN before_proc.prosrc) = 0
    OR position('sha256(convert_to(jsonb_build_array(' IN before_proc.prosrc) = 0
  THEN RAISE EXCEPTION 'VF_MATCHA_NOTE_CONTEXT_CONTRACT_CHANGED'; END IF;

  IF position(old_gate IN before_proc.prosrc) > 0 THEN
    IF (length(before_proc.prosrc) - length(replace(before_proc.prosrc, old_gate, ''))) <> length(old_gate)
      OR position(new_gate IN before_proc.prosrc) > 0
    THEN RAISE EXCEPTION 'VF_MATCHA_NOTE_SOURCE_GATE_CHANGED'; END IF;
    expected_body := replace(before_proc.prosrc, old_gate, new_gate);
    EXECUTE replace(pg_get_functiondef(function_oid), old_gate, new_gate);
  ELSE
    IF (length(before_proc.prosrc) - length(replace(before_proc.prosrc, new_gate, ''))) <> length(new_gate)
    THEN RAISE EXCEPTION 'VF_MATCHA_NOTE_SOURCE_GATE_CHANGED'; END IF;
    expected_body := before_proc.prosrc;
  END IF;

  SELECT * INTO STRICT after_proc FROM pg_proc WHERE oid = function_oid;
  IF after_proc.prosrc IS DISTINCT FROM expected_body
    OR row(after_proc.proowner, after_proc.proacl, after_proc.proconfig, after_proc.prosecdef,
      after_proc.provolatile, after_proc.prorettype, after_proc.proargtypes)
      IS DISTINCT FROM row(before_proc.proowner, before_proc.proacl, before_proc.proconfig, before_proc.prosecdef,
      before_proc.provolatile, before_proc.prorettype, before_proc.proargtypes)
  THEN RAISE EXCEPTION 'VF_MATCHA_NOTE_CONTEXT_NOT_PRESERVED'; END IF;
END $patch$;
COMMIT;
