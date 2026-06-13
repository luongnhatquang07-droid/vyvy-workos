# VyVy WorkOS — Bàn giao nâng cấp (cập nhật)

Toàn bộ thay đổi đã qua type-check nguồn (tsc EXIT 0, loại trừ .next).
CHƯA chạy `next build`/runtime — cần làm ở máy bạn (xem mục Chặn).

## Đã làm trong repo
- Màu theo brand: trầm hoá biểu đồ/sức khỏe, nền ivory sâu hơn, bớt lime.
- Luồng duyệt deadline: components/DeadlineApproval.tsx (gắn trong chi tiết task) + migration.
- Trợ lý COO sống trong app: components/CooAssistantPanel.tsx (tóm tắt, nên-làm-trước, chờ duyệt, dự án rủi ro, quá tải).
- Head chọn nhiều người: components/HeadPicker.tsx (bấm bung, tick) ở đầu việc lớn + con + migration head_ids.
- Subtask gọn: Người hỗ trợ lên thanh trạng thái; khối dưới thu thành chip.
- Nút Xóa dự án: ở COO Board (cạnh + Đầu việc lớn) và popup Ô dự án.
- Modal dự án: hiện người/module/blocker(Cần quyết/số/build)/đường găng.
- Thống kê → Công việc lọc sẵn (bấm metric card).
- Ô dự án đầy đủ: nhãn sức khỏe + số trễ/vấn đề.
- Lịch sử biên bản: components/MeetingHistory.tsx (xem lại recap) + migration.
- Digest sáng cá nhân hoá (api/daily-digest): "Nên làm trước 1..2..3".
- Dispatcher đa kênh: lib/notify.ts (in-app + Zalo/Messenger stub).
- AI phân tích biên bản: app/api/analyze-meeting/route.ts + nút "✨ Phân tích bằng AI" (cần ANTHROPIC_API_KEY).
- Seed dự án Loyalty: supabase_seed_loyalty.sql.

## ⚠️ ĐANG CHẶN — phải xử ở máy bạn
1) Thư mục Desktop đang CẮT & KHÓA file (.next bị cụt, không xóa được file).
   → Nghi OneDrive/Google Drive/antivirus. Chuyển project sang thư mục KHÔNG sync
     (vd C:\dev\vyvy-workos) hoặc tạm dừng sync/AV cho folder. Đây là lý do build có thể lỗi dù code đúng.
2) Chưa có ANTHROPIC_API_KEY → nút Phân tích AS AI chưa chạy. Thêm vào .env.local + Vercel.
3) File rác mình kẹt không xóa được: xoá giúp `tsconfig.check.json`.

## Chạy SQL (Supabase → SQL Editor), theo thứ tự
1. supabase_deadline_approval.sql
2. supabase_head_ids.sql
3. supabase_meeting_minutes.sql
4. supabase_seed_loyalty.sql

## Rồi
- Tắt dev, xoá thư mục .next, `npm run build` (xác nhận), `npm run dev`.
- Báo lại lỗi build cụ thể (nếu có) để sửa tiếp.
