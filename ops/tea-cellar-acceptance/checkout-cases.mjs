// Synthetic checkout cases for an isolated archive restore. No fetch leaves this process.
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';

const CANONICAL='https://umrqyhqezzuqdrhaywyv.supabase.co';
const STORE='https://fugvpupuwgbnojkyptym.supabase.co';
const KEY='synthetic-checkout-service-key-only';
const uid=n=>`a4000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const tables=['merchant_wallets','merchant_ledger_entries','mobile_customer_links','gold_leaves_store_links_v1','gold_leaves_store_attempts_v1','gold_leaves_identity_migration_v1','gold_leaves_identity_migration_audit_v1'];
const rpcArgs={
 gold_leaves_connect_store_v1:['p_store_profile_id','p_owner_user_id'],
 gold_leaves_reserve_store_v1:['p_store_profile_id','p_attempt_id','p_eligible_cents','p_leaves'],
 gold_leaves_settle_store_v1:['p_attempt_id','p_order_id'],
 gold_leaves_release_store_v1:['p_attempt_id'],
 gold_leaves_refund_store_v1:['p_order_id','p_cumulative_eligible_cents'],
 gold_leaves_activate_store_v1:['p_store_profile_id','p_owner_user_id'],
 gold_leaves_identity_v1:['p_email'],
};

export async function loyaltySnapshot(db){
 const result={};
 for(const table of tables){
  result[table]=(await db.query(`SELECT count(*)::text AS rows,md5(coalesce(string_agg(to_jsonb(t)::text,E'\\n' ORDER BY to_jsonb(t)::text),'')) AS digest FROM public.${table} t`)).rows[0];
 }
 result.totals=(await db.query('SELECT count(*)::text AS wallets,coalesce(sum(balance),0)::text AS balance FROM public.merchant_wallets')).rows[0];
 result.ledger=(await db.query('SELECT count(*)::text AS entries,coalesce(sum(leaves_delta),0)::text AS delta FROM public.merchant_ledger_entries')).rows[0];
 for(const table of ['auth.users','public.profiles'])result[table]=(await db.query(`SELECT count(*)::text AS rows,md5(coalesce(string_agg(to_jsonb(t)::text,E'\\n' ORDER BY to_jsonb(t)::text),'')) AS digest FROM ${table} t`)).rows[0];
 return result;
}

export async function runCheckoutCases(db,{stage,bridgePath}){
 const {createHandler}=await import(pathToFileURL(bridgePath).href);
 const cases=[],contexts=new Map(),requests=[],rpcCalls=[];
 let serviceRoleRpcExecutions=0,serviceRoleRestReads=0;
 const q=async(sql,args=[])=> (await db.query(sql,args)).rows;
 const value=async(sql,args=[])=> (await q(sql,args))[0].value;
 const mark=name=>cases.push(name);
 const owner=uid(1),other=uid(2),fresh=uid(3),unverified=uid(4);
 const profile=uid(101),otherProfile=uid(102),wallet=uid(201),otherWallet=uid(202);
 const balance=id=>value('SELECT balance::text AS value FROM public.merchant_wallets WHERE id=$1',[id]).then(Number);
 const ledgerCount=id=>value('SELECT count(*)::int AS value FROM public.merchant_ledger_entries WHERE wallet_id=$1',[id]);
 async function rpc(name,args){
  assert(name in rpcArgs,'Unapproved RPC');
  rpcCalls.push(name);
  const keys=rpcArgs[name];
  const originalRole=await value('SELECT current_user AS value');
  // Administrative setup stays separate; actual trusted calls use the restored service role.
  // On rejection the caller's SAVEPOINT rollback restores its previous role as well.
  if(originalRole==='vf_restore_admin')await db.exec('SET LOCAL ROLE service_role');
  const executionRole=await value('SELECT current_user AS value');
  assert(['service_role','anon','authenticated'].includes(executionRole));
  if(executionRole==='service_role')serviceRoleRpcExecutions++;
  const result=await value(`SELECT public.${name}(${keys.map((k,i)=>`${k}=>$${i+1}`).join(',')}) AS value`,keys.map(k=>args[k]));
  if(originalRole==='vf_restore_admin')await db.exec('RESET ROLE');
  return result;
 }
 // SAVEPOINT protects the outer preservation transaction when PostgreSQL rejects a call.
 async function rejects(fn,fragment){
  await db.exec('SAVEPOINT checkout_negative');
  let error;
  try{await fn();}catch(e){error=e;}
  await db.exec('ROLLBACK TO SAVEPOINT checkout_negative; RELEASE SAVEPOINT checkout_negative');
  assert(error,`Expected rejection: ${fragment}`);
  assert(String(error.message).includes(fragment),`Expected ${fragment}, got ${error.message}`);
 }
 const respond=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
 const transport=async(raw,options={})=>{
  const u=new URL(raw),body=options.body?JSON.parse(options.body):undefined;
  requests.push({origin:u.origin,path:u.pathname,method:options.method??'GET'});
  if(u.origin===STORE&&u.pathname==='/rest/v1/rpc/commerce_gold_leaves_health_v1'){
   return options.headers.apikey===KEY?respond(true):respond({error:'synthetic_denied'},401);
  }
  if(u.origin===STORE&&u.pathname==='/rest/v1/rpc/commerce_gold_leaves_context_v1'){
   const c=contexts.get(body.p_attempt_id);
   assert(c,'Unexpected synthetic attempt');
   if(Array.isArray(c))return respond(c.length>1?c.shift():c[0]);
   return respond(c);
  }
  if(u.origin===STORE&&u.pathname==='/rest/v1/commerce_checkout_attempts'&&options.method==='PATCH'){
   const id=u.searchParams.get('id')?.replace(/^eq\./,'');
   contexts.get(id).reservedAt=body.gold_leaves_reserved_at;
   return respond([]);
  }
  if(u.origin===STORE&&u.pathname==='/rest/v1/commerce_loyalty_events'&&options.method==='PATCH')return respond([]);
  if(u.origin===CANONICAL&&u.pathname==='/auth/v1/user'){
   return options.headers.authorization==='Bearer synthetic-owner-proof'?respond({id:owner,email:'checkout-one@example.invalid'}):respond({error:'synthetic_denied'},401);
  }
  if(u.origin===CANONICAL&&u.pathname.startsWith('/rest/v1/rpc/')){
   const name=u.pathname.slice('/rest/v1/rpc/'.length);
   // Catch at a savepoint so the bridge's error response cannot poison the outer transaction.
   await db.exec('SAVEPOINT checkout_bridge_rpc');
   try{let result=await rpc(name,body);if(['gold_leaves_settle_store_v1','gold_leaves_release_store_v1'].includes(name))result=Number(result);await db.exec('RELEASE SAVEPOINT checkout_bridge_rpc');return respond(result);}
   catch(e){await db.exec('ROLLBACK TO SAVEPOINT checkout_bridge_rpc; RELEASE SAVEPOINT checkout_bridge_rpc');return respond({code:e.code??'fixture_rpc_error'},409);}
  }
  const reads={
   gold_leaves_store_links_v1:{filters:['store_profile_id'],columns:['wallet_id','owner_user_id']},
   mobile_customer_links:{filters:['mobile_auth_user_id'],columns:['owner_user_id']},
   merchant_wallets:{filters:['owner_user_id','id'],columns:['id','balance']},
   gold_leaves_store_attempts_v1:{filters:['attempt_id','wallet_id','status','leaves_redeemed'],columns:['attempt_id','store_profile_id','wallet_id','eligible_cents','leaves_redeemed','status','created_at']},
   merchant_ledger_entries:{filters:['wallet_id'],columns:['id','leaves_delta','description','created_at']},
  };
  const table=u.pathname.replace('/rest/v1/','');
  if(u.origin===CANONICAL&&reads[table]&&(options.method??'GET')==='GET'){
   const spec=reads[table],where=[],params=[];
   for(const key of spec.filters){const rawFilter=u.searchParams.get(key);if(rawFilter){const [op,...rest]=rawFilter.split('.');assert(['eq','gt'].includes(op));params.push(rest.join('.'));where.push(`${key}${op==='eq'?'=':'>'}$${params.length}`);}}
   assert(where.length,'Unscoped canonical read');
   const selected=u.searchParams.get('select');
   const columns=selected==='*'?spec.columns:selected.split(',');
   assert(columns.every(c=>spec.columns.includes(c)));
   await db.exec('SET LOCAL ROLE service_role');
   assert.equal(await value('SELECT current_user AS value'),'service_role');serviceRoleRestReads++;
   const result=await q(`SELECT ${columns.join(',')} FROM public.${table} WHERE ${where.join(' AND ')} ORDER BY ${columns[0]}`,params);
   await db.exec('RESET ROLE');
   // PostgREST serializes bigint columns as JSON numbers, unlike native node pg text conversion.
   return respond(result.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,['balance','leaves_delta','eligible_cents','leaves_redeemed'].includes(k)?Number(v):v]))));
  }
  throw new Error(`Network disabled: unrecognized injected transport request ${u.origin}${u.pathname}`);
 };
 const handler=createHandler({SUPABASE_URL:CANONICAL,SUPABASE_SERVICE_ROLE_KEY:KEY,VF_GOLD_LEAVES_STORE_KEY:KEY,SUPABASE_ANON_KEY:'synthetic-anon-key',VF_GOLD_LEAVES_AUTOMATIC_ENABLED:'false'},transport);
 async function invoke(input,key=KEY){const r=await handler(new Request('https://fixture.invalid/bridge',{method:'POST',headers:{'x-vf-store-key':key,'content-type':'application/json'},body:JSON.stringify(input)}));return {status:r.status,body:await r.json()};}
 const context=(attemptId,leaves=200,eligibleCents=1555)=>({attemptId,profileId:profile,status:'created',provider:'stripe',leaves,eligibleCents,subtotalCents:eligibleCents,shippingCents:100,taxCents:50,totalCents:eligibleCents+150-leaves,verifiedPaid:false,verifiedUnpaid:false,refundedCashCents:0,orderStatus:'pending',orderId:uid(400)});
 const base=await loyaltySnapshot(db);
 await db.exec('BEGIN');
 try{
  assert.equal(await value("SELECT count(*)::int AS value FROM auth.users WHERE id::text LIKE 'a4000000-%'"),0,'Synthetic UUID prefix already used');
  for(const [id,email,confirmed] of [[owner,'checkout-one@example.invalid',true],[other,'checkout-two@example.invalid',true],[fresh,'checkout-new@example.invalid',true],[unverified,'checkout-unverified@example.invalid',false]]){
   await q('INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data) VALUES($1,$2,CASE WHEN $3 THEN now() ELSE NULL END,$4::jsonb)',[id,email,confirmed,JSON.stringify({display_name:'Synthetic acceptance only'})]);
   // Real restored auth trigger supplies the profile; this assertion catches incomplete restore.
   assert.equal(await value('SELECT count(*)::int AS value FROM public.profiles WHERE id=$1',[id]),1);
  }
  for(const [id,person,opening] of [[wallet,owner,1000],[otherWallet,other,500]]){
   await q('INSERT INTO public.merchant_wallets(id,owner_user_id) VALUES($1,$2)',[id,person]);
   await q("SELECT public.post_gold_leaves_entry($1,'adjustment',$2,'vf_item4_acceptance','synthetic_opening',$3,'Synthetic acceptance opening balance')",[id,opening,`synthetic-opening-${id}`]);
  }
  for(const role of ['anon','authenticated']){
   await db.exec(`SET LOCAL ROLE ${role}`);
   await rejects(()=>rpc('gold_leaves_connect_store_v1',{p_store_profile_id:profile,p_owner_user_id:owner}),'permission denied');
   await db.exec('RESET ROLE');
  }
  const permissions=await q("SELECT p.proname,has_function_privilege('service_role',p.oid,'EXECUTE') AS service,has_function_privilege('authenticated',p.oid,'EXECUTE') AS customer,has_function_privilege('anon',p.oid,'EXECUTE') AS anonymous FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname=ANY($1)",[Object.keys(rpcArgs)]);
  assert.equal(permissions.length,Object.keys(rpcArgs).length);assert(permissions.every(p=>p.service&&!p.customer&&!p.anonymous));
  mark('restored grants allow only trusted service execution; anonymous and customer-role RPC calls are denied');
  assert.equal(await rpc('gold_leaves_connect_store_v1',{p_store_profile_id:profile,p_owner_user_id:owner}),wallet);
  assert.equal(await rpc('gold_leaves_connect_store_v1',{p_store_profile_id:profile,p_owner_user_id:owner}),wallet);
  assert.equal(await rpc('gold_leaves_connect_store_v1',{p_store_profile_id:otherProfile,p_owner_user_id:other}),otherWallet);
  await rejects(()=>rpc('gold_leaves_connect_store_v1',{p_store_profile_id:profile,p_owner_user_id:other}),'mobile_wallet_link_conflict');
  await rejects(()=>rpc('gold_leaves_connect_store_v1',{p_store_profile_id:uid(109),p_owner_user_id:owner}),'mobile_wallet_link_conflict');
  assert.equal(await balance(wallet),1000);assert.equal(await ledgerCount(wallet),1);
  mark('existing-account connection and retries preserve wallet identity; conflicting account links reject atomically');
  const activated=await rpc('gold_leaves_activate_store_v1',{p_store_profile_id:uid(103),p_owner_user_id:fresh});
  assert.equal(Number(activated.balance),0);
  const activatedAgain=await rpc('gold_leaves_activate_store_v1',{p_store_profile_id:uid(103),p_owner_user_id:fresh});
  assert.equal(activatedAgain.walletId,activated.walletId);
  await rejects(()=>rpc('gold_leaves_activate_store_v1',{p_store_profile_id:uid(104),p_owner_user_id:unverified}),'canonical_identity_unverified');
  mark('verified new-account activation creates one empty wallet; unverified canonical identity is rejected');
  const a=uid(301),c=context(a);contexts.set(a,c);
  assert.equal((await invoke({action:'reserve',attemptId:a})).status,200);
  assert.equal(await balance(wallet),800);
  assert.equal((await invoke({action:'reserve',attemptId:a})).status,200);
  assert.equal(await balance(wallet),800);assert.equal(await ledgerCount(wallet),2);
  await rejects(()=>rpc('gold_leaves_reserve_store_v1',{p_store_profile_id:otherProfile,p_attempt_id:a,p_eligible_cents:1555,p_leaves:200}),'reservation_conflict');
  await rejects(()=>rpc('gold_leaves_reserve_store_v1',{p_store_profile_id:profile,p_attempt_id:a,p_eligible_cents:1556,p_leaves:200}),'reservation_conflict');
  assert.equal((await invoke({action:'quote',profileId:otherProfile,attemptId:a,requested:200,eligibleCents:1555})).status,409);
  assert.equal((await invoke({action:'quote',profileId:profile,attemptId:a,requested:200,eligibleCents:1555})).body.available,1000);
  mark('checkout reservation debits once, survives exact retry, and rejects changed owner or amounts');
  assert.deepEqual((await invoke({action:'sync',attemptId:a})).body,{state:'pending'});
  assert.equal(await balance(wallet),800);
  Object.assign(c,{status:'completed',verifiedPaid:true,orderStatus:'paid'});
  assert.deepEqual((await invoke({action:'sync',attemptId:a})).body,{state:'paid',earned:15});
  assert.deepEqual((await invoke({action:'sync',attemptId:a})).body,{state:'paid',earned:15});
  assert.equal(await balance(wallet),815);assert.equal(await ledgerCount(wallet),3);
  await rejects(()=>rpc('gold_leaves_release_store_v1',{p_attempt_id:a}),'verified_unpaid_attempt_required');
  await rejects(()=>rpc('gold_leaves_settle_store_v1',{p_attempt_id:a,p_order_id:uid(499)}),'order_conflict');
  mark('unverified payment cannot earn; verified purchase earns whole eligible dollars exactly once and cannot be cancelled');
  const partial=await rpc('gold_leaves_refund_store_v1',{p_order_id:c.orderId,p_cumulative_eligible_cents:777});
  assert.deepEqual(partial,{earnedReversed:8,redeemedRestored:99});assert.equal(await balance(wallet),906);
  const countPartial=await ledgerCount(wallet);
  assert.deepEqual(await rpc('gold_leaves_refund_store_v1',{p_order_id:c.orderId,p_cumulative_eligible_cents:777}),partial);
  assert.equal(await ledgerCount(wallet),countPartial);
  await rejects(()=>rpc('gold_leaves_refund_store_v1',{p_order_id:c.orderId,p_cumulative_eligible_cents:776}),'invalid_verified_refund');
  await rejects(()=>rpc('gold_leaves_refund_store_v1',{p_order_id:c.orderId,p_cumulative_eligible_cents:1556}),'invalid_verified_refund');
  assert.deepEqual(await rpc('gold_leaves_refund_store_v1',{p_order_id:c.orderId,p_cumulative_eligible_cents:1555}),{earnedReversed:15,redeemedRestored:200});
  assert.equal(await balance(wallet),1000);
  const refundCount=await ledgerCount(wallet);await rpc('gold_leaves_refund_store_v1',{p_order_id:c.orderId,p_cumulative_eligible_cents:1555});assert.equal(await ledgerCount(wallet),refundCount);
  mark('partial and full verified merchandise refunds proportionally restore redemption and reverse earning once; stale/excess refunds reject');
  const cancel=uid(302),cc=context(cancel,333,1800);contexts.set(cancel,cc);
  assert.equal((await invoke({action:'reserve',attemptId:cancel})).status,200);assert.equal(await balance(wallet),667);
  Object.assign(cc,{verifiedUnpaid:true,status:'cancelled'});
  assert.deepEqual((await invoke({action:'sync',attemptId:cancel})).body,{state:'released'});
  const cancelCount=await ledgerCount(wallet);
  assert.deepEqual((await invoke({action:'sync',attemptId:cancel})).body,{state:'released'});assert.equal(await ledgerCount(wallet),cancelCount);assert.equal(await balance(wallet),1000);
  await rejects(()=>rpc('gold_leaves_settle_store_v1',{p_attempt_id:cancel,p_order_id:uid(402)}),'active_reservation_required');
  await rejects(()=>rpc('gold_leaves_reserve_store_v1',{p_store_profile_id:profile,p_attempt_id:cancel,p_eligible_cents:1800,p_leaves:333}),'reservation_conflict');
  mark('verified cancellation returns reserved Leaves once; released attempt cannot later settle or reserve again');
  const earn=uid(303),ec=context(earn,0,2599);Object.assign(ec,{verifiedPaid:true,status:'completed',orderStatus:'paid',orderId:uid(403)});contexts.set(earn,ec);
  assert.deepEqual((await invoke({action:'sync',attemptId:earn})).body,{state:'paid',earned:25});
  assert.deepEqual((await invoke({action:'sync',attemptId:earn})).body,{state:'paid',earned:25});assert.equal(await balance(wallet),1025);
  await rejects(()=>rpc('gold_leaves_reserve_store_v1',{p_store_profile_id:profile,p_attempt_id:uid(304),p_eligible_cents:5000,p_leaves:1026}),'insufficient Gold Leaves');
  await rejects(()=>rpc('gold_leaves_reserve_store_v1',{p_store_profile_id:profile,p_attempt_id:uid(305),p_eligible_cents:100,p_leaves:101}),'invalid_reservation');
  mark('purchase without redemption earns once; overspend and redemption beyond eligible merchandise reject');
  const withheld=uid(306),wc=context(withheld,0,1400);Object.assign(wc,{verifiedPaid:true,status:'completed',orderStatus:'partially_refunded',refundedCashCents:100,orderId:uid(406)});contexts.set(withheld,wc);
  const beforeWithhold=await ledgerCount(wallet);
  assert.deepEqual((await invoke({action:'sync',attemptId:withheld})).body,{state:'refund_allocation_required'});assert.equal(await ledgerCount(wallet),beforeWithhold);
  const changed=uid(307),originalContext={...context(changed,0,1800),verifiedPaid:true,status:'completed',orderStatus:'paid',orderId:uid(407)};
  contexts.set(changed,[originalContext,{...originalContext,totalCents:1901}]);
  assert.deepEqual((await invoke({action:'sync',attemptId:changed})).body,{state:'pending'});assert.equal(await ledgerCount(wallet),beforeWithhold);
  mark('cash refund without merchandise allocation and changed payment verification cannot award new Leaves');
  const deniedBefore=await loyaltySnapshot(db);
  assert.equal((await invoke({action:'status',profileId:profile},'synthetic-invalid-service-key')).status,401);
  assert.equal((await invoke({action:'link',profileId:profile,accessToken:'invalid-proof'})).status,401);
  assert.deepEqual(await loyaltySnapshot(db),deniedBefore);
  const status1=(await invoke({action:'status',profileId:profile})).body,status2=(await invoke({action:'status',profileId:otherProfile})).body;
  assert.equal(status1.balance,1025);assert.equal(status2.balance,500);
  assert(!status1.history.some(x=>status2.history.some(y=>y.id===x.id)));
  mark('bridge authentication denies untrusted callers and account history/quotes stay wallet-scoped');
  const debtOrder=uid(408),debtAttempt=uid(308),debtSpend=uid(309);
  await rpc('gold_leaves_reserve_store_v1',{p_store_profile_id:otherProfile,p_attempt_id:debtAttempt,p_eligible_cents:10000,p_leaves:0});
  assert.equal(Number(await rpc('gold_leaves_settle_store_v1',{p_attempt_id:debtAttempt,p_order_id:debtOrder})),100);
  await rpc('gold_leaves_reserve_store_v1',{p_store_profile_id:otherProfile,p_attempt_id:debtSpend,p_eligible_cents:1000,p_leaves:590});
  await rpc('gold_leaves_refund_store_v1',{p_order_id:debtOrder,p_cumulative_eligible_cents:10000});assert.equal(await balance(otherWallet),-90);
  await rejects(()=>rpc('gold_leaves_reserve_store_v1',{p_store_profile_id:otherProfile,p_attempt_id:uid(310),p_eligible_cents:100,p_leaves:1}),'insufficient Gold Leaves');
  await rpc('gold_leaves_release_store_v1',{p_attempt_id:debtSpend});assert.equal(await balance(otherWallet),500);
  mark('refund reversal can create existing-policy debt; new overspending rejects and valid release restores balance');
  const synthetic=(await q("SELECT count(*)::int AS wallets,coalesce(sum(balance),0)::text AS balance FROM public.merchant_wallets WHERE owner_user_id::text LIKE 'a4000000-%'"))[0];
  const syntheticLedger=(await q("SELECT count(*)::int AS entries,coalesce(sum(leaves_delta),0)::text AS delta FROM public.merchant_ledger_entries WHERE wallet_id IN (SELECT id FROM public.merchant_wallets WHERE owner_user_id::text LIKE 'a4000000-%')"))[0];
  assert.equal(synthetic.balance,'1525');assert.equal(syntheticLedger.delta,'1525');
  await db.exec('ROLLBACK');
  assert.deepEqual(await loyaltySnapshot(db),base);
  mark('all synthetic account/order/ledger activity rolls back; historical row digests and financial totals remain exact');
  assert(serviceRoleRpcExecutions>0&&serviceRoleRestReads>0);
  return {stage,cases,syntheticOnly:{...synthetic,...syntheticLedger},historicalPreserved:true,networkCalls:0,injectedTransportRequests:requests.length,canonicalRpcCalls:rpcCalls.length,serviceRoleRpcExecutions,serviceRoleRestReads};
 }catch(e){await db.exec('ROLLBACK');throw e;}
}
