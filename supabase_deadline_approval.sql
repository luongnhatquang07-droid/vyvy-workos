-- ───────────────────────────────────────────────────────────────────────────
-- VyVy WorkOS — Deadline Negotiation Approval (mức đầu việc / tasks)
-- Bổ sung lớp duyệt deadline: người dưới đề xuất deadline + tự chọn người duyệt;
-- người duyệt Duyệt (chốt) hoặc Không duyệt + nhập lý do → trả về nhập lại.
-- KHÔNG đụng hệ step-approval (department/coo/ceo) đang có trên task_steps.
-- Idempotent: chạy lại nhiều lần an toàn.
-- ───────────────────────────────────────────────────────────────────────────

alter table tasks
  -- deadline do người dưới đề xuất (sửa được khi draft/tra_lai)
  add column if not exists proposed_deadline date,
  -- trạng thái vòng duyệt deadline: draft | cho_duyet | tra_lai | da_duyet
  add column if not exists deadline_approval_status text default 'draft',
  -- người gửi duyệt (trưởng BP ở cấp 1, nhân viên ở cấp 2)
  add column if not exists deadline_submitter_id uuid references employees(id) on delete set null,
  -- người duyệt DO NGƯỜI GỬI CHỌN (COO/CEO ở cấp 1, trưởng BP ở cấp 2)
  add column if not exists deadline_approver_id uuid references employees(id) on delete set null,
  -- số vòng thương lượng (tăng mỗi lần gửi lại)
  add column if not exists deadline_round int default 0,
  -- lý do/ghi chú của người duyệt khi Không duyệt (vòng gần nhất)
  add column if not exists deadline_note text;

-- due_date (đã có) = deadline CHỐT, chỉ ghi khi deadline_approval_status = 'da_duyet'.

-- Lịch sử thương lượng: 1 dòng mỗi vòng gửi/quyết
create table if not exists task_deadline_approval_log (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  round int not null default 1,
  submitter_id uuid references employees(id) on delete set null,
  proposed_deadline date,
  approver_id uuid references employees(id) on delete set null,
  decision text,            -- 'approve' | 'reject' | 'submit'
  note text,                -- lý do khi reject
  created_at timestamp with time zone default now()
);

create index if not exists idx_tdal_task on task_deadline_approval_log(task_id);
create index if not exists idx_tasks_deadline_status on tasks(deadline_approval_status);
create index if not exists idx_tasks_deadline_approver on tasks(deadline_approver_id);

-- Backfill: việc đã có due_date coi như đã chốt deadline
update tasks
set deadline_approval_status = 'da_duyet'
where due_date is not null
  and (deadline_approval_status is null or deadline_approval_status = 'draft');
