-- ============================================================
-- VyVy WorkOS — Role Permissions Seed
-- Chạy file này trong Supabase Dashboard > SQL Editor
-- SAFE: xóa toàn bộ permissions cũ rồi insert lại
-- Không ảnh hưởng đến employees, tasks, projects
-- ============================================================

-- Xóa và seed lại toàn bộ (bảng nhỏ, safe để truncate)
TRUNCATE TABLE role_permissions;

INSERT INTO role_permissions (id, role, resource, action, scope)
VALUES

-- ── ADMIN ── (thực ra được hard-code full access trong can(), nhưng seed để PermissionsView hiển thị đúng)
(gen_random_uuid(), 'admin', 'project',     'view',    'all'),
(gen_random_uuid(), 'admin', 'project',     'create',  'all'),
(gen_random_uuid(), 'admin', 'project',     'edit',    'all'),
(gen_random_uuid(), 'admin', 'project',     'delete',  'all'),
(gen_random_uuid(), 'admin', 'workstream',  'view',    'all'),
(gen_random_uuid(), 'admin', 'workstream',  'create',  'all'),
(gen_random_uuid(), 'admin', 'workstream',  'edit',    'all'),
(gen_random_uuid(), 'admin', 'workstream',  'delete',  'all'),
(gen_random_uuid(), 'admin', 'subtask',     'view',    'all'),
(gen_random_uuid(), 'admin', 'subtask',     'create',  'all'),
(gen_random_uuid(), 'admin', 'subtask',     'edit',    'all'),
(gen_random_uuid(), 'admin', 'subtask',     'delete',  'all'),
(gen_random_uuid(), 'admin', 'step',        'view',    'all'),
(gen_random_uuid(), 'admin', 'step',        'create',  'all'),
(gen_random_uuid(), 'admin', 'step',        'edit',    'all'),
(gen_random_uuid(), 'admin', 'step',        'delete',  'all'),
(gen_random_uuid(), 'admin', 'step',        'approve', 'all'),
(gen_random_uuid(), 'admin', 'import',      'use',     'all'),
(gen_random_uuid(), 'admin', 'export',      'use',     'all'),
(gen_random_uuid(), 'admin', 'admin_panel', 'use',     'all'),

-- ── CEO ── (xem toàn bộ, không quản lý user/role)
(gen_random_uuid(), 'ceo', 'project',     'view',    'all'),
(gen_random_uuid(), 'ceo', 'project',     'create',  'all'),
(gen_random_uuid(), 'ceo', 'project',     'edit',    'all'),
(gen_random_uuid(), 'ceo', 'project',     'delete',  'all'),
(gen_random_uuid(), 'ceo', 'workstream',  'view',    'all'),
(gen_random_uuid(), 'ceo', 'workstream',  'create',  'all'),
(gen_random_uuid(), 'ceo', 'workstream',  'edit',    'all'),
(gen_random_uuid(), 'ceo', 'workstream',  'delete',  'all'),
(gen_random_uuid(), 'ceo', 'subtask',     'view',    'all'),
(gen_random_uuid(), 'ceo', 'subtask',     'create',  'all'),
(gen_random_uuid(), 'ceo', 'subtask',     'edit',    'all'),
(gen_random_uuid(), 'ceo', 'subtask',     'delete',  'all'),
(gen_random_uuid(), 'ceo', 'step',        'view',    'all'),
(gen_random_uuid(), 'ceo', 'step',        'create',  'all'),
(gen_random_uuid(), 'ceo', 'step',        'edit',    'all'),
(gen_random_uuid(), 'ceo', 'step',        'delete',  'all'),
(gen_random_uuid(), 'ceo', 'step',        'approve', 'all'),
(gen_random_uuid(), 'ceo', 'import',      'use',     'all'),
(gen_random_uuid(), 'ceo', 'export',      'use',     'all'),
(gen_random_uuid(), 'ceo', 'admin_panel', 'use',     'none'),  -- CEO không quản lý role/user

-- ── COO ── (vận hành toàn bộ, không quản lý user/role)
(gen_random_uuid(), 'coo', 'project',     'view',    'all'),
(gen_random_uuid(), 'coo', 'project',     'create',  'all'),
(gen_random_uuid(), 'coo', 'project',     'edit',    'all'),
(gen_random_uuid(), 'coo', 'project',     'delete',  'all'),
(gen_random_uuid(), 'coo', 'workstream',  'view',    'all'),
(gen_random_uuid(), 'coo', 'workstream',  'create',  'all'),
(gen_random_uuid(), 'coo', 'workstream',  'edit',    'all'),
(gen_random_uuid(), 'coo', 'workstream',  'delete',  'all'),
(gen_random_uuid(), 'coo', 'subtask',     'view',    'all'),
(gen_random_uuid(), 'coo', 'subtask',     'create',  'all'),
(gen_random_uuid(), 'coo', 'subtask',     'edit',    'all'),
(gen_random_uuid(), 'coo', 'subtask',     'delete',  'all'),
(gen_random_uuid(), 'coo', 'step',        'view',    'all'),
(gen_random_uuid(), 'coo', 'step',        'create',  'all'),
(gen_random_uuid(), 'coo', 'step',        'edit',    'all'),
(gen_random_uuid(), 'coo', 'step',        'delete',  'all'),
(gen_random_uuid(), 'coo', 'step',        'approve', 'all'),
(gen_random_uuid(), 'coo', 'import',      'use',     'all'),
(gen_random_uuid(), 'coo', 'export',      'use',     'all'),
(gen_random_uuid(), 'coo', 'admin_panel', 'use',     'none'),  -- COO không quản lý role/user

-- ── DEPARTMENT HEAD ── (chỉ phòng ban mình)
(gen_random_uuid(), 'department_head', 'project',     'view',    'own_dept'),
(gen_random_uuid(), 'department_head', 'project',     'create',  'none'),
(gen_random_uuid(), 'department_head', 'project',     'edit',    'own_dept'),
(gen_random_uuid(), 'department_head', 'project',     'delete',  'none'),
(gen_random_uuid(), 'department_head', 'workstream',  'view',    'own_dept'),
(gen_random_uuid(), 'department_head', 'workstream',  'create',  'own_dept'),
(gen_random_uuid(), 'department_head', 'workstream',  'edit',    'own_dept'),
(gen_random_uuid(), 'department_head', 'workstream',  'delete',  'none'),
(gen_random_uuid(), 'department_head', 'subtask',     'view',    'own_dept'),
(gen_random_uuid(), 'department_head', 'subtask',     'create',  'own_dept'),
(gen_random_uuid(), 'department_head', 'subtask',     'edit',    'own_dept'),
(gen_random_uuid(), 'department_head', 'subtask',     'delete',  'none'),
(gen_random_uuid(), 'department_head', 'step',        'view',    'own_dept'),
(gen_random_uuid(), 'department_head', 'step',        'create',  'own_dept'),
(gen_random_uuid(), 'department_head', 'step',        'edit',    'own_dept'),
(gen_random_uuid(), 'department_head', 'step',        'delete',  'none'),
(gen_random_uuid(), 'department_head', 'step',        'approve', 'own_dept'),
(gen_random_uuid(), 'department_head', 'import',      'use',     'all'),
(gen_random_uuid(), 'department_head', 'export',      'use',     'all'),
(gen_random_uuid(), 'department_head', 'admin_panel', 'use',     'none'),

-- ── EMPLOYEE ── (chỉ task được giao cho mình)
(gen_random_uuid(), 'employee', 'project',     'view',    'none'),
(gen_random_uuid(), 'employee', 'project',     'create',  'none'),
(gen_random_uuid(), 'employee', 'project',     'edit',    'none'),
(gen_random_uuid(), 'employee', 'project',     'delete',  'none'),
(gen_random_uuid(), 'employee', 'workstream',  'view',    'none'),
(gen_random_uuid(), 'employee', 'workstream',  'create',  'none'),
(gen_random_uuid(), 'employee', 'workstream',  'edit',    'none'),
(gen_random_uuid(), 'employee', 'workstream',  'delete',  'none'),
(gen_random_uuid(), 'employee', 'subtask',     'view',    'assigned'),
(gen_random_uuid(), 'employee', 'subtask',     'create',  'none'),
(gen_random_uuid(), 'employee', 'subtask',     'edit',    'assigned'),
(gen_random_uuid(), 'employee', 'subtask',     'delete',  'none'),
(gen_random_uuid(), 'employee', 'step',        'view',    'assigned'),
(gen_random_uuid(), 'employee', 'step',        'create',  'none'),
(gen_random_uuid(), 'employee', 'step',        'edit',    'assigned'),
(gen_random_uuid(), 'employee', 'step',        'delete',  'none'),
(gen_random_uuid(), 'employee', 'step',        'approve', 'none'),
(gen_random_uuid(), 'employee', 'import',      'use',     'none'),
(gen_random_uuid(), 'employee', 'export',      'use',     'none'),
(gen_random_uuid(), 'employee', 'admin_panel', 'use',     'none')

-- (end of INSERT — no ON CONFLICT needed since we TRUNCATE above)
;

-- ============================================================
-- Phòng ban chuẩn — seed nếu chưa có (không xóa data cũ)
-- ============================================================
INSERT INTO departments (name, code)
SELECT name, code FROM (VALUES
  ('CEO / Ban Giám Đốc', 'CEO'),
  ('OPS / Admin / HR',   'OPS'),
  ('Marketing',          'MKT'),
  ('Content',            'CNT'),
  ('Sales / CSKH',       'SALES'),
  ('R&D / Sản phẩm',    'RND'),
  ('Kế toán / Kho',     'FIN'),
  ('Thiết kế',          'DESIGN'),
  ('Media',              'MEDIA')
) AS v(name, code)
WHERE NOT EXISTS (SELECT 1 FROM departments d WHERE d.name = v.name);

-- ============================================================
-- Hướng dẫn seed tài khoản mẫu (thực hiện thủ công qua Quản lý Nhân sự)
-- ============================================================
-- Các tài khoản sau cần được tạo/cập nhật qua Quản lý Nhân sự trong app:
--
-- | Tên        | Email                      | Role            | Phòng ban       |
-- |------------|----------------------------|-----------------|-----------------|
-- | Vy         | vy@vyvystore.vn            | ceo             | CEO             |
-- | Phúc       | phuc@vyvystore.vn          | ceo             | CEO             |
-- | Quang      | quang@vyvystore.vn         | admin           | OPS             |
-- | Nhung      | nhung@vyvystore.vn         | employee        | Content         |
-- | Vũ         | vu@vyvystore.vn            | employee        | Marketing       |
-- | Má Hồng   | mahong@vyvystore.vn        | department_head | R&D             |
-- | Thùy Linh  | thuylinh@vyvystore.vn      | employee        | Kế toán / Kho  |
-- | Nhi        | nhi@vyvystore.vn           | employee        | Thiết kế        |
