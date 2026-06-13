-- Chạy trong Supabase Dashboard > SQL Editor
-- Tạo bảng recurring_tasks + recurring_meeting_files + recurring_task_runs + bucket

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
alter table public.recurring_tasks enable row level security;
drop policy if exists "recurring_all" on public.recurring_tasks;
create policy "recurring_all" on public.recurring_tasks for all using (true) with check (true);

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
alter table public.recurring_meeting_files enable row level security;
drop policy if exists "recurring_meeting_files_all" on public.recurring_meeting_files;
create policy "recurring_meeting_files_all" on public.recurring_meeting_files for all using (true) with check (true);

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
alter table public.recurring_task_runs enable row level security;
drop policy if exists "recurring_runs_all" on public.recurring_task_runs;
create policy "recurring_runs_all" on public.recurring_task_runs for all using (true) with check (true);

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
create index if not exists notifications_recipient_idx on public.notifications (recipient_id, is_read, created_at desc);
alter table public.notifications enable row level security;
drop policy if exists "notifications_all" on public.notifications;
create policy "notifications_all" on public.notifications for all using (true) with check (true);

-- Bật realtime
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='recurring_tasks') then
    alter publication supabase_realtime add table public.recurring_tasks; end if; end $$;
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='recurring_meeting_files') then
    alter publication supabase_realtime add table public.recurring_meeting_files; end if; end $$;
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='recurring_task_runs') then
    alter publication supabase_realtime add table public.recurring_task_runs; end if; end $$;
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='notifications') then
    alter publication supabase_realtime add table public.notifications; end if; end $$;

-- Seed "Họp Performance" nếu chưa có
insert into public.recurring_tasks (title, kind, frequency, weekday, time_of_day, remind_days_before, remind_minutes_before)
select 'Họp Performance', 'meeting', 'weekly', 6, '10:00', 2, 60
where not exists (select 1 from public.recurring_tasks where title = 'Họp Performance');
