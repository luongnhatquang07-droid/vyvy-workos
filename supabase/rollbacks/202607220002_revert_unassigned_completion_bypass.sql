-- Revert U4 completion bypass. Immutable audit rows already written by the
-- forward migration are intentionally preserved.

revoke all on function public.complete_task_with_unassigned_bypass(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
drop function if exists public.complete_task_with_unassigned_bypass(uuid, uuid, uuid);

create or replace function public.check_completion_gate()
returns trigger
language plpgsql
as $function$
declare
  missing_deliverable text;
  revision_deliverable text;
  pending_approval text;
begin
  if new.status = 'COMPLETED' and (old.status is distinct from 'COMPLETED') then
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
      and deliverable_row.status in ('REQUIRED', 'NOT_SUBMITTED')
    order by deliverable_row.due_date nulls last, deliverable_row.created_at
    limit 1;
    if missing_deliverable is not null then
      raise exception 'GATE: Chưa thể hoàn thành vì còn thiếu file: %.', missing_deliverable;
    end if;
    select deliverable_row.name into revision_deliverable
    from public.deliverables deliverable_row
    where deliverable_row.task_id = new.id
      and deliverable_row.is_required
      and deliverable_row.status in ('MISSING_INFORMATION', 'REVISION_REQUIRED')
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
        and step_row.status <> 'COMPLETED'
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
      and approval_row.status <> 'APPROVED'
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
  'Original strict task completion quality gate restored after removing the U4 UNASSIGNED bypass.';
