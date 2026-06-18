-- VyVy WorkOS - required migrations before CEO demo
-- Run once in Supabase Dashboard > SQL Editor.
-- Safe/idempotent: creates missing tables and columns without deleting existing data.

-- 1) Notifications used by in-app bell, comments/tags, approvals and reminders.
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null,
  actor_id uuid,
  type text not null default 'info',
  title text not null,
  body text,
  task_id uuid,
  project_id uuid,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.notifications add column if not exists project_id uuid;
alter table public.notifications add column if not exists is_read boolean not null default false;
create index if not exists notifications_recipient_idx on public.notifications (recipient_id, is_read, created_at desc);
alter table public.notifications enable row level security;
drop policy if exists "notifications_all" on public.notifications;
create policy "notifications_all" on public.notifications for all using (true) with check (true);

-- 2) Internal login link between Supabase Auth user and employee profile.
alter table public.employees add column if not exists auth_user_id uuid;
create index if not exists employees_auth_user_id_idx on public.employees (auth_user_id);

-- 3) Multi-head tasks. Keep legacy head_id as the first head for old screens.
alter table public.tasks add column if not exists head_ids uuid[] default '{}';
update public.tasks
set head_ids = array[head_id]
where head_id is not null
  and (head_ids is null or cardinality(head_ids) = 0);

-- 4) Multi-level approval and deadline workflow for steps.
alter table public.task_steps
add column if not exists department_approver_id uuid,
add column if not exists coo_approver_id uuid,
add column if not exists ceo_approver_id uuid,
add column if not exists requires_coo_approval boolean default false,
add column if not exists requires_ceo_approval boolean default false,
add column if not exists approval_stage text default 'department',
add column if not exists department_approval_status text default 'not_submitted',
add column if not exists coo_approval_status text default 'not_required',
add column if not exists ceo_approval_status text default 'not_required',
add column if not exists department_approval_note text,
add column if not exists coo_approval_note text,
add column if not exists ceo_approval_note text,
add column if not exists department_approved_at timestamptz,
add column if not exists coo_approved_at timestamptz,
add column if not exists ceo_approved_at timestamptz,
add column if not exists step_deadline_status text default 'draft',
add column if not exists step_proposed_deadline date,
add column if not exists step_deadline_approver_id uuid,
add column if not exists step_deadline_note text,
add column if not exists step_in_progress boolean default false,
add column if not exists step_deadline_submitted_at timestamptz,
add column if not exists step_deadline_approved_at timestamptz,
add column if not exists step_started_at timestamptz;

update public.task_steps
set department_approver_id = approver_id
where department_approver_id is null
  and approver_id is not null;

update public.task_steps
set approval_stage = 'department'
where approval_stage is null;

update public.task_steps
set department_approval_status = case
  when approval_status = 'approved' then 'approved'
  when approval_status = 'pending' then 'pending'
  when approval_status = 'revision' then 'revision'
  else 'not_submitted'
end
where department_approval_status is null;

-- 5) Recurring work/meeting reminders and meeting file archive.
create table if not exists public.recurring_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  kind text not null default 'task',
  frequency text not null default 'weekly',
  weekday int,
  month_day int,
  time_of_day text not null default '09:00',
  assignee_id uuid,
  recipient_ids uuid[],
  remind_days_before int not null default 2,
  remind_minutes_before int not null default 60,
  is_active boolean not null default true,
  notified_early_for text,
  notified_near_for text,
  created_by uuid,
  created_at timestamptz not null default now()
);
alter table public.recurring_tasks add column if not exists recipient_ids uuid[];
update public.recurring_tasks
set recipient_ids = array[assignee_id]
where assignee_id is not null
  and (recipient_ids is null or cardinality(recipient_ids) = 0);
alter table public.recurring_tasks enable row level security;
drop policy if exists "recurring_all" on public.recurring_tasks;
create policy "recurring_all" on public.recurring_tasks for all using (true) with check (true);

create table if not exists public.recurring_task_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'cron',
  status text not null default 'running',
  scanned int,
  notifications_sent int,
  detail jsonb not null default '{}'::jsonb,
  triggered_by uuid,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists recurring_task_runs_started_idx on public.recurring_task_runs (started_at desc);
alter table public.recurring_task_runs enable row level security;
drop policy if exists "recurring_runs_all" on public.recurring_task_runs;
create policy "recurring_runs_all" on public.recurring_task_runs for all using (true) with check (true);

create table if not exists public.recurring_meeting_files (
  id uuid primary key default gen_random_uuid(),
  recurring_task_id uuid not null references public.recurring_tasks(id) on delete cascade,
  meeting_date date,
  title text,
  file_name text not null,
  file_url text not null,
  file_type text,
  note text,
  uploaded_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists recurring_meeting_files_task_idx on public.recurring_meeting_files (recurring_task_id, created_at desc);
alter table public.recurring_meeting_files enable row level security;
drop policy if exists "recurring_meeting_files_all" on public.recurring_meeting_files;
create policy "recurring_meeting_files_all" on public.recurring_meeting_files for all using (true) with check (true);

insert into public.recurring_tasks (id, title, kind, frequency, weekday, time_of_day, remind_days_before, remind_minutes_before)
select '7d8c552a-50a5-4ba3-86ac-2e6aa9467710'::uuid, 'Họp Performance', 'meeting', 'weekly', 6, '10:00', 2, 60
where not exists (
  select 1
  from public.recurring_tasks
  where title = 'Họp Performance'
     or id = '7d8c552a-50a5-4ba3-86ac-2e6aa9467710'::uuid
);

-- 6) Strategy/Spec and Execution/WBS project workspace.
create table if not exists public.project_specs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text,
  north_star text,
  objectives text,
  operating_model text,
  data_architecture text,
  kpis text,
  risks text,
  decisions text,
  governance text,
  notes text,
  raw_sections text,
  version text,
  created_at timestamptz default now()
);
alter table public.project_specs enable row level security;
drop policy if exists "project_specs_all" on public.project_specs;
create policy "project_specs_all" on public.project_specs for all using (true) with check (true);

create table if not exists public.execution_trackers (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  stage text,
  phases text,
  module_readiness text,
  decisions_needed text,
  build_needed text,
  top3_actions text,
  critical_path text,
  created_at timestamptz default now()
);
alter table public.execution_trackers enable row level security;
drop policy if exists "execution_trackers_all" on public.execution_trackers;
create policy "execution_trackers_all" on public.execution_trackers for all using (true) with check (true);

create table if not exists public.execution_items (
  id uuid primary key default gen_random_uuid(),
  execution_tracker_id uuid not null references public.execution_trackers(id) on delete cascade,
  workstream text,
  layer text,
  phase text,
  title text not null,
  owner text,
  status text default 'todo',
  note text,
  is_critical_path boolean default false,
  order_index integer default 0
);
alter table public.execution_items enable row level security;
drop policy if exists "execution_items_all" on public.execution_items;
create policy "execution_items_all" on public.execution_items for all using (true) with check (true);

-- 6) Storage buckets used by uploads. Existing buckets are left untouched.
insert into storage.buckets (id, name, public)
values
  ('task-reports', 'task-reports', true),
  ('step-reports', 'step-reports', true),
  ('meeting-files', 'meeting-files', true)
on conflict (id) do update set public = excluded.public;
