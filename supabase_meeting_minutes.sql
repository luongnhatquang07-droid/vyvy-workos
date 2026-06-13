-- Đảm bảo bảng lưu biên bản họp + cột thời gian để xem lại lịch sử/recap.
create table if not exists public.meeting_minutes (
  id uuid primary key default gen_random_uuid(),
  title text,
  raw_content text,
  summary text,
  created_by uuid references employees(id) on delete set null,
  created_at timestamp with time zone default now()
);

alter table public.meeting_minutes add column if not exists created_at timestamp with time zone default now();
alter table public.meeting_minutes add column if not exists created_by uuid references employees(id) on delete set null;

create index if not exists idx_meeting_minutes_created on public.meeting_minutes(created_at desc);
