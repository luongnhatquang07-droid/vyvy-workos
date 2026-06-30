import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type EntityType = 'project' | 'workstream' | 'task' | 'step' | 'meeting'
type StepTemplate = 'none' | 'basic' | 'approval'

export async function POST(request: Request) {
  const auth = await getWorkspace()
  if ('response' in auth) return auth.response

  const body = (await request.json()) as { type?: EntityType; payload?: Record<string, unknown> }
  const payload = body.payload ?? {}

  try {
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
    if (body.type === 'project') await updateEntity(auth, 'projects', body.id, mapPatch(patch, ['name', 'description', 'ownerId', 'startDate', 'dueDate']))
    else if (body.type === 'workstream') await updateEntity(auth, 'workstreams', body.id, mapPatch(patch, ['name', 'description', 'ownerId', 'startDate', 'dueDate']))
    else if (body.type === 'task') await updateEntity(auth, 'tasks', body.id, mapPatch(patch, ['name', 'description', 'ownerId', 'startDate', 'dueDate', 'status', 'expectedResult']))
    else if (body.type === 'step') {
      await updateEntity(auth, 'task_steps', body.id, mapPatch(patch, ['title', 'description', 'ownerId', 'startDate', 'dueDate', 'status', 'isRequired']))
      if (patch.requiresDeliverable === true) await ensureStepDeliverable(auth, body.id)
      if (patch.requiresDeliverable === false) await disableStepDeliverable(auth, body.id)
    }
    else return NextResponse.json({ error: 'Loại thao tác chưa được hỗ trợ.' }, { status: 400 })

    await logActivity(auth, 'UPDATE_WORKSPACE_ITEM', body.type, body.id, patch)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  const auth = await getWorkspace()
  if ('response' in auth) return auth.response

  const body = (await request.json()) as { type?: EntityType; id?: string }
  if (!body.type || !body.id) return NextResponse.json({ error: 'Thiếu loại hoặc id cần xóa.' }, { status: 400 })

  const table =
    body.type === 'project'
      ? 'projects'
      : body.type === 'workstream'
        ? 'workstreams'
        : body.type === 'task'
          ? 'tasks'
          : body.type === 'step'
            ? 'task_steps'
            : null

  if (!table) return NextResponse.json({ error: 'Loại thao tác chưa hỗ trợ xóa mềm.' }, { status: 400 })

  const result = await auth.sb.from(table).update({ deleted_at: new Date().toISOString() }).eq('id', body.id).eq('workspace_id', auth.workspaceId)
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 })
  await logActivity(auth, 'SOFT_DELETE', body.type, body.id, {})
  return NextResponse.json({ ok: true })
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

  return { sb, workspaceId: membershipRes.data.workspace_id }
}

async function updateEntity(
  auth: Exclude<Awaited<ReturnType<typeof getWorkspace>>, { response: NextResponse }>,
  table: 'projects' | 'workstreams' | 'tasks' | 'task_steps',
  id: string,
  patch: Record<string, unknown>,
) {
  const result = await auth.sb.from(table).update(patch).eq('id', id).eq('workspace_id', auth.workspaceId)
  if (result.error) throw result.error
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
    .select('id,task_id,title,owner_id,due_date,tasks!task_steps_task_id_fkey(project_id)')
    .eq('workspace_id', auth.workspaceId)
    .eq('id', stepId)
    .maybeSingle()
  if (stepRes.error) throw stepRes.error
  const step = stepRes.data as {
    id: string
    task_id: string
    title: string
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
    name: `Kết quả: ${step.title}`,
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
