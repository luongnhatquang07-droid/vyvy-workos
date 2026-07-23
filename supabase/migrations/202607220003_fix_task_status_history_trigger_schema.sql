-- Fix required for RPCs using search_path='' - see
-- audit/U4_HTTP500_INVESTIGATION.md.
--
-- Public trigger functions audited before this migration:
--   - auto_transition_unassigned_status(): no external object reference
--   - check_completion_gate(): all table/catalog references qualified by U4
--   - enforce_subtask_dependency_soft_delete(): references public.people
--   - log_task_status(): FIXED HERE; target is public.task_status_history
--   - soft_delete_subtask_dependencies_for_task(): references
--     public.subtask_dependencies
--   - validate_subtask_dependency_endpoints(): references public.projects,
--     public.tasks, and public.people
--
-- Business behavior and execution context are unchanged. This replacement
-- only fixes object resolution.

do $migration$
declare
  v_trigger_count integer;
begin
  if pg_catalog.to_regprocedure('public.log_task_status()') is null then
    raise notice
      '202607220003 skipped: public.log_task_status() does not exist.';
    return;
  end if;

  if pg_catalog.to_regclass('public.task_status_history') is null then
    raise exception using
      errcode = '55000',
      message = '202607220003 requires public.task_status_history.';
  end if;

  select pg_catalog.count(*)
  into v_trigger_count
  from pg_catalog.pg_trigger trigger_row
  where trigger_row.tgrelid = pg_catalog.to_regclass('public.tasks')
    and trigger_row.tgname = 'trg_task_status_history'
    and not trigger_row.tgisinternal;

  if v_trigger_count <> 1 then
    raise exception using
      errcode = '55000',
      message = '202607220003 requires exactly one public.trg_task_status_history trigger.';
  end if;

  execute $ddl$
    create or replace function public.log_task_status()
    returns trigger
    language plpgsql
    as $trigger_function$
    begin
      if new.status is distinct from old.status then
        insert into public.task_status_history (
          task_id,
          from_status,
          to_status,
          changed_by
        )
        values (
          new.id,
          old.status,
          new.status,
          new.updated_by
        );
      end if;

      return new;
    end;
    $trigger_function$
  $ddl$;

  execute pg_catalog.format(
    'comment on function public.log_task_status() is %L',
    'Schema-qualified task status history trigger. Fix required for RPCs using search_path='''' - see audit/U4_HTTP500_INVESTIGATION.md.'
  );
end;
$migration$;
