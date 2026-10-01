#!/usr/bin/env node
// Offline acceptance only: no remote connections, real orders, or payment requests.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRestoredDatabase} from './restore-loader.mjs';
import {runCheckoutCases,loyaltySnapshot} from './checkout-cases.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const bridgePath=path.resolve(here,'../../../site/supabase/shared-loyalty/store-bridge.mjs');
const files={item2:path.resolve(here,'../tea-cellar-records/apply.sql'),item3:path.resolve(here,'../tea-cellar-retirement/apply.sql'),cases:path.join(here,'checkout-cases.mjs'),runner:fileURLToPath(import.meta.url),loader:path.join(here,'restore-loader.mjs'),bridge:bridgePath,enrollment:path.join(path.dirname(bridgePath),'account-enrollment.mjs'),wordpressEnrollment:path.join(path.dirname(bridgePath),'wordpress-enrollment.mjs')};
const texts=Object.fromEntries(await Promise.all(Object.entries(files).map(async([name,file])=>[name,await readFile(file,'utf8')])));
const sourceSha256=Object.fromEntries(Object.entries(texts).map(([name,text])=>[name,createHash('sha256').update(text).digest('hex')]));
const {db,metadata}=await createRestoredDatabase();
const originalFetch=globalThis.fetch;let blockedNetworkAttempts=0;
globalThis.fetch=async()=>{blockedNetworkAttempts++;throw new Error('checkout_acceptance_network_disabled');};
try{
 const baseline=await loyaltySnapshot(db);
 const functionMetadata=async()=> (await db.query("SELECT p.proname,p.oid::text,p.proowner::text,p.proacl::text,md5(pg_get_functiondef(p.oid)) AS definition_digest FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND (p.proname LIKE 'gold_leaves_%' OR p.proname IN ('post_gold_leaves_entry','get_my_loyalty_summary','get_mobile_loyalty_summary','get_wordpress_loyalty_summary')) ORDER BY p.proname")).rows;
 const protectedBefore=await functionMetadata();
 const before=await runCheckoutCases(db,{stage:'before-retirement',bridgePath});
 console.log('PASS before retirement: '+before.cases.length+' checkout cases');
 await db.exec(texts.item2);await db.exec(texts.item3);
 assert.deepEqual(await loyaltySnapshot(db),baseline);
 assert.equal(blockedNetworkAttempts,0);
 assert.deepEqual(await functionMetadata(),protectedBefore);
 const after=await runCheckoutCases(db,{stage:'after-retirement',bridgePath});
 assert.deepEqual(after.cases,before.cases);assert.deepEqual(after.syntheticOnly,before.syntheticOnly);
 assert.deepEqual(await loyaltySnapshot(db),baseline);
 assert.equal(blockedNetworkAttempts,0);
 console.log('PASS after retirement: '+after.cases.length+' identical checkout cases; historical state unchanged');
 const receipt={status:'passed',completedAt:new Date().toISOString(),testCount:before.cases.length+after.cases.length,sourceSha256,restore:{archiveSha256:metadata.source.archiveSha256,decodedSqlSha256:metadata.source.decodedSqlSha256,rolesSha256:metadata.source.rolesSha256,engine:metadata.engine,package:metadata.package,restoredEntries:metadata.restoredEntries,restoredDataTables:metadata.restoredDataTables,excluded:metadata.excluded,roleAdaptations:metadata.roleAdaptations},productionSqlApplied:false,networkCalls:0,realPaymentOperations:0,baseline,protectedBefore,stages:[before,after],limitations:['Full archived database restored into isolated PGlite PostgreSQL 17.5; no native multi-session concurrency test.','Exact storefront bridge uses injected synthetic verified-payment context; Stripe/PayPal verification and live gateway delivery are not exercised.','Refund settlement tests supply verified merchandise allocations directly to the canonical RPC; existing bridge intentionally requests review for aggregate cash refunds.','Provider transport and native-store commerce rows are synthetic; canonical account, wallet, ledger, reservation, grants, and functions are restored archived objects.','No live or production changes. All synthetic rows are rolled back separately before and after migration.']};
 await writeFile(path.join(here,'checkout-result.json'),JSON.stringify(receipt,null,2)+'\n');
}catch(error){console.error('Checkout acceptance failed: '+error.message);process.exitCode=1;}finally{globalThis.fetch=originalFetch;await db.close();}
