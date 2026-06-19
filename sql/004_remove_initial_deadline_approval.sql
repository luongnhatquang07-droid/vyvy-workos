-- ============================================================
-- 004_remove_initial_deadline_approval.sql
-- Backfill: các step đang ở trạng thái chờ duyệt deadline ban đầu
-- → chuyển về null (deadline đã xem là chốt ngay khi giao việc)
-- KIỂM TRA trước khi chạy — không xóa dữ liệu task/step.
-- ============================================================

-- Xem trước số lượng bị ảnh hưởng (chạy SELECT trước để kiểm tra)
SELECT
  id, step_title, step_deadline_status,
  step_proposed_deadline, due_date
FROM task_steps
WHERE step_deadline_status IN ('cho_duyet', 'da_duyet', 'tra_lai', 'draft')
ORDER BY created_at DESC
LIMIT 50;

-- ============================================================
-- Sau khi xác nhận kết quả SELECT ổn, chạy UPDATE bên dưới:
-- ============================================================

-- Bước có deadline: xóa trạng thái phê duyệt cũ (deadline đã chốt ngầm định)
UPDATE task_steps
SET
  step_deadline_status = NULL,
  step_deadline_note   = NULL
WHERE step_deadline_status IN ('cho_duyet', 'da_duyet', 'tra_lai', 'draft')
  AND due_date IS NOT NULL;

-- Bước chưa có deadline: giữ NULL (không cần trạng thái gì cả)
UPDATE task_steps
SET
  step_deadline_status = NULL,
  step_deadline_note   = NULL
WHERE step_deadline_status IN ('cho_duyet', 'da_duyet', 'tra_lai', 'draft')
  AND due_date IS NULL;

-- Kiểm tra sau khi update
SELECT COUNT(*) AS con_lai
FROM task_steps
WHERE step_deadline_status IN ('cho_duyet', 'da_duyet', 'tra_lai', 'draft');
-- Kết quả mong muốn: 0
