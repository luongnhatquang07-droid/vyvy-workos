-- VyVy WorkOS — Thêm cột deadline approval cho task_steps
-- Chạy trong Supabase Dashboard > SQL Editor

alter table task_steps
  add column if not exists step_deadline_status text not null default 'draft',
  add column if not exists step_proposed_deadline date,
  add column if not exists step_deadline_approver_id uuid references employees(id),
  add column if not exists step_deadline_note text;

-- Index để query nhanh theo trạng thái
create index if not exists task_steps_deadline_status_idx on task_steps(step_deadline_status);
