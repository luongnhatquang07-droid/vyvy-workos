-- U4: complete a currently-UNASSIGNED task while explicitly bypassing the
-- existing quality gate. The bypass is available only inside the service-role
-- SECURITY DEFINER RPC below and every successful bypass is audited atomically.

do $preflight$
begin
  if pg_catalog.to_regclass('public.tasks') is null
    or pg_catalog.to_regclass('public.task_steps') is null
    or pg_catalog.to_regclass('public.task_checklist_items') is null
    or pg_catalog.to_regclass('public.deliverables') is null
    or pg_catalog.to_regclass('public.approvals') is null
    or pg_catalog.to_regclass('public.audit_logs') is null
    or pg_catalog.to_regclass('public.people') is null then
    raise exception using
      errcode = '55000',
      message = 'U4 completion bypass requires the existing task quality-gate tables.';
  end if;

  if pg_catalog.to_regprocedure('public.check_completion_gate()') is null then
    raise exception using
      errcode = '55000',
      message = 'public.check_completion_gate() must exist before U4.';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_trigger trigger_row
    where trigger_row.tgrelid = pg_catalog.to_regclass('public.tasks')
      and trigger_row.tgname = 'trg_completion_gate'
      and trigger_row.tgenabled <> 'D'
      and trigger_row.tgisinternal is false
  ) then
    raise exception using
      errcode = '55000',
      message = 'Active public.trg_completion_gate must exist before U4.';
  end if;

  if not pg_catalog.has_table_privilege(
    'service_role',
    'public.audit_logs',
    'INSERT'
  ) then
    raise exception using
      errcode = '55000',
      message = 'service_role must already have INSERT on public.audit_logs.';
  end if;
end;
$preflight$;

create or replace function public.complete_task_with_unassigned_bypass(
  p_task_id uuid,
  p_workspace_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_task public.tasks%rowtype;
  v_updated public.tasks%rowtype;
  v_completed_at timestamptz := pg_catalog.clock_timestamp();
  v_was_missing_owner boolean;
  v_was_missing_deadline boolean;
  v_had_pending_steps boolean;
  v_had_missing_files boolean;
  v_is_unassigned_bypass boolean;
begin
  select task_row.*
  into v_task
  from public.tasks task_row
  where task_row.id = p_task_id
    and task_row.workspace_id = p_workspace_id
    and task_row.deleted_at is null
  for update;

  if not found then
    raise exception using
      errcode = 'TU001',
      message = 'Không tìm thấy đầu việc con hợp lệ để hoàn thành.';
  end if;

  if v_task.status::text = 'COMPLETED' then
    raise exception using
      errcode = 'TU002',
      message = 'Đầu việc con đã hoàn thành trước đó.';
  end if;

  if p_actor_id is not null and not exists (
    select 1
    from public.people person_row
    where person_row.id = p_actor_id
      and person_row.workspace_id = p_workspace_id
  ) then
    raise exception using
      errcode = 'TU003',
      message = 'Người thực hiện không thuộc workspace của đầu việc.';
  end if;

  v_is_unassigned_bypass := v_task.status::text = 'UNASSIGNED';
  if v_is_unassigned_bypass then
    v_was_missing_owner := v_task.owner_id is null;
    v_was_missing_deadline := v_task.due_date is null;
    v_had_pending_steps := (
      exists (
        select 1
        from public.task_steps step_row
        where step_row.task_id = p_task_id
          and step_row.is_required
          and step_row.status::text <> 'COMPLETED'
      )
      or exists (
        select 1
        from public.task_checklist_items checklist_row
        where checklist_row.task_id = p_task_id
          and checklist_row.is_required
          and not checklist_row.is_completed
      )
    );
    v_had_missing_files := exists (
      select 1
      from public.deliverables deliverable_row
      where deliverable_row.task_id = p_task_id
        and deliverable_row.is_required
        and deliverable_row.status::text in (
          'REQUIRED',
          'NOT_SUBMITTED',
          'MISSING_INFORMATION',
          'REVISION_REQUIRED'
        )
    );

    perform pg_catalog.set_config(
      'vyvy.complete_unassigned_bypass_task_id',
      p_task_id::text,
      true
    );
  end if;

  update public.tasks
  set
    status = 'COMPLETED',
    updated_by = p_actor_id
  where id = p_task_id
    and workspace_id = p_workspace_id
    and deleted_at is null
  returning * into v_updated;

  if v_is_unassigned_bypass then
    insert into public.audit_logs (
      workspace_id,
      actor_id,
      action,
      entity_type,
      entity_id,
      before_data,
      after_data
    ) values (
      p_workspace_id,
      p_actor_id,
      'complete_unassigned_bypass',
      'task',
      p_task_id,
      pg_catalog.jsonb_build_object(
        'status', v_task.status::text,
        'owner_id', v_task.owner_id,
        'due_date', v_task.due_date,
        'was_missing_owner', v_was_missing_owner,
        'was_missing_deadline', v_was_missing_deadline,
        'had_pending_steps', v_had_pending_steps,
        'had_missing_files', v_had_missing_files
      ),
      pg_catalog.jsonb_build_object(
        'status', 'COMPLETED',
        'completed_at', v_completed_at,
        'completed_by', p_actor_id
      )
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'task',
    pg_catalog.to_jsonb(v_updated),
    'bypass',
    v_is_unassigned_bypass,
    'audit_action',
    case
      when v_is_unassigned_bypass then 'complete_unassigned_bypass'
      else null
    end
  );
end;
$function$;

comment on function public.complete_task_with_unassigned_bypass(uuid, uuid, uuid) is
  'Atomically completes a task. Only current UNASSIGNED status receives the audited quality-gate bypass; all other statuses use the normal completion gate.';

revoke all on function public.complete_task_with_unassigned_bypass(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.complete_task_with_unassigned_bypass(uuid, uuid, uuid)
  to service_role;

create or replace function public.check_completion_gate()
returns trigger
language plpgsql
as $function$
declare
  missing_deliverable text;
  revision_deliverable text;
  pending_approval text;
  bypass_function_owner name;
  unassigned_bypass_allowed boolean := false;
begin
  select pg_catalog.pg_get_userbyid(function_row.proowner)
  into bypass_function_owner
  from pg_catalog.pg_proc function_row
  where function_row.oid = pg_catalog.to_regprocedure(
    'public.complete_task_with_unassigned_bypass(uuid,uuid,uuid)'
  );

  unassigned_bypass_allowed :=
    new.status::text = 'COMPLETED'
    and old.status::text = 'UNASSIGNED'
    and pg_catalog.current_setting(
      'vyvy.complete_unassigned_bypass_task_id',
      true
    ) = old.id::text
    and current_user::text = bypass_function_owner::text;

  if new.status::text = 'COMPLETED'
    and old.status::text is distinct from 'COMPLETED'
    and not unassigned_bypass_allowed then
    if coalesce(new.expected_result, '') = '' then
      raise exception 'GATE: thiếu kết quả đầu việc';
    end if;
    if new.blocked_reason is not null then
      raise exception 'GATE: task đang BLOCKED';
    end if;
    select deliverable_row.name into missing_deliverable
    from public.deliverables deliverable_row
    where deliverable_row.task_id = new.id
      and deliverable_row.is_required
      and deliverable_row.status::text in ('REQUIRED', 'NOT_SUBMITTED')
    order by deliverable_row.due_date nulls last, deliverable_row.created_at
    limit 1;
    if missing_deliverable is not null then
      raise exception 'GATE: Chưa thể hoàn thành vì còn thiếu file: %.', missing_deliverable;
    end if;
    select deliverable_row.name into revision_deliverable
    from public.deliverables deliverable_row
    where deliverable_row.task_id = new.id
      and deliverable_row.is_required
      and deliverable_row.status::text in ('MISSING_INFORMATION', 'REVISION_REQUIRED')
    order by deliverable_row.updated_at desc
    limit 1;
    if revision_deliverable is not null then
      raise exception 'GATE: Chưa thể hoàn thành vì file đã nộp đang bị yêu cầu sửa hoặc thiếu thông tin: %.', revision_deliverable;
    end if;
    if exists (
      select 1
      from public.task_steps step_row
      where step_row.task_id = new.id
        and step_row.is_required
        and step_row.status::text <> 'COMPLETED'
    ) then
      raise exception 'GATE: còn step bắt buộc chưa xong';
    end if;
    if exists (
      select 1
      from public.task_checklist_items checklist_row
      where checklist_row.task_id = new.id
        and checklist_row.is_required
        and not checklist_row.is_completed
    ) then
      raise exception 'GATE: checklist bắt buộc chưa xong';
    end if;
    select coalesce(deliverable_row.name, 'phê duyệt bắt buộc')
    into pending_approval
    from public.approvals approval_row
    left join public.deliverables deliverable_row
      on deliverable_row.id = approval_row.deliverable_id
    where approval_row.task_id = new.id
      and approval_row.is_required
      and approval_row.status::text <> 'APPROVED'
    order by approval_row.due_at nulls last, approval_row.requested_at
    limit 1;
    if pending_approval is not null then
      raise exception 'GATE: Chưa thể hoàn thành vì phê duyệt bắt buộc đang chờ: %.', pending_approval;
    end if;
  end if;
  new.updated_at = pg_catalog.now();
  return new;
end;
$function$;

comment on function public.check_completion_gate() is
  'Preserves the full task completion gate except for the transaction-scoped, service-only UNASSIGNED bypass RPC.';
