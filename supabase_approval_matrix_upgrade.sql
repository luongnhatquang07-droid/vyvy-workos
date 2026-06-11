alter table task_steps
add column if not exists department_approver_id uuid references employees(id) on delete set null,
add column if not exists coo_approver_id uuid references employees(id) on delete set null,
add column if not exists ceo_approver_id uuid references employees(id) on delete set null,
add column if not exists requires_coo_approval boolean default false,
add column if not exists requires_ceo_approval boolean default false,
add column if not exists approval_stage text default 'department',
add column if not exists department_approval_status text default 'not_submitted',
add column if not exists coo_approval_status text default 'not_required',
add column if not exists ceo_approval_status text default 'not_required',
add column if not exists department_approval_note text,
add column if not exists coo_approval_note text,
add column if not exists ceo_approval_note text,
add column if not exists department_approved_at timestamp with time zone,
add column if not exists coo_approved_at timestamp with time zone,
add column if not exists ceo_approved_at timestamp with time zone;

update task_steps
set department_approver_id = approver_id
where department_approver_id is null
  and approver_id is not null;

update task_steps
set approval_stage = 'department'
where approval_stage is null;

update task_steps
set department_approval_status = case
  when approval_status = 'approved' then 'approved'
  when approval_status = 'pending' then 'pending'
  when approval_status = 'revision' then 'revision'
  else 'not_submitted'
end
where department_approval_status is null;
