-- DRAFT - DO NOT RUN ON PRODUCTION WITHOUT BACKUP AND QUANG APPROVAL.
-- Adds a default approver separate from manager for user accounts.
-- Safe intent:
-- - no DROP
-- - no DELETE
-- - no TRUNCATE
-- - no reset
-- - additive column/index only

begin;

alter table if exists people
  add column if not exists default_approver_id uuid references people(id) on delete set null;

create index if not exists people_default_approver_idx
  on people(default_approver_id);

commit;
