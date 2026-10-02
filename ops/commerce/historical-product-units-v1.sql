-- Aggregate-only reader for saved WooCommerce product units. Apply as postgres
-- after the immutable history intake, order-history delta, and admin owner gate.
-- It does not modify source orders, items, catalog, stock, or payments.
BEGIN;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $guard$
BEGIN
  IF current_user <> 'postgres' OR current_database() <> 'postgres'
    OR to_regclass('vf_legacy_import_v1.history_orders_current_v2') IS NULL
    OR to_regclass('vf_legacy_import_v1.history_items_current_v2') IS NULL
    OR to_regclass('vf_legacy_import_v1.order_history_delta_head_v1') IS NULL
    OR to_regclass('public.commerce_products') IS NULL
    OR to_regclass('public.commerce_product_variants') IS NULL
    OR to_regprocedure('vf_legacy_import_v1.vf_admin_is_owner_v1()') IS NULL
    OR to_regprocedure('public.vf_admin_historical_product_units_v1(timestamptz,timestamptz,uuid[])') IS NOT NULL
  THEN RAISE EXCEPTION 'VF_HISTORICAL_PRODUCT_UNITS_PREREQUISITE'; END IF;
END $guard$;

-- The saved source dates are GMT values without a time-zone offset. Reject bad
-- dates instead of silently dropping a potentially relevant historical sale.
CREATE FUNCTION vf_legacy_import_v1.vf_admin_history_gmt_v1(p_value text)
RETURNS timestamptz LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog AS $fn$
BEGIN
  IF p_value IS NULL OR p_value !~
    '^[0-9]{4}-[0-9]{2}-[0-9]{2}[ T][0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?Z?$'
  THEN RAISE EXCEPTION 'VF_HISTORICAL_PRODUCT_UNITS_BAD_DATE' USING ERRCODE = '22007'; END IF;
  RETURN regexp_replace(p_value, 'Z$', '')::timestamp AT TIME ZONE 'UTC';
EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN
  RAISE EXCEPTION 'VF_HISTORICAL_PRODUCT_UNITS_BAD_DATE' USING ERRCODE = '22007';
END $fn$;

-- Native order-item quantities are integers. Fail on an undecoded, fractional,
-- zero, negative, or implausibly large saved Woo line quantity.
CREATE FUNCTION vf_legacy_import_v1.vf_admin_history_quantity_v1(p_value text)
RETURNS bigint LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog AS $fn$
DECLARE parsed numeric;
BEGIN
  IF p_value IS NULL OR p_value !~ '^[1-9][0-9]{0,9}(\.0{1,8})?$' THEN
    RAISE EXCEPTION 'VF_HISTORICAL_PRODUCT_UNITS_BAD_QUANTITY' USING ERRCODE = '22023';
  END IF;
  parsed := p_value::numeric;
  IF parsed > 2147483647 THEN
    RAISE EXCEPTION 'VF_HISTORICAL_PRODUCT_UNITS_BAD_QUANTITY' USING ERRCODE = '22023';
  END IF;
  RETURN parsed::bigint;
END $fn$;

CREATE FUNCTION public.vf_admin_historical_product_units_v1(
  p_start timestamptz, p_end timestamptz, p_product_ids uuid[]
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog SET statement_timeout = '8000' AS $fn$
DECLARE result jsonb;
BEGIN
  IF NOT vf_legacy_import_v1.vf_admin_is_owner_v1() THEN
    RAISE EXCEPTION 'VF_HISTORICAL_PRODUCT_UNITS_ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;
  IF p_start IS NULL OR p_end IS NULL OR p_start >= p_end
    OR p_start < timestamptz '2000-01-01 00:00:00+00'
    OR p_end > now() + interval '1 day'
    OR p_end - p_start > interval '370 days'
    OR p_product_ids IS NULL OR array_ndims(p_product_ids) <> 1
    OR cardinality(p_product_ids) NOT BETWEEN 1 AND 50
    OR array_position(p_product_ids, NULL) IS NOT NULL
    OR (SELECT count(DISTINCT id) FROM unnest(p_product_ids) AS ids(id)) <> cardinality(p_product_ids)
    OR (SELECT count(*) FROM public.commerce_products p WHERE p.id = ANY(p_product_ids)) <> cardinality(p_product_ids)
  THEN RAISE EXCEPTION 'VF_HISTORICAL_PRODUCT_UNITS_INVALID_QUERY' USING ERRCODE = '22023'; END IF;

  WITH selected AS MATERIALIZED (
    SELECT p.id, p.legacy_woo_id FROM public.commerce_products p
    WHERE p.id = ANY(p_product_ids)
  ), matched AS MATERIALIZED (
    SELECT p.id AS product_id, i.source_item_id, o.source_order_id,
      o.data->>'createdGmt' AS created_gmt,
      i.data->>'quantity' AS quantity_text,
      NULLIF(i.data->>'sourceVariationId', '') AS source_variation_id
    FROM selected p
    JOIN vf_legacy_import_v1.history_items_current_v2 i
      ON i.data->>'sourceProductId' = p.legacy_woo_id::text
    JOIN vf_legacy_import_v1.history_orders_current_v2 o
      ON o.source_order_id = i.source_order_id
    WHERE o.source_type = 'shop_order'
      AND o.source_status IN ('wc-processing', 'wc-completed', 'wc-delivered')
      AND i.data->>'type' = 'line_item'
  ), dated AS MATERIALIZED (
    SELECT m.*, vf_legacy_import_v1.vf_admin_history_gmt_v1(m.created_gmt) AS purchased_at
    FROM matched m
  ), windowed AS MATERIALIZED (
    SELECT d.product_id, d.source_item_id, d.source_order_id, d.source_variation_id,
      vf_legacy_import_v1.vf_admin_history_quantity_v1(d.quantity_text) AS quantity
    FROM dated d WHERE d.purchased_at >= p_start AND d.purchased_at < p_end
  ), grouped AS (
    SELECT w.product_id, v.id AS variant_id, w.source_variation_id,
      v.label AS variant_label, sum(w.quantity) AS units
    FROM windowed w
    LEFT JOIN public.commerce_product_variants v
      ON v.product_id = w.product_id
      AND v.legacy_woo_variation_id::text = w.source_variation_id
    GROUP BY w.product_id, v.id, w.source_variation_id, v.label
  )
  SELECT jsonb_build_object(
    'kind', 'historical-product-units',
    'snapshot', 'saved-import-v1',
    'operatingOwner', 'original_woo',
    'historicalEstimate', true,
    'paymentVerified', false,
    'refundAdjusted', false,
    'completeGraph', false,
    'sourceUpdatedAt', (SELECT h.updated_at FROM vf_legacy_import_v1.order_history_delta_head_v1 h WHERE h.singleton),
    'mappedProductIds', coalesce((SELECT jsonb_agg(s.id::text ORDER BY s.id::text)
      FROM selected s WHERE s.legacy_woo_id IS NOT NULL), '[]'::jsonb),
    'unmappedProductIds', coalesce((SELECT jsonb_agg(s.id::text ORDER BY s.id::text)
      FROM selected s WHERE s.legacy_woo_id IS NULL), '[]'::jsonb),
    'rows', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'productId', g.product_id::text,
      'variantId', g.variant_id::text,
      'sourceVariationId', g.source_variation_id,
      'variantLabel', g.variant_label,
      'units', g.units)
      ORDER BY g.product_id::text, g.source_variation_id NULLS FIRST, g.variant_id::text)
      FROM grouped g), '[]'::jsonb),
    'eligibleOrderCount', (SELECT count(DISTINCT w.source_order_id) FROM windowed w),
    'matchingItemCount', (SELECT count(*) FROM windowed w)
  ) INTO result;
  RETURN result;
END $fn$;

REVOKE ALL ON FUNCTION
  vf_legacy_import_v1.vf_admin_history_gmt_v1(text),
  vf_legacy_import_v1.vf_admin_history_quantity_v1(text),
  public.vf_admin_historical_product_units_v1(timestamptz,timestamptz,uuid[])
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vf_admin_historical_product_units_v1(timestamptz,timestamptz,uuid[])
TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
