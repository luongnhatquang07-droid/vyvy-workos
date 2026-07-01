export const BULK_IMPORT_TEMPLATE_FILENAME = 'vyvy-workos-bulk-task-import-template.xlsx'

export const BULK_IMPORT_HEADERS = [
  'Dự án',
  'Đầu việc lớn',
  'Đầu việc con',
  'Người phụ trách chính',
  'Người phối hợp',
  'Deadline',
  'Loại deadline',
  'Ưu tiên',
  'Có cần file/báo cáo',
  'Kết quả cần nộp',
  'Ghi chú',
] as const

export const DEADLINE_TYPE_OPTIONS = [
  'Một lần',
  'Theo ngày trong tuần',
  'Hàng tuần',
  'Hàng tháng',
  'Date range',
  'Liên tục',
] as const

export const PRIORITY_OPTIONS = ['Thấp', 'Trung bình', 'Cao', 'Khẩn cấp'] as const
export const NEEDS_FILE_OPTIONS = ['Có', 'Không'] as const

export type ImportIssueSeverity = 'error' | 'warning'
export type DuplicateAction = 'skip' | 'update' | 'create'
export type ImportIssueCode =
  | 'missing_project'
  | 'missing_workstream'
  | 'missing_task'
  | 'missing_owner'
  | 'owner_not_found'
  | 'supporter_not_found'
  | 'missing_deadline'
  | 'invalid_deadline'
  | 'new_project'
  | 'new_workstream'
  | 'duplicate_existing'
  | 'duplicate_in_file'
  | 'recurring_deadline'
  | 'range_deadline'
  | 'continuous_deadline'

export interface ImportIssue {
  severity: ImportIssueSeverity
  code: ImportIssueCode
  message: string
}

export interface ParsedDeadline {
  kind: 'date' | 'date_range' | 'weekday' | 'weekly' | 'monthly' | 'continuous' | 'unknown'
  dueDate: string | null
  startDate: string | null
  endDate: string | null
  label: string
  issues: ImportIssue[]
}

export interface BulkImportRow {
  id: string
  rowNumber: number
  projectName: string
  workstreamName: string
  taskTitle: string
  ownerName: string
  collaboratorNames: string
  deadlineRaw: string
  deadlineType: string
  priority: string
  needsFile: string
  expectedResult: string
  note: string
  parsedDeadline: string | null
  parsedStartDate: string | null
  parsedEndDate: string | null
  deadlineKind: ParsedDeadline['kind']
  recurringLabel: string
  ownerId?: string | null
  collaboratorIds?: string[]
  unknownCollaborators?: string[]
  projectId?: string | null
  workstreamId?: string | null
  projectState: 'existing' | 'new' | 'missing'
  workstreamState: 'existing' | 'new' | 'missing'
  duplicateTaskId?: string | null
  duplicateAction: DuplicateAction
  issues: ImportIssue[]
}

export interface BulkImportSummary {
  totalRows: number
  importableRows: number
  errorRows: number
  warningRows: number
  newProjects: number
  newWorkstreams: number
  duplicateRows: number
  missingOwners: number
  missingDeadlines: number
  recurringRows: number
}

export interface BulkImportCatalog {
  owners: string[]
  projects: string[]
  workstreams: string[]
  priorities: string[]
  deadlineTypes: string[]
}

export interface BulkImportPreviewPayload {
  fileName: string
  sheetName: string
  headers: string[]
  rows: BulkImportRow[]
  summary: BulkImportSummary
  catalog: BulkImportCatalog
}

export function normalizeKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[đĐ]/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

export function splitPeople(value: string) {
  return value
    .replace(/\s+và\s+/gi, ',')
    .split(/[,;\n/&]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

export function normalizeDeadlineType(value: string) {
  const normalized = normalizeKey(value)
  if (!normalized) return 'Một lần'
  if (normalized.includes('thu') || normalized.includes('ngay trong tuan')) return 'Theo ngày trong tuần'
  if (normalized.includes('hang tuan') || normalized.includes('weekly')) return 'Hàng tuần'
  if (normalized.includes('hang thang') || normalized.includes('monthly') || normalized.includes('ngay hang thang')) return 'Hàng tháng'
  if (normalized.includes('range') || normalized.includes('khoang') || normalized.includes('ca thang')) return 'Date range'
  if (normalized.includes('lien tuc')) return 'Liên tục'
  return 'Một lần'
}

export function normalizePriorityLabel(value: string) {
  const normalized = normalizeKey(value)
  if (normalized.includes('khan') || normalized.includes('critical')) return 'Khẩn cấp'
  if (normalized.includes('cao') || normalized.includes('high') || normalized.includes('gap')) return 'Cao'
  if (normalized.includes('thap') || normalized.includes('low')) return 'Thấp'
  return 'Trung bình'
}

export function mapPriorityToDb(value: string) {
  const label = normalizePriorityLabel(value)
  if (label === 'Khẩn cấp') return 'CRITICAL'
  if (label === 'Cao') return 'HIGH'
  if (label === 'Thấp') return 'LOW'
  return 'MEDIUM'
}

export function normalizeNeedsFileLabel(value: string) {
  const normalized = normalizeKey(value)
  if (!normalized) return 'Có'
  if (['khong', 'no', 'false', '0'].includes(normalized)) return 'Không'
  return 'Có'
}

export function needsFile(value: string) {
  return normalizeNeedsFileLabel(value) !== 'Không'
}

export function parseDeadline(rawValue: string, deadlineTypeValue: string, now = new Date()): ParsedDeadline {
  const raw = rawValue.trim()
  const deadlineType = normalizeDeadlineType(deadlineTypeValue)
  const currentYear = getVietnamYear(now)
  const currentMonth = getVietnamMonth(now)
  const normalized = normalizeKey(raw)
  const issues: ImportIssue[] = []

  if (!raw) {
    if (deadlineType === 'Hàng tuần' || deadlineType === 'Hàng tháng' || deadlineType === 'Theo ngày trong tuần') {
      issues.push({
        severity: 'warning',
        code: 'recurring_deadline',
        message: `${deadlineType} chưa có ngày cụ thể, app sẽ import task chưa gắn ngày chốt.`,
      })
      return { kind: deadlineType === 'Hàng tháng' ? 'monthly' : 'weekly', dueDate: null, startDate: null, endDate: null, label: deadlineType, issues }
    }
    issues.push({ severity: 'error', code: 'missing_deadline', message: 'Thiếu deadline.' })
    return { kind: 'unknown', dueDate: null, startDate: null, endDate: null, label: '', issues }
  }

  const range = parseDateRange(raw, currentYear)
  if (range) {
    issues.push({
      severity: 'warning',
      code: 'range_deadline',
      message: 'Deadline là một khoảng ngày, app sẽ dùng ngày cuối làm ngày chốt.',
    })
    return {
      kind: 'date_range',
      dueDate: range.endDate,
      startDate: range.startDate,
      endDate: range.endDate,
      label: `${range.startDate} → ${range.endDate}`,
      issues,
    }
  }

  const monthRange = parseMonthRange(normalized, currentYear)
  if (monthRange) {
    issues.push({
      severity: 'warning',
      code: 'range_deadline',
      message: 'Deadline theo cả tháng, app sẽ dùng ngày cuối tháng làm ngày chốt.',
    })
    return {
      kind: 'date_range',
      dueDate: monthRange.endDate,
      startDate: monthRange.startDate,
      endDate: monthRange.endDate,
      label: `${monthRange.startDate} → ${monthRange.endDate}`,
      issues,
    }
  }

  const directDate = parseFlexibleDate(raw, currentYear, currentMonth)
  if (directDate) {
    const kind = deadlineType === 'Liên tục' || normalized.includes('lien tuc') ? 'continuous' : 'date'
    if (kind === 'continuous') {
      issues.push({
        severity: 'warning',
        code: 'continuous_deadline',
        message: 'Deadline liên tục, app sẽ dùng ngày này làm mốc theo dõi.',
      })
    }
    return { kind, dueDate: directDate, startDate: null, endDate: directDate, label: directDate, issues }
  }

  if (deadlineType === 'Hàng tuần' || isWeekday(normalized)) {
    issues.push({
      severity: 'warning',
      code: 'recurring_deadline',
      message: 'Deadline theo tuần, cần chọn ngày cụ thể sau khi import nếu muốn hiện trên lịch.',
    })
    return { kind: 'weekly', dueDate: null, startDate: null, endDate: null, label: raw, issues }
  }

  if (deadlineType === 'Hàng tháng' || normalized.startsWith('ngay ')) {
    const monthlyDay = normalized.match(/(?:ngay\s*)?(\d{1,2})/)?.[1]
    issues.push({
      severity: 'warning',
      code: 'recurring_deadline',
      message: monthlyDay
        ? `Deadline hàng tháng ngày ${monthlyDay}, cần chọn kỳ cụ thể nếu muốn hiện trên lịch.`
        : 'Deadline hàng tháng, cần chọn ngày cụ thể sau khi import nếu muốn hiện trên lịch.',
    })
    return { kind: 'monthly', dueDate: null, startDate: null, endDate: null, label: raw, issues }
  }

  issues.push({
    severity: 'error',
    code: 'invalid_deadline',
    message: 'Deadline chưa đọc được. Hãy nhập dạng 2026-07-07, 7/7/2026, 7/7 hoặc cả tháng 7.',
  })
  return { kind: 'unknown', dueDate: null, startDate: null, endDate: null, label: raw, issues }
}

export function makeImportSummary(rows: BulkImportRow[]): BulkImportSummary {
  return {
    totalRows: rows.length,
    importableRows: rows.filter((row) => !hasImportErrors(row)).length,
    errorRows: rows.filter(hasImportErrors).length,
    warningRows: rows.filter((row) => row.issues.some((issue) => issue.severity === 'warning')).length,
    newProjects: rows.filter((row) => row.projectState === 'new').length,
    newWorkstreams: rows.filter((row) => row.workstreamState === 'new').length,
    duplicateRows: rows.filter((row) => Boolean(row.duplicateTaskId) || row.issues.some((issue) => issue.code === 'duplicate_in_file')).length,
    missingOwners: rows.filter((row) => row.issues.some((issue) => issue.code === 'missing_owner' || issue.code === 'owner_not_found')).length,
    missingDeadlines: rows.filter((row) => row.issues.some((issue) => issue.code === 'missing_deadline' || issue.code === 'invalid_deadline')).length,
    recurringRows: rows.filter((row) => row.deadlineKind === 'weekly' || row.deadlineKind === 'monthly').length,
  }
}

export function hasImportErrors(row: BulkImportRow) {
  return row.issues.some((issue) => issue.severity === 'error')
}

export function makeImportRowKey(row: Pick<BulkImportRow, 'projectName' | 'workstreamName' | 'taskTitle' | 'ownerName' | 'parsedDeadline'>) {
  return [
    normalizeKey(row.projectName),
    normalizeKey(row.workstreamName),
    normalizeKey(row.taskTitle),
    normalizeKey(row.ownerName),
    row.parsedDeadline ?? '',
  ].join('|')
}

function isWeekday(value: string) {
  return /\bthu\s*(2|3|4|5|6|7|hai|ba|tu|nam|sau|bay)\b/.test(value) || value.includes('chu nhat')
}

function parseDateRange(value: string, currentYear: number) {
  const compactDash = value.match(/^(\d{1,2}[\/.]\d{1,2}(?:[\/.]\d{2,4})?)\s*-\s*(\d{1,2}[\/.]\d{1,2}(?:[\/.]\d{2,4})?)$/)
  if (compactDash) {
    const startDate = parseFlexibleDate(compactDash[1], currentYear, null)
    const endDate = parseFlexibleDate(compactDash[2], currentYear, startDate ? Number(startDate.slice(5, 7)) : null)
    if (startDate && endDate) return { startDate, endDate }
  }

  const normalized = value.replace(/\s+(đến|den|toi|tới|->|—|–|-)\s+/gi, ' - ')
  const parts = normalized.split(/\s+-\s+/).map((part) => part.trim()).filter(Boolean)
  if (parts.length < 2) return null

  const startDate = parseFlexibleDate(parts[0], currentYear, null)
  const endDate = parseFlexibleDate(parts[1], currentYear, startDate ? Number(startDate.slice(5, 7)) : null)
  if (!startDate || !endDate) return null
  return { startDate, endDate }
}

function parseMonthRange(normalized: string, currentYear: number) {
  const match = normalized.match(/(?:ca\s*)?thang\s*(\d{1,2})(?:\s*\/\s*(\d{2,4}))?/)
  if (!match) return null
  const month = Number(match[1])
  if (month < 1 || month > 12) return null
  const year = match[2] ? normalizeYear(Number(match[2])) : currentYear
  const startDate = formatDate(year, month, 1)
  const endDate = formatDate(year, month, new Date(year, month, 0).getDate())
  return { startDate, endDate }
}

function parseFlexibleDate(value: string, currentYear: number, fallbackMonth: number | null) {
  const trimmed = value.trim()
  const iso = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (iso) return validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]))

  const slash = trimmed.match(/(?:ngày|ngay|đến|den|tới|toi|liên tục|lien tuc)?\s*(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?/i)
  if (slash) {
    const day = Number(slash[1])
    const month = Number(slash[2])
    const year = slash[3] ? normalizeYear(Number(slash[3])) : currentYear
    return validDate(year, month, day)
  }

  const monthlyDay = trimmed.match(/(?:ngày|ngay)\s*(\d{1,2})(?![\/.-])/i)
  if (monthlyDay && fallbackMonth) {
    return validDate(currentYear, fallbackMonth, Number(monthlyDay[1]))
  }

  const excelSerial = trimmed.match(/^\d{5}$/)
  if (excelSerial) {
    const serial = Number(trimmed)
    if (serial >= 30000 && serial <= 60000) {
      const epoch = Date.UTC(1899, 11, 30)
      const date = new Date(epoch + serial * 24 * 60 * 60 * 1000)
      return formatDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate())
    }
  }

  return null
}

function normalizeYear(value: number) {
  if (value < 100) return value + 2000
  return value
}

function validDate(year: number, month: number, day: number) {
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return formatDate(year, month, day)
}

function formatDate(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function getVietnamYear(now: Date) {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric' }).format(now))
}

function getVietnamMonth(now: Date) {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Ho_Chi_Minh', month: 'numeric' }).format(now))
}
