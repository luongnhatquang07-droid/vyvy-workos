-- A1b-only rollback for 202607210004_add_subtask_dependency_rpcs.sql.
-- Apply before the A1a rollback. Dependency audit rows are immutable history and
-- intentionally remain in public.audit_logs after these runtime RPCs are removed.

begin;

revoke execute on function public.add_subtask_dependency(uuid, uuid)
  from authenticated;
revoke execute on function public.delete_subtask_dependency(uuid)
  from authenticated;
revoke execute on function public.replace_subtask_dependencies(uuid, uuid[])
  from authenticated;

drop function public.add_subtask_dependency(uuid, uuid);
drop function public.delete_subtask_dependency(uuid);
drop function public.replace_subtask_dependencies(uuid, uuid[]);

drop function public.write_subtask_dependency_audit(uuid, uuid, uuid, uuid, text, uuid, jsonb, jsonb);
drop function public.subtask_dependency_would_cycle(uuid, uuid, uuid, uuid);
drop function public.resolve_subtask_dependency_write_context(uuid, uuid);

-- Restore the exact A1a direct-table posture: service_role is SELECT-only.
revoke insert, update on table public.subtask_dependencies from service_role;

commit;
