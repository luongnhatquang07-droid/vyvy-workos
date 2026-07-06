-- DRAFT — DO NOT RUN ON PRODUCTION WITHOUT BACKUP AND QUANG APPROVAL.
-- Phase 1 RBAC foundation for VyVy WorkOS.
-- Safe intent:
-- - no DROP
-- - no DELETE
-- - no TRUNCATE
-- - no mass UPDATE
-- - keep legacy roles

begin;

insert into roles (code, name, description)
values
  ('CEO', 'CEO', 'Executive read access and high-level approval role'),
  ('COO', 'COO', 'Operational leadership role with workspace-wide task access'),
  ('DEPARTMENT_HEAD', 'Truong bo phan', 'Department-scoped management role'),
  ('EMPLOYEE', 'Nhan vien', 'Personal task and deliverable role')
on conflict (code) do nothing;

-- Keep legacy roles available for backward compatibility.
insert into roles (code, name, description)
values
  ('ADMIN', 'Quan tri he thong', 'Full system administration role'),
  ('PROJECT_COORDINATOR', 'Dieu phoi du an', 'Legacy operational coordinator role mapped to COO in code'),
  ('CEO_READONLY', 'CEO chi xem', 'Legacy read-only CEO role mapped to CEO in code')
on conflict (code) do nothing;

alter table people
  add column if not exists manager_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'people_manager_id_fkey'
  ) then
    alter table people
      add constraint people_manager_id_fkey
      foreign key (manager_id)
      references people(id)
      on delete set null;
  end if;
end $$;

alter table profiles
  add column if not exists username text;

create unique index if not exists profiles_username_unique_idx
  on profiles (lower(username))
  where username is not null;

-- Optional permission seeds. These are additive and avoid duplicates.
with permissions(role_code, resource, action, allowed) as (
  values
    ('ADMIN', 'users', 'manage', true),
    ('ADMIN', 'workspace', 'manage', true),
    ('ADMIN', 'reports', 'view_all', true),
    ('CEO', 'workspace', 'view_all', true),
    ('CEO', 'reports', 'view_all', true),
    ('COO', 'workspace', 'operate', true),
    ('COO', 'tasks', 'manage_all', true),
    ('DEPARTMENT_HEAD', 'department', 'manage_own', true),
    ('DEPARTMENT_HEAD', 'deliverables', 'approve_own_department', true),
    ('EMPLOYEE', 'tasks', 'manage_assigned', true),
    ('EMPLOYEE', 'deliverables', 'submit_assigned', true),
    ('PROJECT_COORDINATOR', 'workspace', 'operate', true),
    ('CEO_READONLY', 'workspace', 'view_all', true)
)
insert into role_permissions (role_id, resource, action, allowed)
select roles.id, permissions.resource, permissions.action, permissions.allowed
from permissions
join roles on roles.code = permissions.role_code
where not exists (
  select 1
  from role_permissions existing
  where existing.role_id = roles.id
    and existing.resource = permissions.resource
    and existing.action = permissions.action
);

commit;

