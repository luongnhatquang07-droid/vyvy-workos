-- ============================================================
-- 007_meeting_sessions.sql
-- Tạo bảng meeting_sessions để lưu lịch sử từng lần họp thực tế
-- của lịch định kỳ (recurring_tasks).
-- Additive only — không xóa/sửa dữ liệu cũ.
-- Chạy trong Supabase SQL Editor.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.meeting_sessions (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id              uuid NOT NULL REFERENCES public.recurring_tasks(id) ON DELETE CASCADE,
  title                    text,
  occurred_at              date NOT NULL,
  start_time               time,
  end_time                 time,
  status                   text NOT NULL DEFAULT 'completed'
                             CHECK (status IN ('planned','completed','skipped','cancelled')),
  host_id                  uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  department_ids           uuid[] DEFAULT '{}',
  participant_ids          uuid[] DEFAULT '{}',
  recap                    text,
  minutes_url              text,
  minutes_file_id          uuid REFERENCES public.recurring_meeting_files(id) ON DELETE SET NULL,
  decisions                jsonb DEFAULT '[]',
  action_items             jsonb DEFAULT '[]',
  linked_task_ids          jsonb DEFAULT '[]',
  prep_checklist_snapshot  jsonb DEFAULT '[]',
  prep_resources_snapshot  jsonb DEFAULT '[]',
  notes                    text,
  created_by               uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

-- Index để query nhanh theo schedule + ngày
CREATE INDEX IF NOT EXISTS meeting_sessions_schedule_id_idx
  ON public.meeting_sessions (schedule_id, occurred_at DESC);

-- RLS: tắt như các bảng seed khác để anon đọc/ghi được (khớp pattern hiện tại)
ALTER TABLE public.meeting_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_meeting_sessions" ON public.meeting_sessions;
CREATE POLICY "allow_all_meeting_sessions"
  ON public.meeting_sessions FOR ALL
  USING (true)
  WITH CHECK (true);

-- Kiểm tra
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'meeting_sessions'
ORDER BY ordinal_position;
