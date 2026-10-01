-- UNAPPLIED CANDIDATE: canonical umrq personal-record separation, item 2 only.
-- Reviewed against the 2026-10-01 preservation archive. No data or function rewrites.
-- Explicit marketplace/catalog refresh and reward shutdown belong to item 3.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
-- Keep pg_get_triggerdef qualification deterministic and resolve catalog names
-- outside the caller's search_path.
SET LOCAL search_path = pg_catalog, pg_temp;

-- Serialize inspection and detachment against record writes and competing DDL.
LOCK TABLE public.tasting_cards, public.tea_responses IN ACCESS EXCLUSIVE MODE;

DO $records$
DECLARE
  spec record;
  actual record;
  present_count integer := 0;
BEGIN
  -- These dependencies distinguish the canonical marketplace schema from the
  -- storefront's separate tasting tables. Do not create or repair dependencies.
  IF to_regclass('public.merchant_wallets') IS NULL
     OR to_regclass('public.merchant_ledger_entries') IS NULL
     OR to_regclass('public.merchant_card_progress') IS NULL
     OR to_regprocedure('public.refresh_merchant_card_progress(uuid)') IS NULL
     OR to_regprocedure('public.sync_merchant_progress_from_card()') IS NULL
     OR to_regprocedure('public.sync_merchant_progress_from_live_stamp()') IS NULL THEN
    RAISE EXCEPTION 'tea_records_canonical_schema_required';
  END IF;

  FOR spec IN SELECT * FROM (VALUES
    ('tasting_cards', 'tasting_cards_sync_merchant_progress',
     'CREATE TRIGGER tasting_cards_sync_merchant_progress AFTER INSERT OR UPDATE OF completed_at, canonical_tea_id, personal_tea_record_id, product_identifier_snapshot, tea_name_snapshot ON public.tasting_cards FOR EACH ROW EXECUTE FUNCTION public.sync_merchant_progress_from_card()'),
    ('tea_responses', 'tea_responses_sync_merchant_progress',
     'CREATE TRIGGER tea_responses_sync_merchant_progress AFTER INSERT OR UPDATE OF completed_at, stamp_released_at ON public.tea_responses FOR EACH ROW EXECUTE FUNCTION public.sync_merchant_progress_from_live_stamp()')
  ) AS expected(table_name, trigger_name, definition)
  LOOP
    SELECT t.tgenabled, t.tgisinternal, pg_get_triggerdef(t.oid, false) AS definition
      INTO actual FROM pg_trigger t
      WHERE t.tgrelid = to_regclass('public.' || spec.table_name)
        AND t.tgname = spec.trigger_name;
    IF FOUND THEN
      IF actual.tgisinternal OR actual.tgenabled <> 'O'
         OR actual.definition IS DISTINCT FROM spec.definition THEN
        RAISE EXCEPTION 'tea_records_trigger_drift: %', spec.trigger_name;
      END IF;
      present_count := present_count + 1;
    END IF;
  END LOOP;

  -- A renamed/duplicate attachment could silently preserve the coupling.
  IF EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE t.tgrelid IN ('public.tasting_cards'::regclass, 'public.tea_responses'::regclass)
      AND t.tgfoid IN (
        'public.sync_merchant_progress_from_card()'::regprocedure,
        'public.sync_merchant_progress_from_live_stamp()'::regprocedure)
      AND NOT ((t.tgrelid = 'public.tasting_cards'::regclass AND t.tgname = 'tasting_cards_sync_merchant_progress')
            OR (t.tgrelid = 'public.tea_responses'::regclass AND t.tgname = 'tea_responses_sync_merchant_progress'))
  ) THEN
    RAISE EXCEPTION 'tea_records_unexpected_progression_attachment';
  END IF;

  IF present_count = 0 THEN
    -- Exact repeat: no records, grants, functions or derived state are changed.
    RETURN;
  ELSIF present_count <> 2 THEN
    RAISE EXCEPTION 'tea_records_partial_trigger_state';
  END IF;

  DROP TRIGGER tasting_cards_sync_merchant_progress ON public.tasting_cards;
  DROP TRIGGER tea_responses_sync_merchant_progress ON public.tea_responses;
END
$records$;
COMMIT;
