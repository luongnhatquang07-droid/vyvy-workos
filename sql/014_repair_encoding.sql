-- ============================================================
-- 014_repair_encoding.sql
-- Sửa dữ liệu test bị lỗi encoding (? thay cho ký tự tiếng Việt).
-- Nguyên nhân: các task [TEST] được INSERT qua SQL Editor với
-- client encoding sai → PostgreSQL thay ký tự không đại diện
-- được bằng dấu ? (không phải lỗi font hay source code).
--
-- An toàn: chỉ UPDATE/DELETE record lỗi, không DROP/TRUNCATE.
-- Idempotent: chạy nhiều lần không sao.
-- ============================================================

-- ── 1. Sửa task titles đã bị lưu ? ───────────────────────────
-- Xác định bằng cách đối chiếu tên có ? bất thường (giữa ký tự Latin)
UPDATE public.tasks
SET title = CASE title
  WHEN '[TEST] Task tr? deadline'   THEN '[TEST] Task trễ deadline'
  WHEN '[TEST] Task s?p t?i h?n'   THEN '[TEST] Task sắp tới hạn'
  WHEN '[TEST] Task thi?u deadline' THEN '[TEST] Task thiếu deadline'
  WHEN '[TEST] Task thi?u file báo cáo' THEN '[TEST] Task thiếu file báo cáo'
  ELSE title
END
WHERE title IN (
  '[TEST] Task tr? deadline',
  '[TEST] Task s?p t?i h?n',
  '[TEST] Task thi?u deadline',
  '[TEST] Task thi?u file báo cáo'
);

-- ── 2. Xoá task_alerts cũ bị lỗi (sẽ tự tạo lại khi scan) ──
DELETE FROM public.task_alerts
WHERE title LIKE '%tr? deadline%'
   OR title LIKE '%s?p t?i h?n%'
   OR title LIKE '%thi?u deadline%'
   OR body  LIKE '%tr? deadline%'
   OR body  LIKE '%s?p t?i h?n%';

-- ── 3. Xoá notifications bị lỗi (cũng tự tạo lại sau scan) ──
DELETE FROM public.notifications
WHERE title LIKE '%tr? deadline%'
   OR title LIKE '%s?p t?i h?n%'
   OR title LIKE '%thi?u deadline%'
   OR body  LIKE '%tr? deadline%'
   OR body  LIKE '%s?p t?i h?n%';

-- ── 4. Kiểm tra kết quả ────────────────────────────────────────
-- Kết quả mong muốn: các task đã sửa đúng dấu
SELECT id, title FROM public.tasks
WHERE title LIKE '[TEST]%'
ORDER BY created_at;

-- Kiểm tra không còn notification lỗi
SELECT count(*) AS notifications_with_question_marks
FROM public.notifications
WHERE title LIKE '%?%' AND title ~ '\?[a-z]';

-- ── 5. Phòng ngừa tương lai: comment hướng dẫn ───────────────
-- Khi INSERT dữ liệu tiếng Việt qua SQL Editor:
--   - Dùng Supabase Dashboard → Table Editor (luôn UTF-8)
--   - Nếu dùng SQL Editor: kiểm tra SET client_encoding = 'UTF8';
--   - Không paste từ Windows Notepad (ANSI) vào SQL Editor
--   - File .sql phải lưu UTF-8 (không phải ANSI/Windows-1252)
