-- Add per-item reviewers separate from owners/managers.
-- Safe additive migration for staging first, production only after approval.

alter table if exists projects
  add column if not exists reviewer_id uuid references people(id) on delete set null;

alter table if exists workstreams
  add column if not exists reviewer_id uuid references people(id) on delete set null;

alter table if exists tasks
  add column if not exists reviewer_id uuid references people(id) on delete set null;

alter table if exists task_steps
  add column if not exists reviewer_id uuid references people(id) on delete set null;

create index if not exists projects_reviewer_idx
  on projects(reviewer_id);

create index if not exists workstreams_reviewer_idx
  on workstreams(reviewer_id);

create index if not exists tasks_reviewer_idx
  on tasks(reviewer_id);

create index if not exists task_steps_reviewer_idx
  on task_steps(reviewer_id);
