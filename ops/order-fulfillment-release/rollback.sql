-- Execute only after restoring the pre-change application release.
-- No order, payment, audit, notification or fulfillment evidence is reverted.
BEGIN;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $guard$
DECLARE expected record; p pg_proc%rowtype;
BEGIN
  FOR expected IN SELECT * FROM (VALUES
    ('public.vf_admin_set_order_status_v2(text,text,text,bigint,text,uuid,text,text)','99f2681a9656da36e19fa2bfd7d96bfc'),
    ('vf_legacy_import_v1.vf_admin_subscription_native_safe_v1(uuid)','9427dcea14d39561606cf3f85d6489dc'),
    ('vf_legacy_import_v1.vf_admin_native_safe_v1(uuid)','9967ed3916b9eed80c5a9ab91bcb7b51'),
    ('vf_legacy_import_v1.vf_admin_stripe_native_safe_v1(uuid)','7c9f73dfe7442cf3c71541a9b391a7b8'),
    ('public.vf_admin_set_order_status_v1(text,text,text,bigint,text,uuid,text)','d53fad33c771aab22dbbca6dca578f0d'),
    ('public.vf_admin_order_operations_v1(jsonb)','e28aa4a55085052089a9e0030f969160'),
    ('public.vf_admin_native_orders_page_v1(text,text,text,integer)','3d60a66df274ff23928ad33d3804a99e')
  ) x(signature,source_md5) LOOP
    SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure(expected.signature);
    IF NOT FOUND OR md5(p.prosrc)<>expected.source_md5 OR NOT p.prosecdef
      OR p.proowner IS DISTINCT FROM 'postgres'::regrole
      OR NOT coalesce('search_path=pg_catalog'=ANY(p.proconfig),false)
    THEN RAISE EXCEPTION 'VF_FULFILLMENT_ROLLBACK_CONTRACT_CHANGED:%',expected.signature; END IF;
  END LOOP;
END $guard$;
CREATE OR REPLACE FUNCTION vf_legacy_import_v1.vf_admin_native_safe_v1(p_order_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  SELECT EXISTS(SELECT 1 FROM public.commerce_orders o
    WHERE o.id=p_order_id AND o.source='web' AND o.migration_snapshot='{}'::jsonb
      AND o.stripe_subscription_id IS NULL AND o.stripe_invoice_id IS NULL
      AND (o.payment_provider IN('helcim','paypal') OR (o.payment_provider='stripe' AND vf_legacy_import_v1.vf_admin_stripe_native_safe_v1(o.id)))
      AND o.payment_status='paid' AND o.refunded_cents=0
      AND o.status IN('paid','processing') AND o.inventory_committed_at IS NOT NULL
      AND EXISTS(SELECT 1 FROM public.commerce_order_items i WHERE i.order_id=o.id)
      AND NOT EXISTS(SELECT 1 FROM public.commerce_order_items i WHERE i.order_id=o.id
        AND i.fulfillment_status NOT IN('unfulfilled','processing')));
$function$;

CREATE OR REPLACE FUNCTION public.vf_admin_set_order_status_v1(p_order_kind text, p_order_id text, p_target_status text, p_expected_revision bigint, p_expected_source_version text, p_operation_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
 SET statement_timeout TO '8000'
AS $function$
DECLARE
  actor uuid:=auth.uid(); current_state public.vf_admin_order_operational_state_v1%rowtype;
  native public.commerce_orders%rowtype; imported record; v_source_version text; source_status text;
  prior_status text; result jsonb; prior_audit public.vf_admin_order_status_audit_v1%rowtype;
BEGIN
  IF NOT vf_legacy_import_v1.vf_admin_is_owner_v1() THEN
    RAISE EXCEPTION 'VF_ORDER_STATUS_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
  IF p_order_kind IS NULL OR p_order_kind NOT IN('native','imported') OR p_order_id IS NULL
    OR p_target_status IS NULL OR p_target_status NOT IN('processing','on_hold','completed')
    OR p_expected_revision IS NULL OR p_expected_revision<0
    OR p_expected_source_version IS NULL OR p_expected_source_version!~'^[a-f0-9]{64}$'
    OR p_operation_id IS NULL OR (p_reason IS NOT NULL AND length(trim(p_reason)) NOT BETWEEN 3 AND 500)
    OR (p_order_kind='native' AND p_order_id!~'^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$')
    OR (p_order_kind='imported' AND p_order_id!~'^[1-9][0-9]{0,19}$')
  THEN RAISE EXCEPTION 'VF_ORDER_STATUS_INVALID_REQUEST' USING ERRCODE='22023'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('vf-order-operation:'||p_operation_id::text,0));
  PERFORM pg_advisory_xact_lock(hashtextextended('vf-order:'||p_order_kind||':'||p_order_id,0));
  SELECT * INTO prior_audit FROM public.vf_admin_order_status_audit_v1 WHERE operation_id=p_operation_id;
  IF FOUND THEN
    IF prior_audit.actor_user_id<>actor OR prior_audit.order_kind<>p_order_kind
      OR prior_audit.order_id<>p_order_id OR prior_audit.to_status<>p_target_status
      OR prior_audit.expected_revision<>p_expected_revision
      OR prior_audit.expected_source_version<>p_expected_source_version
      OR prior_audit.reason IS DISTINCT FROM nullif(trim(p_reason),'')
    THEN RAISE EXCEPTION 'VF_ORDER_STATUS_OPERATION_CONFLICT' USING ERRCODE='23505'; END IF;
    RETURN jsonb_build_object('kind',prior_audit.order_kind,'orderId',prior_audit.order_id,
      'status',prior_audit.to_status,'revision',prior_audit.resulting_revision,
      'sourceVersion',prior_audit.source_version,'updatedAt',prior_audit.created_at,'replayed',true);
  END IF;

  SELECT * INTO current_state FROM public.vf_admin_order_operational_state_v1
    WHERE order_kind=p_order_kind AND order_id=p_order_id FOR UPDATE;
  IF coalesce(current_state.revision,0)<>p_expected_revision THEN
    RAISE EXCEPTION 'VF_ORDER_STATUS_STALE_REVISION' USING ERRCODE='40001'; END IF;

  IF p_order_kind='native' THEN
    SELECT * INTO native FROM public.commerce_orders WHERE id=p_order_id::uuid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'VF_ORDER_STATUS_NOT_FOUND' USING ERRCODE='P0002'; END IF;
    -- The parent row lock fences concurrent child inserts through the FK; lock
    -- existing children in stable order before hashing and changing fulfillment.
    PERFORM 1 FROM public.commerce_order_items WHERE order_id=native.id ORDER BY id FOR UPDATE;
    source_status:=native.status;
    v_source_version:=vf_legacy_import_v1.vf_admin_native_source_version_v1(native.id);
    IF v_source_version<>p_expected_source_version THEN
      RAISE EXCEPTION 'VF_ORDER_STATUS_STALE_SOURCE' USING ERRCODE='40001'; END IF;
    IF current_state.revision IS NOT NULL AND current_state.source_version<>v_source_version THEN
      RAISE EXCEPTION 'VF_ORDER_STATUS_STALE_OVERLAY' USING ERRCODE='40001'; END IF;
    prior_status:=coalesce(current_state.operational_status,
      vf_legacy_import_v1.vf_admin_default_status_v1('native',native.status));
    IF prior_status='completed' THEN RAISE EXCEPTION 'VF_ORDER_STATUS_COMPLETED_TERMINAL' USING ERRCODE='55000'; END IF;
    IF NOT vf_legacy_import_v1.vf_admin_native_safe_v1(native.id) THEN
      RAISE EXCEPTION 'VF_ORDER_STATUS_NATIVE_NOT_SAFE' USING ERRCODE='55000'; END IF;
  ELSE
    -- Delta apply takes this head FOR UPDATE before locking/mutating history.
    -- Taking it FOR SHARE first gives this writer the reciprocal lock order.
    PERFORM 1 FROM vf_legacy_import_v1.order_history_delta_head_v1
      WHERE singleton FOR SHARE;
    SELECT o.* INTO imported FROM vf_legacy_import_v1.history_orders_v1 o
      WHERE o.source_order_id=p_order_id FOR UPDATE;
    IF NOT FOUND OR imported.source_deleted OR imported.source_type<>'shop_order' THEN
      RAISE EXCEPTION 'VF_ORDER_STATUS_IMPORTED_NOT_ACTIONABLE' USING ERRCODE='55000'; END IF;
    source_status:=imported.source_status;
    v_source_version:=vf_legacy_import_v1.vf_admin_imported_source_version_v1(p_order_id);
    IF v_source_version<>p_expected_source_version THEN
      RAISE EXCEPTION 'VF_ORDER_STATUS_STALE_SOURCE' USING ERRCODE='40001'; END IF;
    IF current_state.revision IS NOT NULL AND current_state.source_version<>v_source_version THEN
      RAISE EXCEPTION 'VF_ORDER_STATUS_STALE_OVERLAY' USING ERRCODE='40001'; END IF;
    prior_status:=coalesce(current_state.operational_status,
      vf_legacy_import_v1.vf_admin_default_status_v1('imported',source_status));
    IF prior_status NOT IN('processing','on_hold') THEN
      RAISE EXCEPTION 'VF_ORDER_STATUS_IMPORTED_NOT_ACTIONABLE' USING ERRCODE='55000'; END IF;
  END IF;

  IF prior_status=p_target_status THEN
    RAISE EXCEPTION 'VF_ORDER_STATUS_NO_CHANGE' USING ERRCODE='22023'; END IF;

  INSERT INTO public.vf_admin_order_operational_state_v1
    (order_kind,order_id,operational_status,revision,source_version,source_status_snapshot,updated_by)
  VALUES(p_order_kind,p_order_id,p_target_status,p_expected_revision+1,v_source_version,source_status,actor)
  ON CONFLICT(order_kind,order_id) DO UPDATE SET operational_status=EXCLUDED.operational_status,
    revision=EXCLUDED.revision,source_version=EXCLUDED.source_version,
    source_status_snapshot=EXCLUDED.source_status_snapshot,updated_by=EXCLUDED.updated_by,
    updated_at=clock_timestamp();

  IF p_order_kind='native' THEN
    IF p_target_status='processing' THEN
      UPDATE public.commerce_order_items SET fulfillment_status='processing'
        WHERE order_id=native.id AND fulfillment_status='unfulfilled';
      UPDATE public.commerce_orders SET status='processing'
        WHERE id=native.id AND status='paid';
    ELSIF p_target_status='completed' THEN
      UPDATE public.commerce_order_items SET fulfillment_status='fulfilled'
        WHERE order_id=native.id AND fulfillment_status IN('unfulfilled','processing');
      UPDATE public.commerce_orders SET status='fulfilled',fulfilled_at=coalesce(fulfilled_at,clock_timestamp())
        WHERE id=native.id AND status IN('paid','processing') AND payment_status='paid' AND refunded_cents=0;
      IF NOT FOUND THEN RAISE EXCEPTION 'VF_ORDER_STATUS_NATIVE_NOT_SAFE' USING ERRCODE='55000'; END IF;
    END IF;
    v_source_version:=vf_legacy_import_v1.vf_admin_native_source_version_v1(native.id);
    UPDATE public.vf_admin_order_operational_state_v1 SET source_version=v_source_version
      WHERE order_kind='native' AND order_id=p_order_id;
  END IF;

  INSERT INTO public.vf_admin_order_status_audit_v1(operation_id,order_kind,order_id,
    expected_revision,resulting_revision,expected_source_version,source_version,
    from_status,to_status,reason,actor_user_id,evidence)
  VALUES(p_operation_id,p_order_kind,p_order_id,p_expected_revision,p_expected_revision+1,
    p_expected_source_version,v_source_version,prior_status,p_target_status,nullif(trim(p_reason),''),actor,
    jsonb_build_object('sourceStatus',source_status,'paymentChanged',false,
      'historicalEvidenceChanged',false,'importedOperationalOverlay',p_order_kind='imported'));

  SELECT jsonb_build_object('kind',s.order_kind,'orderId',s.order_id,'status',s.operational_status,
    'revision',s.revision,'sourceVersion',s.source_version,'sourceStatus',s.source_status_snapshot,
    'updatedAt',s.updated_at,'replayed',false) INTO result
  FROM public.vf_admin_order_operational_state_v1 s
  WHERE s.order_kind=p_order_kind AND s.order_id=p_order_id;
  RETURN result;
END $function$;

CREATE OR REPLACE FUNCTION public.vf_admin_order_operations_v1(p_refs jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
 SET statement_timeout TO '8000'
AS $function$
DECLARE result jsonb;
BEGIN
  IF NOT vf_legacy_import_v1.vf_admin_is_owner_v1() THEN
    RAISE EXCEPTION 'VF_ORDER_STATUS_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
  IF jsonb_typeof(p_refs) IS DISTINCT FROM 'array' OR jsonb_array_length(p_refs) NOT BETWEEN 1 AND 100
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_refs) r
      WHERE r-ARRAY['kind','orderId']<>'{}'::jsonb OR coalesce(r->>'kind','') NOT IN('native','imported')
        OR (r->>'kind'='native' AND coalesce(r->>'orderId','')!~'^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$')
        OR (r->>'kind'='imported' AND coalesce(r->>'orderId','')!~'^[1-9][0-9]{0,19}$'))
    OR (SELECT count(*) FROM jsonb_array_elements(p_refs))<>(SELECT count(DISTINCT (r->>'kind',r->>'orderId')) FROM jsonb_array_elements(p_refs) r)
  THEN RAISE EXCEPTION 'VF_ORDER_STATUS_INVALID_QUERY' USING ERRCODE='22023'; END IF;
  WITH refs AS (SELECT r->>'kind' kind,r->>'orderId' order_id FROM jsonb_array_elements(p_refs) r),
  sources AS (
    SELECT r.kind,r.order_id,o.status source_status,
      vf_legacy_import_v1.vf_admin_native_source_version_v1(o.id) source_version,
      vf_legacy_import_v1.vf_admin_native_safe_v1(o.id) actionable
    FROM refs r JOIN public.commerce_orders o
      ON o.id=CASE WHEN r.kind='native' THEN r.order_id::uuid ELSE NULL END
    UNION ALL
    SELECT r.kind,r.order_id,o.source_status,
      vf_legacy_import_v1.vf_admin_imported_source_version_v1(o.source_order_id),
      o.source_type='shop_order' AND o.source_status IN('wc-processing','wc-on-hold')
    FROM refs r JOIN vf_legacy_import_v1.history_orders_current_v2 o
      ON r.kind='imported' AND o.source_order_id=r.order_id
  ), rows AS (SELECT x.*,s.operational_status,s.revision,s.updated_at,
    s.source_version IS NOT NULL AND s.source_version<>x.source_version stale_overlay,
    vf_legacy_import_v1.vf_admin_effective_status_v1(
      x.kind,x.source_status,s.operational_status) effective_status
    FROM sources x LEFT JOIN public.vf_admin_order_operational_state_v1 s
      ON s.order_kind=x.kind AND s.order_id=x.order_id)
  SELECT jsonb_build_object('orders',coalesce(jsonb_agg(jsonb_build_object(
    'kind',kind,'orderId',order_id,'status',effective_status,'revision',coalesce(revision,0),
    'sourceStatus',source_status,'sourceVersion',source_version,'updatedAt',updated_at,'staleOverlay',stale_overlay,
    'reviewReason',CASE WHEN stale_overlay THEN 'source_changed' WHEN NOT actionable THEN 'not_actionable' ELSE NULL END,
    'allowedTargets',CASE WHEN actionable AND NOT stale_overlay AND effective_status<>'completed' THEN
      to_jsonb(ARRAY(SELECT v FROM unnest(ARRAY['processing','on_hold','completed'])v WHERE v<>effective_status))
      ELSE '[]'::jsonb END) ORDER BY kind,order_id),'[]'::jsonb),'operational',true) INTO result FROM rows;
  RETURN result;
END $function$;

CREATE OR REPLACE FUNCTION public.vf_admin_native_orders_page_v1(p_after text DEFAULT NULL::text, p_order_number text DEFAULT NULL::text, p_filter text DEFAULT 'all'::text, p_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
 SET statement_timeout TO '8000'
AS $function$
DECLARE result jsonb;
BEGIN
  IF NOT vf_legacy_import_v1.vf_admin_is_owner_v1() THEN RAISE EXCEPTION 'VF_ORDER_STATUS_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 OR p_filter IS NULL
    OR p_filter NOT IN('all','processing','on_hold','completed','pending','failed','cancelled','partially_refunded','refunded','attention','to_fulfil')
    OR (p_after IS NOT NULL AND (p_after!~'^[1-9][0-9]{0,18}$' OR p_after::numeric>9223372036854775807))
    OR (p_order_number IS NOT NULL AND (p_order_number!~'^[1-9][0-9]{0,18}$' OR p_order_number::numeric>9223372036854775807))
  THEN RAISE EXCEPTION 'VF_ORDER_STATUS_INVALID_QUERY' USING ERRCODE='22023'; END IF;
  WITH source_rows AS MATERIALIZED (SELECT o.*,
    vf_legacy_import_v1.vf_admin_native_source_version_v1(o.id) source_version
    FROM public.commerce_orders o), projected AS MATERIALIZED (SELECT o.*,
    vf_legacy_import_v1.vf_admin_effective_status_v1(
      'native',o.status,s.operational_status) effective_status,
    coalesce(s.revision,0) operation_revision,
    s.source_version IS NOT NULL AND s.source_version<>o.source_version stale_overlay,
    vf_legacy_import_v1.vf_admin_native_safe_v1(o.id) actionable
    FROM source_rows o LEFT JOIN public.vf_admin_order_operational_state_v1 s
      ON s.order_kind='native' AND s.order_id=o.id::text), matching AS MATERIALIZED (
    SELECT * FROM projected WHERE (p_order_number IS NULL OR order_number=p_order_number::bigint)
      AND (p_filter='all' OR effective_status=p_filter
        OR (p_filter='attention' AND (stale_overlay OR effective_status<>'completed'))
        OR (p_filter='to_fulfil' AND NOT stale_overlay
          AND effective_status IN('processing','on_hold','pending','partially_refunded','unknown')))
  ), page AS MATERIALIZED (SELECT * FROM matching WHERE p_after IS NULL OR order_number<p_after::bigint ORDER BY order_number DESC LIMIT p_limit+1)
  SELECT jsonb_build_object('rows',coalesce(jsonb_agg(jsonb_build_object(
    'id',id,'order_number',order_number::text,'customer_email',customer_email,'status',status,
    'payment_status',payment_status,'total_cents',total_cents,'refunded_cents',refunded_cents,
    'currency',currency,'placed_at',placed_at,'created_at',created_at,'source',source,
    'billing_address',billing_address,'shipping_address',shipping_address,
    'shipping_method_snapshot',shipping_method_snapshot,'operation',jsonb_build_object(
      'kind','native','orderId',id::text,'status',effective_status,'revision',operation_revision,
      'sourceStatus',status,'sourceVersion',source_version,'staleOverlay',stale_overlay,
      'reviewReason',CASE WHEN stale_overlay THEN 'source_changed' WHEN NOT actionable THEN 'not_actionable' ELSE NULL END,
      'allowedTargets',CASE WHEN actionable AND NOT stale_overlay AND effective_status<>'completed'
        THEN to_jsonb(ARRAY(SELECT v FROM unnest(ARRAY['processing','on_hold','completed'])v WHERE v<>effective_status)) ELSE '[]'::jsonb END))
    ORDER BY order_number DESC) FILTER(WHERE rn<=p_limit),'[]'::jsonb),
    'total',(SELECT count(*) FROM matching),'nextCursor',CASE WHEN count(*)>p_limit
      THEN max(order_number::text) FILTER(WHERE rn=p_limit) ELSE NULL END) INTO result
  FROM (SELECT page.*,row_number() OVER(ORDER BY order_number DESC) rn FROM page) q;
  RETURN result;
END $function$;

CREATE OR REPLACE FUNCTION vf_legacy_import_v1.vf_admin_stripe_native_safe_v1(p_order_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare o public.commerce_orders%rowtype; a public.commerce_checkout_attempts%rowtype;
 enforce_stock boolean := public.commerce_inventory_enforcement_enabled_v1();
begin
 select * into o from public.commerce_orders where id=p_order_id;
 if not found or o.payment_provider is distinct from 'stripe'
  or o.payment_method is null or o.payment_method not in ('card','link')
  or o.stripe_livemode is distinct from true
  or o.source is distinct from 'web' or o.migration_snapshot is distinct from '{}'::jsonb
  or o.stripe_subscription_id is not null or o.stripe_invoice_id is not null
  or o.payment_status is distinct from 'paid' or o.refunded_cents is distinct from 0
  or o.status not in ('paid','processing') or o.inventory_committed_at is null
  or o.currency is distinct from 'cad' or o.total_cents<50 then return false; end if;
 select * into a from public.commerce_checkout_attempts where id=o.checkout_attempt_id;
 if not found or a.status is distinct from 'paid'
  or a.terms_snapshot->>'stripeWalletVersion' is distinct from '1'
  or row(a.payment_provider,a.payment_method,a.stripe_account_id,a.stripe_livemode,
    a.stripe_payment_intent_id,a.currency,a.total_cents,a.expected_subtotal_cents,
    a.shipping_cents,a.tax_cents,a.gold_leaves_cents,a.coupon_discount_cents,
    a.coupon_code,a.coupon_revision_id,(a.shipping_address - 'name'),(a.contact_snapshot - 'name'),
    a.shipping_method_snapshot,a.shipping_rate_snapshot)
   is distinct from row(o.payment_provider,o.payment_method,o.stripe_account_id,o.stripe_livemode,
    o.stripe_payment_intent_id,o.currency,o.total_cents,o.subtotal_cents,
    o.shipping_cents,o.tax_cents,o.gold_leaves_cents,o.discount_cents,
    o.coupon_code,o.coupon_revision_id,(o.shipping_address - 'name'),(o.billing_address - 'name'),
    o.shipping_method_snapshot,o.shipping_rate_snapshot)
  or o.customer_email is distinct from a.contact_snapshot->>'email'
  or a.expected_subtotal_cents::bigint-a.coupon_discount_cents+a.shipping_cents+a.tax_cents-a.gold_leaves_cents
    is distinct from o.total_cents::bigint then return false; end if;
 if exists(select 1 from public.commerce_stripe_wallet_payment_holds_v1 h where h.checkout_attempt_id=a.id)
  or exists(select 1 from public.commerce_stripe_cancelled_intents_v1 c where c.checkout_attempt_id=a.id)
  or exists(select 1 from public.commerce_stripe_wallet_refunds_v1 r where r.checkout_attempt_id=a.id and r.observed_refunded_cents>0)
  or not exists(select 1 from public.commerce_stripe_verified_payment_receipts_v1 r
    where r.checkout_attempt_id=a.id and r.payment_intent_id=o.stripe_payment_intent_id
     and r.charge_id=o.stripe_charge_id and r.stripe_account_id=o.stripe_account_id
     and r.livemode is true and r.payment_method=o.payment_method
     and r.amount_cents=o.total_cents and r.currency=o.currency and r.provider_status='succeeded')
  or (select count(*) from public.commerce_order_payments p where p.order_id=o.id)<>1
  or not exists(select 1 from public.commerce_order_payments p where p.order_id=o.id
    and p.payment_provider='stripe' and p.payment_method=o.payment_method
    and p.stripe_payment_intent_id=o.stripe_payment_intent_id and p.stripe_charge_id=o.stripe_charge_id
    and p.stripe_account_id=o.stripe_account_id and p.stripe_livemode is true
    and p.amount_cents=o.total_cents and p.currency=o.currency and p.status='paid') then return false; end if;
 if jsonb_typeof(a.cart_snapshot) is distinct from 'array' then return false; end if;
 if jsonb_array_length(a.cart_snapshot)=0
  or not exists(select 1 from public.commerce_order_items i where i.order_id=o.id)
  or exists(select 1 from public.commerce_order_items i where i.order_id=o.id
    and (i.fulfillment_status is null or i.fulfillment_status not in ('unfulfilled','processing'))) then return false; end if;
 if exists(
  (select (x->>'variantId')::uuid,(x->>'quantity')::integer,(x->>'amountCents')::integer,
    x->>'productName',nullif(x->>'sku',''),x->>'variantLabel',coalesce((x->>'discountCents')::integer,0)
   from jsonb_array_elements(a.cart_snapshot) x
   except all select i.variant_id,i.quantity,i.unit_amount_cents,i.name_snapshot,i.sku_snapshot,i.variant_snapshot,i.discount_cents
    from public.commerce_order_items i where i.order_id=o.id)
  union all
  (select i.variant_id,i.quantity,i.unit_amount_cents,i.name_snapshot,i.sku_snapshot,i.variant_snapshot,i.discount_cents
    from public.commerce_order_items i where i.order_id=o.id
   except all select (x->>'variantId')::uuid,(x->>'quantity')::integer,(x->>'amountCents')::integer,
    x->>'productName',nullif(x->>'sku',''),x->>'variantLabel',coalesce((x->>'discountCents')::integer,0)
    from jsonb_array_elements(a.cart_snapshot) x)
 ) then return false; end if;
 if exists(select 1 from public.commerce_order_items i
   left join public.commerce_product_variants v on v.id=i.variant_id
   left join vf_legacy_import_v1.catalog_release_variants_v1 rv on rv.native_id=i.variant_id
   where i.order_id=o.id and (v.id is null or i.product_id is distinct from v.product_id
    or (enforce_stock and (rv.native_id is null or rv.product_id is distinct from v.product_id
      or rv.track_inventory is distinct from v.track_inventory)))) then return false; end if;
 if enforce_stock and (exists(
  (select i.variant_id,sum(i.quantity)::bigint from public.commerce_order_items i
    join vf_legacy_import_v1.catalog_release_variants_v1 rv on rv.native_id=i.variant_id
    where i.order_id=o.id and rv.track_inventory group by i.variant_id
   except select r.variant_id,r.quantity::bigint from public.commerce_inventory_reservations r
    where r.attempt_id=a.id and r.status='committed')
  union all
  (select r.variant_id,r.quantity::bigint from public.commerce_inventory_reservations r
    where r.attempt_id=a.id and r.status='committed'
   except select i.variant_id,sum(i.quantity)::bigint from public.commerce_order_items i
    join vf_legacy_import_v1.catalog_release_variants_v1 rv on rv.native_id=i.variant_id
    where i.order_id=o.id and rv.track_inventory group by i.variant_id)
 ) or exists(select 1 from public.commerce_inventory_reservations r
    where r.attempt_id=a.id and r.status is distinct from 'committed')) then return false; end if;
 if a.coupon_revision_id is not null and not exists(
  select 1 from public.commerce_coupon_reservations_v1 h where h.attempt_id=a.id
   and h.order_id=o.id and h.status='redeemed' and h.coupon_revision_id=a.coupon_revision_id
   and h.discount_cents=a.coupon_discount_cents and h.snapshot=a.coupon_snapshot) then return false; end if;
 return true;
exception when invalid_text_representation or numeric_value_out_of_range then return false;
end $function$;

DROP FUNCTION public.vf_admin_set_order_status_v2(text,text,text,bigint,text,uuid,text,text);
DROP FUNCTION vf_legacy_import_v1.vf_admin_subscription_native_safe_v1(uuid);
COMMIT;
