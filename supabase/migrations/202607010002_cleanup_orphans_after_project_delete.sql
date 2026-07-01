-- Clean up rows that were left active by older project-delete behavior.
-- Safe strategy: soft-delete entities with deleted_at, close reminders/CEO items,
-- and cancel approvals. No hard delete, no truncate.

with deleted_projects as (
  select id
  from projects
  where deleted_at is not null
),
orphan_workstreams as (
  update workstreams
  set deleted_at = coalesce(deleted_at, now())
  where deleted_at is null
    and project_id in (select id from deleted_projects)
  returning id
),
deleted_workstreams as (
  select id from workstreams where deleted_at is not null
  union
  select id from orphan_workstreams
),
orphan_tasks as (
  update tasks
  set deleted_at = coalesce(deleted_at, now())
  where deleted_at is null
    and (
      project_id in (select id from deleted_projects)
      or workstream_id in (select id from deleted_workstreams)
    )
  returning id
),
deleted_tasks as (
  select id from tasks where deleted_at is not null
  union
  select id from orphan_tasks
),
orphan_steps as (
  update task_steps
  set deleted_at = coalesce(deleted_at, now())
  where deleted_at is null
    and task_id in (select id from deleted_tasks)
  returning id
),
deleted_steps as (
  select id from task_steps where deleted_at is not null
  union
  select id from orphan_steps
),
orphan_deliverables as (
  update deliverables
  set deleted_at = coalesce(deleted_at, now()),
      updated_at = now()
  where deleted_at is null
    and (
      project_id in (select id from deleted_projects)
      or task_id in (select id from deleted_tasks)
      or step_id in (select id from deleted_steps)
    )
  returning id
),
deleted_deliverables as (
  select id from deliverables where deleted_at is not null
  union
  select id from orphan_deliverables
),
closed_reminders as (
  update reminders
  set status = 'closed',
      response_status = 'CLOSED',
      updated_at = now()
  where status <> 'closed'
    and response_status <> 'CLOSED'
    and (
      task_id in (select id from deleted_tasks)
      or deliverable_id in (select id from deleted_deliverables)
    )
  returning id
),
cancelled_approvals as (
  update approvals
  set status = 'CANCELLED',
      updated_at = now()
  where status <> 'CANCELLED'
    and (
      project_id in (select id from deleted_projects)
      or task_id in (select id from deleted_tasks)
      or step_id in (select id from deleted_steps)
      or deliverable_id in (select id from deleted_deliverables)
    )
  returning id
),
deleted_meetings as (
  update meetings
  set deleted_at = coalesce(deleted_at, now()),
      updated_at = now()
  where deleted_at is null
    and project_id in (select id from deleted_projects)
  returning id
),
closed_ceo_requests as (
  update ceo_decision_requests
  set status = 'closed',
      updated_at = now()
  where status <> 'closed'
    and project_id in (select id from deleted_projects)
  returning id
)
select
  (select count(*) from orphan_workstreams) as workstreams_soft_deleted,
  (select count(*) from orphan_tasks) as tasks_soft_deleted,
  (select count(*) from orphan_steps) as steps_soft_deleted,
  (select count(*) from orphan_deliverables) as deliverables_soft_deleted,
  (select count(*) from deleted_meetings) as meetings_soft_deleted,
  (select count(*) from closed_reminders) as reminders_closed,
  (select count(*) from cancelled_approvals) as approvals_cancelled,
  (select count(*) from closed_ceo_requests) as ceo_requests_closed;
