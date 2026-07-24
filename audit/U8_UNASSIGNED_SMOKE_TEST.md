# U8 UNASSIGNED browser smoke test

Date: 2026-07-24 (Asia/Bangkok)

## Result

- Overall: **PASS**
- Browser flow: **PASS**
- Audit-trail verification: **PASS**
- Cleanup: **PASS**
- Final active run-specific `[TEST] U8 ...` fixture count: **0**

## Deadline-rollup regression and fix

The first U8 run proved that the created database row had:

- `status = 'UNASSIGNED'`
- `owner_id IS NULL`
- `due_date IS NULL`

The Kanban card initially missed the `Chưa có deadline` badge because
`src/lib/db/commandCenter.ts` replaced the task's null database deadline with a
deadline rolled up from its generated child steps.

The approved minimal fix now keeps the task-level displayed deadline null only
when:

- `task.status = 'UNASSIGNED'`; and
- the task's own database `due_date` is null.

The workstream and project deadline rollups are unchanged. Unit tests cover:

1. UNASSIGNED + task deadline null + step deadline: task stays null; parents roll up.
2. NOT_STARTED + task deadline null + step deadline: task still rolls up.
3. NOT_STARTED + task deadline present + later step deadline: max-date behavior remains.

## Browser phases

| Phase | Verification | Result |
|---|---|---|
| Create | Create a task through the Projects form with owner and deadline empty | PASS |
| Persistence | API response and database row are `UNASSIGNED`, owner null, deadline null | PASS |
| Progress | Project progress does not change when the UNASSIGNED task is added | PASS |
| Kanban | Card appears in `Chưa giao việc` with both missing-field badges | PASS |
| Command Center | KPI increments; panel shows `Thiếu owner + deadline`; drawer opens | PASS |
| KPI navigation | KPI routes to `/projects?filter=unassigned` | PASS |
| Projects filters | Quick chip and status dropdown return the UNASSIGNED task only | PASS |
| Deadline-only edit | Deadline badge disappears; owner badge remains; status stays UNASSIGNED | PASS |
| Owner edit | With both fields present, task automatically moves to NOT_STARTED | PASS |
| Completion cancel | Cancel keeps the second task UNASSIGNED | PASS |
| Completion bypass | Confirm moves it to COMPLETED without HTTP 500 | PASS |
| Audit trail | `complete_unassigned_bypass` row contains the expected before/after shape | PASS |
| Cleanup | Both run-specific test tasks are soft-deleted | PASS |

## Screenshots

- `audit/screenshots/UNASSIGNED-STATUS/U8-01-create-form-unassigned.png`
- `audit/screenshots/UNASSIGNED-STATUS/U8-02-progress-excludes-unassigned.png`
- `audit/screenshots/UNASSIGNED-STATUS/U8-03-kanban-unassigned-two-badges.png`
- `audit/screenshots/UNASSIGNED-STATUS/U8-04-command-center-kpi-panel.png`
- `audit/screenshots/UNASSIGNED-STATUS/U8-05-projects-quick-filter.png`
- `audit/screenshots/UNASSIGNED-STATUS/U8-06-projects-status-filter.png`
- `audit/screenshots/UNASSIGNED-STATUS/U8-07-deadline-only-still-unassigned.png`
- `audit/screenshots/UNASSIGNED-STATUS/U8-08-owner-auto-transition-not-started.png`
- `audit/screenshots/UNASSIGNED-STATUS/U8-09-bypass-confirm.png`
- `audit/screenshots/UNASSIGNED-STATUS/U8-10-bypass-completed.png`

No credential, token, user UUID, email, phone number, or other PII was written
to this report or the test output.
