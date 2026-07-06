import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  ensureLocalQaWriteAllowed,
  guardExistingEntityWrite,
  isLocalProductionDatabaseRequest,
} from '@/lib/localQaGuard'
import { getCurrentUserProfile, type RbacClient } from '@/lib/rbac/permissions'
import {
  canCreateWorkspaceEntity,
  canEditWorkspaceEntity,
  RBAC_FORBIDDEN_MESSAGE,
} from '@/lib/rbac/workspaceResourceAccess'
import { createServiceClient } from '@/lib/supabase/service'

type EntityType = 'project' | 'workstream' | 'task' | 'step' | 'meeting'
type StepTemplate = 'none' | 'basic' | 'approval'
type WorkspaceAuth = Exclude<Awaited<ReturnType<typeof getWorkspace>>, { response: NextResponse }>
type SoftDeleteTable = 'projects' | 'workstreams' | 'tasks' | 'task_steps' | 'deliverables' | 'meetings'

export async function POST(request: Request) {
  const auth = await getWorkspace()
  if ('response' in auth) return auth.response

  const body = (await request.json()) as { type?: EntityType; payload?: Record<string, unknown> }
  const payload = body.payload ?? {}

  try {
    const guard = await guardWorkspaceCreate(request, auth, body.type, payload)
    if (guard) return guard
    const rbacGuard = await guardWorkspaceCreatePermission(auth, body.type, payload)
    if (rbacGuard) return rbacGuard

    if (body.type === 'project') {
      const result = await auth.sb.from('projects').insert({
        workspace_id: auth.workspaceId,
        name: text(payload.name) || 'Dự án mới',
        code: text(payload.code) || null,
        description: text(payload.description) || null,
        owner_id: text(payload.ownerId) || null,
        start_date: dateOrNull(payload.startDate),
        due_date: dateOrNull(payload.dueDate),
        status: 'active',
        health_status: 'NO_DATA',
      }).select('id').single()
      if (result.error) throw result.error
      await logActivity(auth, 'CREATE_PROJECT', 'project', result.data.id, payload)
      return NextResponse.json({ id: result.data.id })
    }

    if (body.type === 'workstream') {
      const result = await auth.sb.from('workstreams').insert({
        workspace_id: auth.workspaceId,
        project_id: requiredText(payload.projectId, 'Thiếu dự án cho đầu việc lớn.'),
        name: text(payload.name) || 'Đầu việc lớn mới',
        description: text(payload.description) || null,
        owner_id: text(payload.ownerId) || null,
        start_date: dateOrNull(payload.startDate),
        due_date: dateOrNull(payload.dueDate),
        status: 'active',
        priority: 'MEDIUM',
      }).select('id').single()
      if (result.error) throw result.error
      await logActivity(auth, 'CREATE_WORKSTREAM', 'workstream', result.data.id, payload)
      return NextResponse.json({ id: result.data.id })
    }

    if (body.type === 'task') {
      const taskRes = await auth.sb.from('tasks').insert({
        workspace_id: auth.workspaceId,
        project_id: requiredText(payload.projectId, 'Thiếu dự án cho đầu việc con.'),
        workstream_id: requiredText(payload.workstreamId, 'Thiếu đầu việc lớn cho đầu việc con.'),
        title: text(payload.name) || 'Đầu việc con mới',
        description: text(payload.description) || null,
        expected_result: text(payload.expectedResult) || null,
        owner_id: text(payload.ownerId) || null,
        start_date: dateOrNull(payload.startDate),
        due_date: dateOrNull(payload.dueDate),
        status: 'NOT_STARTED',
        priority: 'MEDIUM',
      }).select('id,title,project_id,owner_id,start_date,due_date').single()
      if (taskRes.error) throw taskRes.error

      const dueDate = taskRes.data.due_date ?? dateOrNull(payload.dueDate)
      const templateSteps = buildTemplateSteps(
        auth.workspaceId,
        taskRes.data.id,
        taskRes.data.owner_id,
        taskRes.data.start_date ?? dateOrNull(payload.startDate),
        dueDate,
        parseStepTemplate(payload.stepTemplate),
      )
      let submitStepId: string | null = null

      if (templateSteps.length) {
        const stepsRes = await auth.sb.from('task_steps').insert(templateSteps).select('id,sort_order')
        if (stepsRes.error) throw stepsRes.error
        submitStepId = stepsRes.data?.find((step) => step.sort_order === 3)?.id ?? null
      }

      if (payload.needsFile !== false) {
        await auth.sb.from('deliverables').insert({
          workspace_id: auth.workspaceId,
          project_id: taskRes.data.project_id,
          task_id: taskRes.data.id,
          step_id: submitStepId,
          name: `Kết quả: ${taskRes.data.title}`,
          type: 'report',
          submitter_id: taskRes.data.owner_id,
          due_date: dueDate,
          status: 'REQUIRED',
          is_required: true,
        })
      }

      await logActivity(auth, 'CREATE_TASK', 'task', taskRes.data.id, payload)
      return NextResponse.json({ id: taskRes.data.id })
    }

    if (body.type === 'step') {
      const taskId = requiredText(payload.taskId, 'Thiếu đầu việc con cho bước.')
      const result = await auth.sb.from('task_steps').insert({
        workspace_id: auth.workspaceId,
        task_id: taskId,
        title: text(payload.title) || 'Bước mới',
        description: text(payload.description) || null,
        owner_id: text(payload.ownerId) || null,
        start_date: dateOrNull(payload.startDate),
        due_date: dateOrNull(payload.dueDate),
        is_required: payload.isRequired !== false,
        status: text(payload.status) || 'NOT_STARTED',
        priority: 'MEDIUM',
      }).select('id').single()
      if (result.error) throw result.error
      if (payload.requiresDeliverable === true) await ensureStepDeliverable(auth, result.data.id)
      await logActivity(auth, 'CREATE_STEP', 'task_step', result.data.id, payload)
      return NextResponse.json({ id: result.data.id })
    }

    if (body.type === 'meeting') {
      const result = await auth.sb.from('meetings').insert({
        workspace_id: auth.workspaceId,
        project_id: requiredText(payload.projectId, 'Thiếu dự án cho cuộc họp.'),
        title: text(payload.name) || 'Cuộc họp mới',
        start_at: dateTimeOrNull(payload.schedule),
        status: 'scheduled',
        objective: [text(payload.cadence), text(payload.recap), text(payload.filesNeeded), text(payload.links)]
          .filter(Boolean)
          .join('\n'),
      }).select('id').single()
      if (result.error) throw result.error
      await logActivity(auth, 'CREATE_MEETING', 'meeting', result.data.id, payload)
      return NextResponse.json({ id: result.data.id })
    }

    return NextResponse.json({ error: 'Loại thao tác chưa được hỗ trợ.' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  const auth = await getWorkspace()
  if ('response' in auth) return auth.response

  const body = (await request.json()) as { type?: EntityType; id?: string; patch?: Record<string, unknown> }
  if (!body.type || !body.id) return NextResponse.json({ error: 'Thiếu loại hoặc id cần cập nhật.' }, { status: 400 })
  const patch = body.patch ?? {}

  try {
    const guard = await guardWorkspaceExistingWrite(request, auth, body.type, body.id)
    if (guard) return guard
    const rbacGuard = await guardWorkspaceExistingPermission(auth, body.type, body.id)
    if (rbacGuard) return rbacGuard

    let updated: unknown = null
    if (body.type === 'project') updated = await updateEntity(auth, 'projects', body.id, mapPatch(patch, ['name', 'description', 'ownerId', 'startDate', 'dueDate', 'status']))
    else if (body.type === 'workstream') updated = await updateEntity(auth, 'workstreams', body.id, mapPatch(patch, ['name', 'description', 'ownerId', 'startDate', 'dueDate', 'status', 'priority']))
    else if (body.type === 'task') updated = await updateEntity(auth, 'tasks', body.id, mapTaskPatch(patch))
    else if (body.type === 'step') {
      updated = await updateEntity(auth, 'task_steps', body.id, mapPatch(patch, ['title', 'description', 'ownerId', 'startDate', 'dueDate', 'status', 'isRequired', 'priority']))
      if (patch.requiresDeliverable === true) await ensureStepDeliverable(auth, body.id)
      if (patch.requiresDeliverable === false) await disableStepDeliverable(auth, body.id)
    }
    else return NextResponse.json({ error: 'Loại thao tác chưa được hỗ trợ.' }, { status: 400 })

    await logActivity(auth, 'UPDATE_WORKSPACE_ITEM', body.type, body.id, patch)
    return NextResponse.json({ ok: true, item: updated })
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  const auth = await getWorkspace()
  if ('response' in auth) return auth.response

  const body = (await request.json()) as { type?: EntityType; id?: string }
  if (!body.type || !body.id) return NextResponse.json({ error: 'Thiếu loại hoặc id cần xóa.' }, { status: 400 })

  try {
    const guard = await guardWorkspaceExistingWrite(request, auth, body.type, body.id)
    if (guard) return guard
    const rbacGuard = await guardWorkspaceExistingPermission(auth, body.type, body.id)
    if (rbacGuard) return rbacGuard

    if (body.type === 'project') await softDeleteProject(auth, body.id)
    else if (body.type === 'workstream') await softDeleteWorkstream(auth, body.id)
    else if (body.type === 'task') await softDeleteTask(auth, body.id)
    else if (body.type === 'step') await softDeleteStep(auth, body.id)
    else return NextResponse.json({ error: 'Loại thao tác chưa hỗ trợ xóa mềm.' }, { status: 400 })

    await logActivity(auth, 'SOFT_DELETE', body.type, body.id, {})
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}

async function guardWorkspaceCreate(
  request: Request,
  auth: WorkspaceAuth,
  type: EntityType | undefined,
  payload: Record<string, unknown>,
) {
  if (!isLocalProductionDatabaseRequest(request)) return null

  if (type === 'project') {
    return ensureLocalQaWriteAllowed(request, payload, 'Muon ghi QA tu localhost vao production phai bat server-side env ALLOW_LOCAL_PROD_QA_WRITES.')
  }

  if (type === 'workstream') {
    return guardExistingEntityWrite({
      request,
      client: auth.sb,
      table: 'projects',
      id: text(payload.projectId),
      workspaceId: auth.workspaceId,
      fields: ['name', 'code'],
      detail: 'Không được tạo đầu việc lớn trong dự án thật từ localhost.',
    })
  }

  if (type === 'task') {
    return guardExistingEntityWrite({
      request,
      client: auth.sb,
      table: 'projects',
      id: text(payload.projectId),
      workspaceId: auth.workspaceId,
      fields: ['name', 'code'],
      detail: 'Không được tạo đầu việc con trong dự án thật từ localhost.',
    })
  }

  if (type === 'step') {
    return guardExistingEntityWrite({
      request,
      client: auth.sb,
      table: 'tasks',
      id: text(payload.taskId),
      workspaceId: auth.workspaceId,
      fields: ['title'],
      detail: 'Không được tạo bước trong đầu việc thật từ localhost.',
    })
  }

  if (type === 'meeting') {
    return guardExistingEntityWrite({
      request,
      client: auth.sb,
      table: 'projects',
      id: text(payload.projectId),
      workspaceId: auth.workspaceId,
      fields: ['name', 'code'],
      detail: 'Không được tạo cuộc họp trong dự án thật từ localhost.',
    })
  }

  return ensureLocalQaWriteAllowed(request, { type, payload })
}

async function guardWorkspaceExistingWrite(
  request: Request,
  auth: WorkspaceAuth,
  type: EntityType,
  id: string,
) {
  const config = workspaceEntityGuardConfig(type)
  if (!config) return ensureLocalQaWriteAllowed(request, { type, id })

  return guardExistingEntityWrite({
    request,
    client: auth.sb,
    table: config.table,
    id,
    workspaceId: auth.workspaceId,
    fields: config.fields,
    detail: `Không được sửa hoặc xóa ${config.label} thật từ localhost.`,
  })
}

async function guardWorkspaceCreatePermission(
  auth: WorkspaceAuth,
  type: EntityType | undefined,
  payload: Record<string, unknown>,
) {
  const allowed = await canCreateWorkspaceEntity(auth.actor, auth.workspaceId, type, payload)
  return allowed ? null : NextResponse.json({ error: RBAC_FORBIDDEN_MESSAGE }, { status: 403 })
}

async function guardWorkspaceExistingPermission(
  auth: WorkspaceAuth,
  type: EntityType,
  id: string,
) {
  const allowed = await canEditWorkspaceEntity(auth.actor, auth.workspaceId, type, id)
  return allowed ? null : NextResponse.json({ error: RBAC_FORBIDDEN_MESSAGE }, { status: 403 })
}

function workspaceEntityGuardConfig(type: EntityType) {
  if (type === 'project') return { table: 'projects', fields: ['name', 'code'], label: 'dự án' } as const
  if (type === 'workstream') return { table: 'workstreams', fields: ['name'], label: 'đầu việc lớn' } as const
  if (type === 'task') return { table: 'tasks', fields: ['title'], label: 'đầu việc con' } as const
  if (type === 'step') return { table: 'task_steps', fields: ['title'], label: 'bước' } as const
  if (type === 'meeting') return { table: 'meetings', fields: ['title'], label: 'cuộc họp' } as const
  return null
}

async function getWorkspace() {
  const sb = await createClient()
  const {
    data: { user },
  } = await sb.auth.getUser()

  if (!user) return { response: NextResponse.json({ error: 'Bạn cần đăng nhập.' }, { status: 401 }) }

  const profileRes = await sb.from('profiles').select('id').eq('auth_user_id', user.id).maybeSingle()
  if (profileRes.error || !profileRes.data?.id) {
    return { response: NextResponse.json({ error: 'Tài khoản chưa có profile trong workspace.' }, { status: 403 }) }
  }

  const membershipRes = await sb
    .from('workspace_memberships')
    .select('workspace_id')
    .eq('profile_id', profileRes.data.id)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()

  if (membershipRes.error || !membershipRes.data?.workspace_id) {
    return { response: NextResponse.json({ error: 'Tài khoản chưa được gắn workspace.' }, { status: 403 }) }
  }

  const actor = await getCurrentUserProfile(sb as unknown as RbacClient)
  if (!actor || actor.workspaceId !== membershipRes.data.workspace_id) {
    return { response: NextResponse.json({ error: RBAC_FORBIDDEN_MESSAGE }, { status: 403 }) }
  }

  return { sb: createServiceClient(), workspaceId: membershipRes.data.workspace_id, actor }
}

async function updateEntity(
  auth: Exclude<Awaited<ReturnType<typeof getWorkspace>>, { response: NextResponse }>,
  table: 'projects' | 'workstreams' | 'tasks' | 'task_steps',
  id: string,
  patch: Record<string, unknown>,
) {
  const result = await auth.sb.from(table).update(patch).eq('id', id).eq('workspace_id', auth.workspaceId).select('*').maybeSingle()
  if (result.error) throw result.error
  if (!result.data) throw new Error('Không tìm thấy bản ghi cần cập nhật.')
  return result.data
}

async function softDeleteProject(auth: WorkspaceAuth, projectId: string) {
  const now = new Date().toISOString()
  const taskIds = await selectTaskIdsByProject(auth, projectId)
  const stepIds = await selectStepIdsByTasks(auth, taskIds)
  const deliverableIds = await selectDeliverableIds(auth, { projectId, taskIds, stepIds })

  await markDeletedByIds(auth, 'projects', [projectId], now)
  await markDeletedWhere(auth, 'workstreams', 'project_id', projectId, now)
  await markDeletedByIds(auth, 'tasks', taskIds, now)
  await markDeletedByIds(auth, 'task_steps', stepIds, now)
  await markDeletedByIds(auth, 'deliverables', deliverableIds, now)
  await markDeletedWhere(auth, 'meetings', 'project_id', projectId, now)
  await closeReminders(auth, { taskIds, deliverableIds }, now)
  await cancelApprovals(auth, { projectId, taskIds, stepIds, deliverableIds }, now)
  await closeCeoRequests(auth, projectId)
}

async function softDeleteWorkstream(auth: WorkspaceAuth, workstreamId: string) {
  const now = new Date().toISOString()
  const taskIds = await selectTaskIdsByWorkstream(auth, workstreamId)
  const stepIds = await selectStepIdsByTasks(auth, taskIds)
  const deliverableIds = await selectDeliverableIds(auth, { taskIds, stepIds })

  await markDeletedByIds(auth, 'workstreams', [workstreamId], now)
  await markDeletedByIds(auth, 'tasks', taskIds, now)
  await markDeletedByIds(auth, 'task_steps', stepIds, now)
  await markDeletedByIds(auth, 'deliverables', deliverableIds, now)
  await closeReminders(auth, { taskIds, deliverableIds }, now)
  await cancelApprovals(auth, { taskIds, stepIds, deliverableIds }, now)
}

async function softDeleteTask(auth: WorkspaceAuth, taskId: string) {
  const now = new Date().toISOString()
  const stepIds = await selectStepIdsByTasks(auth, [taskId])
  const deliverableIds = await selectDeliverableIds(auth, { taskIds: [taskId], stepIds })

  await markDeletedByIds(auth, 'tasks', [taskId], now)
  await markDeletedByIds(auth, 'task_steps', stepIds, now)
  await markDeletedByIds(auth, 'deliverables', deliverableIds, now)
  await closeReminders(auth, { taskIds: [taskId], deliverableIds }, now)
  await cancelApprovals(auth, { taskIds: [taskId], stepIds, deliverableIds }, now)
}

async function softDeleteStep(auth: WorkspaceAuth, stepId: string) {
  const now = new Date().toISOString()
  const deliverableIds = await selectDeliverableIds(auth, { stepIds: [stepId] })

  await markDeletedByIds(auth, 'task_steps', [stepId], now)
  await markDeletedByIds(auth, 'deliverables', deliverableIds, now)
  await closeReminders(auth, { deliverableIds }, now)
  await cancelApprovals(auth, { stepIds: [stepId], deliverableIds }, now)
}

async function selectTaskIdsByProject(auth: WorkspaceAuth, projectId: string) {
  const result = await auth.sb
    .from('tasks')
    .select('id')
    .eq('workspace_id', auth.workspaceId)
    .eq('project_id', projectId)
    .is('deleted_at', null)
  if (result.error) throw result.error
  return idsFromRows(result.data)
}

async function selectTaskIdsByWorkstream(auth: WorkspaceAuth, workstreamId: string) {
  const result = await auth.sb
    .from('tasks')
    .select('id')
    .eq('workspace_id', auth.workspaceId)
    .eq('workstream_id', workstreamId)
    .is('deleted_at', null)
  if (result.error) throw result.error
  return idsFromRows(result.data)
}

async function selectStepIdsByTasks(auth: WorkspaceAuth, taskIds: string[]) {
  if (!taskIds.length) return []
  const result = await auth.sb
    .from('task_steps')
    .select('id')
    .eq('workspace_id', auth.workspaceId)
    .in('task_id', taskIds)
    .is('deleted_at', null)
  if (result.error) throw result.error
  return idsFromRows(result.data)
}

async function selectDeliverableIds(
  auth: WorkspaceAuth,
  scope: { projectId?: string; taskIds?: string[]; stepIds?: string[] },
) {
  const groups: string[][] = []

  if (scope.projectId) {
    const result = await auth.sb
      .from('deliverables')
      .select('id')
      .eq('workspace_id', auth.workspaceId)
      .eq('project_id', scope.projectId)
      .is('deleted_at', null)
    if (result.error) throw result.error
    groups.push(idsFromRows(result.data))
  }

  if (scope.taskIds?.length) {
    const result = await auth.sb
      .from('deliverables')
      .select('id')
      .eq('workspace_id', auth.workspaceId)
      .in('task_id', scope.taskIds)
      .is('deleted_at', null)
    if (result.error) throw result.error
    groups.push(idsFromRows(result.data))
  }

  if (scope.stepIds?.length) {
    const result = await auth.sb
      .from('deliverables')
      .select('id')
      .eq('workspace_id', auth.workspaceId)
      .in('step_id', scope.stepIds)
      .is('deleted_at', null)
    if (result.error) throw result.error
    groups.push(idsFromRows(result.data))
  }

  return unique(groups.flat())
}

async function markDeletedByIds(auth: WorkspaceAuth, table: SoftDeleteTable, ids: string[], deletedAt: string) {
  if (!ids.length) return
  const result = await auth.sb
    .from(table)
    .update({ deleted_at: deletedAt })
    .eq('workspace_id', auth.workspaceId)
    .in('id', unique(ids))
  if (result.error) throw result.error
}

async function markDeletedWhere(
  auth: WorkspaceAuth,
  table: Extract<SoftDeleteTable, 'workstreams' | 'meetings'>,
  column: 'project_id',
  value: string,
  deletedAt: string,
) {
  const result = await auth.sb
    .from(table)
    .update({ deleted_at: deletedAt })
    .eq('workspace_id', auth.workspaceId)
    .eq(column, value)
    .is('deleted_at', null)
  if (result.error) throw result.error
}

async function closeReminders(
  auth: WorkspaceAuth,
  scope: { taskIds?: string[]; deliverableIds?: string[] },
  updatedAt: string,
) {
  const patch = { status: 'closed', response_status: 'CLOSED', updated_at: updatedAt }

  if (scope.taskIds?.length) {
    const result = await auth.sb
      .from('reminders')
      .update(patch)
      .eq('workspace_id', auth.workspaceId)
      .in('task_id', unique(scope.taskIds))
    if (result.error) throw result.error
  }

  if (scope.deliverableIds?.length) {
    const result = await auth.sb
      .from('reminders')
      .update(patch)
      .eq('workspace_id', auth.workspaceId)
      .in('deliverable_id', unique(scope.deliverableIds))
    if (result.error) throw result.error
  }
}

async function cancelApprovals(
  auth: WorkspaceAuth,
  scope: { projectId?: string; taskIds?: string[]; stepIds?: string[]; deliverableIds?: string[] },
  updatedAt: string,
) {
  const patch = { status: 'CANCELLED', updated_at: updatedAt }

  if (scope.projectId) {
    const result = await auth.sb
      .from('approvals')
      .update(patch)
      .eq('workspace_id', auth.workspaceId)
      .eq('project_id', scope.projectId)
    if (result.error) throw result.error
  }

  if (scope.taskIds?.length) {
    const result = await auth.sb
      .from('approvals')
      .update(patch)
      .eq('workspace_id', auth.workspaceId)
      .in('task_id', unique(scope.taskIds))
    if (result.error) throw result.error
  }

  if (scope.stepIds?.length) {
    const result = await auth.sb
      .from('approvals')
      .update(patch)
      .eq('workspace_id', auth.workspaceId)
      .in('step_id', unique(scope.stepIds))
    if (result.error) throw result.error
  }

  if (scope.deliverableIds?.length) {
    const result = await auth.sb
      .from('approvals')
      .update(patch)
      .eq('workspace_id', auth.workspaceId)
      .in('deliverable_id', unique(scope.deliverableIds))
    if (result.error) throw result.error
  }
}

async function closeCeoRequests(auth: WorkspaceAuth, projectId: string) {
  const result = await auth.sb
    .from('ceo_decision_requests')
    .update({ status: 'closed', updated_at: new Date().toISOString() })
    .eq('workspace_id', auth.workspaceId)
    .eq('project_id', projectId)
  if (result.error) throw result.error
}

function idsFromRows(rows: { id: string }[] | null) {
  return unique((rows ?? []).map((row) => row.id))
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)))
}

function mapPatch(input: Record<string, unknown>, allowed: string[]) {
  const out: Record<string, unknown> = {}
  if (allowed.includes('name') && input.name !== undefined) out.name = text(input.name)
  if (allowed.includes('title') && input.title !== undefined) out.title = text(input.title)
  if (allowed.includes('description') && input.description !== undefined) out.description = text(input.description)
  if (allowed.includes('expectedResult') && input.expectedResult !== undefined) out.expected_result = text(input.expectedResult)
  if (allowed.includes('ownerId') && input.ownerId !== undefined) out.owner_id = text(input.ownerId) || null
  if (allowed.includes('startDate') && input.startDate !== undefined) out.start_date = dateOrNull(input.startDate)
  if (allowed.includes('dueDate') && input.dueDate !== undefined) out.due_date = dateOrNull(input.dueDate)
  if (allowed.includes('status') && input.status !== undefined) out.status = text(input.status)
  if (allowed.includes('isRequired') && input.isRequired !== undefined) out.is_required = input.isRequired !== false
  if (allowed.includes('priority') && input.priority !== undefined) out.priority = text(input.priority)
  return out
}

function mapTaskPatch(input: Record<string, unknown>) {
  const out = mapPatch(input, ['title', 'description', 'ownerId', 'startDate', 'dueDate', 'status', 'expectedResult', 'priority'])
  if (input.name !== undefined) out.title = text(input.name)
  return out
}

function buildTemplateSteps(
  workspaceId: string,
  taskId: string,
  ownerId: string | null,
  startDate: string | null,
  dueDate: string | null,
  template: StepTemplate,
) {
  if (template === 'none') return []

  const intakeDate = startDate ?? dueDate
  const executionDate = dueDate ? shiftDate(dueDate, -1) : dueDate
  const steps = [
    stepPayload(
      workspaceId,
      taskId,
      'Nhận việc & xác nhận yêu cầu',
      'Xác nhận đã hiểu yêu cầu, phạm vi và đầu ra cần nộp.',
      ownerId,
      startDate,
      intakeDate,
      1,
      true,
    ),
    stepPayload(
      workspaceId,
      taskId,
      'Thực hiện công việc',
      'Hoàn thành phần xử lý chính của đầu việc con.',
      ownerId,
      startDate,
      executionDate,
      2,
      true,
    ),
    stepPayload(
      workspaceId,
      taskId,
      'Nộp kết quả / file / báo cáo',
      'Nộp file, đường link hoặc báo cáo kết quả để đủ điều kiện hoàn thành.',
      ownerId,
      executionDate,
      dueDate,
      3,
      true,
    ),
  ]

  if (template === 'approval') {
    steps.push(
      stepPayload(
        workspaceId,
        taskId,
        'Chờ duyệt kết quả',
        'Người duyệt kiểm tra kết quả và phản hồi nếu cần sửa.',
        ownerId,
        dueDate,
        dueDate,
        4,
        true,
      ),
    )
  }

  return steps
}

function stepPayload(
  workspaceId: string,
  taskId: string,
  title: string,
  description: string,
  ownerId: string | null,
  startDate: string | null,
  dueDate: string | null,
  sortOrder: number,
  isRequired: boolean,
) {
  return {
    workspace_id: workspaceId,
    task_id: taskId,
    title,
    description,
    owner_id: ownerId,
    status: 'NOT_STARTED',
    priority: 'MEDIUM',
    start_date: startDate,
    due_date: dueDate,
    is_required: isRequired,
    sort_order: sortOrder,
  }
}

async function ensureStepDeliverable(
  auth: Exclude<Awaited<ReturnType<typeof getWorkspace>>, { response: NextResponse }>,
  stepId: string,
) {
  const existing = await auth.sb
    .from('deliverables')
    .select('id')
    .eq('workspace_id', auth.workspaceId)
    .eq('step_id', stepId)
    .maybeSingle()
  if (existing.error) throw existing.error
  if (existing.data?.id) {
    const updateRes = await auth.sb
      .from('deliverables')
      .update({ is_required: true })
      .eq('id', existing.data.id)
      .eq('workspace_id', auth.workspaceId)
    if (updateRes.error) throw updateRes.error
    return
  }

  const stepRes = await auth.sb
    .from('task_steps')
    .select('id,task_id,title,description,owner_id,due_date,tasks!task_steps_task_id_fkey(project_id)')
    .eq('workspace_id', auth.workspaceId)
    .eq('id', stepId)
    .maybeSingle()
  if (stepRes.error) throw stepRes.error
  const step = stepRes.data as {
    id: string
    task_id: string
    title: string
    description: string | null
    owner_id: string | null
    due_date: string | null
    tasks: { project_id: string | null } | null
  } | null
  if (!step) return

  const insertRes = await auth.sb.from('deliverables').insert({
    workspace_id: auth.workspaceId,
    project_id: step.tasks?.project_id ?? null,
    task_id: step.task_id,
    step_id: step.id,
    name: `Bàn giao: ${step.title}`,
    required_format: step.description,
    type: 'report',
    submitter_id: step.owner_id,
    due_date: step.due_date,
    status: 'REQUIRED',
    is_required: true,
  })
  if (insertRes.error) throw insertRes.error
}

async function disableStepDeliverable(
  auth: Exclude<Awaited<ReturnType<typeof getWorkspace>>, { response: NextResponse }>,
  stepId: string,
) {
  const result = await auth.sb
    .from('deliverables')
    .update({ is_required: false })
    .eq('workspace_id', auth.workspaceId)
    .eq('step_id', stepId)
  if (result.error) throw result.error
}

function parseStepTemplate(value: unknown): StepTemplate {
  if (value === 'none' || value === 'approval') return value
  return 'basic'
}

function shiftDate(value: string | null, delta: number) {
  if (!value) return null
  const next = new Date(value)
  next.setDate(next.getDate() + delta)
  return next.toISOString().slice(0, 10)
}

async function logActivity(
  auth: Exclude<Awaited<ReturnType<typeof getWorkspace>>, { response: NextResponse }>,
  action: string,
  entityType: string,
  entityId: string,
  metadata: Record<string, unknown>,
) {
  await auth.sb.from('activity_logs').insert({
    workspace_id: auth.workspaceId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    metadata,
  })
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function requiredText(value: unknown, message: string) {
  const next = text(value)
  if (!next) throw new Error(message)
  return next
}

function dateOrNull(value: unknown) {
  const next = text(value)
  return /^\d{4}-\d{2}-\d{2}$/.test(next) ? next : null
}

function dateTimeOrNull(value: unknown) {
  const next = text(value)
  if (!next) return null
  const parsed = new Date(next.replace(' ', 'T'))
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Không thể cập nhật database.'
}
