-- ============================================================
-- 013_deadline_approval_log.sql
-- Bảng lưu lịch sử duyệt deadline (MyDeadlineInbox component).
-- Thêm 2 cột deadline_decided_by/at vào tasks.
-- Idempotent — chạy nhiều lần không sao.
-- ============================================================

-- Bảng lịch sử duyệt deadline
CREATE TABLE IF NOT EXISTS public.task_deadline_approval_log (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id         uuid        NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  round           int         NOT NULL DEFAULT 1,
  submitter_id    uuid        REFERENCES public.employees(id) ON DELETE SET NULL,
  proposed_deadline date,
  approver_id     uuid        REFERENCES public.employees(id) ON DELETE SET NULL,
  decision        text        NOT NULL,  -- approve | reject
  note            text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deadline_log_task_id ON public.task_deadline_approval_log(task_id);

GRANT ALL ON public.task_deadline_approval_log TO anon, authenticated;

ALTER TABLE public.task_deadline_approval_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'task_deadline_approval_log' AND policyname = 'public read write'
  ) THEN
    CREATE POLICY "public read write"
      ON public.task_deadline_approval_log FOR ALL
      USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Thêm 2 cột còn thiếu vào tasks
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS deadline_decided_by uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deadline_decided_at  timestamptz;

-- Kiểm tra
SELECT column_name FROM information_schema.columns
WHERE table_name = 'task_deadline_approval_log'
ORDER BY ordinal_position;
-- Kết quả mong muốn: 10 cột
