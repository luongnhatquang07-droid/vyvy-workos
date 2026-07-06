# Dev/Staging DB Setup Cho RBAC Phase 2

Tài liệu này dùng để chuẩn bị môi trường dev/staging trước khi làm User Management và test phân quyền. Không dùng localhost trỏ production để test tạo tài khoản, sửa quyền, khóa/mở tài khoản hoặc upload QA.

## Trạng Thái Hiện Tại

- Production Supabase ref: `tgmnkqcxucxpnhhsggug`
- Production project name: `vyvy-workos-v2`
- Local hiện có thể trỏ production nếu `.env.local` dùng ref trên.
- Local guard đã chặn write vào production theo mặc định.
- RBAC Phase 1 đã có migration draft: `sql/202607060001_rbac_roles_and_user_management.sql`
- Chưa chạy migration RBAC trên production.
- Chưa có dev/staging DB riêng được cấu hình trong repo.

## Mục Tiêu

Trước Phase 2 cần có một trong hai môi trường an toàn:

1. Supabase persistent branch tên gợi ý: `staging-rbac`
2. Supabase project riêng tên gợi ý: `vyvy-workos-v2-staging`

Ưu tiên dùng môi trường tách khỏi production để có API keys riêng, database riêng, Auth users riêng và Storage riêng.

## Phương Án A - Supabase Branch

Supabase Branches tạo môi trường riêng với Supabase instance và API credentials riêng. Persistent branch phù hợp cho staging/QA lâu dài. Theo tài liệu Supabase, branch mới không tự copy data production để bảo vệ dữ liệu nhạy cảm; nếu cần data test thì dùng seed file hoặc import dữ liệu tối giản đã ẩn thông tin.

Các bước cho Quang:

1. Vào Supabase Dashboard của project `vyvy-workos-v2`.
2. Mở khu vực Branches.
3. Tạo persistent branch tên `staging-rbac`.
4. Chờ branch healthy.
5. Lấy các biến của branch:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
6. Không copy dữ liệu thật nếu chưa cần. Nếu cần test, seed dữ liệu tối giản với prefix `STAGING_` hoặc `RBAC_QA_`.

## Phương Án B - Supabase Project Staging Riêng

Dùng khi Supabase Branch không khả dụng hoặc muốn môi trường staging lâu dài độc lập.

Các bước cho Quang:

1. Tạo project Supabase mới: `vyvy-workos-v2-staging`.
2. Region nên giống production nếu có thể.
3. Không dùng lại service role key production.
4. Tạo Storage bucket staging tương ứng, ví dụ `project-files`.
5. Chạy schema/migration trên staging, không chạy trên production.
6. Tạo Auth user test:
   - Admin QA
   - Department Head QA
   - Employee QA
7. Seed dữ liệu test tối giản, không import dữ liệu công ty thật nếu chưa ẩn thông tin.

## Env Local/Staging

Tạo file local riêng ngoài Git, ví dụ:

```env
NEXT_PUBLIC_APP_ENV=staging
APP_ENV=staging
NEXT_PUBLIC_SUPABASE_URL=https://STAGING-REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=STAGING_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=STAGING_SERVICE_ROLE_KEY
ALLOW_LOCAL_PROD_QA_WRITES=
```

Quy tắc:

- `ALLOW_LOCAL_PROD_QA_WRITES` phải để trống.
- Không commit `.env.local`.
- Không copy production service role key sang staging.
- Không đặt `NEXT_PUBLIC_SUPABASE_URL` là production ref khi test write.

## Migration RBAC Trên Staging

Chỉ chạy draft này trên staging sau khi Quang xác nhận:

```text
sql/202607060001_rbac_roles_and_user_management.sql
```

Sau khi chạy staging cần kiểm:

- Roles có đủ `ADMIN`, `CEO`, `COO`, `DEPARTMENT_HEAD`, `EMPLOYEE`.
- Legacy roles vẫn còn `PROJECT_COORDINATOR`, `CEO_READONLY`.
- `people.manager_id` tồn tại.
- `profiles.username` tồn tại.
- Quang/Admin test vẫn login được.

## Data Test Tối Thiểu Cho Phase 2

Cần các user QA:

| User | Role | Mục đích |
|---|---|---|
| `rbac_admin_qa` | `ADMIN` | Tạo/sửa/khóa user |
| `rbac_head_qa` | `DEPARTMENT_HEAD` | Test phòng ban |
| `rbac_employee_qa` | `EMPLOYEE` | Test chỉ thấy việc của mình |

Cần dữ liệu test:

- 1 department QA.
- 1 project QA.
- 1 workstream QA thuộc department QA.
- 2 task QA: một task giao cho employee QA, một task giao cho người khác.
- 1 deliverable QA chờ duyệt.

Tất cả nên dùng prefix:

```text
RBAC_QA_
```

## Checklist Trước Khi Làm Phase 2

| Check | Trạng thái |
|---|---|
| Có staging Supabase ref riêng | Chưa |
| `.env.local` trỏ staging, không trỏ production | Chưa |
| Storage bucket staging có sẵn | Chưa |
| RBAC migration chạy trên staging | Chưa |
| Auth user QA tạo trên staging | Chưa |
| Không dùng production service role key | Bắt buộc |
| Local guard vẫn bật | Bắt buộc |

## Không Được Làm

- Không test tạo user trên production.
- Không reset mật khẩu production user để test.
- Không chạy migration RBAC trên production.
- Không import data thật công ty sang staging nếu chưa ẩn thông tin.
- Không hard-delete production user/data.
- Không push/deploy Phase 2 nếu chưa test bằng staging.

## Tài Liệu Tham Khảo

- Supabase Branching: https://supabase.com/docs/guides/deployment/branching
- Supabase Local Development: https://supabase.com/docs/guides/local-development/overview
- Supabase CLI DB Dump: https://supabase.com/docs/reference/cli/supabase-db-dump

