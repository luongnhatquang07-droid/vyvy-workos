# Data Flow — VyVy WorkOS V2

## 1. Luồng họp → báo cáo (vòng vận hành khép kín)
```
meetings
  → meeting_minutes (biên bản, preview transcript, duyệt)
  → meeting_decisions (quyết định chốt)
  → meeting_task_drafts (đầu việc nháp; giữ decision_id/meeting_id)
  → tasks (import: set draft.imported_task_id; task.source_meeting_id/source_decision_id)
      → task_steps / task_checklist_items
      → deliverables → deliverable_versions (nộp lại = version mới)
      → approvals → approval_actions
      → [COMPLETION GATE] (trigger trên tasks)
  → project_updates (cập nhật kỳ)
  → report_snapshots (+ report_snapshot_items) — bất biến khi phát hành
```
Mỗi bước giữ liên kết về nguồn → không mất dấu vết.

## 2. Luồng nhắc việc → escalation
```
tasks / deliverables  (đến hạn, thiếu file, quá hạn)
  → reminders (mức nhắc, next_follow_up_at, response_status)
  → reminder_logs (mỗi lần soạn/gửi; confirmed_sent=false đến khi bấm "Đã gửi")
  → follow-up: hết next_follow_up_at chưa đóng → quay lại "Cần dí"
  → escalation_rules: sau N lần / N giờ → next_level (Gọi → Trưởng phòng → CEO)
  → ceo_decision_requests (khi cần CEO quyết)
```

## 3. Cross-update (1 nguồn, nhiều view)
- Đổi `tasks.due_date` → ảnh hưởng `v_overdue_items`, Calendar, follow-up, project health.
- `deliverables.status = REVISION_REQUIRED` → completion gate khóa task + sinh follow-up.
- `approvals.status = APPROVED` → gate đánh giá lại → task có thể COMPLETED.
- Mọi thay đổi quan trọng → `audit_logs` (before/after) + `activity_logs`.

## 4. Quy tắc Messenger (giai đoạn 1)
Mở URL **không** set `confirmed_sent`. Chỉ khi người dùng bấm "Đã gửi" → `reminder_logs.confirmed_sent=true` + chọn `follow_up_at`.
