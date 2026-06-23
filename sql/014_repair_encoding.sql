-- ============================================================
-- 014_repair_encoding.sql  (v2 — có transaction + backup + rollback)
-- Sửa task titles bị lỗi encoding (dấu ? thay cho ký tự tiếng Việt).
--
-- HƯỚNG DẪN CHẠY AN TOÀN — ĐỌC TRƯỚC KHI CHẠY BẤT KỲ LỆNH NÀO:
--   Bước A: Chạy PREVIEW → xem số record và ID.
--   Bước B: Báo kết quả preview cho người phụ trách xác nhận.
--   Bước C: Sau khi được xác nhận, chạy BACKUP để tạo snapshot.
--   Bước D: Trong cùng session, chạy REPAIR (trong transaction).
--   Bước E: Chạy VERIFY để so sánh.
--   Bước F: Nếu VERIFY đúng → COMMIT. Nếu sai → ROLLBACK.
--   Rollback bất kỳ lúc nào: xem phần ROLLBACK cuối file.
-- ============================================================

-- ── BƯỚC A: PREVIEW ──────────────────────────────────────────
-- Chạy phần này TRƯỚC. Không thay đổi gì cả.
-- Kết quả mong muốn: danh sách các task bị lỗi encoding.
-- Nếu trả 0 dòng → không có gì cần sửa, dừng tại đây.
/*
SELECT
  id,
  title AS title_hien_tai,
  created_at
FROM public.tasks
WHERE title IN (
  '[TEST] Task tr? deadline',
  '[TEST] Task s?p t?i h?n',
  '[TEST] Task thi?u deadline',
  '[TEST] Task thi?u file báo cáo'
)
ORDER BY created_at;
*/

-- ── BƯỚC B: BACKUP ───────────────────────────────────────────
-- Chỉ chạy sau khi preview xác nhận đúng record.
-- Bảng backup dùng old_title để rollback an toàn.
-- backup_at dùng now() trong CTAS — hợp lệ (không phải trong workflow script).
/*
CREATE TABLE IF NOT EXISTS public._backup_014_tasks AS
SELECT
  id,
  title     AS old_title,
  created_at,
  now()     AS backup_at
FROM public.tasks
WHERE title IN (
  '[TEST] Task tr? deadline',
  '[TEST] Task s?p t?i h?n',
  '[TEST] Task thi?u deadline',
  '[TEST] Task thi?u file báo cáo'
);

-- Bảo vệ bảng backup: không để anon hoặc authenticated thường xem
ALTER TABLE public._backup_014_tasks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_014_tasks FROM anon;
REVOKE ALL ON public._backup_014_tasks FROM authenticated;
-- Chỉ service role (Dashboard/API) mới xem được backup

-- Xác nhận backup tạo thành công
SELECT id, old_title, created_at, backup_at
FROM public._backup_014_tasks
ORDER BY created_at;
*/

-- ── BƯỚC C: REPAIR (trong transaction) ───────────────────────
-- Chỉ chạy sau khi backup xác nhận đúng.
-- BEGIN/COMMIT/ROLLBACK phải chạy trong cùng một SQL Editor session.
-- Supabase SQL Editor hỗ trợ transaction thủ công.
/*
BEGIN;

-- Sửa task titles — chỉ exact match, không dùng LIKE '%?%'
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

-- Xoá task_alerts liên quan (sẽ tự tạo lại khi scan — không xóa nhầm)
DELETE FROM public.task_alerts
WHERE title = ANY(ARRAY[
  '[TEST] Task trễ deadline',
  '[TEST] Task sắp tới hạn',
  '[TEST] Task thiếu deadline',
  '[TEST] Task thiếu file báo cáo',
  '[TEST] Task tr? deadline',
  '[TEST] Task s?p t?i h?n',
  '[TEST] Task thi?u deadline'
]);

-- Xoá notifications liên quan (sẽ tự tạo lại)
DELETE FROM public.notifications
WHERE title = ANY(ARRAY[
  '[TEST] Task trễ deadline',
  '[TEST] Task sắp tới hạn',
  '[TEST] Task thiếu deadline',
  '[TEST] Task thiếu file báo cáo',
  '[TEST] Task tr? deadline',
  '[TEST] Task s?p t?i h?n',
  '[TEST] Task thi?u deadline'
]);

-- ── BƯỚC D: VERIFY (trong cùng transaction) ──────────────────
-- Kiểm tra kết quả TRƯỚC KHI COMMIT.
-- Nếu bất kỳ kết quả nào không như mong đợi → ROLLBACK.

-- 1. Danh sách record đã sửa: phải thấy title đúng dấu
SELECT t.id, t.title AS title_moi, b.old_title
FROM public.tasks t
JOIN public._backup_014_tasks b ON t.id = b.id
ORDER BY t.title;

-- 2. Số record sửa phải khớp số record backup
SELECT
  (SELECT count(*) FROM public._backup_014_tasks)         AS backup_count,
  (SELECT count(*) FROM public.tasks t
   JOIN public._backup_014_tasks b ON t.id = b.id
   WHERE t.title <> b.old_title)                          AS changed_count;
-- backup_count phải bằng changed_count

-- 3. Không còn record lỗi encoding trong tasks
SELECT count(*) AS con_loi
FROM public.tasks
WHERE title LIKE '%tr? deadline%'
   OR title LIKE '%s?p t?i h?n%'
   OR title LIKE '%thi?u deadline%';
-- Phải trả về 0

-- ── NẾU VERIFY ĐÚNG: COMMIT ──────────────────────────────────
-- Thay thế lệnh này bằng ROLLBACK nếu verify không đúng
COMMIT;
-- ROLLBACK;
*/

-- ── BƯỚC E: ROLLBACK (chạy riêng nếu cần hoàn tác) ──────────
-- Dùng old_title từ bảng backup — không dùng title (đã bị đổi tên thành old_title).
/*
UPDATE public.tasks t
SET title = b.old_title
FROM public._backup_014_tasks b
WHERE t.id = b.id;

-- Xác nhận rollback
SELECT t.id, t.title AS title_sau_rollback
FROM public.tasks t
JOIN public._backup_014_tasks b ON t.id = b.id;
*/

-- ── PHÒNG NGỪA TƯƠNG LAI ────────────────────────────────────
-- Khi INSERT dữ liệu tiếng Việt qua SQL Editor:
--   - Dùng Supabase Dashboard → Table Editor (luôn UTF-8)
--   - Nếu dùng SQL Editor: chạy SET client_encoding = 'UTF8'; trước
--   - Không paste từ Windows Notepad (ANSI) vào SQL Editor
--   - File .sql phải lưu UTF-8 (không phải ANSI/Windows-1252)
