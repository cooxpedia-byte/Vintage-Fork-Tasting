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
  if is_retired then
    EXECUTE $ddl$DROP TRIGGER zz_vf_retired_write_guard ON public.merchant_card_progress;$ddl$;
    EXECUTE $ddl$DROP TRIGGER zz_vf_retired_write_guard ON public.merchant_tasting_verifications;$ddl$;
    EXECUTE $ddl$DROP TRIGGER zz_vf_retired_write_guard ON public.merchant_listings;$ddl$;
    EXECUTE $ddl$DROP TRIGGER zz_vf_retired_write_guard ON public.merchant_study_copies;$ddl$;
    EXECUTE $ddl$DROP TRIGGER zz_vf_retired_write_guard ON public.merchant_transactions;$ddl$;
    EXECUTE $ddl$DROP TRIGGER zz_vf_retired_write_guard ON public.merchant_reactions;$ddl$;
    EXECUTE $ddl$DROP TRIGGER zz_vf_retired_write_guard ON public.tea_catalog_prices;$ddl$;
    EXECUTE $ddl$DROP TRIGGER zz_vf_retired_write_guard ON public.trivia_questions;$ddl$;
    EXECUTE $ddl$DROP TRIGGER zz_vf_retired_write_guard ON public.trivia_answers;$ddl$;
    EXECUTE $ddl$DROP TRIGGER zz_vf_retired_write_guard ON public.discovery_identity_definitions;$ddl$;
    EXECUTE $ddl$DROP TRIGGER zz_vf_retired_write_guard ON public.discovery_identity_recalculations;$ddl$;
    EXECUTE $ddl$DROP TRIGGER zz_vf_retired_write_guard ON public.user_discovery_identities;$ddl$;
    EXECUTE $ddl$DROP TRIGGER zz_vf_retired_write_guard ON public.user_discovery_profiles;$ddl$;
    EXECUTE $ddl$DROP TRIGGER zz_vf_retired_write_guard ON public.room_discovery_cards;$ddl$;
    EXECUTE $ddl$DROP TRIGGER zz_vf_retired_write_guard ON public.room_discovery_card_items;$ddl$;
    EXECUTE $ddl$DROP TRIGGER zz_vf_retired_write_guard ON public.event_discovery_presentations;$ddl$;
    EXECUTE $ddl$DROP TRIGGER zz_vf_retired_write_guard ON public.living_tasting_map_sessions;$ddl$;
    EXECUTE $ddl$DROP TRIGGER zz_vf_retired_write_guard ON public.living_tasting_map_observation_events;$ddl$;
    EXECUTE $ddl$DROP TRIGGER zz_vf_retired_write_guard ON public.living_tasting_map_snapshots;$ddl$;
    EXECUTE $ddl$DROP TRIGGER zz_vf_retired_write_guard ON public.living_tasting_map_fingerprints;$ddl$;
    EXECUTE $ddl$DROP TRIGGER zz_vf_retired_write_guard ON public.living_tasting_map_moderation_actions;$ddl$;
    EXECUTE $ddl$DROP TRIGGER zz_vf_retired_write_guard ON public.live_tasting_reward_policies;$ddl$;
    EXECUTE $ddl$DROP TRIGGER zz_vf_retired_write_guard ON public.event_live_reward_settings;$ddl$;
    EXECUTE $ddl$DROP TRIGGER zz_vf_retired_write_guard ON public.event_live_reward_completion_overrides;$ddl$;
    EXECUTE $ddl$DROP TRIGGER zz_vf_retired_write_guard ON public.event_live_reward_awards;$ddl$;
    EXECUTE $ddl$DROP FUNCTION public.vf_guard_retired_feature_write();$ddl$;
    EXECUTE $ddl$CREATE OR REPLACE FUNCTION public.claim_live_tasting_shield(p_tea_product_id text, p_event_id text) RETURNS TABLE(card_id uuid, tasting_count integer, card_tier text, listing_eligible boolean, shielded boolean, price_per_kilo_cents integer, base_leaf_price integer, current_leaf_price integer, pricing_source text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare current_user_id uuid; progress public.merchant_card_progress%rowtype;
begin
  current_user_id := public.ensure_current_customer();
  perform public.refresh_merchant_card_progress(current_user_id);
  select state.* into progress
  from public.merchant_card_progress state
  where state.owner_user_id = current_user_id
    and state.product_id = p_tea_product_id
    and state.live_tasting_verified
    and exists (
      select 1 from public.participants participant
      join public.events event on event.id = participant.event_id
      where participant.user_id = current_user_id
        and (event.id::text = p_event_id or event.slug = p_event_id)
        and participant.joined_at is not null
    )
  limit 1;
  if not found then
    raise exception using errcode = '42501', message = 'Live-event attendance and a released tasting stamp have not been verified yet.';
  end if;
  card_id := progress.source_card_id;
  tasting_count := progress.tasting_count;
  card_tier := progress.card_tier;
  listing_eligible := progress.listing_eligible;
  shielded := true;
  price_per_kilo_cents := progress.price_per_kilo_cents;
  base_leaf_price := progress.base_leaf_price;
  current_leaf_price := progress.current_leaf_price;
  pricing_source := progress.pricing_source;
  return next;
end;
$$;$ddl$;
    EXECUTE $ddl$CREATE OR REPLACE FUNCTION public.get_merchant_market() RETURNS TABLE(listing_id uuid, tea_name text, tea_category text, origin text, producer text, creator_display_name text, source_tier text, rarity text, pricing_source text, price_per_kilo_cents integer, leaf_price integer, like_count bigint, study_count bigint, helpful_percentage integer, preview jsonb, source_tastings integer, tea_available boolean, published_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  select listing.id, listing.tea_name, listing.tea_category, listing.origin,
    listing.producer, listing.creator_display_name, listing.source_tier,
    listing.rarity, listing.pricing_source, listing.price_per_kilo_cents,
    listing.calculated_leaf_price, listing.like_count, listing.study_count,
    coalesce(round(listing.helpful_count * 100.0 / nullif(listing.helpful_response_count, 0)), 0)::integer,
    listing.preview, listing.source_tastings, listing.tea_available, listing.published_at
  from public.merchant_listings listing
  where listing.status = 'active'
  order by (listing.helpful_count * 3 + listing.study_count * 2 + listing.like_count) desc,
    listing.published_at desc;
$$;$ddl$;
    EXECUTE $ddl$CREATE OR REPLACE FUNCTION public.get_my_merchant_cards() RETURNS TABLE(card_id uuid, tea_name text, tea_category text, origin text, producer text, card_tier text, tasting_count integer, listing_eligible boolean, pricing_source text, price_per_kilo_cents integer, leaf_price integer, listing_id uuid, listing_status text, study_count bigint, leaves_earned bigint, preview jsonb)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare current_user_id uuid;
begin
  current_user_id := public.ensure_current_customer();
  perform public.refresh_merchant_card_progress(current_user_id);
  return query
  select progress.source_card_id, progress.tea_name, progress.tea_category,
    progress.origin, progress.producer, progress.card_tier, progress.tasting_count,
    progress.listing_eligible, progress.pricing_source, progress.price_per_kilo_cents,
    progress.current_leaf_price, listing.id, listing.status, coalesce(listing.study_count, 0),
    coalesce((select sum(transaction.leaves_credited) from public.merchant_transactions transaction
      where transaction.listing_id = listing.id and transaction.status = 'complete'), 0),
    progress.preview
  from public.merchant_card_progress progress
  left join public.merchant_listings listing
    on listing.creator_id = progress.owner_user_id
   and listing.tea_identity_key = progress.tea_identity_key
   and listing.status in ('active', 'paused')
  where progress.owner_user_id = current_user_id and progress.listing_eligible
  order by progress.updated_at desc;
end;
$$;$ddl$;
    EXECUTE $ddl$CREATE OR REPLACE FUNCTION public.publish_merchant_listing(p_card_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  current_user_id uuid;
  progress public.merchant_card_progress%rowtype;
  listing_id uuid;
  display_name text;
begin
  current_user_id := public.ensure_current_customer();
  perform public.refresh_merchant_card_progress(current_user_id);
  select state.* into progress
  from public.merchant_card_progress state
  where state.owner_user_id = current_user_id and state.source_card_id = p_card_id
  for update;
  if not found or not progress.listing_eligible then
    raise exception using errcode = '22023', message = 'A second completed tasting of this exact tea is required before listing.';
  end if;
  select coalesce(nullif(profile.display_name, ''), 'Tea Explorer') into display_name
  from public.profiles profile where profile.id = current_user_id;

  insert into public.merchant_listings (
    source_card_id, creator_id, tea_identity_key, canonical_tea_id, product_id,
    tea_name, tea_category, origin, producer, creator_display_name, source_tier,
    rarity, pricing_source, price_per_kilo_cents, calculated_leaf_price,
    source_tastings, preview, card_snapshot
  ) values (
    progress.source_card_id, current_user_id, progress.tea_identity_key,
    progress.canonical_tea_id, progress.product_id, progress.tea_name,
    progress.tea_category, progress.origin, progress.producer, display_name,
    case when progress.live_tasting_verified then 'shielded' else 'polychrome' end,
    progress.rarity, progress.pricing_source, progress.price_per_kilo_cents,
    progress.current_leaf_price, progress.tasting_count, progress.preview, progress.card_snapshot
  )
  on conflict (creator_id, tea_identity_key) where status in ('active', 'paused')
  do update set
    source_card_id = excluded.source_card_id,
    source_tier = excluded.source_tier,
    pricing_source = excluded.pricing_source,
    price_per_kilo_cents = excluded.price_per_kilo_cents,
    calculated_leaf_price = excluded.calculated_leaf_price,
    source_tastings = excluded.source_tastings,
    preview = excluded.preview,
    card_snapshot = excluded.card_snapshot,
    status = 'active',
    updated_at = now()
  returning id into listing_id;
  return listing_id;
end;
$$;$ddl$;
    EXECUTE $ddl$CREATE OR REPLACE FUNCTION public.purchase_study_copy(p_listing_id uuid) RETURNS TABLE(transaction_id uuid, study_copy_id uuid, remaining_balance bigint)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  current_user_id uuid;
  listing public.merchant_listings%rowtype;
  buyer_wallet public.merchant_wallets%rowtype;
  creator_wallet public.merchant_wallets%rowtype;
  new_transaction_id uuid := extensions.gen_random_uuid();
  new_copy_id uuid;
begin
  current_user_id := public.ensure_current_customer();
  select item.* into listing from public.merchant_listings item
  where item.id = p_listing_id and item.status = 'active' for update;
  if not found then raise exception using errcode = 'P0002', message = 'This card is not currently available.'; end if;
  if listing.creator_id = current_user_id then
    raise exception using errcode = '22023', message = 'You cannot purchase your own card.';
  end if;
  insert into public.merchant_wallets (owner_user_id) values (listing.creator_id)
  on conflict (owner_user_id) do nothing;
  perform wallet.id from public.merchant_wallets wallet
    where wallet.owner_user_id in (current_user_id, listing.creator_id)
    order by wallet.id for update;
  select wallet.* into buyer_wallet from public.merchant_wallets wallet where wallet.owner_user_id = current_user_id;
  select wallet.* into creator_wallet from public.merchant_wallets wallet where wallet.owner_user_id = listing.creator_id;
  if buyer_wallet.balance < listing.calculated_leaf_price then
    raise exception using errcode = '22003', message = 'The wallet has insufficient Gold Leaves.';
  end if;

  update public.merchant_wallets set balance = balance - listing.calculated_leaf_price, updated_at = now()
  where id = buyer_wallet.id;
  update public.merchant_wallets set balance = balance + listing.calculated_leaf_price, updated_at = now()
  where id = creator_wallet.id;
  insert into public.merchant_ledger_entries (
    wallet_id, transaction_id, entry_type, leaves_delta, balance_after, description, metadata
  ) values
    (buyer_wallet.id, new_transaction_id, 'marketplace_transfer_out', -listing.calculated_leaf_price,
      buyer_wallet.balance - listing.calculated_leaf_price, 'Permanent Study Copy of ' || listing.tea_name,
      jsonb_build_object('listing_id', listing.id, 'counterparty_user_id', listing.creator_id)),
    (creator_wallet.id, new_transaction_id, 'marketplace_transfer_in', listing.calculated_leaf_price,
      creator_wallet.balance + listing.calculated_leaf_price, 'Study Copy shared: ' || listing.tea_name,
      jsonb_build_object('listing_id', listing.id, 'counterparty_user_id', current_user_id));

  insert into public.merchant_study_copies (
    buyer_id, source_listing_id, source_card_id, source_card_snapshot,
    source_provenance, leaf_price_paid
  ) values (
    current_user_id, listing.id, listing.source_card_id, listing.card_snapshot,
    jsonb_build_object('creator_id', listing.creator_id, 'creator_display_name', listing.creator_display_name,
      'source_tier', listing.source_tier, 'purchased_at', now()), listing.calculated_leaf_price
  ) returning id into new_copy_id;
  insert into public.merchant_transactions (
    id, buyer_id, creator_id, listing_id, study_copy_id, leaves_debited, leaves_credited
  ) values (
    new_transaction_id, current_user_id, listing.creator_id, listing.id, new_copy_id,
    listing.calculated_leaf_price, listing.calculated_leaf_price
  );
  update public.merchant_listings set study_count = study_count + 1, updated_at = now() where id = listing.id;
  transaction_id := new_transaction_id;
  study_copy_id := new_copy_id;
  remaining_balance := buyer_wallet.balance - listing.calculated_leaf_price;
  return next;
end;
$$;$ddl$;
    EXECUTE $ddl$CREATE OR REPLACE FUNCTION public.record_verified_tasting(p_tea_product_id text, p_tea_category text, p_origin text, p_producer text, p_rarity text, p_verification_key text, p_card_preview jsonb DEFAULT '{}'::jsonb, p_card_content jsonb DEFAULT '{}'::jsonb) RETURNS TABLE(card_id uuid, tasting_count integer, card_tier text, listing_eligible boolean, shielded boolean, price_per_kilo_cents integer, base_leaf_price integer, current_leaf_price integer, pricing_source text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare
  current_user_id uuid;
  existing_card_id uuid;
  catalog public.tea_catalog_prices%rowtype;
  personal_record_id uuid;
  new_session_id uuid := extensions.gen_random_uuid();
  new_card_id uuid := extensions.gen_random_uuid();
  resolved_name text;
  resolved_identity text;
  progress public.merchant_card_progress%rowtype;
begin
  current_user_id := public.ensure_current_customer();
  if char_length(coalesce(p_verification_key, '')) < 8 then
    raise exception using errcode = '22023', message = 'A valid tasting verification key is required.';
  end if;

  select verification.card_id into existing_card_id
  from public.merchant_tasting_verifications verification
  where verification.owner_user_id = current_user_id
    and verification.verification_key = p_verification_key;

  if existing_card_id is null then
    select price.* into catalog
    from public.tea_catalog_prices price
    where price.product_id = p_tea_product_id and price.is_active;

    resolved_name := coalesce(catalog.product_name, nullif(p_card_preview ->> 'tea_name', ''), p_tea_product_id);

    if catalog.canonical_tea_id is null then
      select personal.id into personal_record_id
      from public.personal_tea_records personal
      where personal.owner_user_id = current_user_id
        and lower(coalesce(personal.product_identifier, '')) = lower(p_tea_product_id)
        and personal.archived_at is null
      order by personal.created_at
      limit 1;

      if personal_record_id is null then
        insert into public.personal_tea_records (
          owner_user_id, name, producer, origin, tea_type, product_identifier
        ) values (
          current_user_id, resolved_name, nullif(p_producer, ''), nullif(p_origin, ''),
          nullif(p_tea_category, ''), p_tea_product_id
        ) returning id into personal_record_id;
      end if;
    end if;

    insert into public.tasting_sessions (
      id, owner_user_id, kind, status, started_at, completed_at
    ) values (
      new_session_id, current_user_id, 'solo', 'completed', now(), now()
    );

    insert into public.tasting_cards (
      id, session_id, owner_user_id, position, canonical_tea_id, personal_tea_record_id,
      tea_name_snapshot, producer_snapshot, origin_snapshot, tea_type_snapshot,
      product_identifier_snapshot, rating, intensity, completed_at
    ) values (
      new_card_id, new_session_id, current_user_id, 1, catalog.canonical_tea_id, personal_record_id,
      resolved_name, nullif(p_producer, ''), nullif(p_origin, ''), nullif(p_tea_category, ''),
      p_tea_product_id,
      greatest(1, least(5, coalesce((p_card_content ->> 'rating')::integer, 3))),
      case when p_card_content ->> 'intensity' in ('subtle','clear','dominant')
           then p_card_content ->> 'intensity'
           when coalesce((p_card_content ->> 'intensity')::integer, 2) <= 1 then 'subtle'
           when coalesce((p_card_content ->> 'intensity')::integer, 2) >= 3 then 'dominant'
           else 'clear' end,
      now()
    );

    resolved_identity := coalesce(
      'tea:' || catalog.canonical_tea_id::text,
      'product:' || lower(trim(p_tea_product_id))
    );
    insert into public.merchant_tasting_verifications (
      owner_user_id, verification_key, card_id, tea_identity_key
    ) values (current_user_id, p_verification_key, new_card_id, resolved_identity);
    existing_card_id := new_card_id;
  end if;

  perform public.refresh_merchant_card_progress(current_user_id);
  select state.* into progress
  from public.merchant_card_progress state
  where state.owner_user_id = current_user_id and state.source_card_id = existing_card_id;
  if not found then
    select state.* into progress
    from public.merchant_card_progress state
    join public.merchant_tasting_verifications verification
      on verification.owner_user_id = state.owner_user_id
     and verification.tea_identity_key = state.tea_identity_key
    where verification.owner_user_id = current_user_id
      and verification.card_id = existing_card_id;
  end if;

  card_id := existing_card_id;
  tasting_count := progress.tasting_count;
  card_tier := progress.card_tier;
  listing_eligible := progress.listing_eligible;
  shielded := progress.live_tasting_verified;
  price_per_kilo_cents := progress.price_per_kilo_cents;
  base_leaf_price := progress.base_leaf_price;
  current_leaf_price := progress.current_leaf_price;
  pricing_source := progress.pricing_source;
  return next;
end;
$$;$ddl$;
    EXECUTE $ddl$CREATE OR REPLACE FUNCTION public.refresh_merchant_card_progress(p_owner_user_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if p_owner_user_id is null then
    return;
  end if;
  delete from public.merchant_card_progress where owner_user_id = p_owner_user_id;

  with completed_cards as (
    select
      card.*,
      coalesce(card.product_identifier_snapshot, personal.product_identifier) as resolved_product_id,
      coalesce(
        'tea:' || card.canonical_tea_id::text,
        'product:' || lower(trim(coalesce(card.product_identifier_snapshot, personal.product_identifier))),
        'personal:' || card.personal_tea_record_id::text
      ) as identity_key
    from public.tasting_cards card
    left join public.personal_tea_records personal on personal.id = card.personal_tea_record_id
    where card.owner_user_id = p_owner_user_id and card.completed_at is not null
  ), grouped as (
    select identity_key, count(*)::integer as tasting_count
    from completed_cards
    group by identity_key
  ), latest as (
    select distinct on (identity_key) completed_cards.*
    from completed_cards
    order by identity_key, completed_at desc, created_at desc
  ), resolved as (
    select
      latest.*,
      grouped.tasting_count,
      catalog.product_id as catalog_product_id,
      catalog.price_per_kilo_cents,
      catalog.is_active as catalog_active,
      exists (
        select 1
        from public.tea_responses response
        join public.participants participant on participant.id = response.participant_id
        join public.event_flight_items flight on flight.id = response.event_flight_item_id
        where participant.user_id = p_owner_user_id
          and response.completed_at is not null
          and response.stamp_released_at is not null
          and flight.tea_id = latest.canonical_tea_id
      ) as has_live_shield
    from latest
    join grouped using (identity_key)
    left join lateral (
      select price.*
      from public.tea_catalog_prices price
      where price.is_active
        and (
          (latest.canonical_tea_id is not null and price.canonical_tea_id = latest.canonical_tea_id)
          or (latest.resolved_product_id is not null and price.product_id = latest.resolved_product_id)
        )
      order by (price.product_id = latest.resolved_product_id) desc, price.synced_at desc
      limit 1
    ) catalog on true
  )
  insert into public.merchant_card_progress (
    owner_user_id, tea_identity_key, source_card_id, canonical_tea_id, product_id,
    tea_name, tea_category, origin, producer, card_tier, tasting_count,
    listing_eligible, live_tasting_verified, pricing_source,
    price_per_kilo_cents, base_leaf_price, current_leaf_price, preview, card_snapshot
  )
  select
    p_owner_user_id,
    resolved.identity_key,
    resolved.id,
    resolved.canonical_tea_id,
    coalesce(resolved.catalog_product_id, resolved.resolved_product_id),
    resolved.tea_name_snapshot,
    coalesce(resolved.tea_type_snapshot, 'Tea'),
    coalesce(resolved.origin_snapshot, ''),
    coalesce(resolved.producer_snapshot, ''),
    case when resolved.has_live_shield then 'shielded'
         when resolved.tasting_count >= 2 then 'polychrome'
         else 'standard' end,
    resolved.tasting_count,
    resolved.tasting_count >= 2,
    resolved.has_live_shield,
    case when resolved.catalog_active then 'catalogue' else 'flat_rate' end,
    resolved.price_per_kilo_cents,
    public.calculate_card_leaf_price_from_kilo(resolved.price_per_kilo_cents, 'polychrome'),
    public.calculate_card_leaf_price_from_kilo(
      resolved.price_per_kilo_cents,
      case when resolved.has_live_shield then 'shielded' else 'polychrome' end
    ),
    jsonb_build_object(
      'rating', resolved.rating,
      'intensity', resolved.intensity,
      'descriptors', coalesce((
        select jsonb_agg(descriptor.label order by card_descriptor.position)
        from public.tasting_card_descriptors card_descriptor
        join public.flavor_descriptors descriptor on descriptor.id = card_descriptor.descriptor_id
        where card_descriptor.card_id = resolved.id
      ), '[]'::jsonb),
      'broad_family', coalesce(resolved.tea_type_snapshot, 'Tea')
    ),
    jsonb_build_object(
      'tea_name', resolved.tea_name_snapshot,
      'producer', resolved.producer_snapshot,
      'origin', resolved.origin_snapshot,
      'tea_type', resolved.tea_type_snapshot,
      'cultivar', resolved.cultivar_snapshot,
      'harvest', resolved.harvest_snapshot,
      'rating', resolved.rating,
      'intensity', resolved.intensity,
      'completed_at', resolved.completed_at
    )
  from resolved;

  update public.merchant_listings listing
  set source_card_id = progress.source_card_id,
      canonical_tea_id = progress.canonical_tea_id,
      product_id = progress.product_id,
      tea_name = progress.tea_name,
      tea_category = progress.tea_category,
      origin = progress.origin,
      producer = progress.producer,
      source_tier = case when progress.live_tasting_verified then 'shielded' else 'polychrome' end,
      pricing_source = progress.pricing_source,
      price_per_kilo_cents = progress.price_per_kilo_cents,
      calculated_leaf_price = progress.current_leaf_price,
      source_tastings = progress.tasting_count,
      preview = progress.preview,
      card_snapshot = progress.card_snapshot,
      updated_at = now()
  from public.merchant_card_progress progress
  where listing.creator_id = p_owner_user_id
    and listing.creator_id = progress.owner_user_id
    and listing.tea_identity_key = progress.tea_identity_key
    and listing.status in ('active', 'paused');
end;
$$;$ddl$;
    EXECUTE $ddl$CREATE OR REPLACE FUNCTION public.refresh_my_merchant_cards() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare current_user_id uuid;
begin
  current_user_id := public.ensure_current_customer();
  perform public.refresh_merchant_card_progress(current_user_id);
end;
$$;$ddl$;
    EXECUTE $ddl$CREATE OR REPLACE FUNCTION public.set_marketplace_reaction(p_listing_id uuid, p_reaction_type text, p_enabled boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare current_user_id uuid; changed_count integer;
begin
  current_user_id := public.ensure_current_customer();
  if p_reaction_type not in ('like', 'favourite', 'helpful') then
    raise exception using errcode = '22023', message = 'Unsupported reaction type.';
  end if;
  if p_reaction_type = 'helpful' and not exists (
    select 1 from public.merchant_study_copies copy
    where copy.buyer_id = current_user_id and copy.source_listing_id = p_listing_id
  ) then
    raise exception using errcode = '42501', message = 'Only Study Copy owners can mark a card helpful.';
  end if;
  if p_enabled then
    insert into public.merchant_reactions (owner_user_id, listing_id, reaction_type)
    values (current_user_id, p_listing_id, p_reaction_type) on conflict do nothing;
    get diagnostics changed_count = row_count;
  else
    delete from public.merchant_reactions
    where owner_user_id = current_user_id and listing_id = p_listing_id and reaction_type = p_reaction_type;
    get diagnostics changed_count = row_count;
  end if;
  if changed_count > 0 and p_reaction_type = 'like' then
    update public.merchant_listings
    set like_count = greatest(0, like_count + case when p_enabled then 1 else -1 end), updated_at = now()
    where id = p_listing_id;
  elsif changed_count > 0 and p_reaction_type = 'helpful' then
    update public.merchant_listings
    set helpful_count = greatest(0, helpful_count + case when p_enabled then 1 else -1 end),
        helpful_response_count = greatest(0, helpful_response_count + case when p_enabled then 1 else -1 end),
        updated_at = now()
    where id = p_listing_id;
  end if;
end;
$$;$ddl$;
    EXECUTE $ddl$CREATE OR REPLACE FUNCTION public.set_merchant_listing_status(p_listing_id uuid, p_status text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare current_user_id uuid;
begin
  current_user_id := public.ensure_current_customer();
  if p_status not in ('active', 'paused', 'removed') then
    raise exception using errcode = '22023', message = 'Unsupported listing status.';
  end if;
  update public.merchant_listings
  set status = p_status, updated_at = now()
  where id = p_listing_id and creator_id = current_user_id;
  if not found then raise exception using errcode = 'P0002', message = 'The listing was not found.'; end if;
end;
$$;$ddl$;
    EXECUTE $ddl$CREATE OR REPLACE FUNCTION public.sync_merchant_progress_from_card() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  perform public.refresh_merchant_card_progress(new.owner_user_id);
  if tg_op = 'UPDATE' and old.owner_user_id is distinct from new.owner_user_id then
    perform public.refresh_merchant_card_progress(old.owner_user_id);
  end if;
  return new;
end;
$$;$ddl$;
    EXECUTE $ddl$CREATE OR REPLACE FUNCTION public.sync_merchant_progress_from_catalog() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare owner_id uuid;
begin
  for owner_id in
    select distinct progress.owner_user_id
    from public.merchant_card_progress progress
    where progress.product_id = new.product_id
       or (new.canonical_tea_id is not null and progress.canonical_tea_id = new.canonical_tea_id)
  loop
    perform public.refresh_merchant_card_progress(owner_id);
  end loop;
  return new;
end;
$$;$ddl$;
    EXECUTE $ddl$CREATE OR REPLACE FUNCTION public.sync_merchant_progress_from_live_stamp() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare linked_user_id uuid;
begin
  select participant.user_id into linked_user_id
  from public.participants participant where participant.id = new.participant_id;
  if linked_user_id is not null then
    perform public.refresh_merchant_card_progress(linked_user_id);
  end if;
  return new;
end;
$$;$ddl$;
    EXECUTE $ddl$CREATE OR REPLACE FUNCTION public.add_discovery_card_member() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  update public.room_discovery_cards set participant_ids=array_append(participant_ids,new.participant_id),updated_at=now()
    where breakout_room_id=new.breakout_room_id and not new.participant_id=any(participant_ids);
  return new;
end $$;$ddl$;
    EXECUTE $ddl$CREATE OR REPLACE FUNCTION public.apply_discovery_presentation_command(p_event_id uuid, p_command text, p_expected_sequence bigint, p_lease_token uuid, p_client_command_id uuid, p_payload jsonb DEFAULT '{}'::jsonb) RETURNS public.events
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  event_row public.events;lease_row public.host_control_leases;session_row public.event_breakout_sessions;
  presentation_row public.event_discovery_presentations;card_row public.room_discovery_cards;
  card_id uuid;participant_id uuid;open_cards uuid[];
begin
  select * into event_row from public.events where id=p_event_id for update;
  if event_row.id is null then raise exception 'event_not_found'; end if;
  if not public.can_manage_event(p_event_id,auth.uid()) then raise exception 'not_authorized'; end if;
  select * into lease_row from public.host_control_leases where event_id=p_event_id for update;
  if lease_row.event_id is null or lease_row.holder_user_id<>auth.uid() or lease_row.lease_token<>p_lease_token or lease_row.expires_at<=now() then raise exception 'lease_lost'; end if;
  if p_client_command_id is not null and event_row.last_conductor_command_id=p_client_command_id then return event_row; end if;
  if event_row.sequence_number<>p_expected_sequence then raise exception 'stale_sequence'; end if;
  if event_row.phase='ended' or event_row.status<>'live' then raise exception 'event_not_live'; end if;
  select * into session_row from public.event_breakout_sessions
    where event_id=p_event_id and event_flight_item_id=event_row.current_flight_item_id and status in ('returning','complete')
    order by created_at desc limit 1;
  if session_row.id is null then raise exception 'discovery_board_unavailable'; end if;
  select * into presentation_row from public.event_discovery_presentations where breakout_session_id=session_row.id for update;
  card_id=nullif(p_payload->>'cardId','')::uuid;
  if card_id is not null then
    select * into card_row from public.room_discovery_cards where id=card_id and session_id=session_row.id for update;
    if card_row.id is null then raise exception 'discovery_card_unavailable'; end if;
  end if;

  if p_command='open_discovery_card' then
    if card_row.id is null then raise exception 'discovery_card_unavailable'; end if;
    update public.event_discovery_presentations set open_card_ids=array[card_id],surfaced_curiosity_card_id=null,updated_by=auth.uid(),updated_at=now()
      where breakout_session_id=session_row.id;
  elsif p_command='compare_discovery_card' then
    if card_row.id is null then raise exception 'discovery_card_unavailable'; end if;
    open_cards=coalesce(presentation_row.open_card_ids,'{}'::uuid[]);
    if card_id=any(open_cards) then null;
    elsif cardinality(open_cards)=0 then open_cards=array[card_id];
    elsif cardinality(open_cards)=1 then open_cards=array_append(open_cards,card_id);
    else open_cards=array[open_cards[2],card_id];
    end if;
    update public.event_discovery_presentations set open_card_ids=open_cards,surfaced_curiosity_card_id=null,updated_by=auth.uid(),updated_at=now()
      where breakout_session_id=session_row.id;
  elsif p_command='surface_discovery_curiosity' then
    if card_row.id is null or card_row.curiosity is null then raise exception 'discovery_curiosity_unavailable'; end if;
    update public.event_discovery_presentations set open_card_ids=array[card_id],surfaced_curiosity_card_id=card_id,updated_by=auth.uid(),updated_at=now()
      where breakout_session_id=session_row.id;
  elsif p_command='close_discovery_cards' then
    update public.event_discovery_presentations set open_card_ids='{}'::uuid[],surfaced_curiosity_card_id=null,updated_by=auth.uid(),updated_at=now()
      where breakout_session_id=session_row.id;
  elsif p_command='invite_discovery_spokesperson' then
    if card_row.id is null then raise exception 'discovery_card_unavailable'; end if;
    participant_id=coalesce(nullif(p_payload->>'participantId','')::uuid,card_row.spokesperson_participant_id);
    if participant_id is null or not exists(select 1 from public.event_breakout_members member where member.breakout_room_id=card_row.breakout_room_id and member.participant_id=participant_id) then
      raise exception 'discovery_spokesperson_unavailable';
    end if;
    update public.room_discovery_cards set spokesperson_participant_id=participant_id,spokesperson_state='invited',updated_at=now() where id=card_id;
    update public.event_discovery_presentations set open_card_ids=array[card_id],updated_by=auth.uid(),updated_at=now() where breakout_session_id=session_row.id;
  elsif p_command='complete_discovery_share' then
    if card_row.id is null or card_row.spokesperson_state not in ('accepted','invited') then raise exception 'discovery_spokesperson_unavailable'; end if;
    update public.room_discovery_cards set spokesperson_state='shared',updated_at=now() where id=card_id;
  else raise exception 'unknown_command';
  end if;

  event_row.sequence_number=event_row.sequence_number+1;event_row.conductor_id=auth.uid();
  event_row.last_conductor_command_id=p_client_command_id;event_row.updated_at=now();
  update public.events set sequence_number=event_row.sequence_number,conductor_id=event_row.conductor_id,
    last_conductor_command_id=event_row.last_conductor_command_id,updated_at=event_row.updated_at
    where id=event_row.id returning * into event_row;
  insert into public.event_state_log(event_id,sequence_number,command,phase,actor_user_id,payload)
    values(event_row.id,event_row.sequence_number,p_command,event_row.phase,auth.uid(),jsonb_build_object(
      'breakout_session_id',session_row.id,'card_id',card_id,'client_command_id',p_client_command_id
    ));
  return event_row;
end $$;$ddl$;
    EXECUTE $ddl$CREATE OR REPLACE FUNCTION public.apply_live_tasting_reward_command(p_event_id uuid, p_command text, p_expected_sequence bigint, p_lease_token uuid, p_client_command_id uuid, p_payload jsonb DEFAULT '{}'::jsonb) RETURNS public.events
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  event_row public.events;lease_row public.host_control_leases;participant_id_value uuid;
  policy_id_value uuid;enabled_value boolean;
begin
  select * into event_row from public.events where id=p_event_id for update;
  if event_row.id is null then raise exception 'event_not_found'; end if;
  if not public.can_manage_event(p_event_id,auth.uid()) then raise exception 'not_authorized'; end if;
  select * into lease_row from public.host_control_leases where event_id=p_event_id for update;
  if lease_row.event_id is null or lease_row.holder_user_id<>auth.uid()
    or lease_row.lease_token<>p_lease_token or lease_row.expires_at<=now()
  then raise exception 'lease_lost'; end if;
  if p_client_command_id is not null and event_row.last_conductor_command_id=p_client_command_id then return event_row; end if;
  if event_row.sequence_number<>p_expected_sequence then raise exception 'stale_sequence'; end if;
  if event_row.phase='ended' or event_row.status<>'live' then raise exception 'event_not_live'; end if;

  select id into policy_id_value from public.live_tasting_reward_policies where active limit 1;
  if policy_id_value is null then raise exception 'reward_policy_unavailable'; end if;
  insert into public.event_live_reward_settings(event_id,policy_id,reward_mode_enabled)
    values(p_event_id,policy_id_value,true) on conflict(event_id) do nothing;

  if p_command='set_reward_mode' then
    enabled_value=coalesce((p_payload->>'rewardModeEnabled')::boolean,true);
    update public.event_live_reward_settings set reward_mode_enabled=enabled_value,updated_at=now()
      where event_id=p_event_id;
  elsif p_command='grant_reward_completion' then
    participant_id_value=(p_payload->>'participantId')::uuid;
    if not exists(select 1 from public.participants participant where participant.id=participant_id_value
      and participant.event_id=p_event_id and participant.status<>'removed')
    then raise exception 'reward_participant_unavailable'; end if;
    insert into public.event_live_reward_completion_overrides(event_id,participant_id,granted_by)
      values(p_event_id,participant_id_value,auth.uid()) on conflict(event_id,participant_id) do nothing;
  else raise exception 'unknown_command';
  end if;

  event_row.sequence_number=event_row.sequence_number+1;
  event_row.conductor_id=auth.uid();event_row.last_conductor_command_id=p_client_command_id;event_row.updated_at=now();
  update public.events set sequence_number=event_row.sequence_number,conductor_id=event_row.conductor_id,
    last_conductor_command_id=event_row.last_conductor_command_id,updated_at=event_row.updated_at
    where id=event_row.id returning * into event_row;
  insert into public.event_state_log(event_id,sequence_number,command,phase,actor_user_id,payload)
    values(event_row.id,event_row.sequence_number,p_command,event_row.phase,auth.uid(),jsonb_build_object(
      'client_command_id',p_client_command_id,'reward_mode_enabled',p_payload->>'rewardModeEnabled',
      'manual_completion_participant_id',p_payload->>'participantId'
    ));
  return event_row;
end $$;$ddl$;
    EXECUTE $ddl$CREATE OR REPLACE FUNCTION public.apply_living_tasting_map_command(p_event_id uuid, p_command text, p_expected_sequence bigint, p_lease_token uuid, p_client_command_id uuid, p_payload jsonb DEFAULT '{}'::jsonb) RETURNS public.events
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  event_row public.events;lease_row public.host_control_leases;map_row public.living_tasting_map_sessions;
  pause_ms bigint;seek_ms integer;configured_duration integer;configured_visibility text;configured_custom boolean;
begin
  select * into event_row from public.events where id=p_event_id for update;
  if event_row.id is null then raise exception 'event_not_found'; end if;
  if not public.can_manage_event(p_event_id,auth.uid()) then raise exception 'not_authorized'; end if;
  select * into lease_row from public.host_control_leases where event_id=p_event_id for update;
  if lease_row.event_id is null or lease_row.holder_user_id<>auth.uid() or lease_row.lease_token<>p_lease_token or lease_row.expires_at<=now() then raise exception 'lease_lost'; end if;
  if p_client_command_id is not null and event_row.last_conductor_command_id=p_client_command_id then return event_row; end if;
  if event_row.sequence_number<>p_expected_sequence then raise exception 'stale_sequence'; end if;
  if event_row.status<>'live' or event_row.phase='ended' then raise exception 'living_map_event_unavailable'; end if;
  if event_row.current_flight_item_id is null then raise exception 'flight_missing'; end if;

  insert into public.living_tasting_map_sessions(event_id,event_flight_item_id,created_by)
    values(p_event_id,event_row.current_flight_item_id,auth.uid()) on conflict(event_id,event_flight_item_id) do nothing;
  select * into map_row from public.living_tasting_map_sessions
    where event_id=p_event_id and event_flight_item_id=event_row.current_flight_item_id for update;

  if p_command='configure_living_map' then
    if map_row.status<>'ready' then raise exception 'living_map_already_started'; end if;
    configured_duration=coalesce((p_payload->>'durationSeconds')::integer,map_row.duration_seconds);
    configured_visibility=coalesce(nullif(p_payload->>'visibilityMode',''),map_row.visibility_mode);
    configured_custom=coalesce((p_payload->>'customNotesEnabled')::boolean,map_row.custom_notes_enabled);
    if configured_duration<60 or configured_duration>1800 then raise exception 'living_map_duration_invalid'; end if;
    if configured_visibility not in ('quiet_start','shared_live') then raise exception 'living_map_visibility_invalid'; end if;
    map_row.duration_seconds=configured_duration;map_row.visibility_mode=configured_visibility;map_row.custom_notes_enabled=configured_custom;
  elsif p_command='start_living_map' then
    if event_row.conductor_stage not in ('aroma','first_sip','explore','discuss') then raise exception 'living_map_stage_unavailable'; end if;
    if map_row.status<>'ready' then raise exception 'living_map_already_started'; end if;
    map_row.status='live';map_row.started_at=clock_timestamp();map_row.paused_at=null;map_row.accumulated_pause_ms=0;
  elsif p_command='pause_living_map' then
    if map_row.status<>'live' then raise exception 'living_map_not_live'; end if;
    map_row.status='paused';map_row.paused_at=clock_timestamp();
  elsif p_command='resume_living_map' then
    if map_row.status<>'paused' or map_row.paused_at is null then raise exception 'living_map_not_paused'; end if;
    pause_ms=greatest(0,extract(epoch from (clock_timestamp()-map_row.paused_at))*1000)::bigint;
    map_row.accumulated_pause_ms=map_row.accumulated_pause_ms+pause_ms;map_row.status='live';map_row.paused_at=null;
  elsif p_command='freeze_living_map' then
    if map_row.status not in ('live','paused') then raise exception 'living_map_not_live'; end if;
    if map_row.paused_at is not null then
      pause_ms=greatest(0,extract(epoch from (clock_timestamp()-map_row.paused_at))*1000)::bigint;
      map_row.accumulated_pause_ms=map_row.accumulated_pause_ms+pause_ms;
    end if;
    map_row.status='frozen';map_row.paused_at=null;map_row.frozen_at=clock_timestamp();map_row.replay_position_ms=0;
  elsif p_command='start_living_map_replay' then
    if map_row.status not in ('frozen','replaying') or not exists(select 1 from public.living_tasting_map_fingerprints where session_id=map_row.id) then raise exception 'living_map_fingerprint_unavailable'; end if;
    map_row.status='replaying';map_row.replay_started_at=clock_timestamp();map_row.replay_paused_at=null;map_row.replay_position_ms=0;
  elsif p_command='pause_living_map_replay' then
    if map_row.status<>'replaying' or map_row.replay_started_at is null or map_row.replay_paused_at is not null then raise exception 'living_map_replay_not_running'; end if;
    map_row.replay_position_ms=least(map_row.duration_seconds*1000,map_row.replay_position_ms+round(extract(epoch from (clock_timestamp()-map_row.replay_started_at))*1000*(map_row.duration_seconds::numeric/map_row.replay_duration_seconds))::integer);
    map_row.replay_paused_at=clock_timestamp();
  elsif p_command='resume_living_map_replay' then
    if map_row.status<>'replaying' or map_row.replay_paused_at is null then raise exception 'living_map_replay_not_paused'; end if;
    map_row.replay_started_at=clock_timestamp();map_row.replay_paused_at=null;
  elsif p_command='seek_living_map_replay' then
    if map_row.status<>'replaying' then raise exception 'living_map_replay_unavailable'; end if;
    seek_ms=coalesce((p_payload->>'replayPositionMs')::integer,-1);
    if seek_ms<0 or seek_ms>map_row.duration_seconds*1000 then raise exception 'living_map_seek_invalid'; end if;
    map_row.replay_position_ms=seek_ms;map_row.replay_started_at=clock_timestamp();
  elsif p_command='commit_living_map_fingerprint' then
    if map_row.status not in ('frozen','replaying') or not exists(select 1 from public.living_tasting_map_fingerprints where session_id=map_row.id) then raise exception 'living_map_fingerprint_unavailable'; end if;
    update public.living_tasting_map_fingerprints set committed_at=coalesce(committed_at,clock_timestamp()),updated_at=clock_timestamp() where session_id=map_row.id;
    map_row.status='committed';
  elsif p_command='reopen_living_map' then
    if map_row.status not in ('frozen','replaying') or exists(select 1 from public.living_tasting_map_fingerprints where session_id=map_row.id and committed_at is not null) then raise exception 'living_map_reopen_unavailable'; end if;
    delete from public.living_tasting_map_fingerprints where session_id=map_row.id;
    map_row.status='live';map_row.frozen_at=null;map_row.replay_started_at=null;map_row.replay_paused_at=null;map_row.replay_position_ms=0;
  else raise exception 'unknown_command'; end if;

  update public.living_tasting_map_sessions set status=map_row.status,duration_seconds=map_row.duration_seconds,
    visibility_mode=map_row.visibility_mode,custom_notes_enabled=map_row.custom_notes_enabled,started_at=map_row.started_at,
    paused_at=map_row.paused_at,accumulated_pause_ms=map_row.accumulated_pause_ms,frozen_at=map_row.frozen_at,
    replay_started_at=map_row.replay_started_at,replay_paused_at=map_row.replay_paused_at,replay_position_ms=map_row.replay_position_ms,
    version=version+1,updated_at=clock_timestamp() where id=map_row.id returning * into map_row;

  event_row.sequence_number=event_row.sequence_number+1;event_row.last_conductor_command_id=p_client_command_id;event_row.conductor_id=auth.uid();event_row.updated_at=clock_timestamp();
  update public.events set sequence_number=event_row.sequence_number,last_conductor_command_id=event_row.last_conductor_command_id,
    conductor_id=event_row.conductor_id,updated_at=event_row.updated_at where id=event_row.id returning * into event_row;
  insert into public.event_state_log(event_id,sequence_number,command,phase,actor_user_id,payload)
    values(event_row.id,event_row.sequence_number,p_command,event_row.phase,auth.uid(),jsonb_build_object('living_map_session_id',map_row.id,'living_map_status',map_row.status,'command_payload',p_payload));
  return event_row;
end $$;$ddl$;
    EXECUTE $ddl$CREATE OR REPLACE FUNCTION public.authoritative_discovery_history(p_user_id uuid) RETURNS TABLE(source_kind text, source_record_id uuid, source_event_id uuid, tea_key text, tea_name text, tea_type text, origin text, completed_at timestamp with time zone, descriptor_categories text[])
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  select
    'live'::text,
    response.id,
    event.id,
    'canonical:'||tea.id::text,
    tea.name,
    nullif(trim(tea.tea_type),''),
    nullif(trim(tea.origin),''),
    response.stamp_released_at,
    coalesce(observations.categories,'{}'::text[])
  from public.participants participant
  join public.tea_responses response on response.participant_id=participant.id
  join public.event_flight_items flight on flight.id=response.event_flight_item_id
  join public.events event on event.id=flight.event_id and event.id=participant.event_id
  join public.teas tea on tea.id=flight.tea_id
  left join lateral (
    select array_agg(distinct descriptor.category) as categories
    from unnest(coalesce(response.descriptors,'{}'::text[])) selected(value)
    join public.flavor_descriptors descriptor on
      lower(regexp_replace(trim(selected.value),'[[:space:]_/-]+',' ','g'))
        = lower(regexp_replace(trim(descriptor.label),'[[:space:]_/-]+',' ','g'))
      or exists (
        select 1 from unnest(descriptor.aliases) alias(value)
        where lower(regexp_replace(trim(alias.value),'[[:space:]_/-]+',' ','g'))
          = lower(regexp_replace(trim(selected.value),'[[:space:]_/-]+',' ','g'))
      )
  ) observations on true
  where participant.user_id=p_user_id
    and participant.status<>'removed'
    and event.status='completed'
    and response.completed_at is not null
    and response.stamp_released_at is not null

  union all

  select
    'solo'::text,
    card.id,
    null::uuid,
    case
      when card.canonical_tea_id is not null then 'canonical:'||card.canonical_tea_id::text
      else 'personal:'||card.personal_tea_record_id::text
    end,
    card.tea_name_snapshot,
    nullif(trim(card.tea_type_snapshot),''),
    nullif(trim(card.origin_snapshot),''),
    card.completed_at,
    coalesce(observations.categories,'{}'::text[])
  from public.tasting_cards card
  join public.tasting_sessions session on session.id=card.session_id and session.owner_user_id=card.owner_user_id
  left join lateral (
    select array_agg(distinct descriptor.category) as categories
    from public.tasting_card_descriptors selected
    join public.flavor_descriptors descriptor on descriptor.id=selected.descriptor_id
    where selected.card_id=card.id and selected.owner_user_id=card.owner_user_id
  ) observations on true
  where card.owner_user_id=p_user_id
    and session.status='completed'
    and card.completed_at is not null
$$;$ddl$;
    EXECUTE $ddl$CREATE OR REPLACE FUNCTION public.create_discovery_presentation() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  insert into public.event_discovery_presentations(breakout_session_id,event_id) values(new.id,new.event_id)
    on conflict(breakout_session_id) do nothing;
  return new;
end $$;$ddl$;
    EXECUTE $ddl$CREATE OR REPLACE FUNCTION public.create_room_discovery_card() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare session_row public.event_breakout_sessions;
begin
  select * into session_row from public.event_breakout_sessions where id=new.session_id;
  insert into public.room_discovery_cards(breakout_room_id,session_id,event_id,event_flight_item_id)
    values(new.id,new.session_id,new.event_id,session_row.event_flight_item_id)
    on conflict(breakout_room_id) do nothing;
  return new;
end $$;$ddl$;
    EXECUTE $ddl$CREATE OR REPLACE FUNCTION public.discovery_metrics_for_user(p_user_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  with history as (
    select * from public.authoritative_discovery_history(p_user_id)
  ), distinct_teas as (
    select distinct on (tea_key) tea_key,tea_name,tea_type,origin,completed_at
    from history order by tea_key,completed_at desc
  ), type_counts as (
    select lower(tea_type) as label,count(*)::integer as value
    from distinct_teas where tea_type is not null group by lower(tea_type)
  ), descriptor_counts as (
    select category,count(distinct history.tea_key)::integer as value
    from history cross join lateral unnest(history.descriptor_categories) category
    group by category
  )
  select jsonb_build_object(
    'teas_explored',(select count(*) from distinct_teas),
    'tea_type_count',(select count(*) from type_counts),
    'origin_count',(select count(distinct lower(origin)) from distinct_teas where origin is not null),
    'live_tastings_completed',(select count(distinct source_event_id) from history where source_event_id is not null),
    'tea_type_distribution',coalesce((select jsonb_object_agg(label,value order by label) from type_counts),'{}'::jsonb),
    'origins',coalesce((select jsonb_agg(origin order by origin) from (select distinct origin from distinct_teas where origin is not null) found),'[]'::jsonb),
    'descriptor_family_distribution',coalesce((select jsonb_object_agg(category,value order by category) from descriptor_counts),'{}'::jsonb),
    'source_metrics_version','discovery-v1'
  )
$$;$ddl$;
    EXECUTE $ddl$CREATE OR REPLACE FUNCTION public.event_discovery_board(p_event_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare event_row public.events;session_row public.event_breakout_sessions;presentation_row public.event_discovery_presentations;cards jsonb;
begin
  if not public.can_manage_event(p_event_id,auth.uid()) then raise exception 'not_authorized'; end if;
  select * into event_row from public.events where id=p_event_id;
  if event_row.id is null then raise exception 'event_not_found'; end if;
  select * into session_row from public.event_breakout_sessions
    where event_id=p_event_id and event_flight_item_id=event_row.current_flight_item_id and status in ('active','returning','complete')
    order by created_at desc limit 1;
  if session_row.id is null then return '{"session":null,"cards":[],"openCardIds":[]}'::jsonb; end if;
  update public.room_discovery_cards card set spokesperson_participant_id=null,spokesperson_state='none',updated_at=now()
    from public.participants participant
    where card.session_id=session_row.id and card.spokesperson_participant_id=participant.id and participant.status in ('left','removed');
  select * into presentation_row from public.event_discovery_presentations where breakout_session_id=session_row.id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',card.id,'breakoutRoomId',card.breakout_room_id,'roomNumber',room.room_number,
    'participantCount',cardinality(card.participant_ids),'lockedAt',card.locked_at,'sourceVersion',card.source_version,
    'curiosity',card.curiosity,'roomQuote',card.room_quote,
    'quoteAttributed',card.room_quote_attributed,'spokespersonState',card.spokesperson_state,
    'spokespersonParticipantId',card.spokesperson_participant_id,
    'spokespersonName',(select participant.display_name from public.participants participant where participant.id=card.spokesperson_participant_id),
    'participants',(select coalesce(jsonb_agg(jsonb_build_object('id',participant.id,'displayName',participant.display_name) order by participant.display_name),'[]'::jsonb)
      from public.event_breakout_members member join public.participants participant on participant.id=member.participant_id where member.breakout_room_id=card.breakout_room_id),
    'items',(select coalesce(jsonb_agg(jsonb_build_object(
      'id',item.id,'category',item.category,'text',item.item_text,'normalizedKey',item.normalized_key,'source',item.source,
      'prevalenceCount',item.prevalence_count,'prevalenceTotal',item.prevalence_total
    ) order by item.category,item.prevalence_count desc nulls last,item.created_at),'[]'::jsonb)
      from public.room_discovery_card_items item where item.card_id=card.id and item.removed_at is null)
  ) order by room.room_number),'[]'::jsonb) into cards
  from public.room_discovery_cards card join public.event_breakout_rooms room on room.id=card.breakout_room_id
  where card.session_id=session_row.id;
  return jsonb_build_object(
    'session',jsonb_build_object('id',session_row.id,'status',session_row.status,'eventFlightItemId',session_row.event_flight_item_id,'completedAt',session_row.completed_at),
    'cards',cards,'openCardIds',coalesce(presentation_row.open_card_ids,'{}'::uuid[]),
    'surfacedCuriosityCardId',presentation_row.surfaced_curiosity_card_id
  );
end $$;$ddl$;
    EXECUTE $ddl$CREATE OR REPLACE FUNCTION public.initialize_live_tasting_reward_settings() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare policy_id_value uuid;
begin
  select id into policy_id_value from public.live_tasting_reward_policies where active limit 1;
  if policy_id_value is not null then
    insert into public.event_live_reward_settings(event_id,policy_id,reward_mode_enabled)
    values(new.id,policy_id_value,true) on conflict(event_id) do nothing;
  end if;
  return new;
end $$;$ddl$;
    EXECUTE $ddl$CREATE OR REPLACE FUNCTION public.lock_room_discovery_card() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if old.status='open' and new.status in ('returning','closed') then
    update public.room_discovery_cards set locked_at=coalesce(locked_at,now()),updated_at=now() where breakout_room_id=new.id;
  end if;
  return new;
end $$;$ddl$;
    EXECUTE $ddl$CREATE OR REPLACE FUNCTION public.process_live_tasting_rewards(p_event_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  award_row public.event_live_reward_awards;wallet_id_value uuid;entry_id_value uuid;
  awarded_count integer:=0;retry_count integer:=0;
begin
  for award_row in
    select award.* from public.event_live_reward_awards award
    where award.status in ('queued','retry') and award.next_retry_at<=now() and award.attempts<12
      and (p_event_id is null or award.event_id=p_event_id)
    order by award.created_at for update skip locked
  loop
    begin
      update public.event_live_reward_awards set status='processing',attempts=attempts+1,updated_at=now()
        where id=award_row.id;
      insert into public.merchant_wallets(owner_user_id) values(award_row.user_id)
        on conflict(owner_user_id) do nothing;
      select wallet.id into wallet_id_value from public.merchant_wallets wallet
        where wallet.owner_user_id=award_row.user_id;
      entry_id_value=public.post_gold_leaves_entry(
        p_wallet_id=>wallet_id_value,p_entry_type=>'adjustment',p_leaves_delta=>award_row.amount,
        p_source=>'live_tasting',p_source_reference=>award_row.event_id::text,
        p_idempotency_key=>award_row.idempotency_key,
        p_description=>'Gold Leaves earned for completing a live tea tasting',
        p_metadata=>jsonb_build_object('event_id',award_row.event_id,'reward_type',award_row.reward_type,'rule_version',award_row.rule_version),
        p_allow_negative_balance=>false
      );
      update public.event_live_reward_awards set status='awarded',canonical_entry_id=entry_id_value,
        awarded_at=coalesce(awarded_at,now()),last_error_code=null,updated_at=now() where id=award_row.id;
      awarded_count=awarded_count+1;
    exception when others then
      update public.event_live_reward_awards set status='retry',attempts=attempts+1,last_error_code=sqlstate,
        next_retry_at=now()+make_interval(secs=>least(3600,60*(award_row.attempts+1))),updated_at=now()
        where id=award_row.id;
      retry_count=retry_count+1;
    end;
  end loop;
  return jsonb_build_object('awarded',awarded_count,'retry',retry_count);
end $$;$ddl$;
    EXECUTE $ddl$CREATE OR REPLACE FUNCTION public.queue_live_tasting_completion_rewards(p_event_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  event_row public.events;settings_row public.event_live_reward_settings;
  policy_row public.live_tasting_reward_policies;participant_row public.participants;
  queued_count integer:=0;award_amount integer;
begin
  select * into event_row from public.events where id=p_event_id;
  if event_row.id is null then raise exception 'event_not_found'; end if;
  if event_row.status<>'completed' or event_row.phase<>'ended' then raise exception 'event_not_complete'; end if;
  select * into settings_row from public.event_live_reward_settings where event_id=p_event_id;
  if settings_row.event_id is null or not settings_row.reward_mode_enabled then
    return jsonb_build_object('queued',0,'reward_mode_enabled',false);
  end if;
  select * into policy_row from public.live_tasting_reward_policies where id=settings_row.policy_id;
  if policy_row.id is null then raise exception 'reward_policy_unavailable'; end if;
  award_amount=least(policy_row.event_completion_leaves,policy_row.max_leaves_per_participant_event);

  for participant_row in
    select participant.* from public.participants participant
    where participant.event_id=p_event_id and participant.user_id is not null and participant.status<>'removed'
      and (
        exists(select 1 from public.event_live_reward_completion_overrides completion_override
          where completion_override.event_id=p_event_id and completion_override.participant_id=participant.id)
        or (
          participant.joined_at is not null and participant.last_seen_at is not null
          and extract(epoch from (participant.last_seen_at-participant.joined_at))>=policy_row.minimum_presence_seconds
          and exists(
            select 1 from public.tea_responses response
            join public.event_flight_items flight_item on flight_item.id=response.event_flight_item_id
            where response.participant_id=participant.id and flight_item.event_id=p_event_id
              and response.completed_at is not null
          )
        )
      )
  loop
    insert into public.event_live_reward_awards(
      event_id,participant_id,user_id,reward_type,amount,rule_version,idempotency_key
    ) values(
      p_event_id,participant_row.id,participant_row.user_id,'event_complete',award_amount,policy_row.rule_version,
      format('live-tasting:%s:%s:event-complete:%s',p_event_id,participant_row.id,policy_row.rule_version)
    ) on conflict(event_id,user_id,reward_type) do nothing;
    if found then queued_count=queued_count+1; end if;
  end loop;
  return jsonb_build_object('queued',queued_count,'reward_mode_enabled',true,'rule_version',policy_row.rule_version);
end $$;$ddl$;
    EXECUTE $ddl$CREATE OR REPLACE FUNCTION public.recalculate_discovery_identities(p_user_id uuid, p_source_event_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  definition record;
  metrics jsonb;
  identity_id uuid;
  newly_earned uuid[] := '{}';
  qualifies boolean;
  distinct_count integer;
  secondary_count integer;
  v_evidence_summary text;
  related_teas jsonb;
  v_evidence jsonb;
  criteria_kind text;
  idempotency text;
begin
  if p_user_id is null or not exists(select 1 from public.profiles where id=p_user_id) then
    raise exception 'discovery_user_unavailable';
  end if;
  if p_source_event_id is not null and not exists(select 1 from public.events where id=p_source_event_id and status='completed') then
    raise exception 'discovery_event_incomplete';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text,39));
  insert into public.user_discovery_profiles(user_id) values(p_user_id) on conflict(user_id) do nothing;
  metrics:=public.discovery_metrics_for_user(p_user_id);

  for definition in
    select * from public.discovery_identity_definitions where active order by sort_order
  loop
    qualifies:=false;
    distinct_count:=0;
    secondary_count:=0;
    related_teas:='[]'::jsonb;
    criteria_kind:=definition.criteria->>'kind';

    if criteria_kind='tea_type_breadth' then
      distinct_count:=(metrics->>'teas_explored')::integer;
      secondary_count:=(metrics->>'tea_type_count')::integer;
      qualifies:=distinct_count>=(definition.criteria->>'minimum_distinct_teas')::integer
        and secondary_count>=(definition.criteria->>'minimum_types')::integer;
      v_evidence_summary:=format('You have explored %s distinct teas across %s tea types.',distinct_count,secondary_count);
    elsif criteria_kind='origin_breadth' then
      distinct_count:=(metrics->>'origin_count')::integer;
      qualifies:=distinct_count>=(definition.criteria->>'minimum_origins')::integer;
      v_evidence_summary:=format('Your tasting history includes %s distinct growing origins.',distinct_count);
    elsif criteria_kind='tea_type_depth' then
      select count(distinct history.tea_key) into distinct_count
      from public.authoritative_discovery_history(p_user_id) history
      where lower(coalesce(history.tea_type,'')) like '%'||lower(definition.criteria->>'tea_type_pattern')||'%';
      qualifies:=distinct_count>=(definition.criteria->>'minimum_distinct_teas')::integer;
      v_evidence_summary:=format('You have recorded %s distinct %s tea%s.',distinct_count,definition.criteria->>'tea_type_pattern',case when distinct_count=1 then '' else 's' end);
    elsif criteria_kind='tea_type_group_depth' then
      select count(distinct history.tea_key) into distinct_count
      from public.authoritative_discovery_history(p_user_id) history
      where exists (
        select 1 from jsonb_array_elements_text(definition.criteria->'tea_type_patterns') pattern(value)
        where lower(coalesce(history.tea_type,'')) like '%'||lower(pattern.value)||'%'
      );
      qualifies:=distinct_count>=(definition.criteria->>'minimum_distinct_teas')::integer;
      v_evidence_summary:=format('You have recorded %s distinct herbal, tisane or rooibos cups.',distinct_count);
    elsif criteria_kind='descriptor_category_depth' then
      select count(distinct history.tea_key) into distinct_count
      from public.authoritative_discovery_history(p_user_id) history
      where (definition.criteria->>'descriptor_category')=any(history.descriptor_categories);
      qualifies:=distinct_count>=(definition.criteria->>'minimum_distinct_teas')::integer;
      v_evidence_summary:=format('%s notes have appeared in your own journal across %s distinct tea%s.',definition.criteria->>'descriptor_category',distinct_count,case when distinct_count=1 then '' else 's' end);
    elsif criteria_kind='live_event_history' then
      select count(distinct history.source_event_id),count(distinct history.tea_key)
      into secondary_count,distinct_count
      from public.authoritative_discovery_history(p_user_id) history
      where history.source_event_id is not null;
      qualifies:=secondary_count>=(definition.criteria->>'minimum_live_events')::integer
        and distinct_count>=(definition.criteria->>'minimum_distinct_teas')::integer;
      v_evidence_summary:=format('You have completed tasting cards for %s teas across %s live tasting tables.',distinct_count,secondary_count);
    else
      raise exception 'discovery_unknown_criteria_kind';
    end if;

    select coalesce(jsonb_agg(jsonb_build_object(
      'teaKey',recent.tea_key,'teaName',recent.tea_name,'origin',recent.origin,
      'completedAt',recent.completed_at,'source',recent.source_kind
    ) order by recent.completed_at desc),'[]'::jsonb)
    into related_teas
    from (
      select distinct on (history.tea_key)
        history.tea_key,history.tea_name,history.origin,history.completed_at,history.source_kind
      from public.authoritative_discovery_history(p_user_id) history
      where
        criteria_kind in ('tea_type_breadth','origin_breadth')
        or (criteria_kind='live_event_history' and history.source_event_id is not null)
        or (criteria_kind='tea_type_depth' and lower(coalesce(history.tea_type,'')) like '%'||lower(definition.criteria->>'tea_type_pattern')||'%')
        or (criteria_kind='tea_type_group_depth' and exists(
          select 1 from jsonb_array_elements_text(definition.criteria->'tea_type_patterns') pattern(value)
          where lower(coalesce(history.tea_type,'')) like '%'||lower(pattern.value)||'%'
        ))
        or (criteria_kind='descriptor_category_depth' and (definition.criteria->>'descriptor_category')=any(history.descriptor_categories))
      order by history.tea_key,history.completed_at desc
    ) recent;
    related_teas:=coalesce((select jsonb_agg(item) from (select item from jsonb_array_elements(related_teas) item limit 6) limited),'[]'::jsonb);

    v_evidence:=jsonb_build_object(
      'currentlyConfirmed',qualifies,
      'contributingTeaCount',distinct_count,
      'secondaryCount',secondary_count,
      'relatedTeas',related_teas,
      'criteria',definition.criteria,
      'criteriaVersion',definition.criteria_version,
      'sourceMetricsVersion',definition.source_metrics_version,
      'calculatedAt',clock_timestamp()
    );

    select earned.id into identity_id
    from public.user_discovery_identities earned
    where earned.user_id=p_user_id and earned.identity_definition_id=definition.id;

    if qualifies then
      if identity_id is null then
        insert into public.user_discovery_identities(
          user_id,identity_definition_id,criteria_version,source_metrics_version,
          earned_event_id,evidence_summary,evidence
        ) values(
          p_user_id,definition.id,definition.criteria_version,definition.source_metrics_version,
          p_source_event_id,v_evidence_summary,v_evidence
        ) returning id into identity_id;
        newly_earned:=array_append(newly_earned,identity_id);
      else
        update public.user_discovery_identities set
          evidence_summary=v_evidence_summary,
          evidence=v_evidence,
          last_confirmed_at=clock_timestamp(),
          last_evaluated_at=clock_timestamp()
        where id=identity_id;
      end if;
    elsif identity_id is not null then
      -- Earned identity stays in the collection; corrected history only changes
      -- its transparent current-confirmation state.
      update public.user_discovery_identities set
        evidence_summary=v_evidence_summary,
        evidence=v_evidence,
        last_evaluated_at=clock_timestamp()
      where id=identity_id;
    end if;
  end loop;

  idempotency:=case when p_source_event_id is not null
    then format('event:%s:user:%s:discovery-v1',p_source_event_id,p_user_id)
    else format('profile:%s:day:%s:discovery-v1',p_user_id,current_date)
  end;
  insert into public.discovery_identity_recalculations as audit(
    user_id,source_event_id,source_metrics_version,idempotency_key,metrics,newly_earned_identity_ids
  ) values(p_user_id,p_source_event_id,'discovery-v1',idempotency,metrics,newly_earned)
  on conflict(idempotency_key) do update set
    metrics=excluded.metrics,
    newly_earned_identity_ids=case
      when cardinality(audit.newly_earned_identity_ids)>0
        then audit.newly_earned_identity_ids
      else excluded.newly_earned_identity_ids
    end,
    recalculated_at=clock_timestamp();

  return jsonb_build_object('metrics',metrics,'newIdentityIds',to_jsonb(newly_earned));
end $$;$ddl$;
    EXECUTE $ddl$CREATE OR REPLACE FUNCTION public.set_my_discovery_identity_preferences(p_identity_id uuid, p_featured boolean, p_hidden boolean) RETURNS public.user_discovery_identities
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare
  owner_id uuid:=auth.uid();
  target public.user_discovery_identities;
begin
  if owner_id is null then raise exception 'discovery_authentication_required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner_id::text,39));
  select * into target from public.user_discovery_identities
    where id=p_identity_id and user_id=owner_id for update;
  if not found then raise exception 'discovery_identity_unavailable'; end if;
  if p_featured and not p_hidden and (
    select count(*) from public.user_discovery_identities
    where user_id=owner_id and id<>p_identity_id and is_featured and hidden_at is null
  )>=2 then raise exception 'discovery_feature_limit'; end if;

  update public.user_discovery_identities set
    is_featured=case when p_hidden then false else p_featured end,
    hidden_at=case when p_hidden then coalesce(hidden_at,clock_timestamp()) else null end,
    visibility='private'
  where id=p_identity_id and user_id=owner_id
  returning * into target;
  return target;
end $$;$ddl$;
    EXECUTE $ddl$CREATE OR REPLACE FUNCTION public.set_my_discovery_reveal_preference(p_enabled boolean) RETURNS public.user_discovery_profiles
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
declare result public.user_discovery_profiles;
begin
  if auth.uid() is null then raise exception 'discovery_authentication_required'; end if;
  insert into public.user_discovery_profiles(user_id,identity_reveals_enabled)
  values(auth.uid(),p_enabled)
  on conflict(user_id) do update set identity_reveals_enabled=excluded.identity_reveals_enabled
  returning * into result;
  return result;
end $$;$ddl$;
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
      if e.phase <> 'tasting' or e.tasting_opened_flight_item_id is distinct from e.current_flight_item_id then raise exception 'illegal_phase'; end if;
      select * into next_question from public.trivia_questions
        where event_flight_item_id=e.current_flight_item_id
          and (current_question.id is null or position>current_question.position)
        order by position limit 1;
      if next_question.id is null then
        if current_question.id is null then raise exception 'trivia_missing'; end if;
        raise exception 'trivia_complete';
      end if;
      target_phase='trivia';
      e.current_trivia_question_id=next_question.id;
      e.trivia_opened_at=now();
      e.trivia_closes_at=now()+make_interval(secs=>next_question.answer_window_seconds);

    when 'close_trivia' then
      if e.phase <> 'trivia' or current_question.id is null then raise exception 'illegal_phase'; end if;
      target_phase='trivia';
      e.trivia_closes_at=now();

    when 'return_to_tasting' then
      if e.phase <> 'trivia' or not trivia_is_closed then raise exception 'trivia_open'; end if;
      target_phase='tasting';

    when 'next_tea' then
      if e.tasting_opened_flight_item_id is distinct from e.current_flight_item_id then raise exception 'tasting_not_open'; end if;
      if e.phase not in ('tasting','trivia') or not trivia_is_closed then raise exception 'trivia_open'; end if;
      if current_question.id is null or exists(
        select 1 from public.trivia_questions
        where event_flight_item_id=e.current_flight_item_id and position>current_question.position
      ) then raise exception 'trivia_incomplete'; end if;
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
      if e.phase not in ('tasting','trivia') or not trivia_is_closed then raise exception 'trivia_open'; end if;
      if current_question.id is null or exists(
        select 1 from public.trivia_questions
        where event_flight_item_id=e.current_flight_item_id and position>current_question.position
      ) then raise exception 'trivia_incomplete'; end if;
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
  f as (select * from public.event_flight_items where event_id = p_event_id),
  q as (select tq.* from public.trivia_questions tq join f on f.id = tq.event_flight_item_id)
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
  select 'trivia', exists(select 1 from f) and not exists(
    select 1 from f
    where (select count(*) from q where q.event_flight_item_id=f.id) not between 1 and 10
      or exists(
        select 1 from q
        where q.event_flight_item_id=f.id
          and (length(trim(q.question))=0 or not public.valid_trivia_options(q.options,q.correct_index))
      )
  ), 'Every tea has 1 to 10 complete trivia questions.' union all
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
    delete from public.event_flight_items fi where fi.event_id=saved_id;
  end if;

  for flight_item in select value from jsonb_array_elements(p_flight) loop
    position_no := position_no + 1;
    insert into public.event_flight_items(event_id,tea_id,position,reveal_title,reveal_description,brewing_instructions,steep_seconds,temperature_c,leaf_grams,water_ml)
    values(
      saved_id, (flight_item->>'tea_id')::uuid, position_no,
      coalesce(nullif(flight_item->>'reveal_title',''), (select name from public.teas where id=(flight_item->>'tea_id')::uuid)),
      coalesce(flight_item->>'reveal_description',''), coalesce(flight_item->>'brewing_instructions',''),
      (flight_item->>'steep_seconds')::integer, nullif(flight_item->>'temperature_c','')::numeric,
      nullif(flight_item->>'leaf_grams','')::numeric, nullif(flight_item->>'water_ml','')::integer
    ) returning id into saved_flight_id;

    trivia := flight_item->'trivia';
    if jsonb_typeof(trivia)='object' then
      trivia := jsonb_build_array(trivia);
    elsif trivia is not null and jsonb_typeof(trivia) not in ('array','null') then
      raise exception 'invalid_trivia';
    end if;
    if jsonb_typeof(trivia)='array' then
      if jsonb_array_length(trivia) > 10 then raise exception 'trivia_limit'; end if;
      trivia_position := 0;
      for trivia_item in select value from jsonb_array_elements(trivia) loop
        trivia_position := trivia_position + 1;
        insert into public.trivia_questions(event_flight_item_id,position,question,options,correct_index,explanation,answer_window_seconds)
        values(
          saved_flight_id,
          trivia_position,
          coalesce(trivia_item->>'question',''),
          coalesce(trivia_item->'options','["",""]'::jsonb),
          coalesce((trivia_item->>'correct_index')::integer,0),
          nullif(trivia_item->>'explanation',''),
          coalesce((trivia_item->>'answer_window_seconds')::integer,20)
        );
      end loop;
    end if;
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
    EXECUTE $ddl$CREATE TRIGGER breakout_members_add_discovery_member AFTER INSERT ON public.event_breakout_members FOR EACH ROW EXECUTE FUNCTION public.add_discovery_card_member();$ddl$;
    EXECUTE $ddl$CREATE TRIGGER breakout_rooms_create_discovery_card AFTER INSERT ON public.event_breakout_rooms FOR EACH ROW EXECUTE FUNCTION public.create_room_discovery_card();$ddl$;
    EXECUTE $ddl$CREATE TRIGGER breakout_rooms_lock_discovery_card AFTER UPDATE OF status ON public.event_breakout_rooms FOR EACH ROW EXECUTE FUNCTION public.lock_room_discovery_card();$ddl$;
    EXECUTE $ddl$CREATE TRIGGER breakout_sessions_create_discovery_presentation AFTER INSERT ON public.event_breakout_sessions FOR EACH ROW EXECUTE FUNCTION public.create_discovery_presentation();$ddl$;
    EXECUTE $ddl$CREATE TRIGGER events_initialize_live_rewards AFTER INSERT ON public.events FOR EACH ROW EXECUTE FUNCTION public.initialize_live_tasting_reward_settings();$ddl$;
    EXECUTE $ddl$CREATE TRIGGER tea_catalog_prices_resolve_tea BEFORE INSERT OR UPDATE OF product_name, canonical_tea_id, price_per_kilo_cents, is_active ON public.tea_catalog_prices FOR EACH ROW EXECUTE FUNCTION public.resolve_merchant_catalog_tea();$ddl$;
    EXECUTE $ddl$CREATE TRIGGER tea_catalog_prices_sync_merchant_progress AFTER INSERT OR UPDATE OF product_name, canonical_tea_id, price_per_kilo_cents, is_active ON public.tea_catalog_prices FOR EACH ROW EXECUTE FUNCTION public.sync_merchant_progress_from_catalog();$ddl$;
  end if;
end
$migration$;
COMMIT;
