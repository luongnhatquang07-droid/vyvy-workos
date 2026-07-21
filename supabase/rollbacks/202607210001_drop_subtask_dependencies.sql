-- A1a-only rollback for 202607210001_add_subtask_dependencies.sql.
-- WARNING: this drops all dependency-edge data. Run only before downstream
-- dependency migrations exist, or after exporting/backing up the graph.

begin;

drop trigger if exists tasks_soft_delete_subtask_dependencies
  on public.tasks;
drop function if exists public.soft_delete_subtask_dependencies_for_task();

-- Dropping the table also removes its RLS policies and table-owned triggers.
-- No CASCADE. PostgreSQL may not record table dependencies from PL/pgSQL bodies,
-- so the operator must first verify that A1b+ RPCs have not been applied; later
-- phases need a phase-aware rollback in reverse dependency order.
drop table if exists public.subtask_dependencies;

drop function if exists public.validate_subtask_dependency_endpoints();
drop function if exists public.enforce_subtask_dependency_soft_delete();
drop function if exists public.can_access_subtask_dependency(uuid, uuid, uuid, uuid, text);

commit;
