-- Owner-only unified search across current commerce orders and the saved Woo archive.
-- Apply to the pinned commerce project as postgres. This reads historical
-- source evidence and does not change orders, contacts, payments, or stock.
BEGIN;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $guard$
BEGIN
  IF current_user <> 'postgres' OR current_database() <> 'postgres'
    OR to_regclass('public.commerce_orders') IS NULL
    OR to_regclass('public.vf_admin_order_operational_state_v1') IS NULL
    OR to_regclass('vf_legacy_import_v1.history_orders_current_v2') IS NULL
    OR to_regclass('vf_legacy_import_v1.source_fields') IS NULL
    OR to_regclass('vf_legacy_import_v1.order_history_delta_runs_v1') IS NULL
    OR to_regclass('vf_legacy_import_v1.order_history_delta_head_v1') IS NULL
    OR to_regprocedure('vf_legacy_import_v1.vf_admin_is_owner_v1()') IS NULL
    OR to_regprocedure('vf_legacy_import_v1.history_text_v1(jsonb,text)') IS NULL
    OR to_regprocedure('vf_legacy_import_v1.vf_admin_effective_status_v1(text,text,text)') IS NULL
    OR to_regprocedure('public.vf_admin_order_contacts_v1(text[])') IS NULL
  THEN RAISE EXCEPTION 'VF_ORDER_SEARCH_PREREQUISITE'; END IF;
END $guard$;

CREATE OR REPLACE FUNCTION public.vf_admin_order_search_v2(
  p_query text,
  p_source text DEFAULT 'all', p_offset integer DEFAULT 0, p_limit integer DEFAULT 50
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog SET statement_timeout = '8000' SET jit = off AS $fn$
DECLARE
  v_query text;
  v_postal text;
  v_number text;
  result jsonb;
BEGIN
  IF NOT vf_legacy_import_v1.vf_admin_is_owner_v1() THEN
    RAISE EXCEPTION 'VF_ORDER_SEARCH_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;
  IF p_source IS NULL OR p_source NOT IN ('all', 'native', 'imported')
    OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 10000
    OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50
    OR p_query IS NULL OR char_length(p_query) > 100 OR p_query ~ '[[:cntrl:]]'
  THEN RAISE EXCEPTION 'VF_ORDER_SEARCH_INVALID_QUERY' USING ERRCODE = '22023'; END IF;

  -- Names and cities use a literal, whitespace-collapsed substring. Postal
  -- terms ignore spaces and hyphens; only a numeric term (with optional #)
  -- can match an order number. Do not extract digits from arbitrary text.
  v_query := nullif(lower(regexp_replace(btrim(p_query), '[[:space:]]+', ' ', 'g')), '');
  v_postal := CASE WHEN p_query ~ '^[A-Za-z0-9 -]+$' THEN
    nullif(upper(regexp_replace(p_query, '[^A-Za-z0-9]', '', 'g')), '') ELSE NULL END;
  IF char_length(v_postal) > 24 THEN v_postal := NULL; END IF;
  v_number := CASE WHEN btrim(p_query) ~ '^#?[0-9]{1,20}$'
    THEN ltrim(btrim(p_query), '#') ELSE NULL END;
  IF v_query IS NULL OR char_length(v_query) NOT BETWEEN 1 AND 100
  THEN RAISE EXCEPTION 'VF_ORDER_SEARCH_INVALID_QUERY' USING ERRCODE = '22023'; END IF;

  -- Reconstruct current Woo addresses exactly as the existing owner-only
  -- contact reader does: newer delta by source address identity wins, deleted
  -- addresses disappear, and held text cannot be decoded as customer data.
  WITH RECURSIVE runs AS (
    SELECT r.*, 0 AS depth FROM vf_legacy_import_v1.order_history_delta_runs_v1 r
    JOIN vf_legacy_import_v1.order_history_delta_head_v1 h
      ON h.singleton AND h.source_sha256 = r.new_source_sha256
    WHERE p_source IN ('all', 'imported')
    UNION ALL
    SELECT older.*, newer.depth + 1
    FROM vf_legacy_import_v1.order_history_delta_runs_v1 older
    JOIN runs newer ON older.new_source_sha256 = newer.old_source_sha256
  ), latest AS MATERIALIZED (
    SELECT DISTINCT ON (c->>'sourceId')
      c->>'sourceId' AS source_id, c->>'operation' AS operation,
      c->'after'->'record'->'fields' AS fields
    FROM runs CROSS JOIN LATERAL jsonb_array_elements(manifest->'changes') c
    WHERE c->>'table' = 'eke_wc_order_addresses'
    ORDER BY c->>'sourceId', depth
  ), current_addresses AS MATERIALIZED (
    SELECT s.fields::jsonb AS fields
    FROM vf_legacy_import_v1.source_fields s
    WHERE p_source IN ('all', 'imported')
      AND s.source_table = 'eke_wc_order_addresses' AND NOT s.text_projection_held
      AND NOT EXISTS (SELECT 1 FROM latest d WHERE d.source_id = s.source_key->0->>1)
    UNION ALL
    SELECT fields FROM latest WHERE operation <> 'delete' AND jsonb_typeof(fields) = 'object'
  ), decoded_addresses AS MATERIALIZED (
    SELECT vf_legacy_import_v1.history_text_v1(fields, 'order_id') AS order_id,
      vf_legacy_import_v1.history_text_v1(fields, 'address_type') AS kind,
      fields
    FROM current_addresses
  ), unique_addresses AS MATERIALIZED (
    SELECT a.order_id, a.kind, a.fields
    FROM (SELECT d.*, count(*) OVER (PARTITION BY d.order_id, d.kind) AS copies
      FROM decoded_addresses d WHERE d.order_id IS NOT NULL AND d.kind IN ('billing', 'shipping')) a
    WHERE a.copies = 1
  ), candidates AS MATERIALIZED (
    SELECT 'native'::text AS source, o.id::text AS order_id,
      o.order_number::text AS order_number,
      vf_legacy_import_v1.vf_admin_effective_status_v1('native', o.status, state.operational_status) AS status,
      to_char(coalesce(o.placed_at, o.created_at) AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS placed_at,
      to_char(coalesce(o.placed_at, o.created_at) AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS') AS sort_key,
      nullif(btrim(o.billing_address->>'name'), '') AS billing_name,
      nullif(btrim(o.shipping_address->>'name'), '') AS shipping_name,
      coalesce(nullif(btrim(o.shipping_address->'address'->>'city'), ''),
        nullif(btrim(o.shipping_address->>'city'), '')) AS delivery_city,
      coalesce(nullif(btrim(o.shipping_address->'address'->>'postalCode'), ''),
        nullif(btrim(o.shipping_address->'address'->>'postal_code'), ''),
        nullif(btrim(o.shipping_address->>'postalCode'), ''),
        nullif(btrim(o.shipping_address->>'postal_code'), '')) AS postal_code,
      CASE WHEN o.total_cents >= 0 THEN o.total_cents ELSE NULL END AS total_cents,
      NULL::text AS recorded_total, o.currency
    FROM public.commerce_orders o
    LEFT JOIN public.vf_admin_order_operational_state_v1 state
      ON state.order_kind = 'native' AND state.order_id = o.id::text
    WHERE p_source IN ('all', 'native')
    UNION ALL
    SELECT 'imported'::text, o.source_order_id, o.source_order_id,
      vf_legacy_import_v1.vf_admin_effective_status_v1(
        'imported', o.source_status, state.operational_status),
      CASE WHEN o.data->>'createdGmt' ~
        '^[0-9]{4}-[0-9]{2}-[0-9]{2}[ T][0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?Z?$'
        AND pg_input_is_valid(replace(left(o.data->>'createdGmt', 19), ' ', 'T') || 'Z', 'timestamptz')
        THEN replace(left(o.data->>'createdGmt', 19), ' ', 'T') || 'Z' ELSE NULL END,
      CASE WHEN o.data->>'createdGmt' ~
        '^[0-9]{4}-[0-9]{2}-[0-9]{2}[ T][0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?Z?$'
        AND pg_input_is_valid(replace(left(o.data->>'createdGmt', 19), ' ', 'T') || 'Z', 'timestamptz')
        THEN replace(left(o.data->>'createdGmt', 19), ' ', 'T') ELSE NULL END,
      nullif(concat_ws(' ',
        nullif(btrim(vf_legacy_import_v1.history_text_v1(b.fields, 'first_name')), ''),
        nullif(btrim(vf_legacy_import_v1.history_text_v1(b.fields, 'last_name')), '')), ''),
      nullif(concat_ws(' ',
        nullif(btrim(vf_legacy_import_v1.history_text_v1(s.fields, 'first_name')), ''),
        nullif(btrim(vf_legacy_import_v1.history_text_v1(s.fields, 'last_name')), '')), ''),
      nullif(btrim(vf_legacy_import_v1.history_text_v1(s.fields, 'city')), ''),
      nullif(btrim(vf_legacy_import_v1.history_text_v1(s.fields, 'postcode')), ''),
      NULL::integer,
      CASE WHEN o.data->>'total' ~ '^(0|[1-9][0-9]{0,14})(\.[0-9]{1,8})?$'
        THEN o.data->>'total' ELSE NULL END,
      o.data->>'currency'
    FROM vf_legacy_import_v1.history_orders_current_v2 o
    LEFT JOIN unique_addresses b
      ON b.order_id = o.source_order_id AND b.kind = 'billing'
    LEFT JOIN unique_addresses s
      ON s.order_id = o.source_order_id AND s.kind = 'shipping'
    LEFT JOIN public.vf_admin_order_operational_state_v1 state
      ON state.order_kind = 'imported' AND state.order_id = o.source_order_id
    WHERE p_source IN ('all', 'imported') AND o.source_type = 'shop_order'
  ), candidate_matches AS MATERIALIZED (
    SELECT c.*,
      strpos(lower(regexp_replace(coalesce(c.billing_name, ''), '[[:space:]]+', ' ', 'g')), v_query) > 0
        AS billing_match,
      strpos(lower(regexp_replace(coalesce(c.shipping_name, ''), '[[:space:]]+', ' ', 'g')), v_query) > 0
        AS shipping_match,
      v_number IS NOT NULL AND c.order_number = v_number AS number_match,
      v_postal IS NOT NULL AND
        strpos(upper(regexp_replace(coalesce(c.postal_code, ''), '[^A-Za-z0-9]', '', 'g')), v_postal) > 0
        AS postal_match,
      strpos(lower(regexp_replace(coalesce(c.delivery_city, ''), '[[:space:]]+', ' ', 'g')), v_query) > 0
        AS city_match
    FROM candidates c
  ), matched AS MATERIALIZED (
    SELECT c.*,
      CASE WHEN c.billing_match OR c.shipping_match THEN 0
        WHEN c.number_match THEN 1 WHEN c.postal_match THEN 2 ELSE 3 END AS match_rank,
      CASE WHEN c.billing_match OR c.shipping_match THEN 'name'
        WHEN c.number_match THEN 'orderNumber'
        WHEN c.postal_match THEN 'postal' ELSE 'city' END AS matched_by,
      CASE WHEN c.shipping_match AND NOT c.billing_match THEN c.shipping_name
        ELSE coalesce(c.billing_name, c.shipping_name) END AS customer_name
    FROM candidate_matches c
    WHERE c.billing_match OR c.shipping_match OR c.number_match
      OR c.postal_match OR c.city_match
  ), page AS MATERIALIZED (
    SELECT * FROM matched
    ORDER BY match_rank, sort_key DESC NULLS LAST, source, order_id DESC
    LIMIT p_limit OFFSET p_offset
  ), page_rows AS (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'source', source, 'orderId', order_id, 'orderNumber', order_number,
      'matchedBy', matched_by,
      'status', status, 'placedAt', placed_at,
      'customerName', CASE WHEN char_length(customer_name) <= 320
        AND customer_name !~ '[[:cntrl:]]' THEN customer_name ELSE NULL END,
      'deliveryCity', CASE WHEN char_length(delivery_city) <= 200
        AND delivery_city !~ '[[:cntrl:]]' THEN delivery_city ELSE NULL END,
      'postalCode', CASE WHEN char_length(postal_code) <= 32
        AND postal_code !~ '[[:cntrl:]]' THEN postal_code ELSE NULL END,
      'totalCents', total_cents, 'recordedTotal', recorded_total,
      'currency', CASE WHEN currency ~ '^[A-Za-z]{3}$' THEN currency ELSE NULL END
    ) ORDER BY match_rank, sort_key DESC NULLS LAST, source, order_id DESC), '[]'::jsonb) AS rows
    FROM page
  ), tally AS (SELECT count(*) AS total FROM matched)
  SELECT jsonb_build_object(
    'kind', 'order-search', 'rows', page_rows.rows, 'total', tally.total,
    'nextOffset', CASE WHEN tally.total > p_offset + p_limit
      AND p_offset + p_limit <= 10000 THEN p_offset + p_limit ELSE NULL END,
    'archiveSnapshotAt', CASE WHEN p_source IN ('all', 'imported')
      THEN (SELECT updated_at FROM vf_legacy_import_v1.order_history_delta_head_v1 WHERE singleton)
      ELSE NULL END
  ) INTO result FROM page_rows CROSS JOIN tally;
  RETURN result;
END $fn$;

REVOKE ALL ON FUNCTION public.vf_admin_order_search_v2(text,text,integer,integer)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vf_admin_order_search_v2(text,text,integer,integer)
  TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
