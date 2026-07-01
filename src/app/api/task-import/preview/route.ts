import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  DEADLINE_TYPE_OPTIONS,
  PRIORITY_OPTIONS,
  type BulkImportRow,
  type ImportIssue,
  makeImportRowKey,
  makeImportSummary,
  normalizeDeadlineType,
  normalizeKey,
  normalizeNeedsFileLabel,
  normalizePriorityLabel,
  parseDeadline,
  splitPeople,
} from '@/lib/taskImport'

export const runtime = 'nodejs'

const execFileAsync = promisify(execFile)
const MAX_FILE_SIZE = 10 * 1024 * 1024

type WorkspaceContext =
  | { ok: true; sb: Awaited<ReturnType<typeof createClient>>; workspaceId: string; actorId: string | null }
  | { ok: false; response: NextResponse }

interface RawExcelPayload {
  sheetName: string
  headers: string[]
  rows: Array<{ rowNumber: number; values: Record<string, string> }>
}

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

export async function POST(req: NextRequest) {
  const auth = await getWorkspace()
  if (!auth.ok) return auth.response

  let tempFilePath = ''

  try {
    const form = await req.formData()
    const file = form.get('file')

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Thiếu file Excel để đọc.' }, { status: 400 })
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File Excel vượt quá giới hạn 10MB.' }, { status: 400 })
    }

    const extension = file.name.split('.').pop()?.toLowerCase()
    if (!extension || !['xlsx', 'xlsm', 'xltx', 'xltm'].includes(extension)) {
      return NextResponse.json({ error: 'Chỉ hỗ trợ file Excel .xlsx/.xlsm/.xltx/.xltm.' }, { status: 400 })
    }

    const pythonPath = await findBundledPython()
    if (!pythonPath) {
      return NextResponse.json({ error: 'Không tìm thấy môi trường đọc Excel trên máy hiện tại.' }, { status: 500 })
    }

    tempFilePath = path.join(os.tmpdir(), `vyvy-import-${Date.now()}-${sanitizeName(file.name)}`)
    await fs.writeFile(tempFilePath, Buffer.from(await file.arrayBuffer()))

    const rawPayload = await readExcelFile(pythonPath, tempFilePath)
    const context = await loadImportContext(auth)
    const rows = buildPreviewRows(rawPayload.rows, context)

    return NextResponse.json({
      fileName: file.name,
      sheetName: rawPayload.sheetName,
      headers: rawPayload.headers,
      rows,
      summary: makeImportSummary(rows),
      catalog: {
        owners: context.people.map((person) => person.full_name).sort((a, b) => a.localeCompare(b, 'vi')),
        projects: context.projects.map((project) => project.name).sort((a, b) => a.localeCompare(b, 'vi')),
        workstreams: context.workstreams.map((workstream) => workstream.name).sort((a, b) => a.localeCompare(b, 'vi')),
        priorities: [...PRIORITY_OPTIONS],
        deadlineTypes: [...DEADLINE_TYPE_OPTIONS],
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Không đọc được file Excel.' },
      { status: 500 },
    )
  } finally {
    if (tempFilePath) await fs.unlink(tempFilePath).catch(() => undefined)
  }
}

async function getWorkspace(): Promise<WorkspaceContext> {
  const sb = await createClient()
  const {
    data: { user },
  } = await sb.auth.getUser()

  if (!user) return { ok: false, response: NextResponse.json({ error: 'Bạn cần đăng nhập trước khi import.' }, { status: 401 }) }

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

async function readExcelFile(pythonPath: string, filePath: string): Promise<RawExcelPayload> {
  const script = `
import datetime, json, sys, unicodedata
import openpyxl

def to_text(value):
    if value is None:
        return ""
    if isinstance(value, datetime.datetime):
        return value.strftime("%Y-%m-%d")
    if isinstance(value, datetime.date):
        return value.strftime("%Y-%m-%d")
    return str(value).strip()

def normalize(value):
    text = str(value or "").replace("đ", "d").replace("Đ", "D").strip().lower()
    text = unicodedata.normalize("NFD", text)
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    return " ".join(text.split())

wb = openpyxl.load_workbook(sys.argv[1], data_only=True)
sheet = wb[wb.sheetnames[0]]

header_row = None
headers = []
for row_idx in range(1, min(sheet.max_row, 30) + 1):
    values = [to_text(sheet.cell(row_idx, col).value) for col in range(1, min(sheet.max_column, 40) + 1)]
    normalized = [normalize(value) for value in values]
    if "du an" in normalized and "dau viec con" in normalized:
        header_row = row_idx
        headers = values
        break

if header_row is None:
    raise RuntimeError("Không tìm thấy dòng tiêu đề có cột Dự án và Đầu việc con.")

while headers and not headers[-1]:
    headers.pop()

rows = []
for row_idx in range(header_row + 1, sheet.max_row + 1):
    record = {}
    has_value = False
    for col_idx, header in enumerate(headers, start=1):
        value = to_text(sheet.cell(row_idx, col_idx).value)
        if value:
            has_value = True
        record[header] = value
    if has_value:
        rows.append({ "rowNumber": row_idx, "values": record })

print(json.dumps({ "sheetName": sheet.title, "headers": headers, "rows": rows }, ensure_ascii=False))
`.trim()

  const { stdout, stderr } = await execFileAsync(
    pythonPath,
    ['-c', script, filePath],
    { encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } },
  )

  if (stderr?.trim()) console.warn(stderr)
  return JSON.parse(stdout) as RawExcelPayload
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

function buildPreviewRows(
  rawRows: RawExcelPayload['rows'],
  context: Awaited<ReturnType<typeof loadImportContext>>,
): BulkImportRow[] {
  const peopleByName = new Map(context.people.map((person) => [normalizeKey(person.full_name), person]))
  const projectsByName = new Map(context.projects.map((project) => [normalizeKey(project.name), project]))
  const workstreamsByProjectAndName = new Map(
    context.workstreams.map((workstream) => [`${workstream.project_id}|${normalizeKey(workstream.name)}`, workstream]),
  )
  const tasksByProjectWorkstreamTitle = new Map(
    context.tasks.map((task) => [`${task.project_id ?? ''}|${task.workstream_id ?? ''}|${normalizeKey(task.title)}`, task]),
  )
  const seenInFile = new Set<string>()

  return rawRows.map((raw, index) => {
    const projectName = valueFor(raw.values, ['Dự án', 'Project'])
    const workstreamName = valueFor(raw.values, ['Đầu việc lớn', 'Workstream', 'Mảng công việc'])
    const taskTitle = valueFor(raw.values, ['Đầu việc con', 'Task', 'Công việc'])
    const ownerName = valueFor(raw.values, ['Người phụ trách chính', 'Owner', 'Người phụ trách'])
    const collaboratorNames = valueFor(raw.values, ['Người phối hợp', 'Người hỗ trợ', 'Supporter'])
    const deadlineRaw = valueFor(raw.values, ['Deadline', 'Ngày chốt', 'Hạn nộp'])
    const deadlineType = normalizeDeadlineType(valueFor(raw.values, ['Loại deadline', 'Deadline type']))
    const priority = normalizePriorityLabel(valueFor(raw.values, ['Ưu tiên', 'Priority']))
    const needsFileLabel = normalizeNeedsFileLabel(valueFor(raw.values, ['Có cần file/báo cáo', 'Cần file', 'Needs file']))
    const expectedResult = valueFor(raw.values, ['Kết quả cần nộp', 'Đầu ra', 'Expected result'])
    const note = valueFor(raw.values, ['Ghi chú', 'Note'])
    const parsed = parseDeadline(deadlineRaw, deadlineType)
    const issues: ImportIssue[] = [...parsed.issues]
    const project = projectsByName.get(normalizeKey(projectName))
    const workstream = project ? workstreamsByProjectAndName.get(`${project.id}|${normalizeKey(workstreamName)}`) : null
    const owner = peopleByName.get(normalizeKey(ownerName))
    const collaboratorList = splitPeople(collaboratorNames)
    const unknownCollaborators = collaboratorList.filter((name) => !peopleByName.has(normalizeKey(name)))
    const duplicateCandidate = project && workstream
      ? tasksByProjectWorkstreamTitle.get(`${project.id}|${workstream.id}|${normalizeKey(taskTitle)}`)
      : null

    if (!projectName) issues.push({ severity: 'error', code: 'missing_project', message: 'Thiếu dự án.' })
    else if (!project) issues.push({ severity: 'warning', code: 'new_project', message: 'Dự án chưa có, sẽ tạo mới khi xác nhận.' })

    if (!workstreamName) issues.push({ severity: 'error', code: 'missing_workstream', message: 'Thiếu đầu việc lớn.' })
    else if (projectName && !workstream) issues.push({ severity: 'warning', code: 'new_workstream', message: 'Đầu việc lớn chưa có trong dự án, sẽ tạo mới.' })

    if (!taskTitle) issues.push({ severity: 'error', code: 'missing_task', message: 'Thiếu đầu việc con.' })
    if (!ownerName) issues.push({ severity: 'error', code: 'missing_owner', message: 'Thiếu người phụ trách chính.' })
    else if (!owner) issues.push({ severity: 'error', code: 'owner_not_found', message: `Chưa có nhân sự "${ownerName}" trong app.` })

    if (unknownCollaborators.length) {
      issues.push({
        severity: 'warning',
        code: 'supporter_not_found',
        message: `Người phối hợp chưa có trong app: ${unknownCollaborators.join(', ')}.`,
      })
    }

    const rowForKey = {
      projectName,
      workstreamName,
      taskTitle,
      ownerName,
      parsedDeadline: parsed.dueDate,
    }
    const inFileKey = makeImportRowKey(rowForKey)
    if (seenInFile.has(inFileKey)) {
      issues.push({ severity: 'warning', code: 'duplicate_in_file', message: 'Có thể trùng với một dòng khác trong file.' })
    } else {
      seenInFile.add(inFileKey)
    }

    if (duplicateCandidate) {
      issues.push({ severity: 'warning', code: 'duplicate_existing', message: 'Đầu việc con có thể đã tồn tại trong hệ thống.' })
    }

    return {
      id: `row-${raw.rowNumber}-${index}`,
      rowNumber: raw.rowNumber,
      projectName,
      workstreamName,
      taskTitle,
      ownerName,
      collaboratorNames,
      deadlineRaw,
      deadlineType,
      priority,
      needsFile: needsFileLabel,
      expectedResult,
      note,
      parsedDeadline: parsed.dueDate,
      parsedStartDate: parsed.startDate,
      parsedEndDate: parsed.endDate,
      deadlineKind: parsed.kind,
      recurringLabel: parsed.label,
      ownerId: owner?.id ?? null,
      collaboratorIds: collaboratorList
        .map((name) => peopleByName.get(normalizeKey(name))?.id)
        .filter(Boolean) as string[],
      unknownCollaborators,
      projectId: project?.id ?? null,
      workstreamId: workstream?.id ?? null,
      projectState: !projectName ? 'missing' : project ? 'existing' : 'new',
      workstreamState: !workstreamName ? 'missing' : workstream ? 'existing' : 'new',
      duplicateTaskId: duplicateCandidate?.id ?? null,
      duplicateAction: duplicateCandidate ? 'skip' : 'create',
      issues,
    } satisfies BulkImportRow
  }).filter((row) => row.projectName || row.workstreamName || row.taskTitle)
}

function valueFor(record: Record<string, string>, labels: string[]) {
  const wanted = new Set(labels.map(normalizeKey))
  for (const [key, value] of Object.entries(record)) {
    if (wanted.has(normalizeKey(key))) return value.trim()
  }
  return ''
}

async function findBundledPython() {
  const candidates = [
    process.env.CODEX_BUNDLED_PYTHON,
    'C:\\Users\\PC\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe',
    'C:\\Users\\PC\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe',
  ].filter(Boolean) as string[]

  for (const candidate of candidates) {
    try {
      await fs.access(candidate)
      return candidate
    } catch {
      continue
    }
  }

  return ''
}

function sanitizeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_')
}
