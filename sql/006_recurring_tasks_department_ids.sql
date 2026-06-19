-- ============================================================
-- 006_recurring_tasks_department_ids.sql
-- Thêm department_ids (array) để hỗ trợ lịch liên nhiều phòng ban.
-- Giữ department_id cũ để backward compat.
-- Additive only — không xóa/sửa dữ liệu cũ.
-- ============================================================

-- Thêm cột mới
ALTER TABLE public.recurring_tasks
  ADD COLUMN IF NOT EXISTS department_ids uuid[] DEFAULT '{}';

-- Migrate dữ liệu cũ: nếu có department_id thì copy vào department_ids
UPDATE public.recurring_tasks
SET department_ids = ARRAY[department_id]
WHERE department_id IS NOT NULL
  AND (department_ids IS NULL OR array_length(department_ids, 1) IS NULL);

-- Kiểm tra
SELECT id, title, department_id, department_ids
FROM public.recurring_tasks
WHERE department_id IS NOT NULL
LIMIT 10;
