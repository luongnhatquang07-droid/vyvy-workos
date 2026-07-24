-- Standalone, idempotent seed for the "Timeline chuyển đổi số" workspace tree.
--
-- Run this file explicitly after reviewing the owner mapping on the target
-- database. It is intentionally NOT a schema migration because the four real
-- owners are environment data. No credential or environment secret belongs in
-- this file.
--
-- CONFIGURATION: change only v_workspace_slug below if the target workspace
-- uses a slug other than "vyvy".
--
-- Idempotency rules:
--   * real owners are never created; each must resolve to exactly one active
--     people row in the target workspace before any public write occurs;
--   * Team / Nhóm chung is the only people row this seed may create;
--   * deterministic UUIDs protect seed-owned rows from duplicate inserts;
--   * exact natural matches are reused when they already exist under another
--     UUID;
--   * a rerun never resets mutable task/step status, dates or descriptions.

begin;

set local lock_timeout = '10s';
set local statement_timeout = '120s';
set local idle_in_transaction_session_timeout = '120s';

do $timeline_seed$
declare
  v_workspace_slug constant text := 'vyvy';
  v_seed_namespace constant text := 'vyvy-workos:timeline-chuyen-doi-so:v1';
  v_project_name constant text := 'Timeline chuyển đổi số';
  v_team_name constant text := 'Team / Nhóm chung';
  v_team_job_title constant text := 'Nhóm phụ trách chung · Timeline chuyển đổi số';
  v_owner_labels constant text[] := array['Vũ', 'Ân', 'Chi', 'Long'];

  v_tasks constant jsonb := $timeline_tasks_json$
  [
    { "ownerName": "Vũ", "workstream": "Mục 6", "title": "Chủ trì tổng hợp flow nghiệp vụ cho các phòng ban" },
    { "ownerName": "Vũ", "workstream": "Mục 6", "title": "Chuẩn bị tài liệu mô tả luồng nhập xuất kho và các tình huống liên quan" },
    { "ownerName": "Vũ", "workstream": "Mục 6", "title": "Làm việc với Ân về phần database lõi (data bán hàng, kho, flow quản lý công nợ)" },
    { "ownerName": "Vũ", "workstream": "Mục 6", "title": "Lên khung project và định hướng kiến trúc dữ liệu" },
    { "ownerName": "Vũ", "workstream": "Mục 6", "title": "Kết nối dữ liệu sales, marketing, kho, tài chính vào CRM tổng" },
    {
      "ownerName": "Vũ",
      "workstream": "Mục 6",
      "title": "Gửi / tập hợp tài liệu qua Telegram để tránh thất lạc",
      "description": "Gợi ý deadline: 1 tuần gom data bán hàng ra table cơ bản; 7 ngày đầu lên khung project & mô tả nghiệp vụ"
    },

    { "ownerName": "Vũ", "workstream": "Mục 9", "title": "Tách Facebook & TikTok thành file Excel riêng" },
    { "ownerName": "Vũ", "workstream": "Mục 9", "title": "Hoàn thiện bảng chỉ số tổng cho marketing" },
    {
      "ownerName": "Vũ",
      "workstream": "Mục 9",
      "title": "Làm SOP / danh sách nguồn dữ liệu",
      "steps": ["cái nào dùng API", "cái nào cần extension", "cái nào cần nhân sự kéo tay"]
    },
    { "ownerName": "Vũ", "workstream": "Mục 9", "title": "Chuẩn hóa dữ liệu raw để làm nền cho dashboard" },
    { "ownerName": "Vũ", "workstream": "Mục 9", "title": "Gửi lại toàn bộ tài liệu đã làm cho Long" },
    { "ownerName": "Vũ", "workstream": "Mục 9", "title": "List công việc riêng của Vũ để Long nắm được" },
    { "ownerName": "Vũ", "workstream": "Mục 9", "title": "Đưa các mục chiến lược / chỉ số / flow vào một cấu trúc để vẽ được sơ đồ" },
    { "ownerName": "Vũ", "workstream": "Mục 9", "title": "Làm mô tả công cụ / quy trình cho web OS" },

    { "ownerName": "Ân", "workstream": "Mục 6", "title": "Thiết kế và triển khai backend Go cho phần lõi" },
    { "ownerName": "Ân", "workstream": "Mục 6", "title": "Thiết kế API theo OpenAPI" },
    { "ownerName": "Ân", "workstream": "Mục 6", "title": "Phối hợp với Vũ về database lõi để tránh lệch kiến trúc" },
    { "ownerName": "Ân", "workstream": "Mục 6", "title": "Phát triển frontend cho phần flow / dashboard" },
    { "ownerName": "Ân", "workstream": "Mục 6", "title": "Thử thư viện React phù hợp để dùng kèm node/flow" },
    {
      "ownerName": "Ân",
      "workstream": "Mục 6",
      "title": "Rà soát code AI bằng tài liệu module thay vì sửa toàn project",
      "description": "Gợi ý deadline: 4 ngày khung project; 5 ngày khung frontend flow; 2+3 ngày ráp backend; ~8 ngày hoàn thiện phần cơ bản, dư thời gian test"
    },

    { "ownerName": "Ân", "workstream": "Mục 9", "title": "Xây tiếp phần web / công cụ theo roadmap đã chốt" },
    { "ownerName": "Ân", "workstream": "Mục 9", "title": "Bổ sung dashboard báo cáo cho kho" },
    { "ownerName": "Ân", "workstream": "Mục 9", "title": "Thiết kế giao diện theo yêu cầu thực tế của Chi" },
    { "ownerName": "Ân", "workstream": "Mục 9", "title": "Làm việc trên nền dữ liệu raw theo bảng đã thống nhất" },

    { "ownerName": "Chi", "workstream": "Mục 6", "title": "Tổng hợp lại đầu việc và timeline theo nội dung cuộc họp" },
    { "ownerName": "Chi", "workstream": "Mục 6", "title": "Soạn lại hợp đồng / kế hoạch triển khai theo các điều đã chốt" },
    { "ownerName": "Chi", "workstream": "Mục 6", "title": "Hỗ trợ cập nhật bảng kho sau khi được sửa" },
    { "ownerName": "Chi", "workstream": "Mục 6", "title": "Làm việc với nhóm để chốt phân tài chính / kho nếu cần điều chỉnh thêm" },

    { "ownerName": "Chi", "workstream": "Mục 9", "title": "Thuyết trình lại roadmap kho đầy đủ, gồm toàn bộ đường đi của quy trình" },
    { "ownerName": "Chi", "workstream": "Mục 9", "title": "Gửi bảng / file kho đã xây dựng cho Long xem" },
    {
      "ownerName": "Chi",
      "workstream": "Mục 9",
      "title": "Chốt các chỉ số kho cần xem",
      "steps": ["tồn kho", "giá vốn", "dòng tiền", "thu chi hàng ngày", "hàng trả / hàng hoàn"]
    },
    { "ownerName": "Chi", "workstream": "Mục 9", "title": "Làm việc với Ân để phát triển tiếp phần kho" },
    { "ownerName": "Chi", "workstream": "Mục 9", "title": "Đưa ra roadmap cash flow cho tài chính" },
    { "ownerName": "Chi", "workstream": "Mục 9", "title": "Gửi lại toàn bộ tài liệu đã làm cho Long để tổng hợp chung" },
    { "ownerName": "Chi", "workstream": "Mục 9", "title": "Nhập / test lại luồng dữ liệu raw, đối chiếu đúng input người nhập liệu" },

    { "ownerName": "Long", "workstream": "Mục 9", "title": "Vẽ sơ đồ chiến lược đầy đủ cho phòng marketing (đặc biệt Facebook & TikTok)" },
    { "ownerName": "Long", "workstream": "Mục 9", "title": "Làm bảng chỉ số gắn với sơ đồ chiến lược để Phúc theo dõi được flow" },
    { "ownerName": "Long", "workstream": "Mục 9", "title": "Hỗ trợ hệ thống logic liên kết giữa task, roadmap, dashboard và data raw" },
    { "ownerName": "Long", "workstream": "Mục 9", "title": "Tổ chức lại công việc số hóa sau khi nhận đầy đủ tài liệu từ các bên" },
    { "ownerName": "Long", "workstream": "Mục 9", "title": "Hỗ trợ Phúc về phần kho: mốc tuần kiểm tra / fit hệ thống" },
    { "ownerName": "Long", "workstream": "Mục 9", "title": "Hỗ trợ phân tài chính sau khi Chi gửi roadmap cash flow" },

    { "ownerName": "Team", "workstream": "Mục 6", "title": "Chốt sơ đồ phòng ban và mô tả từng nhân sự" },
    { "ownerName": "Team", "workstream": "Mục 6", "title": "Chuẩn bị tài liệu chi tiết cho kho, định danh xuất nhập, role" },
    { "ownerName": "Team", "workstream": "Mục 6", "title": "Gom dữ liệu bán hàng từ tất cả các kênh về API" },
    { "ownerName": "Team", "workstream": "Mục 6", "title": "Giữ nguyên Hana Bank / Hana Social ở giai đoạn hiện tại, tránh mất lợi thế sẵn có" },
    { "ownerName": "Team", "workstream": "Mục 6", "title": "Bổ sung tài liệu phòng ban để phục vụ onboarding" },
    { "ownerName": "Team", "workstream": "Mục 6", "title": "Sắp xếp họp trình bày flow phòng ban trước khi bàn giao cho kỹ thuật" }
  ]
  $timeline_tasks_json$::jsonb;

  v_catalog_errors text[] := array[]::text[];
  v_owner_errors text[] := array[]::text[];
  v_owner_ids jsonb := '{}'::jsonb;
  v_workspace_matches uuid[] := array[]::uuid[];
  v_matches uuid[] := array[]::uuid[];
  v_all_matches uuid[] := array[]::uuid[];
  v_selected_task_ids uuid[] := array[]::uuid[];
  v_inserted_task_ids uuid[] := array[]::uuid[];
  v_selected_step_ids uuid[] := array[]::uuid[];
  v_inserted_step_ids uuid[] := array[]::uuid[];

  v_workspace_id uuid;
  v_team_id uuid;
  v_project_id uuid;
  v_workstream_6_id uuid;
  v_workstream_9_id uuid;
  v_workstream_id uuid;
  v_owner_id uuid;
  v_task_id uuid;
  v_step_id uuid;
  v_candidate_id uuid;

  v_owner_label text;
  v_task jsonb;
  v_step jsonb;
  v_task_title text;
  v_step_title text;
  v_workstream_name text;
  v_description text;
  v_hash text;
  v_pattern text;

  v_task_count integer;
  v_natural_task_count integer;
  v_step_count integer;
  v_unique_count integer;
  v_selected_count integer;
  v_inserted_count integer;
  v_sort_order integer;
  v_existing record;
begin
  -- Catalog preflight. Keep this exhaustive for every column referenced below,
  -- so a schema drift aborts before the seed mutates public data.
  with required(table_name, column_name) as (
    values
      ('workspaces', 'id'),
      ('workspaces', 'slug'),
      ('workspaces', 'deleted_at'),
      ('people', 'id'),
      ('people', 'workspace_id'),
      ('people', 'profile_id'),
      ('people', 'department_id'),
      ('people', 'full_name'),
      ('people', 'job_title'),
      ('people', 'email'),
      ('people', 'phone'),
      ('people', 'status'),
      ('people', 'deleted_at'),
      ('projects', 'id'),
      ('projects', 'workspace_id'),
      ('projects', 'name'),
      ('projects', 'code'),
      ('projects', 'description'),
      ('projects', 'owner_id'),
      ('projects', 'status'),
      ('projects', 'health_status'),
      ('projects', 'start_date'),
      ('projects', 'due_date'),
      ('projects', 'deleted_at'),
      ('workstreams', 'id'),
      ('workstreams', 'workspace_id'),
      ('workstreams', 'project_id'),
      ('workstreams', 'name'),
      ('workstreams', 'description'),
      ('workstreams', 'owner_id'),
      ('workstreams', 'status'),
      ('workstreams', 'priority'),
      ('workstreams', 'start_date'),
      ('workstreams', 'due_date'),
      ('workstreams', 'sort_order'),
      ('workstreams', 'deleted_at'),
      ('tasks', 'id'),
      ('tasks', 'workspace_id'),
      ('tasks', 'project_id'),
      ('tasks', 'workstream_id'),
      ('tasks', 'title'),
      ('tasks', 'description'),
      ('tasks', 'owner_id'),
      ('tasks', 'status'),
      ('tasks', 'priority'),
      ('tasks', 'start_date'),
      ('tasks', 'due_date'),
      ('tasks', 'deleted_at'),
      ('task_steps', 'id'),
      ('task_steps', 'workspace_id'),
      ('task_steps', 'task_id'),
      ('task_steps', 'title'),
      ('task_steps', 'description'),
      ('task_steps', 'owner_id'),
      ('task_steps', 'status'),
      ('task_steps', 'priority'),
      ('task_steps', 'start_date'),
      ('task_steps', 'due_date'),
      ('task_steps', 'is_required'),
      ('task_steps', 'sort_order'),
      ('task_steps', 'deleted_at')
  )
  select coalesce(
    array_agg(format('public.%s.%s', required.table_name, required.column_name)
      order by required.table_name, required.column_name),
    array[]::text[]
  )
  into v_catalog_errors
  from required
  left join information_schema.columns as column_info
    on column_info.table_schema = 'public'
   and column_info.table_name = required.table_name
   and column_info.column_name = required.column_name
  where column_info.column_name is null;

  if cardinality(v_catalog_errors) > 0 then
    raise exception using
      errcode = '55000',
      message = format(
        'Timeline seed aborted: required schema columns are missing: %s.',
        array_to_string(v_catalog_errors, ', ')
      );
  end if;

  if exists (
    select 1
    from information_schema.columns as column_info
    where column_info.table_schema = 'public'
      and column_info.table_name = 'tasks'
      and column_info.column_name in ('start_date', 'due_date')
      and (
        column_info.data_type <> 'date'
        or column_info.is_nullable <> 'YES'
      )
  ) then
    raise exception using
      errcode = '55000',
      message = 'Timeline seed aborted: public.tasks start_date/due_date must be nullable date columns.';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_attribute as attribute
    join pg_catalog.pg_type as enum_type
      on enum_type.oid = attribute.atttypid
    join pg_catalog.pg_enum as enum_value
      on enum_value.enumtypid = enum_type.oid
    where attribute.attrelid = 'public.task_steps'::regclass
      and attribute.attname = 'status'
      and not attribute.attisdropped
      and enum_value.enumlabel = 'NOT_STARTED'
  ) then
    raise exception using
      errcode = '55000',
      message = 'Timeline seed aborted: public.task_steps.status does not accept NOT_STARTED.';
  end if;

  if (
    select count(distinct attribute.attrelid)
    from pg_catalog.pg_attribute as attribute
    join pg_catalog.pg_type as enum_type
      on enum_type.oid = attribute.atttypid
    join pg_catalog.pg_enum as enum_value
      on enum_value.enumtypid = enum_type.oid
    where attribute.attrelid = any(array[
        'public.workstreams'::regclass,
        'public.tasks'::regclass,
        'public.task_steps'::regclass
      ])
      and attribute.attname = 'priority'
      and not attribute.attisdropped
      and enum_value.enumlabel = 'MEDIUM'
  ) <> 3 then
    raise exception using
      errcode = '55000',
      message = 'Timeline seed aborted: workstream/task/step priority columns must all accept MEDIUM.';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_attribute as attribute
    join pg_catalog.pg_type as enum_type
      on enum_type.oid = attribute.atttypid
    join pg_catalog.pg_enum as enum_value
      on enum_value.enumtypid = enum_type.oid
    where attribute.attrelid = 'public.projects'::regclass
      and attribute.attname = 'health_status'
      and not attribute.attisdropped
      and enum_value.enumlabel = 'NO_DATA'
  ) then
    raise exception using
      errcode = '55000',
      message = 'Timeline seed aborted: public.projects.health_status does not accept NO_DATA.';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_attribute as attribute
    join pg_catalog.pg_type as enum_type
      on enum_type.oid = attribute.atttypid
    join pg_catalog.pg_enum as enum_value
      on enum_value.enumtypid = enum_type.oid
    where attribute.attrelid = 'public.tasks'::regclass
      and attribute.attname = 'status'
      and not attribute.attisdropped
      and enum_value.enumlabel = 'NOT_STARTED'
  ) then
    raise exception using
      errcode = '55000',
      message = 'Timeline seed aborted: public.tasks.status does not accept NOT_STARTED.';
  end if;

  -- Dataset preflight is independent of environment data.
  select
    count(*)::integer,
    count(distinct concat_ws(
      chr(31),
      task_row.value ->> 'ownerName',
      task_row.value ->> 'workstream',
      task_row.value ->> 'title'
    ))::integer,
    coalesce(sum(jsonb_array_length(coalesce(task_row.value -> 'steps', '[]'::jsonb))), 0)::integer
  into v_task_count, v_natural_task_count, v_step_count
  from jsonb_array_elements(v_tasks) as task_row(value);

  if v_task_count <> 47
    or v_natural_task_count <> 47
    or v_step_count <> 8 then
    raise exception using
      errcode = '22023',
      message = format(
        'Timeline seed dataset invalid: expected 47 unique tasks and 8 steps, got %s tasks, %s natural keys and %s steps.',
        v_task_count,
        v_natural_task_count,
        v_step_count
      );
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_tasks) as task_row(value)
    where task_row.value ->> 'ownerName' is null
       or task_row.value ->> 'ownerName' not in ('Vũ', 'Ân', 'Chi', 'Long', 'Team')
       or task_row.value ->> 'workstream' is null
       or task_row.value ->> 'workstream' not in ('Mục 6', 'Mục 9')
       or nullif(btrim(task_row.value ->> 'title'), '') is null
  ) then
    raise exception using
      errcode = '22023',
      message = 'Timeline seed dataset contains an unsupported owner/workstream or an empty title.';
  end if;

  select coalesce(array_agg(workspace.id order by workspace.id), array[]::uuid[])
  into v_workspace_matches
  from public.workspaces as workspace
  where workspace.slug = v_workspace_slug
    and workspace.deleted_at is null;

  if cardinality(v_workspace_matches) <> 1 then
    raise exception using
      errcode = '22023',
      message = format(
        'Timeline seed aborted: workspace slug "%s" must resolve to exactly one active workspace; found %s.',
        v_workspace_slug,
        cardinality(v_workspace_matches)
      );
  end if;

  v_workspace_id := v_workspace_matches[1];

  -- Serialize all timeline seed attempts for this workspace. The lock is held
  -- until the outer transaction commits or rolls back.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_seed_namespace || '|' || v_workspace_id::text, 0)
  );

  -- Resolve all four real people before the first INSERT/UPDATE. Matching is
  -- accent-sensitive and limited to an exact full name or the final complete
  -- name token (the Vietnamese given name). It never accepts a middle-name
  -- token or a substring such as "Chi" inside "Chinh". Any zero/multiple result
  -- aborts the whole seed, and operators must confirm the candidates read-only
  -- before executing this script.
  foreach v_owner_label in array v_owner_labels
  loop
    v_pattern := '(^|[[:space:]])' || lower(v_owner_label) || '$';

    select coalesce(array_agg(person.id order by person.id), array[]::uuid[])
    into v_matches
    from public.people as person
    where person.workspace_id = v_workspace_id
      and person.deleted_at is null
      and lower(coalesce(person.status, 'active')) = 'active'
      and (
        lower(regexp_replace(btrim(person.full_name), '[[:space:]]+', ' ', 'g')) = lower(v_owner_label)
        or lower(regexp_replace(btrim(person.full_name), '[[:space:]]+', ' ', 'g')) ~ v_pattern
      );

    if cardinality(v_matches) <> 1 then
      v_owner_errors := array_append(
        v_owner_errors,
        format('%s (%s active matches)', v_owner_label, cardinality(v_matches))
      );
    else
      v_owner_ids := v_owner_ids || jsonb_build_object(v_owner_label, v_matches[1]::text);
    end if;
  end loop;

  if cardinality(v_owner_errors) > 0 then
    raise exception using
      errcode = '22023',
      message = format(
        'Timeline seed aborted before public writes: missing or ambiguous real owner mapping: %s. No people row was created.',
        array_to_string(v_owner_errors, ', ')
      );
  end if;

  select count(distinct owner.value)::integer
  into v_unique_count
  from jsonb_each_text(v_owner_ids) as owner(label, value);

  if v_unique_count <> 4 then
    raise exception using
      errcode = '22023',
      message = 'Timeline seed aborted before public writes: Vũ, Ân, Chi and Long must resolve to four distinct active people rows.';
  end if;

  -- Keep the resolved people stable while the seed creates their assignments.
  perform 1
  from public.people as person
  where person.id = any(array[
    (v_owner_ids ->> 'Vũ')::uuid,
    (v_owner_ids ->> 'Ân')::uuid,
    (v_owner_ids ->> 'Chi')::uuid,
    (v_owner_ids ->> 'Long')::uuid
  ])
  order by person.id
  for share;

  -- Resolve/create the one approved group-like people row. The current schema
  -- has no group flag or people notes column, so job_title carries the explicit
  -- group marker. Never attach an Auth profile to this row.
  v_hash := md5(v_seed_namespace || '|people|' || v_team_name);
  v_candidate_id := (
    substr(v_hash, 1, 8) || '-' ||
    substr(v_hash, 9, 4) || '-5' ||
    substr(v_hash, 14, 3) || '-a' ||
    substr(v_hash, 18, 3) || '-' ||
    substr(v_hash, 21, 12)
  )::uuid;

  select
    person.id,
    person.workspace_id,
    person.full_name,
    person.job_title,
    person.deleted_at
  into v_existing
  from public.people as person
  where person.id = v_candidate_id;

  if found and (
    v_existing.workspace_id <> v_workspace_id
    or v_existing.full_name <> v_team_name
  ) then
    raise exception using
      errcode = '23505',
      message = format(
        'Timeline seed UUID collision: deterministic Team id %s belongs to another people row.',
        v_candidate_id
      );
  end if;

  select
    coalesce(
      array_agg(person.id order by person.id) filter (
        where person.deleted_at is null
          and lower(coalesce(person.status, 'active')) = 'active'
      ),
      array[]::uuid[]
    ),
    coalesce(array_agg(person.id order by person.id), array[]::uuid[])
  into v_matches, v_all_matches
  from public.people as person
  where person.workspace_id = v_workspace_id
    and lower(regexp_replace(btrim(person.full_name), '[[:space:]]+', ' ', 'g'))
      = lower(v_team_name);

  if cardinality(v_matches) > 1 then
    raise exception using
      errcode = '23505',
      message = format(
        'Timeline seed aborted: "%s" has %s active people rows; merge them manually first.',
        v_team_name,
        cardinality(v_matches)
      );
  elsif cardinality(v_matches) = 1 then
    v_team_id := v_matches[1];

    select person.job_title
    into v_description
    from public.people as person
    where person.id = v_team_id;

    if v_description is distinct from v_team_job_title then
      raise exception using
        errcode = '22023',
        message = format(
          'Timeline seed aborted: existing "%s" row is not marked with the expected group job_title; review it manually.',
          v_team_name
        );
    end if;
  elsif cardinality(v_all_matches) > 0 then
    raise exception using
      errcode = '55000',
      message = format(
        'Timeline seed aborted: "%s" exists only as a soft-deleted people row; review/restore it manually instead of creating a duplicate.',
        v_team_name
      );
  else
    insert into public.people (
      id,
      workspace_id,
      profile_id,
      department_id,
      full_name,
      job_title,
      email,
      phone,
      status
    ) values (
      v_candidate_id,
      v_workspace_id,
      null,
      null,
      v_team_name,
      v_team_job_title,
      null,
      null,
      'active'
    );

    v_team_id := v_candidate_id;
  end if;

  -- Project natural key: active workspace + exact project name.
  v_hash := md5(v_seed_namespace || '|project|' || v_project_name);
  v_candidate_id := (
    substr(v_hash, 1, 8) || '-' ||
    substr(v_hash, 9, 4) || '-5' ||
    substr(v_hash, 14, 3) || '-a' ||
    substr(v_hash, 18, 3) || '-' ||
    substr(v_hash, 21, 12)
  )::uuid;

  select
    project.id,
    project.workspace_id,
    project.name,
    project.deleted_at
  into v_existing
  from public.projects as project
  where project.id = v_candidate_id;

  if found and (
    v_existing.workspace_id <> v_workspace_id
    or v_existing.name <> v_project_name
  ) then
    raise exception using
      errcode = '23505',
      message = format(
        'Timeline seed UUID collision: deterministic project id %s belongs to another project.',
        v_candidate_id
      );
  end if;

  select
    coalesce(
      array_agg(project.id order by project.id) filter (where project.deleted_at is null),
      array[]::uuid[]
    ),
    coalesce(array_agg(project.id order by project.id), array[]::uuid[])
  into v_matches, v_all_matches
  from public.projects as project
  where project.workspace_id = v_workspace_id
    and project.name = v_project_name;

  if cardinality(v_matches) > 1 then
    raise exception using
      errcode = '23505',
      message = format(
        'Timeline seed aborted: project "%s" has %s active natural matches.',
        v_project_name,
        cardinality(v_matches)
      );
  elsif cardinality(v_matches) = 1 then
    v_project_id := v_matches[1];
  elsif cardinality(v_all_matches) > 0 then
    raise exception using
      errcode = '55000',
      message = format(
        'Timeline seed aborted: project "%s" exists only as soft-deleted; review/restore it manually.',
        v_project_name
      );
  else
    insert into public.projects (
      id,
      workspace_id,
      name,
      code,
      description,
      owner_id,
      status,
      health_status,
      start_date,
      due_date
    ) values (
      v_candidate_id,
      v_workspace_id,
      v_project_name,
      null,
      null,
      null,
      'active',
      'NO_DATA',
      null,
      null
    );

    v_project_id := v_candidate_id;
  end if;

  -- Workstream natural key: project + exact workstream name.
  foreach v_workstream_name in array array['Mục 6', 'Mục 9']
  loop
    v_hash := md5(v_seed_namespace || '|workstream|' || v_workstream_name);
    v_candidate_id := (
      substr(v_hash, 1, 8) || '-' ||
      substr(v_hash, 9, 4) || '-5' ||
      substr(v_hash, 14, 3) || '-a' ||
      substr(v_hash, 18, 3) || '-' ||
      substr(v_hash, 21, 12)
    )::uuid;

    select
      workstream.id,
      workstream.workspace_id,
      workstream.project_id,
      workstream.name,
      workstream.deleted_at
    into v_existing
    from public.workstreams as workstream
    where workstream.id = v_candidate_id;

    if found and (
      v_existing.workspace_id <> v_workspace_id
      or v_existing.project_id <> v_project_id
      or v_existing.name <> v_workstream_name
    ) then
      raise exception using
        errcode = '23505',
        message = format(
          'Timeline seed UUID collision: deterministic workstream id %s belongs to another workstream.',
          v_candidate_id
        );
    end if;

    select
      coalesce(
        array_agg(workstream.id order by workstream.id)
          filter (where workstream.deleted_at is null),
        array[]::uuid[]
      ),
      coalesce(array_agg(workstream.id order by workstream.id), array[]::uuid[])
    into v_matches, v_all_matches
    from public.workstreams as workstream
    where workstream.workspace_id = v_workspace_id
      and workstream.project_id = v_project_id
      and workstream.name = v_workstream_name;

    if cardinality(v_matches) > 1 then
      raise exception using
        errcode = '23505',
        message = format(
          'Timeline seed aborted: workstream "%s" has %s active natural matches.',
          v_workstream_name,
          cardinality(v_matches)
        );
    elsif cardinality(v_matches) = 1 then
      v_workstream_id := v_matches[1];
    elsif cardinality(v_all_matches) > 0 then
      raise exception using
        errcode = '55000',
        message = format(
          'Timeline seed aborted: workstream "%s" exists only as soft-deleted; review/restore it manually.',
          v_workstream_name
        );
    else
      insert into public.workstreams (
        id,
        workspace_id,
        project_id,
        name,
        description,
        owner_id,
        status,
        priority,
        start_date,
        due_date,
        sort_order
      ) values (
        v_candidate_id,
        v_workspace_id,
        v_project_id,
        v_workstream_name,
        null,
        null,
        'active',
        'MEDIUM',
        null,
        null,
        case v_workstream_name when 'Mục 6' then 10 else 20 end
      );

      v_workstream_id := v_candidate_id;
    end if;

    if v_workstream_name = 'Mục 6' then
      v_workstream_6_id := v_workstream_id;
    else
      v_workstream_9_id := v_workstream_id;
    end if;
  end loop;

  -- Insert/reuse every task, then insert/reuse only its explicitly provided
  -- task_steps. Existing matches keep all mutable fields untouched.
  for v_task in
    select task_row.value
    from jsonb_array_elements(v_tasks) with ordinality as task_row(value, ordinal)
    order by task_row.ordinal
  loop
    v_owner_label := v_task ->> 'ownerName';
    v_workstream_name := v_task ->> 'workstream';
    v_task_title := v_task ->> 'title';
    v_description := v_task ->> 'description';

    v_owner_id := case v_owner_label
      when 'Team' then v_team_id
      else (v_owner_ids ->> v_owner_label)::uuid
    end;

    v_workstream_id := case v_workstream_name
      when 'Mục 6' then v_workstream_6_id
      else v_workstream_9_id
    end;

    v_hash := md5(
      v_seed_namespace || '|task|' ||
      v_owner_label || '|' ||
      v_workstream_name || '|' ||
      v_task_title
    );
    v_candidate_id := (
      substr(v_hash, 1, 8) || '-' ||
      substr(v_hash, 9, 4) || '-5' ||
      substr(v_hash, 14, 3) || '-a' ||
      substr(v_hash, 18, 3) || '-' ||
      substr(v_hash, 21, 12)
    )::uuid;

    select
      task.id,
      task.workspace_id,
      task.project_id,
      task.workstream_id,
      task.owner_id,
      task.title,
      task.deleted_at
    into v_existing
    from public.tasks as task
    where task.id = v_candidate_id;

    if found and (
      v_existing.workspace_id is distinct from v_workspace_id
      or v_existing.project_id is distinct from v_project_id
      or v_existing.workstream_id is distinct from v_workstream_id
      or v_existing.owner_id is distinct from v_owner_id
      or v_existing.title is distinct from v_task_title
    ) then
      raise exception using
        errcode = '23505',
        message = format(
          'Timeline seed UUID collision for task natural key "%s / %s / %s" (id %s).',
          v_owner_label,
          v_workstream_name,
          v_task_title,
          v_candidate_id
        );
    end if;

    select
      coalesce(
        array_agg(task.id order by task.id) filter (where task.deleted_at is null),
        array[]::uuid[]
      ),
      coalesce(array_agg(task.id order by task.id), array[]::uuid[])
    into v_matches, v_all_matches
    from public.tasks as task
    where task.workspace_id = v_workspace_id
      and task.project_id = v_project_id
      and task.workstream_id = v_workstream_id
      and task.owner_id = v_owner_id
      and task.title = v_task_title;

    if cardinality(v_matches) > 1 then
      raise exception using
        errcode = '23505',
        message = format(
          'Timeline seed aborted: task natural key "%s / %s / %s" has %s active matches.',
          v_owner_label,
          v_workstream_name,
          v_task_title,
          cardinality(v_matches)
        );
    elsif cardinality(v_matches) = 1 then
      v_task_id := v_matches[1];
    elsif cardinality(v_all_matches) > 0 then
      raise exception using
        errcode = '55000',
        message = format(
          'Timeline seed aborted: task "%s / %s / %s" exists only as soft-deleted; review/restore it manually.',
          v_owner_label,
          v_workstream_name,
          v_task_title
        );
    else
      insert into public.tasks (
        id,
        workspace_id,
        project_id,
        workstream_id,
        title,
        description,
        owner_id,
        status,
        priority,
        start_date,
        due_date
      ) values (
        v_candidate_id,
        v_workspace_id,
        v_project_id,
        v_workstream_id,
        v_task_title,
        v_description,
        v_owner_id,
        'NOT_STARTED',
        'MEDIUM',
        null,
        null
      );

      v_task_id := v_candidate_id;
      v_inserted_task_ids := array_append(v_inserted_task_ids, v_task_id);
    end if;

    v_selected_task_ids := array_append(v_selected_task_ids, v_task_id);
    v_sort_order := 0;

    for v_step in
      select step_row.value
      from jsonb_array_elements(coalesce(v_task -> 'steps', '[]'::jsonb))
        with ordinality as step_row(value, ordinal)
      order by step_row.ordinal
    loop
      v_sort_order := v_sort_order + 1;
      v_step_title := v_step #>> '{}';

      v_hash := md5(
        v_seed_namespace || '|step|' ||
        v_owner_label || '|' ||
        v_workstream_name || '|' ||
        v_task_title || '|' ||
        v_sort_order::text || '|' ||
        v_step_title
      );
      v_candidate_id := (
        substr(v_hash, 1, 8) || '-' ||
        substr(v_hash, 9, 4) || '-5' ||
        substr(v_hash, 14, 3) || '-a' ||
        substr(v_hash, 18, 3) || '-' ||
        substr(v_hash, 21, 12)
      )::uuid;

      select
        step.id,
        step.workspace_id,
        step.task_id,
        step.title,
        step.deleted_at
      into v_existing
      from public.task_steps as step
      where step.id = v_candidate_id;

      if found and (
        v_existing.workspace_id is distinct from v_workspace_id
        or v_existing.task_id is distinct from v_task_id
        or v_existing.title is distinct from v_step_title
      ) then
        raise exception using
          errcode = '23505',
          message = format(
            'Timeline seed UUID collision for step "%s" under task "%s" (id %s).',
            v_step_title,
            v_task_title,
            v_candidate_id
          );
      end if;

      select
        coalesce(
          array_agg(step.id order by step.id) filter (where step.deleted_at is null),
          array[]::uuid[]
        ),
        coalesce(array_agg(step.id order by step.id), array[]::uuid[])
      into v_matches, v_all_matches
      from public.task_steps as step
      where step.workspace_id = v_workspace_id
        and step.task_id = v_task_id
        and step.title = v_step_title;

      if cardinality(v_matches) > 1 then
        raise exception using
          errcode = '23505',
          message = format(
            'Timeline seed aborted: step "%s" under task "%s" has %s active matches.',
            v_step_title,
            v_task_title,
            cardinality(v_matches)
          );
      elsif cardinality(v_matches) = 1 then
        v_step_id := v_matches[1];
      elsif cardinality(v_all_matches) > 0 then
        raise exception using
          errcode = '55000',
          message = format(
            'Timeline seed aborted: step "%s" under task "%s" exists only as soft-deleted; review/restore it manually.',
            v_step_title,
            v_task_title
          );
      else
        insert into public.task_steps (
          id,
          workspace_id,
          task_id,
          title,
          description,
          owner_id,
          status,
          priority,
          start_date,
          due_date,
          is_required,
          sort_order
        ) values (
          v_candidate_id,
          v_workspace_id,
          v_task_id,
          v_step_title,
          null,
          v_owner_id,
          'NOT_STARTED',
          'MEDIUM',
          null,
          null,
          true,
          v_sort_order
        );

        v_step_id := v_candidate_id;
        v_inserted_step_ids := array_append(v_inserted_step_ids, v_step_id);
      end if;

      v_selected_step_ids := array_append(v_selected_step_ids, v_step_id);
    end loop;
  end loop;

  -- Postconditions validate the selected tree, not mutable fields of reused
  -- records. Only rows inserted by this invocation must still have their
  -- initial NOT_STARTED/null-date values.
  if (
    select count(*)
    from public.projects as project
    where project.id = v_project_id
      and project.workspace_id = v_workspace_id
      and project.name = v_project_name
      and project.deleted_at is null
  ) <> 1 then
    raise exception using
      errcode = '55000',
      message = 'Timeline seed postcondition failed: expected one active Timeline chuyển đổi số project.';
  end if;

  if (
    select count(*)
    from public.workstreams as workstream
    where workstream.id = any(array[v_workstream_6_id, v_workstream_9_id])
      and workstream.workspace_id = v_workspace_id
      and workstream.project_id = v_project_id
      and workstream.name in ('Mục 6', 'Mục 9')
      and workstream.deleted_at is null
  ) <> 2 then
    raise exception using
      errcode = '55000',
      message = 'Timeline seed postcondition failed: expected exactly two active Mục 6/Mục 9 workstreams.';
  end if;

  if (
    select count(*)
    from public.people as person
    where person.id = v_team_id
      and person.workspace_id = v_workspace_id
      and person.full_name = v_team_name
      and person.job_title = v_team_job_title
      and lower(coalesce(person.status, 'active')) = 'active'
      and person.deleted_at is null
  ) <> 1 then
    raise exception using
      errcode = '55000',
      message = 'Timeline seed postcondition failed: expected exactly one active Team / Nhóm chung owner row.';
  end if;

  if cardinality(v_selected_task_ids) <> 47
    or cardinality(v_selected_step_ids) <> 8 then
    raise exception using
      errcode = '22023',
      message = format(
        'Timeline seed postcondition failed: selected %s tasks and %s steps; expected 47 and 8.',
        cardinality(v_selected_task_ids),
        cardinality(v_selected_step_ids)
      );
  end if;

  select count(distinct selected.id)::integer
  into v_unique_count
  from unnest(v_selected_task_ids) as selected(id);

  if v_unique_count <> 47 then
    raise exception using
      errcode = '23505',
      message = format(
        'Timeline seed postcondition failed: 47 dataset rows resolved to only %s unique task ids.',
        v_unique_count
      );
  end if;

  select count(distinct selected.id)::integer
  into v_unique_count
  from unnest(v_selected_step_ids) as selected(id);

  if v_unique_count <> 8 then
    raise exception using
      errcode = '23505',
      message = format(
        'Timeline seed postcondition failed: 8 dataset step rows resolved to only %s unique step ids.',
        v_unique_count
      );
  end if;

  select count(*)::integer
  into v_selected_count
  from public.tasks as task
  where task.id = any(v_selected_task_ids)
    and task.workspace_id = v_workspace_id
    and task.project_id = v_project_id
    and task.workstream_id = any(array[v_workstream_6_id, v_workstream_9_id])
    and task.deleted_at is null;

  if v_selected_count <> 47 then
    raise exception using
      errcode = '55000',
      message = format(
        'Timeline seed postcondition failed: only %s/47 selected tasks are active in the expected project tree.',
        v_selected_count
      );
  end if;

  select count(*)::integer
  into v_selected_count
  from public.task_steps as step
  where step.id = any(v_selected_step_ids)
    and step.workspace_id = v_workspace_id
    and step.task_id = any(v_selected_task_ids)
    and step.deleted_at is null;

  if v_selected_count <> 8 then
    raise exception using
      errcode = '55000',
      message = format(
        'Timeline seed postcondition failed: only %s/8 selected steps are active under the expected tasks.',
        v_selected_count
      );
  end if;

  if exists (
    select 1
    from public.tasks as task
    where task.id = any(v_inserted_task_ids)
      and (
        task.status::text <> 'NOT_STARTED'
        or task.start_date is not null
        or task.due_date is not null
      )
  ) then
    raise exception using
      errcode = '55000',
      message = 'Timeline seed postcondition failed: a newly inserted task did not retain NOT_STARTED with null dates.';
  end if;

  if exists (
    select 1
    from public.task_steps as step
    where step.id = any(v_inserted_step_ids)
      and (
        step.status::text <> 'NOT_STARTED'
        or step.start_date is not null
        or step.due_date is not null
      )
  ) then
    raise exception using
      errcode = '55000',
      message = 'Timeline seed postcondition failed: a newly inserted step did not retain NOT_STARTED with null dates.';
  end if;

  -- Expected owner distribution: Vũ 14, Ân 10, Chi 11, Long 6, Team 6.
  if (select count(*) from public.tasks where id = any(v_selected_task_ids) and owner_id = (v_owner_ids ->> 'Vũ')::uuid) <> 14
    or (select count(*) from public.tasks where id = any(v_selected_task_ids) and owner_id = (v_owner_ids ->> 'Ân')::uuid) <> 10
    or (select count(*) from public.tasks where id = any(v_selected_task_ids) and owner_id = (v_owner_ids ->> 'Chi')::uuid) <> 11
    or (select count(*) from public.tasks where id = any(v_selected_task_ids) and owner_id = (v_owner_ids ->> 'Long')::uuid) <> 6
    or (select count(*) from public.tasks where id = any(v_selected_task_ids) and owner_id = v_team_id) <> 6 then
    raise exception using
      errcode = '55000',
      message = 'Timeline seed postcondition failed: selected task owner distribution differs from 14/10/11/6/6.';
  end if;

  if (select count(*) from public.tasks where id = any(v_selected_task_ids) and workstream_id = v_workstream_6_id) <> 22
    or (select count(*) from public.tasks where id = any(v_selected_task_ids) and workstream_id = v_workstream_9_id) <> 25 then
    raise exception using
      errcode = '55000',
      message = 'Timeline seed postcondition failed: selected task workstream distribution differs from Mục 6 = 22 / Mục 9 = 25.';
  end if;

  select cardinality(v_inserted_task_ids), cardinality(v_inserted_step_ids)
  into v_inserted_count, v_step_count;

  raise notice
    'Timeline seed PASS: project %, workstreams 2, selected tasks 47 (inserted %), selected steps 8 (inserted %), Team owner %.',
    v_project_id,
    v_inserted_count,
    v_step_count,
    v_team_id;
end
$timeline_seed$;

commit;
