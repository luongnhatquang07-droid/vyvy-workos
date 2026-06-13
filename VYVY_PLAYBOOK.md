# VYVY WorkOS — Playbook làm việc (đọc trước khi làm bất cứ gì)

Mục đích: ghi lại cách làm + ràng buộc đã thống nhất để lần sau hiểu ý ngay, không làm sai.

## 1. Bối cảnh
- App vận hành nội bộ VyVyHaircare. Stack: Next.js 16 (App Router) + TypeScript + Supabase + Tailwind. Deploy Vercel (auto từ nhánh GitHub `main`).
- Toàn bộ UI nằm trong 1 file khổng lồ: `app/page.tsx` (~8.900 dòng). Components phụ ở `components/`.

## 2. RÀNG BUỘC MÔI TRƯỜNG (nhớ kỹ — đã gặp thật)
1. Thư mục dự án (Desktop, có OneDrive/antivirus) **cắt/khóa file khi ghi**. ⇒ KHÔNG sửa file lớn bằng công cụ Edit (nó cắt mất đuôi file). **Luôn sửa `page.tsx` qua shell/python**, đọc `newline=''` để giữ CRLF, ghi `newline=''`. (page.tsx dùng CRLF.)
2. **Sandbox không `npm run build`/`dev` được** (mạng npm bị chặn, thiếu SWC). ⇒ Verify code bằng `npx tsc --noEmit` với tsconfig loại trừ `.next` (file `.next/dev/types` hay bị cụt gây lỗi giả). Mẫu: tsconfig.check.json include app/lib/components, exclude node_modules/.next.
3. **Không push GitHub / không deploy hộ** (không có credential, git index hay bị khóa). Push + Vercel deploy là việc của user.
4. **Screenshot trang nặng (Supabase dashboard) hay timeout** (document_idle). ⇒ Dùng `javascript_tool` đọc DOM/Monaco thay vì screenshot. Lưu ý: biến gán trong callback async đôi khi không thấy giữa các lần gọi JS; ưu tiên thao tác đồng bộ.

## 3. ĐIỀU KHÔNG LÀM (an toàn — kể cả khi user bảo làm)
- Không nhập API key/secret/mật khẩu vào file hay form. User tự dán. Không tạo/lấy key hộ.
- Không xóa dữ liệu vĩnh viễn hộ (chỉ hướng dẫn dùng nút trong app/SQL user tự chạy).
- Không đăng nhập hộ.
- Ghi SQL vào Supabase: chỉ khi user cho phép rõ, ưu tiên additive + idempotent. Khi cảnh báo RLS ⇒ chọn **"Run without RLS"** (bật RLS có thể khóa app đọc/ghi). Nếu mượn SQL editor đang mở query của user ⇒ **lưu nội dung gốc, chạy, rồi KHÔI PHỤC lại** query đó.

## 4. QUY ƯỚC SẢN PHẨM (đã chốt)
- Nhận diện **VYVY Editorial ivory**: nền `#F1EDE4`, chữ `#191919`, khối trầm olive `#2D331A`, accent lime `#DADF21` **chỉ 10% / một điểm mỗi màn**. KHÔNG dark, KHÔNG dùng terracotta (`#A73223` là bộ skincare, cấm trộn).
- Màu trạng thái trầm: ok `#5B6B2E`, warn `#9A7B1F`, crit `#8A3A2E`. Biểu đồ dùng dải trầm, không neon.
- **Admin = đồng quyền CEO/COO** (thấy hết). (đã sửa trong filterTasksByRole + isTopLevel)
- Head có thể **nhiều người** (cột `head_ids`), UI popover bấm-bung-tick (HeadPicker).

## 5. LUỒNG DUYỆT DEADLINE (đã làm)
Người được giao **nhập deadline + tự chọn cấp trên** (workstream→COO/CEO, subtask→trưởng BP) → Gửi → sếp **Duyệt** (chốt due_date) / **Không duyệt + nhập lý do** → trả về nhập lại. Lặp tới khi chốt.
- Cột tasks: `proposed_deadline, deadline_approval_status (draft|cho_duyet|tra_lai|da_duyet), deadline_submitter_id, deadline_approver_id, deadline_round`. Bảng `task_deadline_approval_log`.
- Component: `DeadlineApproval` (trong chi tiết task) + `MyDeadlineInbox` (view "Việc được giao", nav giữa Dự án & Công việc; admin thấy toàn bộ).

## 6. QUY TRÌNH HỌP (Cách 1 — MIỄN PHÍ, mặc định)
User đưa **file Notex (tóm tắt + bản ghi)** vào chat ⇒ MÌNH (Claude) phân tích trực tiếp (không cần key) ⇒ bóc: **Ý chính · Bảng đầu việc (người phụ trách / mình đề xuất) · Deadline đề xuất** ⇒ xuất **seed SQL** (gán người theo tên `ilike`, idempotent theo project code) + lưu recap vào `meeting_minutes` ⇒ user chạy SQL (hoặc mình chạy qua SQL editor nếu được phép).
- Nút "✨ Phân tích bằng AI" trong app (màn Biên bản họp / MeetingStudio) chỉ chạy khi có `ANTHROPIC_API_KEY` (server env). Chưa có key thì dùng Cách 1.

## 7. PATTERN THÊM TÍNH NĂNG
1. Viết component self-contained trong `components/` (import `supabase` từ `@/lib/supabase`, dùng CSS var brand).
2. Mount vào `page.tsx` qua python: anchor CHÍNH XÁC + `assert count==1`. Cảnh giác anchor trùng (vd `<div className="space-y-5">` có ở nhiều component → dùng `s.index(pat, indexSau 'function TênComponent')`).
3. Verify `tsc` (loại .next) = EXIT 0.
4. Nhắc user `npm run dev` để thấy (sandbox không build được).

## 8. FILE SQL (chạy trong Supabase SQL Editor)
`supabase_deadline_approval.sql`, `supabase_head_ids.sql`, `supabase_meeting_minutes.sql`, `supabase_setup_recurring.sql`, `supabase_notifications.sql`, `supabase_rls_policies.sql`, và các `supabase_seed_*.sql` (mỗi lần họp).

## 9. ĐỂ LÊN LINK ONLINE (vyvy-workos.vercel.app)
(a) Chạy các migration trên Supabase. (b) User `git add/commit/push origin main` → Vercel tự build & deploy. (c) Nếu dùng AI: thêm `ANTHROPIC_API_KEY` vào Vercel env.
