# Manual reversal of `task_status.UNASSIGNED`

`202607220001_add_unassigned_task_status.sql` has an intentionally asymmetric
rollback. PostgreSQL supports adding an enum value but does not support removing
one with `ALTER TYPE`.

Do not attempt to delete directly from `pg_enum`. A full reversal is a separate
high-risk maintenance operation and must be reviewed against the live catalog.

## Preconditions

1. Put task writes into a maintenance window and take a verified database backup.
2. Deploy application code that no longer writes or expects `UNASSIGNED`.
3. Confirm zero `UNASSIGNED` values in every `task_status` column, including:
   `tasks.status`, `task_steps.status`, `task_status_history.from_status`, and
   `task_status_history.to_status`.
4. Capture current definitions, owners, grants, and security options for every
   dependent view. At the time U1 was designed these included
   `v_command_center_queue`, `v_overdue_items`, and `v_team_workload`; the live
   catalog is authoritative and may contain more dependencies later.
5. Capture the defaults on `tasks.status` and `task_steps.status`.

## Reviewed manual operation

The reviewed operator plan must:

1. Remove the U1 trigger and trigger function.
2. Drop only the catalog-confirmed dependent views.
3. Drop defaults from columns typed as `task_status`.
4. Rename the existing enum, create a replacement enum containing the original
   eight labels, and cast every dependent column through `text`.
5. Restore column defaults, dependent views, owners, grants, and security options
   exactly from the captured live definitions.
6. Drop the renamed enum only after `pg_depend` confirms nothing references it.
7. Run schema fingerprints, application smoke tests, and a data consistency
   check before ending the maintenance window.

This document intentionally does not provide copy-paste SQL: live dependent
objects can drift, so a static enum-recreation script would be unsafe.
