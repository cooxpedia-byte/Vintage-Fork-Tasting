-- UNAPPLIED CANDIDATE. No app deployment or automatic production execution.
-- Preserves all historical ledger entries and economic net; existing balances must be nonnegative.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = pg_catalog, pg_temp;
LOCK TABLE public.merchant_wallets, public.merchant_ledger_entries IN ACCESS EXCLUSIVE MODE;
DO $migration$
DECLARE
  manifest jsonb := $manifest${"checks":{"merchant_wallets_balance_nonnegative":"CHECK ((balance >= 0))","merchant_wallets_refund_debt_nonnegative":"CHECK ((refund_debt >= 0))","merchant_wallets_balance_debt_exclusive":"CHECK (((balance = 0) OR (refund_debt = 0)))"},"requiredRetiredPurchaseSourceMd5":"51791da1f2bf9e7315e0852f84a64a5c","functions":[{"name":"post_gold_leaves_entry","signature":"public.post_gold_leaves_entry(uuid,text,bigint,text,text,text,text,jsonb,boolean)","beforeMd5":"f13504e65d75b4b3d8816adf38da2627","afterMd5":"7ed88b7fd1061f70e217158b40674b81"},{"name":"gold_leaves_migration_audit_v1","signature":"public.gold_leaves_migration_audit_v1()","beforeMd5":"e6525adfbcb7ce7e4bd14f5d48866816","afterMd5":"c8362e01099f0bfaffcaa70274f36f98"}]}$manifest$::jsonb;
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
  IF NOT new_state THEN
    IF EXISTS(SELECT 1 FROM public.merchant_wallets WHERE balance<0) THEN
      RAISE EXCEPTION 'balance_guard_preexisting_negative_requires_review';
    END IF;
    -- Constant default is metadata-only; do not update existing balances or timestamps.
    ALTER TABLE public.merchant_wallets ADD COLUMN refund_debt bigint NOT NULL DEFAULT 0;
    ALTER TABLE public.merchant_wallets
      ADD CONSTRAINT merchant_wallets_balance_nonnegative CHECK (balance>=0),
      ADD CONSTRAINT merchant_wallets_refund_debt_nonnegative CHECK (refund_debt>=0),
      ADD CONSTRAINT merchant_wallets_balance_debt_exclusive CHECK (balance=0 OR refund_debt=0);
    EXECUTE $ddl$CREATE OR REPLACE FUNCTION public.post_gold_leaves_entry(p_wallet_id uuid, p_entry_type text, p_leaves_delta bigint, p_source text, p_source_reference text, p_idempotency_key text, p_description text DEFAULT ''::text, p_metadata jsonb DEFAULT '{}'::jsonb, p_allow_negative_balance boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  existing_entry public.merchant_ledger_entries%rowtype;
  wallet public.merchant_wallets%rowtype;
  next_balance bigint;
  next_net numeric;
  new_entry_id uuid;
begin
  if p_leaves_delta = 0 then
    raise exception using errcode = '22023', message = 'A Gold Leaves entry cannot have a zero value.';
  end if;
  if p_entry_type not in (
    'woocommerce_earn', 'woocommerce_redeem', 'woocommerce_redeem_release',
    'woocommerce_refund_reversal', 'adjustment'
  ) then
    raise exception using errcode = '22023', message = 'Unsupported Gold Leaves entry type.';
  end if;
  if char_length(coalesce(p_source, '')) < 1
     or char_length(coalesce(p_idempotency_key, '')) < 8 then
    raise exception using errcode = '22023', message = 'A source and idempotency key are required.';
  end if;

  select entry.* into existing_entry
  from public.merchant_ledger_entries entry
  where entry.source = p_source and entry.idempotency_key = p_idempotency_key;
  if found then
    if existing_entry.wallet_id = p_wallet_id
      and existing_entry.entry_type = p_entry_type
      and existing_entry.leaves_delta = p_leaves_delta
      and existing_entry.source_reference is not distinct from p_source_reference
    then
      return existing_entry.id;
    end if;
    raise exception using errcode = '23505', message = 'The idempotency key was already used for a different Gold Leaves operation.';
  end if;

  select current_wallet.* into wallet
  from public.merchant_wallets current_wallet
  where current_wallet.id = p_wallet_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'The Gold Leaves wallet was not found.';
  end if;

  -- Re-check after the wallet lock so simultaneous retries return one entry.
  select entry.* into existing_entry
  from public.merchant_ledger_entries entry
  where entry.source = p_source and entry.idempotency_key = p_idempotency_key;
  if found then
    if existing_entry.wallet_id = p_wallet_id
      and existing_entry.entry_type = p_entry_type
      and existing_entry.leaves_delta = p_leaves_delta
      and existing_entry.source_reference is not distinct from p_source_reference
    then
      return existing_entry.id;
    end if;
    raise exception using errcode = '23505', message = 'The idempotency key was already used for a different Gold Leaves operation.';
  end if;

  -- balance is spendable; refund_debt records the existing signed economic liability.
  next_net := wallet.balance::numeric - wallet.refund_debt::numeric + p_leaves_delta::numeric;
  -- Both nonnegative projections must fit bigint; abs(bigint minimum) does not.
  if next_net < -9223372036854775807::numeric or next_net > 9223372036854775807::numeric then
    raise exception using errcode = '22003', message = 'The Gold Leaves balance is outside the supported range.';
  end if;
  next_balance := next_net::bigint;
  -- Credits may reduce an existing refund debt without clearing it in one step.
  -- Only a debit needs permission to take or keep a balance below zero.
  if p_leaves_delta < 0 and next_balance < 0 and not coalesce(p_allow_negative_balance, false) then
    raise exception using errcode = '22003', message = 'The wallet has insufficient Gold Leaves.';
  end if;

  insert into public.merchant_ledger_entries (
    wallet_id, transaction_id, entry_type, leaves_delta, balance_after,
    description, metadata, source, source_reference, idempotency_key
  ) values (
    wallet.id, extensions.gen_random_uuid(), p_entry_type, p_leaves_delta,
    next_balance, coalesce(p_description, ''), coalesce(p_metadata, '{}'::jsonb),
    p_source, p_source_reference, p_idempotency_key
  ) returning id into new_entry_id;

  update public.merchant_wallets
  set balance = greatest(next_balance, 0::bigint),
      refund_debt = greatest(-next_balance, 0::bigint),
      updated_at = now()
  where id = wallet.id;
  return new_entry_id;
end;
$function$
$ddl$;
    EXECUTE $ddl$CREATE OR REPLACE FUNCTION public.gold_leaves_migration_audit_v1()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 WITH original AS (
  SELECT x.* FROM public.gold_leaves_identity_migration_audit_v1 a,
  jsonb_to_recordset(a.wallets_snapshot) AS x(wallet_id uuid,owner_user_id uuid,balance bigint)
 ), comparison AS (
  SELECT count(*) FILTER(WHERE w.id IS NULL) AS missing_wallets,
   count(*) FILTER(WHERE w.id IS NOT NULL AND w.owner_user_id<>o.owner_user_id) AS changed_owners,
   count(*) FILTER(WHERE w.id IS NOT NULL AND (w.balance-w.refund_debt)<>o.balance) AS changed_balances,
   coalesce(sum(w.balance-w.refund_debt),0) AS current_original_wallet_balance_total
  FROM original o LEFT JOIN public.merchant_wallets w ON w.id=o.wallet_id
 )
 SELECT jsonb_build_object(
  'snapshotAt',a.snapshot_at,'originalWalletCount',a.original_wallet_count,
  'originalWalletBalanceTotal',a.original_wallet_balance_total,'originalLedgerCount',a.original_ledger_count,
  'eligibleOwnerCount',a.eligible_owner_count,'eligibleWalletCount',a.eligible_wallet_count,
  'eligibleWalletBalanceTotal',a.eligible_wallet_balance_total,
  'currentWalletCount',(SELECT count(*) FROM public.merchant_wallets),
  'currentWalletBalanceTotal',(SELECT coalesce(sum(balance-refund_debt),0) FROM public.merchant_wallets),
  'currentWalletSpendableTotal',(SELECT coalesce(sum(balance),0) FROM public.merchant_wallets),
  'currentWalletRefundDebtTotal',(SELECT coalesce(sum(refund_debt),0) FROM public.merchant_wallets),
  'currentLedgerCount',(SELECT count(*) FROM public.merchant_ledger_entries),
  'currentOriginalWalletBalanceTotal',c.current_original_wallet_balance_total,
  'missingOriginalWallets',c.missing_wallets,'changedOriginalOwners',c.changed_owners,'changedOriginalBalances',c.changed_balances,
  'statuses',(SELECT coalesce(jsonb_object_agg(status,n),'{}'::jsonb) FROM (
   SELECT status,count(*) AS n FROM public.gold_leaves_identity_migration_v1 GROUP BY status) counts)
 ) FROM public.gold_leaves_identity_migration_audit_v1 a CROSS JOIN comparison c WHERE a.id;
$function$
$ddl$;
  END IF;
END
$migration$;
COMMIT;
