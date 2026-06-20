-- ============================================================
-- 010_reschedule_meeting.sql
-- Thêm khả năng "dời lịch" cho meeting_sessions.
-- Additive only — không xóa/sửa dữ liệu cũ.
-- Chạy trong Supabase SQL Editor.
-- ============================================================

ALTER TABLE public.meeting_sessions
  ADD COLUMN IF NOT EXISTS original_occurred_at date,
  ADD COLUMN IF NOT EXISTS original_start_time  time,
  ADD COLUMN IF NOT EXISTS reschedule_reason    text,
  ADD COLUMN IF NOT EXISTS rescheduled_by       uuid
    REFERENCES public.employees(id) ON DELETE SET NULL;

-- Kiểm tra
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'meeting_sessions'
  AND column_name  IN ('original_occurred_at','original_start_time','reschedule_reason','rescheduled_by')
ORDER BY column_name;
-- Kết quả mong muốn: 4 dòng
