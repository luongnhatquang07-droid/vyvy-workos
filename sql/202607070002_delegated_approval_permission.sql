-- DRAFT - DO NOT RUN ON PRODUCTION WITHOUT BACKUP AND QUANG APPROVAL.
-- Adds delegated approval permission and optional audit fields.
-- Safe intent:
-- - no DROP
-- - no DELETE
-- - no TRUNCATE
-- - no reset
-- - additive columns only

begin;

alter table if exists user_permission_overrides
  add column if not exists can_approve_on_behalf boolean not null default false;

alter table if exists approval_actions
  add column if not exists original_reviewer_id uuid references people(id) on delete set null,
  add column if not exists acted_by_user_id uuid references people(id) on delete set null,
  add column if not exists is_delegated_action boolean not null default false,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

commit;
