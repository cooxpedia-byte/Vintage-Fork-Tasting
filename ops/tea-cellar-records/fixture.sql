-- Synthetic, disposable database only. No production rows or schema dump.
DO $$ BEGIN
  IF NOT (
       current_database() ~ '^vf_records_test_[a-z0-9_]+$'
       OR (current_database() = 'template1'
           AND coalesce(current_setting('vf.synthetic_fixture_mode',true),'') = 'pglite-in-memory'
           AND version() LIKE '%compiled by emcc (Emscripten%')
     )
     OR current_setting('server_version_num')::integer NOT BETWEEN 170000 AND 179999
     OR EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
                WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S','f')) THEN
    RAISE EXCEPTION 'fixture_requires_empty_disposable_postgres17_database';
  END IF;
END $$;

CREATE TABLE public.tasting_sessions(id uuid PRIMARY KEY, owner_user_id uuid NOT NULL, notes text);
CREATE TABLE public.tasting_cards(
  id uuid PRIMARY KEY, session_id uuid NOT NULL REFERENCES public.tasting_sessions(id),
  owner_user_id uuid NOT NULL, completed_at timestamptz, canonical_tea_id uuid,
  personal_tea_record_id uuid, product_identifier_snapshot text, tea_name_snapshot text,
  notes text, touch_count integer NOT NULL DEFAULT 0
);
CREATE TABLE public.tea_responses(
  id uuid PRIMARY KEY, participant_id uuid NOT NULL, event_flight_item_id uuid NOT NULL,
  completed_at timestamptz, stamp_released_at timestamptz, personal_notes text,
  touch_count integer NOT NULL DEFAULT 0
);
CREATE TABLE public.tasting_card_private_notes(card_id uuid PRIMARY KEY REFERENCES public.tasting_cards(id), notes text);
CREATE TABLE public.merchant_wallets(id integer PRIMARY KEY, balance bigint NOT NULL);
CREATE TABLE public.merchant_ledger_entries(id integer PRIMARY KEY, leaves_delta bigint NOT NULL);
CREATE TABLE public.merchant_card_progress(id integer PRIMARY KEY, current_leaf_price integer NOT NULL);
CREATE TABLE public.merchant_listings(id integer PRIMARY KEY, calculated_leaf_price integer NOT NULL);
CREATE TABLE public.tea_catalog_prices(id integer PRIMARY KEY, price_per_kilo_cents integer NOT NULL);
CREATE TABLE public.commerce_checkout_attempts(id integer PRIMARY KEY, status text NOT NULL);
CREATE TABLE public.fixture_calls(kind text PRIMARY KEY, calls integer NOT NULL);
CREATE TABLE public.fixture_state(label text PRIMARY KEY, value jsonb NOT NULL);

INSERT INTO public.tasting_sessions VALUES
 ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','Preserve this session');
INSERT INTO public.tasting_cards(id,session_id,owner_user_id,tea_name_snapshot,notes) VALUES
 ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001','Synthetic tea','Original note');
INSERT INTO public.tasting_card_private_notes VALUES
 ('30000000-0000-0000-0000-000000000001','Preserve this private attachment');
INSERT INTO public.tea_responses(id,participant_id,event_flight_item_id,personal_notes) VALUES
 ('40000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001',
  '60000000-0000-0000-0000-000000000001','Original live note');
INSERT INTO public.merchant_wallets VALUES (1,1234);
INSERT INTO public.merchant_ledger_entries VALUES (1,1234);
INSERT INTO public.merchant_card_progress VALUES (1,5);
INSERT INTO public.merchant_listings VALUES (1,5);
INSERT INTO public.tea_catalog_prices VALUES (1,50000);
INSERT INTO public.commerce_checkout_attempts VALUES (1,'paid');
INSERT INTO public.fixture_calls VALUES ('progression',0),('catalog',0);

-- Deliberately conspicuous synthetic economic effects: any accidental record
-- coupling changes these values, making the behavior assertion fail.
CREATE FUNCTION public.refresh_merchant_card_progress(uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.fixture_calls SET calls=calls+1 WHERE kind='progression';
  UPDATE public.merchant_wallets SET balance=balance+1;
  UPDATE public.merchant_ledger_entries SET leaves_delta=leaves_delta+1;
  UPDATE public.merchant_card_progress SET current_leaf_price=current_leaf_price+1;
  UPDATE public.merchant_listings SET calculated_leaf_price=calculated_leaf_price+1;
  UPDATE public.tea_catalog_prices SET price_per_kilo_cents=price_per_kilo_cents+1;
END $$;
CREATE FUNCTION public.sync_merchant_progress_from_card() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN PERFORM public.refresh_merchant_card_progress(NEW.owner_user_id); RETURN NEW; END $$;
CREATE FUNCTION public.sync_merchant_progress_from_live_stamp() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN PERFORM public.refresh_merchant_card_progress(NEW.participant_id); RETURN NEW; END $$;
CREATE FUNCTION public.sync_merchant_progress_from_catalog() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN UPDATE public.fixture_calls SET calls=calls+1 WHERE kind='catalog'; RETURN NEW; END $$;
CREATE FUNCTION public.fixture_touch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.touch_count := OLD.touch_count+1; RETURN NEW; END $$;
CREATE FUNCTION public.validate_tea_response_scope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.participant_id IS NULL OR NEW.event_flight_item_id IS NULL THEN
    RAISE EXCEPTION 'fixture_scope_rejected';
  END IF;
  RETURN NEW;
END $$;
CREATE FUNCTION public.release_late_tasting_stamp_after_host_progress() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.completed_at IS NOT NULL AND NEW.stamp_released_at IS NULL THEN
    NEW.stamp_released_at := '2026-01-01 00:00:00+00';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER tasting_cards_sync_merchant_progress
 AFTER INSERT OR UPDATE OF completed_at, canonical_tea_id, personal_tea_record_id, product_identifier_snapshot, tea_name_snapshot
 ON public.tasting_cards FOR EACH ROW EXECUTE FUNCTION public.sync_merchant_progress_from_card();
CREATE TRIGGER tea_responses_sync_merchant_progress
 AFTER INSERT OR UPDATE OF completed_at, stamp_released_at ON public.tea_responses
 FOR EACH ROW EXECUTE FUNCTION public.sync_merchant_progress_from_live_stamp();
CREATE TRIGGER tasting_cards_touch BEFORE UPDATE ON public.tasting_cards
 FOR EACH ROW EXECUTE FUNCTION public.fixture_touch();
CREATE TRIGGER responses_touch BEFORE UPDATE ON public.tea_responses
 FOR EACH ROW EXECUTE FUNCTION public.fixture_touch();
CREATE TRIGGER tea_response_scope BEFORE INSERT OR UPDATE OF participant_id,event_flight_item_id
 ON public.tea_responses FOR EACH ROW EXECUTE FUNCTION public.validate_tea_response_scope();
CREATE TRIGGER tea_responses_release_late_stamp BEFORE INSERT OR UPDATE OF completed_at,event_flight_item_id
 ON public.tea_responses FOR EACH ROW EXECUTE FUNCTION public.release_late_tasting_stamp_after_host_progress();
CREATE TRIGGER tea_catalog_prices_sync_merchant_progress AFTER UPDATE OF price_per_kilo_cents
 ON public.tea_catalog_prices FOR EACH ROW EXECUTE FUNCTION public.sync_merchant_progress_from_catalog();

CREATE FUNCTION public.fixture_assert(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'fixture_assertion_failed: %',label; END IF; END $$;
CREATE FUNCTION public.fixture_economic_state() RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object(
  'wallets',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.merchant_wallets t),
  'ledger',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.merchant_ledger_entries t),
  'progress',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.merchant_card_progress t),
  'listings',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.merchant_listings t),
  'prices',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.tea_catalog_prices t),
  'checkout',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.commerce_checkout_attempts t),
  'calls',(SELECT jsonb_agg(to_jsonb(t) ORDER BY kind) FROM public.fixture_calls t));
$$;
CREATE FUNCTION public.fixture_record_state() RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object(
  'sessions',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.tasting_sessions t),
  'cards',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.tasting_cards t),
  'responses',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.tea_responses t),
  'notes',(SELECT jsonb_agg(to_jsonb(t) ORDER BY card_id) FROM public.tasting_card_private_notes t));
$$;
CREATE FUNCTION public.fixture_function_state() RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_agg(jsonb_build_array(p.oid::text,pg_get_functiondef(p.oid)) ORDER BY p.oid)
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f';
$$;
CREATE FUNCTION public.fixture_unrelated_trigger_state() RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_agg(jsonb_build_array(t.oid::text,t.tgenabled,pg_get_triggerdef(t.oid,false)) ORDER BY t.oid)
 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND NOT t.tgisinternal
 AND t.tgname NOT IN ('tasting_cards_sync_merchant_progress','tea_responses_sync_merchant_progress');
$$;
INSERT INTO public.fixture_state VALUES
 ('economic',public.fixture_economic_state()),('records',public.fixture_record_state()),
 ('functions',public.fixture_function_state()),('unrelated_triggers',public.fixture_unrelated_trigger_state());
