-- ============================================================
-- 011_recurring_tasks_full_schema.sql
-- Đảm bảo bảng recurring_tasks có đủ các cột cần thiết.
-- Idempotent — chạy nhiều lần không sao.
-- Chạy toàn bộ script trong Supabase SQL Editor.
-- ============================================================

-- Thêm các cột từ migration 005
ALTER TABLE public.recurring_tasks
  ADD COLUMN IF NOT EXISTS host_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS observer_ids uuid[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS participant_ids uuid[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS objective text,
  ADD COLUMN IF NOT EXISTS agenda text,
  ADD COLUMN IF NOT EXISTS preparation_checklist jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS related_task_ids uuid[] DEFAULT '{}';

-- Thêm cột từ migration 006 (department_ids array)
ALTER TABLE public.recurring_tasks
  ADD COLUMN IF NOT EXISTS department_ids uuid[] DEFAULT '{}';

-- Migrate dữ liệu cũ nếu có department_id
UPDATE public.recurring_tasks
SET department_ids = ARRAY[department_id]
WHERE department_id IS NOT NULL
  AND (department_ids IS NULL OR array_length(department_ids, 1) IS NULL);

-- Kiểm tra kết quả
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'recurring_tasks'
  AND column_name IN (
    'host_id', 'observer_ids', 'participant_ids', 'department_id',
    'department_ids', 'objective', 'agenda', 'preparation_checklist',
    'related_task_ids'
  )
ORDER BY column_name;
-- Kết quả mong muốn: 9 dòng
