# Acceptance Checklist — Database VyVy WorkOS V2

Database chỉ "đạt" khi tất cả mục dưới ✅ (bám §20 spec).

- [x] Không có bảng rời theo từng view (dùng chung bảng nguồn + SQL views)
- [x] Có liên kết meeting → minutes → decision → draft → task (giữ source_*)
- [x] Có deliverable versioning (deliverable_versions, không ghi đè)
- [x] Có approval history (approval_actions)
- [x] Có reminder log (reminder_logs, confirmed_sent)
- [x] Có escalation (escalation_rules + reminder_level)
- [x] Có report snapshot (report_snapshots + items, bất biến)
- [x] Có audit log (audit_logs before/after) + activity_logs
- [x] Có soft delete (deleted_at/deleted_by toàn bộ bảng nghiệp vụ)
- [x] Có RLS theo workspace + vai trò (nhóm chính; **việc còn lại: bật cho mọi bảng khi migration**)
- [x] Có completion gate (trigger trên tasks, trả lý do cụ thể)
- [x] Có project health rule (NO_DATA mặc định; quy tắc ở §16 — view/hàm bổ sung)
- [x] Có SQL views tổng hợp (mục 11 schema)
- [x] Có index plan (docs/index-plan.md)
- [ ] Có test cho foreign key & business rule (**làm khi migration**: test gate chặn COMPLETED, WAITING/BLOCKED bắt buộc, version tăng dần, RLS chặn CEO ghi)
- [x] Không có secret trong source (chỉ .env, đã .gitignore)
- [x] Không tác động production (mới là file đề xuất, chưa chạy)

## Còn thiếu / chốt khi duyệt
- ERD (sơ đồ quan hệ) — có thể sinh từ schema bằng công cụ (dbdiagram/Supabase). Cần chốt có muốn file ERD riêng không.
- Bật RLS + policy cho TẤT CẢ bảng (hiện mới nhóm chính làm mẫu).
- Materialized view cho health/workload + lịch refresh.
- Bộ test (pgTAP hoặc test ứng dụng) cho FK & business rule.
- Cập nhật `src/features/command-center/data/live-data.ts` khớp schema mới (hiện đang theo bản nháp cũ) — làm sau khi schema được duyệt & tạo.

## Quy trình tiếp theo (theo §19 spec)
1. Bạn review bộ tài liệu này + `supabase/schema.sql`.
2. Duyệt (hoặc yêu cầu chỉnh).
3. Sau khi duyệt → mới tạo migration thật & chạy trên Supabase (không chạy production).
