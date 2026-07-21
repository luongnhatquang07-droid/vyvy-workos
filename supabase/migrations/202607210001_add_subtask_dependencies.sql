-- Phase A1a: same-project subtask dependency storage and access controls.
-- Direction is fixed across the codebase:
--   from_subtask_id = prerequisite
--   to_subtask_id   = dependent

begin;

-- The unrun legacy schema proposal used public.task_dependencies. Fail loudly if
-- it was applied manually so two competing dependency graphs cannot coexist.
do $migration_guard$
begin
  if to_regclass('public.task_dependencies') is not null then
    raise exception using
      errcode = '55000',
      message = 'Legacy public.task_dependencies exists; migrate or rename it before adding public.subtask_dependencies.';
  end if;

  if to_regclass('public.subtask_dependencies') is not null then
    raise exception using
      errcode = '55000',
      message = 'public.subtask_dependencies already exists; inspect its schema instead of masking it with IF NOT EXISTS.';
  end if;

end
$migration_guard$;

create table public.subtask_dependencies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null
    references public.workspaces(id) on delete cascade,
  project_id uuid not null
    references public.projects(id) on delete cascade,
  from_subtask_id uuid not null
    references public.tasks(id) on delete cascade,
  to_subtask_id uuid not null
    references public.tasks(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid
    references public.people(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid
    references public.people(id) on delete set null,
  constraint subtask_dependencies_no_self_check
    check (from_subtask_id <> to_subtask_id),
  constraint subtask_dependencies_deleted_actor_check
    check (deleted_by is null or deleted_at is not null)
);

comment on table public.subtask_dependencies is
  'Finish-to-start edges between task rows used as subtasks; from_subtask_id is the prerequisite and to_subtask_id is the dependent.';
comment on column public.subtask_dependencies.project_id is
  'Project of the dependent subtask. Phase A requires the prerequisite to be in the same project; Phase B may relax only that endpoint rule.';
comment on column public.subtask_dependencies.from_subtask_id is
  'Prerequisite subtask that must complete first.';
comment on column public.subtask_dependencies.to_subtask_id is
  'Dependent subtask that becomes ready after all prerequisites complete.';

-- A soft-deleted pair may be created again as a new audit row.
create unique index subtask_dependencies_active_pair_uidx
  on public.subtask_dependencies (from_subtask_id, to_subtask_id)
  where deleted_at is null;

-- Project graph / Flowchart listing.
create index subtask_dependencies_active_project_idx
  on public.subtask_dependencies (workspace_id, project_id)
  where deleted_at is null;

-- Prerequisite completion -> dependents (used later by Inbox unlocks).
create index subtask_dependencies_active_from_idx
  on public.subtask_dependencies (workspace_id, from_subtask_id)
  where deleted_at is null;

-- Dependent -> unfinished prerequisites (readiness and badges).
create index subtask_dependencies_active_to_idx
  on public.subtask_dependencies (workspace_id, to_subtask_id)
  where deleted_at is null;

-- Protect the denormalized workspace/project keys even for service-role writes.
-- Cycle detection, the 20-edge limit and project-level locking are intentionally
-- deferred to the authoritative Postgres RPC in A1b.
create function public.validate_subtask_dependency_endpoints()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_live_endpoint_count integer;
begin
  if new.from_subtask_id = new.to_subtask_id then
    raise exception using
      errcode = '23514',
      message = 'A subtask cannot depend on itself.';
  end if;

  if not exists (
    select 1
    from public.projects as project
    where project.id = new.project_id
      and project.workspace_id = new.workspace_id
      and project.deleted_at is null
  ) then
    raise exception using
      errcode = '23514',
      message = 'Dependency project must be active and belong to the declared workspace.';
  end if;

  select count(*)
  into v_live_endpoint_count
  from public.tasks as task
  where task.id in (new.from_subtask_id, new.to_subtask_id)
    and task.workspace_id = new.workspace_id
    and task.project_id = new.project_id
    and task.deleted_at is null;

  if v_live_endpoint_count <> 2 then
    raise exception using
      errcode = '23514',
      message = 'Both dependency endpoints must be active subtasks in the declared workspace and project.';
  end if;

  if new.created_by is not null and not exists (
    select 1
    from public.people as actor
    where actor.id = new.created_by
      and actor.workspace_id = new.workspace_id
      and actor.deleted_at is null
  ) then
    raise exception using
      errcode = '23514',
      message = 'Dependency creator must be an active person in the declared workspace.';
  end if;

  return new;
end;
$$;

create trigger subtask_dependencies_validate_endpoints
before insert on public.subtask_dependencies
for each row
execute function public.validate_subtask_dependency_endpoints();

-- Existing edge identity and audit fields are immutable. UPDATE represents only
-- semantic deletion; restoring an edge creates a new row instead.
create function public.enforce_subtask_dependency_soft_delete()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  -- Foreign-key ON DELETE SET NULL actions must be able to retire an actor
  -- reference without mutating the business edge or its deletion timestamp.
  if row(
    new.id,
    new.workspace_id,
    new.project_id,
    new.from_subtask_id,
    new.to_subtask_id,
    new.created_at,
    new.deleted_at
  ) is not distinct from row(
    old.id,
    old.workspace_id,
    old.project_id,
    old.from_subtask_id,
    old.to_subtask_id,
    old.created_at,
    old.deleted_at
  )
  and (
    new.created_by is not distinct from old.created_by
    or (old.created_by is not null and new.created_by is null)
  )
  and (
    new.deleted_by is not distinct from old.deleted_by
    or (old.deleted_by is not null and new.deleted_by is null)
  )
  and (
    new.created_by is distinct from old.created_by
    or new.deleted_by is distinct from old.deleted_by
  ) then
    return new;
  end if;

  if row(
    new.id,
    new.workspace_id,
    new.project_id,
    new.from_subtask_id,
    new.to_subtask_id,
    new.created_at,
    new.created_by
  ) is distinct from row(
    old.id,
    old.workspace_id,
    old.project_id,
    old.from_subtask_id,
    old.to_subtask_id,
    old.created_at,
    old.created_by
  ) then
    raise exception using
      errcode = '23514',
      message = 'Dependency identity and creation audit fields are immutable.';
  end if;

  if old.deleted_at is not null then
    raise exception using
      errcode = '23514',
      message = 'A soft-deleted dependency cannot be modified or restored.';
  end if;

  if new.deleted_at is null then
    raise exception using
      errcode = '23514',
      message = 'Dependency updates may only soft-delete an active edge.';
  end if;

  if new.deleted_by is not null and not exists (
    select 1
    from public.people as actor
    where actor.id = new.deleted_by
      and actor.workspace_id = new.workspace_id
      and actor.deleted_at is null
  ) then
    raise exception using
      errcode = '23514',
      message = 'Dependency deletion actor must be an active person in the declared workspace.';
  end if;

  return new;
end;
$$;

create trigger subtask_dependencies_soft_delete_only
before update on public.subtask_dependencies
for each row
execute function public.enforce_subtask_dependency_soft_delete();

-- Soft-deleting either endpoint also retires every active incident edge. A task
-- restore deliberately does not restore those edges; users create new audit rows.
create function public.soft_delete_subtask_dependencies_for_task()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  update public.subtask_dependencies
  set deleted_at = new.deleted_at
  where deleted_at is null
    and workspace_id = new.workspace_id
    and project_id = new.project_id
    and (
      from_subtask_id = new.id
      or to_subtask_id = new.id
    );

  return new;
end;
$$;

create trigger tasks_soft_delete_subtask_dependencies
after update of deleted_at on public.tasks
for each row
when (old.deleted_at is null and new.deleted_at is not null)
execute function public.soft_delete_subtask_dependencies_for_task();

revoke all on function public.validate_subtask_dependency_endpoints() from public, anon, authenticated, service_role;
revoke all on function public.enforce_subtask_dependency_soft_delete() from public, anon, authenticated, service_role;
revoke all on function public.soft_delete_subtask_dependencies_for_task() from public, anon, authenticated, service_role;

-- Mirrors the current TypeScript permission model without depending on the old
-- app_workspace()/app_role() proposal. The helper also validates that both edge
-- endpoints are live and match the denormalized workspace/project keys.
create function public.can_access_subtask_dependency(
  p_workspace_id uuid,
  p_project_id uuid,
  p_from_subtask_id uuid,
  p_to_subtask_id uuid,
  p_action text
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_profile_id uuid;
  v_person_id uuid;
  v_actor_department_id uuid;
  v_raw_role text;
  v_role text;
  v_actor_status text;
  v_project_owner_id uuid;
  v_project_reviewer_id uuid;
  v_project_owner_department_id uuid;
  v_project_assigned boolean;
  v_project_same_department boolean;
  v_project_override_found boolean := false;
  v_project_override_view boolean := false;
  v_project_override_edit boolean := false;
  v_project_override_scope text := 'none';
  v_project_allowed boolean := false;
  v_subtask_override_found boolean := false;
  v_subtask_override_view boolean := false;
  v_subtask_override_scope text := 'none';
  v_endpoint_count integer;
  v_visible_endpoint_count integer := 0;
  v_task record;
  v_task_assigned boolean;
  v_task_same_department boolean;
  v_task_allowed boolean;
  v_override_row_count bigint := 0;
  v_live_person_count integer := 0;
begin
  if auth.uid() is null or p_action not in ('view', 'edit') then
    return false;
  end if;

  select
    profile.id,
    person.id,
    person.department_id,
    upper(trim(role.code)),
    coalesce(person.status, profile.status)
  into
    v_profile_id,
    v_person_id,
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
        select count(*)
        from public.people as duplicate_check
        where duplicate_check.profile_id = profile.id
          and duplicate_check.workspace_id = p_workspace_id
          and duplicate_check.deleted_at is null
      ) = 1
  ) as person on true
  where profile.auth_user_id = auth.uid()
  ;

  if not found or lower(coalesce(v_actor_status, 'active')) in ('inactive', 'suspended') then
    return false;
  end if;

  select count(*)
  into v_live_person_count
  from public.people as linked_person
  where linked_person.profile_id = v_profile_id
    and linked_person.workspace_id = p_workspace_id
    and linked_person.deleted_at is null;

  -- Zero linked people is valid for legacy ADMIN/COO profiles. More than one is
  -- ambiguous and must fail closed instead of selecting an arbitrary identity.
  if v_live_person_count > 1 then
    return false;
  end if;

  v_role := case v_raw_role
    when 'PROJECT_COORDINATOR' then 'COO'
    when 'CEO_READONLY' then 'CEO'
    else v_raw_role
  end;

  -- canEditProject() rejects legacy read-only users before consulting overrides.
  if p_action = 'edit' and v_raw_role = 'CEO_READONLY' then
    return false;
  end if;

  select
    project.owner_id,
    nullif(to_jsonb(project) ->> 'reviewer_id', '')::uuid,
    owner.department_id
  into
    v_project_owner_id,
    v_project_reviewer_id,
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
    return false;
  end if;

  select count(*)
  into v_endpoint_count
  from public.tasks as task
  where task.id in (p_from_subtask_id, p_to_subtask_id)
    and task.workspace_id = p_workspace_id
    and task.project_id = p_project_id
    and task.deleted_at is null;

  if p_from_subtask_id = p_to_subtask_id or v_endpoint_count <> 2 then
    return false;
  end if;

  v_project_assigned := coalesce(
    v_person_id is not null and (
      v_person_id = v_project_owner_id
      or (p_action = 'view' and v_person_id = v_project_reviewer_id)
    ),
    false
  );
  v_project_same_department := coalesce(
    v_person_id is not null
      and v_project_owner_department_id is not null
      and (
        v_actor_department_id = v_project_owner_department_id
        or exists (
          select 1
          from public.departments as department
          where department.workspace_id = p_workspace_id
            and department.id = v_project_owner_department_id
            and department.head_person_id = v_person_id
            and department.deleted_at is null
        )
      ),
    false
  );

  -- resolveRbacUserContext() treats a missing/older override table as no
  -- overrides. Dynamic SQL preserves that fallback while keeping fresh
  -- migration chains independent from the older manual SQL directory.
  if to_regclass('public.user_permission_overrides') is not null then
    begin
      execute $override$
        select permission.can_view, permission.can_edit, permission.scope
        from public.user_permission_overrides as permission
        where permission.profile_id = $1
          and permission.module = 'projects'
          and permission.is_enabled is true
        limit 1
      $override$
      into
        v_project_override_view,
        v_project_override_edit,
        v_project_override_scope
      using v_profile_id;
      get diagnostics v_override_row_count = row_count;
      v_project_override_found := v_override_row_count > 0;
    exception
      when undefined_table or undefined_column then
        v_project_override_found := false;
    end;
  end if;

  -- permissionOverrideDecision() always allows an active ADMIN before looking at
  -- the profile override row.
  if v_role = 'ADMIN' then
    v_project_allowed := true;
  elsif v_project_override_found then
    if (p_action = 'view' and v_project_override_view)
      or (p_action = 'edit' and v_project_override_edit) then
      v_project_allowed := case v_project_override_scope
        when 'company' then true
        when 'department' then v_project_same_department
        when 'own' then v_project_assigned
        when 'assigned_projects' then v_project_assigned
        else false
      end;
    else
      v_project_allowed := false;
    end if;
  elsif p_action = 'view' then
    v_project_allowed := case
      when v_role in ('ADMIN', 'CEO', 'COO') then true
      when v_role = 'DEPARTMENT_HEAD' then v_project_same_department or v_project_assigned
      else v_project_assigned
    end;
  else
    -- CEO_READONLY normalizes to CEO but remains hard read-only for mutations.
    v_project_allowed := case
      when v_raw_role = 'CEO_READONLY' then false
      when v_role in ('ADMIN', 'COO') then true
      when v_role = 'DEPARTMENT_HEAD' then v_project_same_department or v_project_assigned
      else false
    end;
  end if;

  if p_action = 'edit' or v_project_allowed then
    return v_project_allowed;
  end if;

  -- A user who cannot see the whole project may still see an edge only when both
  -- endpoint subtasks are independently visible. This avoids leaking a hidden ID.
  if to_regclass('public.user_permission_overrides') is not null then
    begin
      execute $override$
        select permission.can_view, permission.scope
        from public.user_permission_overrides as permission
        where permission.profile_id = $1
          and permission.module = 'subtasks'
          and permission.is_enabled is true
        limit 1
      $override$
      into
        v_subtask_override_view,
        v_subtask_override_scope
      using v_profile_id;
      get diagnostics v_override_row_count = row_count;
      v_subtask_override_found := v_override_row_count > 0;
    exception
      when undefined_table or undefined_column then
        v_subtask_override_found := false;
    end;
  end if;

  for v_task in
    select
      task.id,
      task.owner_id,
      nullif(to_jsonb(task) ->> 'reviewer_id', '')::uuid as reviewer_id,
      task.waiting_for_person_id,
      owner.department_id as owner_department_id
    from public.tasks as task
    left join public.people as owner
      on owner.id = task.owner_id
     and owner.workspace_id = p_workspace_id
     and owner.deleted_at is null
    where task.id in (p_from_subtask_id, p_to_subtask_id)
      and task.workspace_id = p_workspace_id
      and task.project_id = p_project_id
      and task.deleted_at is null
  loop
    v_task_assigned := coalesce(
      v_person_id is not null and (
        v_person_id = v_task.owner_id
        or v_person_id = v_task.reviewer_id
        or v_person_id = v_task.waiting_for_person_id
        or exists (
          select 1
          from public.task_assignees as assignee
          where assignee.task_id = v_task.id
            and assignee.person_id = v_person_id
        )
      ),
      false
    );
    v_task_same_department := coalesce(
      v_person_id is not null
        and v_task.owner_department_id is not null
        and (
          v_actor_department_id = v_task.owner_department_id
          or exists (
            select 1
            from public.departments as department
            where department.workspace_id = p_workspace_id
              and department.id = v_task.owner_department_id
              and department.head_person_id = v_person_id
              and department.deleted_at is null
          )
        ),
      false
    );

    if v_role = 'ADMIN' then
      v_task_allowed := true;
    elsif v_subtask_override_found then
      if v_subtask_override_view then
        v_task_allowed := case v_subtask_override_scope
          when 'company' then true
          when 'department' then v_task_same_department
          when 'own' then v_task_assigned
          when 'assigned_projects' then v_task_assigned
          else false
        end;
      else
        v_task_allowed := false;
      end if;
    else
      v_task_allowed := case
        when v_role in ('ADMIN', 'CEO', 'COO') then true
        when v_role = 'DEPARTMENT_HEAD' then v_task_same_department or v_task_assigned
        else v_task_assigned
      end;
    end if;

    if not v_task_allowed then
      return false;
    end if;

    v_visible_endpoint_count := v_visible_endpoint_count + 1;
  end loop;

  return v_visible_endpoint_count = 2;
end;
$$;

revoke all on function public.can_access_subtask_dependency(uuid, uuid, uuid, uuid, text) from public;
grant execute on function public.can_access_subtask_dependency(uuid, uuid, uuid, uuid, text) to authenticated;

alter table public.subtask_dependencies enable row level security;

create policy subtask_dependencies_select_visible
  on public.subtask_dependencies
  for select
  to authenticated
  using (
    deleted_at is null
    and public.can_access_subtask_dependency(
      workspace_id,
      project_id,
      from_subtask_id,
      to_subtask_id,
      'view'
    )
  );

create policy subtask_dependencies_insert_edit_project
  on public.subtask_dependencies
  for insert
  to authenticated
  with check (
    deleted_at is null
    and deleted_by is null
    and public.can_access_subtask_dependency(
      workspace_id,
      project_id,
      from_subtask_id,
      to_subtask_id,
      'edit'
    )
  );

create policy subtask_dependencies_soft_delete_edit_project
  on public.subtask_dependencies
  for update
  to authenticated
  using (
    deleted_at is null
    and public.can_access_subtask_dependency(
      workspace_id,
      project_id,
      from_subtask_id,
      to_subtask_id,
      'edit'
    )
  )
  with check (
    public.can_access_subtask_dependency(
      workspace_id,
      project_id,
      from_subtask_id,
      to_subtask_id,
      'edit'
    )
  );

-- A1b exposes mutation only through validated Postgres RPCs. Keep direct client
-- DML fail-closed so cycle/max-count checks cannot be bypassed between A1a/A1b.
revoke all on table public.subtask_dependencies from public, anon, authenticated, service_role;
grant select on table public.subtask_dependencies to authenticated, service_role;

commit;
