// Aggregate-only acceptance receipt. Private archive rows remain in ephemeral PG memory/private files.
import assert from 'node:assert/strict';
import {readFile,writeFile,chmod} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {createRestoredDatabase,HERE,PRIVATE,BACKUP} from './restore-loader.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const copyHash=b=>{const text=typeof b==='string'?b:Buffer.from(b).toString('utf8');return sha(text?text.slice(0,-1).split('\n').sort().join('\n')+'\n':'');};
const ident=s=>'"'+s.replaceAll('"','""')+'"';
const sources={};
for(const label of ['records/apply','records/rollback','retirement/apply','retirement/rollback'])sources[label]=await readFile(path.resolve(HERE,'../tea-cellar-'+label+'.sql'),'utf8');
const manifest=JSON.parse(await readFile(path.resolve(HERE,'../tea-cellar-retirement/manifest.json'),'utf8'));
const passed=[];const mark=s=>{passed.push(s);console.log('PASS '+passed.length+': '+s);};
async function writePrivate(name,v){const p=path.join(PRIVATE,name);await writeFile(p,JSON.stringify(v,null,2)+'\n',{mode:0o600});await chmod(p,0o600);}
const decoded=await readFile(path.join(PRIVATE,'canonical-archive.sql'),'utf8');
const copies=[];
for(const raw of decoded.split(/--\n-- (?:Data for )?Name: /).slice(1)){
 const header=raw.slice(0,raw.indexOf('\n'));const pieces=header.split('; ');const name=pieces[0];const schema=pieces[2]?.replace('Schema: ','');
 if(!header.includes('Type: TABLE DATA')||schema==='vault')continue;
 const copy=raw.match(/^(COPY [^\n]+ FROM stdin;)\n([\s\S]*?)^\\\.\r?$/m);
 if(!copy)throw new Error('copy_section_missing');
 copies.push({key:schema+'.'+name,table:ident(schema)+'.'+ident(name),sql:copy[1].replace('FROM stdin',"TO '/dev/blob'"),archiveSha256:copyHash(copy[2]),archiveRows:copy[2]?copy[2].split('\n').length-1:0});
}
async function dataState(db){const state={};for(const copy of copies){const results=await db.exec(copy.sql);const output=results.find(r=>r.blob)?.blob;const count=(await db.query('SELECT count(*)::int AS n FROM '+copy.table)).rows[0].n;if(!output&&count>0)throw new Error('copy_output_missing: '+copy.key);const bytes=output?new Uint8Array(await output.arrayBuffer()):new Uint8Array();state[copy.key]={sha256:copyHash(bytes),rows:count};}return state;}
async function schemaState(db){
 const queries={
  functions:`SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) AS args,pg_get_functiondef(p.oid) AS definition,pg_get_userbyid(p.proowner) AS owner,p.proacl::text AS acl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','auth','storage') AND p.prokind IN ('f','p') ORDER BY n.nspname,p.proname,args`,
  triggers:`SELECT n.nspname,c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid,false) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal AND n.nspname IN ('public','auth','storage') ORDER BY n.nspname,c.relname,t.tgname`,
  policies:`SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname IN ('public','auth','storage') ORDER BY schemaname,tablename,policyname`,
  tables:`SELECT n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity,c.relacl::text AS acl,pg_get_userbyid(c.relowner) AS owner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','auth','storage') AND c.relkind IN ('r','p','S') ORDER BY n.nspname,c.relname`,
  sequences:`SELECT schemaname,sequencename,sequenceowner,data_type::text,start_value,min_value,max_value,increment_by,cycle,cache_size,last_value FROM pg_sequences WHERE schemaname IN ('public','auth','storage') ORDER BY schemaname,sequencename`,
 };
 const r={};for(const [name,sql]of Object.entries(queries))r[name]=(await db.query(sql)).rows;return r;
}
async function loyalty(db){return (await db.query(`SELECT
 (SELECT count(*)::int FROM public.merchant_wallets) AS wallets,
 (SELECT sum(balance)::bigint::text FROM public.merchant_wallets) AS leaves,
 (SELECT count(*)::int FROM public.merchant_ledger_entries) AS ledger_entries,
 (SELECT count(*)::int FROM public.gold_leaves_store_links_v1) AS store_links,
 (SELECT count(*)::int FROM public.merchant_wallets w WHERE w.balance<>(SELECT coalesce(sum(leaves_delta),0) FROM public.merchant_ledger_entries e WHERE e.wallet_id=w.id)) AS ledger_balance_mismatches,
 (SELECT count(*)::int FROM public.gold_leaves_store_links_v1 l LEFT JOIN public.merchant_wallets w ON w.id=l.wallet_id WHERE w.id IS NULL OR w.owner_user_id<>l.owner_user_id) AS owner_mapping_mismatches`)).rows[0];}
let db;try{
 const restored=await createRestoredDatabase();db=restored.db;const metadata=restored.metadata;
 const baseline=await dataState(db);const mismatches=copies.filter(c=>baseline[c.key].sha256!==c.archiveSha256||baseline[c.key].rows!==c.archiveRows).map(c=>c.key);
 await writePrivate('restore-copy-baseline.json',{tables:baseline,mismatchTables:mismatches});
 assert.equal(mismatches.length,0,'Restored COPY bytes/counts differ from archive; private report has table names only');
 mark('all 122 restored table-data sections match exact archive COPY row multisets and counts');
 const schema=await schemaState(db);const gold=await loyalty(db);assert.equal(gold.wallets,2278);assert.equal(gold.leaves,'14973');assert.equal(gold.ledger_entries,202);assert.equal(gold.store_links,2276);assert.equal(gold.ledger_balance_mismatches,0);assert.equal(gold.owner_mapping_mismatches,0);mark('canonical wallet/ledger/identity aggregates reconcile exactly');
 const media=JSON.parse(await readFile(path.join(BACKUP,'media/manifest.json'),'utf8'));let mediaBytes=0;
 for(const object of media.objects){const b=await readFile(path.join(BACKUP,'media',object.filename));assert.equal(sha(b),object.sha256);assert.equal(b.length,object.bytes);mediaBytes+=b.length;}
 assert.equal(media.status,'verified');mark('all captured canonical media bytes retain original custody hashes');
 const stages=[];
 async function unchanged(label){const current=await dataState(db);assert.deepEqual(current,baseline);assert.deepEqual(await loyalty(db),gold);stages.push({label,tableDigestsMatched:Object.keys(current).length,rowsRewritten:0});}
 await db.exec(sources['records/apply']);await unchanged('item2 applied');const after2=await schemaState(db);assert.deepEqual(after2.functions,schema.functions);assert.deepEqual(after2.policies,schema.policies);assert.deepEqual(after2.tables,schema.tables);assert.deepEqual(after2.sequences,schema.sequences);mark('item 2 preserves archive rows, all function definitions/ACLs, policies and sequences');
 await db.exec(sources['retirement/apply']);await unchanged('item3 applied');const after3=await schemaState(db);
 assert.deepEqual(after3.policies,schema.policies);assert.deepEqual(after3.tables,schema.tables);assert.deepEqual(after3.sequences,schema.sequences);
 const protectedSet=new Set(manifest.protected);for(const before of schema.functions.filter(f=>f.nspname==='public'&&protectedSet.has(f.proname))){assert.deepEqual(after3.functions.find(f=>f.nspname===before.nspname&&f.proname===before.proname&&f.args===before.args),before);}
 mark('item 3 preserves all archive rows, 35 protected definitions/ACLs, RLS policies, table ownership and sequences');
 await db.exec(sources['retirement/apply']);await unchanged('item3 repeated');assert.deepEqual(await schemaState(db),after3);mark('repeated item 3 apply is data/schema idempotent on restored archive');
 await db.exec(sources['retirement/rollback']);await unchanged('item3 rolled back');assert.deepEqual(await schemaState(db),after2);mark('item 3 rollback restores exact prior function/trigger definitions and privileges');
 await db.exec(sources['records/rollback']);await unchanged('item2 rolled back');assert.deepEqual(await schemaState(db),schema);mark('item 2 rollback returns to original archived definitions/privileges without data changes');
 await db.exec(sources['records/apply']);await db.exec(sources['retirement/apply']);await unchanged('items2and3 reapplied');assert.deepEqual(await schemaState(db),after3);mark('both migrations reapply with identical definitions and all original data preserved');
 const receipt={status:'passed',testCount:passed.length,tests:passed,metadata,tableDataSections:copies.length,totalRestoredCopyRows:copies.reduce((n,c)=>n+c.archiveRows,0),rowDataMutations:0,loyalty:gold,media:{objects:media.objects.length,bytes:mediaBytes,allHashesMatched:true},stages,schemaPreserved:{protectedFunctions:manifest.protected.length,rowLevelSecurityTables:metadata.rowSecurityTables,policies:metadata.policies,ownersAndACLs:true,sequences:true},sourceSha256:Object.fromEntries(Object.entries(sources).map(([k,v])=>[k,sha(v)])),harnessSha256:{loader:sha(await readFile(path.join(HERE,'restore-loader.mjs'))),rehearsal:sha(await readFile(path.join(HERE,'restore-rehearsal.mjs')))},native:{attempted:true,version:'17.11',initialized:false,reason:'macOS SysV shmget exhaustion persists with explicit mmap/posix; no host settings changed'},limits:['Unsupported supabase_vault extension and its dependent objects omitted; all public/auth/storage objects restored.','PGlite provides one in-memory PostgreSQL session; native multi-session lock/concurrency acceptance remains unverified.','Role login credentials/default settings omitted and membership grantor provenance adapted for isolation.','Hosted authentication, Realtime delivery and Storage service behavior are outside the in-memory database restore.'],productionChanges:false,completedAt:new Date().toISOString()};
 await writeFile(path.join(HERE,'restore-result.json'),JSON.stringify(receipt,null,2)+'\n');console.log('COMPLETE '+passed.length+' restoration/preservation cases');
}catch(e){await writePrivate('rehearsal-failure.json',{message:e.message,stack:e.stack});console.error('restore_rehearsal_failed: private diagnostic retained');process.exitCode=1;}finally{if(db)await db.close();}
