-- Seed đầu việc từ BIÊN BẢN HỌP 10/6/2026 (Dữ liệu & Tăng trưởng đa kênh)
-- Tự gán người theo tên (ilike). Nếu không khớp nhân viên -> để trống, gán tay sau.
-- due_date = deadline ĐỀ XUẤT; mỗi người chỉnh lại + gửi duyệt theo luồng nếu cần.
-- An toàn/idempotent: chỉ chạy nếu chưa có project code PRJ-DATA-001.

do $$
declare
  v_proj uuid; v_ws1 uuid; v_ws2 uuid; v_ws3 uuid;
begin
  if exists (select 1 from projects where code = 'PRJ-DATA-001') then
    raise notice 'Du an PRJ-DATA-001 da ton tai - bo qua.'; return;
  end if;

  insert into projects (name, code, description, status, priority, progress_percent, issue_status)
  values ('Tăng trưởng đa kênh & Dữ liệu', 'PRJ-DATA-001',
    'Họp 10/6/2026. Hai trục: (1) Dữ liệu, (2) Khoảng hụt so với mục tiêu & nguyên nhân. Hướng chốt: Affiliate+KOL, Loyalty, Định danh KH qua QR, đẩy về Zalo, dashboard theo tuần.',
    'in_progress', 'high', 0, 'normal') returning id into v_proj;

  insert into tasks (title, task_level, status, priority, progress_percent, project_id, issue_status, approval_status)
  values ('Dữ liệu & Dashboard', 'workstream', 'in_progress', 'high', 0, v_proj, 'normal', 'not_submitted') returning id into v_ws1;
  insert into tasks (title, task_level, status, priority, progress_percent, project_id, issue_status, approval_status)
  values ('Vận hành tăng trưởng — Affiliate/KOL', 'workstream', 'in_progress', 'high', 0, v_proj, 'normal', 'not_submitted') returning id into v_ws2;
  insert into tasks (title, task_level, status, priority, progress_percent, project_id, issue_status, approval_status)
  values ('Loyalty & Định danh khách hàng', 'workstream', 'not_started', 'medium', 0, v_proj, 'normal', 'not_submitted') returning id into v_ws3;

  insert into tasks (title, description, parent_task_id, task_level, status, priority, progress_percent, due_date, assignee_id, head_id, project_id, issue_status, approval_status) values
  ('Gom toàn bộ số liệu (ưu tiên số liệu của Yến trước)', 'Từ họp 10/6', v_ws1, 'subtask', 'not_started', 'high', 0, '2026-06-15', (select id from employees where full_name ilike '%Vũ%' order by full_name limit 1), (select id from employees where full_name ilike '%Vũ%' order by full_name limit 1), v_proj, 'normal', 'not_submitted'),
  ('Nghiên cứu công cụ kéo dữ liệu (SIM Which / Averonic / Supermetrics)', 'So sánh chi phí trước khi chốt mua', v_ws1, 'subtask', 'not_started', 'high', 0, '2026-06-15', (select id from employees where full_name ilike '%Vũ%' order by full_name limit 1), (select id from employees where full_name ilike '%Vũ%' order by full_name limit 1), v_proj, 'normal', 'not_submitted'),
  ('Kiểm tra MCP cho toàn bộ tài khoản Facebook', 'Quét tài khoản nào đã bật MCP', v_ws1, 'subtask', 'not_started', 'medium', 0, '2026-06-15', (select id from employees where full_name ilike '%Vũ%' order by full_name limit 1), (select id from employees where full_name ilike '%Vũ%' order by full_name limit 1), v_proj, 'normal', 'not_submitted'),
  ('Tổng hợp dữ liệu để dựng dashboard', 'Phục vụ họp tuần theo số liệu', v_ws1, 'subtask', 'not_started', 'high', 0, '2026-06-17', (select id from employees where full_name ilike '%Vũ%' order by full_name limit 1), (select id from employees where full_name ilike '%Vũ%' order by full_name limit 1), v_proj, 'normal', 'not_submitted'),
  ('Chia lại việc + KPI rõ ràng cho từng bạn', 'Tránh việc bị lạc trôi', v_ws1, 'subtask', 'not_started', 'medium', 0, '2026-06-15', (select id from employees where full_name ilike '%Vũ%' order by full_name limit 1), (select id from employees where full_name ilike '%Vũ%' order by full_name limit 1), v_proj, 'normal', 'not_submitted'),
  ('Cung cấp đầy đủ dữ liệu đang có', 'Chưa có thì để sau', v_ws1, 'subtask', 'not_started', 'high', 0, '2026-06-14', (select id from employees where full_name ilike '%Yến%' order by full_name limit 1), (select id from employees where full_name ilike '%Yến%' order by full_name limit 1), v_proj, 'normal', 'not_submitted'),
  ('Xin thêm quyền phần Tài chính trên TikTok Seller', 'Nguồn đối soát với GM Max', v_ws1, 'subtask', 'not_started', 'high', 0, '2026-06-14', (select id from employees where full_name ilike '%Yến%' order by full_name limit 1), (select id from employees where full_name ilike '%Yến%' order by full_name limit 1), v_proj, 'normal', 'not_submitted'),
  ('Gửi các file/báo cáo để đối soát', '', v_ws1, 'subtask', 'not_started', 'medium', 0, '2026-06-15', (select id from employees where full_name ilike '%Yến%' order by full_name limit 1), (select id from employees where full_name ilike '%Yến%' order by full_name limit 1), v_proj, 'normal', 'not_submitted'),
  ('Rà soát & xác nhận hướng dữ liệu, xem lại dashboard', 'Sau khi Vũ + Yến tổng hợp', v_ws1, 'subtask', 'not_started', 'medium', 0, '2026-06-18', (select id from employees where full_name ilike '%Trung%' order by full_name limit 1), (select id from employees where full_name ilike '%Trung%' order by full_name limit 1), v_proj, 'normal', 'not_submitted'),
  ('Tiếp tục phụ trách Affiliate (hỗ trợ mạnh hơn)', 'CDA affiliate 1,47% — còn dư địa tối ưu', v_ws2, 'subtask', 'not_started', 'high', 0, '2026-06-16', (select id from employees where full_name ilike '%Hiệp%' order by full_name limit 1), (select id from employees where full_name ilike '%Hiệp%' order by full_name limit 1), v_proj, 'normal', 'not_submitted'),
  ('Phối hợp xử lý KOL', '', v_ws2, 'subtask', 'not_started', 'medium', 0, '2026-06-17', (select id from employees where full_name ilike '%Vy%' order by full_name limit 1), (select id from employees where full_name ilike '%Vy%' order by full_name limit 1), v_proj, 'normal', 'not_submitted'),
  ('Hỗ trợ KOL cùng Vy', '', v_ws2, 'subtask', 'not_started', 'medium', 0, '2026-06-17', (select id from employees where full_name ilike '%Hồng%' order by full_name limit 1), (select id from employees where full_name ilike '%Hồng%' order by full_name limit 1), v_proj, 'normal', 'not_submitted'),
  ('Triển khai loyalty + QR code (thư cảm ơn/thiệp/quà)', 'Đề xuất người phụ trách: Vy', v_ws3, 'subtask', 'not_started', 'medium', 0, '2026-06-20', (select id from employees where full_name ilike '%Vy%' order by full_name limit 1), (select id from employees where full_name ilike '%Vy%' order by full_name limit 1), v_proj, 'normal', 'not_submitted'),
  ('Định danh KH từ đơn 1-2, đẩy về Zalo (mini app/shop)', 'Đề xuất người phụ trách: Vy', v_ws3, 'subtask', 'not_started', 'medium', 0, '2026-06-22', (select id from employees where full_name ilike '%Vy%' order by full_name limit 1), (select id from employees where full_name ilike '%Vy%' order by full_name limit 1), v_proj, 'normal', 'not_submitted'),
  ('Nghiên cứu gom đơn + tự giao trên TikTok (khả thi/rủi ro)', 'Cách không chính thức — kiểm tra kỹ trước. Đề xuất: Vũ', v_ws3, 'subtask', 'not_started', 'low', 0, '2026-06-20', (select id from employees where full_name ilike '%Vũ%' order by full_name limit 1), (select id from employees where full_name ilike '%Vũ%' order by full_name limit 1), v_proj, 'normal', 'not_submitted');

  raise notice 'Seeded Hop 10/6: 1 project, 3 workstream, 15 dau viec.';
end $$;

-- ── Lưu recap vào lịch sử biên bản (hiện ở: Biên bản họp -> Lịch sử biên bản đã lưu) ──
create table if not exists public.meeting_minutes (
  id uuid primary key default gen_random_uuid(),
  title text, raw_content text, summary text, created_by uuid,
  created_at timestamp with time zone default now()
);
alter table public.meeting_minutes add column if not exists created_at timestamp with time zone default now();

insert into public.meeting_minutes (title, raw_content, summary, created_at)
select
  'Họp Dữ liệu & Tăng trưởng đa kênh — 10/6/2026',
  $rc$BIÊN BẢN HỌP — Dữ liệu & Tăng trưởng đa kênh (10/6/2026)

Ý CHÍNH:
- Chuyển từ họp cảm tính sang vận hành theo số liệu; mọi buổi sau phải có dashboard + đường dây chỉ số.
- Hai trục tập trung: (1) Dữ liệu, (2) Khoảng hụt so với mục tiêu & nguyên nhân.
- TikTok: lấy GM Max trước rồi đối soát Seller; cần xin quyền phần Tài chính trên TikTok Seller.
- Facebook: đang dùng SIM Which (miễn phí, ~35 lần/tháng); cần quét MCP từng tài khoản.
- Shopee/TikTok không nhả API đầy đủ; cân nhắc Supermetrics (Pro ~159$/năm) hoặc xuất tay — chưa chốt mua.
- Dữ liệu chồng chéo nguồn (Ads/organic/affiliate), nhất là Shopee; ưu tiên số kiểm chứng được, phần chưa lấy được để sau.
- Doanh số rớt sau giai đoạn tốt (hết hàng cuối T4/đầu T5 + biến động nhân sự). CDA affiliate 1,47% còn dư địa tối ưu.
- Hướng tăng trưởng chốt: Affiliate + KOL, Loyalty, Định danh KH bằng QR, đẩy về Zalo (mini app/shop), dashboard theo tuần.

PHÂN CÔNG:
- Vũ: gom số liệu (ưu tiên của Yến trước), nghiên cứu công cụ kéo dữ liệu, kiểm tra MCP, tổng hợp dashboard, chia việc + KPI — trong tuần.
- Yến: cung cấp dữ liệu, xin quyền Tài chính TikTok Seller, gửi file đối soát.
- Anh Trung: rà soát & xác nhận hướng dữ liệu, xem lại dashboard.
- Hiệp: phụ trách Affiliate. Vy: KOL. Hồng: hỗ trợ KOL cùng Vy.
- Loyalty/định danh: QR + thư cảm ơn, định danh từ đơn 1-2, đẩy về Zalo (đề xuất Vy); nghiên cứu gom đơn/tự giao TikTok (đề xuất Vũ).
- Nghiêm: chưa đưa về ngay.

Nguồn: NoteX (notexapp.com).$rc$,
  $rc$Chuyển sang vận hành theo số liệu. 2 trục: dữ liệu + khoảng hụt mục tiêu. Hướng: Affiliate/KOL, Loyalty, định danh QR, đẩy về Zalo, dashboard tuần.$rc$,
  timestamp with time zone '2026-06-10 10:00:00+07'
where not exists (
  select 1 from public.meeting_minutes
  where title = 'Họp Dữ liệu & Tăng trưởng đa kênh — 10/6/2026'
);
