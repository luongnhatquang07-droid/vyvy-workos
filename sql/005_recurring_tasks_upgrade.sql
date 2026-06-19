-- ============================================================
-- 005_recurring_tasks_upgrade.sql
-- Nâng cấp bảng recurring_tasks: thêm field cho chuẩn bị họp,
-- người tham gia, mục tiêu, checklist, đầu việc liên quan.
-- Additive only — không xóa/đổi field cũ.
-- Chạy SELECT trước để kiểm tra, sau đó mới chạy ALTER.
-- ============================================================

-- Xem cấu trúc hiện tại
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'recurring_tasks' ORDER BY ordinal_position;

-- ============================================================
-- Thêm các field mới (idempotent — IF NOT EXISTS)
-- ============================================================

ALTER TABLE public.recurring_tasks
  ADD COLUMN IF NOT EXISTS host_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS observer_ids uuid[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS participant_ids uuid[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS objective text,
  ADD COLUMN IF NOT EXISTS agenda text,
  ADD COLUMN IF NOT EXISTS preparation_checklist jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS related_task_ids uuid[] DEFAULT '{}';

-- ============================================================
-- Kiểm tra sau khi thêm
-- ============================================================
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'recurring_tasks'
  AND column_name IN (
    'host_id','observer_ids','participant_ids','department_id',
    'objective','agenda','preparation_checklist','related_task_ids'
  );
-- Kết quả mong muốn: 8 dòng
