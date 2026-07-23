-- U1: add the additive UNASSIGNED task status and its narrow auto-transition.
--
-- ASYMMETRIC ROLLBACK:
-- PostgreSQL does not support ALTER TYPE ... DROP VALUE. The paired rollback
-- removes only the trigger/function and intentionally leaves UNASSIGNED in
-- public.task_status. A full enum recreation is a separate, high-risk manual
-- operation documented in supabase/migration_reverse_enum.md.
--
-- Existing public.tasks.owner_id and public.tasks.due_date columns are already
-- nullable on the verified staging baseline. This migration asserts that shape
-- and deliberately does not alter either column.
--
-- Database naming is uppercase. UNASSIGNED maps to the Vietnamese UI label
-- "Chưa giao việc". Once both owner_id and due_date are present, an UNASSIGNED
-- task becomes NOT_STARTED (the existing planned-but-not-started state).

do $migration$
declare
  v_labels text[];
  v_expected_labels constant text[] := array[
    'NOT_STARTED',
    'IN_PROGRESS',
    'WAITING',
    'BLOCKED',
    'PENDING_APPROVAL',
    'REVISION_REQUIRED',
    'COMPLETED',
    'CANCELLED'
  ];
  v_expected_labels_with_unassigned constant text[] := array[
    'UNASSIGNED',
    'NOT_STARTED',
    'IN_PROGRESS',
    'WAITING',
    'BLOCKED',
    'PENDING_APPROVAL',
    'REVISION_REQUIRED',
    'COMPLETED',
    'CANCELLED'
  ];
  v_missing_legacy_tasks bigint;
  v_trigger_function oid;
  v_trigger_enabled "char";
  v_trigger_type smallint;
  v_trigger_columns smallint[];
  v_expected_trigger_columns smallint[];
begin
  if to_regtype('public.task_status') is null then
    raise notice 'U1 skipped: public.task_status does not exist.';
    return;
  end if;

  select array_agg(enum_value.enumlabel order by enum_value.enumsortorder)
  into v_labels
  from pg_catalog.pg_enum as enum_value
  where enum_value.enumtypid = to_regtype('public.task_status');

  if v_labels is distinct from v_expected_labels
     and v_labels is distinct from v_expected_labels_with_unassigned then
    raise notice 'U1 skipped: public.task_status labels differ from the verified baseline (%).', v_labels;
    return;
  end if;

  if to_regclass('public.tasks') is null then
    raise notice 'U1 skipped: public.tasks does not exist.';
    return;
  end if;

  if not exists (
    select 1
    from information_schema.columns as task_column
    where task_column.table_schema = 'public'
      and task_column.table_name = 'tasks'
      and task_column.column_name = 'owner_id'
      and task_column.udt_schema = 'pg_catalog'
      and task_column.udt_name = 'uuid'
      and task_column.is_nullable = 'YES'
  ) then
    raise notice 'U1 skipped: public.tasks.owner_id is missing, not uuid, or not nullable.';
    return;
  end if;

  if not exists (
    select 1
    from information_schema.columns as task_column
    where task_column.table_schema = 'public'
      and task_column.table_name = 'tasks'
      and task_column.column_name = 'due_date'
      and task_column.udt_schema = 'pg_catalog'
      and task_column.udt_name = 'date'
      and task_column.is_nullable = 'YES'
  ) then
    raise notice 'U1 skipped: public.tasks.due_date is missing, not date, or not nullable.';
    return;
  end if;

  if not exists (
    select 1
    from information_schema.columns as task_column
    where task_column.table_schema = 'public'
      and task_column.table_name = 'tasks'
      and task_column.column_name = 'status'
      and task_column.udt_schema = 'public'
      and task_column.udt_name = 'task_status'
  ) then
    raise notice 'U1 skipped: public.tasks.status does not use public.task_status.';
    return;
  end if;

  select
    task_trigger.tgfoid,
    task_trigger.tgenabled,
    task_trigger.tgtype,
    task_trigger.tgattr::smallint[]
  into
    v_trigger_function,
    v_trigger_enabled,
    v_trigger_type,
    v_trigger_columns
  from pg_catalog.pg_trigger as task_trigger
  where task_trigger.tgrelid = 'public.tasks'::regclass
    and task_trigger.tgname = 'trg_auto_transition_unassigned';

  select array_agg(task_attribute.attnum::smallint order by task_attribute.attnum)
  into v_expected_trigger_columns
  from pg_catalog.pg_attribute as task_attribute
  where task_attribute.attrelid = 'public.tasks'::regclass
    and task_attribute.attname in ('status', 'owner_id', 'due_date')
    and not task_attribute.attisdropped;

  if v_trigger_function is not null then
    select array_agg(trigger_column order by trigger_column)
    into v_trigger_columns
    from unnest(v_trigger_columns) as trigger_column;

    if v_trigger_function = to_regprocedure('public.auto_transition_unassigned_status()')
       and v_trigger_enabled in ('O', 'A')
       and v_trigger_type = 23
       and v_trigger_columns = v_expected_trigger_columns
       and 'UNASSIGNED' = any(v_labels) then
      raise notice 'U1 already applied: verified trg_auto_transition_unassigned exists and is active.';
    else
      raise notice 'U1 skipped: trg_auto_transition_unassigned exists with an unexpected definition.';
    end if;
    return;
  end if;

  if to_regprocedure('public.auto_transition_unassigned_status()') is not null then
    raise notice 'U1 skipped: auto_transition_unassigned_status() exists without its expected trigger.';
    return;
  end if;

  -- The initial staging baseline had no ownerless or dateless tasks. Refuse an
  -- initial blind apply if data drifted before U1; a backfill requires an
  -- explicit product decision. Reapply after asymmetric rollback is allowed.
  if not ('UNASSIGNED' = any(v_labels)) then
    select count(*)
    into v_missing_legacy_tasks
    from public.tasks as task
    where task.owner_id is null
       or task.due_date is null;

    if v_missing_legacy_tasks > 0 then
      raise notice 'U1 skipped: % legacy task(s) now miss owner_id or due_date; decide backfill before applying.', v_missing_legacy_tasks;
      return;
    end if;

    execute
      'alter type public.task_status add value ''UNASSIGNED'' before ''NOT_STARTED''';
  else
    raise notice 'U1 reapply: enum value UNASSIGNED already exists and is intentionally reused.';
  end if;

  -- Compare UNASSIGNED as text so function validation never tries to consume a
  -- newly-added enum value before the ALTER TYPE transaction commits.
  execute $function_ddl$
    create or replace function public.auto_transition_unassigned_status()
    returns trigger
    language plpgsql
    set search_path = pg_catalog
    as $function_body$
    begin
      if new.status::text = 'UNASSIGNED'
         and new.owner_id is not null
         and new.due_date is not null then
        new.status := 'NOT_STARTED';
      end if;

      return new;
    end;
    $function_body$;
  $function_ddl$;

  execute $comment_ddl$
    comment on function public.auto_transition_unassigned_status() is
      'Tasks only: UNASSIGNED transitions to NOT_STARTED once owner_id and due_date are both present. Does not apply to task_steps.';
  $comment_ddl$;

  -- Trigger functions are internal database implementation details.
  execute
    'revoke all on function public.auto_transition_unassigned_status() from public';
  execute
    'revoke all on function public.auto_transition_unassigned_status() from anon, authenticated, service_role';

  execute $trigger_ddl$
    create trigger trg_auto_transition_unassigned
    before insert or update of status, owner_id, due_date
    on public.tasks
    for each row
    execute function public.auto_transition_unassigned_status();
  $trigger_ddl$;
end
$migration$;
