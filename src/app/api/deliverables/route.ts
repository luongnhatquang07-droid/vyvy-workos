import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { createClient as createServerClient } from '@/lib/supabase/server'
import {
  isVersionInvalid,
  isVersionPending,
  isVersionRevision,
  normalizeVersionReviewStatus,
  type VersionReviewStatus,
} from '@/lib/deliverableVersionStatus'
import {
  ensureLocalQaWriteAllowed,
  guardExistingEntityWrite,
  isLocalProductionDatabaseRequest,
  localQaGuardResponse,
  qaPrefixFound,
} from '@/lib/localQaGuard'

const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'project-files'

type WorkspaceContext =
  | { ok: true; workspaceId: string; profileId: string; personId: string | null }
  | { ok: false; response: NextResponse }

type DeliverableStatus = 'REQUIRED' | 'NOT_SUBMITTED' | 'SUBMITTED' | 'MISSING_INFORMATION' | 'REVISION_REQUIRED' | 'APPROVED'
type ReviewStatus = VersionReviewStatus
type ServiceClient = ReturnType<typeof createServiceClient>
type TaskStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'WAITING' | 'BLOCKED' | 'PENDING_APPROVAL' | 'REVISION_REQUIRED' | 'COMPLETED' | 'CANCELLED'

interface TaskSyncResult {
  taskId: string | null
  status: TaskStatus | null
  completed: boolean
  blockers: string[]
  autoCompletedStepIds: string[]
}

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

function cleanId(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function cleanText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function cleanDate(value: unknown) {
  const text = cleanText(value)
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null
}

async function getWorkspaceContext(workspaceId: string): Promise<WorkspaceContext> {
  if (!workspaceId) return { ok: false, response: jsonError('Thiếu workspaceId.', 400) }

  const sb = await createServerClient()
  const {
    data: { user },
  } = await sb.auth.getUser()

  if (!user) return { ok: false, response: jsonError('Bạn cần đăng nhập trước khi thao tác bàn giao.', 401) }

  const profileRes = await sb
    .from('profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (profileRes.error) return { ok: false, response: jsonError('Không kiểm tra được hồ sơ đăng nhập.', 500) }
  if (!profileRes.data?.id) return { ok: false, response: jsonError('Tài khoản chưa có profile trong workspace.', 403) }

  const membershipRes = await sb
    .from('workspace_memberships')
    .select('workspace_id, profile_id')
    .eq('profile_id', profileRes.data.id)
    .eq('workspace_id', workspaceId)
    .eq('is_active', true)
    .maybeSingle()

  if (membershipRes.error) return { ok: false, response: jsonError('Không kiểm tra được quyền workspace.', 500) }
  if (!membershipRes.data) return { ok: false, response: jsonError('Tài khoản không có quyền trong workspace này.', 403) }

  const personRes = await sb
    .from('people')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('profile_id', profileRes.data.id)
    .is('deleted_at', null)
    .maybeSingle()

  return {
    ok: true,
    workspaceId,
    profileId: profileRes.data.id,
    personId: personRes.data?.id ?? null,
  }
}

async function ensureEntityInWorkspace(
  table: 'projects' | 'tasks' | 'task_steps' | 'deliverables' | 'people',
  id: string | null,
  workspaceId: string,
) {
  if (!id) return true
  const client = createServiceClient()
  const { data, error } = await client
    .from(table)
    .select('id')
    .eq('id', id)
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .maybeSingle()
  return !error && Boolean(data)
}

async function nextVersionNumber(deliverableId: string) {
  const client = createServiceClient()
  const { count, error } = await client
    .from('deliverable_versions')
    .select('*', { count: 'exact', head: true })
    .eq('deliverable_id', deliverableId)
  if (error) throw error
  return (count ?? 0) + 1
}

async function getLatestVersion(deliverableId: string) {
  const client = createServiceClient()
  const { data, error } = await client
    .from('deliverable_versions')
    .select('id,version_number,review_status')
    .eq('deliverable_id', deliverableId)
    .order('version_number', { ascending: false })
  if (error) throw error
  const versions = (data ?? []) as Array<{ id: string; version_number: number; review_status: string | null }>
  const latest = versions.find((version) => !isVersionInvalid(normalizeVersionReviewStatus(version.review_status)))
  return latest
    ? { ...latest, review_status: normalizeVersionReviewStatus(latest.review_status) }
    : null
}

async function loadDeliverableDetail(workspaceId: string, deliverableId: string) {
  const client = createServiceClient()
  const deliverableRes = await client
    .from('deliverables')
    .select('id,workspace_id,project_id,task_id,step_id,name,description,type,required_format,submitter_id,reviewer_id,due_date,status,is_required,approved_version_id,created_at,updated_at')
    .eq('workspace_id', workspaceId)
    .eq('id', deliverableId)
    .is('deleted_at', null)
    .maybeSingle()

  if (deliverableRes.error) throw deliverableRes.error
  if (!deliverableRes.data) return null

  const versionsRes = await client
    .from('deliverable_versions')
    .select('id,deliverable_id,version_number,attachment_id,external_url,submitted_by,submitted_at,change_note,review_status,review_comment,reviewed_by,reviewed_at')
    .eq('deliverable_id', deliverableId)
    .order('version_number', { ascending: false })

  if (versionsRes.error) throw versionsRes.error

  const versions = versionsRes.data ?? []
  const attachmentIds = versions.map((version) => version.attachment_id).filter(Boolean) as string[]
  const attachmentsById: Record<string, {
    id: string
    file_name: string | null
    mime_type: string | null
    size_bytes: number | null
    storage_path: string
    uploaded_by: string | null
    uploaded_at: string | null
  }> = {}

  if (attachmentIds.length) {
    const attachmentsRes = await client
      .from('attachments')
      .select('id,file_name,mime_type,size_bytes,storage_path,uploaded_by,uploaded_at')
      .in('id', attachmentIds)
      .is('deleted_at', null)
    if (attachmentsRes.error) throw attachmentsRes.error
    for (const attachment of attachmentsRes.data ?? []) {
      attachmentsById[attachment.id] = attachment
    }
  }

  const versionsWithFiles = await Promise.all(versions.map(async (version) => {
    const attachment = version.attachment_id ? attachmentsById[version.attachment_id] : null
    let signedUrl: string | null = null
    if (attachment?.storage_path) {
      const { data } = await client.storage.from(STORAGE_BUCKET).createSignedUrl(attachment.storage_path, 3600)
      signedUrl = data?.signedUrl ?? null
    }
    return {
      ...version,
      storageMode: version.external_url ? 'external_url' : 'supabase',
      attachment: attachment
        ? {
            ...attachment,
            url: signedUrl,
          }
        : null,
    }
  }))

  return { deliverable: deliverableRes.data, versions: versionsWithFiles }
}

async function closeRelatedReminders(workspaceId: string, deliverableId: string) {
  const client = createServiceClient()
  await client
    .from('reminders')
    .update({
      response_status: 'FILE_SUBMITTED',
      status: 'closed',
      updated_at: new Date().toISOString(),
    })
    .eq('workspace_id', workspaceId)
    .eq('deliverable_id', deliverableId)
}

async function ensureApproval({
  workspaceId,
  deliverableId,
  projectId,
  taskId,
  stepId,
  requesterId,
  approverId,
  dueAt,
}: {
  workspaceId: string
  deliverableId: string
  projectId: string | null
  taskId: string | null
  stepId: string | null
  requesterId: string | null
  approverId: string | null
  dueAt: string | null
}) {
  const client = createServiceClient()
  const existing = await client
    .from('approvals')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('deliverable_id', deliverableId)
    .in('status', ['PENDING', 'PENDING_REVIEW', 'REVISION_REQUESTED', 'REJECTED'])
    .limit(1)
    .maybeSingle()

  if (existing.error) throw existing.error

  const payload = {
    project_id: projectId,
    task_id: taskId,
    step_id: stepId,
    requested_by: requesterId,
    approver_id: approverId,
    due_at: dueAt,
    status: 'PENDING',
    completed_at: null,
    is_required: true,
    updated_at: new Date().toISOString(),
  }

  if (existing.data?.id) {
    const updateRes = await client.from('approvals').update(payload).eq('id', existing.data.id)
    if (updateRes.error) throw updateRes.error
    await client.from('approval_actions').insert({
      approval_id: existing.data.id,
      action: 'REQUESTED',
      actor_id: requesterId,
      comment: 'Cập nhật người xác nhận cho version mới.',
    })
    return existing.data.id as string
  }

  const insertRes = await client.from('approvals').insert({
    workspace_id: workspaceId,
    deliverable_id: deliverableId,
    ...payload,
  }).select('id').single()
  if (insertRes.error || !insertRes.data) throw insertRes.error ?? new Error('Không tạo được approval.')
  await client.from('approval_actions').insert({
    approval_id: insertRes.data.id,
    action: 'REQUESTED',
    actor_id: requesterId,
    comment: 'Tạo yêu cầu duyệt file/báo cáo.',
  })
  return insertRes.data.id as string
}

async function logActivity(
  workspaceId: string,
  actorId: string | null,
  action: string,
  deliverableId: string,
  metadata: Record<string, unknown> = {},
) {
  const client = createServiceClient()
  await client.from('activity_logs').insert({
    workspace_id: workspaceId,
    actor_id: actorId,
    action,
    entity_type: 'deliverable',
    entity_id: deliverableId,
    metadata,
  })
}

async function recomputeDeliverableStatus(
  client: ServiceClient,
  workspaceId: string,
  actorId: string | null,
  deliverableId: string,
) {
  const versionsRes = await client
    .from('deliverable_versions')
    .select('id,version_number,review_status')
    .eq('deliverable_id', deliverableId)
    .order('version_number', { ascending: false })

  if (versionsRes.error) throw versionsRes.error

  const versions = (versionsRes.data ?? []).map((version) => ({
    id: version.id,
    versionNumber: version.version_number,
    reviewStatus: normalizeVersionReviewStatus(version.review_status),
  }))
  const latestRelevant = versions.find((version) => !isVersionInvalid(version.reviewStatus))

  let status: DeliverableStatus = 'NOT_SUBMITTED'
  let approvedVersionId: string | null = null

  if (latestRelevant?.reviewStatus === 'APPROVED') {
    status = 'APPROVED'
    approvedVersionId = latestRelevant.id
  } else if (latestRelevant && isVersionRevision(latestRelevant.reviewStatus)) {
    status = 'REVISION_REQUIRED'
  } else if (latestRelevant && isVersionPending(latestRelevant.reviewStatus)) {
    status = 'SUBMITTED'
  }

  const updateRes = await client
    .from('deliverables')
    .update({
      status,
      approved_version_id: approvedVersionId,
      updated_by: actorId,
      updated_at: new Date().toISOString(),
    })
    .eq('workspace_id', workspaceId)
    .eq('id', deliverableId)

  if (updateRes.error) throw updateRes.error
  return { status, approvedVersionId }
}

function normalizeSearchText(value: string | null | undefined) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function isDefaultCompletionStep(step: { title?: string | null; description?: string | null }) {
  const text = normalizeSearchText(`${step.title ?? ''} ${step.description ?? ''}`)
  return [
    'nhan viec',
    'xac nhan yeu cau',
    'thuc hien cong viec',
    'hoan thanh phan xu ly chinh',
    'nop ket qua',
    'file',
    'bao cao',
    'cho duyet ket qua',
    'nguoi duyet kiem tra',
  ].some((pattern) => text.includes(pattern))
}

function isDeliverableApproved(deliverable: { status: string | null; approved_version_id: string | null }) {
  return deliverable.status === 'APPROVED' && Boolean(deliverable.approved_version_id)
}

function taskStatusForOpenDeliverables(deliverables: Array<{ status: string | null }>): TaskStatus {
  if (deliverables.some((deliverable) => deliverable.status === 'SUBMITTED')) return 'PENDING_APPROVAL'
  if (deliverables.some((deliverable) => deliverable.status === 'REVISION_REQUIRED' || deliverable.status === 'MISSING_INFORMATION' || deliverable.status === 'NOT_SUBMITTED')) {
    return 'REVISION_REQUIRED'
  }
  return 'IN_PROGRESS'
}

async function syncTaskAfterDeliverableReview(
  client: ServiceClient,
  workspaceId: string,
  deliverableId: string,
): Promise<TaskSyncResult> {
  const deliverableRes = await client
    .from('deliverables')
    .select('id,task_id,step_id,status,is_required,approved_version_id')
    .eq('workspace_id', workspaceId)
    .eq('id', deliverableId)
    .is('deleted_at', null)
    .maybeSingle()

  if (deliverableRes.error) throw deliverableRes.error
  const deliverable = deliverableRes.data as {
    id: string
    task_id: string | null
    step_id: string | null
    status: DeliverableStatus | null
    is_required: boolean | null
    approved_version_id: string | null
  } | null
  if (!deliverable?.task_id) {
    return { taskId: null, status: null, completed: false, blockers: ['deliverable khong gan voi task'], autoCompletedStepIds: [] }
  }

  const taskRes = await client
    .from('tasks')
    .select('id,status')
    .eq('workspace_id', workspaceId)
    .eq('id', deliverable.task_id)
    .is('deleted_at', null)
    .maybeSingle()
  if (taskRes.error) throw taskRes.error
  const task = taskRes.data as { id: string; status: TaskStatus | null } | null
  if (!task) return { taskId: deliverable.task_id, status: null, completed: false, blockers: ['task da bi xoa hoac khong ton tai'], autoCompletedStepIds: [] }

  const [deliverablesRes, stepsRes] = await Promise.all([
    client
      .from('deliverables')
      .select('id,step_id,status,is_required,approved_version_id')
      .eq('workspace_id', workspaceId)
      .eq('task_id', deliverable.task_id)
      .is('deleted_at', null),
    client
      .from('task_steps')
      .select('id,title,description,status,is_required')
      .eq('workspace_id', workspaceId)
      .eq('task_id', deliverable.task_id)
      .is('deleted_at', null),
  ])
  if (deliverablesRes.error) throw deliverablesRes.error
  if (stepsRes.error) throw stepsRes.error

  const taskDeliverables = (deliverablesRes.data ?? []) as Array<{
    id: string
    step_id: string | null
    status: DeliverableStatus | null
    is_required: boolean | null
    approved_version_id: string | null
  }>
  const steps = (stepsRes.data ?? []) as Array<{
    id: string
    title: string | null
    description: string | null
    status: TaskStatus | null
    is_required: boolean | null
  }>
  const requiredDeliverables = taskDeliverables.filter((item) => item.is_required !== false)
  const approvedRequiredDeliverables = requiredDeliverables.filter(isDeliverableApproved)
  const openRequiredDeliverables = requiredDeliverables.filter((item) => !isDeliverableApproved(item))
  const approvedLinkedStepIds = new Set(approvedRequiredDeliverables.map((item) => item.step_id).filter(Boolean) as string[])
  const autoCompletedStepIds: string[] = []

  if (approvedLinkedStepIds.size) {
    const updateStepRes = await client
      .from('task_steps')
      .update({ status: 'COMPLETED' })
      .eq('workspace_id', workspaceId)
      .in('id', Array.from(approvedLinkedStepIds))
    if (updateStepRes.error) throw updateStepRes.error
    autoCompletedStepIds.push(...Array.from(approvedLinkedStepIds))
  }

  if (deliverable.step_id && deliverable.status !== 'APPROVED') {
    const stepStatus: TaskStatus = deliverable.status === 'SUBMITTED' ? 'PENDING_APPROVAL' : 'REVISION_REQUIRED'
    const updateStepRes = await client
      .from('task_steps')
      .update({ status: stepStatus })
      .eq('workspace_id', workspaceId)
      .eq('id', deliverable.step_id)
    if (updateStepRes.error) throw updateStepRes.error
  }

  if (!requiredDeliverables.length) {
    return {
      taskId: task.id,
      status: task.status,
      completed: false,
      blockers: ['task chua co deliverable bat buoc'],
      autoCompletedStepIds,
    }
  }

  if (openRequiredDeliverables.length) {
    const nextStatus = taskStatusForOpenDeliverables(openRequiredDeliverables)
    if (task.status === 'COMPLETED' || task.status === 'PENDING_APPROVAL' || deliverable.status !== 'APPROVED') {
      const updateTaskRes = await client
        .from('tasks')
        .update({ status: nextStatus })
        .eq('workspace_id', workspaceId)
        .eq('id', task.id)
      if (updateTaskRes.error) throw updateTaskRes.error
    }
    return {
      taskId: task.id,
      status: nextStatus,
      completed: false,
      blockers: [`${openRequiredDeliverables.length} deliverable bat buoc chua duoc duyet`],
      autoCompletedStepIds,
    }
  }

  const incompleteRequiredSteps = steps.filter((step) => step.is_required !== false && step.status !== 'COMPLETED' && !approvedLinkedStepIds.has(step.id))
  const defaultStepIds = incompleteRequiredSteps.filter(isDefaultCompletionStep).map((step) => step.id)
  const realStepBlockers = incompleteRequiredSteps.filter((step) => !defaultStepIds.includes(step.id))

  if (defaultStepIds.length) {
    const updateDefaultStepsRes = await client
      .from('task_steps')
      .update({ status: 'COMPLETED' })
      .eq('workspace_id', workspaceId)
      .in('id', defaultStepIds)
    if (updateDefaultStepsRes.error) throw updateDefaultStepsRes.error
    autoCompletedStepIds.push(...defaultStepIds)
  }

  if (realStepBlockers.length) {
    return {
      taskId: task.id,
      status: task.status,
      completed: false,
      blockers: realStepBlockers.map((step) => step.title ?? 'Buoc bat buoc chua hoan thanh'),
      autoCompletedStepIds,
    }
  }

  const updateTaskRes = await client
    .from('tasks')
    .update({ status: 'COMPLETED' })
    .eq('workspace_id', workspaceId)
    .eq('id', task.id)
  if (updateTaskRes.error) throw updateTaskRes.error

  await client
    .from('reminders')
    .update({ status: 'closed', response_status: 'CLOSED', updated_at: new Date().toISOString() })
    .eq('workspace_id', workspaceId)
    .eq('task_id', task.id)

  return { taskId: task.id, status: 'COMPLETED', completed: true, blockers: [], autoCompletedStepIds }
}

async function markVersionLifecycleStatus({
  client,
  workspaceId,
  actorId,
  deliverableId,
  versionId,
  nextStatus,
  reason,
  action,
}: {
  client: ServiceClient
  workspaceId: string
  actorId: string | null
  deliverableId: string
  versionId: string
  nextStatus: Extract<ReviewStatus, 'UPLOADED_BY_MISTAKE' | 'SUPERSEDED'>
  reason: string
  action: string
}) {
  const versionRes = await client
    .from('deliverable_versions')
    .select('id,version_number,review_status')
    .eq('id', versionId)
    .eq('deliverable_id', deliverableId)
    .maybeSingle()

  if (versionRes.error) throw versionRes.error
  if (!versionRes.data) throw new Error('Không tìm thấy version.')

  const previousStatus = normalizeVersionReviewStatus(versionRes.data.review_status)
  const comment = reason ? `${reason}` : nextStatus === 'SUPERSEDED' ? 'Đánh dấu đã thay thế.' : 'Đánh dấu up nhầm.'

  const updateRes = await client
    .from('deliverable_versions')
    .update({
      review_status: nextStatus,
      review_comment: comment,
      reviewed_by: actorId,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', versionId)
    .eq('deliverable_id', deliverableId)

  if (updateRes.error) throw updateRes.error

  await logActivity(workspaceId, actorId, action, deliverableId, {
    versionId,
    versionNumber: versionRes.data.version_number,
    reason: comment,
    before: previousStatus,
    after: nextStatus,
  })
}

async function guardDeliverableCreate(
  request: Request,
  workspaceId: string,
  target: {
    name: string
    projectId: string | null
    taskId: string | null
    stepId: string | null
  },
) {
  if (!isLocalProductionDatabaseRequest(request)) return null

  if (target.projectId) {
    return guardExistingEntityWrite({
      request,
      client: createServiceClient(),
      table: 'projects',
      id: target.projectId,
      workspaceId,
      fields: ['name', 'code'],
      detail: 'Không được tạo bàn giao trong dự án thật từ localhost.',
    })
  }

  if (target.taskId) {
    return guardExistingEntityWrite({
      request,
      client: createServiceClient(),
      table: 'tasks',
      id: target.taskId,
      workspaceId,
      fields: ['title'],
      detail: 'Không được tạo bàn giao trong đầu việc thật từ localhost.',
    })
  }

  if (target.stepId) {
    return guardExistingEntityWrite({
      request,
      client: createServiceClient(),
      table: 'task_steps',
      id: target.stepId,
      workspaceId,
      fields: ['title'],
      detail: 'Không được tạo bàn giao trong bước thật từ localhost.',
    })
  }

  return ensureLocalQaWriteAllowed(request, { name: target.name }, 'Chỉ được tạo bàn giao QA có prefix rõ ràng.')
}

async function guardDeliverableTargetWrite(
  request: Request,
  workspaceId: string,
  deliverable: {
    name: string | null
    description: string | null
    project_id: string | null
    task_id: string | null
    step_id: string | null
  },
) {
  if (!isLocalProductionDatabaseRequest(request)) return null

  if (deliverable.project_id) {
    return guardExistingEntityWrite({
      request,
      client: createServiceClient(),
      table: 'projects',
      id: deliverable.project_id,
      workspaceId,
      fields: ['name', 'code'],
      detail: 'Không được thay đổi file/bàn giao thuộc dự án thật từ localhost.',
    })
  }

  if (deliverable.task_id) {
    return guardExistingEntityWrite({
      request,
      client: createServiceClient(),
      table: 'tasks',
      id: deliverable.task_id,
      workspaceId,
      fields: ['title'],
      detail: 'Không được thay đổi file/bàn giao thuộc đầu việc thật từ localhost.',
    })
  }

  if (deliverable.step_id) {
    return guardExistingEntityWrite({
      request,
      client: createServiceClient(),
      table: 'task_steps',
      id: deliverable.step_id,
      workspaceId,
      fields: ['title'],
      detail: 'Không được thay đổi file/bàn giao thuộc bước thật từ localhost.',
    })
  }

  if (qaPrefixFound(deliverable)) return null
  return localQaGuardResponse('Không được thay đổi file/bàn giao thật từ localhost.')
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId') ?? ''
  const deliverableId = searchParams.get('deliverableId') ?? ''
  const context = await getWorkspaceContext(workspaceId)
  if (!context.ok) return context.response
  if (!deliverableId) return jsonError('Thiếu deliverableId.', 400)

  try {
    const detail = await loadDeliverableDetail(context.workspaceId, deliverableId)
    if (!detail) return jsonError('Không tìm thấy hạng mục bàn giao.', 404)
    return NextResponse.json(detail)
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Không tải được chi tiết bàn giao.', 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>
    const workspaceId = cleanId(body.workspaceId)
    const context = await getWorkspaceContext(workspaceId ?? '')
    if (!context.ok) return context.response

    const projectId = cleanId(body.projectId)
    const taskId = cleanId(body.taskId)
    const stepId = cleanId(body.stepId)
    const submitterId = cleanId(body.submitterId)
    const reviewerId = cleanId(body.reviewerId)

    if (!cleanText(body.name)) return jsonError('Tên bàn giao không được để trống.', 400)
    const createGuard = await guardDeliverableCreate(req, context.workspaceId, {
      name: cleanText(body.name),
      projectId,
      taskId,
      stepId,
    })
    if (createGuard) return createGuard

    const checks = await Promise.all([
      ensureEntityInWorkspace('projects', projectId, context.workspaceId),
      ensureEntityInWorkspace('tasks', taskId, context.workspaceId),
      ensureEntityInWorkspace('task_steps', stepId, context.workspaceId),
      ensureEntityInWorkspace('people', submitterId, context.workspaceId),
      ensureEntityInWorkspace('people', reviewerId, context.workspaceId),
    ])
    if (checks.some((value) => !value)) return jsonError('Dữ liệu liên kết không thuộc workspace hiện tại.', 403)

    const client = createServiceClient()
    const insertRes = await client
      .from('deliverables')
      .insert({
        workspace_id: context.workspaceId,
        project_id: projectId,
        task_id: taskId,
        step_id: stepId,
        name: cleanText(body.name),
        description: cleanText(body.description) || null,
        type: cleanText(body.type) || 'file',
        required_format: cleanText(body.requiredFormat) || null,
        submitter_id: submitterId,
        reviewer_id: reviewerId,
        due_date: cleanDate(body.dueDate),
        status: 'NOT_SUBMITTED' satisfies DeliverableStatus,
        is_required: body.isRequired !== false,
        created_by: context.personId,
        updated_by: context.personId,
      })
      .select('id,workspace_id,project_id,task_id,step_id,reviewer_id,due_date')
      .single()

    if (insertRes.error || !insertRes.data) {
      return jsonError(insertRes.error?.message ?? 'Không tạo được bàn giao.', 500)
    }

    if (body.requiresApproval === true && reviewerId) {
      await ensureApproval({
        workspaceId: context.workspaceId,
        deliverableId: insertRes.data.id,
        projectId,
        taskId,
        stepId,
        requesterId: context.personId,
        approverId: reviewerId,
        dueAt: insertRes.data.due_date,
      })
    }

    await logActivity(context.workspaceId, context.personId, 'deliverable.created', insertRes.data.id)
    return NextResponse.json({ ok: true, deliverableId: insertRes.data.id })
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Không tạo được bàn giao.', 500)
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>
    const workspaceId = cleanId(body.workspaceId)
    const deliverableId = cleanId(body.deliverableId)
    const action = cleanText(body.action)
    const context = await getWorkspaceContext(workspaceId ?? '')
    if (!context.ok) return context.response
    if (!deliverableId) return jsonError('Thiếu deliverableId.', 400)

    const client = createServiceClient()
    const detail = await loadDeliverableDetail(context.workspaceId, deliverableId)
    if (!detail) return jsonError('Không tìm thấy hạng mục bàn giao.', 404)
    const deliverable = detail.deliverable as {
      id: string
      name: string | null
      description: string | null
      project_id: string | null
      task_id: string | null
      step_id: string | null
      reviewer_id: string | null
      due_date: string | null
      approved_version_id: string | null
    }
    const guard = await guardDeliverableTargetWrite(req, context.workspaceId, deliverable)
    if (guard) return guard

    if (action === 'setReviewer') {
      const reviewerId = cleanId(body.reviewerId)
      if (!reviewerId) return jsonError('Vui lòng chọn người xác nhận cho file/báo cáo này.', 400)
      if (!(await ensureEntityInWorkspace('people', reviewerId, context.workspaceId))) {
        return jsonError('Người xác nhận không thuộc workspace hiện tại.', 403)
      }

      const updateRes = await client
        .from('deliverables')
        .update({
          reviewer_id: reviewerId,
          updated_by: context.personId,
          updated_at: new Date().toISOString(),
        })
        .eq('workspace_id', context.workspaceId)
        .eq('id', deliverableId)
      if (updateRes.error) return jsonError(updateRes.error.message, 500)

      await ensureApproval({
        workspaceId: context.workspaceId,
        deliverableId,
        projectId: deliverable.project_id,
        taskId: deliverable.task_id,
        stepId: deliverable.step_id,
        requesterId: context.personId,
        approverId: reviewerId,
        dueAt: deliverable.due_date,
      })

      await logActivity(context.workspaceId, context.personId, 'approval.requested', deliverableId, {
        approverId: reviewerId,
      })
      return NextResponse.json({ ok: true })
    }

    if (action === 'submitLink') {
      const externalUrl = cleanText(body.externalUrl)
      if (!/^https?:\/\/\S+/i.test(externalUrl)) return jsonError('Link phải bắt đầu bằng http:// hoặc https://.', 400)
      const supersedesVersionId = cleanId(body.supersedesVersionId)
      const replaceReason = cleanText(body.replaceReason) || cleanText(body.changeNote) || 'Tạo version link thay thế.'
      const requestedApproverId = cleanId(body.approverId)
      const finalApproverId = requestedApproverId ?? deliverable.reviewer_id
      if (finalApproverId && !(await ensureEntityInWorkspace('people', finalApproverId, context.workspaceId))) {
        return jsonError('Người xác nhận không thuộc workspace hiện tại.', 403)
      }
      if (finalApproverId && finalApproverId !== deliverable.reviewer_id) {
        const reviewerRes = await client
          .from('deliverables')
          .update({
            reviewer_id: finalApproverId,
            updated_by: context.personId,
            updated_at: new Date().toISOString(),
          })
          .eq('workspace_id', context.workspaceId)
          .eq('id', deliverableId)
        if (reviewerRes.error) return jsonError(reviewerRes.error.message, 500)
        deliverable.reviewer_id = finalApproverId
      }
      const versionNumber = await nextVersionNumber(deliverableId)
      const versionRes = await client
        .from('deliverable_versions')
        .insert({
          deliverable_id: deliverableId,
          version_number: versionNumber,
          external_url: externalUrl,
          submitted_by: context.personId,
          change_note: cleanText(body.changeNote) || null,
          review_status: 'PENDING_REVIEW',
        })
        .select('id')
        .single()
      if (versionRes.error || !versionRes.data) return jsonError(versionRes.error?.message ?? 'Không lưu được version link.', 500)

      if (supersedesVersionId) {
        const oldVersion = (detail.versions ?? []).find((version) => version.id === supersedesVersionId)
        const oldStatus = normalizeVersionReviewStatus(oldVersion?.review_status)
        await markVersionLifecycleStatus({
          client,
          workspaceId: context.workspaceId,
          actorId: context.personId,
          deliverableId,
          versionId: supersedesVersionId,
          nextStatus: oldStatus === 'APPROVED' ? 'SUPERSEDED' : 'UPLOADED_BY_MISTAKE',
          reason: replaceReason,
          action: oldStatus === 'APPROVED' ? 'deliverable.version.superseded' : 'deliverable.version.marked_mistake',
        })
      }

      await recomputeDeliverableStatus(client, context.workspaceId, context.personId, deliverableId)
      const taskSync = await syncTaskAfterDeliverableReview(client, context.workspaceId, deliverableId)
      await closeRelatedReminders(context.workspaceId, deliverableId)

      await ensureApproval({
        workspaceId: context.workspaceId,
        deliverableId,
        projectId: deliverable.project_id,
        taskId: deliverable.task_id,
        stepId: deliverable.step_id,
        requesterId: context.personId,
        approverId: finalApproverId,
        dueAt: deliverable.due_date,
      })

      await logActivity(context.workspaceId, context.personId, 'deliverable.version.submitted_link', deliverableId, {
        versionId: versionRes.data.id,
        versionNumber,
        supersedesVersionId,
        before: null,
        after: 'PENDING_REVIEW',
      })
      return NextResponse.json({ ok: true, versionId: versionRes.data.id, versionNumber, taskSync })
    }

    if (action === 'approve' || action === 'requestRevision' || action === 'reject' || action === 'markMissing') {
      const versionId = cleanId(body.versionId) ?? (await getLatestVersion(deliverableId))?.id
      if (!versionId) return jsonError('Chưa có version nào để review.', 400)

      const currentVersionRes = await client
        .from('deliverable_versions')
        .select('id,review_status')
        .eq('id', versionId)
        .eq('deliverable_id', deliverableId)
        .maybeSingle()
      if (currentVersionRes.error) return jsonError(currentVersionRes.error.message, 500)
      if (!currentVersionRes.data) return jsonError('Không tìm thấy version cần review.', 404)
      const previousReviewStatus = normalizeVersionReviewStatus(currentVersionRes.data.review_status)
      if (isVersionInvalid(previousReviewStatus)) return jsonError('Version này đã bị đánh dấu up nhầm hoặc đã thay thế, không thể review.', 400)

      const reviewStatus: ReviewStatus =
        action === 'approve'
          ? 'APPROVED'
          : action === 'reject'
            ? 'REJECTED'
            : 'REVISION_REQUESTED'
      const nextStatus: DeliverableStatus =
        action === 'approve'
          ? 'APPROVED'
          : action === 'markMissing'
            ? 'MISSING_INFORMATION'
            : 'REVISION_REQUIRED'

      const versionRes = await client
        .from('deliverable_versions')
        .update({
          review_status: reviewStatus,
          review_comment: cleanText(body.reviewComment) || null,
          reviewed_by: context.personId,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', versionId)
        .eq('deliverable_id', deliverableId)
      if (versionRes.error) return jsonError(versionRes.error.message, 500)

      const updatePayload: Record<string, unknown> = {
        status: nextStatus,
        updated_by: context.personId,
        updated_at: new Date().toISOString(),
      }
      if (action === 'approve') updatePayload.approved_version_id = versionId
      else updatePayload.approved_version_id = null
      const updateRes = await client
        .from('deliverables')
        .update(updatePayload)
        .eq('workspace_id', context.workspaceId)
        .eq('id', deliverableId)
      if (updateRes.error) return jsonError(updateRes.error.message, 500)

      const approvalStatus = action === 'approve' ? 'APPROVED' : action === 'reject' ? 'REJECTED' : 'REVISION_REQUESTED'
      const approvalsRes = await client
        .from('approvals')
        .update({ status: approvalStatus, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('workspace_id', context.workspaceId)
        .eq('deliverable_id', deliverableId)
        .select('id')
      if (approvalsRes.error) return jsonError(approvalsRes.error.message, 500)

      if (approvalsRes.data?.length) {
        await client.from('approval_actions').insert(approvalsRes.data.map((approval) => ({
          approval_id: approval.id,
          action: approvalStatus,
          actor_id: context.personId,
          comment: cleanText(body.reviewComment) || null,
        })))
      }

      await logActivity(context.workspaceId, context.personId, `deliverable.${action}`, deliverableId, {
        versionId,
        reason: cleanText(body.reviewComment) || null,
        before: previousReviewStatus,
        after: reviewStatus,
      })
      const taskSync = await syncTaskAfterDeliverableReview(client, context.workspaceId, deliverableId)
      return NextResponse.json({ ok: true, taskSync })
    }

    if (action === 'deleteVersion') {
      const versionId = cleanId(body.versionId)
      if (!versionId) return jsonError('Thiếu versionId.', 400)
      const reason = cleanText(body.reason)
      if (!reason) return jsonError('Cần nhập lý do trước khi xóa/hủy version.', 400)

      const versionRes = await client
        .from('deliverable_versions')
        .select('id,version_number,review_status')
        .eq('id', versionId)
        .eq('deliverable_id', deliverableId)
        .maybeSingle()
      if (versionRes.error) return jsonError(versionRes.error.message, 500)
      if (!versionRes.data) return jsonError('Không tìm thấy version.', 404)
      if (versionRes.data.review_status === 'APPROVED') return jsonError('Không thể xóa version đã duyệt.', 400)

      await markVersionLifecycleStatus({
        client,
        workspaceId: context.workspaceId,
        actorId: context.personId,
        deliverableId,
        versionId,
        nextStatus: 'UPLOADED_BY_MISTAKE',
        reason,
        action: 'deliverable.version.deleted_soft',
      })
      await recomputeDeliverableStatus(client, context.workspaceId, context.personId, deliverableId)
      const taskSync = await syncTaskAfterDeliverableReview(client, context.workspaceId, deliverableId)
      return NextResponse.json({ ok: true, taskSync })
    }

    if (action === 'markVersionMistake' || action === 'supersedeVersion') {
      const versionId = cleanId(body.versionId)
      const reason = cleanText(body.reason)
      if (!versionId) return jsonError('Thiếu versionId.', 400)
      if (!reason) return jsonError('Cần nhập lý do xử lý version.', 400)

      const versionRes = await client
        .from('deliverable_versions')
        .select('id,review_status')
        .eq('id', versionId)
        .eq('deliverable_id', deliverableId)
        .maybeSingle()
      if (versionRes.error) return jsonError(versionRes.error.message, 500)
      if (!versionRes.data) return jsonError('Không tìm thấy version.', 404)

      const previousStatus = normalizeVersionReviewStatus(versionRes.data.review_status)
      if (action === 'markVersionMistake' && previousStatus === 'APPROVED') {
        return jsonError('Version đã duyệt không được đánh dấu up nhầm. Hãy tạo version thay thế hoặc đánh dấu đã thay thế.', 400)
      }
      if (isVersionInvalid(previousStatus)) {
        return jsonError('Version này đã được xử lý trước đó.', 400)
      }

      const nextStatus = action === 'supersedeVersion' ? 'SUPERSEDED' : 'UPLOADED_BY_MISTAKE'
      await markVersionLifecycleStatus({
        client,
        workspaceId: context.workspaceId,
        actorId: context.personId,
        deliverableId,
        versionId,
        nextStatus,
        reason,
        action: action === 'supersedeVersion' ? 'deliverable.version.superseded' : 'deliverable.version.marked_mistake',
      })
      await recomputeDeliverableStatus(client, context.workspaceId, context.personId, deliverableId)
      const taskSync = await syncTaskAfterDeliverableReview(client, context.workspaceId, deliverableId)
      return NextResponse.json({ ok: true, taskSync })
    }

    if (action === 'confirmReminder') {
      const confirmedSent = body.confirmedSent === true
      if (!confirmedSent) return NextResponse.json({ ok: true, skipped: true })

      const personId = cleanId(body.personId) ?? cleanId((detail.deliverable as { submitter_id?: string | null }).submitter_id)
      if (!personId) return jsonError('Chưa có người nhận nhắc.', 400)

      const nextFollowUp = new Date()
      nextFollowUp.setDate(nextFollowUp.getDate() + 1)

      const existing = await client
        .from('reminders')
        .select('id,reminder_level')
        .eq('workspace_id', context.workspaceId)
        .eq('deliverable_id', deliverableId)
        .eq('person_id', personId)
        .limit(1)
        .maybeSingle()
      if (existing.error) return jsonError(existing.error.message, 500)

      const reminderPayload = {
        task_id: deliverable.task_id,
        person_id: personId,
        channel: 'messenger',
        response_status: 'REMINDERED',
        status: 'open',
        last_reminded_at: new Date().toISOString(),
        next_follow_up_at: nextFollowUp.toISOString(),
        updated_at: new Date().toISOString(),
      }

      let reminderId = existing.data?.id as string | undefined
      let reminderLevel = (existing.data?.reminder_level ?? 0) + 1
      if (reminderId) {
        const updateRes = await client
          .from('reminders')
          .update({ ...reminderPayload, reminder_level: reminderLevel })
          .eq('id', reminderId)
        if (updateRes.error) return jsonError(updateRes.error.message, 500)
      } else {
        reminderLevel = 1
        const insertRes = await client
          .from('reminders')
          .insert({
            workspace_id: context.workspaceId,
            deliverable_id: deliverableId,
            reminder_level: reminderLevel,
            ...reminderPayload,
          })
          .select('id')
          .single()
        if (insertRes.error || !insertRes.data) return jsonError(insertRes.error?.message ?? 'Không tạo được reminder.', 500)
        reminderId = insertRes.data.id
      }

      await client.from('reminder_logs').insert({
        reminder_id: reminderId,
        sent_by: context.personId,
        channel: 'messenger',
        message_content: cleanText(body.message),
        confirmed_sent: true,
        result: 'REMINDERED',
        follow_up_at: nextFollowUp.toISOString(),
      })

      await logActivity(context.workspaceId, context.personId, 'deliverable.reminder.sent', deliverableId, { reminderLevel })
      return NextResponse.json({ ok: true, reminderLevel })
    }

    return jsonError('Action không được hỗ trợ.', 400)
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Không xử lý được thao tác bàn giao.', 500)
  }
}
