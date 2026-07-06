# RBAC Phase 1

Tai lieu nay mo ta nen phan quyen Phase 1 cho VyVy WorkOS. Phase nay chi them role config, permission helper va migration draft. Chua enforce rong tren production.

## Role moi

| Code | Ten hien thi | Y nghia |
|---|---|---|
| `ADMIN` | Quan tri he thong | Full access, quan ly tai khoan, du lieu va bao cao |
| `CEO` | CEO | Xem toan cong ty, xem bao cao va phe duyet cap cao |
| `COO` | COO | Dieu phoi van hanh, sua viec va phe duyet operational |
| `DEPARTMENT_HEAD` | Truong bo phan | Quan ly du lieu trong phong ban phu trach |
| `EMPLOYEE` | Nhan vien | Chi xem/sua viec duoc giao |

## Role cu va mapping

| Role cu | Mapping Phase 1 | Ghi chu |
|---|---|---|
| `ADMIN` | `ADMIN` | Quang giu full quyen |
| `PROJECT_COORDINATOR` | `COO` | Admin-lite van hanh, khong bi chan trong Phase 1 |
| `CEO_READONLY` | `CEO` | Giu tinh chat read-only khi edit/approve |

## Helper da them

File chinh:

- `src/lib/rbac/roles.ts`
- `src/lib/rbac/permissions.ts`
- `src/lib/permissions.ts`

Helper co san:

- `normalizeRole()`
- `normalizeUserRole()`
- `isAdmin()`
- `isExecutive()`
- `isDepartmentHead()`
- `isEmployee()`
- `canManageUsers()`
- `canViewProject()`
- `canEditProject()`
- `canViewWorkstream()`
- `canEditWorkstream()`
- `canViewSubtask()`
- `canEditSubtask()`
- `canViewStep()`
- `canEditStep()`
- `canApproveDeliverable()`
- `canViewReports()`
- `canViewTeamWorkload()`
- `canViewFileLibrary()`

Phase 1 chua gan cac helper nay vao tat ca route de tranh doi hanh vi production dot ngot.

## Nguyen tac tam thoi

- `ADMIN`: full access.
- `CEO`: view all, edit han che trong Phase 1.
- `COO`: view/edit operational data.
- `DEPARTMENT_HEAD`: view/edit/approve trong phong ban minh hoac viec minh duoc gan.
- `EMPLOYEE`: view/edit viec minh duoc giao, khong manage users, khong approve viec nguoi khac.

## Migration draft

Draft nam o:

`sql/202607060001_rbac_roles_and_user_management.sql`

Draft chi gom thay doi an toan:

- insert role moi neu chua co;
- giu role cu;
- them `people.manager_id` nullable;
- them `profiles.username` nullable;
- seed `role_permissions` bang insert co check trung lap.

Chua chay migration tren production. Truoc khi chay can co backup va Quang xac nhan.

## Phase 2 can gi

Truoc khi tao tai khoan that:

- dev/staging DB rieng;
- danh sach email nhan su;
- mat khau tam hoac quy trinh moi user tu dat mat khau;
- Quang xac nhan ai duoc tao account login;
- quy tac khoa/mo tai khoan;
- quy tac reset password bang Supabase Admin API.

## Phase 3 enforce

Sau khi Phase 2 co data/user test, moi enforce permission vao:

- `/projects`
- `/command-center`
- `/approvals`
- `/deliverables`
- `/file-library`
- `/follow-ups`
- `/team-workload`
- API write routes

API phai tra `403` voi thong bao ro khi user khong co quyen.

