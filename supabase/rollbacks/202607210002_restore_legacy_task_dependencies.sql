-- Schema-only rollback for 202607210002_drop_legacy_task_dependencies.sql.
-- This reconstructs the audited EMPTY legacy table so the cleanup migration is
-- structurally reversible. It is not the approved production dependency model,
-- restores no historical data, and deliberately does not restore the audited
-- insecure anon/authenticated CRUD grants.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';
set local idle_in_transaction_session_timeout = '60s';
set local search_path = pg_catalog;

do $restore_legacy_guard$
begin
  if to_regclass('public.task_dependencies') is not null then
    raise exception using
      errcode = '55000',
      message = 'public.task_dependencies already exists; refusing to overwrite it during legacy rollback.';
  end if;

  if to_regclass('public.subtask_dependencies') is not null then
    raise exception using
      errcode = '55000',
      message = 'public.subtask_dependencies exists; roll it back before restoring the competing legacy table.';
  end if;

  if to_regclass('public.tasks') is null then
    raise exception using
      errcode = '55000',
      message = 'public.tasks is missing; legacy task_dependencies cannot be restored.';
  end if;

  if to_regtype('public.dependency_type') is null
    or not exists (
      select 1
      from pg_catalog.pg_enum e
      where e.enumtypid = 'public.dependency_type'::pg_catalog.regtype
        and e.enumlabel = 'FINISH_TO_START'
    ) then
    raise exception using
      errcode = '55000',
      message = 'public.dependency_type/FINISH_TO_START is missing; legacy task_dependencies cannot be restored.';
  end if;
end
$restore_legacy_guard$;

create table public.task_dependencies (
  id uuid not null default pg_catalog.gen_random_uuid(),
  task_id uuid not null,
  depends_on_task_id uuid not null,
  dependency_type public.dependency_type null
    default 'FINISH_TO_START'::public.dependency_type,
  created_at timestamptz null default pg_catalog.now(),
  constraint task_dependencies_pkey primary key (id),
  constraint task_dependencies_task_id_depends_on_task_id_key
    unique (task_id, depends_on_task_id),
  constraint task_dependencies_task_id_fkey
    foreign key (task_id)
    references public.tasks(id) on update no action on delete cascade,
  constraint task_dependencies_depends_on_task_id_fkey
    foreign key (depends_on_task_id)
    references public.tasks(id) on update no action on delete cascade
);

comment on table public.task_dependencies is
  'Rollback reconstruction of the removed empty legacy table; schema only; not approved production dependency storage; no row data restored.';
comment on column public.task_dependencies.task_id is
  'Legacy direction: dependent task.';
comment on column public.task_dependencies.depends_on_task_id is
  'Legacy direction: prerequisite task.';

-- Supabase default privileges may recreate the insecure grants found by the
-- audit. The rollback restores table shape, not the known-vulnerable ACL.
revoke all on table public.task_dependencies
  from public, anon, authenticated, service_role;

do $verify_legacy_restore$
declare
  v_table_oid oid := to_regclass('public.task_dependencies');
begin
  if v_table_oid is null then
    raise exception using
      errcode = '55000',
      message = 'Legacy rollback verification failed: table is missing.';
  end if;

  if (
    select count(*)
    from pg_catalog.pg_attribute a
    where a.attrelid = v_table_oid and a.attnum > 0 and not a.attisdropped
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
      message = 'Legacy rollback verification failed: column shape mismatch.';
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
      message = 'Legacy rollback verification failed: default mismatch.';
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
  )
  or (
    select count(*)
    from pg_catalog.pg_index i
    where i.indrelid = v_table_oid
      and i.indisunique and i.indisvalid and i.indisready and i.indpred is null
  ) <> 2
  or exists (select 1 from public.task_dependencies) then
    raise exception using
      errcode = '55000',
      message = 'Legacy rollback verification failed: constraint/index/data mismatch.';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_class c
    where c.oid = v_table_oid
      and (c.relrowsecurity or c.relforcerowsecurity)
  )
  or exists (
    select 1 from pg_catalog.pg_policy p where p.polrelid = v_table_oid
  )
  or exists (
    select 1
    from pg_catalog.pg_trigger t
    where t.tgrelid = v_table_oid and not t.tgisinternal
  ) then
    raise exception using
      errcode = '55000',
      message = 'Legacy rollback verification failed: unexpected RLS policy or trigger.';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_class c
    cross join lateral pg_catalog.aclexplode(
      coalesce(c.relacl, pg_catalog.acldefault('r', c.relowner))
    ) acl
    where c.oid = v_table_oid
      and (
        acl.grantee = 0
        or acl.grantee in (
          select r.oid
          from pg_catalog.pg_roles r
          where r.rolname in ('anon', 'authenticated', 'service_role')
        )
      )
  ) then
    raise exception using
      errcode = '55000',
      message = 'Legacy rollback verification failed: app-role/PUBLIC privileges were restored unexpectedly.';
  end if;

  if pg_catalog.obj_description(v_table_oid, 'pg_class')
      <> 'Rollback reconstruction of the removed empty legacy table; schema only; not approved production dependency storage; no row data restored.'
  or pg_catalog.col_description(v_table_oid, 2) <> 'Legacy direction: dependent task.'
  or pg_catalog.col_description(v_table_oid, 3) <> 'Legacy direction: prerequisite task.' then
    raise exception using
      errcode = '55000',
      message = 'Legacy rollback verification failed: warning/direction comments mismatch.';
  end if;

  if pg_catalog.obj_description(v_table_oid, 'pg_class') is null then
    raise exception using
      errcode = '55000',
      message = 'Legacy rollback verification failed: audit warning comment is missing.';
  end if;
end
$verify_legacy_restore$;

commit;
