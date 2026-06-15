-- VyVy WorkOS — Push subscriptions cho Web Push notification
-- Chạy trong Supabase Dashboard > SQL Editor

create table if not exists push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz default now()
);

create index if not exists push_subscriptions_employee_idx on push_subscriptions(employee_id);

-- RLS
alter table push_subscriptions enable row level security;
create policy "Own subscriptions only" on push_subscriptions
  for all using (true) with check (true);
