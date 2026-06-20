-- ============================================================
-- 012_task_alerts.sql
-- Bảng lưu trạng thái cảnh báo vận hành cho COO Alert Engine.
-- Idempotent — chạy nhiều lần không sao.
-- Chạy toàn bộ script trong Supabase SQL Editor.
-- ============================================================

-- Tạo bảng task_alerts
CREATE TABLE IF NOT EXISTS public.task_alerts (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_key      text        NOT NULL UNIQUE,           -- "alert_type:entity_type:entity_id"
  alert_type     text        NOT NULL,                  -- overdue | due_soon | missing_deadline | extension_pending | has_issue | no_assignee | no_progress
  entity_type    text        NOT NULL DEFAULT 'task',
  entity_id      uuid        NOT NULL,
  severity       text        NOT NULL DEFAULT 'warning', -- critical | warning | info
  title          text        NOT NULL,
  body           text,
  task_id        uuid        REFERENCES public.tasks(id) ON DELETE CASCADE,
  last_notified_at timestamptz,
  resolved_at    timestamptz,
  status         text        NOT NULL DEFAULT 'active', -- active | resolved
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- Index để query nhanh
CREATE INDEX IF NOT EXISTS idx_task_alerts_status    ON public.task_alerts(status);
CREATE INDEX IF NOT EXISTS idx_task_alerts_entity_id ON public.task_alerts(entity_id);
CREATE INDEX IF NOT EXISTS idx_task_alerts_type      ON public.task_alerts(alert_type);

-- RLS: cho phép anon đọc/ghi (khớp pattern các bảng khác)
ALTER TABLE public.task_alerts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'task_alerts' AND policyname = 'public read write'
  ) THEN
    CREATE POLICY "public read write"
      ON public.task_alerts FOR ALL
      USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Kiểm tra kết quả
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'task_alerts'
ORDER BY ordinal_position;
-- Kết quả mong muốn: 13 cột
