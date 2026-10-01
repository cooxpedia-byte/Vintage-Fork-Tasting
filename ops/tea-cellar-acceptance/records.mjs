// Runs only against the caller's isolated restored PostgreSQL instance.
// All writes are synthetic and rolled back; no URLs, credentials or connections are accepted.
import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';

export async function runRecordAcceptance(db) {
  const tests=[];
  const q=async(sql,args=[])=>(await db.query(sql,args)).rows;
  const first=async(sql,args=[])=>(await q(sql,args))[0];
  const mark=name=>tests.push(name);
  const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const economy=async()=>hash(await q(`SELECT * FROM (SELECT 'wallet' AS kind,to_jsonb(t) AS row FROM public.merchant_wallets t UNION ALL SELECT 'ledger',to_jsonb(t) FROM public.merchant_ledger_entries t) economy ORDER BY kind,row::text`));
  const owner=randomUUID(),other=randomUUID(),session=randomUUID(),card=randomUUID(),tea=randomUUID();
  const login=async id=>{
    await db.exec('RESET ROLE');
    await q("SELECT set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[id,JSON.stringify({sub:id,role:'authenticated'})]);
    await db.exec('SET ROLE authenticated');
  };
  async function rejects(action,expected) {
    await db.exec('SAVEPOINT expected_refusal');
    let caught;
    try { await action(); } catch(error) { caught=error; }
    await db.exec('ROLLBACK TO SAVEPOINT expected_refusal; RELEASE SAVEPOINT expected_refusal');
    assert(caught,'Expected operation rejection');
    assert(String(caught.message).includes(expected),'Unexpected rejection category');
  }
  const before=await economy();
  await db.exec('BEGIN');
  try {
    // pg_dump disables row_security while loading; acceptance must exercise application policy behavior.
    await db.exec('SET LOCAL row_security=on');
    await q("INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES($1,$2,'{}'::jsonb),($3,$4,'{}'::jsonb)",[owner,`acceptance-${owner}@example.test`,other,`acceptance-${other}@example.test`]);
    const afterAccountSetup=await economy();
    const descriptor=(await first('SELECT id FROM public.flavor_descriptors WHERE active ORDER BY id LIMIT 1')).id;
    await login(owner);
    const saveOperation=randomUUID();
    const payload=[session,card,saveOperation,0,
      JSON.stringify({kind:'personal',personalTeaId:tea,name:'Acceptance green tea',origin:'Synthetic garden',teaType:'Green'}),
      JSON.stringify({rating:4,intensity:'clear'}),
      JSON.stringify({style:'gongfu',leafGrams:4,waterMl:120,waterTemperatureC:80,waterSource:'Filtered',vessel:'Small pot',initialSteepSeconds:30,preparationNotes:'Warm the pot',stages:[{label:'First infusion',durationSeconds:30,temperatureC:80,notes:'Synthetic sweet finish'}]}),
      JSON.stringify({firstImpression:'Synthetic floral aroma',personalNotes:'Synthetic private tasting note'}),[descriptor]];
    const saveSql='SELECT (public.save_solo_tasting_session_v2($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb,$8::jsonb,$9::uuid[])).*';
    const saved=await first(saveSql,payload);
    assert.equal(saved.owner_user_id,owner);assert.equal(saved.revision,1);assert.equal(saved.status,'in_progress');
    assert.equal((await first('SELECT personal_notes FROM public.tasting_card_private_notes WHERE card_id=$1',[card])).personal_notes,'Synthetic private tasting note');
    assert.equal((await first('SELECT notes FROM public.tasting_card_brew_stages WHERE card_id=$1',[card])).notes,'Synthetic sweet finish');
    mark('authenticated save_v2 preserves private notes, brewing stages and descriptor selection');
    assert.equal((await first(saveSql,payload)).revision,1);
    assert.equal((await first('SELECT count(*)::int AS n FROM public.tasting_cards WHERE session_id=$1',[session])).n,1);
    assert.equal((await first('SELECT count(*)::int AS n FROM public.tasting_card_brew_stages WHERE card_id=$1',[card])).n,1);
    mark('immediate save retry creates no duplicate card or brewing stage');
    const conflict=[...payload];conflict[7]=JSON.stringify({personalNotes:'Rejected replacement'});
    await rejects(()=>first(saveSql,conflict),'tea_lab_idempotency_conflict');
    const stale=[...payload];stale[2]=randomUUID();
    await rejects(()=>first(saveSql,stale),'tea_lab_stale_revision');
    assert.equal((await first('SELECT personal_notes FROM public.tasting_card_private_notes WHERE card_id=$1',[card])).personal_notes,'Synthetic private tasting note');
    mark('conflicting retry and stale revision cannot overwrite private notes');

    await db.exec('RESET ROLE');
    const photo=randomUUID();
    await q("INSERT INTO public.tasting_card_photos(id,card_id,owner_user_id,storage_path,content_type,size_bytes,upload_status) VALUES($1,$2,$3,$4,'image/jpeg',100,'ready')",[photo,card,owner,`${owner}/${card}/${photo}.jpg`]);
    await login(owner);
    const completeOperation=randomUUID();
    const completeSql='SELECT (public.complete_tasting_session($1,$2,$3)).*';
    const completed=await first(completeSql,[session,completeOperation,1]);
    assert.equal(completed.status,'completed');assert.equal(completed.revision,2);
    const repeated=await first(completeSql,[session,completeOperation,1]);
    assert.equal(repeated.revision,2);assert.equal(String(repeated.completed_at),String(completed.completed_at));
    mark('completion and retry retain one personal card and its original completion date');

    const archiveSql='SELECT (public.set_tasting_session_archived($1,$2,$3,$4)).*';
    const archived=await first(archiveSql,[session,randomUUID(),2,true]);
    assert.equal(archived.revision,3);assert(archived.archived_at);
    assert.equal((await first('SELECT count(*)::int AS n FROM public.tasting_card_photos WHERE card_id=$1',[card])).n,1);
    const restored=await first(archiveSql,[session,randomUUID(),3,false]);
    assert.equal(restored.revision,4);assert.equal(restored.archived_at,null);
    mark('archive and restore preserve personal card, notes, brewing details and photo metadata');

    const scopes=[['tasting_sessions','id',session],['tasting_cards','id',card],['personal_tea_records','id',tea],['tasting_card_private_notes','card_id',card],['tasting_card_brew_stages','card_id',card],['tasting_card_descriptors','card_id',card],['brewing_setups','card_id',card],['tasting_card_photos','card_id',card]];
    for(const [table,key,id] of scopes) assert.equal((await first(`SELECT count(*)::int AS n FROM public.${table} WHERE ${key}=$1`,[id])).n,1,`Owner read ${table}`);
    await login(other);
    for(const [table,key,id] of scopes) assert.equal((await first(`SELECT count(*)::int AS n FROM public.${table} WHERE ${key}=$1`,[id])).n,0,`Other owner isolation ${table}`);
    mark('actual authenticated-role RLS isolates all eight private record tables');
    await rejects(()=>first('SELECT public.delete_tasting_session($1,$2)',[session,randomUUID()]),'tea_lab_session_not_found');
    await rejects(()=>first(archiveSql,[session,randomUUID(),4,true]),'tea_lab_session_not_found');
    await rejects(()=>first(completeSql,[session,randomUUID(),4]),'tea_lab_session_not_found');
    mark('another authenticated customer cannot complete, archive or delete the record');

    await login(owner);
    const deletion=randomUUID();
    assert.equal((await first('SELECT public.delete_tasting_session($1,$2) AS removed',[session,deletion])).removed,true);
    assert.equal((await first('SELECT public.delete_tasting_session($1,$2) AS removed',[session,deletion])).removed,true);
    for(const [table,key,id] of scopes.filter(([table])=>table!=='personal_tea_records')) assert.equal((await first(`SELECT count(*)::int AS n FROM public.${table} WHERE ${key}=$1`,[id])).n,0,`Deleted record cascade ${table}`);
    mark('owner deletion and retry remove session, card, private notes, descriptors, brewing and photo metadata');
    await db.exec('RESET ROLE');
    assert.equal(await economy(),afterAccountSetup,'Personal record lifecycle must not change wallets or ledger');
    mark('save, completion, archive, restore and deletion leave all wallet and ledger rows unchanged');
  } finally { await db.exec('ROLLBACK; RESET ROLE'); }
  assert.equal(await economy(),before,'Synthetic acceptance transaction must leave restored economy unchanged');
  mark('acceptance transaction rolls back every synthetic record and account');
  return {status:'passed',testCount:tests.length,tests,productionSqlApplied:false,execution:'local restored PostgreSQL; synthetic users; actual authenticated role, archived RPCs and RLS; transaction rolled back'};
}
