-- Read-only post-application checks for unified order search. Run in
-- the SQL editor as postgres. Customer names and addresses are never printed.
BEGIN TRANSACTION READ ONLY;
SET LOCAL search_path = pg_catalog;
SET LOCAL statement_timeout = '30s';

-- Expected: one stable security-definer RPC, fixed search path, only the
-- authenticated API role able to execute it.
SELECT p.proname,
  p.prosecdef AS security_definer,
  p.provolatile = 's' AS stable,
  'search_path=pg_catalog' = ANY(p.proconfig) AS fixed_search_path,
  'statement_timeout=8000' = ANY(p.proconfig) AS bounded_execution,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_execute
FROM pg_proc p
WHERE p.oid = to_regprocedure(
  'public.vf_admin_order_search_v2(text,text,integer,integer)');

-- Simulate an existing owner claim only inside this read-only transaction.
-- All response inspection remains inside the anonymous block. No PII, row
-- identifiers, or search terms are emitted to the SQL editor's result grid.
DO $verify$
DECLARE
  owner_id uuid;
  response jsonb;
  legacy_response jsonb;
  result_rows jsonb;
  city_all jsonb;
  city_native jsonb;
  city_imported jsonb;
  postal_compact jsonb;
  postal_spaced jsonb;
  sample_number text;
  denied boolean := false;
  invalid_query boolean := false;
  expected_envelope text[] := ARRAY['kind','rows','total','nextOffset','archiveSnapshotAt'];
  expected_row text[] := ARRAY[
    'source','orderId','orderNumber','matchedBy','status','placedAt','customerName',
    'deliveryCity','postalCode','totalCents','recordedTotal','currency'];
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid = to_regprocedure(
      'public.vf_admin_order_search_v2(text,text,integer,integer)')
      AND p.prosecdef AND p.provolatile = 's'
      AND 'search_path=pg_catalog' = ANY(p.proconfig)
      AND 'statement_timeout=8000' = ANY(p.proconfig)
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
      AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
      AND NOT has_function_privilege('service_role', p.oid, 'EXECUTE')
  ) THEN RAISE EXCEPTION 'VF_ORDER_SEARCH_PRIVILEGES_INVALID'; END IF;
  SELECT a.user_id INTO owner_id
  FROM vf_legacy_import_v1.review_access a
  JOIN public.profiles p ON p.id = a.user_id AND p.role = 'admin'
  ORDER BY a.user_id LIMIT 1;
  IF owner_id IS NULL THEN RAISE EXCEPTION 'VF_ORDER_SEARCH_NO_OWNER_FOR_VERIFY'; END IF;
  PERFORM set_config('request.jwt.claim.sub', owner_id::text, true);

  response := public.vf_admin_order_search_v2('a', 'all', 0, 50);
  IF jsonb_typeof(response) <> 'object'
    OR response->>'kind' <> 'order-search'
    OR NOT response ?& expected_envelope
    OR response - expected_envelope <> '{}'::jsonb
    OR jsonb_typeof(response->'rows') <> 'array'
    OR jsonb_typeof(response->'total') <> 'number'
    OR jsonb_array_length(response->'rows') > 50
    OR (response->>'total')::bigint < jsonb_array_length(response->'rows')
    OR (response->'nextOffset' <> 'null'::jsonb
      AND (response->>'nextOffset')::integer <> 50)
    OR jsonb_typeof(response->'archiveSnapshotAt') NOT IN ('string', 'null')
  THEN RAISE EXCEPTION 'VF_ORDER_SEARCH_ENVELOPE_INVALID'; END IF;
  result_rows := response->'rows';
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(result_rows) AS entry(row_value)
    WHERE jsonb_typeof(entry.row_value) <> 'object'
      OR NOT entry.row_value ?& expected_row
      OR entry.row_value - expected_row <> '{}'::jsonb
      OR entry.row_value->>'source' NOT IN ('native', 'imported')
      OR entry.row_value->>'matchedBy' NOT IN ('name', 'orderNumber', 'postal', 'city')
      OR (entry.row_value->>'source' = 'native'
        AND entry.row_value->'recordedTotal' <> 'null'::jsonb)
      OR (entry.row_value->>'source' = 'imported'
        AND entry.row_value->'totalCents' <> 'null'::jsonb)
  ) THEN RAISE EXCEPTION 'VF_ORDER_SEARCH_ROW_INVALID'; END IF;
  IF EXISTS (
    SELECT 1 FROM (
      SELECT CASE entry.row_value->>'matchedBy'
        WHEN 'name' THEN 0 WHEN 'orderNumber' THEN 1
        WHEN 'postal' THEN 2 ELSE 3 END AS match_rank,
        lag(CASE entry.row_value->>'matchedBy'
          WHEN 'name' THEN 0 WHEN 'orderNumber' THEN 1
          WHEN 'postal' THEN 2 ELSE 3 END)
          OVER (ORDER BY entry.ordinality) AS previous_rank
      FROM jsonb_array_elements(result_rows) WITH ORDINALITY AS entry(row_value, ordinality)
    ) ranked WHERE previous_rank > match_rank
  ) THEN RAISE EXCEPTION 'VF_ORDER_SEARCH_RANK_INVALID'; END IF;
  IF to_regprocedure('public.vf_admin_order_search_v1(text,text,text,text,integer,integer)')
    IS NOT NULL THEN
    legacy_response := public.vf_admin_order_search_v1('a', NULL, NULL, 'all', 0, 50);
    IF (response->>'total')::bigint < (legacy_response->>'total')::bigint
    THEN RAISE EXCEPTION 'VF_ORDER_SEARCH_NAME_MATCH_INVALID'; END IF;
  END IF;

  -- Each source contributes to the same unified search. Query terms are
  -- synthetic/common values, and only counts are compared inside this block.
  city_all := public.vf_admin_order_search_v2('Edmonton', 'all', 0, 50);
  city_native := public.vf_admin_order_search_v2('Edmonton', 'native', 0, 50);
  city_imported := public.vf_admin_order_search_v2('Edmonton', 'imported', 0, 50);
  IF (city_all->>'total')::bigint < 0
    OR (city_all->>'total')::bigint <> (city_native->>'total')::bigint + (city_imported->>'total')::bigint
    OR city_native->'archiveSnapshotAt' <> 'null'::jsonb
    OR city_imported->'archiveSnapshotAt' = 'null'::jsonb
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(city_native->'rows') AS entry(row_value)
      WHERE entry.row_value->>'source' <> 'native')
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(city_imported->'rows') AS entry(row_value)
      WHERE entry.row_value->>'source' <> 'imported')
  THEN RAISE EXCEPTION 'VF_ORDER_SEARCH_SOURCE_FILTER_INVALID'; END IF;
  IF to_regprocedure('public.vf_admin_order_search_v1(text,text,text,text,integer,integer)')
    IS NOT NULL THEN
    legacy_response := public.vf_admin_order_search_v1(NULL, NULL, 'Edmonton', 'all', 0, 50);
    IF (city_all->>'total')::bigint < (legacy_response->>'total')::bigint
    THEN RAISE EXCEPTION 'VF_ORDER_SEARCH_CITY_MATCH_INVALID'; END IF;
  END IF;

  -- Postal matches must survive either input spelling. Other fields may add
  -- different OR matches, so comparing whole result pages would be unsound.
  postal_compact := public.vf_admin_order_search_v2('T5J', 'all', 0, 50);
  postal_spaced := public.vf_admin_order_search_v2('t 5 j', 'all', 0, 50);
  IF to_regprocedure('public.vf_admin_order_search_v1(text,text,text,text,integer,integer)')
    IS NOT NULL THEN
    legacy_response := public.vf_admin_order_search_v1(NULL, 'T5J', NULL, 'all', 0, 50);
    IF (postal_compact->>'total')::bigint < (legacy_response->>'total')::bigint
      OR (postal_spaced->>'total')::bigint < (legacy_response->>'total')::bigint
    THEN RAISE EXCEPTION 'VF_ORDER_SEARCH_POSTAL_NORMALIZATION_INVALID'; END IF;
  END IF;

  -- A real order number must be searchable with and without #. Keep the
  -- sample inside the block so no customer or order data reaches the grid.
  SELECT o.order_number::text INTO sample_number
  FROM public.commerce_orders o ORDER BY o.order_number DESC LIMIT 1;
  IF sample_number IS NOT NULL THEN
    response := public.vf_admin_order_search_v2(sample_number, 'native', 0, 50);
    IF (response->>'total')::bigint < 1
      OR ((response->>'total')::bigint <= 50 AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(response->'rows') AS entry(row_value)
        WHERE entry.row_value->>'orderNumber' = sample_number
      ))
    THEN RAISE EXCEPTION 'VF_ORDER_SEARCH_NUMBER_INVALID'; END IF;
    response := public.vf_admin_order_search_v2('#' || sample_number, 'native', 0, 50);
    IF (response->>'total')::bigint < 1
      OR ((response->>'total')::bigint <= 50 AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(response->'rows') AS entry(row_value)
        WHERE entry.row_value->>'orderNumber' = sample_number
      ))
    THEN RAISE EXCEPTION 'VF_ORDER_SEARCH_HASH_NUMBER_INVALID'; END IF;
  END IF;

  -- An impossible literal should return a valid empty page, rather than the
  -- same result as a connection or authorization failure.
  response := public.vf_admin_order_search_v2(
    'vf-order-search-no-match-9374091', 'all', 0, 50);
  IF response->>'kind' <> 'order-search'
    OR response->'rows' <> '[]'::jsonb
    OR response->'total' <> '0'::jsonb
    OR response->'nextOffset' <> 'null'::jsonb
  THEN RAISE EXCEPTION 'VF_ORDER_SEARCH_EMPTY_PAGE_INVALID'; END IF;

  BEGIN
    PERFORM public.vf_admin_order_search_v2(' ', 'all', 0, 50);
  EXCEPTION WHEN SQLSTATE '22023' THEN invalid_query := true;
  END;
  IF NOT invalid_query THEN RAISE EXCEPTION 'VF_ORDER_SEARCH_EMPTY_QUERY_ACCEPTED'; END IF;

  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000000', true);
  BEGIN
    PERFORM public.vf_admin_order_search_v2('Edmonton', 'all', 0, 50);
  EXCEPTION WHEN SQLSTATE '42501' THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'VF_ORDER_SEARCH_ACCESS_INVALID'; END IF;
  RAISE NOTICE 'VF_ORDER_SEARCH_SHAPE_OK';
END $verify$;
COMMIT;
