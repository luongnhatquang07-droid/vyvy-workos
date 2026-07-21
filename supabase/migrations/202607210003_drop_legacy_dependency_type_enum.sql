-- Remove the orphaned legacy dependency enum after task_dependencies cleanup.
--
-- This migration is deliberately fail-closed. It only removes the exact audited
-- four-label enum and refuses to proceed if any catalog consumer appears.

do $drop_legacy_dependency_type_enum$
declare
  v_type_oid oid := pg_catalog.to_regtype('public.dependency_type');
  v_array_oid oid;
  v_type_kind "char";
  v_owner text;
  v_acl aclitem[];
  v_description text;
  v_is_preferred boolean;
  v_is_not_null boolean;
  v_labels text[];
  v_column_usage_count bigint;
  v_external_dependency_count bigint;
  v_extension_membership_count bigint;
begin
  if v_type_oid is null then
    raise notice 'Legacy public.dependency_type is already absent; cleanup is a no-op.';
    return;
  end if;

  select
    t.typtype,
    t.typarray,
    pg_catalog.pg_get_userbyid(t.typowner),
    t.typacl,
    pg_catalog.obj_description(t.oid, 'pg_type'),
    t.typispreferred,
    t.typnotnull
  into
    v_type_kind,
    v_array_oid,
    v_owner,
    v_acl,
    v_description,
    v_is_preferred,
    v_is_not_null
  from pg_catalog.pg_type t
  join pg_catalog.pg_namespace n on n.oid = t.typnamespace
  where t.oid = v_type_oid
    and n.nspname = 'public'
    and t.typname = 'dependency_type';

  if v_type_kind is distinct from 'e'::"char" then
    raise exception using
      errcode = '55000',
      message = 'public.dependency_type exists but is not the audited enum; refusing cleanup.';
  end if;

  if v_owner is distinct from 'postgres'
    or v_acl is not null
    or v_description is not null
    or v_is_preferred is distinct from false
    or v_is_not_null is distinct from false then
    raise exception using
      errcode = '55000',
      message = 'public.dependency_type ownership/ACL/metadata differs from the audited enum; refusing cleanup.';
  end if;

  select pg_catalog.array_agg(e.enumlabel::text order by e.enumsortorder)
  into v_labels
  from pg_catalog.pg_enum e
  where e.enumtypid = v_type_oid;

  if v_labels is distinct from array[
    'FINISH_TO_START',
    'START_TO_START',
    'FINISH_TO_FINISH',
    'START_TO_FINISH'
  ]::text[] then
    raise exception using
      errcode = '55000',
      message = 'public.dependency_type labels differ from the audited legacy enum; refusing cleanup.';
  end if;

  if v_array_oid is null
    or v_array_oid = 0
    or not exists (
      select 1
      from pg_catalog.pg_type array_type
      where array_type.oid = v_array_oid
        and array_type.typelem = v_type_oid
        and array_type.typcategory = 'A'
    ) then
    raise exception using
      errcode = '55000',
      message = 'public.dependency_type companion array differs from the audited enum; refusing cleanup.';
  end if;

  with recursive type_closure(type_oid) as (
    select v_type_oid
    union
    select v_array_oid
    union
    select child.oid
    from pg_catalog.pg_type child
    join type_closure parent
      on child.typbasetype = parent.type_oid
      or child.typelem = parent.type_oid
  )
  select count(*)
  into v_column_usage_count
  from type_closure tc
  join pg_catalog.pg_attribute attribute on attribute.atttypid = tc.type_oid
  join pg_catalog.pg_class relation on relation.oid = attribute.attrelid
  where attribute.attnum > 0
    and not attribute.attisdropped
    and relation.relkind in ('r', 'p', 'v', 'm', 'f');

  if v_column_usage_count <> 0 then
    raise exception using
      errcode = '55000',
      message = pg_catalog.format(
        'public.dependency_type has %s live column usage(s); refusing cleanup.',
        v_column_usage_count
      );
  end if;

  select count(*)
  into v_external_dependency_count
  from pg_catalog.pg_depend dependency
  left join pg_catalog.pg_type dependent_type
    on dependency.classid = 'pg_catalog.pg_type'::pg_catalog.regclass
    and dependent_type.oid = dependency.objid
  where dependency.refclassid = 'pg_catalog.pg_type'::pg_catalog.regclass
    and dependency.refobjid in (v_type_oid, v_array_oid)
    and not (
      dependency.refobjid = v_type_oid
      and dependency.classid = 'pg_catalog.pg_type'::pg_catalog.regclass
      and dependency.objid = v_array_oid
      and dependency.objsubid = 0
      and dependency.deptype = 'i'
      and dependent_type.typelem = v_type_oid
    );

  if v_external_dependency_count <> 0 then
    raise exception using
      errcode = '55000',
      message = pg_catalog.format(
        'public.dependency_type has %s external catalog dependency/dependencies; refusing cleanup.',
        v_external_dependency_count
      );
  end if;

  select count(*)
  into v_extension_membership_count
  from pg_catalog.pg_depend dependency
  where dependency.classid = 'pg_catalog.pg_type'::pg_catalog.regclass
    and dependency.objid in (v_type_oid, v_array_oid)
    and dependency.refclassid = 'pg_catalog.pg_extension'::pg_catalog.regclass;

  if v_extension_membership_count <> 0 then
    raise exception using
      errcode = '55000',
      message = 'public.dependency_type belongs to an extension; refusing cleanup.';
  end if;

  execute 'drop type public.dependency_type restrict';

  if pg_catalog.to_regtype('public.dependency_type') is not null then
    raise exception using
      errcode = '55000',
      message = 'Legacy public.dependency_type still exists after DROP TYPE.';
  end if;
end;
$drop_legacy_dependency_type_enum$;
