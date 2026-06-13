-- ════ CHẠY 1 LẦN trong Supabase Dashboard > SQL Editor ════
-- Gồm: notifications + recurring_tasks + kho file họp + lịch chạy nhắc + seed 2 việc

-- 1. Bảng thông báo trong app
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
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
alter table public.notifications enable row level security;
drop policy if exists "notifications_all" on public.notifications;
create policy "notifications_all" on public.notifications for all using (true) with check (true);

-- 2. Bảng việc định kỳ (họp, báo cáo... hằng ngày / tuần / tháng)
create table if not exists public.recurring_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  kind text not null default 'task',            -- 'meeting' | 'report' | 'task'
  frequency text not null default 'weekly',     -- 'daily' | 'weekly' | 'monthly'
  weekday int,                                  -- 0=CN .. 6=T7 (cho weekly)
  month_day int,                                -- 1..31 (cho monthly)
  time_of_day text not null default '09:00',    -- giờ diễn ra / hạn nộp kết quả
  assignee_id uuid,                             -- người nhận nhắc chính (giữ tương thích cũ)
  recipient_ids uuid[],                         -- nhiều người nhận nhắc
  remind_days_before int not null default 2,    -- nhắc trước N ngày (tuần/tháng)
  remind_minutes_before int not null default 60,-- nhắc trước N phút
  is_active boolean not null default true,
  notified_early_for text,                      -- chống nhắc trùng (key lần nhắc sớm)
  notified_near_for text,                       -- chống nhắc trùng (key lần nhắc gần)
  created_by uuid,
  created_at timestamptz not null default now()
);
alter table public.recurring_tasks add column if not exists recipient_ids uuid[];
update public.recurring_tasks
set recipient_ids = array[assignee_id]
where assignee_id is not null and (recipient_ids is null or cardinality(recipient_ids) = 0);
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'recurring_tasks'
  ) then
    alter publication supabase_realtime add table public.recurring_tasks;
  end if;
end $$;
alter table public.recurring_tasks enable row level security;
drop policy if exists "recurring_all" on public.recurring_tasks;
create policy "recurring_all" on public.recurring_tasks for all using (true) with check (true);

-- 3. Lịch sử tác vụ nền chạy nhắc việc định kỳ
create table if not exists public.recurring_task_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'cron',          -- 'cron' | 'manual' | 'local-dev'
  status text not null default 'running',       -- 'running' | 'success' | 'error'
  scanned int,
  notifications_sent int,
  detail jsonb not null default '{}'::jsonb,
  triggered_by uuid,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists recurring_task_runs_started_idx on public.recurring_task_runs (started_at desc);
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'recurring_task_runs'
  ) then
    alter publication supabase_realtime add table public.recurring_task_runs;
  end if;
end $$;
alter table public.recurring_task_runs enable row level security;
drop policy if exists "recurring_runs_all" on public.recurring_task_runs;
create policy "recurring_runs_all" on public.recurring_task_runs for all using (true) with check (true);

-- 4. Kho file/link cho từng cuộc họp định kỳ
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
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'recurring_meeting_files'
  ) then
    alter publication supabase_realtime add table public.recurring_meeting_files;
  end if;
end $$;
alter table public.recurring_meeting_files enable row level security;
drop policy if exists "recurring_meeting_files_all" on public.recurring_meeting_files;
create policy "recurring_meeting_files_all" on public.recurring_meeting_files for all using (true) with check (true);

-- Bucket upload file họp. Nếu project đã có bucket riêng, có thể đổi tên bucket trong app/page.tsx.
insert into storage.buckets (id, name, public)
values ('meeting-files', 'meeting-files', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "meeting_files_storage_all" on storage.objects;
create policy "meeting_files_storage_all" on storage.objects
for all
using (bucket_id = 'meeting-files')
with check (bucket_id = 'meeting-files');

-- 5. Seed 2 việc định kỳ (gắn cho tài khoản justin)
do $$
declare
  performance_assignee uuid;
  performance_task_id uuid;
  performance_description text := $desc$
Họp Performance định kỳ thứ 7 hằng tuần lúc 10:00.

RECAP cuộc họp trước đó:
- Tổng hợp các quyết định đã chốt trong buổi họp Performance gần nhất.
- Rà lại action items, người phụ trách, deadline và trạng thái hoàn thành.
- Ghi rõ vấn đề còn tồn đọng, nguyên nhân và việc cần follow-up tiếp.

File cần chuẩn bị:
- File recap/biên bản cuộc họp Performance trước đó.
- Báo cáo KPI/Performance tuần gần nhất.
- Bảng tiến độ mục tiêu/OKR hoặc các chỉ số vận hành liên quan.
- Danh sách action items tuần trước và trạng thái từng đầu việc.
- Các file số liệu, dashboard, bằng chứng hoặc link báo cáo cần trình trong cuộc họp.

Lịch sử họp:
- Chưa có lịch sử họp.
- Sau mỗi buổi họp, ghi ngày họp, nội dung đã chốt, người phụ trách và việc cần follow-up.
$desc$;
begin
  select id into performance_assignee
  from public.employees
  where email = 'justin.bie.map@vyvystore.vn'
  limit 1;

  select id into performance_task_id
  from public.recurring_tasks
  where title = 'Họp Performance'
  order by created_at
  limit 1;

  if performance_task_id is null then
    insert into public.recurring_tasks (
      title,
      kind,
      frequency,
      weekday,
      time_of_day,
      assignee_id,
      recipient_ids,
      remind_days_before,
      remind_minutes_before,
      description
    )
    values (
      'Họp Performance',
      'meeting',
      'weekly',
      6,
      '10:00',
      performance_assignee,
      case when performance_assignee is null then null else array[performance_assignee] end,
      2,
      60,
      performance_description
    );
  else
    update public.recurring_tasks
    set
      kind = 'meeting',
      frequency = 'weekly',
      weekday = 6,
      month_day = null,
      time_of_day = '10:00',
      assignee_id = coalesce(assignee_id, performance_assignee),
      recipient_ids = case
        when recipient_ids is null or cardinality(recipient_ids) = 0
          then case when performance_assignee is null then null else array[performance_assignee] end
        else recipient_ids
      end,
      remind_days_before = 2,
      remind_minutes_before = 60,
      is_active = true,
      description = performance_description
    where id = performance_task_id;
  end if;
end $$;

insert into public.recurring_tasks (title, kind, frequency, weekday, time_of_day, assignee_id, recipient_ids, remind_days_before, remind_minutes_before, description)
select 'Báo cáo công việc tuần cho sếp', 'report', 'weekly', 1, '09:00',
  (select id from public.employees where email = 'justin.bie.map@vyvystore.vn' limit 1),
  case
    when (select id from public.employees where email = 'justin.bie.map@vyvystore.vn' limit 1) is null
      then null
    else array[(select id from public.employees where email = 'justin.bie.map@vyvystore.vn' limit 1)]
  end,
  2, 60, 'Báo cáo công việc hằng tuần, nộp sếp định kỳ thứ 2'
where not exists (select 1 from public.recurring_tasks where title = 'Báo cáo công việc tuần cho sếp');
