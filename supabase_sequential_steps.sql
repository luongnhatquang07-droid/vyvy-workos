-- VyVy WorkOS — Sequential Steps toggle
-- Cho phép mỗi đầu việc bật/tắt "bắt buộc theo thứ tự bước":
--   true  → bước sau chỉ mở khi bước trước đã được duyệt
--   false → tất cả bước có thể làm song song (mặc định)
-- Idempotent — chạy lại an toàn.

alter table tasks
  add column if not exists sequential_steps boolean not null default false;
