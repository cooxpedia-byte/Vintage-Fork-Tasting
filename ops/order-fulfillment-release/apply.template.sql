-- Commerce project __VERIFIED_COMMERCE_PROJECT__ only. Local guarded draft.
-- Installs fulfillment controls; does not mark any real order completed.
BEGIN;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $guard$
DECLARE expected record; function_oid oid; captured_function pg_proc%rowtype;
BEGIN
  IF to_regprocedure('public.vf_admin_set_order_status_v2(text,text,text,bigint,text,uuid,text,text)') IS NOT NULL
    OR to_regprocedure('vf_legacy_import_v1.vf_admin_subscription_native_safe_v1(uuid)') IS NOT NULL
  THEN RAISE EXCEPTION 'VF_FULFILLMENT_ALREADY_INSTALLED_OR_CONFLICT'; END IF;
  FOR expected IN SELECT * FROM (VALUES
    ('public.commerce_matcha_guard_invoice_order_v1()','98bb9f0e4e112c39161e7b1db9c43cf7','postgres','{postgres=X/postgres}'),
    ('public.commerce_matcha_guard_linked_order_v1()','f425c0975938ad1cf3587566b66a31ed','postgres','{postgres=X/postgres}'),
    ('public.commerce_matcha_mark_fulfilled_v1(text,uuid,text,text)','d9330903d8ac9c75b297b9badf900bf1','postgres','{postgres=X/postgres,service_role=X/postgres}'),
    ('public.commerce_matcha_materialize_invoice_order_v1()','d460b2ccb71b49cd024f8fe837ed2fcf','postgres','{postgres=X/postgres}'),
    ('public.vf_admin_native_orders_page_v1(text,text,text,integer)','0220c13b719e38a444cd53f885030311','postgres','{postgres=X/postgres,authenticated=X/postgres}'),
    ('public.vf_admin_order_operations_v1(jsonb)','848ebddaed0edb347c2d01006931512d','postgres','{postgres=X/postgres,authenticated=X/postgres}'),
    ('public.vf_admin_set_order_status_v1(text,text,text,bigint,text,uuid,text)','9affb47b52f4044bcf7c3ae45329be74','postgres','{postgres=X/postgres,authenticated=X/postgres}'),
    ('vf_legacy_import_v1.vf_admin_is_owner_v1()','ae71b52ad4bd22914b32cafddd17dd51','postgres','{postgres=X/postgres}'),
    ('vf_legacy_import_v1.vf_admin_native_safe_v1(uuid)','1f4cc26378b86c576087ecc73b7d961d','postgres','{postgres=X/postgres}'),
    ('vf_legacy_import_v1.vf_admin_native_source_version_v1(uuid)','a2dea99ca39e8f70bad6d2f9d7f06f59','postgres','{postgres=X/postgres}'),
    ('vf_legacy_import_v1.vf_admin_stripe_native_safe_v1(uuid)','47fa4766240dcc41a2f200322883b7d5','postgres','{postgres=X/postgres}'),
    ('public.commerce_inventory_enforcement_enabled_v1()','9a8833066d04f2d9bb8b46456dfa85a4','postgres','{postgres=X/postgres,service_role=X/postgres}'),
    ('public.commerce_pos_cash_order_evidence_v1(uuid,uuid,boolean)','2fc69b006e431d0f3e27445312256fd8','postgres','{postgres=X/postgres}'),
    ('public.commerce_pos_order_guard_v1()','124c77dac223b7f8dca46db940062350','postgres','{postgres=X/postgres}'),
    ('public.vf_queue_completed_email_v1()','309bab7aab27192cb307325f389879cc','postgres','{postgres=X/postgres}'),
    ('vf_legacy_import_v1.vf_completed_order_details_v1(text,text,text)','ddf0cc5fb1ac247e5ee953b965b03554','postgres','{postgres=X/postgres}')
  ) x(signature,definition_md5,owner_name,acl) LOOP
    function_oid:=to_regprocedure(expected.signature);
    SELECT * INTO captured_function FROM pg_proc WHERE oid=function_oid;
    IF function_oid IS NULL OR md5(pg_get_functiondef(function_oid))<>expected.definition_md5
      OR pg_get_userbyid(captured_function.proowner) IS DISTINCT FROM expected.owner_name
      OR captured_function.proacl::text IS DISTINCT FROM expected.acl
    THEN RAISE EXCEPTION 'VF_FULFILLMENT_AUTHORITY_CHANGED:%',expected.signature; END IF;
  END LOOP;
  IF to_regprocedure('public.vf_guard_held_native_order_v1()') IS NULL
    OR NOT EXISTS(SELECT 1 FROM pg_trigger t
      WHERE t.tgrelid='public.vf_admin_order_status_audit_v1'::regclass
        AND t.tgname='vf_queue_completed_email_v1' AND t.tgtype=5 AND t.tgenabled='O'
        AND t.tgfoid='public.vf_queue_completed_email_v1()'::regprocedure)
  THEN RAISE EXCEPTION 'VF_FULFILLMENT_AUDIT_TRIGGER_CONTRACT_MISSING'; END IF;
END $guard$;
CREATE TEMP TABLE vf_fulfillment_metadata_before ON COMMIT DROP AS
  SELECT oid,proowner,proacl,proconfig,prosecdef,provolatile,proparallel,proisstrict,
    procost,prorows,prorettype,proargtypes,prolang
  FROM pg_proc WHERE oid IN ('vf_legacy_import_v1.vf_admin_native_safe_v1(uuid)'::regprocedure,'public.vf_admin_set_order_status_v1(text,text,text,bigint,text,uuid,text)'::regprocedure,'public.vf_admin_order_operations_v1(jsonb)'::regprocedure,'public.vf_admin_native_orders_page_v1(text,text,text,integer)'::regprocedure,'vf_legacy_import_v1.vf_admin_stripe_native_safe_v1(uuid)'::regprocedure );
-- Internal capability predicate. It never changes an order or a payment.
CREATE FUNCTION vf_legacy_import_v1.vf_admin_subscription_native_safe_v1(p_order_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE
  o public.commerce_orders%rowtype;
  invoice public.commerce_matcha_invoices_v1%rowtype;
  subscription public.commerce_matcha_subscriptions_v1%rowtype;
  release public.commerce_matcha_order_releases_v1%rowtype;
  response jsonb;
  shipping_label text;
BEGIN
  SELECT * INTO o FROM public.commerce_orders WHERE id=p_order_id;
  IF NOT FOUND OR o.source IS DISTINCT FROM 'matcha_subscription'
    OR o.status IS NULL OR o.status NOT IN('paid','processing')
    OR o.payment_status IS DISTINCT FROM 'paid' OR o.payment_provider IS DISTINCT FROM 'stripe'
    OR o.refunded_cents IS DISTINCT FROM 0 OR o.currency IS DISTINCT FROM 'cad'
    OR o.total_cents IS NULL OR o.total_cents<=0 OR o.fulfilled_at IS NOT NULL
    OR o.checkout_attempt_id IS NOT NULL
    OR o.stripe_invoice_id IS NULL OR o.stripe_invoice_id!~'^in_[A-Za-z0-9]+$'
    OR o.stripe_subscription_id IS NULL OR o.stripe_subscription_id!~'^sub_[A-Za-z0-9]+$'
    OR o.stripe_payment_intent_id IS NULL OR o.stripe_payment_intent_id!~'^pi_[A-Za-z0-9]+$'
    OR NOT EXISTS(SELECT 1 FROM public.commerce_order_items i WHERE i.order_id=o.id)
    OR EXISTS(SELECT 1 FROM public.commerce_order_items i WHERE i.order_id=o.id
      AND (i.fulfillment_status IS NULL OR i.fulfillment_status NOT IN('unfulfilled','processing')))
  THEN RETURN false; END IF;

  IF o.source='matcha_subscription' THEN
    SELECT * INTO invoice FROM public.commerce_matcha_invoices_v1
      WHERE invoice_id=o.stripe_invoice_id AND commerce_order_id=o.id;
    IF NOT FOUND OR invoice.invoice_status IS DISTINCT FROM 'paid'
      OR invoice.fulfillment_status IS DISTINCT FROM 'review_required'
      OR invoice.refunded_cents IS DISTINCT FROM 0 OR invoice.stripe_livemode IS DISTINCT FROM true
      OR invoice.stripe_account_id IS DISTINCT FROM '__VERIFIED_STRIPE_ACCOUNT_ID__'
      OR invoice.currency IS DISTINCT FROM 'cad' OR invoice.paid_at IS NULL
      OR invoice.stripe_charge_id IS NULL OR invoice.stripe_charge_id!~'^ch_[A-Za-z0-9]+$'
      OR invoice.total_cents IS DISTINCT FROM invoice.product_cents+invoice.shipping_cents
      OR invoice.tax_cents IS DISTINCT FROM 0
      OR EXISTS(SELECT 1 FROM public.commerce_matcha_fulfillments_v1 f WHERE f.invoice_id=invoice.invoice_id)
      OR EXISTS(SELECT 1 FROM public.commerce_matcha_event_reviews_v1 r
        WHERE r.object_id IN(invoice.invoice_id,invoice.stripe_payment_intent_id,invoice.stripe_charge_id)
          AND r.resolved_at IS NULL)
    THEN RETURN false; END IF;
    SELECT * INTO subscription FROM public.commerce_matcha_subscriptions_v1
      WHERE stripe_subscription_id=invoice.stripe_subscription_id;
    IF NOT FOUND OR row(subscription.stripe_customer_id,subscription.stripe_account_id,
      subscription.stripe_livemode,subscription.size,subscription.fulfillment,
      subscription.shipping_method_id,subscription.monthly_total_cents)
      IS DISTINCT FROM row(invoice.stripe_customer_id,invoice.stripe_account_id,
        invoice.stripe_livemode,invoice.size,invoice.fulfillment,invoice.shipping_method_id,invoice.total_cents)
    THEN RETURN false; END IF;
    SELECT * INTO release FROM public.commerce_matcha_order_releases_v1
      WHERE stripe_price_id=invoice.product_price_id AND size=invoice.size;
    IF NOT FOUND THEN RETURN false; END IF;
    shipping_label:=CASE WHEN invoice.fulfillment='pickup' THEN 'Pickup at the tea shop'
      WHEN invoice.shipping_cents=0 THEN 'Free local delivery' ELSE 'Canada delivery' END;
    response:=jsonb_build_object('matchaInvoiceOrderVersion',1,'invoiceId',invoice.invoice_id,
      'subscriptionId',invoice.stripe_subscription_id,'paymentIntentId',invoice.stripe_payment_intent_id,
      'chargeId',invoice.stripe_charge_id,'stripeAccountId',invoice.stripe_account_id,'livemode',true,
      'shippingMethodId',invoice.shipping_method_id,'fulfillment',invoice.fulfillment);
    IF row(o.stripe_subscription_id,o.stripe_payment_intent_id,o.stripe_charge_id,
      o.stripe_account_id,o.stripe_livemode,o.subtotal_cents,o.shipping_cents,o.tax_cents,o.total_cents,
      o.customer_email,o.shipping_address,o.shipping_method_snapshot,o.placed_at)
      IS DISTINCT FROM row(invoice.stripe_subscription_id,invoice.stripe_payment_intent_id,
        invoice.stripe_charge_id,invoice.stripe_account_id,true,invoice.product_cents,
        invoice.shipping_cents,0,invoice.total_cents,invoice.customer_email,invoice.shipping_address,
        shipping_label,invoice.paid_at)
      OR o.payment_method IS NOT NULL OR o.inventory_committed_at IS NOT NULL
      OR o.discount_cents IS DISTINCT FROM 0 OR o.gold_leaves_cents IS DISTINCT FROM 0
      OR o.coupon_code IS NOT NULL OR o.coupon_revision_id IS NOT NULL
      OR o.external_reference IS DISTINCT FROM invoice.invoice_id
      OR o.migration_snapshot IS DISTINCT FROM jsonb_build_object('matchaInvoiceOrderVersion',1)
      OR o.provider_response IS DISTINCT FROM response
      OR (SELECT count(*) FROM public.commerce_order_items i WHERE i.order_id=o.id)<>1
      OR NOT EXISTS(SELECT 1 FROM public.commerce_order_items i WHERE i.order_id=o.id
        AND i.product_id=release.product_id AND i.variant_id IS NOT DISTINCT FROM release.variant_id
        AND i.name_snapshot='Matcha Subscribe & Save' AND i.sku_snapshot=release.sku_snapshot
        AND i.variant_snapshot=release.variant_snapshot AND i.quantity=1
        AND i.unit_amount_cents=invoice.product_cents AND i.subtotal_cents=invoice.product_cents
        AND i.total_cents=invoice.product_cents AND i.discount_cents=0 AND i.tax_cents=0
        AND i.stripe_price_id=invoice.product_price_id)
      OR (SELECT count(*) FROM public.commerce_order_payments p WHERE p.order_id=o.id)<>1
      OR NOT EXISTS(SELECT 1 FROM public.commerce_order_payments p WHERE p.order_id=o.id
        AND p.payment_provider='stripe' AND p.payment_method IS NULL
        AND p.stripe_invoice_id=invoice.invoice_id AND p.stripe_subscription_id=invoice.stripe_subscription_id
        AND p.stripe_payment_intent_id=invoice.stripe_payment_intent_id AND p.stripe_charge_id=invoice.stripe_charge_id
        AND p.stripe_account_id=invoice.stripe_account_id AND p.stripe_livemode IS true
        AND p.amount_cents=invoice.total_cents AND p.currency=invoice.currency AND p.status='paid'
        AND p.provider_response=response)
    THEN RETURN false; END IF;
    RETURN true;
  END IF;

  -- Ordinary subscription_renewal has no rows or independently verified
  -- payment ledger on this database. Its unsupported capability remains closed.
  RETURN false;
END $fn$;
ALTER FUNCTION vf_legacy_import_v1.vf_admin_subscription_native_safe_v1(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION vf_legacy_import_v1.vf_admin_subscription_native_safe_v1(uuid)
  FROM public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.vf_admin_set_order_status_v2(p_order_kind text, p_order_id text, p_target_status text, p_expected_revision bigint, p_expected_source_version text, p_operation_id uuid, p_reason text DEFAULT NULL::text, p_fulfillment_reference text DEFAULT NULL::text)
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
  v_fulfillment_reference text:=nullif(trim(p_fulfillment_reference),'');
  observed_source text; observed_invoice text;
  matcha_invoice public.commerce_matcha_invoices_v1%rowtype;
BEGIN
  IF NOT vf_legacy_import_v1.vf_admin_is_owner_v1() THEN
    RAISE EXCEPTION 'VF_ORDER_STATUS_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
  IF p_order_kind IS NULL OR p_order_kind NOT IN('native','imported') OR p_order_id IS NULL
    OR p_target_status IS NULL OR p_target_status NOT IN('processing','on_hold','completed')
    OR p_expected_revision IS NULL OR p_expected_revision<0
    OR p_expected_source_version IS NULL OR p_expected_source_version!~'^[a-f0-9]{64}$'
    OR p_operation_id IS NULL OR (p_reason IS NOT NULL AND length(trim(p_reason)) NOT BETWEEN 3 AND 500)
    OR (v_fulfillment_reference IS NOT NULL AND
      (p_target_status<>'completed' OR length(v_fulfillment_reference) NOT BETWEEN 3 AND 200))
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
      OR prior_audit.evidence->>'fulfillmentReference' IS DISTINCT FROM v_fulfillment_reference
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
    -- Matcha materialization owns invoice -> release -> subscription -> order.
    -- Use this same lock order before taking the native parent/child locks.
    SELECT source,stripe_invoice_id INTO observed_source,observed_invoice
      FROM public.commerce_orders WHERE id=p_order_id::uuid;
    IF NOT FOUND THEN RAISE EXCEPTION 'VF_ORDER_STATUS_NOT_FOUND' USING ERRCODE='P0002'; END IF;
    IF observed_source='matcha_subscription' THEN
      SELECT * INTO matcha_invoice FROM public.commerce_matcha_invoices_v1
        WHERE invoice_id=observed_invoice AND commerce_order_id=p_order_id::uuid FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'VF_ORDER_STATUS_NATIVE_NOT_SAFE' USING ERRCODE='55000'; END IF;
      PERFORM 1 FROM public.commerce_matcha_order_releases_v1
        WHERE stripe_price_id=matcha_invoice.product_price_id AND size=matcha_invoice.size FOR SHARE;
      PERFORM 1 FROM public.commerce_matcha_subscriptions_v1
        WHERE stripe_subscription_id=matcha_invoice.stripe_subscription_id FOR SHARE;
    END IF;
    SELECT * INTO native FROM public.commerce_orders WHERE id=p_order_id::uuid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'VF_ORDER_STATUS_NOT_FOUND' USING ERRCODE='P0002'; END IF;
    IF native.source IS DISTINCT FROM observed_source OR native.stripe_invoice_id IS DISTINCT FROM observed_invoice
    THEN RAISE EXCEPTION 'VF_ORDER_STATUS_STALE_SOURCE' USING ERRCODE='40001'; END IF;
    -- The parent row lock fences concurrent child inserts through the FK; lock
    -- existing children in stable order before hashing and changing fulfillment.
    PERFORM 1 FROM public.commerce_order_items WHERE order_id=native.id ORDER BY id FOR UPDATE;
    IF native.source='matcha_subscription' THEN
      -- Keep the verified paid allocation stable across the ledger projection.
      -- The materializer also takes parent, item, then payment row locks.
      PERFORM 1 FROM public.commerce_order_payments WHERE order_id=native.id ORDER BY id FOR UPDATE;
    END IF;
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
    IF native.source='matcha_subscription' AND p_target_status='completed' AND v_fulfillment_reference IS NULL
    THEN RAISE EXCEPTION 'VF_ORDER_STATUS_FULFILLMENT_REFERENCE_REQUIRED' USING ERRCODE='22023'; END IF;
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
    ELSIF p_target_status='completed' AND native.source='matcha_subscription' THEN
      -- The existing ledger RPC records staff evidence and its trigger projects
      -- fulfillment to the exact linked order/items. Never bypass these guards.
      IF public.commerce_matcha_mark_fulfilled_v1(native.stripe_invoice_id,actor,
        v_fulfillment_reference,nullif(trim(p_reason),'')) IS DISTINCT FROM true
      THEN RAISE EXCEPTION 'VF_ORDER_STATUS_NATIVE_NOT_SAFE' USING ERRCODE='55000'; END IF;
      IF NOT EXISTS(SELECT 1 FROM public.commerce_orders o
        JOIN public.commerce_matcha_invoices_v1 i ON i.invoice_id=o.stripe_invoice_id AND i.commerce_order_id=o.id
        JOIN public.commerce_matcha_fulfillments_v1 f ON f.invoice_id=i.invoice_id
        WHERE o.id=native.id AND o.source='matcha_subscription' AND o.status='fulfilled'
          AND o.payment_status='paid' AND o.refunded_cents=0 AND i.invoice_status='paid'
          AND i.refunded_cents=0 AND i.fulfillment_status='fulfilled'
          AND o.fulfilled_at=f.fulfilled_at AND f.staff_profile_id=actor
          AND f.fulfillment_reference=v_fulfillment_reference)
        OR EXISTS(SELECT 1 FROM public.commerce_order_items i WHERE i.order_id=native.id
          AND i.fulfillment_status IS DISTINCT FROM 'fulfilled')
      THEN RAISE EXCEPTION 'VF_ORDER_STATUS_NATIVE_NOT_SAFE' USING ERRCODE='55000'; END IF;
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
      'historicalEvidenceChanged',false,'importedOperationalOverlay',p_order_kind='imported')
      || CASE WHEN v_fulfillment_reference IS NOT NULL
        THEN jsonb_build_object('fulfillmentReference',v_fulfillment_reference) ELSE '{}'::jsonb END);

  SELECT jsonb_build_object('kind',s.order_kind,'orderId',s.order_id,'status',s.operational_status,
    'revision',s.revision,'sourceVersion',s.source_version,'sourceStatus',s.source_status_snapshot,
    'updatedAt',s.updated_at,'replayed',false) INTO result
  FROM public.vf_admin_order_operational_state_v1 s
  WHERE s.order_kind=p_order_kind AND s.order_id=p_order_id;
  RETURN result;
END $function$;

ALTER FUNCTION public.vf_admin_set_order_status_v2(text,text,text,bigint,text,uuid,text,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.vf_admin_set_order_status_v2(text,text,text,bigint,text,uuid,text,text)
  FROM public,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.vf_admin_set_order_status_v2(text,text,text,bigint,text,uuid,text,text) TO authenticated;

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
  or o.status not in ('paid','processing')
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

CREATE OR REPLACE FUNCTION vf_legacy_import_v1.vf_admin_native_safe_v1(p_order_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  SELECT EXISTS(SELECT 1 FROM public.commerce_orders o
    WHERE o.id=p_order_id AND o.source='web' AND o.migration_snapshot='{}'::jsonb
      AND o.stripe_subscription_id IS NULL AND o.stripe_invoice_id IS NULL
      AND ((o.payment_provider IN('helcim','paypal') AND o.inventory_committed_at IS NOT NULL) OR (o.payment_provider='stripe' AND vf_legacy_import_v1.vf_admin_stripe_native_safe_v1(o.id)))
      AND o.payment_status='paid' AND o.refunded_cents=0
      AND o.status IN('paid','processing')
      AND EXISTS(SELECT 1 FROM public.commerce_order_items i WHERE i.order_id=o.id)
      AND NOT EXISTS(SELECT 1 FROM public.commerce_order_items i WHERE i.order_id=o.id
        AND i.fulfillment_status NOT IN('unfulfilled','processing')))
    OR vf_legacy_import_v1.vf_admin_subscription_native_safe_v1(p_order_id);
$function$;

CREATE OR REPLACE FUNCTION public.vf_admin_set_order_status_v1(p_order_kind text, p_order_id text, p_target_status text, p_expected_revision bigint, p_expected_source_version text, p_operation_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
 SET statement_timeout TO '8000'
AS $function$
BEGIN
  -- Preserve the deployed v1 signature and legacy web/imported behavior.
  -- Matcha completion requires the explicit evidence field exposed by v2.
  RETURN public.vf_admin_set_order_status_v2(p_order_kind,p_order_id,p_target_status,
    p_expected_revision,p_expected_source_version,p_operation_id,p_reason,NULL);
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
    'fulfillmentReferenceRequired',kind='native' AND EXISTS(
      SELECT 1 FROM public.commerce_orders reference_order
      WHERE reference_order.id=CASE WHEN kind='native' THEN order_id::uuid ELSE NULL END
        AND reference_order.source='matcha_subscription'),
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
      'fulfillmentReferenceRequired',source='matcha_subscription',
      'allowedTargets',CASE WHEN actionable AND NOT stale_overlay AND effective_status<>'completed'
        THEN to_jsonb(ARRAY(SELECT v FROM unnest(ARRAY['processing','on_hold','completed'])v WHERE v<>effective_status)) ELSE '[]'::jsonb END))
    ORDER BY order_number DESC) FILTER(WHERE rn<=p_limit),'[]'::jsonb),
    'total',(SELECT count(*) FROM matching),'nextCursor',CASE WHEN count(*)>p_limit
      THEN max(order_number::text) FILTER(WHERE rn=p_limit) ELSE NULL END) INTO result
  FROM (SELECT page.*,row_number() OVER(ORDER BY order_number DESC) rn FROM page) q;
  RETURN result;
END $function$;

DO $preserved$
BEGIN
  IF EXISTS(SELECT 1 FROM vf_fulfillment_metadata_before b JOIN pg_proc p ON p.oid=b.oid
    WHERE row(p.proowner,p.proacl,p.proconfig,p.prosecdef,p.provolatile,p.proparallel,p.proisstrict,
      p.procost,p.prorows,p.prorettype,p.proargtypes,p.prolang)
    IS DISTINCT FROM row(b.proowner,b.proacl,b.proconfig,b.prosecdef,b.provolatile,b.proparallel,b.proisstrict,
      b.procost,b.prorows,b.prorettype,b.proargtypes,b.prolang))
  THEN RAISE EXCEPTION 'VF_FULFILLMENT_FUNCTION_METADATA_CHANGED'; END IF;
  IF has_function_privilege('anon','public.vf_admin_set_order_status_v2(text,text,text,bigint,text,uuid,text,text)','EXECUTE')
    OR has_function_privilege('service_role','public.vf_admin_set_order_status_v2(text,text,text,bigint,text,uuid,text,text)','EXECUTE')
    OR NOT has_function_privilege('authenticated','public.vf_admin_set_order_status_v2(text,text,text,bigint,text,uuid,text,text)','EXECUTE')
    OR has_function_privilege('authenticated','vf_legacy_import_v1.vf_admin_subscription_native_safe_v1(uuid)','EXECUTE')
  THEN RAISE EXCEPTION 'VF_FULFILLMENT_FUNCTION_PRIVILEGES_CHANGED'; END IF;
END $preserved$;
COMMIT;
