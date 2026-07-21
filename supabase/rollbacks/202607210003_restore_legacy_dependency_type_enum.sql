-- Schema-only rollback for 202607210003_drop_legacy_dependency_type_enum.sql.
--
-- This restores the audited orphaned legacy enum only. It does not restore the
-- legacy task_dependencies table or data. If both cleanup migrations are rolled
-- back, restore this enum before running 202607210002_restore_legacy_task_dependencies.sql.

do $restore_legacy_dependency_type_enum$
declare
  v_type_oid oid := pg_catalog.to_regtype('public.dependency_type');
  v_type_kind "char";
  v_labels text[];
  v_owner text;
  v_acl aclitem[];
  v_description text;
  v_array_oid oid;
begin
  if v_type_oid is not null then
    select
      t.typtype,
      pg_catalog.pg_get_userbyid(t.typowner),
      t.typacl,
      pg_catalog.obj_description(t.oid, 'pg_type'),
      t.typarray,
      (
        select pg_catalog.array_agg(e.enumlabel::text order by e.enumsortorder)
        from pg_catalog.pg_enum e
        where e.enumtypid = t.oid
      )
    into v_type_kind, v_owner, v_acl, v_description, v_array_oid, v_labels
    from pg_catalog.pg_type t
    join pg_catalog.pg_namespace n on n.oid = t.typnamespace
    where t.oid = v_type_oid
      and n.nspname = 'public'
      and t.typname = 'dependency_type';

    if v_type_kind = 'e'::"char"
      and v_owner = 'postgres'
      and v_acl is null
      and v_description is null
      and exists (
        select 1
        from pg_catalog.pg_type array_type
        where array_type.oid = v_array_oid
          and array_type.typelem = v_type_oid
          and array_type.typcategory = 'A'
      )
      and v_labels = array[
        'FINISH_TO_START',
        'START_TO_START',
        'FINISH_TO_FINISH',
        'START_TO_FINISH'
      ]::text[] then
      raise notice 'Legacy public.dependency_type already exists with the audited shape; rollback is a no-op.';
      return;
    end if;

    raise exception using
      errcode = '55000',
      message = 'public.dependency_type already exists with a different shape; refusing rollback.';
  end if;

  execute $create_enum$
    create type public.dependency_type as enum (
      'FINISH_TO_START',
      'START_TO_START',
      'FINISH_TO_FINISH',
      'START_TO_FINISH'
    )
  $create_enum$;

  v_type_oid := pg_catalog.to_regtype('public.dependency_type');

  select
    pg_catalog.pg_get_userbyid(t.typowner),
    t.typacl,
    pg_catalog.obj_description(t.oid, 'pg_type'),
    t.typarray,
    (
      select pg_catalog.array_agg(e.enumlabel::text order by e.enumsortorder)
      from pg_catalog.pg_enum e
      where e.enumtypid = t.oid
    )
  into v_owner, v_acl, v_description, v_array_oid, v_labels
  from pg_catalog.pg_type t
  where t.oid = v_type_oid;

  if v_type_oid is null
    or v_owner is distinct from 'postgres'
    or v_acl is not null
    or v_description is not null
    or not exists (
      select 1
      from pg_catalog.pg_type array_type
      where array_type.oid = v_array_oid
        and array_type.typelem = v_type_oid
        and array_type.typcategory = 'A'
    )
    or v_labels is distinct from array[
      'FINISH_TO_START',
      'START_TO_START',
      'FINISH_TO_FINISH',
      'START_TO_FINISH'
    ]::text[] then
    raise exception using
      errcode = '55000',
      message = 'Legacy public.dependency_type rollback verification failed.';
  end if;
end;
$restore_legacy_dependency_type_enum$;
