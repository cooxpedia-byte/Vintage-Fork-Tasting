"""Build unapplied, guarded debt projection from freshly read live function definitions."""
from pathlib import Path
import json,hashlib,re
HERE=Path(__file__).resolve().parent
WORK=HERE.parents[2]
LIVE=WORK/'balance-guard/live-functions.json'
PRE=WORK/'balance-guard/live-preflight.json'
RETIREMENT=HERE.parent/'tea-cellar-retirement/manifest.json'
live=json.loads(LIVE.read_text());pre=json.loads(PRE.read_text());retired=json.loads(RETIREMENT.read_text())
selected={r['name']:r for r in live if r['name'] in ['post_gold_leaves_entry','gold_leaves_migration_audit_v1']}
assert len(selected)==2
md5=lambda s:hashlib.md5(s.encode()).hexdigest()
sha=lambda b:hashlib.sha256(b).hexdigest()
post=selected['post_gold_leaves_entry']['definition']
assert md5(post)==selected['post_gold_leaves_entry']['md5']==next(r['md5'] for r in pre['functions'] if r['name']=='post_gold_leaves_entry')
post_after=post.replace('  next_balance bigint;','  next_balance bigint;\n  next_net numeric;')
old='  next_balance := wallet.balance + p_leaves_delta;'
new='''  -- balance is spendable; refund_debt records the existing signed economic liability.
  next_net := wallet.balance::numeric - wallet.refund_debt::numeric + p_leaves_delta::numeric;
  -- Both nonnegative projections must fit bigint; abs(bigint minimum) does not.
  if next_net < -9223372036854775807::numeric or next_net > 9223372036854775807::numeric then
    raise exception using errcode = '22003', message = 'The Gold Leaves balance is outside the supported range.';
  end if;
  next_balance := next_net::bigint;'''
assert post_after.count(old)==1;post_after=post_after.replace(old,new)
old='  set balance = next_balance, updated_at = now()'
new='''  set balance = greatest(next_balance, 0::bigint),
      refund_debt = greatest(-next_balance, 0::bigint),
      updated_at = now()'''
assert post_after.count(old)==1;post_after=post_after.replace(old,new)
audit=selected['gold_leaves_migration_audit_v1']['definition'];assert md5(audit)==selected['gold_leaves_migration_audit_v1']['md5']
audit_after=audit.replace('w.balance<>o.balance','(w.balance-w.refund_debt)<>o.balance').replace('coalesce(sum(w.balance),0) AS current_original_wallet_balance_total','coalesce(sum(w.balance-w.refund_debt),0) AS current_original_wallet_balance_total').replace("'currentWalletBalanceTotal',(SELECT coalesce(sum(balance),0) FROM public.merchant_wallets),", "'currentWalletBalanceTotal',(SELECT coalesce(sum(balance-refund_debt),0) FROM public.merchant_wallets),\n  'currentWalletSpendableTotal',(SELECT coalesce(sum(balance),0) FROM public.merchant_wallets),\n  'currentWalletRefundDebtTotal',(SELECT coalesce(sum(refund_debt),0) FROM public.merchant_wallets),")
assert audit_after!=audit
functions=[{'name':'post_gold_leaves_entry','signature':'public.post_gold_leaves_entry(uuid,text,bigint,text,text,text,text,jsonb,boolean)','before':post,'after':post_after}, {'name':'gold_leaves_migration_audit_v1','signature':'public.gold_leaves_migration_audit_v1()','before':audit,'after':audit_after}]
for f in functions:
 f['beforeMd5']=md5(f['before']);f['afterMd5']=md5(f['after']);f['ownerFromLive']=selected[f['name']]['owner'];f['aclFromLive']=selected[f['name']]['acl']
 for pattern in [r'eyJ[A-Za-z0-9_-]{20,}',r'(?:sk|rk)_(?:live|test)_',r'postgres(?:ql)?://',r'https?://',r'-----BEGIN .*PRIVATE KEY']:
  assert not re.search(pattern,f['before']), 'Unreviewed sensitive-looking literal'
checks={'merchant_wallets_balance_nonnegative':'CHECK ((balance >= 0))','merchant_wallets_refund_debt_nonnegative':'CHECK ((refund_debt >= 0))','merchant_wallets_balance_debt_exclusive':'CHECK (((balance = 0) OR (refund_debt = 0)))'}
manifest={'functions':functions,'checks':checks,'requiredRetiredPurchaseSourceMd5':retired['functions']['purchase_study_copy']['after']['source'],'sourceSha256':{'liveFunctions':sha(LIVE.read_bytes()),'livePreflight':sha(PRE.read_bytes())},'economicInvariant':'balance - refund_debt = sum(merchant_ledger_entries.leaves_delta)','preexistingNegativePolicy':'refuse and review; no automatic conversion','ledgerBalanceAfter':'signed economic net','productionApplied':False}
(HERE/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
small={k:v for k,v in manifest.items() if k in ['checks','requiredRetiredPurchaseSourceMd5']};small['functions']=[{k:v for k,v in f.items() if k in ['name','signature','beforeMd5','afterMd5']} for f in functions]
header='''-- UNAPPLIED CANDIDATE. No app deployment or automatic production execution.
-- Preserves all historical ledger entries and economic net; existing balances must be nonnegative.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = pg_catalog, pg_temp;
LOCK TABLE public.merchant_wallets, public.merchant_ledger_entries IN ACCESS EXCLUSIVE MODE;
DO $migration$
DECLARE
  manifest jsonb := $manifest$'''+json.dumps(small,separators=(',',':'))+'''$manifest$::jsonb;
  item record; actual text; old_functions integer := 0; new_functions integer := 0;
  debt_column boolean; new_state boolean; check_count integer := 0; shape jsonb;
  oid_value oid;
BEGIN
  IF current_setting('server_version_num')::integer / 10000 <> 17 THEN
    RAISE EXCEPTION 'balance_guard_requires_postgres17';
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(manifest->'functions') LOOP
    SELECT md5(pg_get_functiondef(p.oid)) INTO actual
      FROM pg_proc p WHERE p.oid=to_regprocedure(item.value->>'signature');
    IF actual IS NOT DISTINCT FROM item.value->>'beforeMd5' THEN old_functions:=old_functions+1;
    ELSIF actual IS NOT DISTINCT FROM item.value->>'afterMd5' THEN new_functions:=new_functions+1;
    ELSE RAISE EXCEPTION 'balance_guard_function_drift: %',item.value->>'name'; END IF;
  END LOOP;
  IF old_functions>0 AND new_functions>0 THEN RAISE EXCEPTION 'balance_guard_partial_state'; END IF;
  new_state := new_functions=2;
  SELECT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.merchant_wallets'::regclass AND attname='refund_debt' AND NOT attisdropped) INTO debt_column;
  SELECT jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull) ORDER BY a.attnum)
    INTO shape FROM pg_attribute a WHERE a.attrelid='public.merchant_wallets'::regclass AND a.attnum>0 AND NOT a.attisdropped AND a.attname<>'refund_debt';
  IF shape IS DISTINCT FROM '[ ["id","uuid",true], ["owner_user_id","uuid",true], ["balance","bigint",true], ["created_at","timestamp with time zone",true], ["updated_at","timestamp with time zone",true] ]'::jsonb
    OR (SELECT pg_get_expr(d.adbin,d.adrelid) FROM pg_attrdef d JOIN pg_attribute a ON a.attrelid=d.adrelid AND a.attnum=d.adnum WHERE a.attrelid='public.merchant_wallets'::regclass AND a.attname='balance') IS DISTINCT FROM '0'
  THEN RAISE EXCEPTION 'balance_guard_wallet_shape_drift'; END IF;
  IF debt_column AND NOT EXISTS(
    SELECT 1 FROM pg_attribute a JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE a.attrelid='public.merchant_wallets'::regclass AND a.attname='refund_debt' AND a.atttypid='bigint'::regtype AND a.attnotnull AND a.attgenerated='' AND pg_get_expr(d.adbin,d.adrelid)='0'
  ) THEN RAISE EXCEPTION 'balance_guard_debt_column_drift'; END IF;
  FOR item IN SELECT key,value FROM jsonb_each_text(manifest->'checks') LOOP
    SELECT c.oid INTO oid_value FROM pg_constraint c WHERE c.conrelid='public.merchant_wallets'::regclass AND c.conname=item.key;
    IF oid_value IS NOT NULL THEN
      check_count:=check_count+1;
      IF NOT EXISTS(SELECT 1 FROM pg_constraint c WHERE c.oid=oid_value AND c.contype='c' AND c.convalidated AND c.conislocal AND NOT c.connoinherit AND NOT c.condeferrable AND pg_get_constraintdef(c.oid,false)=item.value)
      THEN RAISE EXCEPTION 'balance_guard_constraint_drift: %',item.key; END IF;
    END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM pg_constraint c WHERE c.conrelid='public.merchant_wallets'::regclass AND c.contype='c' AND NOT (manifest->'checks' ? c.conname)) THEN
    RAISE EXCEPTION 'balance_guard_unreviewed_wallet_check';
  END IF;
  IF (new_state AND (NOT debt_column OR check_count<>3)) OR (NOT new_state AND (debt_column OR check_count<>0)) THEN
    RAISE EXCEPTION 'balance_guard_partial_state';
  END IF;
  -- The old marketplace writer updates wallet columns directly and is incompatible with debt.
  IF (SELECT md5(p.prosrc) FROM pg_proc p WHERE p.oid=to_regprocedure('public.purchase_study_copy(uuid)')) IS DISTINCT FROM manifest->>'requiredRetiredPurchaseSourceMd5' THEN
    RAISE EXCEPTION 'balance_guard_requires_retired_marketplace';
  END IF;
  -- No implicit row-trigger side effects are permitted when rollback recombines debt.
  IF EXISTS(SELECT 1 FROM pg_trigger t WHERE t.tgrelid='public.merchant_wallets'::regclass AND NOT t.tgisinternal) THEN
    RAISE EXCEPTION 'balance_guard_unreviewed_wallet_trigger';
  END IF;
  IF new_state THEN
    IF EXISTS(SELECT 1 FROM public.merchant_wallets w LEFT JOIN (SELECT wallet_id,sum(leaves_delta) AS net FROM public.merchant_ledger_entries GROUP BY wallet_id) l ON l.wallet_id=w.id WHERE w.balance::numeric-w.refund_debt::numeric IS DISTINCT FROM coalesce(l.net,0)) THEN
      RAISE EXCEPTION 'balance_guard_ledger_mismatch';
    END IF;
  ELSE
    IF EXISTS(SELECT 1 FROM public.merchant_wallets w LEFT JOIN (SELECT wallet_id,sum(leaves_delta) AS net FROM public.merchant_ledger_entries GROUP BY wallet_id) l ON l.wallet_id=w.id WHERE w.balance::numeric IS DISTINCT FROM coalesce(l.net,0)) THEN
      RAISE EXCEPTION 'balance_guard_ledger_mismatch';
    END IF;
  END IF;
'''
def execute(sql):return '    EXECUTE $ddl$'+sql+'$ddl$;\n'
apply=header+'''  IF NOT new_state THEN
    IF EXISTS(SELECT 1 FROM public.merchant_wallets WHERE balance<0) THEN
      RAISE EXCEPTION 'balance_guard_preexisting_negative_requires_review';
    END IF;
    -- Constant default is metadata-only; do not update existing balances or timestamps.
    ALTER TABLE public.merchant_wallets ADD COLUMN refund_debt bigint NOT NULL DEFAULT 0;
    ALTER TABLE public.merchant_wallets
      ADD CONSTRAINT merchant_wallets_balance_nonnegative CHECK (balance>=0),
      ADD CONSTRAINT merchant_wallets_refund_debt_nonnegative CHECK (refund_debt>=0),
      ADD CONSTRAINT merchant_wallets_balance_debt_exclusive CHECK (balance=0 OR refund_debt=0);
'''+''.join(execute(f['after']) for f in functions)+'''  END IF;
END
$migration$;
COMMIT;
'''
rollback=header+'''  IF new_state THEN
    ALTER TABLE public.merchant_wallets
      DROP CONSTRAINT merchant_wallets_balance_nonnegative,
      DROP CONSTRAINT merchant_wallets_refund_debt_nonnegative,
      DROP CONSTRAINT merchant_wallets_balance_debt_exclusive;
'''+''.join(execute(f['before']) for f in functions)+'''    -- Restore the former signed representation without deleting or inventing economic value.
    -- Only indebted rows change; updated_at and every journal entry remain untouched.
    UPDATE public.merchant_wallets SET balance=balance-refund_debt WHERE refund_debt<>0;
    ALTER TABLE public.merchant_wallets DROP COLUMN refund_debt;
    IF EXISTS(SELECT 1 FROM public.merchant_wallets w LEFT JOIN (SELECT wallet_id,sum(leaves_delta) AS net FROM public.merchant_ledger_entries GROUP BY wallet_id) l ON l.wallet_id=w.id WHERE w.balance::numeric IS DISTINCT FROM coalesce(l.net,0)) THEN
      RAISE EXCEPTION 'balance_guard_rollback_ledger_mismatch';
    END IF;
  END IF;
END
$migration$;
COMMIT;
'''
(HERE/'apply.sql').write_text(apply);(HERE/'rollback.sql').write_text(rollback)
print(json.dumps({'functions':{f['name']:{'beforeMd5':f['beforeMd5'],'afterMd5':f['afterMd5']} for f in functions},'constraints':list(checks),'productionApplied':False}))
