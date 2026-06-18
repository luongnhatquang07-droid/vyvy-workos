-- ============================================================
-- VyVy WorkOS — Migration 003: Notifications RLS đúng chuẩn
-- ============================================================
-- THAY THẾ cách cũ (DISABLE RLS toàn bảng) bằng policy chính xác:
--   • User chỉ ĐỌC notification của chính mình
--   • User chỉ UPDATE (đánh dấu đã đọc) notification của chính mình
--   • Bất kỳ user đã xác thực (authenticated) đều INSERT được
--     notification cho người khác — đây là hành vi chủ ý: khi Quang
--     duyệt gia hạn cho Má Hồng, Quang (anon/authenticated) cần insert
--     notif vào bảng với recipient_id = Má Hồng. RLS phía employee
--     (SELECT/UPDATE) vẫn đảm bảo Má Hồng không thấy notif của Quang.
--
-- AN TOÀN: dùng DROP POLICY IF EXISTS trước khi tạo lại.
-- CÁCH CHẠY: Supabase Dashboard > SQL Editor > New query > Run
-- ============================================================

-- ── 1. Bật RLS lại (nếu chưa bật sau migration 002) ─────────
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- ── 2. Xoá các policy cũ (nếu có) để tránh conflict ─────────
DROP POLICY IF EXISTS "notifications_select_own"  ON notifications;
DROP POLICY IF EXISTS "notifications_insert_auth" ON notifications;
DROP POLICY IF EXISTS "notifications_update_own"  ON notifications;
DROP POLICY IF EXISTS "notifications_delete_own"  ON notifications;
DROP POLICY IF EXISTS "notifications_all"         ON notifications;
DROP POLICY IF EXISTS "Own notifications"         ON notifications;

-- Legacy policy từ lần đầu setup (nếu tồn tại)
DROP POLICY IF EXISTS "Users can view their own notifications" ON notifications;
DROP POLICY IF EXISTS "Users can insert notifications"        ON notifications;
DROP POLICY IF EXISTS "Users can update their own notifications" ON notifications;

-- ── 3. SELECT: chỉ xem notification của chính mình ───────────
-- Dùng email match qua auth.email() → employees.id vì app dùng
-- employees.id làm recipient_id, không phải auth.uid() trực tiếp.
CREATE POLICY "notifications_select_own" ON notifications
  FOR SELECT
  USING (
    recipient_id = (
      SELECT id FROM employees
      WHERE email = auth.email()
      LIMIT 1
    )
  );

-- ── 4. INSERT: bất kỳ user authenticated đều gửi được ────────
-- Cần cho phép Quang (authenticated) insert notif cho Má Hồng,
-- cho Má Hồng insert notif cho Quang khi xin gia hạn, v.v.
-- Không giới hạn recipient_id vì đó là người nhận, không phải người gửi.
CREATE POLICY "notifications_insert_auth" ON notifications
  FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
  );

-- ── 5. UPDATE: chỉ update (đọc/unread) notification của mình ──
CREATE POLICY "notifications_update_own" ON notifications
  FOR UPDATE
  USING (
    recipient_id = (
      SELECT id FROM employees
      WHERE email = auth.email()
      LIMIT 1
    )
  );

-- ── 6. DELETE: chỉ xoá notification của mình (tuỳ chọn) ──────
CREATE POLICY "notifications_delete_own" ON notifications
  FOR DELETE
  USING (
    recipient_id = (
      SELECT id FROM employees
      WHERE email = auth.email()
      LIMIT 1
    )
  );

-- ============================================================
-- Sau khi chạy: test bằng cách duyệt gia hạn → owner nhận notif.
-- Nếu cần revert về DISABLE RLS (tạm thời debug):
--   ALTER TABLE notifications DISABLE ROW LEVEL SECURITY;
-- ============================================================
