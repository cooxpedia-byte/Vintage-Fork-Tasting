-- Read-only inspection after historical-product-units.sql is applied. Run as
-- postgres in the SQL editor. No order, item, catalog, or stock rows are changed.
BEGIN TRANSACTION READ ONLY;
SET LOCAL search_path = pg_catalog;

-- Expected: security_definer=true, volatility=stable, fixed search path,
-- authenticated_execute=true, anon_execute=false, service_execute=false.
SELECT p.proname,
  p.prosecdef AS security_definer,
  p.provolatile = 's' AS stable,
  'search_path=pg_catalog' = ANY(p.proconfig) AS fixed_search_path,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_execute
FROM pg_proc p
WHERE p.oid = to_regprocedure(
  'public.vf_admin_historical_product_units_v1(timestamptz,timestamptz,uuid[])');

-- Expected: both private source views have security_invoker=true and neither
-- the public API roles nor service_role has direct SELECT access.
SELECT c.relname,
  c.reloptions @> ARRAY['security_invoker=true'] AS security_invoker,
  has_table_privilege('authenticated', c.oid, 'SELECT') AS authenticated_select,
  has_table_privilege('anon', c.oid, 'SELECT') AS anon_select,
  has_table_privilege('service_role', c.oid, 'SELECT') AS service_select
FROM pg_class c
WHERE c.oid IN (
  to_regclass('vf_legacy_import_v1.history_orders_current_v2'),
  to_regclass('vf_legacy_import_v1.history_items_current_v2'))
ORDER BY c.relname;

-- Sample Advent calendar source totals, all saved-history dates. This shows
-- only aggregate counts and source variation IDs; no customer/order details.
-- These are gross historical units before item-level refund reconciliation.
WITH advent AS MATERIALIZED (
  SELECT id, name, legacy_woo_id FROM public.commerce_products
  WHERE name ILIKE '%advent%' AND legacy_woo_id IS NOT NULL
), source_lines AS MATERIALIZED (
  SELECT p.name, i.data->>'sourceVariationId' AS source_variation_id,
    i.data->>'quantity' AS quantity_text, o.source_order_id
  FROM advent p
  JOIN vf_legacy_import_v1.history_items_current_v2 i
    ON i.data->>'sourceProductId' = p.legacy_woo_id::text
  JOIN vf_legacy_import_v1.history_orders_current_v2 o
    ON o.source_order_id = i.source_order_id
  WHERE o.source_type = 'shop_order'
    AND o.source_status IN ('wc-processing', 'wc-completed', 'wc-delivered')
    AND i.data->>'type' = 'line_item'
), checked AS (
  SELECT s.*,
    CASE WHEN s.quantity_text ~ '^[1-9][0-9]{0,9}(\.0{1,8})?$'
      THEN CASE WHEN s.quantity_text::numeric <= 2147483647
        THEN s.quantity_text::numeric ELSE NULL END
      ELSE NULL END AS valid_quantity
  FROM source_lines s
)
SELECT name, source_variation_id,
  count(DISTINCT source_order_id) AS eligible_order_count,
  count(*) AS matching_item_count,
  count(*) FILTER (WHERE valid_quantity IS NULL) AS invalid_quantity_count,
  sum(valid_quantity) AS gross_historical_units
FROM checked
GROUP BY name, source_variation_id
ORDER BY name, source_variation_id;

-- To verify the RPC against the same selected Advent IDs and a date window,
-- call it with the signed-in admin's authenticated Supabase client. A SQL editor
-- session has no auth.uid() and must receive ACCESS_DENIED from this RPC.
COMMIT;
