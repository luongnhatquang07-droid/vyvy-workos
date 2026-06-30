# Database Schema — VyVy WorkOS V2

Bám `VYVY_WORKOS_V2_DATABASE_SPEC.md`. **Trạng thái: ĐỀ XUẤT — chờ duyệt trước khi migration.**
Nguyên tắc: mọi view dùng chung bảng nguồn; KPI/health/workload tính từ dữ liệu nguồn (không lưu cứng).

## Quy ước chung
- Mỗi bảng nghiệp vụ có: `id, workspace_id, created_at, created_by, updated_at, updated_by, deleted_at, deleted_by` (soft-delete + audit).
- Bảng lịch sử (`task_status_history, approval_actions, reminder_logs, activity_logs, audit_logs`): không sửa/xóa từ UI.
- Đăng nhập do Supabase Auth quản lý; `profiles.auth_user_id → auth.users`. `people` là danh bạ nhân sự (có thể chưa có tài khoản).

## Danh mục bảng & nghiệp vụ phục vụ

| Nhóm | Bảng | Nguồn sự thật của | Liên kết chính |
| --- | --- | --- | --- |
| Tổ chức | workspaces, profiles, people, departments, roles, workspace_memberships, role_permissions, user_preferences, workspace_settings | Danh tính, phân quyền, cấu hình | profiles→auth.users; people→profiles/departments; membership→roles |
| Dự án | projects, project_members, workstreams, milestones | Khung dự án & tiến độ | tất cả → projects → workspace |
| Công việc | **tasks**, task_steps, task_assignees, task_dependencies, task_checklist_items, task_status_history | Đầu việc (lõi hệ thống) | task→project/workstream; nguồn họp; phụ thuộc; bước con |
| Họp | meetings, meeting_attendees, meeting_minutes, meeting_decisions, meeting_task_drafts | Họp → quyết định → đầu việc | draft→decision→meeting; draft.imported_task_id→tasks |
| Bàn giao | deliverables, deliverable_versions, attachments | Đầu ra & phiên bản | deliverable→task/project; version→deliverable |
| Phê duyệt | approvals, approval_actions | Quy trình duyệt | approval→task/deliverable; action→approval |
| Nhắc việc | reminders, reminder_logs, reminder_templates, escalation_rules | Nhắc & escalation | reminder→person/task; log→reminder |
| Rủi ro/Thay đổi | risks, issues, change_requests, project_updates | Rủi ro, vấn đề, thay đổi scope | đều →project |
| CEO/Báo cáo | ceo_decision_requests, report_snapshots, report_snapshot_items | Quyết định CEO & báo cáo snapshot | snapshot bất biến |
| Hệ thống | comments, notifications, activity_logs, audit_logs, saved_views | Trao đổi, thông báo, lịch sử | polymorphic entity_type/entity_id |

## Source of truth & quy tắc tính (không lưu cứng)
- Quá hạn, nợ file, workload, tiến độ, health, số approval chờ, KPI Command Center → tính từ tasks/deliverables/approvals/reminders qua SQL view (mục dưới), không có cột "cứng".
- `Project Health = deadline + milestone + overdue + missing deliverable + pending approval + risk + workload` (hàm/materialized view; quy tắc ở §16 spec).

## View nào đọc từ bảng nào (xem `supabase/schema.sql` mục 11)
- `v_overdue_items` ← tasks · `v_pending_approvals` ← approvals · `v_missing_deliverables` ← deliverables
- `v_follow_up_queue` ← reminders · `v_ceo_attention_items` ← ceo_decision_requests
- `v_team_workload` ← people⋈tasks · `v_project_progress` ← projects⋈tasks
- `v_command_center_queue` ← tasks ∪ approvals
- (còn `v_project_health`, `v_meeting_follow_ups`: tính theo §16 — đề xuất làm sau khi có dữ liệu thật)

## Edge cases cần xử lý
- Dự án chưa có task/deadline → `health = NO_DATA` (không hiển thị "tốt").
- WAITING thiếu 1 trong 4 trường (chờ ai/ gì/ lý do/ ngày) → không cho lưu WAITING.
- BLOCKED thiếu blocker/owner → không cho lưu BLOCKED.
- Import draft trùng → cảnh báo qua `duplicate_candidate_task_id`, không tự xóa.
- Nộp lại file → tạo `deliverable_versions` mới, không ghi đè; `approved_version_id` trỏ version đạt.
- Vòng tham chiếu tasks↔meetings/decisions: FK gắn sau bằng ALTER.

## Rủi ro kỹ thuật
- RLS dùng `app_workspace()`/`app_role()` truy vấn mỗi câu → cân nhắc cache/`security definer` để tránh chậm.
- Materialized view health/workload cần lịch refresh (cron) — chốt sau.
- Nhiều enum: đổi giá trị sau này cần migration `ALTER TYPE`.
