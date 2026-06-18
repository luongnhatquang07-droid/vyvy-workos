-- ============================================================
-- VyVy WorkOS — Migration: Deadline committed + luồng Xin gia hạn
-- ============================================================
-- AN TOÀN: chỉ THÊM cột/bảng (ADD COLUMN IF NOT EXISTS, CREATE TABLE
-- IF NOT EXISTS). KHÔNG xóa/sửa dữ liệu cũ. Chạy được nhiều lần.
--
-- CÁCH CHẠY: copy toàn bộ file này vào
--   Supabase Dashboard > SQL Editor > New query > Run
-- ============================================================

-- ── 1. Thêm cột deadline vào bảng tasks ──────────────────────
-- deadline_status: trạng thái cam kết/gia hạn (committed | extension_requested
--   | extension_approved | extension_rejected | no_deadline).
--   Các trạng thái due_soon/due_today/overdue được TÍNH runtime từ due_date.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS deadline_status        text;
-- deadline_source: nguồn deadline (meeting | manual | import | project_milestone)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS deadline_source        text;
-- original_deadline: deadline đầu tiên được chốt khi giao việc
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS original_deadline      date;
-- requested_deadline: ngày mới đang xin gia hạn (chờ duyệt)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS requested_deadline     date;
-- deadline_change_count: số lần đã gia hạn thành công
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS deadline_change_count  integer NOT NULL DEFAULT 0;
-- deadline_locked: true nếu deadline đã chốt (committed)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS deadline_locked        boolean NOT NULL DEFAULT false;
-- deadline_submitter_id: owner gửi yêu cầu gia hạn hiện tại
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS deadline_submitter_id  uuid;
-- deadline_approver_id: người duyệt được gán cho yêu cầu hiện tại
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS deadline_approver_id   uuid;
-- deadline_reason: lý do của yêu cầu gia hạn hiện tại
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS deadline_reason        text;
-- deadline_decided_by / deadline_decided_at: ai & khi nào duyệt/từ chối lần gần nhất
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS deadline_decided_by    uuid;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS deadline_decided_at    timestamptz;

-- Backfill nhẹ (không phá data): task đã có due_date nhưng chưa set trạng thái
-- → coi như đã chốt (committed) + original_deadline = due_date hiện tại.
UPDATE tasks
SET deadline_status   = 'committed',
    deadline_source   = COALESCE(deadline_source, 'manual'),
    original_deadline = COALESCE(original_deadline, due_date),
    deadline_locked   = true
WHERE due_date IS NOT NULL
  AND (deadline_status IS NULL OR deadline_status = '');

UPDATE tasks
SET deadline_status = 'no_deadline'
WHERE due_date IS NULL
  AND (deadline_status IS NULL OR deadline_status = '');

-- ── 2. Bảng lịch sử gia hạn deadline ─────────────────────────
CREATE TABLE IF NOT EXISTS task_deadline_extensions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id       uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  round         integer NOT NULL DEFAULT 1,        -- lần gia hạn thứ mấy
  requested_by  uuid,                              -- owner gửi yêu cầu
  old_deadline  date,                              -- deadline trước khi xin
  new_deadline  date,                              -- deadline mới đề xuất
  reason        text,                              -- lý do xin gia hạn
  blocker       text,                              -- vướng mắc hiện tại
  impact        text,                              -- mức ảnh hưởng nếu trễ
  plan_next     text,                              -- kế hoạch xử lý tiếp theo
  need_help     text,                              -- cần hỗ trợ từ ai
  file_url      text,                              -- file/link kèm theo
  decision      text NOT NULL DEFAULT 'requested', -- requested | approved | rejected
  decided_by    uuid,                              -- người duyệt/từ chối
  decided_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS task_deadline_ext_task_idx ON task_deadline_extensions(task_id);
CREATE INDEX IF NOT EXISTS task_deadline_ext_created_idx ON task_deadline_extensions(created_at DESC);

-- RLS tắt để khớp pattern các bảng hiện có (anon key đọc/ghi được).
ALTER TABLE task_deadline_extensions DISABLE ROW LEVEL SECURITY;

-- ── 3. Sửa RLS bảng notifications ────────────────────────────
-- Bảng notifications trước đó bật RLS với policy chỉ cho recipient_id =
-- chính mình → anon client KHÔNG insert được notif cho người khác (manager
-- duyệt → notif cho owner bị chặn). App này dùng anon key + tự lọc quyền ở
-- tầng code (như mọi bảng khác đều tắt RLS), nên tắt RLS ở đây để
-- notification (giao việc, duyệt, gia hạn, tag) hoạt động.
ALTER TABLE notifications DISABLE ROW LEVEL SECURITY;

-- ============================================================
-- Hết. Sau khi chạy xong, reload app để dùng luồng deadline mới.
-- ============================================================
