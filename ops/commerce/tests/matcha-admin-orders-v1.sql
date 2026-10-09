-- Synthetic local regression fixture. Run only in an empty disposable database.
-- The context function is the reviewed September 13 v1 body, before this patch.
\set ON_ERROR_STOP on
CREATE SCHEMA vf_legacy_import_v1;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE anon NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE TABLE public.commerce_orders (
  id uuid PRIMARY KEY, order_number bigint, customer_email text, billing_address jsonb, source text
);
CREATE TABLE vf_legacy_import_v1.history_orders_current_v2 (source_order_id text, source_type text);
CREATE TABLE vf_legacy_import_v1.order_history_delta_head_v1 (singleton boolean, source_sha256 text, updated_at timestamptz);
CREATE FUNCTION vf_legacy_import_v1.vf_admin_is_owner_v1() RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT coalesce(current_setting('vf_test.owner',true),'false')='true' $$;
CREATE FUNCTION vf_legacy_import_v1.vf_admin_native_source_version_v1(uuid) RETURNS text
LANGUAGE sql STABLE AS $$ SELECT CASE WHEN current_setting('vf_test.bad_version',true)='true' THEN 'invalid' ELSE repeat('a',64) END $$;
CREATE FUNCTION vf_legacy_import_v1.vf_admin_imported_source_version_v1(text) RETURNS text
LANGUAGE sql STABLE AS $$ SELECT repeat('b',64) $$;
CREATE FUNCTION public.vf_admin_order_contacts_v1(text[]) RETURNS jsonb
LANGUAGE sql STABLE AS $$ SELECT jsonb_build_object('contacts',jsonb_build_array(jsonb_build_object(
  'orderId',$1[1],'billingAmbiguous',false,'billing',jsonb_build_object('email','imported@example.test','name','Imported Customer')))) $$;
CREATE FUNCTION vf_legacy_import_v1.vf_customer_note_context_v1(p_order_kind text,p_order_id text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $f$
DECLARE o public.commerce_orders%rowtype;h record;c jsonb;e text;n text;num text;v text;fence text;head text;stamp text;
 reason text;provenance text;
BEGIN
 IF NOT vf_legacy_import_v1.vf_admin_is_owner_v1() THEN RAISE EXCEPTION 'VF_CUSTOMER_NOTE_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 IF p_order_kind IS NULL OR p_order_kind NOT IN('native','imported') OR p_order_id IS NULL
  OR(p_order_kind='native' AND p_order_id!~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
  OR(p_order_kind='imported' AND p_order_id!~'^[1-9][0-9]{0,19}$')
 THEN RAISE EXCEPTION 'VF_CUSTOMER_NOTE_INVALID' USING ERRCODE='22023'; END IF;
 IF p_order_kind='native' THEN
  SELECT * INTO o FROM public.commerce_orders WHERE id=p_order_id::uuid;
  IF NOT FOUND THEN RAISE EXCEPTION 'VF_CUSTOMER_NOTE_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  num:=o.order_number::text;e:=lower(trim(o.customer_email));n:=left(nullif(trim(o.billing_address->>'name'),''),500);
  v:=vf_legacy_import_v1.vf_admin_native_source_version_v1(o.id);provenance:='commerce_orders.customer_email';
  IF o.source NOT IN('web','subscription_renewal') THEN reason:='order_unavailable'; END IF;
 ELSE
  SELECT * INTO h FROM vf_legacy_import_v1.history_orders_current_v2 WHERE source_order_id=p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'VF_CUSTOMER_NOTE_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  num:=p_order_id;v:=vf_legacy_import_v1.vf_admin_imported_source_version_v1(p_order_id);
  provenance:='saved_current_order_address:billing';
  SELECT source_sha256,updated_at::text INTO head,stamp FROM vf_legacy_import_v1.order_history_delta_head_v1 WHERE singleton;
  c:=public.vf_admin_order_contacts_v1(ARRAY[p_order_id]);
  IF h.source_type IS DISTINCT FROM 'shop_order' THEN reason:='order_unavailable';
  ELSIF jsonb_array_length(c->'contacts') IS DISTINCT FROM 1 OR c#>>'{contacts,0,orderId}' IS DISTINCT FROM p_order_id
   OR coalesce((c#>>'{contacts,0,billingAmbiguous}')::boolean,true) THEN reason:='recipient_ambiguous'; END IF;
  e:=lower(trim(c#>>'{contacts,0,billing,email}'));n:=left(nullif(trim(c#>>'{contacts,0,billing,name}'),''),500);
 END IF;
 IF reason IS NULL AND(e IS NULL OR length(e) NOT BETWEEN 3 AND 254
  OR e!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' OR e~'[[:cntrl:]]') THEN reason:='recipient_missing_or_invalid'; END IF;
 IF v IS NULL OR v!~'^[a-f0-9]{64}$' OR num!~'^[1-9][0-9]{0,30}$'
  OR(p_order_kind='imported' AND(head IS NULL OR head!~'^[a-f0-9]{64}$' OR stamp IS NULL)) THEN reason:='order_unavailable'; END IF;
 fence:=encode(sha256(convert_to(jsonb_build_array(p_order_kind,p_order_id,num,v,e,n,provenance,head,reason)::text,'UTF8')),'hex');
 RETURN jsonb_build_object('kind',p_order_kind,'orderId',p_order_id,'orderNumber',num,'recipientEmail',e,'customerName',n,
  'sourceVersion',fence,'canSend',reason IS NULL,'unavailableReason',reason,'provenance',provenance,'headVersion',head,'importedAt',stamp);
END $f$;
REVOKE ALL ON FUNCTION vf_legacy_import_v1.vf_customer_note_context_v1(text,text) FROM PUBLIC,authenticated,anon,service_role;
INSERT INTO public.commerce_orders VALUES
 ('10000000-0000-4000-8000-000000000001',10001,' Matcha@Example.Test ','{"name":"Matcha Customer"}','matcha_subscription'),
 ('10000000-0000-4000-8000-000000000002',10002,'web@example.test','{"name":"Web Customer"}','web'),
 ('10000000-0000-4000-8000-000000000003',10003,'renewal@example.test','{"name":"Renewal Customer"}','subscription_renewal'),
 ('10000000-0000-4000-8000-000000000004',10004,'legacy@example.test','{}','legacy'),
 ('10000000-0000-4000-8000-000000000005',10005,'invalid','{}','matcha_subscription'),
 ('10000000-0000-4000-8000-000000000006',10006,NULL,'{}','matcha_subscription');
INSERT INTO vf_legacy_import_v1.history_orders_current_v2 VALUES ('123','shop_order');
INSERT INTO vf_legacy_import_v1.order_history_delta_head_v1 VALUES (true,repeat('c',64),'2026-10-09T00:00:00Z');
DO $test$ BEGIN
  BEGIN
    PERFORM vf_legacy_import_v1.vf_customer_note_context_v1('native','10000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'authorization unexpectedly allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $test$;
SET vf_test.owner='true';
DO $test$ DECLARE c jsonb; BEGIN
 c:=vf_legacy_import_v1.vf_customer_note_context_v1('native','10000000-0000-4000-8000-000000000001');
 IF c->>'unavailableReason'<>'order_unavailable' OR (c->>'canSend')::boolean THEN RAISE EXCEPTION 'baseline must reject Matcha'; END IF;
END $test$;
CREATE TEMP TABLE baseline_context AS
 SELECT 'native'::text kind,id::text order_id,vf_legacy_import_v1.vf_customer_note_context_v1('native',id::text) context
 FROM public.commerce_orders WHERE source IN('web','subscription_renewal')
 UNION ALL SELECT 'imported','123',vf_legacy_import_v1.vf_customer_note_context_v1('imported','123');
CREATE TEMP TABLE baseline_proc AS SELECT oid,proowner,proacl,proconfig,prosecdef,provolatile,prosrc
 FROM pg_proc WHERE oid='vf_legacy_import_v1.vf_customer_note_context_v1(text,text)'::regprocedure;
\ir ../matcha-admin-orders-v1.sql
\ir ../matcha-admin-orders-v1.sql
DO $test$
DECLARE c jsonb; previous_fence text; saved_count integer; row_value record; after_proc pg_proc%rowtype; before_proc record;
BEGIN
 SELECT count(*) INTO saved_count FROM public.commerce_orders;
 IF saved_count<>6 THEN RAISE EXCEPTION 'orders changed'; END IF;
 FOR row_value IN SELECT * FROM baseline_context LOOP
  IF row_value.context IS DISTINCT FROM vf_legacy_import_v1.vf_customer_note_context_v1(row_value.kind,row_value.order_id)
  THEN RAISE EXCEPTION 'web, renewal or imported behavior changed'; END IF;
 END LOOP;
 SELECT * INTO before_proc FROM baseline_proc;
 SELECT * INTO after_proc FROM pg_proc WHERE oid=before_proc.oid;
 IF row(after_proc.proowner,after_proc.proacl,after_proc.proconfig,after_proc.prosecdef,after_proc.provolatile)
   IS DISTINCT FROM row(before_proc.proowner,before_proc.proacl,before_proc.proconfig,before_proc.prosecdef,before_proc.provolatile)
 THEN RAISE EXCEPTION 'function metadata changed'; END IF;
 IF after_proc.prosrc IS DISTINCT FROM replace(before_proc.prosrc,
  'IF o.source NOT IN(''web'',''subscription_renewal'') THEN reason:=''order_unavailable''; END IF;',
  'IF o.source NOT IN(''web'',''subscription_renewal'',''matcha_subscription'') THEN reason:=''order_unavailable''; END IF;')
 THEN RAISE EXCEPTION 'unrelated function code changed'; END IF;
 c:=vf_legacy_import_v1.vf_customer_note_context_v1('native','10000000-0000-4000-8000-000000000001');
 IF NOT (c->>'canSend')::boolean OR c->>'unavailableReason' IS NOT NULL
   OR c->>'recipientEmail'<>'matcha@example.test' OR c->>'orderNumber'<>'10001'
   OR c->>'sourceVersion'!~'^[a-f0-9]{64}$' OR c->>'provenance'<>'commerce_orders.customer_email'
 THEN RAISE EXCEPTION 'Matcha saved recipient or source fence invalid'; END IF;
 previous_fence:=c->>'sourceVersion';
 UPDATE public.commerce_orders SET customer_email='changed@example.test' WHERE id='10000000-0000-4000-8000-000000000001';
 c:=vf_legacy_import_v1.vf_customer_note_context_v1('native','10000000-0000-4000-8000-000000000001');
 IF c->>'sourceVersion'=previous_fence THEN RAISE EXCEPTION 'changed recipient did not invalidate source fence'; END IF;
 FOR row_value IN SELECT id FROM public.commerce_orders WHERE customer_email='invalid' OR customer_email IS NULL LOOP
  c:=vf_legacy_import_v1.vf_customer_note_context_v1('native',row_value.id::text);
  IF (c->>'canSend')::boolean OR c->>'unavailableReason'<>'recipient_missing_or_invalid'
  THEN RAISE EXCEPTION 'invalid saved recipient allowed'; END IF;
 END LOOP;
 c:=vf_legacy_import_v1.vf_customer_note_context_v1('native','10000000-0000-4000-8000-000000000004');
 IF (c->>'canSend')::boolean OR c->>'unavailableReason'<>'order_unavailable' THEN RAISE EXCEPTION 'unknown source allowed'; END IF;
 PERFORM set_config('vf_test.bad_version','true',true);
 c:=vf_legacy_import_v1.vf_customer_note_context_v1('native','10000000-0000-4000-8000-000000000001');
 IF (c->>'canSend')::boolean OR c->>'unavailableReason'<>'order_unavailable' THEN RAISE EXCEPTION 'invalid version allowed'; END IF;
 PERFORM set_config('vf_test.bad_version','false',true);
 BEGIN
  PERFORM vf_legacy_import_v1.vf_customer_note_context_v1('native','bad-id');
  RAISE EXCEPTION 'malformed ID unexpectedly allowed';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN
  PERFORM vf_legacy_import_v1.vf_customer_note_context_v1('native','10000000-0000-4000-8000-000000000007');
  RAISE EXCEPTION 'missing order unexpectedly allowed';
 EXCEPTION WHEN no_data_found THEN NULL; END;
 PERFORM set_config('vf_test.owner','false',true);
 BEGIN
  PERFORM vf_legacy_import_v1.vf_customer_note_context_v1('native','10000000-0000-4000-8000-000000000001');
  RAISE EXCEPTION 'authorization unexpectedly allowed after patch';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 RAISE NOTICE 'VF_MATCHA_ADMIN_NOTE_REGRESSION_OK';
END $test$;
