-- Apply to the commerce project as postgres before deploying the admin reader.
-- Read frozen POS contact evidence only. No order, payment or profile writes.
BEGIN;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $guard$
BEGIN
  IF current_user <> 'postgres' OR current_database() <> 'postgres'
    OR to_regclass('public.commerce_orders') IS NULL
    OR to_regclass('public.commerce_checkout_attempts') IS NULL
    OR to_regclass('public.commerce_customers') IS NULL
    OR to_regprocedure('vf_legacy_import_v1.vf_admin_is_owner_v1()') IS NULL
  THEN RAISE EXCEPTION 'VF_POS_ORDER_CONTACT_PREREQUISITE'; END IF;
END $guard$;

CREATE OR REPLACE FUNCTION public.vf_admin_pos_order_contacts_v1(p_order_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog SET statement_timeout = '8000' AS $fn$
DECLARE result jsonb;
BEGIN
  IF NOT coalesce(vf_legacy_import_v1.vf_admin_is_owner_v1(),false) THEN
    RAISE EXCEPTION 'VF_POS_ORDER_CONTACT_ACCESS_DENIED' USING ERRCODE='42501';
  END IF;
  IF p_order_ids IS NULL OR cardinality(p_order_ids) NOT BETWEEN 1 AND 50
    OR array_position(p_order_ids,NULL) IS NOT NULL
    OR cardinality(p_order_ids) <> (SELECT count(DISTINCT id) FROM unnest(p_order_ids) id)
  THEN RAISE EXCEPTION 'VF_POS_ORDER_CONTACT_INVALID' USING ERRCODE='22023'; END IF;

  SELECT jsonb_build_object('contacts',coalesce(jsonb_agg(jsonb_build_object(
    'orderId',o.id,'email',btrim(a.contact_snapshot->>'email'),
    'name',CASE WHEN jsonb_typeof(a.contact_snapshot->'name')='string'
      AND char_length(btrim(a.contact_snapshot->>'name')) BETWEEN 1 AND 200
      AND a.contact_snapshot->>'name' !~ '[[:cntrl:]]'
      THEN btrim(a.contact_snapshot->>'name') ELSE NULL END
  ) ORDER BY o.id),'[]'::jsonb)) INTO result
  FROM public.commerce_orders o
  JOIN public.commerce_checkout_attempts a ON a.id=o.checkout_attempt_id
  JOIN public.commerce_customers c ON c.id=o.customer_id AND c.profile_id=a.profile_id
  WHERE o.id=ANY(p_order_ids) AND o.source='pos' AND a.profile_id IS NOT NULL
    AND a.contact_snapshot->'posCustomerSnapshotVersion'='1'::jsonb
    AND jsonb_typeof(a.contact_snapshot->'email')='string'
    AND char_length(btrim(a.contact_snapshot->>'email')) BETWEEN 3 AND 254
    AND btrim(a.contact_snapshot->>'email') ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    AND a.contact_snapshot->>'email' !~ '[[:cntrl:]]';
  RETURN result;
END $fn$;

REVOKE ALL ON FUNCTION public.vf_admin_pos_order_contacts_v1(uuid[]) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.vf_admin_pos_order_contacts_v1(uuid[]) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
