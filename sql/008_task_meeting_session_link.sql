-- ============================================================
-- 008_task_meeting_session_link.sql
-- Chuẩn hóa liên kết dữ liệu: task ↔ meeting_session
-- Additive only — không xóa/sửa dữ liệu cũ.
-- Chạy trong Supabase SQL Editor.
-- ============================================================

-- 1. Thêm meeting_session_id vào bảng tasks
--    Task sinh ra từ buổi họp nào sẽ được gắn ID buổi họp đó.
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS meeting_session_id uuid
    REFERENCES public.meeting_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS tasks_meeting_session_id_idx
  ON public.tasks (meeting_session_id)
  WHERE meeting_session_id IS NOT NULL;

-- 2. Thêm meeting_session_id vào recurring_meeting_files
--    File biên bản có thể thuộc về một buổi họp cụ thể (backward compat: có thể NULL).
ALTER TABLE public.recurring_meeting_files
  ADD COLUMN IF NOT EXISTS meeting_session_id uuid
    REFERENCES public.meeting_sessions(id) ON DELETE SET NULL;

-- 3. Thêm pending_issues vào meeting_sessions
--    Lưu vấn đề còn pending sau buổi họp (theo spec).
ALTER TABLE public.meeting_sessions
  ADD COLUMN IF NOT EXISTS pending_issues jsonb DEFAULT '[]';

-- 4. Thêm prep_resources vào recurring_tasks
--    Hồ sơ/tài liệu cần chuẩn bị (danh sách URL/tên file).
ALTER TABLE public.recurring_tasks
  ADD COLUMN IF NOT EXISTS prep_resources jsonb DEFAULT '[]';

-- ============================================================
-- Kiểm tra kết quả
-- ============================================================
SELECT 'tasks' AS tbl, column_name, data_type
FROM information_schema.columns
WHERE table_name = 'tasks' AND column_name = 'meeting_session_id'
UNION ALL
SELECT 'recurring_meeting_files', column_name, data_type
FROM information_schema.columns
WHERE table_name = 'recurring_meeting_files' AND column_name = 'meeting_session_id'
UNION ALL
SELECT 'meeting_sessions', column_name, data_type
FROM information_schema.columns
WHERE table_name = 'meeting_sessions' AND column_name = 'pending_issues'
UNION ALL
SELECT 'recurring_tasks', column_name, data_type
FROM information_schema.columns
WHERE table_name = 'recurring_tasks' AND column_name = 'prep_resources';
-- Kết quả mong muốn: 4 dòng
