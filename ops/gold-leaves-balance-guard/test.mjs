// Offline, restored PostgreSQL acceptance. No production IO, credentials or payment operations.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,chmod} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRestoredDatabase} from '../../../balance-guard/restore-loader.mjs';
import {runCheckoutCases} from './test-checkout-cases.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const privateDir=path.resolve(here,'../../../balance-guard/private');
const apply=await readFile(path.join(here,'apply.sql'),'utf8');
const atomicApply=await readFile(path.resolve(here,'../../../balance-guard/atomic-apply.sql'),'utf8');
const rollback=await readFile(path.join(here,'rollback.sql'),'utf8');
const retirement=await readFile(path.join(here,'../tea-cellar-retirement/apply.sql'),'utf8');
const records=await readFile(path.join(here,'../tea-cellar-records/apply.sql'),'utf8');
const uid=n=>`c6000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const hash=x=>createHash('sha256').update(x).digest('hex');
const ident=x=>'"'+x.replaceAll('"','""')+'"';
const tests=[],observations={};const mark=name=>{tests.push(name);console.log('PASS '+tests.length+': '+name);};
let db,metadata;
const fetchOriginal=globalThis.fetch;
globalThis.fetch=()=>{throw new Error('acceptance_network_forbidden');};

async function restore(){
 const restored=await createRestoredDatabase();db=restored.db;metadata=restored.metadata;
 const database=(await db.query('SELECT current_database() AS name')).rows[0].name;
 await db.exec('ALTER DATABASE '+ident(database)+' OWNER TO postgres; SET ROLE postgres');
 await db.exec(records);await db.exec(retirement);
 return db;
}
const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
const first=async(sql,args=[])=>(await q(sql,args))[0];
const value=async(sql,args=[])=>(await first(sql,args)).value;
async function rpc(sql,args=[]){
 const role=await value('SELECT current_user AS value');
 await db.exec('SET LOCAL ROLE service_role');
 assert.equal(await value('SELECT current_user AS value'),'service_role');
 const result=await q(sql,args);
 await db.exec('SET LOCAL ROLE '+ident(role));return result;
}
async function expectedError(action,code){
 await db.exec('SAVEPOINT expected_refusal');let caught;
 try{await action();}catch(error){caught=error;}
 await db.exec('ROLLBACK TO SAVEPOINT expected_refusal; RELEASE SAVEPOINT expected_refusal');
 assert(caught,'Expected refusal');if(code)assert.equal(caught.code,code);return caught;
}
async function tableSnapshot(){
 const tables=await q("SELECT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','auth','storage') AND c.relkind IN ('r','p') ORDER BY n.nspname,c.relname");
 const out={};for(const t of tables){const name=t.nspname+'.'+t.relname;const row=t.nspname==='public'&&t.relname==='merchant_wallets'?"to_jsonb(t)-'refund_debt'":"to_jsonb(t)";out[name]=await first(`SELECT count(*)::text AS rows,md5(coalesce(string_agg((${row})::text,E'\n' ORDER BY (${row})::text),'')) AS digest FROM ${ident(t.nspname)}.${ident(t.relname)} t`);}
 return out;
}
async function functionState(){return q("SELECT p.proname,p.oid::text,pg_get_userbyid(p.proowner) AS owner,p.proacl::text AS acl,md5(pg_get_functiondef(p.oid)) AS definition FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.prokind IN ('f','p') ORDER BY p.proname,p.oid");}
async function state(wallet){
 const row=await first('SELECT balance::text AS balance,refund_debt::text AS debt,(balance-refund_debt)::text AS net FROM public.merchant_wallets WHERE id=$1',[wallet]);
 const ledger=await value('SELECT coalesce(sum(leaves_delta),0)::text AS value FROM public.merchant_ledger_entries WHERE wallet_id=$1',[wallet]);
 assert.equal(row.net,ledger,'Wallet economic net must reconcile to its signed journal');
 assert(BigInt(row.balance)>=0n&&BigInt(row.debt)>=0n);assert(row.balance==='0'||row.debt==='0');
 return Object.fromEntries(Object.entries(row).map(([k,v])=>[k,Number(v)]));
}
const count=wallet=>value('SELECT count(*)::int AS value FROM public.merchant_ledger_entries WHERE wallet_id=$1',[wallet]);
const journal=wallet=>q('SELECT id,leaves_delta::text,balance_after::text,source,source_reference,idempotency_key FROM public.merchant_ledger_entries WHERE wallet_id=$1 ORDER BY id',[wallet]);
async function post(wallet,delta,key,type='adjustment',allow=false){return (await rpc("SELECT public.post_gold_leaves_entry($1,$2,$3::bigint,'vf_balance_guard_acceptance',$4,$4,'Synthetic acceptance','{}'::jsonb,$5) AS value",[wallet,type,String(delta),key,allow]))[0].value;}
async function account(n,opening=0){
 const owner=uid(n),wallet=uid(n+100),profile=uid(n+200);
 await q('INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data) VALUES($1,$2,now(),$3::jsonb)',[owner,`balance-guard-${n}@example.invalid`,JSON.stringify({display_name:'Synthetic balance guard acceptance'})]);
 await q('INSERT INTO public.merchant_wallets(id,owner_user_id) VALUES($1,$2)',[wallet,owner]);
 if(opening)await post(wallet,opening,'opening-'+n);
 await rpc('SELECT public.gold_leaves_connect_store_v1($1,$2)',[profile,owner]);return {owner,wallet,profile};
}
const reserve=(a,id,cents,leaves)=>rpc('SELECT public.gold_leaves_reserve_store_v1($1,$2,$3::bigint,$4::bigint)',[a.profile,id,cents,leaves]);
const settle=(attempt,order)=>rpc('SELECT public.gold_leaves_settle_store_v1($1,$2)',[attempt,order]);
const refund=(order,cents)=>rpc('SELECT public.gold_leaves_refund_store_v1($1,$2::bigint) AS value',[order,cents]).then(r=>r[0].value);
const release=attempt=>rpc('SELECT public.gold_leaves_release_store_v1($1)',[attempt]);

try{
 await restore();
 const original=await tableSnapshot(),originalFunctions=await functionState();
 const originalAudit=await value('SELECT public.gold_leaves_migration_audit_v1() AS value');
 await db.exec(atomicApply);
 assert.deepEqual(await tableSnapshot(),original);
 assert.equal(await value('SELECT count(*)::int AS value FROM public.merchant_wallets WHERE refund_debt<>0'),0);
 const afterFunctions=await functionState();
 assert.equal(afterFunctions.length,originalFunctions.length);
 for(const before of originalFunctions){const after=afterFunctions.find(f=>f.oid===before.oid);assert(after);assert.equal(after.owner,before.owner);assert.equal(after.acl,before.acl);if(!['post_gold_leaves_entry','gold_leaves_migration_audit_v1'].includes(before.proname))assert.deepEqual(after,before);}
 const schema=await first("SELECT format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull AS not_null,pg_get_expr(d.adbin,d.adrelid) AS default_value FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='public.merchant_wallets'::regclass AND a.attname='refund_debt'");
 assert.deepEqual(schema,{type:'bigint',not_null:true,default_value:'0'});
 mark('apply preserves every historical row/ledger entry and function identity/ACL while adding zero-default bigint debt');
 await db.exec(apply);assert.deepEqual(await tableSnapshot(),original);assert.deepEqual(await functionState(),afterFunctions);
 mark('repeat apply is idempotent');

 await db.exec('BEGIN');
 const a=await account(1,500);
 assert.deepEqual(await state(a.wallet),{balance:500,debt:0,net:500});
 for(const assignments of ['balance=-1','refund_debt=-1','balance=1,refund_debt=1'])await expectedError(()=>q(`UPDATE public.merchant_wallets SET ${assignments} WHERE id=$1`,[a.wallet]),'23514');
 await expectedError(()=>q('UPDATE public.merchant_wallets SET refund_debt=NULL WHERE id=$1',[a.wallet]),'23502');
 assert.deepEqual(await state(a.wallet),{balance:500,debt:0,net:500});
 mark('database constraints reject negative spendable balance, negative debt, overlapping funds/debt and null debt');
 const earned=uid(1001),spent=uid(1002),order=uid(2001);
 await reserve(a,earned,10000,0);await settle(earned,order);await reserve(a,spent,1000,590);
 assert.deepEqual(await state(a.wallet),{balance:10,debt:0,net:10});
 assert.deepEqual(await refund(order,10000),{earnedReversed:100,redeemedRestored:0});
 assert.deepEqual(await state(a.wallet),{balance:0,debt:90,net:-90});
 assert((await journal(a.wallet)).some(r=>r.leaves_delta==='-100'&&r.balance_after==='-90'));
 const audit=(await rpc('SELECT public.gold_leaves_migration_audit_v1() AS value'))[0].value;
 const totals=await first('SELECT coalesce(sum(balance-refund_debt),0)::text AS net,coalesce(sum(balance),0)::text AS spendable,coalesce(sum(refund_debt),0)::text AS debt FROM public.merchant_wallets');
 assert.equal(String(audit.currentWalletBalanceTotal),totals.net);assert.equal(String(audit.currentWalletSpendableTotal),totals.spendable);assert.equal(String(audit.currentWalletRefundDebtTotal),totals.debt);
 assert.equal(audit.changedOriginalBalances,originalAudit.changedOriginalBalances);assert.equal(audit.missingOriginalWallets,originalAudit.missingOriginalWallets);assert.equal(audit.changedOriginalOwners,originalAudit.changedOriginalOwners);
 observations.debtAudit={net:totals.net,spendable:totals.spendable,debt:totals.debt};
 mark('migration audit reports economic net, spendable and refund-debt totals without false historical-balance drift');
 const afterRefund=await journal(a.wallet);await refund(order,10000);assert.deepEqual(await journal(a.wallet),afterRefund);
 await expectedError(()=>reserve(a,uid(1003),100,1),'22003');
 await expectedError(()=>post(a.wallet,-1,'ordinary-debit-while-debt'),'22003');
 await expectedError(()=>post(a.wallet,-1,'null-allow-debit-while-debt','adjustment',null),'22003');
 assert.deepEqual(await state(a.wallet),{balance:0,debt:90,net:-90});
 mark('spent-earn refund records debt90 with spendable0 and signed journal net; retry is exact and ordinary spending rejects');
 await post(a.wallet,20,'partial-credit-20');assert.deepEqual(await state(a.wallet),{balance:0,debt:70,net:-70});
 await reserve(a,uid(1004),5000,0);await settle(uid(1004),uid(2004));assert.deepEqual(await state(a.wallet),{balance:0,debt:20,net:-20});
 await post(a.wallet,20,'clear-debt-20');assert.deepEqual(await state(a.wallet),{balance:0,debt:0,net:0});
 await post(a.wallet,5,'new-available-5');await reserve(a,uid(1005),100,1);assert.deepEqual(await state(a.wallet),{balance:4,debt:0,net:4});
 await release(spent);assert.deepEqual(await state(a.wallet),{balance:594,debt:0,net:594});
 const countRelease=await count(a.wallet);await release(spent);assert.equal(await count(a.wallet),countRelease);
 mark('partial credits, purchase earning and reservation releases repay debt before creating spendable Leaves');
 await db.exec('ROLLBACK');assert.deepEqual(await tableSnapshot(),original);

 await db.exec('BEGIN');
 const b=await account(2,1000),bo=uid(2020),ba=uid(1020),bs=uid(1021);
 await reserve(b,ba,10000,10);await settle(ba,bo);await reserve(b,bs,2000,1090);assert.deepEqual(await state(b.wallet),{balance:0,debt:0,net:0});
 assert.deepEqual(await refund(bo,5000),{earnedReversed:50,redeemedRestored:5});assert.deepEqual(await state(b.wallet),{balance:0,debt:45,net:-45});
 const partial=await journal(b.wallet);await refund(bo,5000);assert.deepEqual(await journal(b.wallet),partial);
 await expectedError(()=>refund(bo,4999),'P0001');await expectedError(()=>refund(bo,10001),'P0001');
 assert.deepEqual(await refund(bo,10000),{earnedReversed:100,redeemedRestored:10});assert.deepEqual(await state(b.wallet),{balance:0,debt:90,net:-90});
 const full=await journal(b.wallet);await refund(bo,10000);assert.deepEqual(await journal(b.wallet),full);
 await release(bs);assert.deepEqual(await state(b.wallet),{balance:1000,debt:0,net:1000});
 mark('partial/full refunds combine earned reversals and redemption credits without losing debt; retries and stale/excess refunds are safe');
 await db.exec('ROLLBACK');assert.deepEqual(await tableSnapshot(),original);

 await db.exec('BEGIN');
 const w=await account(3,1000),wp=960000003;
 await rpc('SELECT public.register_wordpress_customer($1::bigint,$2,$3)',[wp,w.owner,'synthetic-wordpress@example.invalid']);
 await rpc('SELECT * FROM public.reserve_woocommerce_gold_leaves($1::bigint,$2,$3::bigint,$4::bigint,$5)',[wp,'balance-guard-wp-order',10000,10,'balance-guard-wp-reserve']);
 await rpc('SELECT * FROM public.award_woocommerce_order_gold_leaves($1::bigint,$2,$3::bigint,$4)',[wp,'balance-guard-wp-order',10000,'balance-guard-wp-earn']);
 await rpc('SELECT * FROM public.reserve_woocommerce_gold_leaves($1::bigint,$2,$3::bigint,$4::bigint,$5)',[wp,'balance-guard-wp-spend',2000,1090,'balance-guard-wp-spend-key']);
 let wpResult=await rpc('SELECT * FROM public.apply_woocommerce_loyalty_refund($1,$2,$3::bigint,$4)', ['balance-guard-wp-order','synthetic-partial-refund',5000,'balance-guard-wp-refund-partial']);
 assert.equal(Number(wpResult[0].current_balance),0);assert.deepEqual(await state(w.wallet),{balance:0,debt:45,net:-45});
 const wpPartial=await journal(w.wallet);await rpc('SELECT * FROM public.apply_woocommerce_loyalty_refund($1,$2,$3::bigint,$4)', ['balance-guard-wp-order','synthetic-partial-refund',5000,'balance-guard-wp-refund-partial']);assert.deepEqual(await journal(w.wallet),wpPartial);
 wpResult=await rpc('SELECT * FROM public.apply_woocommerce_loyalty_refund($1,$2,$3::bigint,$4)', ['balance-guard-wp-order','synthetic-full-refund',10000,'balance-guard-wp-refund-full']);assert.equal(Number(wpResult[0].current_balance),0);assert.deepEqual(await state(w.wallet),{balance:0,debt:90,net:-90});
 await rpc('SELECT * FROM public.apply_woocommerce_loyalty_refund($1,$2,$3::bigint,$4,true)', ['balance-guard-wp-spend','synthetic-cancel-refund',2000,'balance-guard-wp-cancel']);assert.deepEqual(await state(w.wallet),{balance:1000,debt:0,net:1000});
 mark('existing WordPress refund and cancellation paths preserve debt economics while reporting nonnegative spendable balance');
 await db.exec('ROLLBACK');assert.deepEqual(await tableSnapshot(),original);

 await db.exec('BEGIN');
 const edge=await account(4,0),max='9223372036854775807',min='-9223372036854775808';
 const initialEdge=await journal(edge.wallet);
 await expectedError(()=>post(edge.wallet,min,'minimum-bigint-debit','woocommerce_refund_reversal',true),'22003');assert.deepEqual(await journal(edge.wallet),initialEdge);
 await post(edge.wallet,max,'maximum-bigint-credit');
 const atMax=await journal(edge.wallet);await expectedError(()=>post(edge.wallet,1,'overflowing-credit-1'),'22003');assert.deepEqual(await journal(edge.wallet),atMax);
 await post(edge.wallet,'-'+max,'remove-max-credit');
 const allowed=await post(edge.wallet,-50,'authorized-debt-50','woocommerce_refund_reversal',true);assert.equal(await post(edge.wallet,-50,'authorized-debt-50','woocommerce_refund_reversal',true),allowed);
 const beforeConflict=await journal(edge.wallet);await expectedError(()=>post(edge.wallet,-51,'authorized-debt-50','woocommerce_refund_reversal',true),'23505');assert.deepEqual(await journal(edge.wallet),beforeConflict);
 assert.deepEqual(await state(edge.wallet),{balance:0,debt:50,net:-50});
 mark('bigint overflow and conflicting retry refuse atomically; authorized legacy negative flag becomes representable debt');
 await db.exec('ROLLBACK');assert.deepEqual(await tableSnapshot(),original);

 // Same exact bridge and original scenario sequence; economic balance is asserted explicitly.
 const checkout=await runCheckoutCases(db,{stage:'nonnegative-balance-guard',bridgePath:path.resolve(here,'../../../site/supabase/shared-loyalty/store-bridge.mjs')});
 observations.checkout=checkout;assert.deepEqual(await tableSnapshot(),original);
 mark('all12 existing checkout bridge case groups remain compatible with explicit net/spendable/debt assertions');

 await db.exec(rollback);assert.deepEqual(await tableSnapshot(),original);assert.deepEqual(await functionState(),originalFunctions);
 assert.equal(await value("SELECT count(*)::int AS value FROM pg_attribute WHERE attrelid='public.merchant_wallets'::regclass AND attname='refund_debt' AND NOT attisdropped"),0);
 mark('rollback without debt restores original schema/writer and exact historical data');

 // Local fixture commits only inside this disposable database to exercise transactional migration refusal.
 await db.exec('BEGIN');const legacy=await account(5,10);await post(legacy.wallet,-100,'preexisting-debt-90','woocommerce_refund_reversal',true);await db.exec('COMMIT');
 const negativeSnapshot=await tableSnapshot(),negativeSchema=await functionState();let refusal;
 try{await db.exec(apply);}catch(error){refusal=error;}assert(refusal);await db.exec('ROLLBACK');
 assert.deepEqual(await tableSnapshot(),negativeSnapshot);assert.deepEqual(await functionState(),negativeSchema);
 assert.equal(await value("SELECT count(*)::int AS value FROM pg_attribute WHERE attrelid='public.merchant_wallets'::regclass AND attname='refund_debt' AND NOT attisdropped"),0);
 mark('preexisting negative wallet makes apply refuse atomically without rewriting history');
 await db.exec('BEGIN');await post(legacy.wallet,90,'legacy-debt-repaid');await db.exec('COMMIT');await db.exec(apply);
 await db.exec('BEGIN');await post(legacy.wallet,-90,'new-separated-debt-90','woocommerce_refund_reversal',true);await db.exec('COMMIT');
 const debtJournal=await journal(legacy.wallet);assert.deepEqual(await state(legacy.wallet),{balance:0,debt:90,net:-90});
 await db.exec(rollback);
 assert.equal(await value('SELECT balance::text AS value FROM public.merchant_wallets WHERE id=$1',[legacy.wallet]),'-90');assert.deepEqual(await journal(legacy.wallet),debtJournal);
 assert.equal(await value('SELECT coalesce(sum(leaves_delta),0)::text AS value FROM public.merchant_ledger_entries WHERE wallet_id=$1',[legacy.wallet]),'-90');
 await db.exec('BEGIN');await post(legacy.wallet,90,'post-rollback-debt-repaid');await db.exec('COMMIT');
 assert.equal(await value('SELECT balance::text AS value FROM public.merchant_wallets WHERE id=$1',[legacy.wallet]),'0');
 mark('explicit rollback with debt restores signed legacy balance without forgiving debt or altering the journal');

 const sourceFiles={atomicApply:path.resolve(here,'../../../balance-guard/atomic-apply.sql'),apply:path.join(here,'apply.sql'),rollback:path.join(here,'rollback.sql'),test:fileURLToPath(import.meta.url),checkoutCases:path.join(here,'test-checkout-cases.mjs'),loader:path.resolve(here,'../../../balance-guard/restore-loader.mjs'),bridge:path.resolve(here,'../../../site/supabase/shared-loyalty/store-bridge.mjs')};
 const result={status:'passed',completedAt:new Date().toISOString(),testCount:tests.length,tests,engine:metadata.engine,sourceSha256:Object.fromEntries(await Promise.all(Object.entries(sourceFiles).map(async([k,f])=>[k,hash(await readFile(f))]))),archiveSha256:metadata.source.archiveSha256,observations,networkCalls:0,productionMutations:0,historicalRowsPreserved:true,limits:['Single-session isolated PostgreSQL17.5 WASM; no native concurrency claim.','Original archived data and released retirement definitions; parent verifies current production source separately.','Bridge payment verification and network responses injected; no real payment/provider calls.','Rollback intentionally restores historical signed-balance representation when debt exists.']};
 await writeFile(path.join(here,'test-result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({status:result.status,testCount:result.testCount,checkoutCases:checkout.cases.length,productionMutations:0}));
}catch(error){
 if(db)await db.exec('ROLLBACK').catch(()=>{});
 await mkdir(privateDir,{recursive:true,mode:0o700});const file=path.join(privateDir,'acceptance-failure.json');await writeFile(file,JSON.stringify({message:error.message,code:error.code,stack:error.stack},null,2)+'\n',{mode:0o600});await chmod(file,0o600);
 console.error('balance_guard_acceptance_failed_private_diagnostic_retained');process.exitCode=1;
}finally{if(db)await db.close();globalThis.fetch=fetchOriginal;}
