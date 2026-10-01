#!/usr/bin/env python3
"""Behavior test against an existing, empty disposable PostgreSQL 17 database.

Does not start PostgreSQL, create/drop a database, use production credentials,
or contact a network host. The caller owns the test cluster/database lifecycle.
"""
import argparse
from pathlib import Path
import re
import subprocess

HERE = Path(__file__).resolve().parent
CARD = (
    "CREATE TRIGGER tasting_cards_sync_merchant_progress AFTER INSERT OR UPDATE OF "
    "completed_at, canonical_tea_id, personal_tea_record_id, product_identifier_snapshot, "
    "tea_name_snapshot ON public.tasting_cards FOR EACH ROW EXECUTE FUNCTION "
    "public.sync_merchant_progress_from_card();"
)
RESPONSE = (
    "CREATE TRIGGER tea_responses_sync_merchant_progress AFTER INSERT OR UPDATE OF "
    "completed_at, stamp_released_at ON public.tea_responses FOR EACH ROW EXECUTE "
    "FUNCTION public.sync_merchant_progress_from_live_stamp();"
)
STATE = """
SELECT jsonb_build_object(
 'economic',public.fixture_economic_state(),
 'records',public.fixture_record_state(),
 'functions',public.fixture_function_state(),
 'triggers',(SELECT jsonb_agg(jsonb_build_array(t.oid::text,t.tgenabled,pg_get_triggerdef(t.oid,false)) ORDER BY t.oid)
             FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
             JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND NOT t.tgisinternal));
"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--host', required=True, help='Existing absolute Unix socket directory')
    parser.add_argument('--port', type=int, default=5432)
    parser.add_argument('--database', required=True, help='Empty vf_records_test_<suffix> database')
    parser.add_argument('--username', required=True, help='Local fixture database owner')
    parser.add_argument('--psql', default='/opt/homebrew/opt/postgresql@17/bin/psql')
    args = parser.parse_args()
    if (not Path(args.host).is_absolute() or not Path(args.host).is_dir()
            or not re.fullmatch(r'vf_records_test_[a-z0-9_]{1,40}', args.database)
            or not 1 <= args.port <= 65535
            or not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_-]{0,62}', args.username)):
        parser.error('Use an existing local socket, disposable database name, and local owner.')

    cmd = [args.psql, '--no-psqlrc', '--no-password', '--quiet', '--tuples-only', '--no-align',
           '--set=ON_ERROR_STOP=1', '--host=' + args.host, '--port=' + str(args.port),
           '--dbname=' + args.database, '--username=' + args.username]
    env = {'PATH': '/usr/bin:/bin', 'LANG': 'C', 'PGPASSFILE': '/dev/null',
           'PGAPPNAME': 'vf-personal-records-synthetic-test', 'PGCONNECT_TIMEOUT': '5'}

    def sql(source, expected_error=None):
        result = subprocess.run(cmd, input=source, text=True, capture_output=True, env=env, timeout=60)
        if expected_error is None:
            if result.returncode != 0:
                raise RuntimeError('Synthetic SQL failed: ' + result.stderr.strip())
        elif result.returncode == 0 or expected_error not in result.stderr:
            raise RuntimeError('Expected guarded refusal was not observed: ' + expected_error)
        return result.stdout.strip()

    def file(name, expected_error=None):
        return sql((HERE / name).read_text(), expected_error)

    def refusal(name, reason):
        before = sql(STATE)
        file(name, reason)
        if sql(STATE) != before:
            raise RuntimeError('Guard refusal changed data, functions, or trigger definitions')

    def assert_preserved():
        sql("""
SELECT public.fixture_assert(public.fixture_economic_state()=(SELECT value FROM public.fixture_state WHERE label='economic'),'economic state preserved');
SELECT public.fixture_assert(public.fixture_record_state()=(SELECT value FROM public.fixture_state WHERE label='records'),'record state preserved');
SELECT public.fixture_assert(public.fixture_function_state()=(SELECT value FROM public.fixture_state WHERE label='functions'),'function definitions preserved');
SELECT public.fixture_assert(public.fixture_unrelated_trigger_state()=(SELECT value FROM public.fixture_state WHERE label='unrelated_triggers'),'unrelated trigger definitions preserved');
""")

    if sql('SELECT current_database();') != args.database:
        raise RuntimeError('Unexpected fixture database identity')
    file('fixture.sql')
    file('apply.sql')
    first_applied = sql(STATE)
    file('apply.sql')
    if sql(STATE) != first_applied:
        raise RuntimeError('Repeated apply changed state')
    file('record-writes.sql')
    print('PASS: apply, repeat, solo save/complete, live notes upsert, protected state and unrelated triggers')

    file('rollback.sql')
    assert_preserved()
    restored = sql(STATE)
    file('rollback.sql')
    if sql(STATE) != restored:
        raise RuntimeError('Repeated rollback changed state')
    print('PASS: explicit rollback and repeat preserve records/economic state')

    # Definition drift on the SECOND inspected trigger must not drop the first.
    sql('DROP TRIGGER tea_responses_sync_merchant_progress ON public.tea_responses;'
        'CREATE TRIGGER tea_responses_sync_merchant_progress AFTER INSERT OR UPDATE OF completed_at '
        'ON public.tea_responses FOR EACH ROW EXECUTE FUNCTION public.sync_merchant_progress_from_live_stamp();')
    refusal('apply.sql', 'tea_records_trigger_drift')
    refusal('rollback.sql', 'tea_records_trigger_drift')
    sql('DROP TRIGGER tea_responses_sync_merchant_progress ON public.tea_responses;' + RESPONSE)
    print('PASS: changed definition rejected atomically by apply and rollback')

    sql('ALTER TABLE public.tasting_cards DISABLE TRIGGER tasting_cards_sync_merchant_progress;')
    refusal('apply.sql', 'tea_records_trigger_drift')
    refusal('rollback.sql', 'tea_records_trigger_drift')
    sql('ALTER TABLE public.tasting_cards ENABLE TRIGGER tasting_cards_sync_merchant_progress;')
    print('PASS: disabled trigger drift rejected')

    sql('DROP TRIGGER tasting_cards_sync_merchant_progress ON public.tasting_cards;')
    refusal('apply.sql', 'tea_records_partial_trigger_state')
    refusal('rollback.sql', 'tea_records_partial_trigger_state')
    sql(CARD)
    print('PASS: partial state rejected without changing surviving trigger')

    sql('CREATE TRIGGER fixture_duplicate_progression AFTER INSERT ON public.tasting_cards '
        'FOR EACH ROW EXECUTE FUNCTION public.sync_merchant_progress_from_card();')
    refusal('apply.sql', 'tea_records_unexpected_progression_attachment')
    refusal('rollback.sql', 'tea_records_unexpected_progression_attachment')
    sql('DROP TRIGGER fixture_duplicate_progression ON public.tasting_cards;')
    print('PASS: renamed/duplicate progression attachment rejected')

    # Prove the fixture actually detects the dependency when original wiring is
    # present. These changes are synthetic, after all preservation assertions.
    assert_preserved()
    sql("""
UPDATE public.tasting_cards SET completed_at=completed_at WHERE id='30000000-0000-0000-0000-000000000001';
UPDATE public.tea_responses SET completed_at=completed_at WHERE id='40000000-0000-0000-0000-000000000001';
SELECT public.fixture_assert((SELECT calls=2 FROM public.fixture_calls WHERE kind='progression'),'restored original hooks execute');
SELECT public.fixture_assert((SELECT balance=1236 FROM public.merchant_wallets WHERE id=1),'fixture catches wallet coupling');
SELECT public.fixture_assert((SELECT calculated_leaf_price=7 FROM public.merchant_listings WHERE id=1),'fixture catches pricing coupling');
""")
    print('PASS: positive control proves both original hooks reach economic side effects')
    print('COMPLETE: synthetic fixture only; caller must dispose of the test database')


if __name__ == '__main__':
    main()
