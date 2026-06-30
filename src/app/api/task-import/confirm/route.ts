import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface ImportRow {
  id: string
  group: string
  title: string
  owner: string
  collaborators: string
  inputDeadline: string
  status: string
  priority: string
  expectedResult: string
  note: string
  source: string
}

export async function POST(request: Request) {
  const sb = await createClient()
  const {
    data: { user },
  } = await sb.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Bạn cần đăng nhập trước khi nhập đầu việc.' }, { status: 401 })
  }

  const profileRes = await sb
    .from('profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (profileRes.error || !profileRes.data?.id) {
    return NextResponse.json({ error: 'Tài khoản chưa có profile trong workspace.' }, { status: 403 })
  }

  const membershipRes = await sb
    .from('workspace_memberships')
    .select('workspace_id')
    .eq('profile_id', profileRes.data.id)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()

  if (membershipRes.error || !membershipRes.data?.workspace_id) {
    return NextResponse.json({ error: 'Tài khoản chưa được gắn workspace.' }, { status: 403 })
  }

  const body = (await request.json()) as { rows?: ImportRow[] }
  const rows = (body.rows ?? []).map(normalizeImportRow).filter((row) => row.title)
  if (!rows.length) {
    return NextResponse.json({ error: 'Không có dòng đầu việc hợp lệ để nhập.' }, { status: 400 })
  }

  const invalidRows = rows.filter((row) => !row.owner || !isDate(row.inputDeadline))
  if (invalidRows.length > 0) {
    return NextResponse.json(
      { error: 'Còn đầu việc thiếu người phụ trách hoặc deadline chuẩn YYYY-MM-DD.' },
      { status: 400 },
    )
  }

  const workspaceId = membershipRes.data.workspace_id
  const peopleRes = await sb
    .from('people')
    .select('id,full_name')
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)

  if (peopleRes.error) {
    return NextResponse.json({ error: `Không đọc được danh sách nhân sự: ${peopleRes.error.message}` }, { status: 500 })
  }

  const peopleByName = new Map((peopleRes.data ?? []).map((person) => [normalizeText(person.full_name), person.id]))
  const unknownOwners = Array.from(new Set(rows.map((row) => row.owner).filter((owner) => !peopleByName.has(normalizeText(owner)))))
  if (unknownOwners.length > 0) {
    return NextResponse.json(
      { error: `Chưa có nhân sự trong database: ${unknownOwners.join(', ')}. Hãy thêm nhân sự trước rồi import lại.` },
      { status: 400 },
    )
  }

  const project = await ensureImportProject(sb, workspaceId, rows[0].owner ? peopleByName.get(normalizeText(rows[0].owner)) ?? null : null)
  if ('error' in project) return NextResponse.json({ error: project.error }, { status: 500 })

  const workstreams = await ensureWorkstreams(sb, workspaceId, project.id, rows)
  if ('error' in workstreams) return NextResponse.json({ error: workstreams.error }, { status: 500 })

  const taskPayload = rows.map((row) => ({
    workspace_id: workspaceId,
    project_id: project.id,
    workstream_id: workstreams.byName.get(row.group || 'Chưa phân nhóm') ?? null,
    title: row.title,
    description: row.note || row.source || null,
    expected_result: row.expectedResult || null,
    owner_id: peopleByName.get(normalizeText(row.owner)) ?? null,
    status: mapStatus(row.status),
    priority: mapPriority(row.priority),
    due_date: row.inputDeadline,
  }))

  const tasksRes = await sb.from('tasks').insert(taskPayload).select('id,title,project_id,workstream_id,owner_id,due_date')
  if (tasksRes.error) {
    return NextResponse.json({ error: `Không tạo được task: ${tasksRes.error.message}` }, { status: 500 })
  }

  const tasks = tasksRes.data ?? []
  const stepPayload = tasks.flatMap((task) => [
    {
      workspace_id: workspaceId,
      task_id: task.id,
      title: 'Nhận việc & xác nhận yêu cầu',
      description: 'Xác nhận đã hiểu yêu cầu, phạm vi và đầu ra cần nộp.',
      owner_id: task.owner_id,
      status: 'NOT_STARTED',
      priority: 'MEDIUM',
      due_date: task.due_date,
      is_required: true,
      sort_order: 1,
    },
    {
      workspace_id: workspaceId,
      task_id: task.id,
      title: 'Thực hiện công việc',
      description: 'Hoàn thành phần xử lý chính của đầu việc con.',
      owner_id: task.owner_id,
      status: 'NOT_STARTED',
      priority: 'MEDIUM',
      due_date: task.due_date,
      is_required: true,
      sort_order: 2,
    },
    {
      workspace_id: workspaceId,
      task_id: task.id,
      title: 'Nộp kết quả / file / báo cáo',
      description: 'Nộp file, đường link hoặc báo cáo kết quả để đủ điều kiện hoàn thành.',
      owner_id: task.owner_id,
      status: 'NOT_STARTED',
      priority: 'MEDIUM',
      due_date: task.due_date,
      is_required: true,
      sort_order: 3,
    },
  ])

  let submitSteps: Array<{ id: string; task_id: string }> = []
  if (stepPayload.length) {
    const stepsRes = await sb.from('task_steps').insert(stepPayload).select('id,task_id,sort_order')
    if (stepsRes.error) {
      return NextResponse.json({ error: `Đã tạo task nhưng chưa tạo được bước: ${stepsRes.error.message}` }, { status: 500 })
    }
    submitSteps = (stepsRes.data ?? [])
      .filter((step) => step.sort_order === 3)
      .map((step) => ({ id: step.id, task_id: step.task_id }))
  }

  const deliverablePayload = tasks.map((task) => ({
    workspace_id: workspaceId,
    project_id: task.project_id,
    task_id: task.id,
    step_id: submitSteps.find((step) => step.task_id === task.id)?.id ?? null,
    name: `Kết quả: ${task.title}`,
    description: 'Tự tạo từ file Excel import. Người phụ trách cần nộp file hoặc nhập báo cáo.',
    type: 'report',
    submitter_id: task.owner_id,
    due_date: task.due_date,
    status: 'REQUIRED',
    is_required: true,
  }))

  if (deliverablePayload.length) {
    const deliverableRes = await sb.from('deliverables').insert(deliverablePayload)
    if (deliverableRes.error) {
      return NextResponse.json({ error: `Đã tạo task nhưng chưa tạo được mục bàn giao: ${deliverableRes.error.message}` }, { status: 500 })
    }
  }

  await sb.from('activity_logs').insert({
    workspace_id: workspaceId,
    action: 'IMPORT_TASKS_FROM_EXCEL',
    entity_type: 'task',
    entity_id: tasks[0]?.id ?? null,
    metadata: { count: tasks.length, project_id: project.id },
  })

  return NextResponse.json({ imported: tasks.length, projectId: project.id })
}

async function ensureImportProject(
  sb: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
  ownerId: string | null,
): Promise<{ id: string } | { error: string }> {
  const existing = await sb
    .from('projects')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('code', 'IMPORT')
    .is('deleted_at', null)
    .maybeSingle()

  if (existing.error) return { error: `Không kiểm tra được dự án import: ${existing.error.message}` }
  if (existing.data?.id) return { id: existing.data.id }

  const created = await sb
    .from('projects')
    .insert({
      workspace_id: workspaceId,
      name: 'Đầu việc đã xác nhận từ Excel',
      code: 'IMPORT',
      description: 'Dự án gom các đầu việc được xác nhận từ file Excel công ty.',
      owner_id: ownerId,
      status: 'active',
      health_status: 'NO_DATA',
    })
    .select('id')
    .single()

  if (created.error) return { error: `Không tạo được dự án import: ${created.error.message}` }
  return { id: created.data.id }
}

async function ensureWorkstreams(
  sb: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
  projectId: string,
  rows: ImportRow[],
): Promise<{ byName: Map<string, string> } | { error: string }> {
  const names = Array.from(new Set(rows.map((row) => row.group || 'Chưa phân nhóm')))
  const existing = await sb
    .from('workstreams')
    .select('id,name')
    .eq('workspace_id', workspaceId)
    .eq('project_id', projectId)
    .is('deleted_at', null)

  if (existing.error) return { error: `Không kiểm tra được đầu việc lớn: ${existing.error.message}` }

  const byName = new Map((existing.data ?? []).map((item) => [item.name, item.id]))
  const missing = names.filter((name) => !byName.has(name))

  if (missing.length > 0) {
    const created = await sb
      .from('workstreams')
      .insert(
        missing.map((name, index) => ({
          workspace_id: workspaceId,
          project_id: projectId,
          name,
          status: 'active',
          priority: 'MEDIUM',
          sort_order: (existing.data?.length ?? 0) + index + 1,
        })),
      )
      .select('id,name')

    if (created.error) return { error: `Không tạo được đầu việc lớn: ${created.error.message}` }
    ;(created.data ?? []).forEach((item) => byName.set(item.name, item.id))
  }

  return { byName }
}

function normalizeImportRow(row: ImportRow): ImportRow {
  return {
    id: row.id,
    group: (row.group ?? '').trim(),
    title: (row.title ?? '').trim(),
    owner: (row.owner ?? '').trim(),
    collaborators: (row.collaborators ?? '').trim(),
    inputDeadline: (row.inputDeadline ?? '').trim(),
    status: (row.status ?? '').trim(),
    priority: (row.priority ?? '').trim(),
    expectedResult: (row.expectedResult ?? '').trim(),
    note: (row.note ?? '').trim(),
    source: (row.source ?? '').trim(),
  }
}

function mapStatus(value: string) {
  const normalized = normalizeText(value)
  if (normalized.includes('hoan thanh')) return 'COMPLETED'
  if (normalized.includes('cho duyet')) return 'PENDING_APPROVAL'
  if (normalized.includes('tre') || normalized.includes('chan') || normalized.includes('tam dung')) return 'BLOCKED'
  if (normalized.includes('dang lam')) return 'IN_PROGRESS'
  return 'NOT_STARTED'
}

function mapPriority(value: string) {
  const normalized = normalizeText(value)
  if (normalized.includes('cao') || normalized.includes('gap')) return 'HIGH'
  if (normalized.includes('thap')) return 'LOW'
  return 'MEDIUM'
}

function normalizeText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
}

function isDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}
