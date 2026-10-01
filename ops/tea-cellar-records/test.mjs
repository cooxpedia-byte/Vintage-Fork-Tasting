#!/usr/bin/env node
// Real PostgreSQL 17.5 in ephemeral WebAssembly memory; no host DB/network access.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
if (process.argv.length > 3) throw new Error('Usage: node test.mjs [absolute-isolated-pglite-package-directory]');
const packageDirectory = process.argv[2]
  ?? path.resolve(HERE, '../../../pglite-tests/pg17/node_modules/@electric-sql/pglite');
assert(path.isAbsolute(packageDirectory), 'PGlite package directory must be absolute');
const packageInfo = JSON.parse(await readFile(path.join(packageDirectory, 'package.json'), 'utf8'));
assert.equal(packageInfo.name, '@electric-sql/pglite');
assert.equal(packageInfo.version, '0.3.16', 'Use the pinned isolated test dependency');
const { PGlite } = await import(pathToFileURL(path.join(packageDirectory, 'dist/index.js')).href);
// No persistence path or connection settings can be supplied to this runner.
const db = new PGlite();
const passed = [];
const sourceNames = ['apply.sql', 'rollback.sql', 'fixture.sql', 'record-writes.sql', 'test.mjs'];
const sources = Object.fromEntries(await Promise.all(sourceNames.map(async name =>
  [name, await readFile(path.join(HERE, name), 'utf8')])));
const CARD = 'CREATE TRIGGER tasting_cards_sync_merchant_progress AFTER INSERT OR UPDATE OF completed_at, canonical_tea_id, personal_tea_record_id, product_identifier_snapshot, tea_name_snapshot ON public.tasting_cards FOR EACH ROW EXECUTE FUNCTION public.sync_merchant_progress_from_card();';
const RESPONSE = 'CREATE TRIGGER tea_responses_sync_merchant_progress AFTER INSERT OR UPDATE OF completed_at, stamp_released_at ON public.tea_responses FOR EACH ROW EXECUTE FUNCTION public.sync_merchant_progress_from_live_stamp();';
const STATE = `SELECT jsonb_build_object(
 'economic',public.fixture_economic_state(),
 'records',public.fixture_record_state(),
 'functions',public.fixture_function_state(),
 'triggers',(SELECT jsonb_agg(jsonb_build_array(t.oid::text,t.tgenabled,pg_get_triggerdef(t.oid,false)) ORDER BY t.oid)
             FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
             JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND NOT t.tgisinternal)) AS state;`;
const PRESERVED = `
SELECT public.fixture_assert(public.fixture_economic_state()=(SELECT value FROM public.fixture_state WHERE label='economic'),'economic state preserved');
SELECT public.fixture_assert(public.fixture_record_state()=(SELECT value FROM public.fixture_state WHERE label='records'),'record state preserved');
SELECT public.fixture_assert(public.fixture_function_state()=(SELECT value FROM public.fixture_state WHERE label='functions'),'function definitions preserved');
SELECT public.fixture_assert(public.fixture_unrelated_trigger_state()=(SELECT value FROM public.fixture_state WHERE label='unrelated_triggers'),'unrelated triggers preserved');`;
const mark = name => { passed.push(name); console.log(`PASS ${passed.length}: ${name}`); };
const file = name => db.exec(sources[name]);
const state = async () => (await db.query(STATE)).rows[0].state;

async function expectError(source, reason) {
  let caught;
  try { await db.exec(source); } catch (error) { caught = error; }
  // Persistent in-memory connection: explicitly clear the aborted transaction,
  // matching psql exit/connection-close rollback in the native fixture runner.
  if (caught) await db.exec('ROLLBACK;');
  assert(caught, `Expected guarded refusal: ${reason}`);
  assert(String(caught.message).includes(reason), `Unexpected refusal: ${caught.message}`);
}
async function refusal(name, reason, label) {
  const before = await state();
  await expectError(sources[name], reason);
  assert.deepEqual(await state(), before, 'Failed operation changed data, functions, or trigger definitions');
  mark(label);
}

let engine;
try {
  engine = (await db.query(`SELECT current_database() AS database,
    current_setting('server_version_num')::integer AS version_num,
    current_setting('server_version') AS version, version() AS build;`)).rows[0];
  assert.equal(engine.version_num, 170005);
  assert.equal(engine.database, 'template1');
  assert(engine.build.includes('compiled by emcc (Emscripten'));
  console.log(`ENGINE: @electric-sql/pglite ${packageInfo.version}, PostgreSQL ${engine.version}, in-memory`);

  await expectError(sources['fixture.sql'], 'fixture_requires_empty_disposable_postgres17_database');
  mark('fixture refuses built-in database without explicit synthetic opt-in');
  await db.query("SELECT set_config('vf.synthetic_fixture_mode','pglite-in-memory',false);");
  await file('fixture.sql');
  await refusal('fixture.sql', 'fixture_requires_empty_disposable_postgres17_database',
    'fixture refuses nonempty database without changing existing data');

  await file('apply.sql');
  await db.exec(PRESERVED);
  mark('apply detaches only reviewed hooks and preserves all data/functions/unrelated triggers');
  const applied = await state();
  await file('apply.sql');
  assert.deepEqual(await state(), applied);
  mark('repeated apply is an exact no-op');
  await file('record-writes.sql');
  mark('solo save/complete and live note insert/upsert preserve identities, attachments and economic state');

  await file('rollback.sql');
  await db.exec(PRESERVED);
  mark('explicit rollback restores attachments without rewriting records or economic state');
  const restored = await state();
  await file('rollback.sql');
  assert.deepEqual(await state(), restored);
  mark('repeated rollback is an exact no-op');

  await db.exec('DROP TRIGGER tea_responses_sync_merchant_progress ON public.tea_responses;'
    + 'CREATE TRIGGER tea_responses_sync_merchant_progress AFTER INSERT OR UPDATE OF completed_at '
    + 'ON public.tea_responses FOR EACH ROW EXECUTE FUNCTION public.sync_merchant_progress_from_live_stamp();');
  await refusal('apply.sql', 'tea_records_trigger_drift', 'apply rejects second-trigger definition drift atomically');
  await refusal('rollback.sql', 'tea_records_trigger_drift', 'rollback rejects definition drift atomically');
  await db.exec('DROP TRIGGER tea_responses_sync_merchant_progress ON public.tea_responses;' + RESPONSE);

  await db.exec('ALTER TABLE public.tasting_cards DISABLE TRIGGER tasting_cards_sync_merchant_progress;');
  await refusal('apply.sql', 'tea_records_trigger_drift', 'apply rejects disabled trigger drift');
  await refusal('rollback.sql', 'tea_records_trigger_drift', 'rollback rejects disabled trigger drift');
  await db.exec('ALTER TABLE public.tasting_cards ENABLE TRIGGER tasting_cards_sync_merchant_progress;');

  await db.exec('DROP TRIGGER tasting_cards_sync_merchant_progress ON public.tasting_cards;');
  await refusal('apply.sql', 'tea_records_partial_trigger_state', 'apply rejects partial state without changing surviving trigger');
  await refusal('rollback.sql', 'tea_records_partial_trigger_state', 'rollback rejects partial state without changing surviving trigger');
  await db.exec(CARD);

  await db.exec('CREATE TRIGGER fixture_duplicate_progression AFTER INSERT ON public.tasting_cards '
    + 'FOR EACH ROW EXECUTE FUNCTION public.sync_merchant_progress_from_card();');
  await refusal('apply.sql', 'tea_records_unexpected_progression_attachment', 'apply rejects duplicate or renamed progression attachment');
  await refusal('rollback.sql', 'tea_records_unexpected_progression_attachment', 'rollback rejects duplicate or renamed progression attachment');
  await db.exec('DROP TRIGGER fixture_duplicate_progression ON public.tasting_cards;');

  await db.exec(PRESERVED);
  await db.exec(`
UPDATE public.tasting_cards SET completed_at=completed_at WHERE id='30000000-0000-0000-0000-000000000001';
UPDATE public.tea_responses SET completed_at=completed_at WHERE id='40000000-0000-0000-0000-000000000001';
SELECT public.fixture_assert((SELECT calls=2 FROM public.fixture_calls WHERE kind='progression'),'both original hooks execute');
SELECT public.fixture_assert((SELECT balance=1236 FROM public.merchant_wallets WHERE id=1),'positive control detects wallet coupling');
SELECT public.fixture_assert((SELECT calculated_leaf_price=7 FROM public.merchant_listings WHERE id=1),'positive control detects price coupling');`);
  mark('positive control proves both original hooks reach detectable economic side effects');
  assert.equal(passed.length, 16);

  const receipt = {
    status: 'passed', testCount: passed.length, tests: passed,
    package: { name: packageInfo.name, version: packageInfo.version }, engine,
    execution: 'ephemeral in-memory WebAssembly PostgreSQL; no live connection or persistent database',
    productionSqlApplied: false, nativeServerTested: false,
    limits: ['No native multi-session lock contention test.',
      'Synthetic trigger fixture, not full application/checkout acceptance.'],
    sourceSha256: Object.fromEntries(sourceNames.map(name =>
      [name, createHash('sha256').update(sources[name]).digest('hex')])),
    completedAt: new Date().toISOString(),
  };
  await writeFile(path.join(HERE, 'test-result-pglite.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(`COMPLETE: ${passed.length} cases passed; receipt test-result-pglite.json`);
} finally {
  await db.close();
}
