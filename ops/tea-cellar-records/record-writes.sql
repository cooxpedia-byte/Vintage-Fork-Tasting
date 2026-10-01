-- Exercise the underlying writes issued by solo save/complete and live upsert.
-- The protected RPCs are intentionally not copied/redefined by this migration.
SELECT public.fixture_assert(public.fixture_economic_state()=(SELECT value FROM public.fixture_state WHERE label='economic'),'apply preserves all economic state');
SELECT public.fixture_assert(public.fixture_record_state()=(SELECT value FROM public.fixture_state WHERE label='records'),'apply preserves all original record data');
SELECT public.fixture_assert(public.fixture_function_state()=(SELECT value FROM public.fixture_state WHERE label='functions'),'all function definitions and identities retained');
SELECT public.fixture_assert(public.fixture_unrelated_trigger_state()=(SELECT value FROM public.fixture_state WHERE label='unrelated_triggers'),'all unrelated triggers retained');
SELECT public.fixture_assert((SELECT count(*)=0 FROM pg_trigger WHERE tgname IN ('tasting_cards_sync_merchant_progress','tea_responses_sync_merchant_progress')),'only targeted attachments removed');

INSERT INTO public.tasting_cards(id,session_id,owner_user_id,tea_name_snapshot,notes) VALUES
 ('30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001','New synthetic tea','New note');
-- The normal save includes tea identity columns, even when unchanged.
UPDATE public.tasting_cards SET notes='Edited note',tea_name_snapshot=tea_name_snapshot,
 canonical_tea_id=canonical_tea_id,personal_tea_record_id=personal_tea_record_id,
 product_identifier_snapshot=product_identifier_snapshot
 WHERE id='30000000-0000-0000-0000-000000000001';
UPDATE public.tasting_cards SET completed_at='2026-01-01 00:00:00+00'
 WHERE id='30000000-0000-0000-0000-000000000001';
INSERT INTO public.tea_responses(id,participant_id,event_flight_item_id,personal_notes,completed_at) VALUES
 ('40000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000001',
  '60000000-0000-0000-0000-000000000001','New live note','2026-01-01 00:00:00+00');
-- Live notes POST always includes completed_at in its upsert payload.
INSERT INTO public.tea_responses(id,participant_id,event_flight_item_id,personal_notes,completed_at) VALUES
 ('40000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001',
  '60000000-0000-0000-0000-000000000001','Edited live note','2026-01-01 00:00:00+00')
 ON CONFLICT(id) DO UPDATE SET personal_notes=EXCLUDED.personal_notes,completed_at=EXCLUDED.completed_at;
UPDATE public.tea_responses SET personal_notes='Edited completed live note',completed_at=completed_at
 WHERE id='40000000-0000-0000-0000-000000000001';

SELECT public.fixture_assert(public.fixture_economic_state()=(SELECT value FROM public.fixture_state WHERE label='economic'),'record writes cannot reach synthetic price/wallet/ledger effects');
SELECT public.fixture_assert((SELECT count(*)=2 FROM public.tasting_cards),'new and original cards retained');
SELECT public.fixture_assert((SELECT count(*)=2 FROM public.tea_responses),'new and original live notes retained');
SELECT public.fixture_assert((SELECT session_id='10000000-0000-0000-0000-000000000001'::uuid
 AND owner_user_id='20000000-0000-0000-0000-000000000001'::uuid AND notes='Edited note'
 AND tea_name_snapshot='Synthetic tea' AND touch_count=2 AND completed_at IS NOT NULL
 FROM public.tasting_cards WHERE id='30000000-0000-0000-0000-000000000001'),'card identity/data/save/complete and touch trigger');
SELECT public.fixture_assert((SELECT participant_id='50000000-0000-0000-0000-000000000001'::uuid
 AND event_flight_item_id='60000000-0000-0000-0000-000000000001'::uuid
 AND personal_notes='Edited completed live note' AND touch_count=2 AND stamp_released_at IS NOT NULL
 FROM public.tea_responses WHERE id='40000000-0000-0000-0000-000000000001'),'live identity/data and unrelated stamp/touch triggers');
SELECT public.fixture_assert((SELECT notes='Preserve this private attachment' FROM public.tasting_card_private_notes
 WHERE card_id='30000000-0000-0000-0000-000000000001'),'private attachment preserved');
SELECT public.fixture_assert((SELECT notes='Preserve this session' FROM public.tasting_sessions
 WHERE id='10000000-0000-0000-0000-000000000001'),'session preserved');
UPDATE public.fixture_state SET value=public.fixture_record_state() WHERE label='records';
