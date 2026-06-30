# RLS Plan — VyVy WorkOS V2

Chặn ở server/DB, KHÔNG chỉ ẩn nút client. Cô lập theo `workspace_id`.

## Helper
- `app_workspace()` → workspace của user đang đăng nhập (qua `workspace_memberships` ⋈ `profiles.auth_user_id = auth.uid()`).
- `app_role()` → mã vai trò (`ADMIN | PROJECT_COORDINATOR | CEO_READONLY`).

## Vai trò
| Vai trò | Quyền |
| --- | --- |
| ADMIN | Toàn quyền trong workspace (đọc + ghi mọi bảng). |
| PROJECT_COORDINATOR | Đọc + ghi toàn bộ dữ liệu điều hành trong workspace. |
| CEO_READONLY | **Chỉ đọc**: projects, project_updates, report_snapshots, ceo_decision_requests, risks/issues liên quan. Không ghi nghiệp vụ. |

## Khuôn policy (mọi bảng nghiệp vụ)
- SELECT: `using (workspace_id = app_workspace())` — cùng workspace mới đọc.
- INSERT/UPDATE/DELETE: `using/with check (workspace_id = app_workspace() AND app_role() in ('ADMIN','PROJECT_COORDINATOR'))`.
- CEO_READONLY không khớp policy ghi → request ghi bị DB từ chối (kể cả gọi API trực tiếp).

## Bảng lịch sử
- `audit_logs, reminder_logs, approval_actions, task_status_history, activity_logs`: cho INSERT, **không** UPDATE/DELETE từ client (chỉ trigger/server ghi).

## Soft delete
- Không DELETE cứng dữ liệu nghiệp vụ; set `deleted_at/deleted_by`. View luôn lọc `deleted_at is null`.

## Cần bật RLS cho TẤT CẢ bảng
Schema mẫu đã bật cho nhóm chính (projects, tasks, deliverables, approvals, reminders, ceo_decision_requests, project_updates, audit_logs). **Khi migration: bật RLS + policy tương tự cho mọi bảng còn lại** (meetings*, workstreams, risks, issues, change_requests, comments, notifications, saved_views, ...). Đây là mục bắt buộc trong acceptance.

## Lưu ý hiệu năng
- `app_workspace()/app_role()` nên đánh dấu `stable` (đã làm) và cân nhắc `security definer` + cache để giảm chi phí mỗi truy vấn.
