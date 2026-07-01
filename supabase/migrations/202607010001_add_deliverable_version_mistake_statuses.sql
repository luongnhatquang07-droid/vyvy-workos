-- Safe migration for deliverable version lifecycle statuses.
-- No DROP/DELETE/TRUNCATE. Existing rows keep their current statuses.

alter type approval_status add value if not exists 'PENDING_REVIEW';
alter type approval_status add value if not exists 'UPLOADED_BY_MISTAKE';
alter type approval_status add value if not exists 'SUPERSEDED';
