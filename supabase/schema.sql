-- =====================================================================
-- VYVY WORKOS V2 — DATABASE SCHEMA (bám VYVY_WORKOS_V2_DATABASE_SPEC.md)
-- TRẠNG THÁI: ĐỀ XUẤT — chưa chạy. Chờ người dùng duyệt rồi mới migration.
-- Đa workspace · soft-delete + cột audit · source of truth dùng chung mọi view.
-- =====================================================================

-- ----------------------------- ENUMS --------------------------------
create type project_health    as enum ('NO_DATA','ON_TRACK','WARNING','AT_RISK','CRITICAL');
create type task_status        as enum ('NOT_STARTED','IN_PROGRESS','WAITING','BLOCKED','PENDING_APPROVAL','REVISION_REQUIRED','COMPLETED','CANCELLED');
create type deliverable_status as enum ('REQUIRED','NOT_SUBMITTED','SUBMITTED','MISSING_INFORMATION','REVISION_REQUIRED','APPROVED');
create type approval_status    as enum ('NOT_REQUESTED','PENDING','PENDING_REVIEW','APPROVED','REJECTED','REVISION_REQUESTED','CANCELLED','UPLOADED_BY_MISTAKE','SUPERSEDED');
create type reminder_response  as enum ('NOT_REMINDERED','REMINDERED','VIEWED','WAITING_RESPONSE','PROMISED_DELIVERY','DEADLINE_EXTENSION_REQUESTED','FILE_SUBMITTED','NO_RESPONSE','ESCALATED','CLOSED');
create type priority_level     as enum ('LOW','MEDIUM','HIGH','CRITICAL');
create type dependency_type    as enum ('FINISH_TO_START','START_TO_START','FINISH_TO_FINISH','START_TO_FINISH');
create type assignment_role    as enum ('OWNER','SUPPORTER','REVIEWER','WATCHER');
create type change_type        as enum ('SCOPE','DEADLINE','BUDGET','OWNER','DELIVERABLE');
create type report_type        as enum ('MORNING_BRIEF','END_OF_DAY_RECAP','WEEKLY_OPERATING_REPORT');

-- =====================================================================
-- 2. TỔ CHỨC, NGƯỜI DÙNG, PHÂN QUYỀN
-- =====================================================================
create table workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null, slug text unique, timezone text default 'Asia/Ho_Chi_Minh',
  status text default 'active',
  created_at timestamptz default now(), created_by uuid,
  updated_at timestamptz default now(), updated_by uuid,
  deleted_at timestamptz, deleted_by uuid
);

create table profiles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade,
  auth_user_id uuid unique references auth.users(id) on delete cascade,
  display_name text not null, avatar_url text, status text default 'active',
  created_at timestamptz default now(), updated_at timestamptz default now()
);

create table departments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null, code text, head_person_id uuid, status text default 'active',
  created_at timestamptz default now(), updated_at timestamptz default now(), deleted_at timestamptz
);

create table people (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  profile_id uuid references profiles(id) on delete set null,
  department_id uuid references departments(id) on delete set null,
  full_name text not null, job_title text, email text, phone text,
  facebook_url text, messenger_url text, status text default 'active',
  created_at timestamptz default now(), updated_at timestamptz default now(), deleted_at timestamptz
);
alter table departments add constraint fk_dept_head foreign key (head_person_id) references people(id) on delete set null;

create table roles (
  id uuid primary key default gen_random_uuid(),
  code text unique not null, name text not null, description text
);
insert into roles(code,name) values ('ADMIN','Quản trị'),('PROJECT_COORDINATOR','Điều phối dự án'),('CEO_READONLY','CEO chỉ xem');

create table workspace_memberships (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  role_id uuid not null references roles(id),
  is_active boolean default true, joined_at timestamptz default now(),
  unique (workspace_id, profile_id)
);

create table role_permissions (
  id uuid primary key default gen_random_uuid(),
  role_id uuid references roles(id) on delete cascade,
  resource text not null, action text not null, allowed boolean default true
);

create table user_preferences (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references profiles(id) on delete cascade,
  sidebar_collapsed boolean default false,
  quiet_hours_start time, quiet_hours_end time,
  default_view text, locale text default 'vi', timezone text default 'Asia/Ho_Chi_Minh',
  preferences_json jsonb default '{}'
);

create table workspace_settings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid unique references workspaces(id) on delete cascade,
  timezone text default 'Asia/Ho_Chi_Minh', working_days text default 'Mon-Fri',
  working_hours text default '08:00-17:00',
  default_reminder_policy jsonb, default_escalation_policy jsonb,
  file_size_limit_mb int default 25, settings_json jsonb default '{}'
);

-- =====================================================================
-- 3. DỰ ÁN -> WORKSTREAM -> TASK -> STEP
-- =====================================================================
create table projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null, code text, description text,
  owner_id uuid references people(id) on delete set null,
  department_id uuid references departments(id) on delete set null,
  status text default 'active', priority priority_level default 'MEDIUM',
  start_date date, due_date date, budget numeric, currency text default 'VND',
  health_status project_health default 'NO_DATA',
  created_at timestamptz default now(), created_by uuid,
  updated_at timestamptz default now(), updated_by uuid,
  deleted_at timestamptz, deleted_by uuid
);

create table project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  person_id uuid not null references people(id) on delete cascade,
  project_role text, joined_at timestamptz default now(), left_at timestamptz,
  unique (project_id, person_id)
);

create table workstreams (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  name text not null, description text, owner_id uuid references people(id) on delete set null,
  status text default 'active', priority priority_level default 'MEDIUM',
  start_date date, due_date date, sort_order int default 0,
  created_at timestamptz default now(), updated_at timestamptz default now(), deleted_at timestamptz
);

create table milestones (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  workstream_id uuid references workstreams(id) on delete set null,
  name text not null, description text, due_date date, status text default 'open',
  is_critical boolean default false, owner_id uuid references people(id) on delete set null,
  created_at timestamptz default now(), updated_at timestamptz default now(), deleted_at timestamptz
);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  workstream_id uuid references workstreams(id) on delete set null,
  parent_task_id uuid references tasks(id) on delete set null,
  source_meeting_id uuid, source_decision_id uuid,         -- FK thêm sau (mục 4)
  title text not null, description text, expected_result text,
  owner_id uuid references people(id) on delete set null,
  status task_status default 'NOT_STARTED', priority priority_level default 'MEDIUM',
  start_date date, due_date date, progress int default 0 check (progress between 0 and 100),
  estimated_minutes int,
  -- WAITING bắt buộc 4 trường:
  waiting_for_person_id uuid references people(id) on delete set null,
  waiting_reason text, waiting_for_content text, follow_up_at timestamptz,
  -- BLOCKED:
  blocked_reason text, blocked_by_task_id uuid references tasks(id) on delete set null,
  blocker_owner_id uuid references people(id) on delete set null,
  created_at timestamptz default now(), created_by uuid,
  updated_at timestamptz default now(), updated_by uuid,
  deleted_at timestamptz, deleted_by uuid
);

create table task_steps (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  task_id uuid not null references tasks(id) on delete cascade,
  title text not null, description text, owner_id uuid references people(id) on delete set null,
  status task_status default 'NOT_STARTED', priority priority_level default 'MEDIUM',
  start_date date, due_date date, is_required boolean default true, sort_order int default 0,
  created_at timestamptz default now(), updated_at timestamptz default now(), deleted_at timestamptz
);

create table task_assignees (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  person_id uuid not null references people(id) on delete cascade,
  assignment_role assignment_role not null default 'OWNER',
  unique (task_id, person_id, assignment_role)
);

create table task_dependencies (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  depends_on_task_id uuid not null references tasks(id) on delete cascade,
  dependency_type dependency_type default 'FINISH_TO_START',
  created_at timestamptz default now(),
  unique (task_id, depends_on_task_id)
);

create table task_checklist_items (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references tasks(id) on delete cascade,
  step_id uuid references task_steps(id) on delete cascade,
  content text not null, is_required boolean default false, is_completed boolean default false,
  completed_by uuid references people(id) on delete set null, completed_at timestamptz,
  sort_order int default 0, created_at timestamptz default now(), updated_at timestamptz default now()
);

create table task_status_history (   -- LỊCH SỬ: không sửa/xóa từ UI
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  from_status task_status, to_status task_status not null,
  changed_by uuid references people(id) on delete set null,
  changed_at timestamptz default now(), reason text
);

-- =====================================================================
-- 4. HỌP -> BIÊN BẢN -> QUYẾT ĐỊNH -> TASK DRAFT
-- =====================================================================
create table meetings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  title text not null, meeting_type text, start_at timestamptz, end_at timestamptz,
  location text, online_meeting_url text, organizer_id uuid references people(id) on delete set null,
  status text default 'scheduled', objective text,
  created_at timestamptz default now(), created_by uuid,
  updated_at timestamptz default now(), updated_by uuid, deleted_at timestamptz
);

create table meeting_attendees (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references meetings(id) on delete cascade,
  person_id uuid not null references people(id) on delete cascade,
  attendance_status text default 'invited', role text,
  unique (meeting_id, person_id)
);

create table meeting_minutes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  meeting_id uuid not null references meetings(id) on delete cascade,
  summary text, conclusions text, raw_content text, transcript text,
  created_by uuid references people(id) on delete set null,
  approval_status approval_status default 'NOT_REQUESTED',
  approved_by uuid references people(id) on delete set null, approved_at timestamptz,
  created_at timestamptz default now(), updated_at timestamptz default now()
);

create table meeting_decisions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  meeting_id uuid not null references meetings(id) on delete cascade,
  content text not null, decided_by uuid references people(id) on delete set null,
  decision_date date, status text default 'open', implementation_status text default 'not_started',
  created_at timestamptz default now(), updated_at timestamptz default now()
);

create table meeting_task_drafts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  meeting_id uuid references meetings(id) on delete set null,
  decision_id uuid references meeting_decisions(id) on delete set null,
  title text not null, description text,
  suggested_project_id uuid references projects(id) on delete set null,
  suggested_workstream_id uuid references workstreams(id) on delete set null,
  suggested_owner_id uuid references people(id) on delete set null,
  suggested_due_date date, suggested_deliverable text, confidence numeric,
  duplicate_candidate_task_id uuid references tasks(id) on delete set null,
  import_status text default 'pending', imported_task_id uuid references tasks(id) on delete set null,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
-- gắn FK nguồn họp/quyết định cho tasks (vòng tham chiếu nên thêm ở đây)
alter table tasks add constraint fk_task_meeting  foreign key (source_meeting_id)  references meetings(id) on delete set null;
alter table tasks add constraint fk_task_decision foreign key (source_decision_id) references meeting_decisions(id) on delete set null;

-- =====================================================================
-- 5. FILE / BÁO CÁO / BÀN GIAO
-- =====================================================================
create table attachments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  storage_mode text default 'supabase',
  storage_path text not null, file_name text, mime_type text, size_bytes bigint, checksum text,
  uploaded_by uuid references people(id) on delete set null, uploaded_at timestamptz default now(), deleted_at timestamptz
);

create table deliverables (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  task_id uuid references tasks(id) on delete cascade,
  step_id uuid references task_steps(id) on delete set null,
  name text not null, description text, type text, required_format text,
  submitter_id uuid references people(id) on delete set null,
  reviewer_id uuid references people(id) on delete set null,
  due_date date, status deliverable_status default 'REQUIRED', is_required boolean default true,
  approved_version_id uuid,
  created_at timestamptz default now(), created_by uuid,
  updated_at timestamptz default now(), updated_by uuid, deleted_at timestamptz
);

create table deliverable_versions (
  id uuid primary key default gen_random_uuid(),
  deliverable_id uuid not null references deliverables(id) on delete cascade,
  storage_mode text default 'supabase',
  version_number int not null, attachment_id uuid references attachments(id) on delete set null,
  external_url text, submitted_by uuid references people(id) on delete set null,
  submitted_at timestamptz default now(), change_note text,
  review_status approval_status default 'PENDING', review_comment text,
  reviewed_by uuid references people(id) on delete set null, reviewed_at timestamptz,
  unique (deliverable_id, version_number)
);
alter table deliverables add constraint fk_deliv_approved_version foreign key (approved_version_id) references deliverable_versions(id) on delete set null;

-- =====================================================================
-- 6. PHÊ DUYỆT
-- =====================================================================
create table approvals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  task_id uuid references tasks(id) on delete cascade,
  step_id uuid references task_steps(id) on delete set null,
  deliverable_id uuid references deliverables(id) on delete cascade,
  requested_by uuid references people(id) on delete set null,
  approver_id uuid references people(id) on delete set null,
  status approval_status default 'PENDING', requested_at timestamptz default now(),
  due_at date, completed_at timestamptz, is_required boolean default true,
  created_at timestamptz default now(), updated_at timestamptz default now()
);

create table approval_actions (   -- LỊCH SỬ
  id uuid primary key default gen_random_uuid(),
  approval_id uuid not null references approvals(id) on delete cascade,
  action text not null, actor_id uuid references people(id) on delete set null,
  comment text, created_at timestamptz default now()
);

-- =====================================================================
-- 7. NHẮC VIỆC / MESSENGER / ESCALATION
-- =====================================================================
create table reminders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  task_id uuid references tasks(id) on delete cascade,
  deliverable_id uuid references deliverables(id) on delete cascade,
  person_id uuid not null references people(id) on delete cascade,
  channel text default 'messenger', reminder_level int default 1,
  next_follow_up_at timestamptz, response_status reminder_response default 'NOT_REMINDERED',
  status text default 'open', last_reminded_at timestamptz,
  created_at timestamptz default now(), updated_at timestamptz default now()
);

create table reminder_logs (   -- LỊCH SỬ
  id uuid primary key default gen_random_uuid(),
  reminder_id uuid not null references reminders(id) on delete cascade,
  sent_by uuid references people(id) on delete set null, channel text,
  message_content text, sent_at timestamptz default now(),
  confirmed_sent boolean default false, result reminder_response,
  follow_up_at timestamptz, created_at timestamptz default now()
);

create table reminder_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  template_type text not null, title text, body text, is_active boolean default true,
  created_at timestamptz default now(), updated_at timestamptz default now()
);

create table escalation_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  trigger_type text, after_hours int, after_reminder_count int,
  next_level text, target_role text, is_active boolean default true,
  created_at timestamptz default now(), updated_at timestamptz default now()
);

-- =====================================================================
-- 8. RỦI RO / VẤN ĐỀ / THAY ĐỔI / CẬP NHẬT
-- =====================================================================
create table risks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  title text not null, description text, probability text, impact text, severity priority_level default 'MEDIUM',
  owner_id uuid references people(id) on delete set null, mitigation_plan text, status text default 'open',
  created_at timestamptz default now(), updated_at timestamptz default now(), deleted_at timestamptz
);

create table issues (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  task_id uuid references tasks(id) on delete set null,
  title text not null, description text, severity priority_level default 'MEDIUM',
  owner_id uuid references people(id) on delete set null, resolution text, status text default 'open',
  created_at timestamptz default now(), updated_at timestamptz default now(), deleted_at timestamptz
);

create table change_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  task_id uuid references tasks(id) on delete set null,
  change_type change_type not null, old_value text, new_value text, reason text,
  requested_by uuid references people(id) on delete set null,
  approver_id uuid references people(id) on delete set null, status approval_status default 'PENDING',
  created_at timestamptz default now(), updated_at timestamptz default now()
);

create table project_updates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  reporting_period text, summary text, progress int, health_status project_health,
  created_by uuid references people(id) on delete set null, created_at timestamptz default now()
);

-- =====================================================================
-- 9. CEO & BÁO CÁO
-- =====================================================================
create table ceo_decision_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  title text not null, context text, options jsonb, recommendation text,
  decision_due_at date, delay_impact text, status text default 'open',
  final_decision text, decided_by uuid references people(id) on delete set null, decided_at timestamptz,
  follow_up_owner_id uuid references people(id) on delete set null,
  created_at timestamptz default now(), updated_at timestamptz default now()
);

create table report_snapshots (   -- bất biến sau khi phát hành
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  report_type report_type not null, period_start date, period_end date,
  generated_by uuid references people(id) on delete set null,
  published_at timestamptz default now(), snapshot_data jsonb not null, created_at timestamptz default now()
);

create table report_snapshot_items (
  id uuid primary key default gen_random_uuid(),
  report_snapshot_id uuid not null references report_snapshots(id) on delete cascade,
  section text, entity_type text, entity_id uuid, content text, sort_order int default 0
);

-- =====================================================================
-- 10. BÌNH LUẬN / THÔNG BÁO / LỊCH SỬ / SAVED VIEWS
-- =====================================================================
create table comments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  entity_type text not null, entity_id uuid not null, author_id uuid references people(id) on delete set null,
  content text not null, parent_comment_id uuid references comments(id) on delete set null,
  created_at timestamptz default now(), updated_at timestamptz default now(), deleted_at timestamptz
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  recipient_id uuid references people(id) on delete cascade,
  type text, entity_type text, entity_id uuid, title text, body text,
  is_read boolean default false, read_at timestamptz, created_at timestamptz default now()
);

create table activity_logs (   -- LỊCH SỬ
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  actor_id uuid references people(id) on delete set null,
  action text not null, entity_type text, entity_id uuid, metadata jsonb, created_at timestamptz default now()
);

create table audit_logs (   -- LỊCH SỬ bất biến
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  actor_id uuid references people(id) on delete set null,
  action text not null, entity_type text, entity_id uuid,
  before_data jsonb, after_data jsonb, ip_address text, user_agent text, created_at timestamptz default now()
);

create table saved_views (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  profile_id uuid references profiles(id) on delete cascade,
  module text not null, name text not null, filters jsonb, sort jsonb, columns jsonb,
  is_default boolean default false, created_at timestamptz default now(), updated_at timestamptz default now()
);

-- =====================================================================
-- 15. COMPLETION GATE (khóa hoàn thành ở DB, trả lý do cụ thể)
-- =====================================================================
create or replace function check_completion_gate() returns trigger language plpgsql as $$
declare
  missing_deliverable text;
  revision_deliverable text;
  pending_approval text;
begin
  if new.status = 'COMPLETED' and (old.status is distinct from 'COMPLETED') then
    if coalesce(new.expected_result,'') = '' then raise exception 'GATE: thiếu kết quả đầu việc'; end if;
    if new.blocked_reason is not null then raise exception 'GATE: task đang BLOCKED'; end if;
    select d.name into missing_deliverable
    from deliverables d
    where d.task_id = new.id and d.is_required and d.status in ('REQUIRED','NOT_SUBMITTED')
    order by d.due_date nulls last, d.created_at
    limit 1;
    if missing_deliverable is not null then
      raise exception 'GATE: Chưa thể hoàn thành vì còn thiếu file: %.', missing_deliverable;
    end if;
    select d.name into revision_deliverable
    from deliverables d
    where d.task_id = new.id and d.is_required and d.status in ('MISSING_INFORMATION','REVISION_REQUIRED')
    order by d.updated_at desc
    limit 1;
    if revision_deliverable is not null then
      raise exception 'GATE: Chưa thể hoàn thành vì file đã nộp đang bị yêu cầu sửa hoặc thiếu thông tin: %.', revision_deliverable;
    end if;
    if exists (select 1 from task_steps s where s.task_id = new.id and s.is_required and s.status <> 'COMPLETED')
      then raise exception 'GATE: còn step bắt buộc chưa xong'; end if;
    if exists (select 1 from task_checklist_items c where c.task_id = new.id and c.is_required and not c.is_completed)
      then raise exception 'GATE: checklist bắt buộc chưa xong'; end if;
    select coalesce(d.name, 'phê duyệt bắt buộc') into pending_approval
    from approvals a
    left join deliverables d on d.id = a.deliverable_id
    where a.task_id = new.id and a.is_required and a.status <> 'APPROVED'
    order by a.due_at nulls last, a.requested_at
    limit 1;
    if pending_approval is not null then
      raise exception 'GATE: Chưa thể hoàn thành vì phê duyệt bắt buộc đang chờ: %.', pending_approval;
    end if;
  end if;
  new.updated_at = now();
  return new;
end $$;
create trigger trg_completion_gate before update on tasks for each row execute function check_completion_gate();

-- ghi lịch sử đổi trạng thái task
create or replace function log_task_status() returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status then
    insert into task_status_history(task_id,from_status,to_status,changed_by) values (new.id,old.status,new.status,new.updated_by);
  end if;
  return new;
end $$;
create trigger trg_task_status_history after update on tasks for each row execute function log_task_status();

-- =====================================================================
-- 11. SQL VIEWS TỔNG HỢP (không tạo bảng dashboard riêng)
-- =====================================================================
create view v_overdue_items as
  select t.* from tasks t where t.deleted_at is null and t.due_date < current_date
   and t.status not in ('COMPLETED','CANCELLED');

create view v_pending_approvals as
  select a.* from approvals a where a.status = 'PENDING';

create view v_missing_deliverables as
  select d.* from deliverables d where d.deleted_at is null and d.is_required
   and d.status in ('REQUIRED','NOT_SUBMITTED','MISSING_INFORMATION','REVISION_REQUIRED');

create view v_follow_up_queue as
  select r.* from reminders r where r.status = 'open'
   and (r.next_follow_up_at is null or r.next_follow_up_at <= now());

create view v_ceo_attention_items as
  select c.* from ceo_decision_requests c where c.status = 'open';

create view v_team_workload as
  select p.id as person_id, p.full_name,
         count(t.id) filter (where t.status in ('IN_PROGRESS','WAITING','BLOCKED')) as active_tasks,
         count(t.id) filter (where t.due_date < current_date and t.status not in ('COMPLETED','CANCELLED')) as overdue_tasks
    from people p left join tasks t on t.owner_id = p.id and t.deleted_at is null
   group by p.id, p.full_name;

create view v_project_progress as
  select pr.id as project_id, pr.name, round(avg(coalesce(t.progress,0))) as progress
    from projects pr left join tasks t on t.project_id = pr.id and t.deleted_at is null
   group by pr.id, pr.name;

create view v_command_center_queue as
  select 'task'::text as kind, t.id, t.title, t.owner_id, t.project_id, t.due_date, t.status::text, t.priority::text
    from tasks t where t.deleted_at is null and t.status not in ('COMPLETED','CANCELLED')
  union all
  select 'approval', a.id, 'Phê duyệt', a.approver_id, a.project_id, a.due_at, a.status::text, null
    from approvals a where a.status = 'PENDING';
-- v_project_health & v_meeting_follow_ups: tính theo §16 (app/materialized view bổ sung).

-- =====================================================================
-- 17. INDEX
-- =====================================================================
create index on tasks(workspace_id);
create index on tasks(project_id);
create index on tasks(owner_id);
create index on tasks(status);
create index on tasks(due_date);
create index on tasks(deleted_at);
create index idx_tasks_ws_status_due on tasks(workspace_id, status, due_date);
create index on reminders(person_id);
create index idx_rem_ws_person_follow on reminders(workspace_id, person_id, next_follow_up_at);
create index on reminder_logs(reminder_id);
create index on deliverables(task_id);
create index idx_deliv_versions on deliverable_versions(deliverable_id, version_number);
create index on approvals(task_id);
create index on meetings(workspace_id);

-- =====================================================================
-- 18. RLS — theo workspace + vai trò (chặn ở server/DB)
-- =====================================================================
create or replace function app_role() returns text language sql stable as $$
  select r.code from workspace_memberships m
    join profiles p on p.id = m.profile_id
    join roles r on r.id = m.role_id
   where p.auth_user_id = auth.uid() and m.is_active limit 1
$$;
create or replace function app_workspace() returns uuid language sql stable as $$
  select m.workspace_id from workspace_memberships m
    join profiles p on p.id = m.profile_id
   where p.auth_user_id = auth.uid() and m.is_active limit 1
$$;

alter table projects enable row level security;
alter table tasks enable row level security;
alter table deliverables enable row level security;
alter table approvals enable row level security;
alter table reminders enable row level security;
alter table ceo_decision_requests enable row level security;
alter table project_updates enable row level security;
alter table audit_logs enable row level security;

create policy read_ws_projects on projects for select using (workspace_id = app_workspace());
create policy read_ws_tasks on tasks for select using (workspace_id = app_workspace());
create policy read_ws_deliv on deliverables for select using (workspace_id = app_workspace());
create policy read_ws_appr on approvals for select using (workspace_id = app_workspace());
create policy read_ws_rem on reminders for select using (workspace_id = app_workspace());
create policy read_ws_ceo on ceo_decision_requests for select using (workspace_id = app_workspace());
create policy read_ws_pu on project_updates for select using (workspace_id = app_workspace());

create policy write_tasks on tasks for all
  using (workspace_id = app_workspace() and app_role() in ('ADMIN','PROJECT_COORDINATOR'))
  with check (workspace_id = app_workspace() and app_role() in ('ADMIN','PROJECT_COORDINATOR'));
create policy write_projects on projects for all
  using (workspace_id = app_workspace() and app_role() in ('ADMIN','PROJECT_COORDINATOR'))
  with check (workspace_id = app_workspace() and app_role() in ('ADMIN','PROJECT_COORDINATOR'));
create policy write_deliv on deliverables for all
  using (workspace_id = app_workspace() and app_role() in ('ADMIN','PROJECT_COORDINATOR'))
  with check (workspace_id = app_workspace() and app_role() in ('ADMIN','PROJECT_COORDINATOR'));
create policy write_appr on approvals for all
  using (workspace_id = app_workspace() and app_role() in ('ADMIN','PROJECT_COORDINATOR'))
  with check (workspace_id = app_workspace() and app_role() in ('ADMIN','PROJECT_COORDINATOR'));
create policy write_rem on reminders for all
  using (workspace_id = app_workspace() and app_role() in ('ADMIN','PROJECT_COORDINATOR'))
  with check (workspace_id = app_workspace() and app_role() in ('ADMIN','PROJECT_COORDINATOR'));
create policy insert_audit on audit_logs for insert with check (workspace_id = app_workspace());

-- =====================================================================
-- HẾT. Bản ĐỀ XUẤT — chờ duyệt trước khi chạy migration thật.
-- =====================================================================
