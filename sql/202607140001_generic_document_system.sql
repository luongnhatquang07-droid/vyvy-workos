-- DRAFT - DO NOT RUN ON STAGING OR PRODUCTION WITHOUT QUANG APPROVAL.
-- Generic Document System for Plan, Result, Report, SOP and reference documents.
-- Additive only: no DROP, DELETE, TRUNCATE or updates to existing business rows.

begin;

create table if not exists document_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  requires_approval boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint document_types_code_check check (length(trim(code)) > 0)
);

create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete restrict,
  document_type_id uuid not null references document_types(id),
  title text not null,
  description text,
  status text not null default 'ACTIVE',
  created_by uuid references people(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references people(id) on delete set null,
  updated_at timestamptz not null default now(),
  deleted_by uuid references people(id) on delete set null,
  deleted_at timestamptz,
  constraint documents_title_check check (length(trim(title)) > 0),
  constraint documents_status_check check (status in ('ACTIVE', 'ARCHIVED', 'REMOVED'))
);

create table if not exists document_targets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete restrict,
  document_id uuid not null references documents(id) on delete restrict,
  target_type text not null,
  target_id uuid not null,
  created_at timestamptz not null default now(),
  constraint document_targets_type_check
    check (target_type in ('PROJECT', 'WORKSTREAM', 'TASK', 'STEP', 'MEETING')),
  constraint document_targets_unique unique (document_id, target_type, target_id)
);

create table if not exists document_versions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete restrict,
  document_id uuid not null references documents(id) on delete restrict,
  version_number integer not null,
  status text not null default 'DRAFT',
  change_note text,
  submitted_by uuid references people(id) on delete set null,
  submitted_at timestamptz,
  created_by uuid references people(id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_by uuid references people(id) on delete set null,
  deleted_at timestamptz,
  constraint document_versions_number_check check (version_number > 0),
  constraint document_versions_status_check
    check (status in (
      'DRAFT', 'PUBLISHED', 'SUBMITTED', 'APPROVED', 'REJECTED',
      'REVISION_REQUESTED', 'WITHDRAWN', 'REMOVED'
    )),
  constraint document_versions_unique unique (document_id, version_number)
);

create table if not exists document_assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete restrict,
  document_version_id uuid not null references document_versions(id) on delete restrict,
  asset_type text not null,
  attachment_id uuid references attachments(id) on delete set null,
  external_url text,
  title text,
  comment text,
  created_by uuid references people(id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_by uuid references people(id) on delete set null,
  deleted_at timestamptz,
  constraint document_assets_type_check check (asset_type in ('FILE', 'LINK', 'COMMENT')),
  constraint document_assets_payload_check check (
    (asset_type = 'FILE' and attachment_id is not null and external_url is null) or
    (asset_type = 'LINK' and attachment_id is null and external_url is not null) or
    (asset_type = 'COMMENT' and attachment_id is null and external_url is null and comment is not null)
  )
);

create table if not exists document_approval_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete restrict,
  document_version_id uuid not null references document_versions(id) on delete restrict,
  approver_id uuid references people(id) on delete set null,
  status text not null default 'PENDING',
  approval_mode text not null default 'SINGLE',
  sequence_order integer,
  due_at timestamptz,
  completed_at timestamptz,
  created_by uuid references people(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint document_approval_status_check
    check (status in ('PENDING', 'APPROVED', 'REJECTED', 'REVISION_REQUESTED', 'CANCELLED')),
  constraint document_approval_mode_check
    check (approval_mode in ('SINGLE', 'SEQUENTIAL', 'PARALLEL'))
);

create table if not exists document_approval_actions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete restrict,
  approval_request_id uuid not null references document_approval_requests(id) on delete restrict,
  actor_id uuid references people(id) on delete set null,
  action text not null,
  comment text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint document_approval_action_check
    check (action in ('REQUESTED', 'APPROVED', 'REJECTED', 'REVISION_REQUESTED', 'COMMENTED', 'DELEGATED', 'CANCELLED'))
);

create table if not exists document_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete restrict,
  document_id uuid not null references documents(id) on delete restrict,
  document_version_id uuid references document_versions(id) on delete set null,
  actor_id uuid references people(id) on delete set null,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint document_events_type_check check (event_type in (
    'DOCUMENT_CREATED', 'VERSION_CREATED', 'VERSION_SUBMITTED',
    'APPROVAL_REQUESTED', 'APPROVED', 'REJECTED', 'REVISION_REQUESTED',
    'VERSION_WITHDRAWN', 'VERSION_REMOVED', 'COMMENT_ADDED'
  ))
);

create or replace function create_document_version(
  p_workspace_id uuid,
  p_document_type_code text,
  p_target_type text,
  p_target_id uuid,
  p_title text,
  p_asset_type text,
  p_document_id uuid default null,
  p_description text default null,
  p_change_note text default null,
  p_attachment_id uuid default null,
  p_external_url text default null,
  p_asset_title text default null,
  p_asset_comment text default null,
  p_actor_id uuid default null
)
returns table (
  created_document_id uuid,
  created_version_id uuid,
  created_asset_id uuid,
  created_version_number integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_document_type document_types%rowtype;
  v_document documents%rowtype;
  v_version_id uuid;
  v_asset_id uuid;
  v_version_number integer;
  v_version_status text;
begin
  if p_workspace_id is null or p_target_id is null then
    raise exception 'Workspace and target are required.';
  end if;
  if length(trim(coalesce(p_title, ''))) = 0 then
    raise exception 'Document title is required.';
  end if;
  if p_target_type not in ('PROJECT', 'WORKSTREAM', 'TASK', 'STEP', 'MEETING') then
    raise exception 'Unsupported document target type.';
  end if;
  if p_asset_type not in ('FILE', 'LINK', 'COMMENT') then
    raise exception 'Unsupported document asset type.';
  end if;

  select * into v_document_type
  from document_types
  where code = upper(trim(p_document_type_code))
    and is_active = true;
  if not found then
    raise exception 'Document type is not active.';
  end if;

  if p_actor_id is not null and not exists (
    select 1 from people
    where id = p_actor_id
      and workspace_id = p_workspace_id
      and deleted_at is null
  ) then
    raise exception 'Actor does not belong to workspace.';
  end if;

  if p_target_type = 'PROJECT' and not exists (
    select 1 from projects
    where id = p_target_id and workspace_id = p_workspace_id and deleted_at is null
  ) then
    raise exception 'Project target does not exist.';
  elsif p_target_type = 'WORKSTREAM' and not exists (
    select 1 from workstreams
    where id = p_target_id and workspace_id = p_workspace_id and deleted_at is null
  ) then
    raise exception 'Workstream target does not exist.';
  elsif p_target_type = 'TASK' and not exists (
    select 1 from tasks
    where id = p_target_id and workspace_id = p_workspace_id and deleted_at is null
  ) then
    raise exception 'Task target does not exist.';
  elsif p_target_type = 'STEP' and not exists (
    select 1 from task_steps
    where id = p_target_id and workspace_id = p_workspace_id and deleted_at is null
  ) then
    raise exception 'Step target does not exist.';
  elsif p_target_type = 'MEETING' and not exists (
    select 1 from meetings
    where id = p_target_id and workspace_id = p_workspace_id and deleted_at is null
  ) then
    raise exception 'Meeting target does not exist.';
  end if;

  if p_asset_type = 'FILE' then
    if p_attachment_id is null or p_external_url is not null then
      raise exception 'File asset requires one attachment.';
    end if;
    if not exists (
      select 1 from attachments
      where id = p_attachment_id and workspace_id = p_workspace_id and deleted_at is null
    ) then
      raise exception 'Attachment does not belong to workspace.';
    end if;
  elsif p_asset_type = 'LINK' then
    if p_attachment_id is not null or p_external_url is null or p_external_url !~* '^https?://' then
      raise exception 'Link asset requires a valid HTTP(S) URL.';
    end if;
  elsif length(trim(coalesce(p_asset_comment, ''))) = 0 then
    raise exception 'Comment asset requires content.';
  end if;

  if p_document_id is null then
    insert into documents (
      workspace_id, document_type_id, title, description, created_by, updated_by
    ) values (
      p_workspace_id, v_document_type.id, trim(p_title),
      nullif(trim(coalesce(p_description, '')), ''), p_actor_id, p_actor_id
    ) returning * into v_document;

    insert into document_targets (workspace_id, document_id, target_type, target_id)
    values (p_workspace_id, v_document.id, p_target_type, p_target_id);

    insert into document_events (
      workspace_id, document_id, actor_id, event_type, metadata
    ) values (
      p_workspace_id,
      v_document.id,
      p_actor_id,
      'DOCUMENT_CREATED',
      jsonb_build_object(
        'document_type', v_document_type.code,
        'target_type', p_target_type,
        'target_id', p_target_id
      )
    );
  else
    select * into v_document
    from documents
    where id = p_document_id
      and workspace_id = p_workspace_id
      and document_type_id = v_document_type.id
      and deleted_at is null
    for update;
    if not found then
      raise exception 'Document does not exist in this workspace.';
    end if;
    if not exists (
      select 1 from document_targets
      where document_id = v_document.id
        and workspace_id = p_workspace_id
        and target_type = p_target_type
        and target_id = p_target_id
    ) then
      raise exception 'Document target does not match.';
    end if;

    update documents
    set title = trim(p_title),
        description = nullif(trim(coalesce(p_description, '')), ''),
        updated_by = p_actor_id,
        updated_at = now()
    where id = v_document.id;
  end if;

  select coalesce(max(version_number), 0) + 1 into v_version_number
  from document_versions
  where document_id = v_document.id;

  v_version_status := case when v_document_type.requires_approval then 'DRAFT' else 'PUBLISHED' end;
  insert into document_versions (
    workspace_id, document_id, version_number, status, change_note,
    submitted_by, submitted_at, created_by
  ) values (
    p_workspace_id, v_document.id, v_version_number, v_version_status,
    nullif(trim(coalesce(p_change_note, '')), ''), p_actor_id, now(), p_actor_id
  ) returning id into v_version_id;

  insert into document_assets (
    workspace_id, document_version_id, asset_type, attachment_id,
    external_url, title, comment, created_by
  ) values (
    p_workspace_id, v_version_id, p_asset_type, p_attachment_id,
    p_external_url, nullif(trim(coalesce(p_asset_title, '')), ''),
    nullif(trim(coalesce(p_asset_comment, '')), ''), p_actor_id
  ) returning id into v_asset_id;

  insert into document_events (
    workspace_id, document_id, document_version_id, actor_id, event_type, metadata
  ) values (
    p_workspace_id,
    v_document.id,
    v_version_id,
    p_actor_id,
    'VERSION_CREATED',
    jsonb_build_object(
      'version_number', v_version_number,
      'status', v_version_status,
      'asset_type', p_asset_type
    )
  );

  return query select v_document.id, v_version_id, v_asset_id, v_version_number;
end;
$$;

revoke all on function create_document_version(
  uuid, text, text, uuid, text, text, uuid, text, text, uuid, text, text, text, uuid
) from public;
grant execute on function create_document_version(
  uuid, text, text, uuid, text, text, uuid, text, text, uuid, text, text, text, uuid
) to service_role;

insert into document_types (code, name, requires_approval)
values
  ('PROJECT_PLAN', 'Project Plan', false),
  ('WORKSTREAM_PLAN', 'Workstream Plan', false),
  ('SUBTASK_RESULT', 'Subtask Result', true),
  ('STEP_RESULT', 'Step Result', true),
  ('MEETING_MINUTES', 'Meeting Minutes', false),
  ('CEO_REPORT', 'CEO Report', false),
  ('QA_REPORT', 'QA Report', false),
  ('SOP', 'SOP', false),
  ('REFERENCE', 'Reference Document', false)
on conflict (code) do update set
  name = excluded.name,
  requires_approval = excluded.requires_approval,
  updated_at = now();

create index if not exists documents_workspace_type_idx
  on documents(workspace_id, document_type_id)
  where deleted_at is null;
create index if not exists document_targets_target_idx
  on document_targets(workspace_id, target_type, target_id);
create index if not exists document_targets_document_idx
  on document_targets(document_id);
create index if not exists document_versions_document_version_idx
  on document_versions(document_id, version_number desc)
  where deleted_at is null;
create index if not exists document_assets_version_idx
  on document_assets(document_version_id)
  where deleted_at is null;
create index if not exists document_approval_reviewer_status_idx
  on document_approval_requests(workspace_id, approver_id, status, due_at);
create index if not exists document_events_document_created_idx
  on document_events(document_id, created_at desc);

alter table document_types enable row level security;
alter table documents enable row level security;
alter table document_targets enable row level security;
alter table document_versions enable row level security;
alter table document_assets enable row level security;
alter table document_approval_requests enable row level security;
alter table document_approval_actions enable row level security;
alter table document_events enable row level security;

create policy document_types_read_authenticated
  on document_types for select to authenticated using (is_active = true);
create policy documents_read_workspace
  on documents for select to authenticated using (workspace_id = app_workspace());
create policy document_targets_read_workspace
  on document_targets for select to authenticated using (workspace_id = app_workspace());
create policy document_versions_read_workspace
  on document_versions for select to authenticated using (workspace_id = app_workspace());
create policy document_assets_read_workspace
  on document_assets for select to authenticated using (workspace_id = app_workspace());
create policy document_approval_requests_read_workspace
  on document_approval_requests for select to authenticated using (workspace_id = app_workspace());
create policy document_approval_actions_read_workspace
  on document_approval_actions for select to authenticated using (workspace_id = app_workspace());
create policy document_events_read_workspace
  on document_events for select to authenticated using (workspace_id = app_workspace());

commit;
