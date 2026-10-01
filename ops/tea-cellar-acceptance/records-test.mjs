import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {createRestoredDatabase,HERE} from './restore-loader.mjs';
import {runRecordAcceptance} from './records.mjs';

const files=['records.mjs','records-test.mjs','restore-loader.mjs','../tea-cellar-records/apply.sql','../tea-cellar-retirement/apply.sql'];
let db;
try {
  const restored=await createRestoredDatabase();db=restored.db;
  await db.exec(await readFile(path.join(HERE,'../tea-cellar-records/apply.sql'),'utf8'));
  await db.exec(await readFile(path.join(HERE,'../tea-cellar-retirement/apply.sql'),'utf8'));
  const receipt=await runRecordAcceptance(db);
  receipt.restore=restored.metadata;
  receipt.completedAt=new Date().toISOString();
  receipt.sourceSha256=Object.fromEntries(await Promise.all(files.map(async name=>[name,createHash('sha256').update(await readFile(path.join(HERE,name))).digest('hex')])));
  await writeFile(path.join(HERE,'records-result.json'),JSON.stringify(receipt,null,2)+'\n');
  console.log('PASS '+receipt.testCount+' personal-record lifecycle and RLS cases');
} catch(error) {
  // Avoid logging PostgreSQL context, data or assertion values from the private restore.
  console.error('Personal-record acceptance failed: '+error.message);
  process.exitCode=1;
} finally { if(db)await db.close(); }
