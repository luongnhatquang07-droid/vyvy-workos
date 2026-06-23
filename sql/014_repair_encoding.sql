-- ============================================================
-- 014_repair_encoding.sql
-- Sửa dữ liệu test bị lỗi encoding (? thay cho ký tự tiếng Việt).
-- Nguyên nhân: các task [TEST] được INSERT qua SQL Editor với
-- client encoding sai → PostgreSQL thay ký tự không đại diện
-- được bằng dấu ? (không phải lỗi font hay source code).
--
-- An toàn: chỉ UPDATE/DELETE record lỗi, không DROP/TRUNCATE.
-- Idempotent: chạy nhiều lần không sao.
--
-- HƯỚNG DẪN CHẠY AN TOÀN:
-- Bước 1: Chạy phần "PREVIEW" bên dưới để xem record sẽ bị đổi.
-- Bước 2: Chạy phần "BACKUP" để tạo snapshot.
-- Bước 3: Xem snapshot xác nhận đúng.
-- Bước 4: Chạy phần "REPAIR" để sửa.
-- Bước 5: Chạy phần "VERIFY" để so sánh trước/sau.
-- Rollback: Chạy phần "ROLLBACK" nếu cần hoàn tác.
-- ============================================================

-- ── BƯỚC 1: PREVIEW — chỉ SELECT, không sửa gì ──────────────
-- Chạy phần này trước. Kết quả là danh sách record sẽ bị sửa.
/*
SELECT id, title, created_at
FROM public.tasks
WHERE title IN (
  '[TEST] Task tr? deadline',
  '[TEST] Task s?p t?i h?n',
  '[TEST] Task thi?u deadline',
  '[TEST] Task thi?u file báo cáo'
)
ORDER BY created_at;
*/

-- ── BƯỚC 2: BACKUP — tạo snapshot trước khi sửa ─────────────
-- Chạy phần này sau khi xem preview thấy đúng record.
-- Bảng _backup_014_tasks tồn tại mãi cho đến khi bạn DROP thủ công.
/*
CREATE TABLE IF NOT EXISTS public._backup_014_tasks AS
SELECT id, title, created_at
FROM public.tasks
WHERE title IN (
  '[TEST] Task tr? deadline',
  '[TEST] Task s?p t?i h?n',
  '[TEST] Task thi?u deadline',
  '[TEST] Task thi?u file báo cáo'
);

SELECT * FROM public._backup_014_tasks;
*/

-- ── BƯỚC 3: ROLLBACK (chỉ khi cần hoàn tác) ─────────────────
-- Không chạy cùng lúc với REPAIR. Chỉ dùng khi muốn hoàn tác.
/*
UPDATE public.tasks
SET title = b.title
FROM public._backup_014_tasks b
WHERE public.tasks.id = b.id;
*/

-- ── BƯỚC 4: REPAIR ───────────────────────────────────────────
-- Sửa đúng những chuỗi xác định chắc chắn bị lỗi encoding.
-- KHÔNG dùng LIKE '?%' hay thay hàng loạt — chỉ sửa exact match.
UPDATE public.tasks
SET title = CASE title
  WHEN '[TEST] Task tr? deadline'         THEN '[TEST] Task trễ deadline'
  WHEN '[TEST] Task s?p t?i h?n'          THEN '[TEST] Task sắp tới hạn'
  WHEN '[TEST] Task thi?u deadline'       THEN '[TEST] Task thiếu deadline'
  WHEN '[TEST] Task thi?u file báo cáo'   THEN '[TEST] Task thiếu file báo cáo'
  ELSE title
END
WHERE title IN (
  '[TEST] Task tr? deadline',
  '[TEST] Task s?p t?i h?n',
  '[TEST] Task thi?u deadline',
  '[TEST] Task thi?u file báo cáo'
);

-- Xoá task_alerts cũ bị lỗi (sẽ tự tạo lại khi scan)
DELETE FROM public.task_alerts
WHERE title LIKE '%tr? deadline%'
   OR title LIKE '%s?p t?i h?n%'
   OR title LIKE '%thi?u deadline%'
   OR body  LIKE '%tr? deadline%'
   OR body  LIKE '%s?p t?i h?n%';

-- Xoá notifications bị lỗi (cũng tự tạo lại sau scan)
DELETE FROM public.notifications
WHERE title LIKE '%tr? deadline%'
   OR title LIKE '%s?p t?i h?n%'
   OR title LIKE '%thi?u deadline%'
   OR body  LIKE '%tr? deadline%'
   OR body  LIKE '%s?p t?i h?n%';

-- ── BƯỚC 5: VERIFY — so sánh trước/sau ──────────────────────
-- Kết quả mong muốn: các task đã sửa đúng dấu
SELECT id, title, created_at FROM public.tasks
WHERE title LIKE '[TEST]%'
ORDER BY created_at;

-- So sánh snapshot backup vs hiện tại (nếu đã tạo backup)
-- SELECT b.title AS title_cu, t.title AS title_moi
-- FROM public._backup_014_tasks b
-- JOIN public.tasks t ON t.id = b.id;

-- Kiểm tra không còn notification lỗi
SELECT count(*) AS notifications_with_question_marks
FROM public.notifications
WHERE title LIKE '%?%' AND title ~ '\?[a-z]';

-- ── LƯU Ý QUAN TRỌNG ─────────────────────────────────────────
-- Script này CHỈ sửa exact match các chuỗi đã biết chắc lỗi.
-- KHÔNG dùng LIKE '?%' hay regex thay hàng loạt vì dấu ? thật
-- (như câu hỏi) sẽ bị thay nhầm.
-- Nếu có task lỗi khác không nằm trong danh sách trên,
-- thêm vào WHERE IN và CASE WHEN sau khi xác minh cẩn thận.
--
-- Khi INSERT dữ liệu tiếng Việt qua SQL Editor:
--   - Dùng Supabase Dashboard → Table Editor (luôn UTF-8)
--   - Nếu dùng SQL Editor: SET client_encoding = 'UTF8';
--   - Không paste từ Windows Notepad (ANSI) vào SQL Editor
--   - File .sql phải lưu UTF-8 (không phải ANSI/Windows-1252)
