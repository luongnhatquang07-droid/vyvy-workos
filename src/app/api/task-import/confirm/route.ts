import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  ensureLocalQaWriteAllowed,
  isLocalProductionDatabaseRequest,
} from '@/lib/localQaGuard'
import {
  type BulkImportRow,
  type ImportIssue,
  makeImportSummary,
  mapPriorityToDb,
  needsFile,
  normalizeDeadlineType,
  normalizeKey,
  normalizeNeedsFileLabel,
  normalizePriorityLabel,
  parseDeadline,
  splitPeople,
} from '@/lib/taskImport'

type WorkspaceContext =
  | { ok: true; sb: Awaited<ReturnType<typeof createClient>>; workspaceId: string; actorId: string | null }
  | { ok: false; response: NextResponse }

interface PersonLite {
  id: string
  full_name: string
}

interface ProjectLite {
  id: string
  name: string
}

interface WorkstreamLite {
  id: string
  project_id: string
  name: string
}

interface TaskLite {
  id: string
  project_id: string | null
  workstream_id: string | null
  title: string
  owner_id: string | null
  due_date: string | null
}

interface ConfirmBody {
  rows?: BulkImportRow[]
  fileName?: string
}

export async function POST(request: Request) {
  const auth = await getWorkspace()
  if (!auth.ok) return auth.response

  const body = (await request.json()) as ConfirmBody
  const incomingRows = (body.rows ?? []).map(cleanIncomingRow).filter((row) => row.projectName || row.workstreamName || row.taskTitle)

  if (!incomingRows.length) {
    return NextResponse.json({ error: 'Không có dòng đầu việc hợp lệ để nhập.' }, { status: 400 })
  }

  const guard = guardBulkImportWrite(request, incomingRows)
  if (guard) return guard

  const context = await loadImportContext(auth)
  const validatedRows = validateRows(incomingRows, context)
  const blockedRows = validatedRows.filter((row) => row.issues.some((issue) => issue.severity === 'error'))

  if (blockedRows.length) {
    return NextResponse.json(
      {
        error: `Còn ${blockedRows.length} dòng lỗi. Hãy sửa trong Preview rồi xác nhận lại.`,
        rows: validatedRows,
        summary: makeImportSummary(validatedRows),
      },
      { status: 400 },
    )
  }

  const importBatchId = randomUUID()
  const projectMap = new Map(context.projects.map((project) => [normalizeKey(project.name), project]))
  const workstreamMap = new Map(context.workstreams.map((workstream) => [`${workstream.project_id}|${normalizeKey(workstream.name)}`, workstream]))
  const taskMap = new Map(context.tasks.map((task) => [`${task.project_id ?? ''}|${task.workstream_id ?? ''}|${normalizeKey(task.title)}`, task]))
  const peopleByName = new Map(context.people.map((person) => [normalizeKey(person.full_name), person]))

  const createdProjectIds: string[] = []
  const createdWorkstreamIds: string[] = []
  const createdTaskIds: string[] = []
  const updatedTaskIds: string[] = []
  const skippedRows: Array<{ rowNumber: number; title: string; reason: string }> = []
  const createdDeliverableIds: string[] = []
  const createdReminderIds: string[] = []

  for (const row of validatedRows) {
    const owner = peopleByName.get(normalizeKey(row.ownerName))
    if (!owner) continue

    const project = await ensureProject(auth, row, projectMap, owner.id)
    if ('error' in project) return NextResponse.json({ error: project.error }, { status: 500 })
    if (project.created) createdProjectIds.push(project.id)

    const workstream = await ensureWorkstream(auth, row, project.id, workstreamMap, owner.id)
    if ('error' in workstream) return NextResponse.json({ error: workstream.error }, { status: 500 })
    if (workstream.created) createdWorkstreamIds.push(workstream.id)

    const duplicateKey = `${project.id}|${workstream.id}|${normalizeKey(row.taskTitle)}`
    const duplicateTask = taskMap.get(duplicateKey)
    const duplicateAction = duplicateTask ? row.duplicateAction ?? 'skip' : 'create'

    if (duplicateTask && duplicateAction === 'skip') {
      skippedRows.push({ rowNumber: row.rowNumber, title: row.taskTitle, reason: 'Trùng đầu việc con đã có.' })
      continue
    }

    if (duplicateTask && duplicateAction === 'update') {
      const updateRes = await auth.sb
        .from('tasks')
        .update({
          owner_id: owner.id,
          due_date: row.parsedDeadline,
          start_date: row.parsedStartDate,
          expected_result: row.expectedResult || null,
          description: buildTaskDescription(row),
          priority: mapPriorityToDb(row.priority),
          status: 'NOT_STARTED',
          updated_at: new Date().toISOString(),
        })
        .eq('id', duplicateTask.id)
        .eq('workspace_id', auth.workspaceId)

      if (updateRes.error) return NextResponse.json({ error: `Không cập nhật được dòng ${row.rowNumber}: ${updateRes.error.message}` }, { status: 500 })

      updatedTaskIds.push(duplicateTask.id)
      await ensureCollaborators(auth, duplicateTask.id, row, peopleByName)
      const deliverableId = await ensureDeliverableForTask(auth, duplicateTask.id, project.id, owner.id, row, null)
      if ('error' in deliverableId) return NextResponse.json({ error: deliverableId.error }, { status: 500 })
      if (deliverableId.id) createdDeliverableIds.push(deliverableId.id)
      continue
    }

    const taskRes = await auth.sb
      .from('tasks')
      .insert({
        workspace_id: auth.workspaceId,
        project_id: project.id,
        workstream_id: workstream.id,
        title: row.taskTitle,
        description: buildTaskDescription(row),
        expected_result: row.expectedResult || null,
        owner_id: owner.id,
        status: 'NOT_STARTED',
        priority: mapPriorityToDb(row.priority),
        start_date: row.parsedStartDate,
        due_date: row.parsedDeadline,
      })
      .select('id')
      .single()

    if (taskRes.error) {
      return NextResponse.json({ error: `Không tạo được đầu việc con dòng ${row.rowNumber}: ${taskRes.error.message}` }, { status: 500 })
    }

    const taskId = taskRes.data.id
    createdTaskIds.push(taskId)
    taskMap.set(duplicateKey, { id: taskId, project_id: project.id, workstream_id: workstream.id, title: row.taskTitle, owner_id: owner.id, due_date: row.parsedDeadline })

    await ensureCollaborators(auth, taskId, row, peopleByName)
    const submitStepId = await createDefaultSteps(auth, taskId, owner.id, row)
    if ('error' in submitStepId) return NextResponse.json({ error: submitStepId.error }, { status: 500 })

    const deliverable = await ensureDeliverableForTask(auth, taskId, project.id, owner.id, row, submitStepId.id)
    if ('error' in deliverable) return NextResponse.json({ error: deliverable.error }, { status: 500 })
    if (deliverable.id) {
      createdDeliverableIds.push(deliverable.id)
      const reminder = await ensureReminder(auth, taskId, deliverable.id, owner.id, row.parsedDeadline)
      if ('error' in reminder) return NextResponse.json({ error: reminder.error }, { status: 500 })
      if (reminder.id) createdReminderIds.push(reminder.id)
    }
  }

  await auth.sb.from('activity_logs').insert({
    workspace_id: auth.workspaceId,
    actor_id: auth.actorId,
    action: 'IMPORT_BULK_TASKS_FROM_EXCEL',
    entity_type: 'import_batch',
    entity_id: createdTaskIds[0] ?? updatedTaskIds[0] ?? null,
    metadata: {
      importBatchId,
      fileName: body.fileName ?? null,
      createdProjects: createdProjectIds.length,
      createdWorkstreams: createdWorkstreamIds.length,
      createdTasks: createdTaskIds.length,
      updatedTasks: updatedTaskIds.length,
      skippedDuplicates: skippedRows.length,
      createdDeliverables: createdDeliverableIds.length,
      createdReminders: createdReminderIds.length,
      rows: validatedRows.length,
    },
  })

  return NextResponse.json({
    importBatchId,
    createdProjects: createdProjectIds.length,
    createdWorkstreams: createdWorkstreamIds.length,
    createdTasks: createdTaskIds.length,
    updatedTasks: updatedTaskIds.length,
    skippedDuplicates: skippedRows.length,
    createdDeliverables: createdDeliverableIds.length,
    createdReminders: createdReminderIds.length,
    skippedRows,
    projectIds: createdProjectIds,
    taskIds: createdTaskIds,
  })
}

function guardBulkImportWrite(request: Request, rows: BulkImportRow[]) {
  if (!isLocalProductionDatabaseRequest(request)) return null
  return ensureLocalQaWriteAllowed(request, rows, 'Muon import QA tu localhost vao production phai bat server-side env ALLOW_LOCAL_PROD_QA_WRITES.')
}

async function getWorkspace(): Promise<WorkspaceContext> {
  const sb = await createClient()
  const {
    data: { user },
  } = await sb.auth.getUser()

  if (!user) return { ok: false, response: NextResponse.json({ error: 'Bạn cần đăng nhập trước khi nhập đầu việc.' }, { status: 401 }) }

  const profileRes = await sb
    .from('profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (profileRes.error || !profileRes.data?.id) {
    return { ok: false, response: NextResponse.json({ error: 'Tài khoản chưa có profile trong workspace.' }, { status: 403 }) }
  }

  const membershipRes = await sb
    .from('workspace_memberships')
    .select('workspace_id')
    .eq('profile_id', profileRes.data.id)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()

  if (membershipRes.error || !membershipRes.data?.workspace_id) {
    return { ok: false, response: NextResponse.json({ error: 'Tài khoản chưa được gắn workspace.' }, { status: 403 }) }
  }

  const personRes = await sb
    .from('people')
    .select('id')
    .eq('workspace_id', membershipRes.data.workspace_id)
    .eq('profile_id', profileRes.data.id)
    .is('deleted_at', null)
    .maybeSingle()

  return { ok: true, sb, workspaceId: membershipRes.data.workspace_id, actorId: personRes.data?.id ?? null }
}

async function loadImportContext(auth: Extract<WorkspaceContext, { ok: true }>) {
  const [peopleRes, projectsRes, workstreamsRes, tasksRes] = await Promise.all([
    auth.sb.from('people').select('id,full_name').eq('workspace_id', auth.workspaceId).is('deleted_at', null),
    auth.sb.from('projects').select('id,name').eq('workspace_id', auth.workspaceId).is('deleted_at', null),
    auth.sb.from('workstreams').select('id,project_id,name').eq('workspace_id', auth.workspaceId).is('deleted_at', null),
    auth.sb.from('tasks').select('id,project_id,workstream_id,title,owner_id,due_date').eq('workspace_id', auth.workspaceId).is('deleted_at', null),
  ])

  if (peopleRes.error) throw new Error(`Không đọc được nhân sự: ${peopleRes.error.message}`)
  if (projectsRes.error) throw new Error(`Không đọc được dự án: ${projectsRes.error.message}`)
  if (workstreamsRes.error) throw new Error(`Không đọc được đầu việc lớn: ${workstreamsRes.error.message}`)
  if (tasksRes.error) throw new Error(`Không đọc được đầu việc con: ${tasksRes.error.message}`)

  return {
    people: (peopleRes.data ?? []) as PersonLite[],
    projects: (projectsRes.data ?? []) as ProjectLite[],
    workstreams: (workstreamsRes.data ?? []) as WorkstreamLite[],
    tasks: (tasksRes.data ?? []) as TaskLite[],
  }
}

function validateRows(rows: BulkImportRow[], context: Awaited<ReturnType<typeof loadImportContext>>) {
  const peopleByName = new Map(context.people.map((person) => [normalizeKey(person.full_name), person]))
  const projectsByName = new Map(context.projects.map((project) => [normalizeKey(project.name), project]))
  const workstreamsByProjectAndName = new Map(context.workstreams.map((workstream) => [`${workstream.project_id}|${normalizeKey(workstream.name)}`, workstream]))
  const tasksByProjectWorkstreamTitle = new Map(context.tasks.map((task) => [`${task.project_id ?? ''}|${task.workstream_id ?? ''}|${normalizeKey(task.title)}`, task]))
  const seenInFile = new Set<string>()

  return rows.map((row) => {
    const deadlineType = normalizeDeadlineType(row.deadlineType)
    const parsed = parseDeadline(row.deadlineRaw, deadlineType)
    const project = projectsByName.get(normalizeKey(row.projectName))
    const workstream = project ? workstreamsByProjectAndName.get(`${project.id}|${normalizeKey(row.workstreamName)}`) : null
    const owner = peopleByName.get(normalizeKey(row.ownerName))
    const collaboratorList = splitPeople(row.collaboratorNames)
    const unknownCollaborators = collaboratorList.filter((name) => !peopleByName.has(normalizeKey(name)))
    const duplicateTask = project && workstream ? tasksByProjectWorkstreamTitle.get(`${project.id}|${workstream.id}|${normalizeKey(row.taskTitle)}`) : null
    const issues: ImportIssue[] = [...parsed.issues]

    if (!row.projectName) issues.push({ severity: 'error', code: 'missing_project', message: 'Thiếu dự án.' })
    else if (!project) issues.push({ severity: 'warning', code: 'new_project', message: 'Dự án chưa có, sẽ tạo mới khi xác nhận.' })
    if (!row.workstreamName) issues.push({ severity: 'error', code: 'missing_workstream', message: 'Thiếu đầu việc lớn.' })
    else if (row.projectName && !workstream) issues.push({ severity: 'warning', code: 'new_workstream', message: 'Đầu việc lớn chưa có trong dự án, sẽ tạo mới.' })
    if (!row.taskTitle) issues.push({ severity: 'error', code: 'missing_task', message: 'Thiếu đầu việc con.' })
    if (!row.ownerName) issues.push({ severity: 'error', code: 'missing_owner', message: 'Thiếu người phụ trách chính.' })
    else if (!owner) issues.push({ severity: 'error', code: 'owner_not_found', message: `Chưa có nhân sự "${row.ownerName}" trong app.` })
    if (unknownCollaborators.length) {
      issues.push({
        severity: 'warning',
        code: 'supporter_not_found',
        message: `Người phối hợp chưa có trong app: ${unknownCollaborators.join(', ')}.`,
      })
    }

    const key = `${normalizeKey(row.projectName)}|${normalizeKey(row.workstreamName)}|${normalizeKey(row.taskTitle)}`
    if (seenInFile.has(key)) {
      issues.push({ severity: 'warning', code: 'duplicate_in_file', message: 'Có thể trùng với một dòng khác trong file.' })
    } else {
      seenInFile.add(key)
    }

    if (duplicateTask) {
      issues.push({ severity: 'warning', code: 'duplicate_existing', message: 'Đầu việc con có thể đã tồn tại trong hệ thống.' })
    }

    return {
      ...row,
      deadlineType,
      priority: normalizePriorityLabel(row.priority),
      needsFile: normalizeNeedsFileLabel(row.needsFile),
      parsedDeadline: parsed.dueDate,
      parsedStartDate: parsed.startDate,
      parsedEndDate: parsed.endDate,
      deadlineKind: parsed.kind,
      recurringLabel: parsed.label,
      ownerId: owner?.id ?? null,
      collaboratorIds: collaboratorList.map((name) => peopleByName.get(normalizeKey(name))?.id).filter(Boolean) as string[],
      unknownCollaborators,
      projectId: project?.id ?? null,
      workstreamId: workstream?.id ?? null,
      projectState: !row.projectName ? 'missing' : project ? 'existing' : 'new',
      workstreamState: !row.workstreamName ? 'missing' : workstream ? 'existing' : 'new',
      duplicateTaskId: duplicateTask?.id ?? null,
      duplicateAction: duplicateTask ? row.duplicateAction ?? 'skip' : 'create',
      issues,
    } satisfies BulkImportRow
  })
}

async function ensureProject(
  auth: Extract<WorkspaceContext, { ok: true }>,
  row: BulkImportRow,
  projectMap: Map<string, ProjectLite>,
  ownerId: string,
): Promise<{ id: string; created: boolean } | { error: string }> {
  const key = normalizeKey(row.projectName)
  const existing = projectMap.get(key)
  if (existing) return { id: existing.id, created: false }

  const result = await auth.sb
    .from('projects')
    .insert({
      workspace_id: auth.workspaceId,
      name: row.projectName,
      code: null,
      description: 'Tạo tự động từ import Excel hàng loạt.',
      owner_id: ownerId,
      start_date: row.parsedStartDate,
      due_date: row.parsedDeadline,
      status: 'active',
      health_status: 'NO_DATA',
    })
    .select('id,name')
    .single()

  if (result.error) return { error: `Không tạo được dự án "${row.projectName}": ${result.error.message}` }
  projectMap.set(key, { id: result.data.id, name: result.data.name })
  return { id: result.data.id, created: true }
}

async function ensureWorkstream(
  auth: Extract<WorkspaceContext, { ok: true }>,
  row: BulkImportRow,
  projectId: string,
  workstreamMap: Map<string, WorkstreamLite>,
  ownerId: string,
): Promise<{ id: string; created: boolean } | { error: string }> {
  const key = `${projectId}|${normalizeKey(row.workstreamName)}`
  const existing = workstreamMap.get(key)
  if (existing) return { id: existing.id, created: false }

  const result = await auth.sb
    .from('workstreams')
    .insert({
      workspace_id: auth.workspaceId,
      project_id: projectId,
      name: row.workstreamName,
      description: 'Tạo tự động từ import Excel hàng loạt.',
      owner_id: ownerId,
      start_date: row.parsedStartDate,
      due_date: row.parsedDeadline,
      status: 'active',
      priority: mapPriorityToDb(row.priority),
    })
    .select('id,project_id,name')
    .single()

  if (result.error) return { error: `Không tạo được đầu việc lớn "${row.workstreamName}": ${result.error.message}` }
  workstreamMap.set(key, { id: result.data.id, project_id: result.data.project_id, name: result.data.name })
  return { id: result.data.id, created: true }
}

async function createDefaultSteps(
  auth: Extract<WorkspaceContext, { ok: true }>,
  taskId: string,
  ownerId: string,
  row: BulkImportRow,
): Promise<{ id: string | null } | { error: string }> {
  const executionDate = row.parsedDeadline ? shiftDate(row.parsedDeadline, -1) : null
  const stepPayload = [
    {
      workspace_id: auth.workspaceId,
      task_id: taskId,
      title: 'Nhận việc & xác nhận yêu cầu',
      description: 'Xác nhận phạm vi, deadline và kết quả cần nộp.',
      owner_id: ownerId,
      status: 'NOT_STARTED',
      priority: 'MEDIUM',
      start_date: row.parsedStartDate,
      due_date: row.parsedStartDate ?? row.parsedDeadline,
      is_required: true,
      sort_order: 1,
    },
    {
      workspace_id: auth.workspaceId,
      task_id: taskId,
      title: 'Thực hiện đầu việc',
      description: row.note || 'Hoàn thành phần xử lý chính của đầu việc con.',
      owner_id: ownerId,
      status: 'NOT_STARTED',
      priority: 'MEDIUM',
      start_date: row.parsedStartDate,
      due_date: executionDate ?? row.parsedDeadline,
      is_required: true,
      sort_order: 2,
    },
    {
      workspace_id: auth.workspaceId,
      task_id: taskId,
      title: 'Nộp file / báo cáo kết quả',
      description: row.expectedResult || 'Nộp file, link hoặc báo cáo kết quả để đủ điều kiện hoàn thành.',
      owner_id: ownerId,
      status: 'NOT_STARTED',
      priority: 'MEDIUM',
      start_date: executionDate,
      due_date: row.parsedDeadline,
      is_required: true,
      sort_order: 3,
    },
  ]

  const result = await auth.sb.from('task_steps').insert(stepPayload).select('id,sort_order')
  if (result.error) return { error: `Đã tạo task nhưng chưa tạo được quy trình bước: ${result.error.message}` }
  return { id: result.data?.find((step) => step.sort_order === 3)?.id ?? null }
}

async function ensureCollaborators(
  auth: Extract<WorkspaceContext, { ok: true }>,
  taskId: string,
  row: BulkImportRow,
  peopleByName: Map<string, PersonLite>,
) {
  const supporterIds = splitPeople(row.collaboratorNames)
    .map((name) => peopleByName.get(normalizeKey(name))?.id)
    .filter((id): id is string => Boolean(id))

  if (!supporterIds.length) return

  await auth.sb.from('task_assignees').upsert(
    supporterIds.map((personId) => ({
      task_id: taskId,
      person_id: personId,
      assignment_role: 'SUPPORTER',
    })),
    { onConflict: 'task_id,person_id,assignment_role' },
  )
}

async function ensureDeliverableForTask(
  auth: Extract<WorkspaceContext, { ok: true }>,
  taskId: string,
  projectId: string,
  ownerId: string,
  row: BulkImportRow,
  stepId: string | null,
): Promise<{ id: string | null } | { error: string }> {
  if (!needsFile(row.needsFile)) return { id: null }

  const existing = await auth.sb
    .from('deliverables')
    .select('id')
    .eq('workspace_id', auth.workspaceId)
    .eq('task_id', taskId)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle()

  if (existing.error) return { error: `Không kiểm tra được bàn giao của task: ${existing.error.message}` }
  if (existing.data?.id) return { id: null }

  const result = await auth.sb
    .from('deliverables')
    .insert({
      workspace_id: auth.workspaceId,
      project_id: projectId,
      task_id: taskId,
      step_id: stepId,
      name: row.expectedResult || `Kết quả: ${row.taskTitle}`,
      description: row.note || 'Tạo tự động từ import Excel. Người phụ trách cần nộp file, link hoặc báo cáo.',
      type: 'report',
      submitter_id: ownerId,
      due_date: row.parsedDeadline,
      status: 'REQUIRED',
      is_required: true,
    })
    .select('id')
    .single()

  if (result.error) return { error: `Không tạo được mục bàn giao cho "${row.taskTitle}": ${result.error.message}` }
  return { id: result.data.id }
}

async function ensureReminder(
  auth: Extract<WorkspaceContext, { ok: true }>,
  taskId: string,
  deliverableId: string,
  personId: string,
  dueDate: string | null,
): Promise<{ id: string | null } | { error: string }> {
  if (!dueDate) return { id: null }

  const result = await auth.sb
    .from('reminders')
    .insert({
      workspace_id: auth.workspaceId,
      task_id: taskId,
      deliverable_id: deliverableId,
      person_id: personId,
      channel: 'messenger',
      reminder_level: 1,
      next_follow_up_at: `${dueDate}T02:00:00.000Z`,
      response_status: 'NOT_REMINDERED',
      status: 'open',
    })
    .select('id')
    .single()

  if (result.error) return { error: `Không tạo được nhắc việc bàn giao: ${result.error.message}` }
  return { id: result.data.id }
}

function cleanIncomingRow(row: BulkImportRow): BulkImportRow {
  const deadlineType = normalizeDeadlineType(row.deadlineType ?? '')
  const parsed = parseDeadline(row.deadlineRaw ?? '', deadlineType)
  return {
    ...row,
    rowNumber: Number(row.rowNumber) || 0,
    projectName: text(row.projectName),
    workstreamName: text(row.workstreamName),
    taskTitle: text(row.taskTitle),
    ownerName: text(row.ownerName),
    collaboratorNames: text(row.collaboratorNames),
    deadlineRaw: text(row.deadlineRaw),
    deadlineType,
    priority: normalizePriorityLabel(row.priority ?? ''),
    needsFile: normalizeNeedsFileLabel(row.needsFile ?? ''),
    expectedResult: text(row.expectedResult),
    note: text(row.note),
    parsedDeadline: parsed.dueDate,
    parsedStartDate: parsed.startDate,
    parsedEndDate: parsed.endDate,
    deadlineKind: parsed.kind,
    recurringLabel: parsed.label,
    duplicateAction: row.duplicateAction === 'skip' || row.duplicateAction === 'update' || row.duplicateAction === 'create'
      ? row.duplicateAction
      : 'create',
    issues: row.issues ?? [],
    projectState: row.projectState ?? 'missing',
    workstreamState: row.workstreamState ?? 'missing',
  }
}

function buildTaskDescription(row: BulkImportRow) {
  return [
    row.note ? `Ghi chú: ${row.note}` : '',
    row.collaboratorNames ? `Người phối hợp: ${row.collaboratorNames}` : '',
    row.deadlineKind !== 'date' && row.recurringLabel ? `Deadline gốc: ${row.recurringLabel}` : '',
  ].filter(Boolean).join('\n') || null
}

function shiftDate(value: string | null, delta: number) {
  if (!value) return null
  const next = new Date(`${value}T00:00:00.000Z`)
  next.setUTCDate(next.getUTCDate() + delta)
  return next.toISOString().slice(0, 10)
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}
