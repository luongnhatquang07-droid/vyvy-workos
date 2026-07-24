-- Reclassify the already-seeded "Timeline chuyển đổi số" project so each
-- top-level workstream represents one owner and each concrete action remains a
-- task beneath that owner.
--
-- Intended hierarchy:
--   project -> owner workstream -> task -> task_steps
--
-- This seed is transactional and idempotent. It never creates real people,
-- never deletes tasks/steps, and only soft-deletes the two superseded
-- Mục 6 / Mục 9 workstreams after every active task has moved successfully.

begin;

set transaction isolation level serializable;
set local lock_timeout = '10s';
set local statement_timeout = '120s';
set local idle_in_transaction_session_timeout = '120s';

do $timeline_owner_reclassify$
declare
  v_workspace_slug constant text := 'vyvy';
  v_project_name constant text := 'Timeline chuyển đổi số';
  v_seed_namespace constant text := 'vyvy-workos:timeline-chuyen-doi-so:v1';
  v_owner_labels constant text[] := array['Vũ', 'Ân', 'Chi', 'Long', 'Team'];

  v_workspace_id uuid;
  v_project_id uuid;
  v_owner_id uuid;
  v_workstream_id uuid;
  v_candidate_id uuid;

  v_workspace_matches uuid[] := array[]::uuid[];
  v_project_matches uuid[] := array[]::uuid[];
  v_matches uuid[] := array[]::uuid[];
  v_all_matches uuid[] := array[]::uuid[];
  v_owner_ids jsonb := '{}'::jsonb;
  v_owner_names jsonb := '{}'::jsonb;
  v_workstream_ids jsonb := '{}'::jsonb;
  v_all_owner_ids uuid[] := array[]::uuid[];
  v_all_owner_workstream_ids uuid[] := array[]::uuid[];
  v_legacy_workstream_ids uuid[] := array[]::uuid[];

  v_owner_label text;
  v_owner_name text;
  v_pattern text;
  v_hash text;
  v_sort_order integer := 0;
  v_task_count integer;
  v_moved_count integer;
  v_old_workstream_count integer;
  v_active_workstream_count integer;
  v_step_count integer;
  v_has_external_reference boolean := false;
  v_existing record;
begin
  select coalesce(array_agg(workspace.id order by workspace.id), array[]::uuid[])
  into v_workspace_matches
  from public.workspaces as workspace
  where workspace.slug = v_workspace_slug
    and workspace.deleted_at is null;

  if cardinality(v_workspace_matches) <> 1 then
    raise exception using
      errcode = '22023',
      message = format(
        'Timeline owner reclassification aborted: workspace slug "%s" must resolve to exactly one active workspace; found %s.',
        v_workspace_slug,
        cardinality(v_workspace_matches)
      );
  end if;

  v_workspace_id := v_workspace_matches[1];

  select coalesce(array_agg(project.id order by project.id), array[]::uuid[])
  into v_project_matches
  from public.projects as project
  where project.workspace_id = v_workspace_id
    and project.name = v_project_name
    and project.deleted_at is null;

  if cardinality(v_project_matches) <> 1 then
    raise exception using
      errcode = '22023',
      message = format(
        'Timeline owner reclassification aborted: project "%s" must resolve to exactly one active project; found %s.',
        v_project_name,
        cardinality(v_project_matches)
      );
  end if;

  v_project_id := v_project_matches[1];

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_seed_namespace || '|' || v_workspace_id::text, 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_seed_namespace || '|owner-workstreams|' || v_project_id::text, 0)
  );

  perform 1
  from public.projects as project
  where project.id = v_project_id
  for update;

  select coalesce(array_agg(workstream.id order by workstream.name), array[]::uuid[])
  into v_legacy_workstream_ids
  from public.workstreams as workstream
  where workstream.workspace_id = v_workspace_id
    and workstream.project_id = v_project_id
    and workstream.name in ('Mục 6', 'Mục 9');

  if cardinality(v_legacy_workstream_ids) <> 2
     or (
       select count(*)
       from public.workstreams as workstream
       where workstream.workspace_id = v_workspace_id
         and workstream.project_id = v_project_id
         and workstream.name = 'Mục 6'
     ) <> 1
     or (
       select count(*)
       from public.workstreams as workstream
       where workstream.workspace_id = v_workspace_id
         and workstream.project_id = v_project_id
         and workstream.name = 'Mục 9'
     ) <> 1 then
    raise exception using
      errcode = '55000',
      message = 'Timeline owner reclassification aborted: expected exactly one legacy Mục 6 and one legacy Mục 9 workstream.';
  end if;

  if exists (
    select 1
    from public.milestones as milestone
    where milestone.workstream_id = any(v_legacy_workstream_ids)
      and milestone.deleted_at is null
  ) then
    raise exception using
      errcode = '55000',
      message = 'Timeline owner reclassification aborted: an active milestone still references Mục 6/Mục 9.';
  end if;

  if exists (
    select 1
    from public.meeting_task_drafts as draft
    where draft.suggested_workstream_id = any(v_legacy_workstream_ids)
  ) then
    raise exception using
      errcode = '55000',
      message = 'Timeline owner reclassification aborted: a meeting task draft still references Mục 6/Mục 9.';
  end if;

  if exists (
    select 1
    from public.tasks as task
    where task.workstream_id = any(v_legacy_workstream_ids)
      and task.deleted_at is not null
  ) then
    raise exception using
      errcode = '55000',
      message = 'Timeline owner reclassification aborted: a soft-deleted task still references Mục 6/Mục 9.';
  end if;

  if pg_catalog.to_regclass('public.document_targets') is not null then
    execute
      'select exists (
         select 1
         from public.document_targets as target
         where target.target_type = ''WORKSTREAM''
           and target.target_id = any($1)
       )'
    into v_has_external_reference
    using v_legacy_workstream_ids;

    if v_has_external_reference then
      raise exception using
        errcode = '55000',
        message = 'Timeline owner reclassification aborted: a document target still references Mục 6/Mục 9.';
    end if;
  end if;

  perform 1
  from public.workstreams as workstream
  where workstream.workspace_id = v_workspace_id
    and workstream.project_id = v_project_id
  for update;

  perform 1
  from public.tasks as task
  where task.workspace_id = v_workspace_id
    and task.project_id = v_project_id
  for update;

  foreach v_owner_label in array v_owner_labels
  loop
    if v_owner_label = 'Team' then
      select coalesce(array_agg(person.id order by person.id), array[]::uuid[])
      into v_matches
      from public.people as person
      where person.workspace_id = v_workspace_id
        and person.full_name = 'Team / Nhóm chung'
        and person.deleted_at is null
        and lower(coalesce(person.status, 'active')) = 'active';
    else
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
    end if;

    if cardinality(v_matches) <> 1 then
      raise exception using
        errcode = '22023',
        message = format(
          'Timeline owner reclassification aborted: owner "%s" has %s active people matches.',
          v_owner_label,
          cardinality(v_matches)
        );
    end if;

    v_owner_id := v_matches[1];

    select person.full_name
    into v_owner_name
    from public.people as person
    where person.id = v_owner_id;

    v_owner_ids := v_owner_ids || jsonb_build_object(v_owner_label, v_owner_id::text);
    v_owner_names := v_owner_names || jsonb_build_object(v_owner_label, v_owner_name);
    v_all_owner_ids := array_append(v_all_owner_ids, v_owner_id);
  end loop;

  if (
    select count(distinct owner_id)
    from unnest(v_all_owner_ids) as resolved_owner(owner_id)
  ) <> 5 then
    raise exception using
      errcode = '22023',
      message = 'Timeline owner reclassification aborted: the five owner labels must resolve to five distinct people rows.';
  end if;

  perform 1
  from public.people as person
  where person.id = any(v_all_owner_ids)
  for update;

  foreach v_owner_label in array v_owner_labels
  loop
    v_owner_id := (v_owner_ids ->> v_owner_label)::uuid;

    select person.full_name
    into v_owner_name
    from public.people as person
    where person.id = v_owner_id
      and person.workspace_id = v_workspace_id
      and person.deleted_at is null
      and lower(coalesce(person.status, 'active')) = 'active';

    if not found or v_owner_name is distinct from (v_owner_names ->> v_owner_label) then
      raise exception using
        errcode = '40001',
        message = format(
          'Timeline owner reclassification aborted: owner "%s" changed during preflight.',
          v_owner_label
        );
    end if;
  end loop;

  select count(*)
  into v_task_count
  from public.tasks as task
  where task.workspace_id = v_workspace_id
    and task.project_id = v_project_id
    and task.deleted_at is null;

  if v_task_count <> 47 then
    raise exception using
      errcode = '55000',
      message = format(
        'Timeline owner reclassification aborted: expected 47 active project tasks; found %s.',
        v_task_count
      );
  end if;

  if exists (
    select 1
    from public.tasks as task
    where task.workspace_id = v_workspace_id
      and task.project_id = v_project_id
      and task.deleted_at is null
      and (
        task.owner_id is null
        or task.owner_id <> all(v_all_owner_ids)
      )
  ) then
    raise exception using
      errcode = '55000',
      message = 'Timeline owner reclassification aborted: every active task must belong to one of the five expected owners.';
  end if;

  foreach v_owner_label in array v_owner_labels
  loop
    v_sort_order := v_sort_order + 10;
    v_owner_id := (v_owner_ids ->> v_owner_label)::uuid;
    v_owner_name := v_owner_names ->> v_owner_label;

    v_hash := md5(v_seed_namespace || '|owner-workstream|' || v_owner_id::text);
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
      workstream.owner_id,
      workstream.status,
      workstream.deleted_at
    into v_existing
    from public.workstreams as workstream
    where workstream.id = v_candidate_id;

    if found then
      if v_existing.workspace_id is distinct from v_workspace_id
         or v_existing.project_id is distinct from v_project_id
         or v_existing.name is distinct from v_owner_name
         or v_existing.owner_id is distinct from v_owner_id then
        raise exception using
          errcode = '23505',
          message = format(
            'Timeline owner reclassification UUID collision for owner "%s" (workstream id %s).',
            v_owner_name,
            v_candidate_id
          );
      end if;

      if v_existing.deleted_at is not null then
        raise exception using
          errcode = '55000',
          message = format(
            'Timeline owner reclassification aborted: deterministic workstream for "%s" is soft-deleted.',
            v_owner_name
          );
      end if;

      if v_existing.status is distinct from 'active' then
        raise exception using
          errcode = '55000',
          message = format(
            'Timeline owner reclassification aborted: deterministic workstream for "%s" is not active.',
            v_owner_name
          );
      end if;

      v_workstream_id := v_candidate_id;
    else
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
        and workstream.name = v_owner_name;

      if cardinality(v_matches) > 1 then
        raise exception using
          errcode = '23505',
          message = format(
            'Timeline owner reclassification aborted: owner workstream "%s" has %s active matches.',
            v_owner_name,
            cardinality(v_matches)
          );
      elsif cardinality(v_matches) = 1 then
        v_workstream_id := v_matches[1];

        if not exists (
          select 1
          from public.workstreams as workstream
          where workstream.id = v_workstream_id
            and workstream.owner_id = v_owner_id
            and workstream.status = 'active'
        ) then
          raise exception using
            errcode = '23505',
            message = format(
              'Timeline owner reclassification aborted: workstream "%s" belongs to another owner.',
              v_owner_name
            );
        end if;
      elsif cardinality(v_all_matches) > 0 then
        raise exception using
          errcode = '55000',
          message = format(
            'Timeline owner reclassification aborted: owner workstream "%s" exists only as soft-deleted.',
            v_owner_name
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
          v_owner_name,
          'Nhóm đầu việc theo người phụ trách trong dự án Timeline chuyển đổi số.',
          v_owner_id,
          'active',
          'MEDIUM',
          null,
          null,
          v_sort_order
        );

        v_workstream_id := v_candidate_id;
      end if;
    end if;

    if exists (
      select 1
      from public.workstreams as workstream
      where workstream.workspace_id = v_workspace_id
        and workstream.project_id = v_project_id
        and workstream.name = v_owner_name
        and workstream.deleted_at is null
        and workstream.id <> v_workstream_id
    ) then
      raise exception using
        errcode = '23505',
        message = format(
          'Timeline owner reclassification aborted: duplicate active owner workstream "%s".',
          v_owner_name
        );
    end if;

    v_workstream_ids := v_workstream_ids || jsonb_build_object(v_owner_label, v_workstream_id::text);
    v_all_owner_workstream_ids := array_append(v_all_owner_workstream_ids, v_workstream_id);
  end loop;

  if exists (
    select 1
    from public.workstreams as workstream
    where workstream.workspace_id = v_workspace_id
      and workstream.project_id = v_project_id
      and workstream.deleted_at is null
      and workstream.name not in ('Mục 6', 'Mục 9')
      and workstream.id <> all(v_all_owner_workstream_ids)
  ) then
    raise exception using
      errcode = '55000',
      message = 'Timeline owner reclassification aborted: the project contains an unexpected active workstream.';
  end if;

  if exists (
    select 1
    from public.tasks as task
    join public.workstreams as workstream on workstream.id = task.workstream_id
    where task.workspace_id = v_workspace_id
      and task.project_id = v_project_id
      and task.deleted_at is null
      and workstream.id <> all(v_all_owner_workstream_ids)
      and (
        workstream.project_id is distinct from v_project_id
        or workstream.name not in ('Mục 6', 'Mục 9')
        or workstream.deleted_at is not null
      )
  ) then
    raise exception using
      errcode = '55000',
      message = 'Timeline owner reclassification aborted: an active task belongs to an unexpected workstream.';
  end if;

  update public.tasks as task
  set
    workstream_id = case
      when task.owner_id = (v_owner_ids ->> 'Vũ')::uuid then (v_workstream_ids ->> 'Vũ')::uuid
      when task.owner_id = (v_owner_ids ->> 'Ân')::uuid then (v_workstream_ids ->> 'Ân')::uuid
      when task.owner_id = (v_owner_ids ->> 'Chi')::uuid then (v_workstream_ids ->> 'Chi')::uuid
      when task.owner_id = (v_owner_ids ->> 'Long')::uuid then (v_workstream_ids ->> 'Long')::uuid
      when task.owner_id = (v_owner_ids ->> 'Team')::uuid then (v_workstream_ids ->> 'Team')::uuid
      else task.workstream_id
    end,
    updated_at = now()
  where task.workspace_id = v_workspace_id
    and task.project_id = v_project_id
    and task.deleted_at is null
    and task.workstream_id is distinct from case
      when task.owner_id = (v_owner_ids ->> 'Vũ')::uuid then (v_workstream_ids ->> 'Vũ')::uuid
      when task.owner_id = (v_owner_ids ->> 'Ân')::uuid then (v_workstream_ids ->> 'Ân')::uuid
      when task.owner_id = (v_owner_ids ->> 'Chi')::uuid then (v_workstream_ids ->> 'Chi')::uuid
      when task.owner_id = (v_owner_ids ->> 'Long')::uuid then (v_workstream_ids ->> 'Long')::uuid
      when task.owner_id = (v_owner_ids ->> 'Team')::uuid then (v_workstream_ids ->> 'Team')::uuid
      else task.workstream_id
    end;

  get diagnostics v_moved_count = row_count;

  if exists (
    select 1
    from public.tasks as task
    join public.workstreams as workstream on workstream.id = task.workstream_id
    where task.workspace_id = v_workspace_id
      and task.project_id = v_project_id
      and task.deleted_at is null
      and (
        workstream.id <> all(v_all_owner_workstream_ids)
        or workstream.owner_id is distinct from task.owner_id
      )
  ) then
    raise exception using
      errcode = '55000',
      message = 'Timeline owner reclassification postcondition failed: a task is not under its owner workstream.';
  end if;

  update public.workstreams as workstream
  set
    deleted_at = now(),
    updated_at = now()
  where workstream.workspace_id = v_workspace_id
    and workstream.project_id = v_project_id
    and workstream.name in ('Mục 6', 'Mục 9')
    and workstream.deleted_at is null
    and not exists (
      select 1
      from public.tasks as task
      where task.workstream_id = workstream.id
        and task.deleted_at is null
    );

  select count(*)
  into v_old_workstream_count
  from public.workstreams as workstream
  where workstream.workspace_id = v_workspace_id
    and workstream.project_id = v_project_id
    and workstream.name in ('Mục 6', 'Mục 9')
    and workstream.deleted_at is null;

  if v_old_workstream_count <> 0 then
    raise exception using
      errcode = '55000',
      message = format(
        'Timeline owner reclassification postcondition failed: %s old Mục 6/Mục 9 workstream(s) remain active.',
        v_old_workstream_count
      );
  end if;

  if (
    select count(*)
    from public.workstreams as workstream
    where workstream.id = any(v_all_owner_workstream_ids)
      and workstream.deleted_at is null
      and workstream.owner_id = any(v_all_owner_ids)
  ) <> 5 then
    raise exception using
      errcode = '55000',
      message = 'Timeline owner reclassification postcondition failed: expected five active owner workstreams.';
  end if;

  select count(*)
  into v_active_workstream_count
  from public.workstreams as workstream
  where workstream.workspace_id = v_workspace_id
    and workstream.project_id = v_project_id
    and workstream.deleted_at is null;

  if v_active_workstream_count <> 5 then
    raise exception using
      errcode = '55000',
      message = format(
        'Timeline owner reclassification postcondition failed: expected exactly five active project workstreams; found %s.',
        v_active_workstream_count
      );
  end if;

  if (select count(*) from public.tasks where project_id = v_project_id and deleted_at is null) <> 47
    or (select count(*) from public.tasks where project_id = v_project_id and deleted_at is null and owner_id = (v_owner_ids ->> 'Vũ')::uuid) <> 14
    or (select count(*) from public.tasks where project_id = v_project_id and deleted_at is null and owner_id = (v_owner_ids ->> 'Ân')::uuid) <> 10
    or (select count(*) from public.tasks where project_id = v_project_id and deleted_at is null and owner_id = (v_owner_ids ->> 'Chi')::uuid) <> 11
    or (select count(*) from public.tasks where project_id = v_project_id and deleted_at is null and owner_id = (v_owner_ids ->> 'Long')::uuid) <> 6
    or (select count(*) from public.tasks where project_id = v_project_id and deleted_at is null and owner_id = (v_owner_ids ->> 'Team')::uuid) <> 6 then
    raise exception using
      errcode = '55000',
      message = 'Timeline owner reclassification postcondition failed: task owner distribution differs from 14/10/11/6/6.';
  end if;

  select count(*)
  into v_step_count
  from public.task_steps as step
  join public.tasks as task on task.id = step.task_id
  where task.workspace_id = v_workspace_id
    and task.project_id = v_project_id
    and task.deleted_at is null
    and step.deleted_at is null;

  if v_step_count <> 8 then
    raise exception using
      errcode = '55000',
      message = format(
        'Timeline owner reclassification postcondition failed: expected 8 active task steps; found %s.',
        v_step_count
      );
  end if;

  if pg_catalog.to_regclass('public.document_targets') is not null then
    execute
      'select exists (
         select 1
         from public.document_targets as target
         where target.target_type = ''WORKSTREAM''
           and target.target_id = any($1)
       )'
    into v_has_external_reference
    using v_legacy_workstream_ids;

    if v_has_external_reference then
      raise exception using
        errcode = '40001',
        message = 'Timeline owner reclassification aborted: a document target referenced Mục 6/Mục 9 during the transaction.';
    end if;
  end if;

  if v_moved_count > 0 then
    insert into public.audit_logs (
      workspace_id,
      actor_id,
      action,
      entity_type,
      entity_id,
      before_data,
      after_data
    ) values (
      v_workspace_id,
      null,
      'reclassify_timeline_by_owner',
      'project',
      v_project_id,
      jsonb_build_object(
        'active_workstreams', jsonb_build_array('Mục 6', 'Mục 9'),
        'task_count', 47
      ),
      jsonb_build_object(
        'active_workstreams', (
          select jsonb_agg(workstream.name order by workstream.sort_order, workstream.name)
          from public.workstreams as workstream
          where workstream.id = any(v_all_owner_workstream_ids)
        ),
        'task_count', 47,
        'moved_task_count', v_moved_count
      )
    );
  end if;

  raise notice
    'Timeline owner reclassification PASS: project %, owner workstreams 5, tasks 47 (moved %), steps 8, old Mục 6/Mục 9 active 0.',
    v_project_id,
    v_moved_count;
end
$timeline_owner_reclassify$;

commit;
