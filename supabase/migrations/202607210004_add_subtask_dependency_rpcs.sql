-- Phase A1b: transactional lifecycle RPCs for public.subtask_dependencies.
--
-- Security model:
--   * authenticated clients retain SELECT through A1a RLS and may mutate only
--     by calling the three SECURITY DEFINER RPCs below;
--   * the RPC owner is service_role (BYPASSRLS, non-superuser);
--   * service_role receives only INSERT/UPDATE in addition to A1a SELECT;
--   * every real edge mutation writes an immutable public.audit_logs row in the
--     same transaction. No-op replace/delete calls intentionally add no audit
--     row because there is no mutated edge_id to use as the audit entity_id.
--
-- Actor identity is resolved server-side from auth.uid(). created_by,
-- deleted_by and audit_logs.actor_id always contain public.people.id, never an
-- auth.users UUID. Legacy ADMIN/COO profiles without a people row use NULL for
-- those actor columns; their audit JSON contains only profile_id/auth_user_id.
-- TODO(people-backfill): once every editing profile has exactly one live people
-- row, enforce non-NULL dependency/audit actors and remove the legacy fallback.

begin;

do $a1b_preflight$
declare
  v_existing_function text;
  v_target_schema_oid oid;
begin
  if pg_catalog.to_regclass('public.subtask_dependencies') is null
    or pg_catalog.to_regprocedure(
      'public.can_access_subtask_dependency(uuid,uuid,uuid,uuid,text)'
    ) is null then
    raise exception using
      errcode = '55000',
      message = 'A1a must be applied before A1b dependency RPCs.';
  end if;

  if pg_catalog.to_regclass('public.audit_logs') is null then
    raise exception using
      errcode = '55000',
      message = 'public.audit_logs is required before A1b dependency RPCs.';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_roles as role
    where role.rolname = 'service_role'
      and role.rolsuper is false
      and role.rolbypassrls is true
  ) then
    raise exception using
      errcode = '55000',
      message = 'A1b requires a non-superuser service_role with BYPASSRLS.';
  end if;

  select namespace.oid
  into v_target_schema_oid
  from pg_catalog.pg_class as relation
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = relation.relnamespace
  where relation.oid = pg_catalog.to_regclass('public.subtask_dependencies');

  if not pg_catalog.pg_has_role(current_user, 'service_role', 'MEMBER') then
    raise exception using
      errcode = '55000',
      message = 'The migration runner must be able to SET ROLE service_role before transferring RPC ownership.';
  end if;

  if not pg_catalog.has_schema_privilege(
    'service_role',
    v_target_schema_oid,
    'USAGE'
  ) or not pg_catalog.has_schema_privilege(
    'service_role',
    v_target_schema_oid,
    'CREATE'
  ) then
    raise exception using
      errcode = '55000',
      message = 'service_role must already have USAGE and CREATE on the target schema; A1b will not broaden schema privileges.';
  end if;

  if not pg_catalog.has_table_privilege(
    'service_role',
    'public.audit_logs',
    'INSERT'
  ) then
    raise exception using
      errcode = '55000',
      message = 'service_role must already have INSERT on public.audit_logs.';
  end if;

  if exists (
    select 1
    from (
      values
        ('workspace_id', 'uuid'),
        ('actor_id', 'uuid'),
        ('action', 'text'),
        ('entity_type', 'text'),
        ('entity_id', 'uuid'),
        ('before_data', 'jsonb'),
        ('after_data', 'jsonb')
    ) as required(column_name, type_name)
    where not exists (
      select 1
      from pg_catalog.pg_attribute as attribute
      join pg_catalog.pg_type as datatype
        on datatype.oid = attribute.atttypid
      where attribute.attrelid = pg_catalog.to_regclass('public.audit_logs')
        and attribute.attname = required.column_name
        and datatype.typname = required.type_name
        and attribute.attnum > 0
        and attribute.attisdropped is false
    )
  ) then
    raise exception using
      errcode = '55000',
      message = 'public.audit_logs does not have the A1b-required column shape.';
  end if;

  if exists (
    select 1
    from (
      values
        ('public.profiles'),
        ('public.workspace_memberships'),
        ('public.roles'),
        ('public.people'),
        ('public.departments'),
        ('public.projects'),
        ('public.tasks'),
        ('public.subtask_dependencies')
    ) as required(relation_name)
    where not pg_catalog.has_table_privilege(
      'service_role',
      required.relation_name,
      'SELECT'
    )
  ) then
    raise exception using
      errcode = '55000',
      message = 'service_role must already have SELECT on every table read by A1b RPCs.';
  end if;

  if exists (
    select 1
    from (
      values
        ('public.people'),
        ('public.projects'),
        ('public.tasks')
    ) as required(relation_name)
    where not pg_catalog.has_table_privilege(
      'service_role',
      required.relation_name,
      'UPDATE'
    )
  ) then
    raise exception using
      errcode = '55000',
      message = 'service_role must already have UPDATE on people, projects and tasks so RPC row locks cannot fail at runtime.';
  end if;

  if pg_catalog.to_regclass('public.user_permission_overrides') is not null
    and not pg_catalog.has_table_privilege(
      'service_role',
      'public.user_permission_overrides',
      'SELECT'
    ) then
    raise exception using
      errcode = '55000',
      message = 'service_role must have SELECT on public.user_permission_overrides when that optional RBAC table exists.';
  end if;

  select procedure.oid::pg_catalog.regprocedure::text
  into v_existing_function
  from pg_catalog.pg_proc as procedure
  where procedure.pronamespace = v_target_schema_oid
    and procedure.proname in (
      'resolve_subtask_dependency_write_context',
      'subtask_dependency_would_cycle',
      'write_subtask_dependency_audit',
      'add_subtask_dependency',
      'delete_subtask_dependency',
      'replace_subtask_dependencies'
    )
  limit 1;

  if v_existing_function is not null then
    raise exception using
      errcode = '55000',
      message = pg_catalog.format(
        'A1b function %s already exists; inspect it instead of applying over it.',
        v_existing_function
      );
  end if;
end
$a1b_preflight$;

-- This is the project-only extraction of the edit branch in A1a's
-- can_access_subtask_dependency(). It deliberately does not validate endpoints:
-- an empty bulk replace and an idempotent delete still need a project.edit check
-- even when no live prerequisite endpoint is available.
-- TODO(rbac-sync): keep this helper synchronized manually with the p_action =
-- 'edit' branch of public.can_access_subtask_dependency() whenever A1a RBAC
-- semantics change. It is duplicated because A1a intentionally does not grant
-- that endpoint-aware helper to service_role.
create function public.resolve_subtask_dependency_write_context(
  p_workspace_id uuid,
  p_project_id uuid,
  out is_allowed boolean,
  out actor_profile_id uuid,
  out actor_person_id uuid,
  out actor_auth_user_id uuid
)
returns record
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_department_id uuid;
  v_raw_role text;
  v_role text;
  v_actor_status text;
  v_project_owner_id uuid;
  v_project_owner_department_id uuid;
  v_project_assigned boolean := false;
  v_project_same_department boolean := false;
  v_project_override_found boolean := false;
  v_project_override_edit boolean := false;
  v_project_override_scope text := 'none';
  v_override_row_count bigint := 0;
  v_live_person_count integer := 0;
begin
  is_allowed := false;
  actor_profile_id := null;
  actor_person_id := null;
  actor_auth_user_id := auth.uid();

  if actor_auth_user_id is null then
    return;
  end if;

  select
    profile.id,
    person.id,
    person.department_id,
    pg_catalog.upper(pg_catalog.btrim(role.code)),
    coalesce(person.status, profile.status)
  into
    actor_profile_id,
    actor_person_id,
    v_actor_department_id,
    v_raw_role,
    v_actor_status
  from public.profiles as profile
  join public.workspace_memberships as membership
    on membership.profile_id = profile.id
   and membership.workspace_id = p_workspace_id
   and membership.is_active is true
  join public.roles as role
    on role.id = membership.role_id
  left join lateral (
    select candidate.id, candidate.department_id, candidate.status
    from public.people as candidate
    where candidate.profile_id = profile.id
      and candidate.workspace_id = p_workspace_id
      and candidate.deleted_at is null
      and (
        select pg_catalog.count(*)
        from public.people as duplicate_check
        where duplicate_check.profile_id = profile.id
          and duplicate_check.workspace_id = p_workspace_id
          and duplicate_check.deleted_at is null
      ) = 1
  ) as person on true
  where profile.auth_user_id = actor_auth_user_id;

  if not found
    or pg_catalog.lower(coalesce(v_actor_status, 'active')) in (
      'inactive',
      'suspended'
    ) then
    return;
  end if;

  select pg_catalog.count(*)
  into v_live_person_count
  from public.people as linked_person
  where linked_person.profile_id = actor_profile_id
    and linked_person.workspace_id = p_workspace_id
    and linked_person.deleted_at is null;

  if v_live_person_count > 1 then
    return;
  end if;

  v_role := case v_raw_role
    when 'PROJECT_COORDINATOR' then 'COO'
    when 'CEO_READONLY' then 'CEO'
    else v_raw_role
  end;

  if v_raw_role = 'CEO_READONLY' then
    return;
  end if;

  -- Only the approved legacy ADMIN/COO path may operate without a people row.
  if actor_person_id is null and v_role not in ('ADMIN', 'COO') then
    return;
  end if;

  select
    project.owner_id,
    owner.department_id
  into
    v_project_owner_id,
    v_project_owner_department_id
  from public.projects as project
  left join public.people as owner
    on owner.id = project.owner_id
   and owner.workspace_id = p_workspace_id
   and owner.deleted_at is null
  where project.id = p_project_id
    and project.workspace_id = p_workspace_id
    and project.deleted_at is null;

  if not found then
    return;
  end if;

  v_project_assigned := coalesce(
    actor_person_id is not null
      and actor_person_id = v_project_owner_id,
    false
  );
  v_project_same_department := coalesce(
    actor_person_id is not null
      and v_project_owner_department_id is not null
      and (
        v_actor_department_id = v_project_owner_department_id
        or exists (
          select 1
          from public.departments as department
          where department.workspace_id = p_workspace_id
            and department.id = v_project_owner_department_id
            and department.head_person_id = actor_person_id
            and department.deleted_at is null
        )
      ),
    false
  );

  if pg_catalog.to_regclass('public.user_permission_overrides') is not null then
    begin
      execute $override$
        select permission.can_edit, permission.scope
        from public.user_permission_overrides as permission
        where permission.profile_id = $1
          and permission.module = 'projects'
          and permission.is_enabled is true
        limit 1
      $override$
      into v_project_override_edit, v_project_override_scope
      using actor_profile_id;

      get diagnostics v_override_row_count = row_count;
      v_project_override_found := v_override_row_count > 0;
    exception
      when undefined_table or undefined_column then
        v_project_override_found := false;
    end;
  end if;

  if v_role = 'ADMIN' then
    is_allowed := true;
  elsif v_project_override_found then
    if v_project_override_edit then
      is_allowed := case v_project_override_scope
        when 'company' then true
        when 'department' then v_project_same_department
        when 'own' then v_project_assigned
        when 'assigned_projects' then v_project_assigned
        else false
      end;
    else
      is_allowed := false;
    end if;
  else
    is_allowed := case
      when v_role in ('ADMIN', 'COO') then true
      when v_role = 'DEPARTMENT_HEAD' then
        v_project_same_department or v_project_assigned
      else false
    end;
  end if;

  return;
end;
$$;

comment on function public.resolve_subtask_dependency_write_context(uuid, uuid) is
  'Internal A1b project.edit resolver based on A1a RBAC logic; endpoint-free so empty replace and idempotent delete remain authorizable.';

create function public.subtask_dependency_would_cycle(
  p_workspace_id uuid,
  p_project_id uuid,
  p_from_subtask_id uuid,
  p_to_subtask_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with recursive reachable(task_id) as (
    select p_to_subtask_id
    union
    select dependency.to_subtask_id
    from public.subtask_dependencies as dependency
    join reachable
      on reachable.task_id = dependency.from_subtask_id
    where dependency.workspace_id = p_workspace_id
      and dependency.project_id = p_project_id
      and dependency.deleted_at is null
  )
  select exists (
    select 1
    from reachable
    where reachable.task_id = p_from_subtask_id
  );
$$;

comment on function public.subtask_dependency_would_cycle(uuid, uuid, uuid, uuid) is
  'Internal A1b directed reachability check: from_subtask_id is prerequisite and to_subtask_id is dependent.';

create function public.write_subtask_dependency_audit(
  p_workspace_id uuid,
  p_actor_person_id uuid,
  p_actor_profile_id uuid,
  p_actor_auth_user_id uuid,
  p_action text,
  p_edge_id uuid,
  p_before_data jsonb,
  p_after_data jsonb
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor_context jsonb;
begin
  v_actor_context := pg_catalog.jsonb_build_object(
    'profile_id', p_actor_profile_id,
    'auth_user_id', p_actor_auth_user_id
  );

  insert into public.audit_logs (
    workspace_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    before_data,
    after_data
  ) values (
    p_workspace_id,
    p_actor_person_id,
    p_action,
    'subtask_dependency',
    p_edge_id,
    case
      when p_before_data is null then null
      else p_before_data || pg_catalog.jsonb_build_object(
        'actor_context', v_actor_context
      )
    end,
    case
      when p_after_data is null then null
      else p_after_data || pg_catalog.jsonb_build_object(
        'actor_context', v_actor_context
      )
    end
  );
end;
$$;

comment on function public.write_subtask_dependency_audit(uuid, uuid, uuid, uuid, text, uuid, jsonb, jsonb) is
  'Internal atomic dependency audit writer; actor JSON is ID-only and contains no PII or role-membership detail.';

create function public.add_subtask_dependency(
  from_id uuid,
  to_id uuid
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_initial_workspace_id uuid;
  v_initial_project_id uuid;
  v_workspace_id uuid;
  v_project_id uuid;
  v_from_workspace_id uuid;
  v_from_project_id uuid;
  v_from_deleted_at timestamptz;
  v_to_deleted_at timestamptz;
  v_initial_context record;
  v_context record;
  v_active_count integer;
  v_edge public.subtask_dependencies%rowtype;
begin
  if auth.uid() is null then
    raise exception using
      errcode = 'DP008',
      message = 'project.edit permission is required to add a dependency.';
  end if;

  if from_id is null or to_id is null then
    raise exception using
      errcode = 'DP007',
      message = 'Both dependency endpoints must be active tasks.';
  end if;

  if from_id = to_id then
    raise exception using
      errcode = 'DP004',
      message = 'A task cannot depend on itself.';
  end if;

  select task.workspace_id, task.project_id, task.deleted_at
  into v_initial_workspace_id, v_initial_project_id, v_to_deleted_at
  from public.tasks as task
  where task.id = to_id;

  if not found then
    -- A missing task has no project against which project.edit can be proven.
    -- Fail closed instead of exposing task existence to arbitrary callers.
    raise exception using
      errcode = 'DP008',
      message = 'project.edit permission is required to add a dependency.';
  end if;

  select context.*
  into v_initial_context
  from public.resolve_subtask_dependency_write_context(
    v_initial_workspace_id,
    v_initial_project_id
  ) as context;

  if not coalesce(v_initial_context.is_allowed, false) then
    raise exception using
      errcode = 'DP008',
      message = 'project.edit permission is required to add a dependency.';
  end if;

  if v_to_deleted_at is not null then
    raise exception using
      errcode = 'DP007',
      message = 'The dependent task is missing or soft-deleted.';
  end if;

  -- Prevalidate the prerequisite before locking so an authorized editor cannot
  -- use a cross-project UUID to contend on an unrelated task row. The same
  -- checks run again after the deterministic row locks close reassignment races.
  select task.workspace_id, task.project_id, task.deleted_at
  into v_from_workspace_id, v_from_project_id, v_from_deleted_at
  from public.tasks as task
  where task.id = from_id;

  if not found or v_from_deleted_at is not null then
    raise exception using
      errcode = 'DP007',
      message = 'The prerequisite task is missing or soft-deleted.';
  end if;

  if v_from_workspace_id <> v_initial_workspace_id
    or v_from_project_id <> v_initial_project_id then
    raise exception using
      errcode = 'DP003',
      message = 'Cross-project dependencies are not allowed in Phase A.';
  end if;

  -- Lock actor first. people deletion may null FKs on projects/tasks/edges, so
  -- every RPC uses actor -> project -> tasks -> edges to avoid lock inversion.
  if v_initial_context.actor_person_id is not null then
    perform 1
    from public.people as actor
    where actor.id = v_initial_context.actor_person_id
      and actor.workspace_id = v_initial_workspace_id
      and actor.profile_id = v_initial_context.actor_profile_id
      and actor.deleted_at is null
    for update;

    if not found then
      raise exception using
        errcode = 'DP008',
        message = 'The dependency actor is no longer an active workspace person.';
    end if;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_initial_project_id::text, 0)
  );

  perform 1
  from public.projects as project
  where project.id = v_initial_project_id
    and project.workspace_id = v_initial_workspace_id
    and project.deleted_at is null
  for update;

  if not found then
    raise exception using
      errcode = 'DP007',
      message = 'The dependency project is missing or soft-deleted.';
  end if;

  perform 1
  from public.tasks as task
  where task.id in (from_id, to_id)
  order by task.id
  for update;

  select task.workspace_id, task.project_id, task.deleted_at
  into v_workspace_id, v_project_id, v_to_deleted_at
  from public.tasks as task
  where task.id = to_id;

  if not found or v_to_deleted_at is not null then
    raise exception using
      errcode = 'DP007',
      message = 'The dependent task is missing or soft-deleted.';
  end if;

  if v_workspace_id <> v_initial_workspace_id
    or v_project_id <> v_initial_project_id then
    raise exception using
      errcode = 'DP003',
      message = 'The dependent task changed project during dependency creation; retry the operation.';
  end if;

  select context.*
  into v_context
  from public.resolve_subtask_dependency_write_context(
    v_workspace_id,
    v_project_id
  ) as context;

  if not coalesce(v_context.is_allowed, false) then
    raise exception using
      errcode = 'DP008',
      message = 'project.edit permission is required to add a dependency.';
  end if;

  if v_context.actor_profile_id is distinct from v_initial_context.actor_profile_id
    or v_context.actor_person_id is distinct from v_initial_context.actor_person_id
    or v_context.actor_auth_user_id is distinct from v_initial_context.actor_auth_user_id then
    raise exception using
      errcode = 'DP008',
      message = 'The dependency actor context changed during the operation; retry.';
  end if;

  select task.workspace_id, task.project_id, task.deleted_at
  into v_from_workspace_id, v_from_project_id, v_from_deleted_at
  from public.tasks as task
  where task.id = from_id;

  if not found or v_from_deleted_at is not null then
    raise exception using
      errcode = 'DP007',
      message = 'The prerequisite task is missing or soft-deleted.';
  end if;

  if v_from_workspace_id <> v_workspace_id
    or v_from_project_id <> v_project_id then
    raise exception using
      errcode = 'DP003',
      message = 'Cross-project dependencies are not allowed in Phase A.';
  end if;

  if exists (
    select 1
    from public.subtask_dependencies as dependency
    where dependency.from_subtask_id = from_id
      and dependency.to_subtask_id = to_id
      and dependency.deleted_at is null
  ) then
    raise exception using
      errcode = 'DP005',
      message = 'The active dependency already exists.';
  end if;

  select pg_catalog.count(*)
  into v_active_count
  from public.subtask_dependencies as dependency
  where dependency.workspace_id = v_workspace_id
    and dependency.project_id = v_project_id
    and dependency.to_subtask_id = to_id
    and dependency.deleted_at is null;

  if v_active_count >= 20 then
    raise exception using
      errcode = 'DP002',
      message = 'A task cannot have more than 20 active prerequisites.';
  end if;

  if public.subtask_dependency_would_cycle(
    v_workspace_id,
    v_project_id,
    from_id,
    to_id
  ) then
    raise exception using
      errcode = 'DP001',
      message = 'The dependency would create a cycle.';
  end if;

  begin
    insert into public.subtask_dependencies (
      workspace_id,
      project_id,
      from_subtask_id,
      to_subtask_id,
      created_by
    ) values (
      v_workspace_id,
      v_project_id,
      from_id,
      to_id,
      v_context.actor_person_id
    )
    returning * into v_edge;
  exception
    when unique_violation then
      raise exception using
        errcode = 'DP005',
        message = 'The active dependency already exists.';
  end;

  perform public.write_subtask_dependency_audit(
    v_workspace_id,
    v_context.actor_person_id,
    v_context.actor_profile_id,
    v_context.actor_auth_user_id,
    'subtask_dependency.added',
    v_edge.id,
    null,
    pg_catalog.to_jsonb(v_edge)
  );

  return v_edge.id;
end;
$$;

comment on function public.add_subtask_dependency(uuid, uuid) is
  'Atomically validates, cycle-checks, creates and audits one same-project prerequisite edge. DP001-DP008 are stable service errors.';

create function public.delete_subtask_dependency(edge_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_initial_edge public.subtask_dependencies%rowtype;
  v_edge public.subtask_dependencies%rowtype;
  v_before_data jsonb;
  v_initial_context record;
  v_context record;
begin
  if auth.uid() is null then
    raise exception using
      errcode = 'DP008',
      message = 'project.edit permission is required to delete a dependency.';
  end if;

  if edge_id is null then
    raise exception using
      errcode = 'DP006',
      message = 'The dependency edge was not found.';
  end if;

  select dependency.*
  into v_initial_edge
  from public.subtask_dependencies as dependency
  where dependency.id = edge_id;

  if not found then
    raise exception using
      errcode = 'DP006',
      message = 'The dependency edge was not found.';
  end if;

  select context.*
  into v_initial_context
  from public.resolve_subtask_dependency_write_context(
    v_initial_edge.workspace_id,
    v_initial_edge.project_id
  ) as context;

  if not coalesce(v_initial_context.is_allowed, false) then
    raise exception using
      errcode = 'DP008',
      message = 'project.edit permission is required to delete a dependency.';
  end if;

  -- An already-retired edge is an authorized no-op; no mutation means no lock
  -- or audit row is needed.
  if v_initial_edge.deleted_at is not null then
    return;
  end if;

  if v_initial_context.actor_person_id is not null then
    perform 1
    from public.people as actor
    where actor.id = v_initial_context.actor_person_id
      and actor.workspace_id = v_initial_edge.workspace_id
      and actor.profile_id = v_initial_context.actor_profile_id
      and actor.deleted_at is null
    for update;

    if not found then
      raise exception using
        errcode = 'DP008',
        message = 'The dependency actor is no longer an active workspace person.';
    end if;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_initial_edge.project_id::text, 0)
  );

  perform 1
  from public.projects as project
  where project.id = v_initial_edge.project_id
    and project.workspace_id = v_initial_edge.workspace_id
    and project.deleted_at is null
  for update;

  if not found then
    raise exception using
      errcode = 'DP008',
      message = 'project.edit permission is required to delete a dependency.';
  end if;

  -- Match the task-soft-delete trigger lock order: endpoint rows before edge row.
  perform 1
  from public.tasks as task
  where task.id in (
    v_initial_edge.from_subtask_id,
    v_initial_edge.to_subtask_id
  )
  order by task.id
  for update;

  select dependency.*
  into v_edge
  from public.subtask_dependencies as dependency
  where dependency.id = edge_id
  for update;

  if not found then
    raise exception using
      errcode = 'DP006',
      message = 'The dependency edge was not found.';
  end if;

  select context.*
  into v_context
  from public.resolve_subtask_dependency_write_context(
    v_edge.workspace_id,
    v_edge.project_id
  ) as context;

  if not coalesce(v_context.is_allowed, false) then
    raise exception using
      errcode = 'DP008',
      message = 'project.edit permission is required to delete a dependency.';
  end if;

  if v_context.actor_profile_id is distinct from v_initial_context.actor_profile_id
    or v_context.actor_person_id is distinct from v_initial_context.actor_person_id
    or v_context.actor_auth_user_id is distinct from v_initial_context.actor_auth_user_id then
    raise exception using
      errcode = 'DP008',
      message = 'The dependency actor context changed during the operation; retry.';
  end if;

  -- Idempotent lifecycle semantics: an already-retired edge is a true no-op.
  if v_edge.deleted_at is not null then
    return;
  end if;

  v_before_data := pg_catalog.to_jsonb(v_edge);

  update public.subtask_dependencies as dependency
  set
    deleted_at = pg_catalog.now(),
    deleted_by = v_context.actor_person_id
  where dependency.id = edge_id
    and dependency.deleted_at is null
  returning dependency.* into v_edge;

  if not found then
    return;
  end if;

  perform public.write_subtask_dependency_audit(
    v_edge.workspace_id,
    v_context.actor_person_id,
    v_context.actor_profile_id,
    v_context.actor_auth_user_id,
    'subtask_dependency.deleted',
    v_edge.id,
    v_before_data,
    pg_catalog.to_jsonb(v_edge)
  );

  return;
end;
$$;

comment on function public.delete_subtask_dependency(uuid) is
  'Soft-deletes and audits one dependency edge; repeated deletion of an existing retired edge is an authorized no-op.';

create function public.replace_subtask_dependencies(
  dependent_id uuid,
  new_prerequisite_ids uuid[]
)
returns uuid[]
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_prerequisite_ids uuid[] := coalesce(
    new_prerequisite_ids,
    '{}'::uuid[]
  );
  v_initial_workspace_id uuid;
  v_initial_project_id uuid;
  v_workspace_id uuid;
  v_project_id uuid;
  v_dependent_deleted_at timestamptz;
  v_initial_context record;
  v_context record;
  v_prerequisite_id uuid;
  v_input_count integer;
  v_distinct_count integer;
  v_active_task_count integer;
  v_before_edge public.subtask_dependencies%rowtype;
  v_after_edge public.subtask_dependencies%rowtype;
  v_result uuid[];
begin
  if auth.uid() is null then
    raise exception using
      errcode = 'DP008',
      message = 'project.edit permission is required to replace dependencies.';
  end if;

  if dependent_id is null then
    raise exception using
      errcode = 'DP007',
      message = 'The dependent task is missing or soft-deleted.';
  end if;

  -- Reject malformed or oversized caller input before evaluating ANY(...) or
  -- taking row locks. This bounds each request to the approved 20-edge limit.
  v_input_count := pg_catalog.cardinality(v_prerequisite_ids);

  if v_input_count > 20 then
    raise exception using
      errcode = 'DP002',
      message = 'A task cannot have more than 20 active prerequisites.';
  end if;

  if exists (
    select 1
    from pg_catalog.unnest(v_prerequisite_ids) as input(prerequisite_id)
    where input.prerequisite_id is null
  ) then
    raise exception using
      errcode = 'DP007',
      message = 'Every prerequisite must reference an active task.';
  end if;

  select pg_catalog.count(distinct input.prerequisite_id)::integer
  into v_distinct_count
  from pg_catalog.unnest(v_prerequisite_ids) as input(prerequisite_id);

  if v_input_count <> v_distinct_count then
    raise exception using
      errcode = 'DP005',
      message = 'The prerequisite list contains a duplicate edge.';
  end if;

  if dependent_id = any(v_prerequisite_ids) then
    raise exception using
      errcode = 'DP004',
      message = 'A task cannot depend on itself.';
  end if;

  select task.workspace_id, task.project_id, task.deleted_at
  into
    v_initial_workspace_id,
    v_initial_project_id,
    v_dependent_deleted_at
  from public.tasks as task
  where task.id = dependent_id;

  if not found then
    raise exception using
      errcode = 'DP008',
      message = 'project.edit permission is required to replace dependencies.';
  end if;

  select context.*
  into v_initial_context
  from public.resolve_subtask_dependency_write_context(
    v_initial_workspace_id,
    v_initial_project_id
  ) as context;

  if not coalesce(v_initial_context.is_allowed, false) then
    raise exception using
      errcode = 'DP008',
      message = 'project.edit permission is required to replace dependencies.';
  end if;

  if v_dependent_deleted_at is not null then
    raise exception using
      errcode = 'DP007',
      message = 'The dependent task is missing or soft-deleted.';
  end if;

  select pg_catalog.count(*)::integer
  into v_active_task_count
  from public.tasks as task
  where task.id = any(v_prerequisite_ids)
    and task.deleted_at is null;

  if v_active_task_count <> v_input_count then
    raise exception using
      errcode = 'DP007',
      message = 'At least one prerequisite task is missing or soft-deleted.';
  end if;

  if exists (
    select 1
    from public.tasks as task
    where task.id = any(v_prerequisite_ids)
      and (
        task.workspace_id <> v_initial_workspace_id
        or task.project_id <> v_initial_project_id
      )
  ) then
    raise exception using
      errcode = 'DP003',
      message = 'Cross-project dependencies are not allowed in Phase A.';
  end if;

  if v_initial_context.actor_person_id is not null then
    perform 1
    from public.people as actor
    where actor.id = v_initial_context.actor_person_id
      and actor.workspace_id = v_initial_workspace_id
      and actor.profile_id = v_initial_context.actor_profile_id
      and actor.deleted_at is null
    for update;

    if not found then
      raise exception using
        errcode = 'DP008',
        message = 'The dependency actor is no longer an active workspace person.';
    end if;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_initial_project_id::text, 0)
  );

  perform 1
  from public.projects as project
  where project.id = v_initial_project_id
    and project.workspace_id = v_initial_workspace_id
    and project.deleted_at is null
  for update;

  if not found then
    raise exception using
      errcode = 'DP007',
      message = 'The dependency project is missing or soft-deleted.';
  end if;

  perform 1
  from public.tasks as task
  where task.id = dependent_id
     or task.id = any(v_prerequisite_ids)
  order by task.id
  for update;

  select task.workspace_id, task.project_id, task.deleted_at
  into v_workspace_id, v_project_id, v_dependent_deleted_at
  from public.tasks as task
  where task.id = dependent_id;

  if not found or v_dependent_deleted_at is not null then
    raise exception using
      errcode = 'DP007',
      message = 'The dependent task is missing or soft-deleted.';
  end if;

  if v_workspace_id <> v_initial_workspace_id
    or v_project_id <> v_initial_project_id then
    raise exception using
      errcode = 'DP003',
      message = 'The dependent task changed project during dependency replacement; retry the operation.';
  end if;

  select context.*
  into v_context
  from public.resolve_subtask_dependency_write_context(
    v_workspace_id,
    v_project_id
  ) as context;

  if not coalesce(v_context.is_allowed, false) then
    raise exception using
      errcode = 'DP008',
      message = 'project.edit permission is required to replace dependencies.';
  end if;

  if v_context.actor_profile_id is distinct from v_initial_context.actor_profile_id
    or v_context.actor_person_id is distinct from v_initial_context.actor_person_id
    or v_context.actor_auth_user_id is distinct from v_initial_context.actor_auth_user_id then
    raise exception using
      errcode = 'DP008',
      message = 'The dependency actor context changed during the operation; retry.';
  end if;

  select pg_catalog.count(*)::integer
  into v_active_task_count
  from public.tasks as task
  where task.id = any(v_prerequisite_ids)
    and task.deleted_at is null;

  if v_active_task_count <> v_input_count then
    raise exception using
      errcode = 'DP007',
      message = 'At least one prerequisite task is missing or soft-deleted.';
  end if;

  if exists (
    select 1
    from public.tasks as task
    where task.id = any(v_prerequisite_ids)
      and (
        task.workspace_id <> v_workspace_id
        or task.project_id <> v_project_id
      )
  ) then
    raise exception using
      errcode = 'DP003',
      message = 'Cross-project dependencies are not allowed in Phase A.';
  end if;

  -- Lock the current incoming set before computing and applying the final set.
  perform 1
  from public.subtask_dependencies as dependency
  where dependency.workspace_id = v_workspace_id
    and dependency.project_id = v_project_id
    and dependency.to_subtask_id = dependent_id
    and dependency.deleted_at is null
  order by dependency.id
  for update;

  for v_prerequisite_id in
    select input.prerequisite_id
    from pg_catalog.unnest(v_prerequisite_ids) as input(prerequisite_id)
    order by input.prerequisite_id
  loop
    if public.subtask_dependency_would_cycle(
      v_workspace_id,
      v_project_id,
      v_prerequisite_id,
      dependent_id
    ) then
      raise exception using
        errcode = 'DP001',
        message = 'At least one dependency would create a cycle.';
    end if;
  end loop;

  for v_before_edge in
    update public.subtask_dependencies as dependency
    set
      deleted_at = pg_catalog.now(),
      deleted_by = v_context.actor_person_id
    where dependency.workspace_id = v_workspace_id
      and dependency.project_id = v_project_id
      and dependency.to_subtask_id = dependent_id
      and dependency.deleted_at is null
      and not (
        dependency.from_subtask_id = any(v_prerequisite_ids)
      )
    returning dependency.*
  loop
    v_after_edge := v_before_edge;
    -- RETURNING is the post-update row. Reconstruct the business before image.
    v_before_edge.deleted_at := null;
    v_before_edge.deleted_by := null;

    perform public.write_subtask_dependency_audit(
      v_after_edge.workspace_id,
      v_context.actor_person_id,
      v_context.actor_profile_id,
      v_context.actor_auth_user_id,
      'subtask_dependency.deleted',
      v_after_edge.id,
      pg_catalog.to_jsonb(v_before_edge),
      pg_catalog.to_jsonb(v_after_edge)
    );
  end loop;

  for v_prerequisite_id in
    select input.prerequisite_id
    from pg_catalog.unnest(v_prerequisite_ids) as input(prerequisite_id)
    order by input.prerequisite_id
  loop
    if not exists (
      select 1
      from public.subtask_dependencies as dependency
      where dependency.from_subtask_id = v_prerequisite_id
        and dependency.to_subtask_id = dependent_id
        and dependency.deleted_at is null
    ) then
      begin
        insert into public.subtask_dependencies (
          workspace_id,
          project_id,
          from_subtask_id,
          to_subtask_id,
          created_by
        ) values (
          v_workspace_id,
          v_project_id,
          v_prerequisite_id,
          dependent_id,
          v_context.actor_person_id
        )
        returning * into v_after_edge;
      exception
        when unique_violation then
          raise exception using
            errcode = 'DP005',
            message = 'The active dependency already exists.';
      end;

      perform public.write_subtask_dependency_audit(
        v_after_edge.workspace_id,
        v_context.actor_person_id,
        v_context.actor_profile_id,
        v_context.actor_auth_user_id,
        'subtask_dependency.added',
        v_after_edge.id,
        null,
        pg_catalog.to_jsonb(v_after_edge)
      );
    end if;
  end loop;

  select coalesce(
    pg_catalog.array_agg(
      dependency.id
      order by dependency.from_subtask_id, dependency.id
    ),
    '{}'::uuid[]
  )
  into v_result
  from public.subtask_dependencies as dependency
  where dependency.workspace_id = v_workspace_id
    and dependency.project_id = v_project_id
    and dependency.to_subtask_id = dependent_id
    and dependency.deleted_at is null;

  return v_result;
end;
$$;

comment on function public.replace_subtask_dependencies(uuid, uuid[]) is
  'Atomically replaces one dependent task active prerequisite set, preserving unchanged edge IDs and auditing every actual add/retire mutation.';

-- Internal helpers are callable only by their service_role owner. The public
-- RPCs are exposed to authenticated; anon and PUBLIC remain denied.
revoke all on function public.resolve_subtask_dependency_write_context(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.subtask_dependency_would_cycle(uuid, uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.write_subtask_dependency_audit(uuid, uuid, uuid, uuid, text, uuid, jsonb, jsonb)
  from public, anon, authenticated;

revoke all on function public.add_subtask_dependency(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.delete_subtask_dependency(uuid)
  from public, anon, authenticated;
revoke all on function public.replace_subtask_dependencies(uuid, uuid[])
  from public, anon, authenticated;

grant execute on function public.add_subtask_dependency(uuid, uuid)
  to authenticated;
grant execute on function public.delete_subtask_dependency(uuid)
  to authenticated;
grant execute on function public.replace_subtask_dependencies(uuid, uuid[])
  to authenticated;

alter function public.resolve_subtask_dependency_write_context(uuid, uuid)
  owner to service_role;
alter function public.subtask_dependency_would_cycle(uuid, uuid, uuid, uuid)
  owner to service_role;
alter function public.write_subtask_dependency_audit(uuid, uuid, uuid, uuid, text, uuid, jsonb, jsonb)
  owner to service_role;
alter function public.add_subtask_dependency(uuid, uuid)
  owner to service_role;
alter function public.delete_subtask_dependency(uuid)
  owner to service_role;
alter function public.replace_subtask_dependencies(uuid, uuid[])
  owner to service_role;

grant insert, update on table public.subtask_dependencies to service_role;

commit;
