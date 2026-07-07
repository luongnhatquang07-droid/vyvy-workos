import { getRoleLabel } from '@/lib/rbac/roles'

export const PERMISSION_ACTIONS = ['view', 'create', 'edit', 'delete', 'approve', 'approve_on_behalf', 'upload', 'export'] as const

export type PermissionAction = (typeof PERMISSION_ACTIONS)[number]

export const PERMISSION_SCOPES = ['none', 'own', 'department', 'assigned_projects', 'company'] as const

export type PermissionScope = (typeof PERMISSION_SCOPES)[number]

export type PermissionMatrixRow = {
  module: PermissionModuleKey
  scope: PermissionScope
  actions: Record<PermissionAction, boolean>
}

export type PermissionModuleKey =
  | 'command_center'
  | 'projects'
  | 'workstreams'
  | 'subtasks'
  | 'steps'
  | 'deliverables'
  | 'file_library'
  | 'approvals'
  | 'follow_ups'
  | 'calendar'
  | 'reports'
  | 'user_management'
  | 'system_settings'

export const PERMISSION_MODULES: Array<{ key: PermissionModuleKey; label: string; description: string }> = [
  { key: 'command_center', label: 'Command Center', description: 'Hàng đợi điều hành và việc cần xử lý.' },
  { key: 'projects', label: 'Dự án', description: 'Cấp project và tổng quan dự án.' },
  { key: 'workstreams', label: 'Đầu việc lớn', description: 'Nhóm việc / workstream trong dự án.' },
  { key: 'subtasks', label: 'Đầu việc con', description: 'Task vận hành hằng ngày.' },
  { key: 'steps', label: 'Step / Bước thực hiện', description: 'Bước chi tiết trong task.' },
  { key: 'deliverables', label: 'Bàn giao / Deliverables', description: 'File, link, báo cáo cần nộp.' },
  { key: 'file_library', label: 'File Library', description: 'Kho file và lịch sử version.' },
  { key: 'approvals', label: 'Phê duyệt / Approvals', description: 'Duyệt file và yêu cầu sửa.' },
  { key: 'follow_ups', label: 'Follow-ups', description: 'Nhắc việc và theo dõi phản hồi.' },
  { key: 'calendar', label: 'Calendar', description: 'Deadline và lịch vận hành.' },
  { key: 'reports', label: 'Báo cáo', description: 'Báo cáo CEO và tải việc nhân sự.' },
  { key: 'user_management', label: 'Quản lý tài khoản', description: 'Tạo, sửa, khóa, reset tài khoản.' },
  { key: 'system_settings', label: 'Cài đặt hệ thống', description: 'Thiết lập workspace và hệ thống.' },
]

export const ACTION_LABELS: Record<PermissionAction, string> = {
  view: 'Xem',
  create: 'Tạo',
  edit: 'Sửa',
  delete: 'Xóa',
  approve: 'Duyệt',
  approve_on_behalf: 'Duyệt thay',
  upload: 'Upload',
  export: 'Export',
}

export const SCOPE_LABELS: Record<PermissionScope, string> = {
  none: 'Không có',
  own: 'Việc của tôi',
  department: 'Phòng ban của tôi',
  assigned_projects: 'Dự án được gán',
  company: 'Toàn công ty',
}

export function buildDefaultPermissionMatrix(roleCode: string | null | undefined): PermissionMatrixRow[] {
  const role = normalizeRoleCode(roleCode)
  const matrix = emptyMatrix()

  if (role === 'ADMIN') {
    return matrix.map((row) => allow(row, 'company', PERMISSION_ACTIONS))
  }

  if (role === 'CEO' || role === 'CEO_READONLY') {
    set(matrix, 'command_center', 'company', ['view'])
    set(matrix, 'projects', 'company', ['view'])
    set(matrix, 'workstreams', 'company', ['view'])
    set(matrix, 'subtasks', 'company', ['view'])
    set(matrix, 'steps', 'company', ['view'])
    set(matrix, 'deliverables', 'company', ['view'])
    set(matrix, 'file_library', 'company', ['view'])
    set(matrix, 'approvals', role === 'CEO' ? 'company' : 'none', role === 'CEO' ? ['view', 'approve', 'approve_on_behalf'] : [])
    set(matrix, 'follow_ups', 'company', ['view'])
    set(matrix, 'calendar', 'company', ['view'])
    set(matrix, 'reports', 'company', ['view', 'export'])
    return matrix
  }

  if (role === 'COO' || role === 'PROJECT_COORDINATOR') {
    set(matrix, 'command_center', 'company', ['view'])
    set(matrix, 'projects', 'company', ['view', 'create', 'edit'])
    set(matrix, 'workstreams', 'company', ['view', 'create', 'edit'])
    set(matrix, 'subtasks', 'company', ['view', 'create', 'edit'])
    set(matrix, 'steps', 'company', ['view', 'create', 'edit', 'upload'])
    set(matrix, 'deliverables', 'company', ['view', 'create', 'edit', 'approve', 'upload'])
    set(matrix, 'file_library', 'company', ['view', 'upload'])
    set(matrix, 'approvals', 'company', role === 'COO' ? ['view', 'approve', 'approve_on_behalf'] : ['view', 'approve'])
    set(matrix, 'follow_ups', 'company', ['view', 'create', 'edit'])
    set(matrix, 'calendar', 'company', ['view'])
    set(matrix, 'reports', 'company', ['view', 'export'])
    return matrix
  }

  if (role === 'DEPARTMENT_HEAD') {
    set(matrix, 'command_center', 'department', ['view'])
    set(matrix, 'projects', 'department', ['view', 'edit'])
    set(matrix, 'workstreams', 'department', ['view', 'edit'])
    set(matrix, 'subtasks', 'department', ['view', 'create', 'edit'])
    set(matrix, 'steps', 'department', ['view', 'create', 'edit', 'upload'])
    set(matrix, 'deliverables', 'department', ['view', 'approve', 'upload'])
    set(matrix, 'file_library', 'department', ['view', 'upload'])
    set(matrix, 'approvals', 'department', ['view', 'approve'])
    set(matrix, 'follow_ups', 'department', ['view', 'create', 'edit'])
    set(matrix, 'calendar', 'department', ['view'])
    set(matrix, 'reports', 'department', ['view', 'export'])
    return matrix
  }

  set(matrix, 'command_center', 'own', ['view'])
  set(matrix, 'projects', 'own', ['view'])
  set(matrix, 'workstreams', 'own', ['view'])
  set(matrix, 'subtasks', 'own', ['view', 'edit'])
  set(matrix, 'steps', 'own', ['view', 'edit', 'upload'])
  set(matrix, 'deliverables', 'own', ['view', 'create', 'upload'])
  set(matrix, 'file_library', 'own', ['view', 'upload'])
  set(matrix, 'follow_ups', 'own', ['view'])
  set(matrix, 'calendar', 'own', ['view'])
  return matrix
}

export function normalizePermissionMatrix(value: unknown, fallbackRole: string | null | undefined) {
  const fallback = buildDefaultPermissionMatrix(fallbackRole)
  if (!Array.isArray(value)) return fallback
  const byModule = new Map<string, unknown>(value.map((row) => [String((row as Record<string, unknown>)?.module), row]))
  return fallback.map((row) => {
    const incoming = byModule.get(row.module) as Record<string, unknown> | undefined
    const actions = { ...row.actions }
    const incomingActions = incoming?.actions && typeof incoming.actions === 'object'
      ? incoming.actions as Record<string, unknown>
      : {}
    for (const action of PERMISSION_ACTIONS) {
      actions[action] = incomingActions[action] === true
    }
    const scope = isPermissionScope(incoming?.scope) ? incoming.scope : row.scope
    return { module: row.module, scope, actions }
  })
}

export function rolePermissionSummary(roleCode: string | null | undefined) {
  const label = getRoleLabel(roleCode)
  if (normalizeRoleCode(roleCode) === 'ADMIN') return `${label}: full quyền toàn công ty.`
  return `${label}: quyền mặc định theo role, custom override cần migration user_permission_overrides.`
}

function emptyMatrix(): PermissionMatrixRow[] {
  return PERMISSION_MODULES.map((module) => ({
    module: module.key,
    scope: 'none',
    actions: emptyActions(),
  }))
}

function emptyActions() {
  return PERMISSION_ACTIONS.reduce((acc, action) => {
    acc[action] = false
    return acc
  }, {} as Record<PermissionAction, boolean>)
}

function set(
  matrix: PermissionMatrixRow[],
  module: PermissionModuleKey,
  scope: PermissionScope,
  actions: readonly PermissionAction[],
) {
  const row = matrix.find((item) => item.module === module)
  if (!row) return
  allow(row, scope, actions)
}

function allow(row: PermissionMatrixRow, scope: PermissionScope, actions: readonly PermissionAction[]) {
  row.scope = actions.length > 0 ? scope : 'none'
  row.actions = emptyActions()
  for (const action of actions) row.actions[action] = true
  return row
}

function normalizeRoleCode(roleCode: string | null | undefined) {
  return roleCode?.trim().toUpperCase() ?? 'EMPLOYEE'
}

function isPermissionScope(value: unknown): value is PermissionScope {
  return typeof value === 'string' && (PERMISSION_SCOPES as readonly string[]).includes(value)
}
