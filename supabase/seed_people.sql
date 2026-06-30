-- =====================================================================
-- VYVY WORKOS V2 — SEED NHÂN SỰ THẬT
-- Chạy SAU khi đã chạy schema.sql (và sau khi bạn duyệt schema).
-- =====================================================================

-- 1) Workspace
insert into workspaces (id, name, slug) values
  ('a0000000-0000-0000-0000-000000000001', 'VyVy', 'vyvy')
on conflict (id) do nothing;

-- 2) Phòng ban
insert into departments (id, workspace_id, name, code) values
  ('d0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','Marketing','MKT'),
  ('d0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','R&D','RND'),
  ('d0000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000001','Ban điều hành','EXEC'),
  ('d0000000-0000-0000-0000-000000000004','a0000000-0000-0000-0000-000000000001','Kinh doanh (Sell)','SALES'),
  ('d0000000-0000-0000-0000-000000000005','a0000000-0000-0000-0000-000000000001','CSKH','CS'),
  ('d0000000-0000-0000-0000-000000000006','a0000000-0000-0000-0000-000000000001','Vận hành (OPS)','OPS'),
  ('d0000000-0000-0000-0000-000000000007','a0000000-0000-0000-0000-000000000001','Kế toán & Kho','FIN'),
  ('d0000000-0000-0000-0000-000000000008','a0000000-0000-0000-0000-000000000001','Thiết kế','DESIGN'),
  ('d0000000-0000-0000-0000-000000000009','a0000000-0000-0000-0000-000000000001','Content','CONTENT')
on conflict (id) do nothing;

-- 3) Nhân sự
insert into people (id, workspace_id, department_id, full_name, job_title) values
  ('e0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000001','Đào Hoàng Vũ','Trưởng phòng Marketing'),
  ('e0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000002','Má Hồng','Trưởng phòng R&D'),
  ('e0000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000003','Phúc','CEO'),
  ('e0000000-0000-0000-0000-000000000004','a0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000004','Vy','Trưởng Sell & CSKH'),
  ('e0000000-0000-0000-0000-000000000005','a0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000006','Quang (Justin Bie Map)','Admin / OPS · Điều phối dự án'),
  ('e0000000-0000-0000-0000-000000000006','a0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000007','Kha Thùy Linh','Kế toán · Trưởng kho'),
  ('e0000000-0000-0000-0000-000000000007','a0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000008','Uyên Nhi','Thiết kế'),
  ('e0000000-0000-0000-0000-000000000008','a0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000009','Nhung','Content'),
  ('e0000000-0000-0000-0000-000000000009','a0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000004','Hoàng Nhi','Nhân sự Sell'),
  ('e0000000-0000-0000-0000-000000000010','a0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000004','Ngọc','Nhân sự Sell'),
  ('e0000000-0000-0000-0000-000000000011','a0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000004','Liêu','Nhân sự Sell')
on conflict (id) do nothing;

-- 4) Gán trưởng phòng (head_person_id)
update departments set head_person_id='e0000000-0000-0000-0000-000000000001' where id='d0000000-0000-0000-0000-000000000001'; -- Vũ → Marketing
update departments set head_person_id='e0000000-0000-0000-0000-000000000002' where id='d0000000-0000-0000-0000-000000000002'; -- Má Hồng → R&D
update departments set head_person_id='e0000000-0000-0000-0000-000000000004' where id='d0000000-0000-0000-0000-000000000004'; -- Vy → Sell
update departments set head_person_id='e0000000-0000-0000-0000-000000000004' where id='d0000000-0000-0000-0000-000000000005'; -- Vy → CSKH
update departments set head_person_id='e0000000-0000-0000-0000-000000000006' where id='d0000000-0000-0000-0000-000000000007'; -- Kha Thùy Linh → Kế toán & Kho
update departments set head_person_id='e0000000-0000-0000-0000-000000000005' where id='d0000000-0000-0000-0000-000000000006'; -- Quang → OPS
update departments set head_person_id='e0000000-0000-0000-0000-000000000003' where id='d0000000-0000-0000-0000-000000000003'; -- Phúc → Ban điều hành

-- =====================================================================
-- 5) TÀI KHOẢN ĐĂNG NHẬP (làm sau, vì cần tạo user trên Supabase Auth)
--    Vai trò V1: ADMIN (Quang), CEO_READONLY (Phúc). Người khác hiện chỉ là
--    danh bạ (people); cấp tài khoản dần khi cần.
--
--  Bước: Supabase Dashboard > Authentication > Add user (email + mật khẩu).
--  Lấy user id, rồi chạy (thay <auth_uid>):
--
-- insert into profiles (id, workspace_id, auth_user_id, display_name) values
--   (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000001', '<auth_uid_quang>', 'Quang (Justin Bie Map)')
--   returning id;   -- nhớ id này là <profile_quang>
-- -- nối profile <-> người trong danh bạ:
-- update people set profile_id='<profile_quang>' where id='e0000000-0000-0000-0000-000000000005';
-- -- gán vai trò ADMIN:
-- insert into workspace_memberships (workspace_id, profile_id, role_id)
--   select 'a0000000-0000-0000-0000-000000000001','<profile_quang>', id from roles where code='ADMIN';
--
-- -- Tương tự cho Phúc (CEO_READONLY), profile_id nối people e...003.
-- =====================================================================
