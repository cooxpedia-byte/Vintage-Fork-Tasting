#!/usr/bin/env node
// Ephemeral actual PostgreSQL 17.5; no connection strings, filesystem DB or network.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const pkg=path.resolve(here,'../../../pglite-tests/pg17/node_modules/@electric-sql/pglite');
const info=JSON.parse(await readFile(path.join(pkg,'package.json'),'utf8'));
assert.equal(info.version,'0.3.16');
const {PGlite}=await import(pathToFileURL(path.join(pkg,'dist/index.js')).href);
const db=new PGlite();
const names=['apply.sql','rollback.sql','fixture.sql','seed.sql','test.mjs','manifest.json'];
const files=Object.fromEntries(await Promise.all(names.map(async n=>[n,await readFile(path.join(here,n),'utf8')])));
const plan=JSON.parse(files['manifest.json']);
const item2Apply=await readFile(path.resolve(here,'../tea-cellar-records/apply.sql'),'utf8');
const tests=[];
const mark=n=>{tests.push(n);console.log(`PASS ${tests.length}: ${n}`);};
const run=n=>db.exec(files[n]);
const q=async(s,args=[])=>(await db.query(s,args)).rows;
const val=async(s,args=[])=>(await q(s,args))[0].value;
const allNames=[...plan.retired,...plan.patched,...plan.protected];
const funcs=()=>q(`SELECT p.oid::text,p.proname,pg_get_functiondef(p.oid) AS definition,p.proowner::text,p.proacl::text FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname=ANY($1) ORDER BY p.proname`,[allNames]);
const triggers=()=>q(`SELECT t.tgname, c.relname,t.tgenabled,pg_get_triggerdef(t.oid,false) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE NOT t.tgisinternal AND c.relnamespace='public'::regnamespace ORDER BY c.relname,t.tgname`);
async function rows(tables=plan.fixtureTables){const r={};for(const t of tables)r[t]=await q(`SELECT to_jsonb(t) AS value FROM public.${t} t ORDER BY to_jsonb(t)::text`);return r;}
const state=async()=>({data:await rows(),functions:await funcs(),triggers:await triggers()});
async function error(sql,expected){let caught;try{await db.exec(sql);}catch(e){caught=e;await db.exec('ROLLBACK;');}assert(caught,'Expected '+expected);assert(String(caught.message).includes(expected),`Expected ${expected}, got ${caught.message}`);}
async function refuses(file,expected,label){const before=await state();await error(files[file],expected);assert.deepEqual(await state(),before);mark(label);}
const host='10000000-0000-0000-0000-000000000001';
const backup='10000000-0000-0000-0000-000000000002';
const event='30000000-0000-0000-0000-000000000001';
const tea1='20000000-0000-0000-0000-000000000001';
const tea2='20000000-0000-0000-0000-000000000002';
const flight1='31000000-0000-0000-0000-000000000001';
const flight2='31000000-0000-0000-0000-000000000002';
const wallet='11000000-0000-0000-0000-000000000001';
const flight=tea=>({tea_id:tea,reveal_title:'Updated synthetic title',reveal_description:'Updated synthetic reveal',brewing_instructions:'Updated brewing',steep_seconds:45,trivia:{question:'Ignored',options:['A','B'],correct_index:0}});
const payload=id=>({id,title:'Updated tasting',slug:id===event?'synthetic-tasting':'new-synthetic',invite_code:id===event?'FIXTURE-ONE':'FIXTURE-TWO',host_user_id:host,backup_host_user_id:backup,status:'draft',location_mode:'remote',starts_at:'2026-10-01T12:00:00Z',capacity:12});
async function save(id,flightItems){return await val('SELECT public.save_event_bundle($1::jsonb,$2::jsonb) AS value',[JSON.stringify(payload(id)),JSON.stringify(flightItems)]);}
let engine;
try{
 engine=(await q("SELECT current_setting('server_version') AS version,current_setting('server_version_num')::int AS version_num,version() AS build"))[0];
 assert.equal(engine.version_num,170005);console.log('ENGINE PostgreSQL '+engine.version);
 await error(files['fixture.sql'],'fixture_requires_empty_disposable_postgres17_database');mark('fixture refuses unapproved builtin database');
 await db.exec("SELECT set_config('vf.synthetic_fixture_mode','pglite-in-memory',false)");await run('fixture.sql');await run('seed.sql');
 const original=await state();
 await db.exec('CREATE TRIGGER tasting_cards_sync_merchant_progress AFTER INSERT OR UPDATE OF completed_at,canonical_tea_id,personal_tea_record_id,product_identifier_snapshot,tea_name_snapshot ON public.tasting_cards FOR EACH ROW EXECUTE FUNCTION public.sync_merchant_progress_from_card();');
 await refuses('apply.sql','retirement_requires_record_only_hooks','apply requires item 2 personal-card hook removal');
 await db.exec('CREATE TRIGGER tea_responses_sync_merchant_progress AFTER INSERT OR UPDATE OF completed_at,stamp_released_at ON public.tea_responses FOR EACH ROW EXECUTE FUNCTION public.sync_merchant_progress_from_live_stamp();');
 await db.exec(item2Apply);assert.deepEqual(await state(),original);mark('actual item 2 apply detaches both original hooks before item 3');
 await db.exec('CREATE TRIGGER renamed_live_progress AFTER INSERT ON public.tea_responses FOR EACH ROW EXECUTE FUNCTION public.sync_merchant_progress_from_live_stamp();');
 await refuses('apply.sql','retirement_requires_record_only_hooks','apply rejects renamed live progression hook');
 await refuses('rollback.sql','retirement_requires_record_only_hooks','rollback also rejects a reattached item 2 progression hook');
 await db.exec('DROP TRIGGER renamed_live_progress ON public.tea_responses;');
 await run('apply.sql');
 assert.deepEqual(await rows(),original.data);
 const nowFuncs=await funcs();
 for(const before of original.functions){const after=nowFuncs.find(f=>f.proname===before.proname);assert.equal(after.oid,before.oid);assert.equal(after.proowner,before.proowner);assert.equal(after.proacl,before.proacl);if(plan.protected.includes(before.proname))assert.deepEqual(after,before);}
 const unrelated=t=>t.filter(x=>!Object.keys(plan.triggers).includes(x.tgname)&&x.tgname!=='zz_vf_retired_write_guard');
 assert.deepEqual(unrelated(await triggers()),unrelated(original.triggers));
 mark('apply preserves every fixture row, function OID/owner/ACL and all 35 protected definitions and unrelated triggers');
 const applied=await state();await run('apply.sql');assert.deepEqual(await state(),applied);mark('repeated apply is exact no-op');
 const economy=await rows(['merchant_wallets','merchant_ledger_entries','merchant_listings']);
 let rpcCount=0;
 for(const name of plan.retired){const f=plan.functions[name];if(f.before.result==='trigger')continue;const args=f.signature.slice(f.signature.indexOf('(')+1,-1).split(',').filter(Boolean).map(x=>'NULL::'+x.trim()).join(',');await error(`SELECT * FROM public.${name}(${args})`,'feature_retired');rpcCount++;}
 assert.deepEqual(await rows(['merchant_wallets','merchant_ledger_entries','merchant_listings']),economy);mark(`all ${rpcCount} retired RPCs refuse before wallet or price mutation`);
 for(const table of plan.tables)await error(`INSERT INTO public.${table} DEFAULT VALUES`,'feature_retired');
 mark('all 25 frozen tables reject privileged direct inserts');
 for(const sql of ["UPDATE public.merchant_listings SET calculated_leaf_price=6","UPDATE public.trivia_questions SET question='Changed'","UPDATE public.trivia_answers SET selected_index=1","UPDATE public.live_tasting_reward_policies SET event_completion_leaves=9","UPDATE public.event_live_reward_settings SET reward_mode_enabled=false","UPDATE public.event_live_reward_awards SET status='processing'","UPDATE public.room_discovery_cards SET curiosity='New game prompt'","UPDATE public.room_discovery_card_items SET item_text='New item'","UPDATE public.event_discovery_presentations SET updated_by='10000000-0000-0000-0000-000000000002'"]){await error(sql,'feature_retired');}
 assert.deepEqual(await rows(['merchant_wallets','merchant_ledger_entries','merchant_listings']),economy);mark('nine populated market/trivia/reward/discovery tables reject direct action updates');
 await db.exec("UPDATE public.tea_responses SET personal_notes='Updated personal note',completed_at=now(); UPDATE public.tasting_cards SET completed_at=now(),rating=5;");
 assert.deepEqual(await rows(['merchant_wallets','merchant_ledger_entries','merchant_listings']),economy);mark('personal card completion and live note saving remain independent of prices and wallets');
 const history=await rows(['trivia_questions','trivia_answers','tea_responses']);const oldFlightIds=await q('SELECT id FROM public.event_flight_items WHERE event_id=$1 ORDER BY position',[event]);
 await save(event,[flight(tea1),flight(tea2)]);
 assert.deepEqual(await rows(['trivia_questions','trivia_answers','tea_responses']),history);assert.deepEqual(await q('SELECT id FROM public.event_flight_items WHERE event_id=$1 ORDER BY position',[event]),oldFlightIds);mark('historical flight detail edit retains IDs/notes/questions/answers and ignores game payload');
 const historicalState=await state();let histError;try{await save(event,[flight(tea2),flight(tea1)]);}catch(e){histError=e;}assert(String(histError?.message).includes('event_flight_history_preserved'));assert.deepEqual(await state(),historicalState);mark('historical flight structural edit refuses atomically');
 const newEvent=await save(null,[flight(tea1)]);await save(newEvent,[flight(tea2),flight(tea1)]);await save(newEvent,[flight(tea1)]);
 assert.equal(await val('SELECT count(*)::int AS value FROM public.event_flight_items WHERE event_id=$1',[newEvent]),1);assert.equal(await val('SELECT count(*)::int AS value FROM public.trivia_questions'),1);assert.equal(await val('SELECT count(*)::int AS value FROM public.event_live_reward_settings WHERE event_id=$1',[newEvent]),0);mark('new empty draft supports save/append/reorder/remove without new trivia or reward settings');
 const readiness=await q('SELECT * FROM public.event_readiness($1)',[event]);assert(readiness.every(x=>x.key!=='trivia'&&x.met));mark('event readiness retains all non-game requirements');
 await db.exec(`UPDATE public.events SET status='scheduled' WHERE id='${event}'`);
 await db.exec(`SELECT public.apply_event_command('${event}','open_session',0,'50000000-0000-0000-0000-000000000001')`);
 await error(`SELECT public.apply_event_command('${event}','open_trivia',1,'50000000-0000-0000-0000-000000000001')`,'feature_retired');
 await error(`SELECT public.apply_event_command('${event}','close_trivia',1,'50000000-0000-0000-0000-000000000001')`,'feature_retired');mark('scheduled session starts without trivia; both legacy trivia commands are denied');
 await db.exec(`UPDATE public.events SET phase='tasting',tasting_opened_flight_item_id=current_flight_item_id WHERE id='${event}';SELECT public.apply_event_command('${event}','next_tea',1,'50000000-0000-0000-0000-000000000001')`);
 assert.equal(await val('SELECT current_flight_item_id::text AS value FROM public.events WHERE id=$1',[event]),flight2);assert(await val('SELECT stamp_released_at IS NOT NULL AS value FROM public.tea_responses WHERE event_flight_item_id=$1',[flight1]));
 await db.exec(`UPDATE public.events SET phase='trivia',trivia_closes_at=now()+interval '1 day',tasting_opened_flight_item_id=current_flight_item_id WHERE id='${event}';SELECT public.apply_event_command('${event}','return_to_tasting',2,'50000000-0000-0000-0000-000000000001');SELECT public.apply_event_command('${event}','start_recap',3,'50000000-0000-0000-0000-000000000001')`);
 assert.equal(await val('SELECT phase::text AS value FROM public.events WHERE id=$1',[event]),'recap');assert.deepEqual(await rows(['merchant_wallets','merchant_ledger_entries','merchant_listings']),economy);mark('next tea, legacy trivia exit and recap work without game prerequisites; stamps still release without rewards');
 const discoveries=await rows(['room_discovery_cards','event_discovery_presentations']);
 await db.exec(`INSERT INTO public.event_breakout_rooms(session_id,event_id,room_number,prompt) VALUES('60000000-0000-0000-0000-000000000001','${event}',2,'New plain breakout');UPDATE public.event_breakout_rooms SET status='closed';`);
 assert.deepEqual(await rows(['room_discovery_cards','event_discovery_presentations']),discoveries);mark('plain breakout room creation/closure remains usable without new game records');
 await db.exec("DELETE FROM public.participants WHERE id='40000000-0000-0000-0000-000000000001'");
 const card=(await q('SELECT * FROM public.room_discovery_cards'))[0];assert.deepEqual(card.participant_ids,[]);assert.equal(card.room_quote,null);assert.equal(card.room_quote_attributed,false);assert.equal(card.spokesperson_participant_id,null);assert.equal(card.spokesperson_state,'none');assert.equal(await val('SELECT participant_id IS NULL AS value FROM public.event_live_reward_awards'),true);assert.equal(await val('SELECT count(*)::int AS value FROM public.room_discovery_card_items'),0);mark('real participant erasure trigger and FK SET NULL/CASCADE paths remain functional');
 await error("UPDATE public.room_discovery_cards SET participant_ids=ARRAY['40000000-0000-0000-0000-000000000001'::uuid]",'feature_retired');
 await error("UPDATE public.event_live_reward_awards SET participant_id='40000000-0000-0000-0000-000000000001'",'feature_retired');
 await error("UPDATE public.room_discovery_cards SET room_quote='new quote',spokesperson_state='accepted'",'feature_retired');mark('privacy exceptions cannot re-add participants or restore game content/state');
 await db.exec("DELETE FROM public.teas WHERE id='20000000-0000-0000-0000-000000000003'");assert.equal(await val("SELECT canonical_tea_id IS NULL AS value FROM public.tea_catalog_prices WHERE product_id='fixture-product'"),true);mark('catalogue tea FK null cleanup succeeds with resolver detached');
 await db.exec(`SELECT public.ensure_current_customer();SELECT public.post_gold_leaves_entry('${wallet}','woocommerce_earn',10,'fixture','order-one','fixture-order-earn');SELECT public.post_gold_leaves_entry('${wallet}','woocommerce_redeem',-4,'fixture','order-one','fixture-order-redeem');SELECT public.post_gold_leaves_entry('${wallet}','woocommerce_redeem',-4,'fixture','order-one','fixture-order-redeem');`);
 assert.equal(await val('SELECT balance::int AS value FROM public.merchant_wallets WHERE id=$1',[wallet]),1240);assert.equal(await val('SELECT count(*)::int AS value FROM public.merchant_ledger_entries'),3);mark('unchanged generic checkout earn/redeem and retry idempotency remain operational');
 const beforeRollback=await rows();await run('rollback.sql');assert.deepEqual(await rows(),beforeRollback);assert.deepEqual(await funcs(),original.functions);assert.deepEqual(await triggers(),original.triggers);mark('explicit rollback restores exact original functions/ACLs and seven hooks without data rewrite or item 2 reversal');
 const rolled=await state();await run('rollback.sql');assert.deepEqual(await state(),rolled);mark('repeated rollback is exact no-op');
 await db.exec("INSERT INTO public.trivia_questions(event_flight_item_id,question,options,correct_index,position) VALUES('31000000-0000-0000-0000-000000000002','Positive control','[\"A\",\"B\"]',0,1)");mark('positive control: retired-table writes resume only after explicit rollback');
 await db.exec("ALTER FUNCTION public.get_merchant_market() IMMUTABLE");await refuses('apply.sql','retirement_function_drift','function metadata drift refuses atomically');await db.exec('ALTER FUNCTION public.get_merchant_market() STABLE');
 await db.exec("ALTER FUNCTION public.ensure_current_customer() STABLE");await refuses('apply.sql','retirement_protected_function_drift','newer protected checkout function requires rereview before apply');await db.exec('ALTER FUNCTION public.ensure_current_customer() VOLATILE');
 await db.exec('ALTER TABLE public.events DISABLE TRIGGER events_initialize_live_rewards');await refuses('apply.sql','retirement_trigger_drift','disabled old attachment refuses atomically');await db.exec('ALTER TABLE public.events ENABLE TRIGGER events_initialize_live_rewards');
 await db.exec('CREATE TRIGGER renamed_discovery AFTER INSERT ON public.event_breakout_rooms FOR EACH ROW EXECUTE FUNCTION public.create_room_discovery_card()');await refuses('apply.sql','retirement_unexpected_attachment','unexpected duplicate attachment refuses atomically');await db.exec('DROP TRIGGER renamed_discovery ON public.event_breakout_rooms');
 await db.exec(plan.functions.get_merchant_market.replacement);await refuses('apply.sql','retirement_partial_state','partial function retirement refuses atomically');await db.exec(plan.functions.get_merchant_market.original.replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION'));
 await run('apply.sql');await db.exec('ALTER TABLE public.trivia_answers DISABLE TRIGGER zz_vf_retired_write_guard');await refuses('apply.sql','retirement_guard_attachment_drift','disabled freeze guard rejects repeated apply');await refuses('rollback.sql','retirement_guard_attachment_drift','disabled freeze guard rejects rollback atomically');await db.exec('ALTER TABLE public.trivia_answers ENABLE TRIGGER zz_vf_retired_write_guard');
 await db.exec("ALTER FUNCTION public.ensure_current_customer() STABLE");await run('rollback.sql');assert.equal((await q("SELECT provolatile FROM pg_proc WHERE oid='public.ensure_current_customer()'::regprocedure"))[0].provolatile,'s');mark('rollback does not overwrite or depend on an unrelated protected-function hotfix');
 const receipt={status:'passed',testCount:tests.length,tests,engine,package:{name:info.name,version:info.version},productionSqlApplied:false,execution:'isolated in-memory PGlite PostgreSQL 17; synthetic rows and selected exact archived function bodies',sourceSha256:Object.fromEntries(names.map(n=>[n,createHash('sha256').update(files[n]).digest('hex')])),item2ApplySha256:createHash('sha256').update(item2Apply).digest('hex'),protectedDefinitionMetadata:plan.protectedMetadata,limits:['No native multi-session concurrency/lock test.','Selected schema fixture, not full restored-database rehearsal.','Store bridge reserve/settle/release/connect signatures are hash-preserved; end-to-end store acceptance belongs to item 4.'],completedAt:new Date().toISOString()};
 await writeFile(path.join(here,'test-result-pglite.json'),JSON.stringify(receipt,null,2)+'\n');console.log('COMPLETE '+tests.length+' cases');
}catch(e){console.error('FAILED: '+e.message);if(e.where)console.error(e.where);process.exitCode=1;}finally{await db.close();}
