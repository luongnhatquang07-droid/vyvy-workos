-- Remove the empty, unowned legacy dependency table discovered by the
-- 2026-07-21 staging audit. This migration is deliberately fail-closed:
-- it will never drop a table that contains rows or has inbound foreign keys.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';
set local idle_in_transaction_session_timeout = '60s';
set local search_path = pg_catalog;

do $drop_legacy_task_dependencies$
declare
  v_table_oid oid;
  v_row_count bigint;
  v_inbound_fk_count bigint;
begin
  v_table_oid := to_regclass('public.task_dependencies');

  if v_table_oid is null then
    raise notice 'Legacy public.task_dependencies is already absent; cleanup is a no-op.';
    return;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_class c
    where c.oid = v_table_oid
      and c.relkind = 'r'
      and c.relpersistence = 'p'
  ) then
    raise exception using
      errcode = '55000',
      message = 'public.task_dependencies exists but is not an ordinary table; refusing cleanup.';
  end if;

  -- Hold the strongest table lock through COMMIT so a concurrent writer cannot
  -- insert after the empty-table check and before DROP.
  execute 'lock table public.task_dependencies in access exclusive mode';

  if to_regclass('public.task_dependencies') is distinct from v_table_oid then
    raise exception using
      errcode = '55000',
      message = 'public.task_dependencies changed identity while cleanup was acquiring its lock.';
  end if;

  execute 'select count(*) from public.task_dependencies' into v_row_count;
  if v_row_count <> 0 then
    raise exception using
      errcode = '55000',
      message = format(
        'Legacy public.task_dependencies contains %s row(s); refusing to drop data.',
        v_row_count
      );
  end if;

  select count(*)
  into v_inbound_fk_count
  from pg_catalog.pg_constraint con
  where con.contype = 'f'
    and con.confrelid = v_table_oid
    and con.conrelid <> v_table_oid;

  if v_inbound_fk_count <> 0 then
    raise exception using
      errcode = '55000',
      message = format(
        'Legacy public.task_dependencies has %s inbound foreign key(s); refusing cleanup.',
        v_inbound_fk_count
      );
  end if;

  -- Guard the exact audited legacy shape. RESTRICT catches other dependency
  -- kinds, while these checks prevent silently deleting newly drifted,
  -- table-owned schema such as columns, constraints, indexes or triggers.
  if (
    select count(*)
    from pg_catalog.pg_attribute a
    where a.attrelid = v_table_oid
      and a.attnum > 0
      and not a.attisdropped
  ) <> 5
  or not exists (
    select 1 from pg_catalog.pg_attribute a
    where a.attrelid = v_table_oid and a.attnum = 1 and a.attname = 'id'
      and a.atttypid = 'uuid'::pg_catalog.regtype and a.attnotnull
  )
  or not exists (
    select 1 from pg_catalog.pg_attribute a
    where a.attrelid = v_table_oid and a.attnum = 2 and a.attname = 'task_id'
      and a.atttypid = 'uuid'::pg_catalog.regtype and a.attnotnull
  )
  or not exists (
    select 1 from pg_catalog.pg_attribute a
    where a.attrelid = v_table_oid and a.attnum = 3 and a.attname = 'depends_on_task_id'
      and a.atttypid = 'uuid'::pg_catalog.regtype and a.attnotnull
  )
  or not exists (
    select 1 from pg_catalog.pg_attribute a
    where a.attrelid = v_table_oid and a.attnum = 4 and a.attname = 'dependency_type'
      and a.atttypid = 'public.dependency_type'::pg_catalog.regtype and not a.attnotnull
  )
  or not exists (
    select 1 from pg_catalog.pg_attribute a
    where a.attrelid = v_table_oid and a.attnum = 5 and a.attname = 'created_at'
      and a.atttypid = 'timestamptz'::pg_catalog.regtype and not a.attnotnull
  ) then
    raise exception using
      errcode = '55000',
      message = 'Legacy public.task_dependencies column shape differs from the audited empty table; refusing cleanup.';
  end if;

  if (
    select count(*)
    from pg_catalog.pg_attrdef d
    where d.adrelid = v_table_oid
  ) <> 3
  or not exists (
    select 1
    from pg_catalog.pg_attrdef d
    join pg_catalog.pg_attribute a
      on a.attrelid = d.adrelid and a.attnum = d.adnum
    where d.adrelid = v_table_oid and a.attname = 'id'
      and pg_catalog.pg_get_expr(d.adbin, d.adrelid) = 'gen_random_uuid()'
  )
  or not exists (
    select 1
    from pg_catalog.pg_attrdef d
    join pg_catalog.pg_attribute a
      on a.attrelid = d.adrelid and a.attnum = d.adnum
    where d.adrelid = v_table_oid and a.attname = 'dependency_type'
      and pg_catalog.replace(
        pg_catalog.pg_get_expr(d.adbin, d.adrelid),
        'public.',
        ''
      ) = '''FINISH_TO_START''::dependency_type'
  )
  or not exists (
    select 1
    from pg_catalog.pg_attrdef d
    join pg_catalog.pg_attribute a
      on a.attrelid = d.adrelid and a.attnum = d.adnum
    where d.adrelid = v_table_oid and a.attname = 'created_at'
      and pg_catalog.pg_get_expr(d.adbin, d.adrelid) = 'now()'
  ) then
    raise exception using
      errcode = '55000',
      message = 'Legacy public.task_dependencies defaults differ from the audited empty table; refusing cleanup.';
  end if;

  if (
    select count(*)
    from pg_catalog.pg_constraint con
    where con.conrelid = v_table_oid
  ) <> 4
  or not exists (
    select 1 from pg_catalog.pg_constraint con
    where con.conrelid = v_table_oid and con.conname = 'task_dependencies_pkey'
      and con.contype = 'p' and con.conkey = array[1]::smallint[]
      and con.convalidated and not con.condeferrable and not con.condeferred
  )
  or not exists (
    select 1 from pg_catalog.pg_constraint con
    where con.conrelid = v_table_oid
      and con.conname = 'task_dependencies_task_id_depends_on_task_id_key'
      and con.contype = 'u' and con.conkey = array[2, 3]::smallint[]
      and con.convalidated and not con.condeferrable and not con.condeferred
  )
  or not exists (
    select 1 from pg_catalog.pg_constraint con
    where con.conrelid = v_table_oid and con.conname = 'task_dependencies_task_id_fkey'
      and con.contype = 'f' and con.confrelid = 'public.tasks'::pg_catalog.regclass
      and con.conkey = array[2]::smallint[]
      and con.confkey = array[1]::smallint[]
      and con.confdeltype = 'c' and con.confupdtype = 'a'
      and con.convalidated and not con.condeferrable and not con.condeferred
  )
  or not exists (
    select 1 from pg_catalog.pg_constraint con
    where con.conrelid = v_table_oid and con.conname = 'task_dependencies_depends_on_task_id_fkey'
      and con.contype = 'f' and con.confrelid = 'public.tasks'::pg_catalog.regclass
      and con.conkey = array[3]::smallint[]
      and con.confkey = array[1]::smallint[]
      and con.confdeltype = 'c' and con.confupdtype = 'a'
      and con.convalidated and not con.condeferrable and not con.condeferred
  ) then
    raise exception using
      errcode = '55000',
      message = 'Legacy public.task_dependencies constraints differ from the audited empty table; refusing cleanup.';
  end if;

  if (
    select count(*)
    from pg_catalog.pg_index i
    where i.indrelid = v_table_oid
  ) <> 2
  or exists (
    select 1
    from pg_catalog.pg_index i
    where i.indrelid = v_table_oid
      and (not i.indisunique or not i.indisvalid or not i.indisready or i.indpred is not null)
  )
  or exists (
    select 1
    from pg_catalog.pg_class c
    where c.oid = v_table_oid and (c.relrowsecurity or c.relforcerowsecurity)
  )
  or exists (
    select 1
    from pg_catalog.pg_policy p
    where p.polrelid = v_table_oid
  )
  or exists (
    select 1
    from pg_catalog.pg_trigger t
    where t.tgrelid = v_table_oid and not t.tgisinternal
  ) then
    raise exception using
      errcode = '55000',
      message = 'Legacy public.task_dependencies indexes/RLS/triggers differ from the audited empty table; refusing cleanup.';
  end if;

  execute 'drop table public.task_dependencies restrict';

  if exists (
    select 1
    from information_schema.tables t
    where t.table_schema = 'public'
      and t.table_name = 'task_dependencies'
  ) then
    raise exception using
      errcode = '55000',
      message = 'Legacy public.task_dependencies still appears in information_schema after DROP.';
  end if;
end
$drop_legacy_task_dependencies$;

commit;
