-- DRAFT - DO NOT RUN ON PRODUCTION WITHOUT BACKUP AND QUANG APPROVAL.
-- Adds per-profile permission overrides for User Management.
-- Safe intent:
-- - no DROP
-- - no DELETE
-- - no TRUNCATE
-- - no reset
-- - additive table only

begin;

create table if not exists user_permission_overrides (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  module text not null,
  can_view boolean not null default false,
  can_create boolean not null default false,
  can_edit boolean not null default false,
  can_delete boolean not null default false,
  can_approve boolean not null default false,
  can_upload boolean not null default false,
  can_export boolean not null default false,
  scope text not null default 'none',
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_permission_overrides_scope_check
    check (scope in ('none', 'own', 'department', 'assigned_projects', 'company')),
  constraint user_permission_overrides_module_unique
    unique (profile_id, module)
);

create index if not exists user_permission_overrides_profile_idx
  on user_permission_overrides(profile_id);

commit;
