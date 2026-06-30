# HƯỚNG DẪN CODE APP — VYVY WORKOS V2 (cho Claude Code)

Mục tiêu: hướng dẫn **cách viết code** để build app đúng, nhất quán, nối Supabase thật. Đọc kèm `HANDOVER_FOR_CLAUDE_CODE.md` (trạng thái + DB) và `VYVY_WORKOS_V2_DATABASE_SPEC.md`.

> Nguyên tắc số 1: KHÔNG fake. Không số liệu giả, không toast success khi chưa lưu, không AI giả (rule engine), không màn hình rời không nối dữ liệu. Mọi view đọc từ **cùng bảng nguồn** Supabase.

---

## 1. TECH STACK & NGUYÊN TẮC

- Next.js 16 **App Router**, React 19, TypeScript strict, **Tailwind** (nếu chưa có, dùng CSS variables thuần).
- **Server Components mặc định** để fetch dữ liệu (bảo mật, nhanh). Chỉ `'use client'` khi cần tương tác (drag, drawer, filter, toggle).
- **Mọi truy cập DB qua lớp `src/lib/db/*`** (không gọi Supabase rải rác trong component).
- **3 loại Supabase client** (đã có `src/lib/supabase/`):
  - `client.ts` → browser (client components), dùng publishable key, RLS theo user đăng nhập.
  - `server.ts` → server components / route handlers, đọc cookie session (RLS theo user). **Đây là mặc định cho fetch.**
  - `service.ts` (CẦN TẠO) → chỉ dùng trong API route/server action khi cần bypass RLS (vd job hệ thống). **Khi dùng service role phải tự kiểm tra session + role thủ công.**

```ts
// src/lib/supabase/service.ts — CHỈ DÙNG SERVER, KHÔNG import vào client
import { createClient } from '@supabase/supabase-js'
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,   // đặt trong .env.local, KHÔNG NEXT_PUBLIC
    { auth: { persistSession: false } },
  )
}
```

---

## 2. CẤU TRÚC THƯ MỤC

```
src/
  app/
    (auth)/login/page.tsx           # trang đăng nhập
    command-center/page.tsx         # server component: fetch + render view
    projects/page.tsx
    projects/[projectId]/page.tsx
    meetings/ ... (mỗi module 1 route)
    api/<module>/route.ts           # (tùy chọn) nếu cần endpoint riêng
  features/<module>/
    <Module>View.tsx                # client component chính
    components/*                    # UI con
    types.ts                        # view-model types (camelCase)
    utils.ts                        # tính toán thuần (KPI, sort, health…)
  lib/
    supabase/{client,server,service}.ts
    db/<module>.ts                  # query + mutation cho module (server-only)
    database.types.ts               # type sinh từ Supabase (xem §3)
    mappers.ts                      # map row DB (snake_case) -> view-model (camelCase)
  components/ui|layout|...          # design system dùng chung
  styles/                          # token Ivory, theme
```

---

## 3. TYPE TỪ DATABASE (bắt buộc, tránh `any`)

Sinh type từ schema thật rồi map sang view-model:
```bash
npx supabase gen types typescript --project-id tgmnkqcxucxpnhhsggug > src/lib/database.types.ts
```
- DB là **snake_case** (`full_name`, `due_date`, `response_status`, `health_status`…). View-model trong `features/*/types.ts` là **camelCase** (`fullName`, `dueDate`…).
- Viết **mapper** rõ ràng trong `src/lib/mappers.ts` (KHÔNG dùng `any` rải rác như `live-data.ts` hiện tại). Lưu ý map enum khác tên:
  - `reminders.response_status`: DB `NOT_REMINDERED/REMINDERED/VIEWED/WAITING_RESPONSE/PROMISED_DELIVERY/DEADLINE_EXTENSION_REQUESTED/FILE_SUBMITTED/NO_RESPONSE/ESCALATED/CLOSED` → map về type app.
  - Cột khác tên (đã ghi trong SETUP_SUPABASE.md): `deliverables.name` (không phải title), `deliverables.submitter_id`, `approvals.requested_by`, `approvals.due_at`, `reminders.reminder_level`, `tasks.waiting_for_content`, `ceo_decision_requests.context/delay_impact`.

---

## 4. LỚP DB — MẪU CHUẨN (mỗi module 1 file)

```ts
// src/lib/db/commandCenter.ts  (server-only)
import { createClient } from '@/lib/supabase/server'

export async function getCommandCenterData(workspaceId: string) {
  const sb = await createClient()                       // RLS theo user đăng nhập
  const [people, projects, tasks, meetings, deliverables, approvals, reminders, ceo] =
    await Promise.all([
      sb.from('people').select('id,full_name,job_title,department:departments(name)').eq('workspace_id', workspaceId),
      sb.from('projects').select('id,name,code,health_status').eq('workspace_id', workspaceId).is('deleted_at', null),
      sb.from('tasks').select('id,title,owner_id,project_id,due_date,status,priority,waiting_for_content').eq('workspace_id', workspaceId).is('deleted_at', null),
      sb.from('meetings').select('id,title,start_at,status,project_id').eq('workspace_id', workspaceId),
      sb.from('deliverables').select('id,name,task_id,project_id,submitter_id,due_date,status,type').eq('workspace_id', workspaceId),
      sb.from('approvals').select('id,task_id,deliverable_id,project_id,requested_by,approver_id,status,due_at,requested_at').eq('workspace_id', workspaceId),
      sb.from('reminders').select('id,person_id,task_id,deliverable_id,reminder_level,response_status,next_follow_up_at,last_reminded_at').eq('workspace_id', workspaceId),
      sb.from('ceo_decision_requests').select('id,title,project_id,context,recommendation,delay_impact,decision_due_at,status').eq('workspace_id', workspaceId),
    ])
  // throw nếu lỗi: if (tasks.error) throw tasks.error ...
  return { people: people.data ?? [], /* ... */ }
}
```
- **Luôn `.eq('workspace_id', ...)` và `.is('deleted_at', null)`** cho bảng soft-delete.
- Ưu tiên **server client (RLS)**. Chỉ dùng API route + service role nếu thật sự cần (và phải check session/role trong route).

### Server component page (mẫu)
```tsx
// src/app/command-center/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getCommandCenterData } from '@/lib/db/commandCenter'
import { toCommandCenterVM } from '@/lib/mappers'
import { CommandCenterView } from '@/features/command-center/CommandCenterView'

export default async function Page() {
  const sb = await createClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) redirect('/login')
  const { data: m } = await sb.from('workspace_memberships')
    .select('workspace_id, role:roles(code)').eq('is_active', true).maybeSingle()
  if (!m) redirect('/login')
  const raw = await getCommandCenterData(m.workspace_id)
  const vm = toCommandCenterVM(raw)                 // map + computeKPI/priority/COO
  return <CommandCenterView data={vm} role={m.role.code} />
}
```
→ Bỏ dần cơ chế mock/`useCommandCenterData` khi đã có dữ liệu thật; mock chỉ giữ làm fallback dev.

---

## 5. MUTATION + AUDIT + COMPLETION GATE (server actions)

```ts
'use server'
import { createClient } from '@/lib/supabase/server'

export async function setTaskStatus(taskId: string, status: string) {
  const sb = await createClient()
  const { error } = await sb.from('tasks').update({ status }).eq('id', taskId)
  if (error) {
    // DB trigger trả 'GATE: ...' khi vi phạm completion gate
    if (error.message.startsWith('GATE:')) return { ok: false, reason: error.message }
    throw error
  }
  return { ok: true }
}
```
- **Optimistic update + rollback** ở client: cập nhật UI ngay, nếu `ok:false` thì bật về trạng thái cũ + toast lý do (KHÔNG toast success khi lỗi).
- Ghi `audit_logs`/`activity_logs` cho đổi owner/deadline/status/file/approval (server action insert thêm bản ghi).
- WAITING: form bắt buộc 4 trường; BLOCKED: blocker + owner — validate trước khi update.

---

## 6. AUTH (bắt buộc để RLS cho đọc projects/tasks)

- `middleware.ts` ở root: refresh session bằng `@supabase/ssr` (theo doc Supabase Next.js). Chưa đăng nhập → redirect `/login`.
- `/login`: form email+password → `supabase.auth.signInWithPassword`. Đăng xuất ở menu user.
- Sau đăng nhập, lấy `workspace_memberships` để biết `workspace_id` + `role`. Gate UI theo role; **chặn ghi ở server** (RLS đã làm: CEO_READONLY không ghi).
- Tài khoản: tạo trong Supabase Auth; nối `profiles.auth_user_id`, `workspace_memberships.role`, `people.profile_id` (xem SETUP_SUPABASE.md §6). Quang=ADMIN, Phúc=CEO_READONLY.

---

## 7. TỪNG MODULE (route → query → view)

| Route | Query chính (bảng) | View phải có |
| --- | --- | --- |
| `/command-center` | tasks, meetings, approvals, reminders, deliverables, ceo_decision_requests, people | KPI click-to-filter, priority list (rule sort), Cần dí, Cam kết sau họp, Hồ sơ bàn giao đủ?, Escalation ladder, Cần báo CEO, Nhật ký, COO summary |
| `/meetings` | meetings(+attendees), meeting_minutes, meeting_decisions, meeting_task_drafts | list trái / chi tiết giữa / checklist sau họp phải; preview biên bản KHÔNG ghi DB tự động |
| `/task-inbox` | meeting_task_drafts | tabs thiếu owner/deadline/deliverable/trùng/sẵn sàng; import tạo `tasks` thật, set `imported_task_id`; chặn import nếu thiếu |
| `/follow-ups` | reminders, reminder_logs, reminder_templates, escalation_rules | bảng cần dí, lịch sử, **wizard Messenger gđ1**: copy → mở URL → "Xác nhận đã gửi" (mới log) → chọn thời gian chờ; hết hạn quay lại cần dí |
| `/projects` | projects (+ v_project_progress, counts) | bảng điều hành; health NO_DATA khi trống |
| `/projects/[id]` | tasks, workstreams, milestones, deliverables, dependencies, approvals | tabs; **Kanban kéo-thả** (drop→Done validate gate, rollback); **Gantt** (hierarchy, dependency, milestone, today line) |
| `/approvals` | approvals(+actions) | nhóm theo cấp/quá hạn; approve/reject/revision cần comment + audit |
| `/deliverables` | deliverables, deliverable_versions, attachments | bảng + versions (nộp lại = version mới); REVISION_REQUIRED khóa task |
| `/calendar` | meetings, tasks(due), milestones, approvals, reminders | Ngày/Tuần/Tháng/Gantt; màu theo loại; TZ Asia/Ho_Chi_Minh |
| `/ceo-reports` | report_snapshots(+items), ceo_decision_requests | Morning/EOD/Weekly + Decision Queue; snapshot bất biến; print/PDF |
| `/team-workload` | v_team_workload, people, tasks | tải việc theo trọng số (không chỉ đếm task) |
| `/settings` | workspace_settings, reminder_templates, escalation_rules, roles | mẫu nhắc, giờ yên lặng, TZ, escalation, theme |

Mọi panel: **loading skeleton / empty riêng / error + retry**. Không success giả.

---

## 8. DESIGN SYSTEM (Ivory) — tham chiếu `outputs/vyvy-workos-midnight.html`

```css
:root{
  --bg:#F1EDE4; --surface:#FFFFFF; --surface-2:#F4F0E7; --surface-3:#E8E3D6; --sidebar:#191919;
  --line:rgba(25,25,25,.10); --txt:#191919; --txt-2:#5C564C; --txt-3:#8C8278;
  --lime:#DADF21; --lime-d:#7E8312; --olive:#2D331A;
  --success:#4A8C5C; --warning:#C47B2B; --danger:#B84040; --waiting:#6B8A99;
}
html[data-theme="dark"]{ --bg:#0A0B0D; --surface:#15171B; --txt:#EDEFF2; ... }  /* toggle Sáng/Tối */
```
- Heading **serif (Fraunces)**; bảng/form **sans (Inter)**; mã/version/timestamp **mono**.
- **Lime ≤8%**, chỉ ở CTA chính / menu active / focus / 1 điểm nhấn. KHÔNG lime cho progress/badge/icon/tab thường.
- Tỉ lệ: 65–70% ivory, 20–25% charcoal/olive, 5–8% lime, 3–5% trạng thái.
- Lấy lại từ prototype: Page Header (icon box + serif title), toggle Sáng/Tối, hiệu ứng chuyển view (radar/khóa mục tiêu), Gantt, hover 3D — port sang component React, tôn trọng `prefers-reduced-motion`.

---

## 9. CHUẨN CHẤT LƯỢNG (mỗi PR)
- Lint 0, type 0 (KHÔNG `any` bừa), build pass, console sạch.
- Mỗi màn: ảnh thật 1440/1280/1024; có loading/empty/error.
- Dữ liệu từ Supabase thật (không mock) sau khi đăng nhập.
- RLS: thử gọi API trực tiếp với vai trò CEO → bị chặn ghi.
- KHÔNG đụng project production cũ `qawvbthxjvuojsdqjavw`.

## 10. ANTI-PATTERN (cấm)
`any` tràn lan · gọi Supabase trực tiếp trong component · service role ở client · bypass RLS không check role · số liệu/AI/success giả · ghi đè file thay vì version · hiển thị "tốt" cho dự án NO_DATA · hard-code secret.

---

## 11. THỨ TỰ LÀM ĐỀ NGHỊ
1. `npm install`; tạo `service.ts`; sinh `database.types.ts`; viết `mappers.ts`.
2. Auth + middleware + tài khoản Quang/Phúc.
3. Chuyển `/command-center` sang server component đọc DB thật (bỏ mock).
4. Seed dữ liệu mẫu (projects/tasks/...) nếu chưa, để màn có data.
5. Lần lượt các module §7 (mỗi module: db query → server page → client view → states → ảnh → nghiệm thu → dừng).
6. Áp design Ivory + theme toggle.
7. Deploy Vercel (env).
```
