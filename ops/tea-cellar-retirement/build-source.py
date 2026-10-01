"""Offline schema-only extraction for the unpublished retirement candidate.
Never extracts table rows, owners, ACLs, or environment configuration.
"""
from pathlib import Path
import subprocess, re, json, hashlib
HERE=Path(__file__).resolve().parent
ARCHIVE=Path('/Users/salarmelli/Documents/Codex/Vintage Fork Private Backups/retirement-2026-10-01-DiOtjP/umrqyhqezzuqdrhaywyv/database.dump')
s=subprocess.check_output(['/opt/homebrew/opt/postgresql@17/bin/pg_restore','--schema-only','--file=-',str(ARCHIVE)],text=True)
sections={}
for p in s.split('--\n-- Name: ')[1:]:
 h,body=p.split('\n',1)
 name,kind,schema,*_=h.split('; ')
 if schema=='Schema: public': sections[(kind.removeprefix('Type: '),name)]=body
functions={n.split('(')[0]:(n,re.search(r'CREATE FUNCTION .*?AS (\$[a-zA-Z_0-9]*\$).*?\1;',b,re.S).group()) for (k,n),b in sections.items() if k=='FUNCTION' and re.search(r'AS \$[a-zA-Z_0-9]*\$',b)}
retired='''claim_live_tasting_shield get_merchant_market get_my_merchant_cards publish_merchant_listing purchase_study_copy record_verified_tasting refresh_merchant_card_progress refresh_my_merchant_cards set_marketplace_reaction set_merchant_listing_status sync_merchant_progress_from_card sync_merchant_progress_from_catalog sync_merchant_progress_from_live_stamp add_discovery_card_member apply_discovery_presentation_command apply_live_tasting_reward_command apply_living_tasting_map_command authoritative_discovery_history create_discovery_presentation create_room_discovery_card discovery_metrics_for_user event_discovery_board initialize_live_tasting_reward_settings lock_room_discovery_card process_live_tasting_rewards queue_live_tasting_completion_rewards recalculate_discovery_identities set_my_discovery_identity_preferences set_my_discovery_reveal_preference'''.split()
patched=['apply_event_command','event_readiness','save_event_bundle']
protected='''post_gold_leaves_entry ensure_current_customer get_my_loyalty_summary get_mobile_loyalty_summary get_wordpress_loyalty_summary register_mobile_customer register_wordpress_customer apply_woocommerce_loyalty_refund award_woocommerce_order_gold_leaves reserve_woocommerce_gold_leaves complete_tasting_session save_solo_tasting_session save_solo_tasting_session_v2 delete_tasting_session set_personal_tea_record_archived set_tasting_session_archived scrub_deleted_participant_live_content release_late_tasting_stamp_after_host_progress release_tasting_stamps_on_host_progress can_manage_event is_staff touch_updated_at resolve_merchant_catalog_tea guard_active_breakout_transition validate_tea_response_scope'''.split()
protected += [n for n in functions if n.startswith('gold_leaves_')]
protected=list(dict.fromkeys(protected))
missing=set(retired+patched+protected)-functions.keys()
assert not missing,missing
originals={n:functions[n][1] for n in retired+patched}
modified={}
for n in retired:
 d=originals[n]; h=d.split('AS $$',1)[0].replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION',1)
 h=re.sub(r'LANGUAGE sql\b','LANGUAGE plpgsql',h)
 modified[n]=h+"AS $$\nbegin\n  raise exception 'feature_retired' using errcode='55000', detail='Trading, progression and game rewards are retired. Personal tasting records and checkout loyalty remain available.';\nend\n$$;"
d=originals['apply_event_command']
d=re.sub(r"    when 'open_trivia' then.*?(?=    when 'return_to_tasting')", "    when 'open_trivia' then\n      raise exception 'feature_retired' using errcode='55000';\n\n    when 'close_trivia' then\n      raise exception 'feature_retired' using errcode='55000';\n\n", d, flags=re.S)
d=d.replace("if e.phase <> 'trivia' or not trivia_is_closed then raise exception 'trivia_open'; end if;", "if e.phase <> 'trivia' then raise exception 'illegal_phase'; end if;")
d=d.replace("if e.phase not in ('tasting','trivia') or not trivia_is_closed then raise exception 'trivia_open'; end if;", "if e.phase not in ('tasting','trivia') then raise exception 'illegal_phase'; end if;")
d=re.sub(r"      if current_question.id is null or exists\(\n        select 1 from public.trivia_questions.*?then raise exception 'trivia_incomplete'; end if;\n",'',d,flags=re.S)
assert 'trivia_incomplete' not in d and 'not trivia_is_closed' not in d
modified['apply_event_command']=d.replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION',1)
d=originals['event_readiness']
d=d.replace("f as (select * from public.event_flight_items where event_id = p_event_id),\n  q as (select tq.* from public.trivia_questions tq join f on f.id = tq.event_flight_item_id)", "f as (select * from public.event_flight_items where event_id = p_event_id)")
d=re.sub(r"  select 'trivia'.*?union all\n",'',d,flags=re.S)
assert 'trivia' not in d
modified['event_readiness']=d.replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION',1)
d=originals['save_event_bundle']
d=d.replace('  trivia_position integer;', '  trivia_position integer;\n  preserve_flight boolean := false;\n  existing_flight public.event_flight_items;')
# Serialize editor operations and existing flight rows before checking every archived child FK.
d=d.replace("    if not public.can_manage_event(v_event_id,auth.uid())", "    perform 1 from public.events where id=v_event_id for update;\n    if not public.can_manage_event(v_event_id,auth.uid())")
d=d.replace('    delete from public.event_flight_items fi where fi.event_id=saved_id;', '''    perform 1 from public.event_flight_items where event_id=saved_id for update;
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
    if not preserve_flight then delete from public.event_flight_items where event_id=saved_id; end if;''')
d=d.replace('    insert into public.event_flight_items(event_id,tea_id,position,reveal_title,reveal_description,brewing_instructions,steep_seconds,temperature_c,leaf_grams,water_ml)', '''    if preserve_flight then
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
    insert into public.event_flight_items(event_id,tea_id,position,reveal_title,reveal_description,brewing_instructions,steep_seconds,temperature_c,leaf_grams,water_ml)''')
d=re.sub(r"    trivia := flight_item->'trivia';.*?\n  end loop;", "    end if; -- Existing flight identities are retained; new trivia payload is ignored.\n  end loop;",d,flags=re.S)
assert 'if not preserve_flight then delete from public.event_flight_items' in d and 'insert into public.trivia_questions' not in d
modified['save_event_bundle']=d.replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION',1)
tables='''merchant_card_progress merchant_tasting_verifications merchant_listings merchant_study_copies merchant_transactions merchant_reactions tea_catalog_prices trivia_questions trivia_answers discovery_identity_definitions discovery_identity_recalculations user_discovery_identities user_discovery_profiles room_discovery_cards room_discovery_card_items event_discovery_presentations living_tasting_map_sessions living_tasting_map_observation_events living_tasting_map_snapshots living_tasting_map_fingerprints living_tasting_map_moderation_actions live_tasting_reward_policies event_live_reward_settings event_live_reward_completion_overrides event_live_reward_awards'''.split()
detached='''tea_catalog_prices_resolve_tea tea_catalog_prices_sync_merchant_progress events_initialize_live_rewards breakout_members_add_discovery_member breakout_rooms_create_discovery_card breakout_rooms_lock_discovery_card breakout_sessions_create_discovery_presentation'''.split()
triggerdefs={n:re.search(r'CREATE TRIGGER .*?;',b,re.S).group() for (k,name),b in sections.items() if k=='TRIGGER' for n in detached if name.endswith(' '+n)}
assert len(triggerdefs)==len(detached)
nulling={'merchant_card_progress':['canonical_tea_id'],'merchant_listings':['canonical_tea_id'],'tea_catalog_prices':['canonical_tea_id'],'discovery_identity_recalculations':['source_event_id'],'user_discovery_identities':['earned_event_id'],'event_discovery_presentations':['surfaced_curiosity_card_id','updated_by'],'event_live_reward_awards':['participant_id'],'living_tasting_map_sessions':['created_by'],'room_discovery_card_items':['attribution_participant_id','created_by','removed_by'],'room_discovery_cards':['room_quote_participant_id','spokesperson_participant_id']}
# The fixture imports selected schema objects only. No rows, role grants, connection details, or auth implementation.
fixturetables=set(tables+'''events profiles participants teas event_flight_items host_control_leases event_state_log participant_tokens event_breakout_members event_breakout_rooms event_breakout_sessions merchant_wallets merchant_ledger_entries tasting_cards tea_responses personal_tea_records tasting_card_photos event_reactions event_chat_messages flavor_descriptors tasting_card_descriptors tea_response_revisions event_brews event_cheers_sessions event_conversation_prompts event_group_reveals event_stage_signals reveal_sync_samples'''.split())
for n in retired+patched+protected:
 header=functions[n][1].split('AS $$',1)[0]
 fixturetables.update(re.findall(r'RETURNS public\.([a-z_]+)',header))
# Most store RPCs return jsonb; referenced tables are needed only when actually exercised in future full rehearsal.
alltables={n:re.search(r'CREATE TABLE .*?\n\);',b,re.S).group() for (k,n),b in sections.items() if k=='TABLE'}
fixturetables={n for n in fixturetables if n in alltables}
fntext='\n\n'.join(functions[n][1] for n in retired+patched+protected+['valid_trivia_options'])
for pattern in [r'eyJ[A-Za-z0-9_-]{20,}',r'(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]+',r'postgres(?:ql)?://',r'https?://[^\s\x27\x22]+',r'-----BEGIN [A-Z ]*PRIVATE KEY']:
 assert not re.search(pattern,fntext), 'Credential/URL-like literal needs manual review before export'
# UUIDs are generally policy constants; require none rather than checking in unexplained identifiers.
assert not re.search(r"'[0-9a-f]{8}-[0-9a-f-]{27,}'",fntext,re.I), 'UUID literal needs review'
fixture='''-- Synthetic, schema-only PostgreSQL 17 fixture. Never run in an existing database.
DO $$ BEGIN
 IF current_setting('server_version_num')::int/10000<>17
 OR current_database()<>'template1'
 OR coalesce(current_setting('vf.synthetic_fixture_mode',true),'')<>'pglite-in-memory'
 OR version() NOT LIKE '%compiled by emcc (Emscripten%'
 OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public')
 THEN RAISE EXCEPTION 'fixture_requires_empty_disposable_postgres17_database'; END IF;
END $$;
SET check_function_bodies=off;
CREATE SCHEMA auth;
CREATE SCHEMA extensions;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '10000000-0000-0000-0000-000000000001'::uuid $$;
CREATE FUNCTION extensions.gen_random_bytes(n integer) RETURNS bytea LANGUAGE sql AS $$ SELECT decode(repeat('aa',n),'hex') $$;
'''
for (k,n),b in sections.items():
 if k=='TYPE':
  m=re.search(r'CREATE TYPE .*?\);',b,re.S)
  if m: fixture+=m.group()+'\n'
for n in sorted(fixturetables): fixture+=alltables[n]+'\n'
fixture+=fntext+'\n'
fixture+='\n'.join(triggerdefs.values())+'\n'
# Preserve touch/privacy/record/stamp attachments in the fixture to exercise real retained functions.
fixturetriggers=[]
for (k,n),b in sections.items():
 if k=='TRIGGER' and n.split()[0] in fixturetables and n.split()[-1] in ['participants_scrub_live_content','tasting_cards_touch','responses_touch','tea_response_scope','tea_responses_release_late_stamp','events_release_tasting_stamps','user_discovery_identities_touch','user_discovery_profiles_touch','discovery_identity_definitions_touch']:
  fixturetriggers.append(re.search(r'CREATE TRIGGER .*?;',b,re.S).group())
fixture+='\n'.join(fixturetriggers)+'\n'
# Actual PK/UNIQUE + selected FK constraints make privacy cascade tests meaningful.
for (k,n),b in sections.items():
 if k=='CONSTRAINT' and n.split()[0] in fixturetables:
  m=re.search(r'ALTER TABLE ONLY .*?;',b,re.S)
  if m: fixture+=m.group()+'\n'
for (k,n),b in sections.items():
 if k=='FK CONSTRAINT' and n.split()[0] in fixturetables:
  m=re.search(r'ALTER TABLE ONLY .*?;',b,re.S)
  if m and (ref:=re.search(r'REFERENCES public\.([a-z_]+)',m.group())) and ref.group(1) in fixturetables: fixture+=m.group()+'\n'
fixture+='SET check_function_bodies=on;\n'
plan={'retired':retired,'patched':patched,'protected':protected,'tables':tables,'triggers':triggerdefs,'nulling':nulling,'functions':{n:{'signature':'public.'+functions[n][0],'original':originals[n], 'replacement':modified[n]} for n in retired+patched},'fixtureTables':sorted(fixturetables)}
(HERE/'plan.json').write_text(json.dumps(plan,indent=2)+'\n')
(HERE/'fixture.sql').write_text(fixture)
print(json.dumps({'retired_functions':len(retired),'patched_functions':len(patched),'protected_functions':len(protected),'blocked_tables':len(tables),'detached_triggers':len(detached),'fixture_tables':len(fixturetables),'schema_function_literal_scan':'passed: no URL, credential prefix or UUID literals'}))
