alter table employees
add column if not exists auth_user_id uuid unique,
add column if not exists role text default 'employee',
add column if not exists is_department_head boolean default false,
add column if not exists can_view_all boolean default false,
add column if not exists can_manage_users boolean default false,
add column if not exists can_manage_tasks boolean default false,
add column if not exists can_manage_department_tasks boolean default false,
add column if not exists status text default 'active',
add column if not exists invited_at timestamp with time zone,
add column if not exists last_login_at timestamp with time zone;

create table if not exists user_permissions (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references employees(id) on delete cascade,
  permission_key text not null,
  permission_value boolean default true,
  created_at timestamp with time zone default now(),
  unique(employee_id, permission_key)
);

create table if not exists role_permissions (
  role text not null,
  permission_key text not null,
  permission_value boolean default true,
  primary key(role, permission_key)
);

create table if not exists department_access (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references employees(id) on delete cascade,
  department_id uuid references departments(id) on delete cascade,
  access_level text default 'member',
  created_at timestamp with time zone default now(),
  unique(employee_id, department_id)
);

insert into role_permissions (role, permission_key, permission_value)
values
  ('ceo', 'view_all', true),
  ('ceo', 'manage_users', true),
  ('ceo', 'manage_tasks', true),
  ('ceo', 'approve_ceo', true),
  ('coo', 'view_all', true),
  ('coo', 'manage_users', true),
  ('coo', 'manage_tasks', true),
  ('coo', 'approve_coo', true),
  ('admin', 'manage_users', true),
  ('admin', 'manage_departments', true),
  ('department_head', 'manage_department_tasks', true),
  ('department_head', 'approve_department', true),
  ('employee', 'update_own_tasks', true),
  ('employee', 'upload_reports', true),
  ('employee', 'comment', true),
  ('employee', 'submit_approval', true)
on conflict (role, permission_key)
do update set permission_value = excluded.permission_value;

update employees
set role = case
  when lower(coalesce(role, '')) in ('ceo', 'coo', 'admin', 'department_head', 'employee') then lower(role)
  when is_department_head = true then 'department_head'
  else 'employee'
end
where role is null
   or lower(coalesce(role, '')) not in ('ceo', 'coo', 'admin', 'department_head', 'employee');

update employees
set status = 'active'
where status is null;
