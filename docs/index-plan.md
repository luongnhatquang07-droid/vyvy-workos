# Index Plan — VyVy WorkOS V2

## Index đơn (tối thiểu, áp cho các bảng có cột tương ứng)
- `workspace_id` (mọi bảng nghiệp vụ — lọc theo workspace là điều kiện RLS)
- `project_id`, `workstream_id`, `task_id`, `person_id`, `owner_id`
- `status`, `due_date`, `next_follow_up_at`, `created_at`, `deleted_at`

## Composite (truy vấn nóng)
- `tasks(workspace_id, status, due_date)` — hàng đợi quá hạn / sắp hạn.
- `reminders(workspace_id, person_id, next_follow_up_at)` — danh sách cần dí.
- `tasks(project_id, status, due_date)` — bảng dự án.
- `(task_id, created_at)` cho bảng lịch sử/log.
- `deliverable_versions(deliverable_id, version_number)` — lấy version mới nhất.

## Ghi chú
- View tổng hợp nặng (health, workload) → cân nhắc **materialized view** + refresh định kỳ thay vì index thêm.
- Partial index gợi ý: `... where deleted_at is null` cho các bảng soft-delete để bỏ qua dòng đã xóa.
- Đo bằng `explain analyze` trên dữ liệu thật trước khi thêm index ngoài danh sách (tránh thừa index làm chậm ghi).
