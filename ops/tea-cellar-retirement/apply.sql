-- UNAPPLIED CANDIDATE. Requires reviewed item 2, fresh preservation backup and item 4 rehearsal.
-- No data UPDATE/DELETE/backfill, balance conversion, ledger entry or checkout function change.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
SET LOCAL search_path=pg_catalog,pg_temp;
LOCK TABLE public.discovery_identity_definitions, public.discovery_identity_recalculations, public.event_breakout_members, public.event_breakout_rooms, public.event_breakout_sessions, public.event_discovery_presentations, public.event_live_reward_awards, public.event_live_reward_completion_overrides, public.event_live_reward_settings, public.events, public.live_tasting_reward_policies, public.living_tasting_map_fingerprints, public.living_tasting_map_moderation_actions, public.living_tasting_map_observation_events, public.living_tasting_map_sessions, public.living_tasting_map_snapshots, public.merchant_card_progress, public.merchant_listings, public.merchant_reactions, public.merchant_study_copies, public.merchant_tasting_verifications, public.merchant_transactions, public.room_discovery_card_items, public.room_discovery_cards, public.tasting_cards, public.tea_catalog_prices, public.tea_responses, public.trivia_answers, public.trivia_questions, public.user_discovery_identities, public.user_discovery_profiles IN ACCESS EXCLUSIVE MODE;
DO $migration$
declare
  manifest jsonb := $manifest${"protected":{"public.post_gold_leaves_entry(uuid,text,bigint,text,text,text,text,jsonb,boolean)":{"cost":100,"kind":"f","rows":0,"config":["search_path=\"\""],"result":"uuid","source":"a007bba1cf42e08324b5f49e9d028fea","strict":false,"language":"plpgsql","parallel":"u","arguments":"p_wallet_id uuid, p_entry_type text, p_leaves_delta bigint, p_source text, p_source_reference text, p_idempotency_key text, p_description text DEFAULT ''::text, p_metadata jsonb DEFAULT '{}'::jsonb, p_allow_negative_balance boolean DEFAULT false","leakproof":false,"volatility":"v","security_definer":true},"public.ensure_current_customer()":{"cost":100,"kind":"f","rows":0,"config":["search_path=\"\""],"result":"uuid","source":"66d2a5b937bb44a92eb4404fe801e1ab","strict":false,"language":"plpgsql","parallel":"u","arguments":"","leakproof":false,"volatility":"v","security_definer":true},"public.get_my_loyalty_summary()":{"cost":100,"kind":"f","rows":1000,"config":["search_path=\"\""],"result":"TABLE(customer_id uuid, account_id uuid, account_status text, points_balance bigint, points_label text, earning_enabled boolean, redemption_enabled boolean)","source":"d0ca1de8417bf2fabd27641096bc1740","strict":false,"language":"plpgsql","parallel":"u","arguments":"","leakproof":false,"volatility":"v","security_definer":true},"public.get_mobile_loyalty_summary(uuid)":{"cost":100,"kind":"f","rows":1000,"config":["search_path=\"\""],"result":"TABLE(owner_user_id uuid, wallet_id uuid, points_balance bigint, points_label text, earning_enabled boolean, redemption_enabled boolean)","source":"698fd13b292d0d8a09e6a05086f222d3","strict":false,"language":"sql","parallel":"u","arguments":"p_mobile_auth_user_id uuid","leakproof":false,"volatility":"s","security_definer":true},"public.get_wordpress_loyalty_summary(bigint)":{"cost":100,"kind":"f","rows":1000,"config":["search_path=\"\""],"result":"TABLE(owner_user_id uuid, wallet_id uuid, points_balance bigint, points_label text, earning_enabled boolean, redemption_enabled boolean)","source":"8254dce768ba0e4f8a3f20c392cc2d6c","strict":false,"language":"sql","parallel":"u","arguments":"p_wordpress_user_id bigint","leakproof":false,"volatility":"s","security_definer":true},"public.register_mobile_customer(uuid,uuid,text)":{"cost":100,"kind":"f","rows":0,"config":["search_path=\"\""],"result":"uuid","source":"20e86ea3c83bb2b3fe1c41ef2a95e01a","strict":false,"language":"plpgsql","parallel":"u","arguments":"p_mobile_auth_user_id uuid, p_owner_user_id uuid, p_email text DEFAULT NULL::text","leakproof":false,"volatility":"v","security_definer":true},"public.register_wordpress_customer(bigint,uuid,text)":{"cost":100,"kind":"f","rows":0,"config":["search_path=\"\""],"result":"uuid","source":"44393ba3d5d5e6ed218db5cd6fc32acb","strict":false,"language":"plpgsql","parallel":"u","arguments":"p_wordpress_user_id bigint, p_owner_user_id uuid DEFAULT NULL::uuid, p_email text DEFAULT NULL::text","leakproof":false,"volatility":"v","security_definer":true},"public.apply_woocommerce_loyalty_refund(text,text,bigint,text,boolean)":{"cost":100,"kind":"f","rows":1000,"config":["search_path=\"\""],"result":"TABLE(earned_points_reversed bigint, redeemed_points_released bigint, current_balance bigint)","source":"dd1db0dfed9c9bcc9656a87c87397526","strict":false,"language":"plpgsql","parallel":"u","arguments":"p_order_reference text, p_refund_reference text, p_cumulative_refunded_eligible_cents bigint, p_idempotency_key text, p_cancelled boolean DEFAULT false","leakproof":false,"volatility":"v","security_definer":true},"public.award_woocommerce_order_gold_leaves(bigint,text,bigint,text,jsonb)":{"cost":100,"kind":"f","rows":1000,"config":["search_path=\"\""],"result":"TABLE(entry_id uuid, points_awarded bigint, current_balance bigint)","source":"8d1401d08e3a042f3aaff1f8a19f14a2","strict":false,"language":"plpgsql","parallel":"u","arguments":"p_wordpress_user_id bigint, p_order_reference text, p_eligible_spend_cents bigint, p_idempotency_key text, p_metadata jsonb DEFAULT '{}'::jsonb","leakproof":false,"volatility":"v","security_definer":true},"public.reserve_woocommerce_gold_leaves(bigint,text,bigint,bigint,text)":{"cost":100,"kind":"f","rows":1000,"config":["search_path=\"\""],"result":"TABLE(entry_id uuid, points_redeemed bigint, remaining_balance bigint)","source":"9dee98a7ff3f19d2942b5a8b8def0f12","strict":false,"language":"plpgsql","parallel":"u","arguments":"p_wordpress_user_id bigint, p_order_reference text, p_eligible_spend_cents bigint, p_requested_points bigint, p_idempotency_key text","leakproof":false,"volatility":"v","security_definer":true},"public.complete_tasting_session(uuid,uuid,integer)":{"cost":100,"kind":"f","rows":0,"config":["search_path=public, pg_temp"],"result":"public.tasting_sessions","source":"00ab8563ae08798cce9b9baae7afcd85","strict":false,"language":"plpgsql","parallel":"u","arguments":"p_session_id uuid, p_operation_id uuid, p_expected_revision integer","leakproof":false,"volatility":"v","security_definer":true},"public.save_solo_tasting_session(uuid,uuid,uuid,integer,jsonb,jsonb,jsonb,jsonb,uuid[])":{"cost":100,"kind":"f","rows":0,"config":["search_path=public, extensions, pg_temp"],"result":"public.tasting_sessions","source":"69b7955118003d128b405fd6364f178a","strict":false,"language":"plpgsql","parallel":"u","arguments":"p_session_id uuid, p_card_id uuid, p_operation_id uuid, p_expected_revision integer, p_tea jsonb, p_card jsonb, p_brewing jsonb, p_private_notes jsonb, p_descriptor_ids uuid[]","leakproof":false,"volatility":"v","security_definer":true},"public.save_solo_tasting_session_v2(uuid,uuid,uuid,integer,jsonb,jsonb,jsonb,jsonb,uuid[])":{"cost":100,"kind":"f","rows":0,"config":["search_path=public, pg_temp"],"result":"public.tasting_sessions","source":"8b3564c0067c977786664abffb950c0a","strict":false,"language":"plpgsql","parallel":"u","arguments":"p_session_id uuid, p_card_id uuid, p_operation_id uuid, p_expected_revision integer, p_tea jsonb, p_card jsonb, p_brewing jsonb, p_private_notes jsonb, p_descriptor_ids uuid[]","leakproof":false,"volatility":"v","security_definer":true},"public.delete_tasting_session(uuid,uuid)":{"cost":100,"kind":"f","rows":0,"config":["search_path=public, pg_temp"],"result":"boolean","source":"10bc7720a5f8179540f82129bfbaa716","strict":false,"language":"plpgsql","parallel":"u","arguments":"p_session_id uuid, p_operation_id uuid","leakproof":false,"volatility":"v","security_definer":true},"public.set_personal_tea_record_archived(uuid,uuid,boolean)":{"cost":100,"kind":"f","rows":0,"config":["search_path=public, pg_temp"],"result":"public.personal_tea_records","source":"a9276b4de3461e275bb6fe4a3baae973","strict":false,"language":"plpgsql","parallel":"u","arguments":"p_personal_tea_id uuid, p_operation_id uuid, p_archived boolean","leakproof":false,"volatility":"v","security_definer":true},"public.set_tasting_session_archived(uuid,uuid,integer,boolean)":{"cost":100,"kind":"f","rows":0,"config":["search_path=public, pg_temp"],"result":"public.tasting_sessions","source":"d00160e63341b27a9a7094a45543d951","strict":false,"language":"plpgsql","parallel":"u","arguments":"p_session_id uuid, p_operation_id uuid, p_expected_revision integer, p_archived boolean","leakproof":false,"volatility":"v","security_definer":true},"public.scrub_deleted_participant_live_content()":{"cost":100,"kind":"f","rows":0,"config":["search_path=public"],"result":"trigger","source":"a72e9d556d20ae6537b09a3ef949a4dd","strict":false,"language":"plpgsql","parallel":"u","arguments":"","leakproof":false,"volatility":"v","security_definer":true},"public.release_late_tasting_stamp_after_host_progress()":{"cost":100,"kind":"f","rows":0,"config":["search_path=public, pg_temp"],"result":"trigger","source":"ba0fbec2f4cc88d601ed0acf8a04c5b6","strict":false,"language":"plpgsql","parallel":"u","arguments":"","leakproof":false,"volatility":"v","security_definer":false},"public.release_tasting_stamps_on_host_progress()":{"cost":100,"kind":"f","rows":0,"config":["search_path=public, pg_temp"],"result":"trigger","source":"60b083885ab3076ff20253934091864d","strict":false,"language":"plpgsql","parallel":"u","arguments":"","leakproof":false,"volatility":"v","security_definer":false},"public.can_manage_event(uuid,uuid)":{"cost":100,"kind":"f","rows":0,"config":["search_path=public"],"result":"boolean","source":"2532ce584ebfc8b9d2b011774a096efd","strict":false,"language":"sql","parallel":"u","arguments":"p_event_id uuid, uid uuid","leakproof":false,"volatility":"s","security_definer":true},"public.is_staff(uuid)":{"cost":100,"kind":"f","rows":0,"config":["search_path=public"],"result":"boolean","source":"b5a5b10c7a8f6b1118227826158515fa","strict":false,"language":"sql","parallel":"u","arguments":"uid uuid","leakproof":false,"volatility":"s","security_definer":true},"public.touch_updated_at()":{"cost":100,"kind":"f","rows":0,"config":null,"result":"trigger","source":"7eb7a124693fea28124edfd2e7860d87","strict":false,"language":"plpgsql","parallel":"u","arguments":"","leakproof":false,"volatility":"v","security_definer":false},"public.resolve_merchant_catalog_tea()":{"cost":100,"kind":"f","rows":0,"config":["search_path=\"\""],"result":"trigger","source":"bf9a34a88495006838673e822ee4bc0d","strict":false,"language":"plpgsql","parallel":"u","arguments":"","leakproof":false,"volatility":"v","security_definer":false},"public.guard_active_breakout_transition()":{"cost":100,"kind":"f","rows":0,"config":["search_path=public"],"result":"trigger","source":"31e5e527303a2987e6d27662f52cfe5e","strict":false,"language":"plpgsql","parallel":"u","arguments":"","leakproof":false,"volatility":"v","security_definer":true},"public.validate_tea_response_scope()":{"cost":100,"kind":"f","rows":0,"config":["search_path=public"],"result":"trigger","source":"fd9e5a65069216365b69beb544d88208","strict":false,"language":"plpgsql","parallel":"u","arguments":"","leakproof":false,"volatility":"v","security_definer":false},"public.gold_leaves_activate_store_v1(uuid,uuid)":{"cost":100,"kind":"f","rows":0,"config":["search_path=\"\""],"result":"jsonb","source":"ee307ae64c2f19405919babbde07b1ed","strict":false,"language":"plpgsql","parallel":"u","arguments":"p_store_profile_id uuid, p_owner_user_id uuid","leakproof":false,"volatility":"v","security_definer":true},"public.gold_leaves_connect_store_v1(uuid,uuid)":{"cost":100,"kind":"f","rows":0,"config":["search_path=\"\""],"result":"uuid","source":"ef5faf85045c14a750120e969c5cabd4","strict":false,"language":"plpgsql","parallel":"u","arguments":"p_store_profile_id uuid, p_owner_user_id uuid","leakproof":false,"volatility":"v","security_definer":true},"public.gold_leaves_identity_v1(text)":{"cost":100,"kind":"f","rows":0,"config":["search_path=\"\""],"result":"jsonb","source":"a179b6c43d83d1a8464c7a9cd618bfc9","strict":false,"language":"sql","parallel":"u","arguments":"p_email text","leakproof":false,"volatility":"s","security_definer":true},"public.gold_leaves_migration_audit_v1()":{"cost":100,"kind":"f","rows":0,"config":["search_path=\"\""],"result":"jsonb","source":"6b09c6073450c5ebfbfdec3df2b83f31","strict":false,"language":"sql","parallel":"u","arguments":"","leakproof":false,"volatility":"s","security_definer":true},"public.gold_leaves_migration_batch_v1(integer)":{"cost":100,"kind":"f","rows":0,"config":["search_path=\"\""],"result":"jsonb","source":"d8a785a5a264068ba595544c1efee60c","strict":false,"language":"plpgsql","parallel":"u","arguments":"p_limit integer DEFAULT 25","leakproof":false,"volatility":"s","security_definer":true},"public.gold_leaves_migration_result_v1(uuid,uuid,text,text)":{"cost":100,"kind":"f","rows":0,"config":["search_path=\"\""],"result":"boolean","source":"91a560a0044c1255759ae380610ac3d2","strict":false,"language":"plpgsql","parallel":"u","arguments":"p_owner_user_id uuid, p_store_profile_id uuid, p_status text, p_error text","leakproof":false,"volatility":"v","security_definer":true},"public.gold_leaves_refund_store_v1(uuid,bigint)":{"cost":100,"kind":"f","rows":0,"config":["search_path=\"\""],"result":"jsonb","source":"47a61e6fca581510b12134e7f7241e69","strict":false,"language":"plpgsql","parallel":"u","arguments":"p_order_id uuid, p_cumulative_eligible_cents bigint","leakproof":false,"volatility":"v","security_definer":true},"public.gold_leaves_release_store_v1(uuid)":{"cost":100,"kind":"f","rows":0,"config":["search_path=\"\""],"result":"bigint","source":"228002a75a922b0bdbbdbf661e65e84a","strict":false,"language":"plpgsql","parallel":"u","arguments":"p_attempt_id uuid","leakproof":false,"volatility":"v","security_definer":true},"public.gold_leaves_reserve_store_v1(uuid,uuid,bigint,bigint)":{"cost":100,"kind":"f","rows":0,"config":["search_path=\"\""],"result":"jsonb","source":"fd792abaf37a3ff0675309ed44daba9c","strict":false,"language":"plpgsql","parallel":"u","arguments":"p_store_profile_id uuid, p_attempt_id uuid, p_eligible_cents bigint, p_leaves bigint","leakproof":false,"volatility":"v","security_definer":true},"public.gold_leaves_settle_store_v1(uuid,uuid)":{"cost":100,"kind":"f","rows":0,"config":["search_path=\"\""],"result":"bigint","source":"cb849bf7937832c09d543cf32a73c010","strict":false,"language":"plpgsql","parallel":"u","arguments":"p_attempt_id uuid, p_order_id uuid","leakproof":false,"volatility":"v","security_definer":true}},"functions":{"claim_live_tasting_shield":{"signature":"public.claim_live_tasting_shield(text, text)","before":{"cost":100,"kind":"f","rows":1000,"config":["search_path=\"\""],"result":"TABLE(card_id uuid, tasting_count integer, card_tier text, listing_eligible boolean, shielded boolean, price_per_kilo_cents integer, base_leaf_price integer, current_leaf_price integer, pricing_source text)","source":"c168f8531fe2b71e0c46a9a8ab4f6ef9","strict":false,"language":"plpgsql","parallel":"u","arguments":"p_tea_product_id text, p_event_id text","leakproof":false,"volatility":"v","security_definer":true},"after":{"cost":100,"kind":"f","rows":1000,"config":["search_path=\"\""],"result":"TABLE(card_id uuid, tasting_count integer, card_tier text, listing_eligible boolean, shielded boolean, price_per_kilo_cents integer, base_leaf_price integer, current_leaf_price integer, pricing_source text)","source":"51791da1f2bf9e7315e0852f84a64a5c","strict":false,"language":"plpgsql","parallel":"u","arguments":"p_tea_product_id text, p_event_id text","leakproof":false,"volatility":"v","security_definer":true}},"get_merchant_market":{"signature":"public.get_merchant_market()","before":{"cost":100,"kind":"f","rows":1000,"config":["search_path=\"\""],"result":"TABLE(listing_id uuid, tea_name text, tea_category text, origin text, producer text, creator_display_name text, source_tier text, rarity text, pricing_source text, price_per_kilo_cents integer, leaf_price integer, like_count bigint, study_count bigint, helpful_percentage integer, preview jsonb, source_tastings integer, tea_available boolean, published_at timestamp with time zone)","source":"ccf5097c1fda7c441a635f88a3c4a1b1","strict":false,"language":"sql","parallel":"u","arguments":"","leakproof":false,"volatility":"s","security_definer":true},"after":{"cost":100,"kind":"f","rows":1000,"config":["search_path=\"\""],"result":"TABLE(listing_id uuid, tea_name text, tea_category text, origin text, producer text, creator_display_name text, source_tier text, rarity text, pricing_source text, price_per_kilo_cents integer, leaf_price integer, like_count bigint, study_count bigint, helpful_percentage integer, preview jsonb, source_tastings integer, tea_available boolean, published_at timestamp with time zone)","source":"51791da1f2bf9e7315e0852f84a64a5c","strict":false,"language":"plpgsql","parallel":"u","arguments":"","leakproof":false,"volatility":"s","security_definer":true}},"get_my_merchant_cards":{"signature":"public.get_my_merchant_cards()","before":{"cost":100,"kind":"f","rows":1000,"config":["search_path=\"\""],"result":"TABLE(card_id uuid, tea_name text, tea_category text, origin text, producer text, card_tier text, tasting_count integer, listing_eligible boolean, pricing_source text, price_per_kilo_cents integer, leaf_price integer, listing_id uuid, listing_status text, study_count bigint, leaves_earned bigint, preview jsonb)","source":"af5fbefd7285a81694c2cdb17109de73","strict":false,"language":"plpgsql","parallel":"u","arguments":"","leakproof":false,"volatility":"v","security_definer":true},"after":{"cost":100,"kind":"f","rows":1000,"config":["search_path=\"\""],"result":"TABLE(card_id uuid, tea_name text, tea_category text, origin text, producer text, card_tier text, tasting_count integer, listing_eligible boolean, pricing_source text, price_per_kilo_cents integer, leaf_price integer, listing_id uuid, listing_status text, study_count bigint, leaves_earned bigint, preview jsonb)","source":"51791da1f2bf9e7315e0852f84a64a5c","strict":false,"language":"plpgsql","parallel":"u","arguments":"","leakproof":false,"volatility":"v","security_definer":true}},"publish_merchant_listing":{"signature":"public.publish_merchant_listing(uuid)","before":{"cost":100,"kind":"f","rows":0,"config":["search_path=\"\""],"result":"uuid","source":"dd09cb53f151d07053d42ca96259b1e6","strict":false,"language":"plpgsql","parallel":"u","arguments":"p_card_id uuid","leakproof":false,"volatility":"v","security_definer":true},"after":{"cost":100,"kind":"f","rows":0,"config":["search_path=\"\""],"result":"uuid","source":"51791da1f2bf9e7315e0852f84a64a5c","strict":false,"language":"plpgsql","parallel":"u","arguments":"p_card_id uuid","leakproof":false,"volatility":"v","security_definer":true}},"purchase_study_copy":{"signature":"public.purchase_study_copy(uuid)","before":{"cost":100,"kind":"f","rows":1000,"config":["search_path=\"\""],"result":"TABLE(transaction_id uuid, study_copy_id uuid, remaining_balance bigint)","source":"816866538412f9e0204b4151f68d1286","strict":false,"language":"plpgsql","parallel":"u","arguments":"p_listing_id uuid","leakproof":false,"volatility":"v","security_definer":true},"after":{"cost":100,"kind":"f","rows":1000,"config":["search_path=\"\""],"result":"TABLE(transaction_id uuid, study_copy_id uuid, remaining_balance bigint)","source":"51791da1f2bf9e7315e0852f84a64a5c","strict":false,"language":"plpgsql","parallel":"u","arguments":"p_listing_id uuid","leakproof":false,"volatility":"v","security_definer":true}},"record_verified_tasting":{"signature":"public.record_verified_tasting(text, text, text, text, text, text, jsonb, jsonb)","before":{"cost":100,"kind":"f","rows":1000,"config":["search_path=\"\""],"result":"TABLE(card_id uuid, tasting_count integer, card_tier text, listing_eligible boolean, shielded boolean, price_per_kilo_cents integer, base_leaf_price integer, current_leaf_price integer, pricing_source text)","source":"0245aaa505c860ad20c48afa7c3ccf8b","strict":false,"language":"plpgsql","parallel":"u","arguments":"p_tea_product_id text, p_tea_category text, p_origin text, p_producer text, p_rarity text, p_verification_key text, p_card_preview jsonb DEFAULT '{}'::jsonb, p_card_content jsonb DEFAULT '{}'::jsonb","leakproof":false,"volatility":"v","security_definer":true},"after":{"cost":100,"kind":"f","rows":1000,"config":["search_path=\"\""],"result":"TABLE(card_id uuid, tasting_count integer, card_tier text, listing_eligible boolean, shielded boolean, price_per_kilo_cents integer, base_leaf_price integer, current_leaf_price integer, pricing_source text)","source":"51791da1f2bf9e7315e0852f84a64a5c","strict":false,"language":"plpgsql","parallel":"u","arguments":"p_tea_product_id text, p_tea_category text, p_origin text, p_producer text, p_rarity text, p_verification_key text, p_card_preview jsonb DEFAULT '{}'::jsonb, p_card_content jsonb DEFAULT '{}'::jsonb","leakproof":false,"volatility":"v","security_definer":true}},"refresh_merchant_card_progress":{"signature":"public.refresh_merchant_card_progress(uuid)","before":{"cost":100,"kind":"f","rows":0,"config":["search_path=\"\""],"result":"void","source":"8f58f42910cd146e394e12dc0d57c8b3","strict":false,"language":"plpgsql","parallel":"u","arguments":"p_owner_user_id uuid","leakproof":false,"volatility":"v","security_definer":true},"after":{"cost":100,"kind":"f","rows":0,"config":["search_path=\"\""],"result":"void","source":"51791da1f2bf9e7315e0852f84a64a5c","strict":false,"language":"plpgsql","parallel":"u","arguments":"p_owner_user_id uuid","leakproof":false,"volatility":"v","security_definer":true}},"refresh_my_merchant_cards":{"signature":"public.refresh_my_merchant_cards()","before":{"cost":100,"kind":"f","rows":0,"config":["search_path=\"\""],"result":"void","source":"973d0146c2aef3c1072bb53726d30273","strict":false,"language":"plpgsql","parallel":"u","arguments":"","leakproof":false,"volatility":"v","security_definer":true},"after":{"cost":100,"kind":"f","rows":0,"config":["search_path=\"\""],"result":"void","source":"51791da1f2bf9e7315e0852f84a64a5c","strict":false,"language":"plpgsql","parallel":"u","arguments":"","leakproof":false,"volatility":"v","security_definer":true}},"set_marketplace_reaction":{"signature":"public.set_marketplace_reaction(uuid, text, boolean)","before":{"cost":100,"kind":"f","rows":0,"config":["search_path=\"\""],"result":"void","source":"be8cb8cca7c8c100565ca4580d8feed2","strict":false,"language":"plpgsql","parallel":"u","arguments":"p_listing_id uuid, p_reaction_type text, p_enabled boolean","leakproof":false,"volatility":"v","security_definer":true},"after":{"cost":100,"kind":"f","rows":0,"config":["search_path=\"\""],"result":"void","source":"51791da1f2bf9e7315e0852f84a64a5c","strict":false,"language":"plpgsql","parallel":"u","arguments":"p_listing_id uuid, p_reaction_type text, p_enabled boolean","leakproof":false,"volatility":"v","security_definer":true}},"set_merchant_listing_status":{"signature":"public.set_merchant_listing_status(uuid, text)","before":{"cost":100,"kind":"f","rows":0,"config":["search_path=\"\""],"result":"void","source":"c3fe4d1e00e374211e44ace7350000f5","strict":false,"language":"plpgsql","parallel":"u","arguments":"p_listing_id uuid, p_status text","leakproof":false,"volatility":"v","security_definer":true},"after":{"cost":100,"kind":"f","rows":0,"config":["search_path=\"\""],"result":"void","source":"51791da1f2bf9e7315e0852f84a64a5c","strict":false,"language":"plpgsql","parallel":"u","arguments":"p_listing_id uuid, p_status text","leakproof":false,"volatility":"v","security_definer":true}},"sync_merchant_progress_from_card":{"signature":"public.sync_merchant_progress_from_card()","before":{"cost":100,"kind":"f","rows":0,"config":["search_path=\"\""],"result":"trigger","source":"72a5ce76c96bcf57cdbc4c04def7819c","strict":false,"language":"plpgsql","parallel":"u","arguments":"","leakproof":false,"volatility":"v","security_definer":true},"after":{"cost":100,"kind":"f","rows":0,"config":["search_path=\"\""],"result":"trigger","source":"51791da1f2bf9e7315e0852f84a64a5c","strict":false,"language":"plpgsql","parallel":"u","arguments":"","leakproof":false,"volatility":"v","security_definer":true}},"sync_merchant_progress_from_catalog":{"signature":"public.sync_merchant_progress_from_catalog()","before":{"cost":100,"kind":"f","rows":0,"config":["search_path=\"\""],"result":"trigger","source":"b5e3c3d90e997bd5d53325a50ae78ca5","strict":false,"language":"plpgsql","parallel":"u","arguments":"","leakproof":false,"volatility":"v","security_definer":true},"after":{"cost":100,"kind":"f","rows":0,"config":["search_path=\"\""],"result":"trigger","source":"51791da1f2bf9e7315e0852f84a64a5c","strict":false,"language":"plpgsql","parallel":"u","arguments":"","leakproof":false,"volatility":"v","security_definer":true}},"sync_merchant_progress_from_live_stamp":{"signature":"public.sync_merchant_progress_from_live_stamp()","before":{"cost":100,"kind":"f","rows":0,"config":["search_path=\"\""],"result":"trigger","source":"4e3a9065e3815a7d1e1c5553a0ac0c10","strict":false,"language":"plpgsql","parallel":"u","arguments":"","leakproof":false,"volatility":"v","security_definer":true},"after":{"cost":100,"kind":"f","rows":0,"config":["search_path=\"\""],"result":"trigger","source":"51791da1f2bf9e7315e0852f84a64a5c","strict":false,"language":"plpgsql","parallel":"u","arguments":"","leakproof":false,"volatility":"v","security_definer":true}},"add_discovery_card_member":{"signature":"public.add_discovery_card_member()","before":{"cost":100,"kind":"f","rows":0,"config":["search_path=public"],"result":"trigger","source":"4e3cce54899599eff4bf0e96056ec1cb","strict":false,"language":"plpgsql","parallel":"u","arguments":"","leakproof":false,"volatility":"v","security_definer":true},"after":{"cost":100,"kind":"f","rows":0,"config":["search_path=public"],"result":"trigger","source":"51791da1f2bf9e7315e0852f84a64a5c","strict":false,"language":"plpgsql","parallel":"u","arguments":"","leakproof":false,"volatility":"v","security_definer":true}},"apply_discovery_presentation_command":{"signature":"public.apply_discovery_presentation_command(uuid, text, bigint, uuid, uuid, jsonb)","before":{"cost":100,"kind":"f","rows":0,"config":["search_path=public"],"result":"public.events","source":"bcae5839908e22f0fc7000fe2ef5e38a","strict":false,"language":"plpgsql","parallel":"u","arguments":"p_event_id uuid, p_command text, p_expected_sequence bigint, p_lease_token uuid, p_client_command_id uuid, p_payload jsonb DEFAULT '{}'::jsonb","leakproof":false,"volatility":"v","security_definer":true},"after":{"cost":100,"kind":"f","rows":0,"config":["search_path=public"],"result":"public.events","source":"51791da1f2bf9e7315e0852f84a64a5c","strict":false,"language":"plpgsql","parallel":"u","arguments":"p_event_id uuid, p_command text, p_expected_sequence bigint, p_lease_token uuid, p_client_command_id uuid, p_payload jsonb DEFAULT '{}'::jsonb","leakproof":false,"volatility":"v","security_definer":true}},"apply_live_tasting_reward_command":{"signature":"public.apply_live_tasting_reward_command(uuid, text, bigint, uuid, uuid, jsonb)","before":{"cost":100,"kind":"f","rows":0,"config":["search_path=public"],"result":"public.events","source":"ce5fdca0413e43f6c7a767ed6d53241c","strict":false,"language":"plpgsql","parallel":"u","arguments":"p_event_id uuid, p_command text, p_expected_sequence bigint, p_lease_token uuid, p_client_command_id uuid, p_payload jsonb DEFAULT '{}'::jsonb","leakproof":false,"volatility":"v","security_definer":true},"after":{"cost":100,"kind":"f","rows":0,"config":["search_path=public"],"result":"public.events","source":"51791da1f2bf9e7315e0852f84a64a5c","strict":false,"language":"plpgsql","parallel":"u","arguments":"p_event_id uuid, p_command text, p_expected_sequence bigint, p_lease_token uuid, p_client_command_id uuid, p_payload jsonb DEFAULT '{}'::jsonb","leakproof":false,"volatility":"v","security_definer":true}},"apply_living_tasting_map_command":{"signature":"public.apply_living_tasting_map_command(uuid, text, bigint, uuid, uuid, jsonb)","before":{"cost":100,"kind":"f","rows":0,"config":["search_path=public"],"result":"public.events","source":"4fade61e7b9b2f052984d81bc6a0c8b8","strict":false,"language":"plpgsql","parallel":"u","arguments":"p_event_id uuid, p_command text, p_expected_sequence bigint, p_lease_token uuid, p_client_command_id uuid, p_payload jsonb DEFAULT '{}'::jsonb","leakproof":false,"volatility":"v","security_definer":true},"after":{"cost":100,"kind":"f","rows":0,"config":["search_path=public"],"result":"public.events","source":"51791da1f2bf9e7315e0852f84a64a5c","strict":false,"language":"plpgsql","parallel":"u","arguments":"p_event_id uuid, p_command text, p_expected_sequence bigint, p_lease_token uuid, p_client_command_id uuid, p_payload jsonb DEFAULT '{}'::jsonb","leakproof":false,"volatility":"v","security_definer":true}},"authoritative_discovery_history":{"signature":"public.authoritative_discovery_history(uuid)","before":{"cost":100,"kind":"f","rows":1000,"config":["search_path=public, pg_temp"],"result":"TABLE(source_kind text, source_record_id uuid, source_event_id uuid, tea_key text, tea_name text, tea_type text, origin text, completed_at timestamp with time zone, descriptor_categories text[])","source":"7e5f18119de63226a2761c8f7507dad8","strict":false,"language":"sql","parallel":"u","arguments":"p_user_id uuid","leakproof":false,"volatility":"s","security_definer":true},"after":{"cost":100,"kind":"f","rows":1000,"config":["search_path=public, pg_temp"],"result":"TABLE(source_kind text, source_record_id uuid, source_event_id uuid, tea_key text, tea_name text, tea_type text, origin text, completed_at timestamp with time zone, descriptor_categories text[])","source":"51791da1f2bf9e7315e0852f84a64a5c","strict":false,"language":"plpgsql","parallel":"u","arguments":"p_user_id uuid","leakproof":false,"volatility":"s","security_definer":true}},"create_discovery_presentation":{"signature":"public.create_discovery_presentation()","before":{"cost":100,"kind":"f","rows":0,"config":["search_path=public"],"result":"trigger","source":"0167c5f6bddc8b97a57157e093a292ae","strict":false,"language":"plpgsql","parallel":"u","arguments":"","leakproof":false,"volatility":"v","security_definer":true},"after":{"cost":100,"kind":"f","rows":0,"config":["search_path=public"],"result":"trigger","source":"51791da1f2bf9e7315e0852f84a64a5c","strict":false,"language":"plpgsql","parallel":"u","arguments":"","leakproof":false,"volatility":"v","security_definer":true}},"create_room_discovery_card":{"signature":"public.create_room_discovery_card()","before":{"cost":100,"kind":"f","rows":0,"config":["search_path=public"],"result":"trigger","source":"115844e1dd811a033d1f375f71263895","strict":false,"language":"plpgsql","parallel":"u","arguments":"","leakproof":false,"volatility":"v","security_definer":true},"after":{"cost":100,"kind":"f","rows":0,"config":["search_path=public"],"result":"trigger","source":"51791da1f2bf9e7315e0852f84a64a5c","strict":false,"language":"plpgsql","parallel":"u","arguments":"","leakproof":false,"volatility":"v","security_definer":true}},"discovery_metrics_for_user":{"signature":"public.discovery_metrics_for_user(uuid)","before":{"cost":100,"kind":"f","rows":0,"config":["search_path=public, pg_temp"],"result":"jsonb","source":"b66feedbf2b087c755b5a4d7cbb3f9d9","strict":false,"language":"sql","parallel":"u","arguments":"p_user_id uuid","leakproof":false,"volatility":"s","security_definer":true},"after":{"cost":100,"kind":"f","rows":0,"config":["search_path=public, pg_temp"],"result":"jsonb","source":"51791da1f2bf9e7315e0852f84a64a5c","strict":false,"language":"plpgsql","parallel":"u","arguments":"p_user_id uuid","leakproof":false,"volatility":"s","security_definer":true}},"event_discovery_board":{"signature":"public.event_discovery_board(uuid)","before":{"cost":100,"kind":"f","rows":0,"config":["search_path=public"],"result":"jsonb","source":"3541c172b78f682f724f6969bd39a755","strict":false,"language":"plpgsql","parallel":"u","arguments":"p_event_id uuid","leakproof":false,"volatility":"v","security_definer":true},"after":{"cost":100,"kind":"f","rows":0,"config":["search_path=public"],"result":"jsonb","source":"51791da1f2bf9e7315e0852f84a64a5c","strict":false,"language":"plpgsql","parallel":"u","arguments":"p_event_id uuid","leakproof":false,"volatility":"v","security_definer":true}},"initialize_live_tasting_reward_settings":{"signature":"public.initialize_live_tasting_reward_settings()","before":{"cost":100,"kind":"f","rows":0,"config":["search_path=public"],"result":"trigger","source":"164e3f4536bab408c13355475f59c7a5","strict":false,"language":"plpgsql","parallel":"u","arguments":"","leakproof":false,"volatility":"v","security_definer":true},"after":{"cost":100,"kind":"f","rows":0,"config":["search_path=public"],"result":"trigger","source":"51791da1f2bf9e7315e0852f84a64a5c","strict":false,"language":"plpgsql","parallel":"u","arguments":"","leakproof":false,"volatility":"v","security_definer":true}},"lock_room_discovery_card":{"signature":"public.lock_room_discovery_card()","before":{"cost":100,"kind":"f","rows":0,"config":["search_path=public"],"result":"trigger","source":"979837b3e7de9492bd2e4d0400380769","strict":false,"language":"plpgsql","parallel":"u","arguments":"","leakproof":false,"volatility":"v","security_definer":true},"after":{"cost":100,"kind":"f","rows":0,"config":["search_path=public"],"result":"trigger","source":"51791da1f2bf9e7315e0852f84a64a5c","strict":false,"language":"plpgsql","parallel":"u","arguments":"","leakproof":false,"volatility":"v","security_definer":true}},"process_live_tasting_rewards":{"signature":"public.process_live_tasting_rewards(uuid)","before":{"cost":100,"kind":"f","rows":0,"config":["search_path=public"],"result":"jsonb","source":"12beabab73ea5cd4286528806986d09c","strict":false,"language":"plpgsql","parallel":"u","arguments":"p_event_id uuid DEFAULT NULL::uuid","leakproof":false,"volatility":"v","security_definer":true},"after":{"cost":100,"kind":"f","rows":0,"config":["search_path=public"],"result":"jsonb","source":"51791da1f2bf9e7315e0852f84a64a5c","strict":false,"language":"plpgsql","parallel":"u","arguments":"p_event_id uuid DEFAULT NULL::uuid","leakproof":false,"volatility":"v","security_definer":true}},"queue_live_tasting_completion_rewards":{"signature":"public.queue_live_tasting_completion_rewards(uuid)","before":{"cost":100,"kind":"f","rows":0,"config":["search_path=public"],"result":"jsonb","source":"4d80894e41983648af8f7c60486031c8","strict":false,"language":"plpgsql","parallel":"u","arguments":"p_event_id uuid","leakproof":false,"volatility":"v","security_definer":true},"after":{"cost":100,"kind":"f","rows":0,"config":["search_path=public"],"result":"jsonb","source":"51791da1f2bf9e7315e0852f84a64a5c","strict":false,"language":"plpgsql","parallel":"u","arguments":"p_event_id uuid","leakproof":false,"volatility":"v","security_definer":true}},"recalculate_discovery_identities":{"signature":"public.recalculate_discovery_identities(uuid, uuid)","before":{"cost":100,"kind":"f","rows":0,"config":["search_path=public, pg_temp"],"result":"jsonb","source":"f2ed2ded73754ff9deb75e18051f6f28","strict":false,"language":"plpgsql","parallel":"u","arguments":"p_user_id uuid, p_source_event_id uuid DEFAULT NULL::uuid","leakproof":false,"volatility":"v","security_definer":true},"after":{"cost":100,"kind":"f","rows":0,"config":["search_path=public, pg_temp"],"result":"jsonb","source":"51791da1f2bf9e7315e0852f84a64a5c","strict":false,"language":"plpgsql","parallel":"u","arguments":"p_user_id uuid, p_source_event_id uuid DEFAULT NULL::uuid","leakproof":false,"volatility":"v","security_definer":true}},"set_my_discovery_identity_preferences":{"signature":"public.set_my_discovery_identity_preferences(uuid, boolean, boolean)","before":{"cost":100,"kind":"f","rows":0,"config":["search_path=public, pg_temp"],"result":"public.user_discovery_identities","source":"085143b315fef91c57cbefa47ae0813f","strict":false,"language":"plpgsql","parallel":"u","arguments":"p_identity_id uuid, p_featured boolean, p_hidden boolean","leakproof":false,"volatility":"v","security_definer":true},"after":{"cost":100,"kind":"f","rows":0,"config":["search_path=public, pg_temp"],"result":"public.user_discovery_identities","source":"51791da1f2bf9e7315e0852f84a64a5c","strict":false,"language":"plpgsql","parallel":"u","arguments":"p_identity_id uuid, p_featured boolean, p_hidden boolean","leakproof":false,"volatility":"v","security_definer":true}},"set_my_discovery_reveal_preference":{"signature":"public.set_my_discovery_reveal_preference(boolean)","before":{"cost":100,"kind":"f","rows":0,"config":["search_path=public, pg_temp"],"result":"public.user_discovery_profiles","source":"b10f157f2a4aa48d8ba6440396d278cb","strict":false,"language":"plpgsql","parallel":"u","arguments":"p_enabled boolean","leakproof":false,"volatility":"v","security_definer":true},"after":{"cost":100,"kind":"f","rows":0,"config":["search_path=public, pg_temp"],"result":"public.user_discovery_profiles","source":"51791da1f2bf9e7315e0852f84a64a5c","strict":false,"language":"plpgsql","parallel":"u","arguments":"p_enabled boolean","leakproof":false,"volatility":"v","security_definer":true}},"apply_event_command":{"signature":"public.apply_event_command(uuid, text, bigint, uuid)","before":{"cost":100,"kind":"f","rows":0,"config":["search_path=public"],"result":"public.events","source":"d09089cc8995a4fd0f7244aac118d7b5","strict":false,"language":"plpgsql","parallel":"u","arguments":"p_event_id uuid, p_command text, p_expected_sequence bigint, p_lease_token uuid","leakproof":false,"volatility":"v","security_definer":true},"after":{"cost":100,"kind":"f","rows":0,"config":["search_path=public"],"result":"public.events","source":"c64e5ddf191d74abae8f65c1df543940","strict":false,"language":"plpgsql","parallel":"u","arguments":"p_event_id uuid, p_command text, p_expected_sequence bigint, p_lease_token uuid","leakproof":false,"volatility":"v","security_definer":true}},"event_readiness":{"signature":"public.event_readiness(uuid)","before":{"cost":100,"kind":"f","rows":1000,"config":["search_path=public"],"result":"TABLE(key text, met boolean, message text)","source":"87c52b6a97baf445eabcd2fb7b0bcdba","strict":false,"language":"sql","parallel":"u","arguments":"p_event_id uuid","leakproof":false,"volatility":"s","security_definer":true},"after":{"cost":100,"kind":"f","rows":1000,"config":["search_path=public"],"result":"TABLE(key text, met boolean, message text)","source":"fc03ffb23cb4fc8e2d95e8d7c56ca12b","strict":false,"language":"sql","parallel":"u","arguments":"p_event_id uuid","leakproof":false,"volatility":"s","security_definer":true}},"save_event_bundle":{"signature":"public.save_event_bundle(jsonb, jsonb)","before":{"cost":100,"kind":"f","rows":0,"config":["search_path=public, extensions"],"result":"uuid","source":"e9091b7c187ca765965b3adcc482257c","strict":false,"language":"plpgsql","parallel":"u","arguments":"p_event jsonb, p_flight jsonb","leakproof":false,"volatility":"v","security_definer":true},"after":{"cost":100,"kind":"f","rows":0,"config":["search_path=public, extensions"],"result":"uuid","source":"2369b7cc6e974931756a28ddc1e34e82","strict":false,"language":"plpgsql","parallel":"u","arguments":"p_event jsonb, p_flight jsonb","leakproof":false,"volatility":"v","security_definer":true}}},"triggers":{"breakout_members_add_discovery_member":{"table":"event_breakout_members","definition":"CREATE TRIGGER breakout_members_add_discovery_member AFTER INSERT ON public.event_breakout_members FOR EACH ROW EXECUTE FUNCTION public.add_discovery_card_member()","ddl":"CREATE TRIGGER breakout_members_add_discovery_member AFTER INSERT ON public.event_breakout_members FOR EACH ROW EXECUTE FUNCTION public.add_discovery_card_member();"},"breakout_rooms_create_discovery_card":{"table":"event_breakout_rooms","definition":"CREATE TRIGGER breakout_rooms_create_discovery_card AFTER INSERT ON public.event_breakout_rooms FOR EACH ROW EXECUTE FUNCTION public.create_room_discovery_card()","ddl":"CREATE TRIGGER breakout_rooms_create_discovery_card AFTER INSERT ON public.event_breakout_rooms FOR EACH ROW EXECUTE FUNCTION public.create_room_discovery_card();"},"breakout_rooms_lock_discovery_card":{"table":"event_breakout_rooms","definition":"CREATE TRIGGER breakout_rooms_lock_discovery_card AFTER UPDATE OF status ON public.event_breakout_rooms FOR EACH ROW EXECUTE FUNCTION public.lock_room_discovery_card()","ddl":"CREATE TRIGGER breakout_rooms_lock_discovery_card AFTER UPDATE OF status ON public.event_breakout_rooms FOR EACH ROW EXECUTE FUNCTION public.lock_room_discovery_card();"},"breakout_sessions_create_discovery_presentation":{"table":"event_breakout_sessions","definition":"CREATE TRIGGER breakout_sessions_create_discovery_presentation AFTER INSERT ON public.event_breakout_sessions FOR EACH ROW EXECUTE FUNCTION public.create_discovery_presentation()","ddl":"CREATE TRIGGER breakout_sessions_create_discovery_presentation AFTER INSERT ON public.event_breakout_sessions FOR EACH ROW EXECUTE FUNCTION public.create_discovery_presentation();"},"events_initialize_live_rewards":{"table":"events","definition":"CREATE TRIGGER events_initialize_live_rewards AFTER INSERT ON public.events FOR EACH ROW EXECUTE FUNCTION public.initialize_live_tasting_reward_settings()","ddl":"CREATE TRIGGER events_initialize_live_rewards AFTER INSERT ON public.events FOR EACH ROW EXECUTE FUNCTION public.initialize_live_tasting_reward_settings();"},"tea_catalog_prices_resolve_tea":{"table":"tea_catalog_prices","definition":"CREATE TRIGGER tea_catalog_prices_resolve_tea BEFORE INSERT OR UPDATE OF product_name, canonical_tea_id, price_per_kilo_cents, is_active ON public.tea_catalog_prices FOR EACH ROW EXECUTE FUNCTION public.resolve_merchant_catalog_tea()","ddl":"CREATE TRIGGER tea_catalog_prices_resolve_tea BEFORE INSERT OR UPDATE OF product_name, canonical_tea_id, price_per_kilo_cents, is_active ON public.tea_catalog_prices FOR EACH ROW EXECUTE FUNCTION public.resolve_merchant_catalog_tea();"},"tea_catalog_prices_sync_merchant_progress":{"table":"tea_catalog_prices","definition":"CREATE TRIGGER tea_catalog_prices_sync_merchant_progress AFTER INSERT OR UPDATE OF product_name, canonical_tea_id, price_per_kilo_cents, is_active ON public.tea_catalog_prices FOR EACH ROW EXECUTE FUNCTION public.sync_merchant_progress_from_catalog()","ddl":"CREATE TRIGGER tea_catalog_prices_sync_merchant_progress AFTER INSERT OR UPDATE OF product_name, canonical_tea_id, price_per_kilo_cents, is_active ON public.tea_catalog_prices FOR EACH ROW EXECUTE FUNCTION public.sync_merchant_progress_from_catalog();"}},"tables":["merchant_card_progress","merchant_tasting_verifications","merchant_listings","merchant_study_copies","merchant_transactions","merchant_reactions","tea_catalog_prices","trivia_questions","trivia_answers","discovery_identity_definitions","discovery_identity_recalculations","user_discovery_identities","user_discovery_profiles","room_discovery_cards","room_discovery_card_items","event_discovery_presentations","living_tasting_map_sessions","living_tasting_map_observation_events","living_tasting_map_snapshots","living_tasting_map_fingerprints","living_tasting_map_moderation_actions","live_tasting_reward_policies","event_live_reward_settings","event_live_reward_completion_overrides","event_live_reward_awards"],"columns":{"merchant_card_progress":[["id","uuid",true,""],["owner_user_id","uuid",true,""],["tea_identity_key","text",true,""],["source_card_id","uuid",true,""],["canonical_tea_id","uuid",false,""],["product_id","text",false,""],["tea_name","text",true,""],["tea_category","text",true,""],["origin","text",true,""],["producer","text",true,""],["card_tier","text",true,""],["tasting_count","integer",true,""],["listing_eligible","boolean",true,""],["live_tasting_verified","boolean",true,""],["pricing_source","text",true,""],["price_per_kilo_cents","integer",false,""],["base_leaf_price","integer",true,""],["current_leaf_price","integer",true,""],["rarity","text",true,""],["preview","jsonb",true,""],["card_snapshot","jsonb",true,""],["created_at","timestamp with time zone",true,""],["updated_at","timestamp with time zone",true,""]],"merchant_tasting_verifications":[["id","uuid",true,""],["owner_user_id","uuid",true,""],["verification_key","text",true,""],["card_id","uuid",true,""],["tea_identity_key","text",true,""],["created_at","timestamp with time zone",true,""]],"merchant_listings":[["id","uuid",true,""],["source_card_id","uuid",true,""],["creator_id","uuid",true,""],["tea_identity_key","text",true,""],["canonical_tea_id","uuid",false,""],["product_id","text",false,""],["tea_name","text",true,""],["tea_category","text",true,""],["origin","text",true,""],["producer","text",true,""],["creator_display_name","text",true,""],["source_tier","text",true,""],["rarity","text",true,""],["pricing_source","text",true,""],["price_per_kilo_cents","integer",false,""],["calculated_leaf_price","integer",true,""],["status","text",true,""],["source_tastings","integer",true,""],["tea_available","boolean",true,""],["preview","jsonb",true,""],["card_snapshot","jsonb",true,""],["view_count","bigint",true,""],["like_count","bigint",true,""],["study_count","bigint",true,""],["helpful_count","bigint",true,""],["helpful_response_count","bigint",true,""],["published_at","timestamp with time zone",true,""],["updated_at","timestamp with time zone",true,""]],"merchant_study_copies":[["id","uuid",true,""],["buyer_id","uuid",true,""],["source_listing_id","uuid",true,""],["source_card_id","uuid",true,""],["source_card_snapshot","jsonb",true,""],["source_provenance","jsonb",true,""],["leaf_price_paid","integer",true,""],["acquired_at","timestamp with time zone",true,""]],"merchant_transactions":[["id","uuid",true,""],["buyer_id","uuid",true,""],["creator_id","uuid",true,""],["listing_id","uuid",true,""],["study_copy_id","uuid",true,""],["leaves_debited","integer",true,""],["leaves_credited","integer",true,""],["status","text",true,""],["created_at","timestamp with time zone",true,""]],"merchant_reactions":[["id","uuid",true,""],["owner_user_id","uuid",true,""],["listing_id","uuid",true,""],["reaction_type","text",true,""],["created_at","timestamp with time zone",true,""]],"tea_catalog_prices":[["product_id","text",true,""],["canonical_tea_id","uuid",false,""],["product_name","text",true,""],["product_slug","text",true,""],["product_url","text",true,""],["currency","text",true,""],["price_per_kilo_cents","integer",true,""],["representative_package_price_cents","integer",false,""],["price_source","text",true,""],["price_strategy","text",true,""],["is_active","boolean",true,""],["source_updated_at","timestamp with time zone",false,""],["synced_at","timestamp with time zone",true,""]],"trivia_questions":[["id","uuid",true,""],["event_flight_item_id","uuid",true,""],["question","text",true,""],["options","jsonb",true,""],["correct_index","integer",true,""],["explanation","text",false,""],["answer_window_seconds","integer",true,""],["created_at","timestamp with time zone",true,""],["updated_at","timestamp with time zone",true,""],["position","integer",true,""]],"trivia_answers":[["id","uuid",true,""],["participant_id","uuid",true,""],["trivia_question_id","uuid",true,""],["selected_index","integer",true,""],["is_correct","boolean",true,""],["answered_at","timestamp with time zone",true,""],["idempotency_key","uuid",true,""],["original_answered_at","timestamp with time zone",true,""],["on_time","boolean",true,""]],"discovery_identity_definitions":[["id","uuid",true,""],["slug","text",true,""],["name","text",true,""],["description","text",true,""],["emblem","text",true,""],["criteria_version","integer",true,""],["criteria","jsonb",true,""],["source_metrics_version","text",true,""],["sort_order","integer",true,""],["surprise","boolean",true,""],["active","boolean",true,""],["retired_at","timestamp with time zone",false,""],["created_at","timestamp with time zone",true,""],["updated_at","timestamp with time zone",true,""]],"discovery_identity_recalculations":[["id","uuid",true,""],["user_id","uuid",true,""],["source_event_id","uuid",false,""],["source_metrics_version","text",true,""],["idempotency_key","text",true,""],["metrics","jsonb",true,""],["newly_earned_identity_ids","uuid[]",true,""],["recalculated_at","timestamp with time zone",true,""]],"user_discovery_identities":[["id","uuid",true,""],["user_id","uuid",true,""],["identity_definition_id","uuid",true,""],["criteria_version","integer",true,""],["source_metrics_version","text",true,""],["earned_at","timestamp with time zone",true,""],["earned_event_id","uuid",false,""],["evidence_summary","text",true,""],["evidence","jsonb",true,""],["is_featured","boolean",true,""],["visibility","text",true,""],["hidden_at","timestamp with time zone",false,""],["last_confirmed_at","timestamp with time zone",true,""],["last_evaluated_at","timestamp with time zone",true,""],["created_at","timestamp with time zone",true,""],["updated_at","timestamp with time zone",true,""]],"user_discovery_profiles":[["user_id","uuid",true,""],["identity_reveals_enabled","boolean",true,""],["social_profile_enabled","boolean",true,""],["created_at","timestamp with time zone",true,""],["updated_at","timestamp with time zone",true,""]],"room_discovery_cards":[["id","uuid",true,""],["breakout_room_id","uuid",true,""],["session_id","uuid",true,""],["event_id","uuid",true,""],["event_flight_item_id","uuid",true,""],["participant_ids","uuid[]",true,""],["curiosity","text",false,""],["room_quote","text",false,""],["room_quote_attributed","boolean",true,""],["room_quote_participant_id","uuid",false,""],["spokesperson_participant_id","uuid",false,""],["spokesperson_state","text",true,""],["source_version","bigint",true,""],["locked_at","timestamp with time zone",false,""],["created_at","timestamp with time zone",true,""],["updated_at","timestamp with time zone",true,""]],"room_discovery_card_items":[["id","uuid",true,""],["card_id","uuid",true,""],["category","text",true,""],["item_text","text",true,""],["normalized_key","text",true,""],["source","text",true,""],["prevalence_count","integer",false,""],["prevalence_total","integer",true,""],["attribution_participant_id","uuid",false,""],["created_by","uuid",false,""],["removed_by","uuid",false,""],["removed_at","timestamp with time zone",false,""],["created_at","timestamp with time zone",true,""],["updated_at","timestamp with time zone",true,""]],"event_discovery_presentations":[["breakout_session_id","uuid",true,""],["event_id","uuid",true,""],["open_card_ids","uuid[]",true,""],["surfaced_curiosity_card_id","uuid",false,""],["updated_by","uuid",false,""],["updated_at","timestamp with time zone",true,""]],"living_tasting_map_sessions":[["id","uuid",true,""],["event_id","uuid",true,""],["event_flight_item_id","uuid",true,""],["status","text",true,""],["duration_seconds","integer",true,""],["visibility_mode","text",true,""],["custom_notes_enabled","boolean",true,""],["started_at","timestamp with time zone",false,""],["paused_at","timestamp with time zone",false,""],["accumulated_pause_ms","bigint",true,""],["frozen_at","timestamp with time zone",false,""],["replay_started_at","timestamp with time zone",false,""],["replay_paused_at","timestamp with time zone",false,""],["replay_position_ms","integer",true,""],["replay_duration_seconds","integer",true,""],["version","bigint",true,""],["created_by","uuid",false,""],["created_at","timestamp with time zone",true,""],["updated_at","timestamp with time zone",true,""]],"living_tasting_map_observation_events":[["id","uuid",true,""],["session_id","uuid",true,""],["event_id","uuid",true,""],["event_flight_item_id","uuid",true,""],["participant_id","uuid",true,""],["layer","text",true,""],["flavor_key","text",true,""],["flavor_label","text",true,""],["family","text",true,""],["is_custom","boolean",true,""],["intensity","integer",true,""],["action","text",true,""],["elapsed_ms","integer",true,""],["client_sequence","integer",true,""],["client_id","uuid",true,""],["server_time","timestamp with time zone",true,""]],"living_tasting_map_snapshots":[["id","bigint",true,""],["session_id","uuid",true,""],["event_id","uuid",true,""],["event_flight_item_id","uuid",true,""],["captured_at","timestamp with time zone",true,""],["elapsed_ms","integer",true,""],["aggregate_payload","jsonb",true,""],["source_event_count","integer",true,""],["is_prompt_marker","boolean",true,""],["projector_version","integer",true,""]],"living_tasting_map_fingerprints":[["id","uuid",true,""],["session_id","uuid",true,""],["event_id","uuid",true,""],["event_flight_item_id","uuid",true,""],["final_snapshot","jsonb",true,""],["replay_manifest","jsonb",true,""],["generated_patterns","jsonb",true,""],["version","integer",true,""],["committed_at","timestamp with time zone",false,""],["created_at","timestamp with time zone",true,""],["updated_at","timestamp with time zone",true,""]],"living_tasting_map_moderation_actions":[["id","bigint",true,""],["session_id","uuid",true,""],["event_id","uuid",true,""],["flavor_key","text",true,""],["action","text",true,""],["reason","text",false,""],["actor_user_id","uuid",true,""],["created_at","timestamp with time zone",true,""]],"live_tasting_reward_policies":[["id","uuid",true,""],["rule_version","text",true,""],["active","boolean",true,""],["event_completion_leaves","integer",true,""],["max_leaves_per_participant_event","integer",true,""],["minimum_presence_seconds","integer",true,""],["created_at","timestamp with time zone",true,""],["updated_at","timestamp with time zone",true,""]],"event_live_reward_settings":[["event_id","uuid",true,""],["policy_id","uuid",true,""],["reward_mode_enabled","boolean",true,""],["created_at","timestamp with time zone",true,""],["updated_at","timestamp with time zone",true,""]],"event_live_reward_completion_overrides":[["event_id","uuid",true,""],["participant_id","uuid",true,""],["granted_by","uuid",true,""],["created_at","timestamp with time zone",true,""]],"event_live_reward_awards":[["id","uuid",true,""],["event_id","uuid",true,""],["participant_id","uuid",false,""],["user_id","uuid",true,""],["reward_type","text",true,""],["amount","integer",true,""],["rule_version","text",true,""],["idempotency_key","text",true,""],["status","text",true,""],["canonical_entry_id","uuid",false,""],["attempts","integer",true,""],["next_retry_at","timestamp with time zone",true,""],["last_error_code","text",false,""],["awarded_at","timestamp with time zone",false,""],["created_at","timestamp with time zone",true,""],["updated_at","timestamp with time zone",true,""]]},"helper":{"cost":100,"kind":"f","rows":0,"config":["search_path=pg_catalog"],"result":"trigger","source":"278ea9be78a3712edd13940167ff93be","strict":false,"language":"plpgsql","parallel":"u","arguments":"","leakproof":false,"volatility":"v","security_definer":false}}$manifest$::jsonb;
  item record; actual jsonb; status integer; original_count integer:=0; retired_count integer:=0;
  trigger_count integer:=0; blocker_count integer:=0; expected_count integer;
  is_retired boolean; found_oid oid; helper_oid oid;
begin
  if current_setting('server_version_num')::int/10000<>17 then raise exception 'retirement_requires_postgres17'; end if;
  -- Item 2 is a deployment prerequisite, including renamed copies of its hooks.
  if exists(select 1 from pg_trigger t where not t.tgisinternal and t.tgfoid in
    (to_regprocedure('public.sync_merchant_progress_from_card()'),to_regprocedure('public.sync_merchant_progress_from_live_stamp()')))
  then raise exception 'retirement_requires_record_only_hooks'; end if;
  for item in select key,value from jsonb_each(manifest->'functions') loop
    select jsonb_build_object('source',md5(p.prosrc),'arguments',pg_get_function_arguments(p.oid),'result',pg_get_function_result(p.oid),'language',l.lanname,'security_definer',p.prosecdef,'strict',p.proisstrict,'volatility',p.provolatile,'parallel',p.proparallel,'leakproof',p.proleakproof,'kind',p.prokind,'config',p.proconfig,'cost',p.procost,'rows',p.prorows) into actual from pg_proc p join pg_language l on l.oid=p.prolang where p.oid=to_regprocedure(item.value->>'signature');
    if actual is not distinct from item.value->'before' then original_count:=original_count+1;
    elsif actual is not distinct from item.value->'after' then retired_count:=retired_count+1;
    else raise exception 'retirement_function_drift: %', item.key; end if;
  end loop;
  if original_count>0 and retired_count>0 then raise exception 'retirement_partial_state'; end if;
  is_retired:=retired_count>0;
  for item in select key,value from jsonb_each(manifest->'columns') loop
    select jsonb_agg(jsonb_build_array(attname,format_type(atttypid,atttypmod),attnotnull,attgenerated) order by attnum)
      into actual from pg_attribute where attrelid=to_regclass('public.'||item.key) and attnum>0 and not attisdropped;
    if actual is distinct from item.value then raise exception 'retirement_table_drift: %',item.key; end if;
  end loop;
  for item in select key,value from jsonb_each(manifest->'triggers') loop
    select t.oid into found_oid from pg_trigger t where t.tgrelid=to_regclass('public.'||(item.value->>'table')) and t.tgname=item.key and not t.tgisinternal;
    if found_oid is not null then
      trigger_count:=trigger_count+1;
      if (select pg_get_triggerdef(found_oid,false)) is distinct from item.value->>'definition'
        or (select tgenabled from pg_trigger where oid=found_oid)<>'O'
      then raise exception 'retirement_trigger_drift: %',item.key; end if;
    end if;
  end loop;
  if exists(select 1 from pg_trigger t join pg_proc p on p.oid=t.tgfoid
    where not t.tgisinternal and p.pronamespace='public'::regnamespace
    and p.proname in ('sync_merchant_progress_from_card','sync_merchant_progress_from_catalog','sync_merchant_progress_from_live_stamp','add_discovery_card_member','create_discovery_presentation','create_room_discovery_card','initialize_live_tasting_reward_settings','lock_room_discovery_card')
    and not exists(select 1 from jsonb_each(manifest->'triggers') x where x.key=t.tgname and to_regclass('public.'||(x.value->>'table'))=t.tgrelid))
  then raise exception 'retirement_unexpected_attachment'; end if;
  helper_oid:=to_regprocedure('public.vf_guard_retired_feature_write()');
  if helper_oid is not null then
    select jsonb_build_object('source',md5(p.prosrc),'arguments',pg_get_function_arguments(p.oid),'result',pg_get_function_result(p.oid),'language',l.lanname,'security_definer',p.prosecdef,'strict',p.proisstrict,'volatility',p.provolatile,'parallel',p.proparallel,'leakproof',p.proleakproof,'kind',p.prokind,'config',p.proconfig,'cost',p.procost,'rows',p.prorows) into actual from pg_proc p join pg_language l on l.oid=p.prolang where p.oid=helper_oid;
    if actual is distinct from manifest->'helper' then raise exception 'retirement_guard_drift'; end if;
    if exists(select 1 from pg_trigger t where t.tgfoid=helper_oid and (t.tgname<>'zz_vf_retired_write_guard' or not exists(select 1 from jsonb_array_elements_text(manifest->'tables') x where to_regclass('public.'||x)=t.tgrelid))) then raise exception 'retirement_unexpected_guard_attachment'; end if;
  end if;
  for item in select value #>> '{}' as name from jsonb_array_elements(manifest->'tables') loop
    select t.oid into found_oid from pg_trigger t where t.tgrelid=to_regclass('public.'||item.name) and t.tgname='zz_vf_retired_write_guard';
    if found_oid is not null then
      blocker_count:=blocker_count+1;
      if (select pg_get_triggerdef(found_oid,false))<>format('CREATE TRIGGER zz_vf_retired_write_guard BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.vf_guard_retired_feature_write()',item.name)
        or (select tgenabled from pg_trigger where oid=found_oid)<>'O'
      then raise exception 'retirement_guard_attachment_drift: %',item.name; end if;
    end if;
  end loop;
  if (is_retired and (trigger_count<>0 or blocker_count<>jsonb_array_length(manifest->'tables') or helper_oid is null))
    or (not is_retired and (trigger_count<>7 or blocker_count<>0 or helper_oid is not null))
  then raise exception 'retirement_partial_state'; end if;
  for item in select key,value from jsonb_each(manifest->'protected') loop
    select jsonb_build_object('source',md5(p.prosrc),'arguments',pg_get_function_arguments(p.oid),'result',pg_get_function_result(p.oid),'language',l.lanname,'security_definer',p.prosecdef,'strict',p.proisstrict,'volatility',p.provolatile,'parallel',p.proparallel,'leakproof',p.proleakproof,'kind',p.prokind,'config',p.proconfig,'cost',p.procost,'rows',p.prorows) into actual from pg_proc p join pg_language l on l.oid=p.prolang where p.oid=to_regprocedure(item.key);
    if actual is distinct from item.value then raise exception 'retirement_protected_function_drift: %',item.key; end if;
  end loop;
  if not is_retired then
    EXECUTE $ddl$DROP TRIGGER breakout_members_add_discovery_member ON public.event_breakout_members;$ddl$;
    EXECUTE $ddl$DROP TRIGGER breakout_rooms_create_discovery_card ON public.event_breakout_rooms;$ddl$;
    EXECUTE $ddl$DROP TRIGGER breakout_rooms_lock_discovery_card ON public.event_breakout_rooms;$ddl$;
    EXECUTE $ddl$DROP TRIGGER breakout_sessions_create_discovery_presentation ON public.event_breakout_sessions;$ddl$;
    EXECUTE $ddl$DROP TRIGGER events_initialize_live_rewards ON public.events;$ddl$;
    EXECUTE $ddl$DROP TRIGGER tea_catalog_prices_resolve_tea ON public.tea_catalog_prices;$ddl$;
    EXECUTE $ddl$DROP TRIGGER tea_catalog_prices_sync_merchant_progress ON public.tea_catalog_prices;$ddl$;
    EXECUTE $ddl$CREATE OR REPLACE FUNCTION public.claim_live_tasting_shield(p_tea_product_id text, p_event_id text) RETURNS TABLE(card_id uuid, tasting_count integer, card_tier text, listing_eligible boolean, shielded boolean, price_per_kilo_cents integer, base_leaf_price integer, current_leaf_price integer, pricing_source text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  raise exception 'feature_retired' using errcode='55000', detail='Trading, progression and game rewards are retired. Personal tasting records and checkout loyalty remain available.';
end
$$;$ddl$;
    EXECUTE $ddl$CREATE OR REPLACE FUNCTION public.get_merchant_market() RETURNS TABLE(listing_id uuid, tea_name text, tea_category text, origin text, producer text, creator_display_name text, source_tier text, rarity text, pricing_source text, price_per_kilo_cents integer, leaf_price integer, like_count bigint, study_count bigint, helpful_percentage integer, preview jsonb, source_tastings integer, tea_available boolean, published_at timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  raise exception 'feature_retired' using errcode='55000', detail='Trading, progression and game rewards are retired. Personal tasting records and checkout loyalty remain available.';
end
$$;$ddl$;
    EXECUTE $ddl$CREATE OR REPLACE FUNCTION public.get_my_merchant_cards() RETURNS TABLE(card_id uuid, tea_name text, tea_category text, origin text, producer text, card_tier text, tasting_count integer, listing_eligible boolean, pricing_source text, price_per_kilo_cents integer, leaf_price integer, listing_id uuid, listing_status text, study_count bigint, leaves_earned bigint, preview jsonb)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  raise exception 'feature_retired' using errcode='55000', detail='Trading, progression and game rewards are retired. Personal tasting records and checkout loyalty remain available.';
end
$$;$ddl$;
    EXECUTE $ddl$CREATE OR REPLACE FUNCTION public.publish_merchant_listing(p_card_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  raise exception 'feature_retired' using errcode='55000', detail='Trading, progression and game rewards are retired. Personal tasting records and checkout loyalty remain available.';
end
$$;$ddl$;
    EXECUTE $ddl$CREATE OR REPLACE FUNCTION public.purchase_study_copy(p_listing_id uuid) RETURNS TABLE(transaction_id uuid, study_copy_id uuid, remaining_balance bigint)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  raise exception 'feature_retired' using errcode='55000', detail='Trading, progression and game rewards are retired. Personal tasting records and checkout loyalty remain available.';
end
$$;$ddl$;
    EXECUTE $ddl$CREATE OR REPLACE FUNCTION public.record_verified_tasting(p_tea_product_id text, p_tea_category text, p_origin text, p_producer text, p_rarity text, p_verification_key text, p_card_preview jsonb DEFAULT '{}'::jsonb, p_card_content jsonb DEFAULT '{}'::jsonb) RETURNS TABLE(card_id uuid, tasting_count integer, card_tier text, listing_eligible boolean, shielded boolean, price_per_kilo_cents integer, base_leaf_price integer, current_leaf_price integer, pricing_source text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  raise exception 'feature_retired' using errcode='55000', detail='Trading, progression and game rewards are retired. Personal tasting records and checkout loyalty remain available.';
end
$$;$ddl$;
    EXECUTE $ddl$CREATE OR REPLACE FUNCTION public.refresh_merchant_card_progress(p_owner_user_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  raise exception 'feature_retired' using errcode='55000', detail='Trading, progression and game rewards are retired. Personal tasting records and checkout loyalty remain available.';
end
$$;$ddl$;
    EXECUTE $ddl$CREATE OR REPLACE FUNCTION public.refresh_my_merchant_cards() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  raise exception 'feature_retired' using errcode='55000', detail='Trading, progression and game rewards are retired. Personal tasting records and checkout loyalty remain available.';
end
$$;$ddl$;
    EXECUTE $ddl$CREATE OR REPLACE FUNCTION public.set_marketplace_reaction(p_listing_id uuid, p_reaction_type text, p_enabled boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  raise exception 'feature_retired' using errcode='55000', detail='Trading, progression and game rewards are retired. Personal tasting records and checkout loyalty remain available.';
end
$$;$ddl$;
    EXECUTE $ddl$CREATE OR REPLACE FUNCTION public.set_merchant_listing_status(p_listing_id uuid, p_status text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  raise exception 'feature_retired' using errcode='55000', detail='Trading, progression and game rewards are retired. Personal tasting records and checkout loyalty remain available.';
end
$$;$ddl$;
    EXECUTE $ddl$CREATE OR REPLACE FUNCTION public.sync_merchant_progress_from_card() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  raise exception 'feature_retired' using errcode='55000', detail='Trading, progression and game rewards are retired. Personal tasting records and checkout loyalty remain available.';
end
$$;$ddl$;
    EXECUTE $ddl$CREATE OR REPLACE FUNCTION public.sync_merchant_progress_from_catalog() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  raise exception 'feature_retired' using errcode='55000', detail='Trading, progression and game rewards are retired. Personal tasting records and checkout loyalty remain available.';
end
$$;$ddl$;
    EXECUTE $ddl$CREATE OR REPLACE FUNCTION public.sync_merchant_progress_from_live_stamp() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  raise exception 'feature_retired' using errcode='55000', detail='Trading, progression and game rewards are retired. Personal tasting records and checkout loyalty remain available.';
end
$$;$ddl$;
    EXECUTE $ddl$CREATE OR REPLACE FUNCTION public.add_discovery_card_member() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  raise exception 'feature_retired' using errcode='55000', detail='Trading, progression and game rewards are retired. Personal tasting records and checkout loyalty remain available.';
end
$$;$ddl$;
    EXECUTE $ddl$CREATE OR REPLACE FUNCTION public.apply_discovery_presentation_command(p_event_id uuid, p_command text, p_expected_sequence bigint, p_lease_token uuid, p_client_command_id uuid, p_payload jsonb DEFAULT '{}'::jsonb) RETURNS public.events
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  raise exception 'feature_retired' using errcode='55000', detail='Trading, progression and game rewards are retired. Personal tasting records and checkout loyalty remain available.';
end
$$;$ddl$;
    EXECUTE $ddl$CREATE OR REPLACE FUNCTION public.apply_live_tasting_reward_command(p_event_id uuid, p_command text, p_expected_sequence bigint, p_lease_token uuid, p_client_command_id uuid, p_payload jsonb DEFAULT '{}'::jsonb) RETURNS public.events
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  raise exception 'feature_retired' using errcode='55000', detail='Trading, progression and game rewards are retired. Personal tasting records and checkout loyalty remain available.';
end
$$;$ddl$;
    EXECUTE $ddl$CREATE OR REPLACE FUNCTION public.apply_living_tasting_map_command(p_event_id uuid, p_command text, p_expected_sequence bigint, p_lease_token uuid, p_client_command_id uuid, p_payload jsonb DEFAULT '{}'::jsonb) RETURNS public.events
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  raise exception 'feature_retired' using errcode='55000', detail='Trading, progression and game rewards are retired. Personal tasting records and checkout loyalty remain available.';
end
$$;$ddl$;
    EXECUTE $ddl$CREATE OR REPLACE FUNCTION public.authoritative_discovery_history(p_user_id uuid) RETURNS TABLE(source_kind text, source_record_id uuid, source_event_id uuid, tea_key text, tea_name text, tea_type text, origin text, completed_at timestamp with time zone, descriptor_categories text[])
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  raise exception 'feature_retired' using errcode='55000', detail='Trading, progression and game rewards are retired. Personal tasting records and checkout loyalty remain available.';
end
$$;$ddl$;
    EXECUTE $ddl$CREATE OR REPLACE FUNCTION public.create_discovery_presentation() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  raise exception 'feature_retired' using errcode='55000', detail='Trading, progression and game rewards are retired. Personal tasting records and checkout loyalty remain available.';
end
$$;$ddl$;
    EXECUTE $ddl$CREATE OR REPLACE FUNCTION public.create_room_discovery_card() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  raise exception 'feature_retired' using errcode='55000', detail='Trading, progression and game rewards are retired. Personal tasting records and checkout loyalty remain available.';
end
$$;$ddl$;
    EXECUTE $ddl$CREATE OR REPLACE FUNCTION public.discovery_metrics_for_user(p_user_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  raise exception 'feature_retired' using errcode='55000', detail='Trading, progression and game rewards are retired. Personal tasting records and checkout loyalty remain available.';
end
$$;$ddl$;
    EXECUTE $ddl$CREATE OR REPLACE FUNCTION public.event_discovery_board(p_event_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  raise exception 'feature_retired' using errcode='55000', detail='Trading, progression and game rewards are retired. Personal tasting records and checkout loyalty remain available.';
end
$$;$ddl$;
    EXECUTE $ddl$CREATE OR REPLACE FUNCTION public.initialize_live_tasting_reward_settings() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  raise exception 'feature_retired' using errcode='55000', detail='Trading, progression and game rewards are retired. Personal tasting records and checkout loyalty remain available.';
end
$$;$ddl$;
    EXECUTE $ddl$CREATE OR REPLACE FUNCTION public.lock_room_discovery_card() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  raise exception 'feature_retired' using errcode='55000', detail='Trading, progression and game rewards are retired. Personal tasting records and checkout loyalty remain available.';
end
$$;$ddl$;
    EXECUTE $ddl$CREATE OR REPLACE FUNCTION public.process_live_tasting_rewards(p_event_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  raise exception 'feature_retired' using errcode='55000', detail='Trading, progression and game rewards are retired. Personal tasting records and checkout loyalty remain available.';
end
$$;$ddl$;
    EXECUTE $ddl$CREATE OR REPLACE FUNCTION public.queue_live_tasting_completion_rewards(p_event_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  raise exception 'feature_retired' using errcode='55000', detail='Trading, progression and game rewards are retired. Personal tasting records and checkout loyalty remain available.';
end
$$;$ddl$;
    EXECUTE $ddl$CREATE OR REPLACE FUNCTION public.recalculate_discovery_identities(p_user_id uuid, p_source_event_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  raise exception 'feature_retired' using errcode='55000', detail='Trading, progression and game rewards are retired. Personal tasting records and checkout loyalty remain available.';
end
$$;$ddl$;
    EXECUTE $ddl$CREATE OR REPLACE FUNCTION public.set_my_discovery_identity_preferences(p_identity_id uuid, p_featured boolean, p_hidden boolean) RETURNS public.user_discovery_identities
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  raise exception 'feature_retired' using errcode='55000', detail='Trading, progression and game rewards are retired. Personal tasting records and checkout loyalty remain available.';
end
$$;$ddl$;
    EXECUTE $ddl$CREATE OR REPLACE FUNCTION public.set_my_discovery_reveal_preference(p_enabled boolean) RETURNS public.user_discovery_profiles
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  raise exception 'feature_retired' using errcode='55000', detail='Trading, progression and game rewards are retired. Personal tasting records and checkout loyalty remain available.';
end
$$;$ddl$;
    EXECUTE $ddl$CREATE OR REPLACE FUNCTION public.apply_event_command(p_event_id uuid, p_command text, p_expected_sequence bigint, p_lease_token uuid) RETURNS public.events
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  e public.events;
  lease public.host_control_leases;
  current_item public.event_flight_items;
  next_item public.event_flight_items;
  current_question public.trivia_questions;
  next_question public.trivia_questions;
  target_phase public.session_phase;
  trivia_is_closed boolean;
begin
  select * into e from public.events where id=p_event_id for update;
  if e.id is null then raise exception 'event_not_found'; end if;
  if not public.can_manage_event(p_event_id, auth.uid()) then raise exception 'not_authorized'; end if;
  select * into lease from public.host_control_leases where event_id=p_event_id for update;
  if lease.holder_user_id <> auth.uid() or lease.lease_token <> p_lease_token or lease.expires_at <= now() then raise exception 'lease_lost'; end if;
  if e.sequence_number <> p_expected_sequence then raise exception 'stale_sequence'; end if;
  if e.phase='ended' then raise exception 'event_ended'; end if;
  if e.current_flight_item_id is not null then
    select * into current_item from public.event_flight_items where id=e.current_flight_item_id and event_id=p_event_id;
  end if;
  if e.current_trivia_question_id is not null then
    select * into current_question from public.trivia_questions
      where id=e.current_trivia_question_id and event_flight_item_id=e.current_flight_item_id;
  end if;
  trivia_is_closed := e.trivia_closes_at is not null and e.trivia_closes_at <= now();

  case p_command
    when 'open_session' then
      if e.phase <> 'lobby' or e.status <> 'scheduled' then raise exception 'illegal_phase'; end if;
      if exists(select 1 from public.event_readiness(p_event_id) where not met) then raise exception 'not_ready'; end if;
      select * into current_item from public.event_flight_items where event_id=p_event_id order by position limit 1;
      if current_item.id is null then raise exception 'flight_missing'; end if;
      update public.participants set status='admitted', joined_at=coalesce(joined_at,now()) where event_id=p_event_id and status in ('registered','waiting');
      target_phase='welcome';
      e.status='live';
      e.current_flight_item_id=current_item.id;
      e.current_trivia_question_id=null;
      e.tasting_opened_flight_item_id=null;
      e.reveal_at=null;

    when 'reveal_tea' then
      if not (
        e.phase='welcome'
        or (e.phase='tasting' and e.current_flight_item_id is distinct from e.tasting_opened_flight_item_id)
      ) then raise exception 'illegal_phase'; end if;
      if current_item.id is null then raise exception 'flight_missing'; end if;
      target_phase='reveal';
      e.current_trivia_question_id=null;
      e.reveal_at=now()+interval '1200 milliseconds';
      e.timer_started_at=null;
      e.timer_ends_at=null;
      e.trivia_opened_at=null;
      e.trivia_closes_at=null;

    when 'start_timer' then
      if e.phase not in ('reveal','brewing') then raise exception 'illegal_phase'; end if;
      if current_item.id is null then raise exception 'flight_missing'; end if;
      if e.phase='reveal' and (e.reveal_at is null or now() < e.reveal_at+interval '1400 milliseconds') then raise exception 'reveal_in_progress'; end if;
      target_phase='brewing';
      e.timer_started_at=now();
      e.timer_ends_at=now()+make_interval(secs=>current_item.steep_seconds);

    when 'open_tasting' then
      if e.phase not in ('reveal','brewing') then raise exception 'illegal_phase'; end if;
      if current_item.id is null then raise exception 'flight_missing'; end if;
      if e.phase='reveal' and (e.reveal_at is null or now() < e.reveal_at+interval '1400 milliseconds') then raise exception 'reveal_in_progress'; end if;
      target_phase='tasting';
      e.tasting_opened_flight_item_id=current_item.id;
      e.timer_started_at=null;
      e.timer_ends_at=null;

    when 'open_trivia' then
      raise exception 'feature_retired' using errcode='55000';

    when 'close_trivia' then
      raise exception 'feature_retired' using errcode='55000';

    when 'return_to_tasting' then
      if e.phase <> 'trivia' then raise exception 'illegal_phase'; end if;
      target_phase='tasting';

    when 'next_tea' then
      if e.tasting_opened_flight_item_id is distinct from e.current_flight_item_id then raise exception 'tasting_not_open'; end if;
      if e.phase not in ('tasting','trivia') then raise exception 'illegal_phase'; end if;
      select * into next_item from public.event_flight_items
        where event_id=p_event_id and position>current_item.position order by position limit 1;
      if next_item.id is null then raise exception 'last_tea'; end if;
      target_phase='tasting';
      e.current_flight_item_id=next_item.id;
      e.current_trivia_question_id=null;
      e.reveal_at=null;
      e.timer_started_at=null;
      e.timer_ends_at=null;
      e.trivia_opened_at=null;
      e.trivia_closes_at=null;

    when 'start_recap' then
      if e.tasting_opened_flight_item_id is distinct from e.current_flight_item_id then raise exception 'tasting_not_open'; end if;
      if e.phase not in ('tasting','trivia') then raise exception 'illegal_phase'; end if;
      if exists(select 1 from public.event_flight_items where event_id=p_event_id and position>current_item.position) then raise exception 'not_last_tea'; end if;
      target_phase='recap';

    when 'end_session' then
      if e.phase='lobby' then raise exception 'not_open'; end if;
      target_phase='ended';
      e.status='completed';
      e.completed_at=now();
      e.ends_at=coalesce(e.ends_at,now());
      update public.participants set delete_after=now()+interval '90 days' where event_id=p_event_id and user_id is null;
      update public.participant_tokens set expires_at=now()+interval '90 days' where participant_id in (select id from public.participants where event_id=p_event_id and user_id is null);

    else raise exception 'unknown_command';
  end case;

  e.phase=target_phase;
  e.sequence_number=e.sequence_number+1;
  e.updated_at=now();
  update public.events set
    status=e.status,
    phase=e.phase,
    sequence_number=e.sequence_number,
    current_flight_item_id=e.current_flight_item_id,
    current_trivia_question_id=e.current_trivia_question_id,
    tasting_opened_flight_item_id=e.tasting_opened_flight_item_id,
    reveal_at=e.reveal_at,
    timer_started_at=e.timer_started_at,
    timer_ends_at=e.timer_ends_at,
    trivia_opened_at=e.trivia_opened_at,
    trivia_closes_at=e.trivia_closes_at,
    completed_at=e.completed_at,
    ends_at=e.ends_at,
    updated_at=e.updated_at
  where id=e.id returning * into e;

  insert into public.event_state_log(event_id,sequence_number,command,phase,actor_user_id,payload)
  values(e.id,e.sequence_number,p_command,e.phase,auth.uid(),jsonb_build_object(
    'current_flight_item_id',e.current_flight_item_id,
    'current_trivia_question_id',e.current_trivia_question_id,
    'tasting_opened_flight_item_id',e.tasting_opened_flight_item_id,
    'reveal_at',e.reveal_at,
    'timer_ends_at',e.timer_ends_at
  ));

  if p_command='end_session' then
    delete from public.host_control_leases where event_id=p_event_id;
  end if;
  return e;
end $$;$ddl$;
    EXECUTE $ddl$CREATE OR REPLACE FUNCTION public.event_readiness(p_event_id uuid) RETURNS TABLE(key text, met boolean, message text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  with e as (select * from public.events where id = p_event_id),
  f as (select * from public.event_flight_items where event_id = p_event_id)
  select 'title', exists(select 1 from e where length(trim(title)) >= 3), 'Event title is set.' union all
  select 'starts_at', exists(select 1 from e where starts_at is not null), 'Start time is set.' union all
  select 'location', exists(select 1 from e where location_mode='remote' or (location_mode='in_person' and venue_name is not null and venue_address is not null)), 'Event format details are complete.' union all
  select 'capacity', exists(select 1 from e where capacity between 1 and 100), 'Capacity is valid.' union all
  select 'host', exists(select 1 from e join public.profiles p on p.id=e.host_user_id where p.role in ('host','admin')), 'Host is assigned.' union all
  select 'backup', exists(select 1 from e join public.profiles p on p.id=e.backup_host_user_id where p.role in ('host','admin') and e.backup_host_user_id <> e.host_user_id), 'Backup host is assigned.' union all
  select 'flight', exists(select 1 from f), 'At least one tea is in the flight.' union all
  select 'steep', exists(select 1 from f) and not exists(select 1 from f where steep_seconds is null or steep_seconds < 1), 'Every tea has a steep time.' union all
  select 'reveal', exists(select 1 from f) and not exists(select 1 from f where length(trim(reveal_description)) = 0), 'Every tea has reveal text.' union all
  select 'brewing', exists(select 1 from f) and not exists(select 1 from f where length(trim(brewing_instructions)) = 0), 'Every tea has brewing guidance.' union all
  select 'invite', exists(select 1 from e where invite_code is not null), 'Invite code is active.';
$$;$ddl$;
    EXECUTE $ddl$CREATE OR REPLACE FUNCTION public.save_event_bundle(p_event jsonb, p_flight jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
declare
  v_event_id uuid := nullif(p_event->>'id','')::uuid;
  saved_id uuid;
  flight_item jsonb;
  trivia jsonb;
  trivia_item jsonb;
  saved_flight_id uuid;
  event_slug text;
  event_invite text;
  position_no integer := 0;
  trivia_position integer;
  preserve_flight boolean := false;
  existing_flight public.event_flight_items;
begin
  if auth.uid() is null or not public.is_staff(auth.uid()) then raise exception 'not_authorized'; end if;
  if not exists(select 1 from public.profiles where id=(p_event->>'host_user_id')::uuid and role in ('host','admin')) then raise exception 'invalid_host'; end if;
  if nullif(p_event->>'backup_host_user_id','') is not null and not exists(select 1 from public.profiles where id=(p_event->>'backup_host_user_id')::uuid and role in ('host','admin')) then raise exception 'invalid_backup'; end if;
  if jsonb_typeof(p_flight) <> 'array' then raise exception 'invalid_flight'; end if;
  event_slug := coalesce(nullif(p_event->>'slug',''), lower(regexp_replace(p_event->>'title','[^a-zA-Z0-9]+','-','g')) || '-' || substr(encode(gen_random_bytes(4),'hex'),1,6));
  event_invite := coalesce(nullif(p_event->>'invite_code',''), upper(substr(encode(gen_random_bytes(6),'hex'),1,10)));

  if v_event_id is null then
    insert into public.events(title,slug,invite_code,status,location_mode,starts_at,timezone,capacity,venue_name,venue_address,video_call_url,owner_user_id,host_user_id,backup_host_user_id)
    values(
      trim(p_event->>'title'), event_slug, event_invite, coalesce((p_event->>'status')::public.event_status,'draft'),
      (p_event->>'location_mode')::public.location_mode, (p_event->>'starts_at')::timestamptz,
      coalesce(nullif(p_event->>'timezone',''),'America/Edmonton'), (p_event->>'capacity')::integer,
      nullif(p_event->>'venue_name',''), nullif(p_event->>'venue_address',''), nullif(p_event->>'video_call_url',''),
      auth.uid(), (p_event->>'host_user_id')::uuid, nullif(p_event->>'backup_host_user_id','')::uuid
    ) returning id into saved_id;
  else
    perform 1 from public.events where id=v_event_id for update;
    if not public.can_manage_event(v_event_id,auth.uid()) then raise exception 'not_authorized'; end if;
    if exists(select 1 from public.events e where e.id=v_event_id and e.status in ('live','completed','cancelled')) then raise exception 'event_locked'; end if;
    update public.events e set
      title=trim(p_event->>'title'), slug=event_slug, invite_code=event_invite,
      status=coalesce((p_event->>'status')::public.event_status,status), location_mode=(p_event->>'location_mode')::public.location_mode,
      starts_at=(p_event->>'starts_at')::timestamptz, timezone=coalesce(nullif(p_event->>'timezone',''),'America/Edmonton'),
      capacity=(p_event->>'capacity')::integer, venue_name=nullif(p_event->>'venue_name',''), venue_address=nullif(p_event->>'venue_address',''),
      video_call_url=nullif(p_event->>'video_call_url',''), host_user_id=(p_event->>'host_user_id')::uuid,
      backup_host_user_id=nullif(p_event->>'backup_host_user_id','')::uuid
    where e.id=v_event_id returning e.id into saved_id;
    perform 1 from public.event_flight_items where event_id=saved_id for update;
    preserve_flight := exists (
      select 1 from public.event_flight_items fi where fi.event_id=saved_id and (
        exists(select 1 from public.trivia_questions x where x.event_flight_item_id=fi.id)
        or exists(select 1 from public.tea_responses x where x.event_flight_item_id=fi.id)
        or exists(select 1 from public.tea_response_revisions x where x.event_flight_item_id=fi.id)
        or exists(select 1 from public.event_breakout_sessions x where x.event_flight_item_id=fi.id)
        or exists(select 1 from public.event_brews x where x.event_flight_item_id=fi.id)
        or exists(select 1 from public.event_chat_messages x where x.event_flight_item_id=fi.id)
        or exists(select 1 from public.event_cheers_sessions x where x.event_flight_item_id=fi.id)
        or exists(select 1 from public.event_conversation_prompts x where x.event_flight_item_id=fi.id)
        or exists(select 1 from public.event_group_reveals x where x.event_flight_item_id=fi.id)
        or exists(select 1 from public.event_reactions x where x.event_flight_item_id=fi.id)
        or exists(select 1 from public.event_stage_signals x where x.event_flight_item_id=fi.id)
        or exists(select 1 from public.living_tasting_map_fingerprints x where x.event_flight_item_id=fi.id)
        or exists(select 1 from public.living_tasting_map_observation_events x where x.event_flight_item_id=fi.id)
        or exists(select 1 from public.living_tasting_map_sessions x where x.event_flight_item_id=fi.id)
        or exists(select 1 from public.living_tasting_map_snapshots x where x.event_flight_item_id=fi.id)
        or exists(select 1 from public.reveal_sync_samples x where x.flight_item_id=fi.id)
        or exists(select 1 from public.room_discovery_cards x where x.event_flight_item_id=fi.id)
        or exists(select 1 from public.events x where x.tasting_opened_flight_item_id=fi.id)
      )
    );
    if preserve_flight and (
      (select count(*) from public.event_flight_items where event_id=saved_id) <> jsonb_array_length(p_flight)
      or exists (
        select 1 from jsonb_array_elements(p_flight) with ordinality incoming(value,position)
        left join public.event_flight_items existing on existing.event_id=saved_id and existing.position=incoming.position
        where existing.id is null or existing.tea_id is distinct from (incoming.value->>'tea_id')::uuid
      )
    ) then raise exception 'event_flight_history_preserved'; end if;
    if not preserve_flight then delete from public.event_flight_items where event_id=saved_id; end if;
  end if;

  for flight_item in select value from jsonb_array_elements(p_flight) loop
    position_no := position_no + 1;
    if preserve_flight then
      update public.event_flight_items set
        reveal_title=coalesce(nullif(flight_item->>'reveal_title',''), (select name from public.teas where id=(flight_item->>'tea_id')::uuid)),
        reveal_description=coalesce(flight_item->>'reveal_description',''),
        brewing_instructions=coalesce(flight_item->>'brewing_instructions',''),
        steep_seconds=(flight_item->>'steep_seconds')::integer,
        temperature_c=nullif(flight_item->>'temperature_c','')::numeric,
        leaf_grams=nullif(flight_item->>'leaf_grams','')::numeric,
        water_ml=nullif(flight_item->>'water_ml','')::integer
      where event_id=saved_id and position=position_no returning id into saved_flight_id;
    else
    insert into public.event_flight_items(event_id,tea_id,position,reveal_title,reveal_description,brewing_instructions,steep_seconds,temperature_c,leaf_grams,water_ml)
    values(
      saved_id, (flight_item->>'tea_id')::uuid, position_no,
      coalesce(nullif(flight_item->>'reveal_title',''), (select name from public.teas where id=(flight_item->>'tea_id')::uuid)),
      coalesce(flight_item->>'reveal_description',''), coalesce(flight_item->>'brewing_instructions',''),
      (flight_item->>'steep_seconds')::integer, nullif(flight_item->>'temperature_c','')::numeric,
      nullif(flight_item->>'leaf_grams','')::numeric, nullif(flight_item->>'water_ml','')::integer
    ) returning id into saved_flight_id;

    end if; -- Existing flight identities are retained; new trivia payload is ignored.
  end loop;

  if (select count(*) from public.event_flight_items fi where fi.event_id=saved_id) > 0 then
    update public.events e set
      current_flight_item_id=(select fi.id from public.event_flight_items fi where fi.event_id=saved_id order by position limit 1),
      current_trivia_question_id=null
    where id=saved_id;
  end if;
  if coalesce(p_event->>'status','draft')='scheduled' and exists(select 1 from public.event_readiness(saved_id) where not met) then raise exception 'not_ready'; end if;
  return saved_id;
end $$;$ddl$;
    EXECUTE $ddl$CREATE FUNCTION public.vf_guard_retired_feature_write() RETURNS trigger
LANGUAGE plpgsql SET search_path TO pg_catalog AS $guard$
declare old_row jsonb; new_row jsonb; allowed text[] := '{}'::text[]; field text;
begin
  if TG_OP='UPDATE' then
    old_row := to_jsonb(OLD); new_row := to_jsonb(NEW);
    case TG_TABLE_NAME
    when 'merchant_card_progress' then allowed := ARRAY['canonical_tea_id'];
    when 'merchant_listings' then allowed := ARRAY['canonical_tea_id'];
    when 'tea_catalog_prices' then allowed := ARRAY['canonical_tea_id'];
    when 'discovery_identity_recalculations' then allowed := ARRAY['source_event_id'];
    when 'user_discovery_identities' then allowed := ARRAY['earned_event_id'];
    when 'event_discovery_presentations' then allowed := ARRAY['surfaced_curiosity_card_id','updated_by'];
    when 'event_live_reward_awards' then allowed := ARRAY['participant_id'];
    when 'living_tasting_map_sessions' then allowed := ARRAY['created_by'];
    when 'room_discovery_card_items' then allowed := ARRAY['attribution_participant_id','created_by','removed_by'];
    when 'room_discovery_cards' then allowed := ARRAY['room_quote_participant_id','spokesperson_participant_id'];
    else null;
    end case;
    -- Only monotonic privacy erasure is allowed; no caller/session bypass.
    if TG_TABLE_NAME='room_discovery_cards' then
      if exists (
        (select value from jsonb_array_elements(new_row->'participant_ids'))
        except all
        (select value from jsonb_array_elements(old_row->'participant_ids'))
      ) then raise exception 'feature_retired' using errcode='55000'; end if;
      if new_row->'room_quote' is distinct from old_row->'room_quote' and new_row->'room_quote'<>'null'::jsonb then
        raise exception 'feature_retired' using errcode='55000';
      end if;
      if new_row->'room_quote_attributed' is distinct from old_row->'room_quote_attributed' and new_row->'room_quote_attributed'<>'false'::jsonb then
        raise exception 'feature_retired' using errcode='55000';
      end if;
      if new_row->'spokesperson_state' is distinct from old_row->'spokesperson_state' and new_row->>'spokesperson_state'<>'none' then
        raise exception 'feature_retired' using errcode='55000';
      end if;
      allowed := allowed || ARRAY['participant_ids','room_quote','room_quote_attributed','spokesperson_state'];
      old_row := old_row - ARRAY['participant_ids','room_quote','room_quote_attributed','spokesperson_state'];
      new_row := new_row - ARRAY['participant_ids','room_quote','room_quote_attributed','spokesperson_state'];
    end if;
    if cardinality(allowed)>0 then
      foreach field in array allowed loop
        if new_row ? field and new_row->field is distinct from old_row->field and new_row->field<>'null'::jsonb then
          raise exception 'feature_retired' using errcode='55000';
        end if;
      end loop;
      if (old_row - allowed - 'updated_at') = (new_row - allowed - 'updated_at') then return NEW; end if;
    end if;
  end if;
  raise exception 'feature_retired' using errcode='55000', detail='This historical game or trading record is frozen; only existing privacy erasure remains allowed.';
end
$guard$;$ddl$;
    EXECUTE $ddl$REVOKE ALL ON FUNCTION public.vf_guard_retired_feature_write() FROM PUBLIC;$ddl$;
    EXECUTE $ddl$CREATE TRIGGER zz_vf_retired_write_guard BEFORE INSERT OR UPDATE ON public.merchant_card_progress FOR EACH ROW EXECUTE FUNCTION public.vf_guard_retired_feature_write();$ddl$;
    EXECUTE $ddl$CREATE TRIGGER zz_vf_retired_write_guard BEFORE INSERT OR UPDATE ON public.merchant_tasting_verifications FOR EACH ROW EXECUTE FUNCTION public.vf_guard_retired_feature_write();$ddl$;
    EXECUTE $ddl$CREATE TRIGGER zz_vf_retired_write_guard BEFORE INSERT OR UPDATE ON public.merchant_listings FOR EACH ROW EXECUTE FUNCTION public.vf_guard_retired_feature_write();$ddl$;
    EXECUTE $ddl$CREATE TRIGGER zz_vf_retired_write_guard BEFORE INSERT OR UPDATE ON public.merchant_study_copies FOR EACH ROW EXECUTE FUNCTION public.vf_guard_retired_feature_write();$ddl$;
    EXECUTE $ddl$CREATE TRIGGER zz_vf_retired_write_guard BEFORE INSERT OR UPDATE ON public.merchant_transactions FOR EACH ROW EXECUTE FUNCTION public.vf_guard_retired_feature_write();$ddl$;
    EXECUTE $ddl$CREATE TRIGGER zz_vf_retired_write_guard BEFORE INSERT OR UPDATE ON public.merchant_reactions FOR EACH ROW EXECUTE FUNCTION public.vf_guard_retired_feature_write();$ddl$;
    EXECUTE $ddl$CREATE TRIGGER zz_vf_retired_write_guard BEFORE INSERT OR UPDATE ON public.tea_catalog_prices FOR EACH ROW EXECUTE FUNCTION public.vf_guard_retired_feature_write();$ddl$;
    EXECUTE $ddl$CREATE TRIGGER zz_vf_retired_write_guard BEFORE INSERT OR UPDATE ON public.trivia_questions FOR EACH ROW EXECUTE FUNCTION public.vf_guard_retired_feature_write();$ddl$;
    EXECUTE $ddl$CREATE TRIGGER zz_vf_retired_write_guard BEFORE INSERT OR UPDATE ON public.trivia_answers FOR EACH ROW EXECUTE FUNCTION public.vf_guard_retired_feature_write();$ddl$;
    EXECUTE $ddl$CREATE TRIGGER zz_vf_retired_write_guard BEFORE INSERT OR UPDATE ON public.discovery_identity_definitions FOR EACH ROW EXECUTE FUNCTION public.vf_guard_retired_feature_write();$ddl$;
    EXECUTE $ddl$CREATE TRIGGER zz_vf_retired_write_guard BEFORE INSERT OR UPDATE ON public.discovery_identity_recalculations FOR EACH ROW EXECUTE FUNCTION public.vf_guard_retired_feature_write();$ddl$;
    EXECUTE $ddl$CREATE TRIGGER zz_vf_retired_write_guard BEFORE INSERT OR UPDATE ON public.user_discovery_identities FOR EACH ROW EXECUTE FUNCTION public.vf_guard_retired_feature_write();$ddl$;
    EXECUTE $ddl$CREATE TRIGGER zz_vf_retired_write_guard BEFORE INSERT OR UPDATE ON public.user_discovery_profiles FOR EACH ROW EXECUTE FUNCTION public.vf_guard_retired_feature_write();$ddl$;
    EXECUTE $ddl$CREATE TRIGGER zz_vf_retired_write_guard BEFORE INSERT OR UPDATE ON public.room_discovery_cards FOR EACH ROW EXECUTE FUNCTION public.vf_guard_retired_feature_write();$ddl$;
    EXECUTE $ddl$CREATE TRIGGER zz_vf_retired_write_guard BEFORE INSERT OR UPDATE ON public.room_discovery_card_items FOR EACH ROW EXECUTE FUNCTION public.vf_guard_retired_feature_write();$ddl$;
    EXECUTE $ddl$CREATE TRIGGER zz_vf_retired_write_guard BEFORE INSERT OR UPDATE ON public.event_discovery_presentations FOR EACH ROW EXECUTE FUNCTION public.vf_guard_retired_feature_write();$ddl$;
    EXECUTE $ddl$CREATE TRIGGER zz_vf_retired_write_guard BEFORE INSERT OR UPDATE ON public.living_tasting_map_sessions FOR EACH ROW EXECUTE FUNCTION public.vf_guard_retired_feature_write();$ddl$;
    EXECUTE $ddl$CREATE TRIGGER zz_vf_retired_write_guard BEFORE INSERT OR UPDATE ON public.living_tasting_map_observation_events FOR EACH ROW EXECUTE FUNCTION public.vf_guard_retired_feature_write();$ddl$;
    EXECUTE $ddl$CREATE TRIGGER zz_vf_retired_write_guard BEFORE INSERT OR UPDATE ON public.living_tasting_map_snapshots FOR EACH ROW EXECUTE FUNCTION public.vf_guard_retired_feature_write();$ddl$;
    EXECUTE $ddl$CREATE TRIGGER zz_vf_retired_write_guard BEFORE INSERT OR UPDATE ON public.living_tasting_map_fingerprints FOR EACH ROW EXECUTE FUNCTION public.vf_guard_retired_feature_write();$ddl$;
    EXECUTE $ddl$CREATE TRIGGER zz_vf_retired_write_guard BEFORE INSERT OR UPDATE ON public.living_tasting_map_moderation_actions FOR EACH ROW EXECUTE FUNCTION public.vf_guard_retired_feature_write();$ddl$;
    EXECUTE $ddl$CREATE TRIGGER zz_vf_retired_write_guard BEFORE INSERT OR UPDATE ON public.live_tasting_reward_policies FOR EACH ROW EXECUTE FUNCTION public.vf_guard_retired_feature_write();$ddl$;
    EXECUTE $ddl$CREATE TRIGGER zz_vf_retired_write_guard BEFORE INSERT OR UPDATE ON public.event_live_reward_settings FOR EACH ROW EXECUTE FUNCTION public.vf_guard_retired_feature_write();$ddl$;
    EXECUTE $ddl$CREATE TRIGGER zz_vf_retired_write_guard BEFORE INSERT OR UPDATE ON public.event_live_reward_completion_overrides FOR EACH ROW EXECUTE FUNCTION public.vf_guard_retired_feature_write();$ddl$;
    EXECUTE $ddl$CREATE TRIGGER zz_vf_retired_write_guard BEFORE INSERT OR UPDATE ON public.event_live_reward_awards FOR EACH ROW EXECUTE FUNCTION public.vf_guard_retired_feature_write();$ddl$;
  end if;
end
$migration$;
COMMIT;
