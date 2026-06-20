-- ============================================================
-- 009_multi_member_assignments.sql
-- Multi-role assignment support for VyVy WorkOS.
--
-- Safe/idempotent:
-- - Additive only: ADD COLUMN IF NOT EXISTS.
-- - No destructive commands.
-- - Keep legacy owner_id, assignee_id, head_id, approver_id columns.
-- - Backfill old single-person fields into new uuid[] fields without duplicates.
-- ============================================================

begin;

-- ============================================================
-- 1. Projects
--    owner_id remains the main Project Lead.
-- ============================================================

alter table public.projects
  add column if not exists member_ids uuid[] default '{}'::uuid[],
  add column if not exists watcher_ids uuid[] default '{}'::uuid[],
  add column if not exists approver_ids uuid[] default '{}'::uuid[];

alter table public.projects
  alter column member_ids set default '{}'::uuid[],
  alter column watcher_ids set default '{}'::uuid[],
  alter column approver_ids set default '{}'::uuid[];

update public.projects
set
  member_ids = coalesce(member_ids, '{}'::uuid[]),
  watcher_ids = coalesce(watcher_ids, '{}'::uuid[]),
  approver_ids = coalesce(approver_ids, '{}'::uuid[]);

-- Backfill: keep owner_id and also include that person in member_ids.
update public.projects
set member_ids = (
  select coalesce(array_agg(distinct id), '{}'::uuid[])
  from unnest(coalesce(member_ids, '{}'::uuid[]) || array[owner_id]) as id
  where id is not null
)
where owner_id is not null;

-- ============================================================
-- 2. Tasks
--    Workstream and subtask are both stored in public.tasks.
--    assignee_id remains Main Owner.
--    head_id remains legacy single Lead.
-- ============================================================

alter table public.tasks
  add column if not exists head_ids uuid[] default '{}'::uuid[],
  add column if not exists co_owner_ids uuid[] default '{}'::uuid[],
  add column if not exists supporter_ids uuid[] default '{}'::uuid[],
  add column if not exists reviewer_ids uuid[] default '{}'::uuid[],
  add column if not exists watcher_ids uuid[] default '{}'::uuid[],
  add column if not exists approver_ids uuid[] default '{}'::uuid[];

alter table public.tasks
  alter column head_ids set default '{}'::uuid[],
  alter column co_owner_ids set default '{}'::uuid[],
  alter column supporter_ids set default '{}'::uuid[],
  alter column reviewer_ids set default '{}'::uuid[],
  alter column watcher_ids set default '{}'::uuid[],
  alter column approver_ids set default '{}'::uuid[];

update public.tasks
set
  head_ids = coalesce(head_ids, '{}'::uuid[]),
  co_owner_ids = coalesce(co_owner_ids, '{}'::uuid[]),
  supporter_ids = coalesce(supporter_ids, '{}'::uuid[]),
  reviewer_ids = coalesce(reviewer_ids, '{}'::uuid[]),
  watcher_ids = coalesce(watcher_ids, '{}'::uuid[]),
  approver_ids = coalesce(approver_ids, '{}'::uuid[]);

-- Backfill: keep head_id and also include that person in head_ids.
update public.tasks
set head_ids = (
  select coalesce(array_agg(distinct id), '{}'::uuid[])
  from unnest(coalesce(head_ids, '{}'::uuid[]) || array[head_id]) as id
  where id is not null
)
where head_id is not null;

-- Backfill legacy task_supporters table into tasks.supporter_ids if the table exists.
do $$
begin
  if to_regclass('public.task_supporters') is not null then
    update public.tasks as t
    set supporter_ids = (
      select coalesce(array_agg(distinct id), '{}'::uuid[])
      from unnest(coalesce(t.supporter_ids, '{}'::uuid[]) || coalesce(s.ids, '{}'::uuid[])) as id
      where id is not null
    )
    from (
      select task_id, array_agg(distinct employee_id) as ids
      from public.task_supporters
      group by task_id
    ) as s
    where t.id = s.task_id;
  end if;
end $$;

-- Optional legacy deadline approver backfill, only if the column exists.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tasks'
      and column_name = 'deadline_approver_id'
  ) then
    execute $sql$
      update public.tasks
      set approver_ids = (
        select coalesce(array_agg(distinct id), '{}'::uuid[])
        from unnest(coalesce(approver_ids, '{}'::uuid[]) || array[deadline_approver_id]) as id
        where id is not null
      )
      where deadline_approver_id is not null
    $sql$;
  end if;
end $$;

-- ============================================================
-- 3. Task steps
--    owner_id remains Step Owner.
--    approver_id and department/coo/ceo approver columns remain legacy approvers.
-- ============================================================

alter table public.task_steps
  add column if not exists supporter_ids uuid[] default '{}'::uuid[],
  add column if not exists approver_ids uuid[] default '{}'::uuid[];

alter table public.task_steps
  alter column supporter_ids set default '{}'::uuid[],
  alter column approver_ids set default '{}'::uuid[];

update public.task_steps
set
  supporter_ids = coalesce(supporter_ids, '{}'::uuid[]),
  approver_ids = coalesce(approver_ids, '{}'::uuid[]);

-- Backfill all existing single/multi-level step approver columns if present.
do $$
declare
  approver_expr text := '''{}''::uuid[]';
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'task_steps' and column_name = 'approver_id'
  ) then
    approver_expr := approver_expr || ' || array[approver_id]';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'task_steps' and column_name = 'department_approver_id'
  ) then
    approver_expr := approver_expr || ' || array[department_approver_id]';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'task_steps' and column_name = 'coo_approver_id'
  ) then
    approver_expr := approver_expr || ' || array[coo_approver_id]';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'task_steps' and column_name = 'ceo_approver_id'
  ) then
    approver_expr := approver_expr || ' || array[ceo_approver_id]';
  end if;

  execute format($sql$
    update public.task_steps
    set approver_ids = (
      select coalesce(array_agg(distinct id), '{}'::uuid[])
      from unnest(coalesce(approver_ids, '{}'::uuid[]) || %s) as id
      where id is not null
    )
  $sql$, approver_expr);
end $$;

-- ============================================================
-- 4. Indexes for array membership filters.
-- ============================================================

create index if not exists projects_member_ids_gin_idx
  on public.projects using gin (member_ids);
create index if not exists projects_watcher_ids_gin_idx
  on public.projects using gin (watcher_ids);
create index if not exists projects_approver_ids_gin_idx
  on public.projects using gin (approver_ids);

create index if not exists tasks_head_ids_gin_idx
  on public.tasks using gin (head_ids);
create index if not exists tasks_co_owner_ids_gin_idx
  on public.tasks using gin (co_owner_ids);
create index if not exists tasks_supporter_ids_gin_idx
  on public.tasks using gin (supporter_ids);
create index if not exists tasks_reviewer_ids_gin_idx
  on public.tasks using gin (reviewer_ids);
create index if not exists tasks_watcher_ids_gin_idx
  on public.tasks using gin (watcher_ids);
create index if not exists tasks_approver_ids_gin_idx
  on public.tasks using gin (approver_ids);

create index if not exists task_steps_supporter_ids_gin_idx
  on public.task_steps using gin (supporter_ids);
create index if not exists task_steps_approver_ids_gin_idx
  on public.task_steps using gin (approver_ids);

commit;

-- ============================================================
-- 5. Verification result.
-- ============================================================

select table_name, column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'projects' and column_name in ('member_ids', 'watcher_ids', 'approver_ids'))
    or
    (table_name = 'tasks' and column_name in ('head_ids', 'co_owner_ids', 'supporter_ids', 'reviewer_ids', 'watcher_ids', 'approver_ids'))
    or
    (table_name = 'task_steps' and column_name in ('supporter_ids', 'approver_ids'))
  )
order by table_name, column_name;
