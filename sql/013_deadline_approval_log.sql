-- ============================================================
-- 013_deadline_approval_log.sql  (v2 — RLS an toàn)
-- Bảng lịch sử duyệt/từ chối deadline.
-- Idempotent — chạy nhiều lần không sao.
--
-- Yêu cầu: employees.auth_user_id = auth.uid() (đã có trong hệ thống).
-- Dữ liệu nhạy cảm: không cấp anon bất kỳ quyền nào.
-- ============================================================

-- ── 1. Tạo bảng ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.task_deadline_approval_log (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id          uuid        NOT NULL REFERENCES public.tasks(id)     ON DELETE CASCADE,
  round            int         NOT NULL DEFAULT 1,
  submitter_id     uuid        REFERENCES public.employees(id)          ON DELETE SET NULL,
  proposed_deadline date,
  approver_id      uuid        REFERENCES public.employees(id)          ON DELETE SET NULL,
  decision         text        NOT NULL,  -- requested | approved | rejected
  note             text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deadline_log_task_id
  ON public.task_deadline_approval_log(task_id);

-- ── 2. Grant — không cấp anon ─────────────────────────────────
-- anon: không có quyền gì
REVOKE ALL ON public.task_deadline_approval_log FROM anon;

-- authenticated: chỉ SELECT/INSERT/UPDATE (không DELETE)
-- RLS sẽ thu hẹp xuống record cụ thể mà user được phép.
GRANT SELECT, INSERT, UPDATE
  ON public.task_deadline_approval_log TO authenticated;

-- ── 3. Bật RLS ────────────────────────────────────────────────
ALTER TABLE public.task_deadline_approval_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_deadline_approval_log FORCE ROW LEVEL SECURITY;

-- ── 4. Policy SELECT ─────────────────────────────────────────
-- Được xem nếu là: submitter, approver, task assignee/head, hoặc admin/coo/ceo.
DO $$ BEGIN
  DROP POLICY IF EXISTS "deadline_log_select" ON public.task_deadline_approval_log;
END $$;

CREATE POLICY "deadline_log_select"
  ON public.task_deadline_approval_log
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.auth_user_id = auth.uid()
        AND (
          -- người gửi yêu cầu
          e.id = submitter_id
          -- người duyệt được chỉ định
          OR e.id = approver_id
          -- admin/coo/ceo xem tất cả
          OR e.role IN ('admin', 'coo', 'ceo')
          -- assignee hoặc head của task
          OR e.id IN (
            SELECT t.assignee_id FROM public.tasks t
            WHERE t.id = task_id AND t.assignee_id IS NOT NULL
            UNION
            SELECT t.head_id FROM public.tasks t
            WHERE t.id = task_id AND t.head_id IS NOT NULL
          )
        )
    )
  );

-- ── 5. Policy INSERT ─────────────────────────────────────────
-- Được INSERT nếu là: người liên quan đến task, hoặc admin/coo/ceo.
-- Ngăn client tự đặt approver_id = mình rồi tự duyệt (kiểm tra trong API).
DO $$ BEGIN
  DROP POLICY IF EXISTS "deadline_log_insert" ON public.task_deadline_approval_log;
END $$;

CREATE POLICY "deadline_log_insert"
  ON public.task_deadline_approval_log
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.auth_user_id = auth.uid()
        AND (
          -- người ghi là submitter của record (không cho ghi nhân danh người khác)
          e.id = submitter_id
          -- admin/coo/ceo có thể ghi bất kỳ record nào (audit)
          OR e.role IN ('admin', 'coo', 'ceo')
        )
    )
  );

-- ── 6. Policy UPDATE ─────────────────────────────────────────
-- Chỉ approver được chỉ định hoặc admin/coo/ceo mới được cập nhật quyết định.
-- Chặn self-approval: submitter không được UPDATE record mà mình là submitter
-- (trừ khi là admin/coo/ceo — họ được phép override theo đặc quyền).
DO $$ BEGIN
  DROP POLICY IF EXISTS "deadline_log_update" ON public.task_deadline_approval_log;
END $$;

CREATE POLICY "deadline_log_update"
  ON public.task_deadline_approval_log
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.auth_user_id = auth.uid()
        AND (
          -- approver được chỉ định — nhưng không được tự duyệt yêu cầu của chính mình
          (e.id = approver_id AND e.id <> submitter_id)
          -- admin/coo/ceo: override được, kể cả khi là submitter (quyền quản trị)
          OR e.role IN ('admin', 'coo', 'ceo')
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.auth_user_id = auth.uid()
        AND (
          (e.id = approver_id AND e.id <> submitter_id)
          OR e.role IN ('admin', 'coo', 'ceo')
        )
    )
  );

-- ── 7. Không có DELETE policy ────────────────────────────────
-- Không ai xóa được approval log qua client.
-- Nếu cần xóa vì quản trị: dùng Supabase Dashboard hoặc service role.

-- ── 8. Thêm cột vào tasks (idempotent) ───────────────────────
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS deadline_decided_by  uuid        REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deadline_decided_at  timestamptz;

-- ── 9. Kiểm tra sau migration ────────────────────────────────
-- Kết quả mong muốn: 10 cột
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'task_deadline_approval_log'
ORDER BY ordinal_position;

-- Xác nhận RLS đang bật và không có policy anon
SELECT policyname, cmd, roles::text
FROM pg_policies
WHERE tablename = 'task_deadline_approval_log'
ORDER BY policyname;

-- ── GHI CHÚ QUAN TRỌNG CHO API ───────────────────────────────
-- DeadlineBlock.tsx gọi INSERT/UPDATE qua supabase client (authenticated session).
-- RLS sẽ tự kiểm tra quyền. Tuy nhiên, API server (nếu dùng service role)
-- PHẢI tự kiểm tra:
--   1. session.user.id → tìm employee → lấy role
--   2. Xác nhận user là approver của task (không cho client truyền approver_id tùy ý)
--   3. Không cho submitter = approver trừ khi role admin/coo/ceo
-- Service role bypass RLS hoàn toàn → phải enforce trong code API.
