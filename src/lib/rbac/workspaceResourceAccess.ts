import 'server-only'

import { createServiceClient } from '@/lib/supabase/service'
import {
  canApproveDeliverable,
  canApproveOnBehalf,
  canEditProject,
  canEditStep,
  canEditSubtask,
  canEditWorkstream,
  canViewFileLibrary,
  normalizeUserRole,
  type RbacResource,
  type RbacUserContext,
} from '@/lib/rbac/permissions'

export const RBAC_FORBIDDEN_MESSAGE = 'Ban khong co quyen thuc hien thao tac nay.'

export type WorkspaceEntityType = 'project' | 'workstream' | 'task' | 'step' | 'meeting'

export async function canCreateWorkspaceEntity(
  user: RbacUserContext,
  workspaceId: string,
  type: WorkspaceEntityType | undefined,
  payload: Record<string, unknown>,
) {
  const role = normalizeUserRole(user)
  if (role === 'ADMIN' || role === 'COO') return true

  if (type === 'project') {
    const ownerId = text(payload.ownerId)
    return canEditProject(user, {
      owner_id: ownerId,
      owner_department_id: await personDepartment(workspaceId, ownerId),
      member_ids: ownerId ? [ownerId] : [],
    })
  }

  if (type === 'workstream') {
    const project = await loadProjectResource(workspaceId, text(payload.projectId))
    return canEditProject(user, project)
  }

  if (type === 'task' || type === 'meeting') {
    const workstreamId = text(payload.workstreamId)
    const projectId = text(payload.projectId)
    const resource = workstreamId
      ? await loadWorkstreamResource(workspaceId, workstreamId)
      : await loadProjectResource(workspaceId, projectId)
    return type === 'task'
      ? canEditWorkstream(user, resource)
      : canEditProject(user, resource)
  }

  if (type === 'step') {
    const task = await loadTaskResource(workspaceId, text(payload.taskId))
    return canEditSubtask(user, task)
  }

  return false
}

export async function canEditWorkspaceEntity(
  user: RbacUserContext,
  workspaceId: string,
  type: WorkspaceEntityType,
  id: string,
) {
  if (type === 'project') return canEditProject(user, await loadProjectResource(workspaceId, id))
  if (type === 'workstream') return canEditWorkstream(user, await loadWorkstreamResource(workspaceId, id))
  if (type === 'task') return canEditSubtask(user, await loadTaskResource(workspaceId, id))
  if (type === 'step') return canEditStep(user, await loadStepResource(workspaceId, id))
  if (type === 'meeting') return canEditProject(user, await loadMeetingResource(workspaceId, id))
  return false
}

export async function canCreateDeliverable(
  user: RbacUserContext,
  workspaceId: string,
  target: { projectId: string | null; taskId: string | null; stepId: string | null },
) {
  if (target.stepId) return canEditStep(user, await loadStepResource(workspaceId, target.stepId))
  if (target.taskId) return canEditSubtask(user, await loadTaskResource(workspaceId, target.taskId))
  if (target.projectId) return canEditProject(user, await loadProjectResource(workspaceId, target.projectId))
  return normalizeUserRole(user) === 'ADMIN' || normalizeUserRole(user) === 'COO'
}

export async function canSubmitToDeliverable(
  user: RbacUserContext,
  workspaceId: string,
  deliverableId: string | null,
  fallback: { projectId?: string | null; taskId?: string | null; stepId?: string | null } = {},
) {
  const deliverable = deliverableId ? await loadDeliverableResource(workspaceId, deliverableId) : null
  if (deliverable && canViewFileLibrary(user, deliverable)) return true
  if (deliverable?.step_id || fallback.stepId) return canEditStep(user, await loadStepResource(workspaceId, deliverable?.step_id ?? fallback.stepId ?? ''))
  if (deliverable?.task_id || fallback.taskId) return canEditSubtask(user, await loadTaskResource(workspaceId, deliverable?.task_id ?? fallback.taskId ?? ''))
  if (deliverable?.project_id || fallback.projectId) return canEditProject(user, await loadProjectResource(workspaceId, deliverable?.project_id ?? fallback.projectId ?? ''))
  return false
}

export async function canReviewDeliverable(user: RbacUserContext, workspaceId: string, deliverableId: string) {
  return canApproveDeliverable(user, await loadDeliverableResource(workspaceId, deliverableId))
}

export async function getDeliverableReviewPermission(user: RbacUserContext, workspaceId: string, deliverableId: string) {
  const resource = await loadDeliverableResource(workspaceId, deliverableId)
  const assignedReviewer = Boolean(user.personId && (
    resource?.reviewer_id === user.personId ||
    resource?.reviewerId === user.personId ||
    resource?.approver_id === user.personId ||
    resource?.approverId === user.personId
  ))
  const canAct = canApproveDeliverable(user, resource)
  const canDelegate = !assignedReviewer && canApproveOnBehalf(user, resource)
  return {
    allowed: canAct,
    delegated: canAct && canDelegate,
    assignedReviewer,
    assignedApproverId: resource?.reviewer_id ?? resource?.reviewerId ?? resource?.approver_id ?? resource?.approverId ?? null,
  }
}

export async function canViewDeliverable(user: RbacUserContext, workspaceId: string, deliverableId: string) {
  return canViewFileLibrary(user, await loadDeliverableResource(workspaceId, deliverableId))
}

async function loadProjectResource(workspaceId: string, projectId: string | null): Promise<RbacResource | null> {
  if (!projectId) return null
  const client = createServiceClient()
  const { data, error } = await client
    .from('projects')
    .select('id,owner_id')
    .eq('workspace_id', workspaceId)
    .eq('id', projectId)
    .is('deleted_at', null)
    .maybeSingle()
  if (error || !data) return null
  return {
    id: data.id,
    owner_id: data.owner_id,
    owner_department_id: await personDepartment(workspaceId, data.owner_id),
    member_ids: compact([data.owner_id]),
  }
}

async function loadWorkstreamResource(workspaceId: string, workstreamId: string | null): Promise<RbacResource | null> {
  if (!workstreamId) return null
  const client = createServiceClient()
  const { data, error } = await client
    .from('workstreams')
    .select('id,project_id,owner_id')
    .eq('workspace_id', workspaceId)
    .eq('id', workstreamId)
    .is('deleted_at', null)
    .maybeSingle()
  if (error || !data) return null
  return {
    id: data.id,
    project_id: data.project_id,
    owner_id: data.owner_id,
    owner_department_id: await personDepartment(workspaceId, data.owner_id),
    member_ids: compact([data.owner_id]),
  }
}

async function loadTaskResource(workspaceId: string, taskId: string | null): Promise<RbacResource | null> {
  if (!taskId) return null
  const client = createServiceClient()
  const { data, error } = await client
    .from('tasks')
    .select('id,project_id,workstream_id,owner_id,waiting_for_person_id')
    .eq('workspace_id', workspaceId)
    .eq('id', taskId)
    .is('deleted_at', null)
    .maybeSingle()
  if (error || !data) return null
  const assigneeIds = await taskAssigneeIds(taskId)
  return {
    id: data.id,
    project_id: data.project_id,
    workstream_id: data.workstream_id,
    owner_id: data.owner_id,
    owner_department_id: await personDepartment(workspaceId, data.owner_id),
    assignee_ids: assigneeIds,
    supporter_ids: assigneeIds,
    member_ids: compact([data.owner_id, data.waiting_for_person_id, ...assigneeIds]),
  }
}

async function loadStepResource(workspaceId: string, stepId: string | null): Promise<RbacResource | null> {
  if (!stepId) return null
  const client = createServiceClient()
  const { data, error } = await client
    .from('task_steps')
    .select('id,task_id,owner_id')
    .eq('workspace_id', workspaceId)
    .eq('id', stepId)
    .is('deleted_at', null)
    .maybeSingle()
  if (error || !data) return null
  const task = await loadTaskResource(workspaceId, data.task_id)
  return {
    id: data.id,
    task_id: data.task_id,
    project_id: task?.project_id ?? null,
    workstream_id: task?.workstream_id ?? null,
    owner_id: data.owner_id,
    owner_department_id: await personDepartment(workspaceId, data.owner_id ?? task?.owner_id),
    assignee_ids: task?.assignee_ids ?? [],
    supporter_ids: task?.supporter_ids ?? [],
    member_ids: compact([data.owner_id, task?.owner_id, ...(task?.member_ids ?? [])]),
  }
}

async function loadMeetingResource(workspaceId: string, meetingId: string | null): Promise<RbacResource | null> {
  if (!meetingId) return null
  const client = createServiceClient()
  const { data, error } = await client
    .from('meetings')
    .select('id,project_id')
    .eq('workspace_id', workspaceId)
    .eq('id', meetingId)
    .is('deleted_at', null)
    .maybeSingle()
  if (error || !data?.project_id) return null
  return loadProjectResource(workspaceId, data.project_id)
}

async function loadDeliverableResource(workspaceId: string, deliverableId: string | null): Promise<RbacResource | null> {
  if (!deliverableId) return null
  const client = createServiceClient()
  const { data, error } = await client
    .from('deliverables')
    .select('id,project_id,task_id,step_id,submitter_id,reviewer_id')
    .eq('workspace_id', workspaceId)
    .eq('id', deliverableId)
    .is('deleted_at', null)
    .maybeSingle()
  if (error || !data) return null
  const task = await loadTaskResource(workspaceId, data.task_id)
  const step = await loadStepResource(workspaceId, data.step_id)
  return {
    id: data.id,
    project_id: data.project_id ?? task?.project_id ?? null,
    task_id: data.task_id,
    step_id: data.step_id,
    submitter_id: data.submitter_id,
    reviewer_id: data.reviewer_id,
    owner_id: step?.owner_id ?? task?.owner_id ?? data.submitter_id,
    owner_department_id: await firstPersonDepartment(workspaceId, data.submitter_id, data.reviewer_id, step?.owner_id, task?.owner_id),
    assignee_ids: task?.assignee_ids ?? [],
    supporter_ids: task?.supporter_ids ?? [],
    member_ids: compact([
      data.submitter_id,
      data.reviewer_id,
      step?.owner_id,
      task?.owner_id,
      ...(task?.member_ids ?? []),
    ]),
  }
}

async function personDepartment(workspaceId: string, personId: string | null | undefined) {
  if (!personId) return null
  const client = createServiceClient()
  const { data, error } = await client
    .from('people')
    .select('department_id')
    .eq('workspace_id', workspaceId)
    .eq('id', personId)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) return null
  return data?.department_id ?? null
}

async function firstPersonDepartment(workspaceId: string, ...personIds: Array<string | null | undefined>) {
  for (const personId of personIds) {
    const departmentId = await personDepartment(workspaceId, personId)
    if (departmentId) return departmentId
  }
  return null
}

async function taskAssigneeIds(taskId: string) {
  const client = createServiceClient()
  const { data, error } = await client
    .from('task_assignees')
    .select('person_id')
    .eq('task_id', taskId)
  if (error) return []
  return compact((data ?? []).map((row) => row.person_id as string | null))
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function compact(values: Array<string | null | undefined>) {
  return values.filter((value): value is string => Boolean(value))
}
