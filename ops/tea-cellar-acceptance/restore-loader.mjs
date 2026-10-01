// Private full-archive restore adapter. No remote access or persistent database endpoint.
import {readFile,writeFile,mkdir,chmod} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
export const HERE=path.dirname(fileURLToPath(import.meta.url));
export const PRIVATE=path.resolve(HERE,'../../../acceptance-private');
export const BACKUP='/Users/salarmelli/Documents/Codex/Vintage Fork Private Backups/retirement-2026-10-01-DiOtjP/umrqyhqezzuqdrhaywyv';
const PACKAGE=path.resolve(HERE,'../../../pglite-tests/pg17/node_modules/@electric-sql/pglite');
const qident=s=>'"'+s.replaceAll('"','""')+'"';
async function privateWrite(name,value){await mkdir(PRIVATE,{recursive:true,mode:0o700});await chmod(PRIVATE,0o700);const p=path.join(PRIVATE,name);await writeFile(p,typeof value==='string'?value:JSON.stringify(value,null,2)+'\n',{mode:0o600});await chmod(p,0o600);}
export async function createRestoredDatabase(){
 const pkg=JSON.parse(await readFile(path.join(PACKAGE,'package.json'),'utf8'));if(pkg.version!=='0.3.16')throw new Error('restore_requires_pinned_pglite_0_3_16');
 const {PGlite}=await import(pathToFileURL(path.join(PACKAGE,'dist/index.js')).href);
 const {pgcrypto}=await import(pathToFileURL(path.join(PACKAGE,'dist/contrib/pgcrypto.js')).href);
 const {uuid_ossp}=await import(pathToFileURL(path.join(PACKAGE,'dist/contrib/uuid_ossp.js')).href);
 const pg_stat_statements=pathToFileURL(path.join(PACKAGE,'dist/pg_stat_statements.tar.gz'));
 const db=new PGlite({extensions:{pgcrypto,uuid_ossp,pg_stat_statements}});
 const metadata={engine:null,package:{name:pkg.name,version:pkg.version},source:null,restoredEntries:0,restoredDataTables:0,excluded:[],roleCredentialsRestored:false,network:false,persistentDatabase:false};
 try{
  metadata.engine=(await db.query("SELECT current_setting('server_version') AS version,current_setting('server_version_num')::int AS version_num,version() AS build")).rows[0];
  if(metadata.engine.version_num!==170005)throw new Error('restore_requires_postgres_17_5');
  metadata.source=JSON.parse(await readFile(path.join(PRIVATE,'restore-source.json'),'utf8'));
  const sql=await readFile(path.join(PRIVATE,'canonical-archive.sql'),'utf8');
  if(createHash('sha256').update(sql).digest('hex')!==metadata.source.decodedSqlSha256)throw new Error('restore_archive_decode_digest_mismatch');
  await db.exec('CREATE ROLE vf_restore_admin SUPERUSER NOLOGIN; SET SESSION AUTHORIZATION vf_restore_admin; ALTER ROLE postgres RENAME TO vf_bootstrap_admin;');
  // Role capabilities/memberships are retained locally; no login credentials/default settings are imported.
  const roles=await readFile(path.join(BACKUP,'roles.sql'),'utf8');
  metadata.source.rolesSha256=createHash('sha256').update(roles).digest('hex');
  for(const m of roles.matchAll(/^CREATE ROLE ([^;]+);/gm)){
   const name=m[1].replace(/^"|"$/g,'').replaceAll('""','"');
   if(!(await db.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[name])).rows.length)await db.exec('CREATE ROLE '+qident(name)+' NOLOGIN;');
  }
  for(const m of roles.matchAll(/^ALTER ROLE ([^\n]+) WITH ([^\n]+);$/gm)){
   const clean=m[2].replace(/PASSWORD '(?:''|[^'])*'/g,'').replace(/\bLOGIN\b/g,'NOLOGIN');
   if(/PASSWORD/.test(clean))throw new Error('unsupported_role_password_syntax');
   try{await db.exec('ALTER ROLE '+m[1]+' WITH '+clean+';');}catch(error){await privateWrite('restore-role-failure.json',{role:m[1],message:error.message,detail:error.detail});throw new Error('role_restore_failed: '+m[1]);}
  }
  for(const m of roles.matchAll(/^GRANT [^\n]+;$/gm))await db.exec(m[0].replace(/ GRANTED BY [^;]+(?=;)/,''));
  metadata.roleAdaptations=['All roles NOLOGIN; passwords and per-role settings omitted.','Two isolated restore/bootstrap superusers added; archived postgres retains its original non-superuser capabilities.','Role memberships retain effective options; original membership grantor provenance is remapped to the local restore administrator.'];
  const entries=sql.split(/--\n-- (?:Data for )?Name: /);
  const preamble=entries.shift().replace(/^\\(?:un)?restrict[^\n]*$/gm,'');
  await db.exec(preamble);
  for(const raw of entries){
   const header=raw.slice(0,raw.indexOf('\n'));const body=raw.slice(raw.indexOf('\n')+1).replace(/^\\(?:un)?restrict[^\n]*$/gm,'');
   const parts=header.split('; ');const name=parts[0];const type=parts[1]?.replace('Type: ','');const schema=parts[2]?.replace('Schema: ','');
   // Supabase vault uses a platform extension not distributed with PGlite. Never replace it with a fake security implementation.
   if((type==='EXTENSION'&&name==='supabase_vault')||(type==='COMMENT'&&name==='EXTENSION supabase_vault')||schema==='vault'){
    metadata.excluded.push({name,type,schema,reason:'supabase_vault platform extension unavailable; no application/auth/storage object omitted'});continue;
   }
   try{
    const copy=body.match(/^(COPY [^\n]+ FROM stdin;)\n([\s\S]*?)^\\\.\r?$/m);
    if(copy){
     await db.exec(copy[1].replace('FROM stdin','FROM \'/dev/blob\''),{blob:new Blob([copy[2]])});
     const rest=body.replace(copy[0],'');if(rest.trim())await db.exec(rest);
     metadata.restoredDataTables++;
    }else await db.exec(body);
    metadata.restoredEntries++;
   }catch(error){
    await privateWrite('restore-failure.json',{header,message:error.message,code:error.code,detail:error.detail,where:error.where});
    throw new Error(`archive_restore_failed: ${type} ${schema}.${name}; private diagnostic retained`);
   }
  }
  await db.exec('SET search_path=public,extensions; SET row_security=on;');
  metadata.rowSecurityTables=(await db.query("SELECT count(*)::int AS count FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','auth','storage') AND c.relrowsecurity")).rows[0].count;
  metadata.policies=(await db.query("SELECT count(*)::int AS count FROM pg_policy")).rows[0].count;
  await privateWrite('restore-metadata.json',metadata);
  return {db,metadata};
 }catch(error){await db.close();throw error;}
}
