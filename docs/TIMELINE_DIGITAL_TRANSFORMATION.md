# Timeline chuyển đổi số

## PR description

Thêm route `/timeline` để lập lịch và theo dõi 47 đầu việc chuyển đổi số theo người phụ trách. Tính năng dùng trực tiếp mô hình `projects → workstreams → tasks → task_steps`, Supabase và RBAC hiện có; không tạo API, database hay JSON store song song.

### Kiến trúc

- `src/app/timeline/page.tsx` là Server Component, resolve session/RBAC và tải dữ liệu ban đầu.
- `src/features/timeline/timelineService.ts` chỉ đọc project `Timeline chuyển đổi số`, hai workstream `Mục 6`/`Mục 9` và graph liên quan.
- Loader dùng service client sau khi đã resolve actor, luôn scope theo `workspace_id`, sau đó tái sử dụng `filterCommandCenterDataByUser()` để giữ cùng quy tắc visibility với Command Center.
- Mutation tái sử dụng `PATCH /api/workspace-items`; route hiện có tiếp tục chịu trách nhiệm cho local-production guard, RBAC, workspace scope, activity log và completion quality gate.
- UI dựng Gantt bằng CSS Grid, không thêm thư viện Gantt.
- `OverlayPortal + Drawer` được dùng cho panel chỉnh ngày để giữ đúng viewport và scroll lock hiện có.

### Quy ước dữ liệu

- `start_date` là ngày bắt đầu; `due_date` là hạn hoàn thành.
- Hai giá trị cùng `NULL` nghĩa là chưa lên lịch.
- Kéo một task chưa lên lịch vào ngày D tạo lịch một ngày: `start_date = due_date = D`. Người dùng mở panel để nhập khoảng ngày dài hơn.
- Row thiếu một trong hai đầu ngày được coi là chưa lên lịch để không biến mất khỏi Gantt; panel yêu cầu nhập đủ cả hai ngày hoặc xóa cả hai.
- Mốc “hôm nay” dùng ngày lịch Việt Nam (`UTC+7`). Grid chặn khoảng hiển thị tối đa trong phạm vi 365 ngày trước/sau hôm nay để một ngày dữ liệu lỗi không tạo hàng triệu cột.
- Timeline hiển thị đầy đủ `TaskStatus` hiện hành, nhưng seed khởi tạo `NOT_STARTED`.
- `COMPLETED` luôn được gửi thành mutation riêng để đi qua completion RPC/quality gate. Timeline không tạo bypass mới.
- Riêng `UNASSIGNED → COMPLETED` tái sử dụng confirm flow hiện có: cảnh báo rõ việc bỏ qua yêu cầu bàn giao và chỉ gọi bypass đã có sau khi người dùng xác nhận.
- `Mục 6` và `Mục 9` là hai `workstreams`; không thêm cột `phase`.
- Hai mảng `steps` trong dataset trở thành tám row `task_steps`.
- Hai trường gợi ý deadline được lưu vào `tasks.description`, không chuyển thành ngày thật.

## Seed dữ liệu

File seed:

`supabase/seeds/202607240001_seed_digital_transformation_timeline.sql`

Seed chưa được tự động chạy bởi migration. Cách làm này có chủ đích vì Vũ/Ân/Chi/Long là dữ liệu môi trường và phải được xác minh trên database đích.

Trong nhánh này seed chỉ được kiểm tra tĩnh (dataset, idempotency, preflight và postcondition); chưa được apply lên staging hoặc production.

### Trước khi chạy

1. Mở file seed và kiểm tra `v_workspace_slug` ở đầu block; mặc định là `vyvy`.
2. Chạy read-only query trên database đích để kiểm tra tên active trong `people`; xác nhận thủ công người có tên đầy đủ hoặc tên cuối lần lượt là Vũ, Ân, Chi, Long.
3. Đảm bảo mỗi nhãn Vũ, Ân, Chi, Long chỉ match đúng một người dự kiến trong workspace. Seed chỉ xét exact full name hoặc token tên cuối, rồi sẽ `RAISE EXCEPTION` và rollback toàn bộ nếu thiếu hoặc mơ hồ.
4. Không sửa dataset task trong file.

### Chạy

Chạy toàn bộ file trong Supabase Dashboard SQL Editor hoặc một PostgreSQL client đã được cấp quyền phù hợp.

Seed thực hiện trong một transaction và có advisory transaction lock. Nó:

- kiểm tra catalog/cột cần dùng trước mutation;
- tạo/reuse đúng một people row `Team / Nhóm chung`;
- tạo/reuse project `Timeline chuyển đổi số`;
- tạo/reuse hai workstream `Mục 6`, `Mục 9`;
- tạo thiếu 47 task và 8 step bằng deterministic UUID;
- không `UPDATE` hoặc `DELETE` row production đã có;
- không reset ngày, status hoặc description khi chạy lại;
- kiểm tra postcondition trước `COMMIT`.

Team được biểu diễn bằng people row bình thường vì schema hiện không có cờ group:

```text
full_name = Team / Nhóm chung
job_title = Nhóm phụ trách chung · Timeline chuyển đổi số
profile_id = NULL
department_id = NULL
```

## Chạy ứng dụng

```powershell
npm.cmd run dev
```

Sau khi đăng nhập, mở:

`http://localhost:3000/timeline`

Nếu local đang trỏ production Supabase, mutation sẽ tiếp tục bị local QA guard chặn trừ khi cấu hình server-side được bật theo quy trình QA hiện có.

## Kiểm tra

```powershell
npm.cmd run lint
npx.cmd tsc --noEmit
npm.cmd run test
npm.cmd run build
```

Unit test Timeline tập trung vào:

- date-only UTC, leap day và year boundary;
- schedule `NULL`, partial và range đảo;
- gán ngày bằng drop;
- horizon ngày/tuần;
- mapping status và filter theo owner/workstream/status.

## Giả định schema

- Bảng thật là `projects`, `workstreams`, `tasks`, `task_steps`, `people`.
- Project/workstream/task có soft-delete qua `deleted_at`.
- `people` không có `is_group` hoặc metadata nhóm.
- `projects.code` và tên/title các tầng không có unique constraint tự nhiên; seed vì vậy dùng deterministic UUID, natural-match guard và abort khi có duplicate mơ hồ.
- Loader không dùng deadline rollup: Timeline hiển thị trực tiếp `tasks.start_date` và `tasks.due_date`.
- User thường chỉ thấy graph nằm trong scope hiện hành. People row Team không có tài khoản đăng nhập; visibility của task Team vẫn theo project/task RBAC đang có.
