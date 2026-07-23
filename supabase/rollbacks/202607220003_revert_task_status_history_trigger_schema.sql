-- Roll back 202607220003 to the exact legacy object-resolution behavior.
-- This intentionally restores the known search_path-dependent bug for
-- callers that execute with search_path=''.

do $rollback$
begin
  if pg_catalog.to_regprocedure('public.log_task_status()') is null then
    raise notice
      '202607220003 rollback skipped: public.log_task_status() does not exist.';
    return;
  end if;

  execute $ddl$
    create or replace function public.log_task_status()
    returns trigger
    language plpgsql
    as $trigger_function$
    begin
      if new.status is distinct from old.status then
        insert into task_status_history (
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

  execute 'comment on function public.log_task_status() is null';
end;
$rollback$;
