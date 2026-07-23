-- Asymmetric rollback for 202607220001_add_unassigned_task_status.sql.
--
-- This removes only the task trigger/function. Enum value UNASSIGNED is
-- intentionally retained because PostgreSQL does not support DROP VALUE.
-- For a full enum recreation, follow supabase/migration_reverse_enum.md as a
-- separately reviewed maintenance operation.

do $rollback$
begin
  if to_regclass('public.tasks') is null then
    raise notice 'U1 rollback: public.tasks does not exist; trigger removal skipped.';
  elsif exists (
    select 1
    from pg_catalog.pg_trigger as task_trigger
    where task_trigger.tgrelid = 'public.tasks'::regclass
      and task_trigger.tgname = 'trg_auto_transition_unassigned'
      and not task_trigger.tgisinternal
  ) then
    execute
      'drop trigger trg_auto_transition_unassigned on public.tasks';
  else
    raise notice 'U1 rollback: trg_auto_transition_unassigned is already absent.';
  end if;

  if to_regprocedure('public.auto_transition_unassigned_status()') is not null then
    execute
      'drop function public.auto_transition_unassigned_status()';
  else
    raise notice 'U1 rollback: auto_transition_unassigned_status() is already absent.';
  end if;
end
$rollback$;

-- Enum value UNASSIGNED cố ý giữ lại - PostgreSQL không hỗ trợ DROP VALUE.
-- Nếu rollback đầy đủ cần thiết, xem supabase/migration_reverse_enum.md để thực
-- hiện thao tác recreate enum thủ công trong một maintenance window riêng.
