-- ============================================================
-- VyVy WorkOS — Row Level Security Policies
-- Chạy file này SAU KHI đã chạy supabase_auth_rbac_upgrade.sql
-- ============================================================

-- Bật RLS cho các bảng chính
alter table projects enable row level security;
alter table tasks enable row level security;
alter table task_steps enable row level security;
alter table task_supporters enable row level security;
alter table task_reports enable row level security;
alter table step_comments enable row level security;
alter table employees enable row level security;
alter table departments enable row level security;

-- ============================================================
-- Helper function: lấy employee_id từ auth.uid()
-- ============================================================
create or replace function get_current_employee_id()
returns uuid language sql security definer stable as $$
  select id from employees
  where auth_user_id = auth.uid()
    and status = 'active'
  limit 1;
$$;

-- Helper function: lấy role của user hiện tại
create or replace function get_current_role()
returns text language sql security definer stable as $$
  select coalesce(role, 'employee') from employees
  where auth_user_id = auth.uid()
    and status = 'active'
  limit 1;
$$;

-- Helper function: lấy department_id của user hiện tại
create or replace function get_current_department_id()
returns uuid language sql security definer stable as $$
  select department_id from employees
  where auth_user_id = auth.uid()
    and status = 'active'
  limit 1;
$$;

-- Helper function: user có quyền xem tất cả không
create or replace function can_view_all_data()
returns boolean language sql security definer stable as $$
  select exists(
    select 1 from employees
    where auth_user_id = auth.uid()
      and status = 'active'
      and (
        role in ('ceo', 'coo')
        or (role = 'admin' and can_view_all = true)
      )
  );
$$;

-- ============================================================
-- departments: tất cả user đã login đều đọc được
-- ============================================================
drop policy if exists "departments_select" on departments;
create policy "departments_select" on departments
  for select to authenticated using (true);

-- ============================================================
-- employees: mỗi người xem được record của mình;
--            CEO/COO/Admin xem được tất cả
-- ============================================================
drop policy if exists "employees_select" on employees;
create policy "employees_select" on employees
  for select to authenticated using (
    auth_user_id = auth.uid()
    or get_current_role() in ('ceo', 'coo', 'admin')
  );

drop policy if exists "employees_update" on employees;
create policy "employees_update" on employees
  for update to authenticated using (
    get_current_role() in ('ceo', 'coo', 'admin')
  );

-- ============================================================
-- projects: CEO/COO/Admin xem tất cả;
--           department_head xem dự án thuộc phòng ban;
--           employee xem dự án có task liên quan mình
-- ============================================================
drop policy if exists "projects_select" on projects;
create policy "projects_select" on projects
  for select to authenticated using (
    can_view_all_data()
    or owner_id = get_current_employee_id()
    or department_id = get_current_department_id()
    or exists(
      select 1 from tasks t
      where t.project_id = projects.id
        and (
          t.assignee_id = get_current_employee_id()
          or t.head_id = get_current_employee_id()
        )
    )
    or exists(
      select 1 from task_supporters ts
      join tasks t on t.id = ts.task_id
      where t.project_id = projects.id
        and ts.employee_id = get_current_employee_id()
    )
  );

drop policy if exists "projects_insert" on projects;
create policy "projects_insert" on projects
  for insert to authenticated with check (
    get_current_role() in ('ceo', 'coo', 'admin')
  );

drop policy if exists "projects_update" on projects;
create policy "projects_update" on projects
  for update to authenticated using (
    get_current_role() in ('ceo', 'coo', 'admin')
    or owner_id = get_current_employee_id()
  );

drop policy if exists "projects_delete" on projects;
create policy "projects_delete" on projects
  for delete to authenticated using (
    get_current_role() in ('ceo', 'coo', 'admin')
  );

-- ============================================================
-- tasks: CEO/COO/Admin xem tất cả;
--        department_head xem task phòng ban mình;
--        employee xem task mình phụ trách / hỗ trợ / có step
-- ============================================================
drop policy if exists "tasks_select" on tasks;
create policy "tasks_select" on tasks
  for select to authenticated using (
    can_view_all_data()
    or assignee_id = get_current_employee_id()
    or head_id = get_current_employee_id()
    or department_id = get_current_department_id()
    or exists(
      select 1 from task_supporters
      where task_id = tasks.id
        and employee_id = get_current_employee_id()
    )
    or exists(
      select 1 from task_steps
      where task_id = tasks.id
        and (
          owner_id = get_current_employee_id()
          or department_approver_id = get_current_employee_id()
          or coo_approver_id = get_current_employee_id()
          or ceo_approver_id = get_current_employee_id()
        )
    )
  );

drop policy if exists "tasks_insert" on tasks;
create policy "tasks_insert" on tasks
  for insert to authenticated with check (
    get_current_role() in ('ceo', 'coo', 'admin', 'department_head')
  );

drop policy if exists "tasks_update" on tasks;
create policy "tasks_update" on tasks
  for update to authenticated using (
    can_view_all_data()
    or assignee_id = get_current_employee_id()
    or head_id = get_current_employee_id()
    or department_id = get_current_department_id()
  );

drop policy if exists "tasks_delete" on tasks;
create policy "tasks_delete" on tasks
  for delete to authenticated using (
    get_current_role() in ('ceo', 'coo', 'admin')
  );

-- ============================================================
-- task_steps
-- ============================================================
drop policy if exists "steps_select" on task_steps;
create policy "steps_select" on task_steps
  for select to authenticated using (
    can_view_all_data()
    or owner_id = get_current_employee_id()
    or department_approver_id = get_current_employee_id()
    or coo_approver_id = get_current_employee_id()
    or ceo_approver_id = get_current_employee_id()
    or exists(
      select 1 from tasks
      where tasks.id = task_steps.task_id
        and (
          tasks.assignee_id = get_current_employee_id()
          or tasks.head_id = get_current_employee_id()
          or tasks.department_id = get_current_department_id()
        )
    )
  );

drop policy if exists "steps_insert" on task_steps;
create policy "steps_insert" on task_steps
  for insert to authenticated with check (true);

drop policy if exists "steps_update" on task_steps;
create policy "steps_update" on task_steps
  for update to authenticated using (
    can_view_all_data()
    or owner_id = get_current_employee_id()
    or department_approver_id = get_current_employee_id()
    or coo_approver_id = get_current_employee_id()
    or ceo_approver_id = get_current_employee_id()
    or exists(
      select 1 from tasks
      where tasks.id = task_steps.task_id
        and (
          tasks.assignee_id = get_current_employee_id()
          or tasks.head_id = get_current_employee_id()
        )
    )
  );

drop policy if exists "steps_delete" on task_steps;
create policy "steps_delete" on task_steps
  for delete to authenticated using (
    can_view_all_data()
    or exists(
      select 1 from tasks
      where tasks.id = task_steps.task_id
        and tasks.head_id = get_current_employee_id()
    )
  );

-- ============================================================
-- task_supporters
-- ============================================================
drop policy if exists "supporters_select" on task_supporters;
create policy "supporters_select" on task_supporters
  for select to authenticated using (
    can_view_all_data()
    or employee_id = get_current_employee_id()
    or exists(
      select 1 from tasks
      where tasks.id = task_supporters.task_id
        and (tasks.assignee_id = get_current_employee_id() or tasks.head_id = get_current_employee_id())
    )
  );

drop policy if exists "supporters_insert" on task_supporters;
create policy "supporters_insert" on task_supporters
  for insert to authenticated with check (true);

drop policy if exists "supporters_delete" on task_supporters;
create policy "supporters_delete" on task_supporters
  for delete to authenticated using (
    can_view_all_data()
    or exists(
      select 1 from tasks
      where tasks.id = task_supporters.task_id
        and tasks.head_id = get_current_employee_id()
    )
  );

-- ============================================================
-- task_reports
-- ============================================================
drop policy if exists "reports_select" on task_reports;
create policy "reports_select" on task_reports
  for select to authenticated using (
    can_view_all_data()
    or uploaded_by = get_current_employee_id()
    or exists(
      select 1 from tasks
      where tasks.id = task_reports.task_id
        and (tasks.assignee_id = get_current_employee_id() or tasks.head_id = get_current_employee_id())
    )
  );

drop policy if exists "reports_insert" on task_reports;
create policy "reports_insert" on task_reports
  for insert to authenticated with check (true);

drop policy if exists "reports_delete" on task_reports;
create policy "reports_delete" on task_reports
  for delete to authenticated using (
    can_view_all_data()
    or uploaded_by = get_current_employee_id()
  );

-- ============================================================
-- step_comments: ai cũng xem và thêm được nếu có quyền xem step
-- ============================================================
drop policy if exists "comments_select" on step_comments;
create policy "comments_select" on step_comments
  for select to authenticated using (true);

drop policy if exists "comments_insert" on step_comments;
create policy "comments_insert" on step_comments
  for insert to authenticated with check (true);

-- ============================================================
-- user_permissions, role_permissions: admin đọc/ghi
-- ============================================================
alter table if exists user_permissions enable row level security;
alter table if exists role_permissions enable row level security;

drop policy if exists "user_perms_select" on user_permissions;
create policy "user_perms_select" on user_permissions
  for select to authenticated using (
    employee_id = get_current_employee_id()
    or get_current_role() in ('ceo', 'coo', 'admin')
  );

drop policy if exists "role_perms_select" on role_permissions;
create policy "role_perms_select" on role_permissions
  for select to authenticated using (true);
