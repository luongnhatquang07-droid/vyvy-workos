export const CANONICAL_ROLES = ['ADMIN', 'CEO', 'COO', 'DEPARTMENT_HEAD', 'EMPLOYEE'] as const

export const LEGACY_ROLES = ['PROJECT_COORDINATOR', 'CEO_READONLY'] as const

export type CanonicalRole = (typeof CANONICAL_ROLES)[number]
export type LegacyRole = (typeof LEGACY_ROLES)[number]
export type WorkspaceRole = CanonicalRole | LegacyRole

export const ROLE_LABELS: Record<WorkspaceRole, string> = {
  ADMIN: 'Quan tri he thong',
  CEO: 'CEO',
  COO: 'COO',
  DEPARTMENT_HEAD: 'Truong bo phan',
  EMPLOYEE: 'Nhan vien',
  PROJECT_COORDINATOR: 'Dieu phoi du an',
  CEO_READONLY: 'CEO chi xem',
}

export const ROLE_LABELS_VI: Record<WorkspaceRole, string> = {
  ADMIN: 'Quản trị hệ thống',
  CEO: 'CEO',
  COO: 'COO',
  DEPARTMENT_HEAD: 'Trưởng bộ phận',
  EMPLOYEE: 'Nhân viên',
  PROJECT_COORDINATOR: 'Điều phối dự án',
  CEO_READONLY: 'CEO chỉ xem',
}

export const LEGACY_ROLE_MAPPING: Record<LegacyRole, CanonicalRole> = {
  PROJECT_COORDINATOR: 'COO',
  CEO_READONLY: 'CEO',
}

export const ROLE_HIERARCHY: Record<CanonicalRole, number> = {
  ADMIN: 100,
  CEO: 80,
  COO: 70,
  DEPARTMENT_HEAD: 50,
  EMPLOYEE: 10,
}

export const READ_ONLY_LEGACY_ROLES: ReadonlySet<WorkspaceRole> = new Set<WorkspaceRole>(['CEO_READONLY'])

export function isWorkspaceRole(value: string | null | undefined): value is WorkspaceRole {
  if (!value) return false
  return [...CANONICAL_ROLES, ...LEGACY_ROLES].includes(value.trim().toUpperCase() as WorkspaceRole)
}

export function normalizeRole(value: string | null | undefined): CanonicalRole | null {
  if (!value) return null

  const role = value.trim().toUpperCase()
  if ((CANONICAL_ROLES as readonly string[]).includes(role)) return role as CanonicalRole
  if ((LEGACY_ROLES as readonly string[]).includes(role)) return LEGACY_ROLE_MAPPING[role as LegacyRole]

  return null
}

export function getRoleLabel(value: string | null | undefined, options?: { ascii?: boolean }) {
  const raw = value?.trim().toUpperCase()
  if (!raw || !isWorkspaceRole(raw)) return options?.ascii ? 'Chua gan vai tro' : 'Chưa gắn vai trò'

  return options?.ascii ? ROLE_LABELS[raw] : ROLE_LABELS_VI[raw]
}

export function roleAtLeast(role: string | null | undefined, minimum: CanonicalRole) {
  const normalized = normalizeRole(role)
  if (!normalized) return false
  return ROLE_HIERARCHY[normalized] >= ROLE_HIERARCHY[minimum]
}

export function isLegacyReadOnlyRole(role: string | null | undefined) {
  if (!role) return false
  return READ_ONLY_LEGACY_ROLES.has(role.trim().toUpperCase() as WorkspaceRole)
}

