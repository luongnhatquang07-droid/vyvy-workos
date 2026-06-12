-- Bảng thông báo trong app — chạy 1 lần trong Supabase Dashboard > SQL Editor
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

-- Realtime để chuông tự nhảy số
alter publication supabase_realtime add table public.notifications;

-- RLS mở (app đang dùng anon key cho mọi thao tác)
alter table public.notifications enable row level security;
drop policy if exists "notifications_all" on public.notifications;
create policy "notifications_all" on public.notifications for all using (true) with check (true);
