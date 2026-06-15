-- VyVy WorkOS — Thêm cột description cho task_steps
-- Tách mô tả yêu cầu (description) ra khỏi ghi chú kết quả (note).
-- Idempotent — chạy lại an toàn.

alter table task_steps
  add column if not exists description text;
