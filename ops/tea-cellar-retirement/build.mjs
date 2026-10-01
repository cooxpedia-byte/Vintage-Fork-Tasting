// Offline generator: pinned in-memory PostgreSQL normalizes archived schema metadata.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const { PGlite }=await import(pathToFileURL(path.resolve(here,'../../../pglite-tests/pg17/node_modules/@electric-sql/pglite/dist/index.js')).href);
const plan=JSON.parse(await readFile(path.join(here,'plan.json'),'utf8'));
const db=new PGlite();
const sqlString=s=>"'"+s.replaceAll("'","''")+"'";
const metadata=`jsonb_build_object('source',md5(p.prosrc),'arguments',pg_get_function_arguments(p.oid),'result',pg_get_function_result(p.oid),'language',l.lanname,'security_definer',p.prosecdef,'strict',p.proisstrict,'volatility',p.provolatile,'parallel',p.proparallel,'leakproof',p.proleakproof,'kind',p.prokind,'config',p.proconfig,'cost',p.procost,'rows',p.prorows)`;
async function meta(sig){return (await db.query(`SELECT ${metadata} AS value FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure($1)`,[sig])).rows[0].value;}
try {
 await db.query("SELECT set_config('vf.synthetic_fixture_mode','pglite-in-memory',false)");
 await db.exec(await readFile(path.join(here,'fixture.sql'),'utf8'));
 await db.exec('SET search_path=pg_catalog,pg_temp;');
 for(const f of Object.values(plan.functions)){
   f.before=await meta(f.signature);
   await db.exec(f.replacement);
   f.after=await meta(f.signature);
 }
 for(const [name,ddl] of Object.entries(plan.triggers)){
   const table=ddl.match(/ ON public\.([a-z_]+)/)[1];
   const row=(await db.query(`SELECT pg_get_triggerdef(t.oid,false) AS definition FROM pg_trigger t WHERE t.tgrelid=to_regclass($1) AND t.tgname=$2`,['public.'+table,name])).rows[0];
   plan.triggers[name]={table,definition:row.definition,ddl};
 }
 plan.protectedMetadata={};
 for(const name of plan.protected){
   const sig=(await db.query("SELECT oid::regprocedure::text AS sig FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname=$1",[name])).rows[0].sig;
   plan.protectedMetadata[sig]=await meta(sig);
 }
 plan.columns={};
 for(const table of plan.tables){plan.columns[table]=(await db.query(`SELECT jsonb_agg(jsonb_build_array(attname,format_type(atttypid,atttypmod),attnotnull,attgenerated) ORDER BY attnum) AS columns FROM pg_attribute WHERE attrelid=to_regclass($1) AND attnum>0 AND NOT attisdropped`,['public.'+table])).rows[0].columns;}
 const cases=Object.entries(plan.nulling).map(([table,cols])=>`    when '${table}' then allowed := ARRAY[${cols.map(sqlString).join(',')}];`).join('\n');
 const helper=`CREATE FUNCTION public.vf_guard_retired_feature_write() RETURNS trigger
LANGUAGE plpgsql SET search_path TO pg_catalog AS $guard$
declare old_row jsonb; new_row jsonb; allowed text[] := '{}'::text[]; field text;
begin
  if TG_OP='UPDATE' then
    old_row := to_jsonb(OLD); new_row := to_jsonb(NEW);
    case TG_TABLE_NAME
${cases}
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
$guard$;`;
 await db.exec(helper);
 plan.helper={definition:helper,metadata:await meta('public.vf_guard_retired_feature_write()')};
 const manifest={protected:plan.protectedMetadata,functions:Object.fromEntries(Object.entries(plan.functions).map(([n,f])=>[n,{signature:f.signature,before:f.before,after:f.after}])),triggers:plan.triggers,tables:plan.tables,columns:plan.columns,helper:plan.helper.metadata};
 const manifestSQL=JSON.stringify(manifest);
 const locks=[...new Set([...plan.tables,...Object.values(plan.triggers).map(t=>t.table),'tasting_cards','tea_responses'])].sort().map(t=>'public.'+t).join(', ');
 const guard=`
declare
  manifest jsonb := $manifest$${manifestSQL}$manifest$::jsonb;
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
    select ${metadata} into actual from pg_proc p join pg_language l on l.oid=p.prolang where p.oid=to_regprocedure(item.value->>'signature');
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
    and p.proname in (${plan.retired.filter(n=>plan.functions[n].before.result==='trigger').map(sqlString).join(',')})
    and not exists(select 1 from jsonb_each(manifest->'triggers') x where x.key=t.tgname and to_regclass('public.'||(x.value->>'table'))=t.tgrelid))
  then raise exception 'retirement_unexpected_attachment'; end if;
  helper_oid:=to_regprocedure('public.vf_guard_retired_feature_write()');
  if helper_oid is not null then
    select ${metadata} into actual from pg_proc p join pg_language l on l.oid=p.prolang where p.oid=helper_oid;
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
    or (not is_retired and (trigger_count<>jsonb_object_length_compat or blocker_count<>0 or helper_oid is not null))
  then raise exception 'retirement_partial_state'; end if;
` .replace('jsonb_object_length_compat',String(Object.keys(plan.triggers).length));
 const execStmt=d=>`    EXECUTE $ddl$${d}$ddl$;`;
 const common=`-- UNAPPLIED CANDIDATE. Requires reviewed item 2, fresh preservation backup and item 4 rehearsal.
-- No data UPDATE/DELETE/backfill, balance conversion, ledger entry or checkout function change.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
SET LOCAL search_path=pg_catalog,pg_temp;
LOCK TABLE ${locks} IN ACCESS EXCLUSIVE MODE;
DO $migration$${guard}`;
 const apply=common+`  for item in select key,value from jsonb_each(manifest->'protected') loop
    select ${metadata} into actual from pg_proc p join pg_language l on l.oid=p.prolang where p.oid=to_regprocedure(item.key);
    if actual is distinct from item.value then raise exception 'retirement_protected_function_drift: %',item.key; end if;
  end loop;
  if not is_retired then\n`+Object.values(plan.triggers).map(t=>execStmt(`DROP TRIGGER ${t.ddl.match(/CREATE TRIGGER (\w+)/)[1]} ON public.${t.table};`)).join('\n')+'\n'+Object.values(plan.functions).map(f=>execStmt(f.replacement)).join('\n')+'\n'+execStmt(helper)+'\n'+execStmt('REVOKE ALL ON FUNCTION public.vf_guard_retired_feature_write() FROM PUBLIC;')+'\n'+plan.tables.map(t=>execStmt(`CREATE TRIGGER zz_vf_retired_write_guard BEFORE INSERT OR UPDATE ON public.${t} FOR EACH ROW EXECUTE FUNCTION public.vf_guard_retired_feature_write();`)).join('\n')+`\n  end if;\nend\n$migration$;\nCOMMIT;\n`;
 const rollback=common+`  if is_retired then\n`+plan.tables.map(t=>execStmt(`DROP TRIGGER zz_vf_retired_write_guard ON public.${t};`)).join('\n')+'\n'+execStmt('DROP FUNCTION public.vf_guard_retired_feature_write();')+'\n'+Object.values(plan.functions).map(f=>execStmt(f.original.replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION'))).join('\n')+'\n'+Object.values(plan.triggers).map(t=>execStmt(t.ddl)).join('\n')+`\n  end if;\nend\n$migration$;\nCOMMIT;\n`;
 await writeFile(path.join(here,'apply.sql'),apply);
 await writeFile(path.join(here,'rollback.sql'),rollback);
 await writeFile(path.join(here,'manifest.json'),JSON.stringify(plan,null,2)+'\n');
 console.log(`Built ${Object.keys(plan.functions).length} guarded functions, ${plan.tables.length} table guards, ${Object.keys(plan.triggers).length} trigger detachments.`);
} finally {await db.close();}
