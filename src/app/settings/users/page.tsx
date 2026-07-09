'use client'

import React from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { PageHead } from '@/components/ui/PageHead'
import {
  ACTION_LABELS,
  PERMISSION_ACTIONS,
  PERMISSION_MODULES,
  PERMISSION_SCOPES,
  SCOPE_LABELS,
  buildDefaultPermissionMatrix,
  type PermissionAction,
  type PermissionMatrixRow,
} from '@/lib/admin/permissionMatrix'

type AccountStatus = 'active' | 'inactive' | 'suspended'

interface ManagedUser {
  profileId: string
  personId: string | null
  authUserId: string | null
  membershipId: string | null
  displayName: string
  fullName: string
  email: string | null
  username: string | null
  roleCode: string | null
  roleLabel: string
  departmentId: string | null
  departmentName: string | null
  managerId: string | null
  managerName: string | null
  defaultApproverId: string | null
  defaultApproverName: string | null
  status: AccountStatus | string
  statusLabel: string
  authLinked: boolean
  isActiveMembership: boolean
  mappingStatus?: UserMappingStatus
  actionCapabilities?: {
    canEdit?: boolean
    canResetPassword?: boolean
    canSuspend?: boolean
    canDelete?: boolean
  }
  createdAt: string | null
  updatedAt: string | null
}

type UserMappingStatus =
  | 'complete'
  | 'auth_only'
  | 'profile_only'
  | 'duplicate'
  | 'missing_membership'
  | 'missing_role'
  | 'missing_department'

interface LookupData {
  roles: Array<{ id: string; code: string; label: string; name: string }>
  departments: Array<{ id: string; name: string; code: string | null; status: string | null }>
  managers: Array<{ id: string; name: string; email: string | null; departmentId: string | null; departmentName?: string | null; roleLabel?: string | null }>
  people?: Array<{
    id: string
    name: string
    email: string | null
    profileId: string | null
    departmentId: string | null
    departmentName?: string | null
    managerId?: string | null
    defaultApproverId?: string | null
    roleLabel?: string | null
    hasAccount?: boolean
  }>
}

interface UserActionCapabilities {
  canCreateUser: boolean
  canEditMappedUser: boolean
  canResetMappedUser: boolean
  canSuspendMappedUser: boolean
  canDeleteMappedUser: boolean
}

interface UsersPayload {
  users: ManagedUser[]
  lookups: LookupData
  source?: 'auth_admin_profiles' | 'auth_admin_profiles_partial' | 'auth_admin_only' | 'profiles_only'
  total?: number
  authAdminAvailable?: boolean
  authAdminError?: string | null
  writeActionsAvailable?: boolean
  capabilities?: Partial<UserActionCapabilities>
  warnings?: string[]
  profileMergeWarning?: string | null
  diagnostics?: {
    authUsersCount?: number
    profilesCount?: number
    peopleCount?: number
    membershipsCount?: number
    rolesCount?: number
    departmentsCount?: number
    completeRows?: number
    partialRows?: number
  }
  meta?: {
    supabaseRef?: string | null
    appEnv?: string | null
    currentRole?: string | null
  }
}

interface AccountForm {
  existingPersonId: string
  fullName: string
  username: string
  password: string
  roleCode: string
  departmentId: string
  managerId: string
  defaultApproverId: string
  status: AccountStatus
}

interface PermissionState {
  profileId?: string
  roleCode: string | null
  roleLabel: string
  schemaReady: boolean
  mode: 'role_default' | 'custom'
  roleDefault: PermissionMatrixRow[]
  permissions: PermissionMatrixRow[]
  overrideCount: number
  message?: string | null
}

const emptyForm: AccountForm = {
  existingPersonId: '',
  fullName: '',
  username: '',
  password: '',
  roleCode: 'EMPLOYEE',
  departmentId: '',
  managerId: '',
  defaultApproverId: '',
  status: 'active',
}

const USERS_PAGE_SIZE = 20

const statusOptions = [
  { value: 'active', label: 'Đang hoạt động' },
  { value: 'inactive', label: 'Tạm khóa' },
  { value: 'suspended', label: 'Đình chỉ' },
]

export default function UserManagementPage() {
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState('')
  const [forbidden, setForbidden] = React.useState(false)
  const [notice, setNotice] = React.useState('')
  const [authAdminError, setAuthAdminError] = React.useState('')
  const [warnings, setWarnings] = React.useState<string[]>([])
  const [source, setSource] = React.useState<UsersPayload['source']>('profiles_only')
  const [capabilities, setCapabilities] = React.useState<UserActionCapabilities>({
    canCreateUser: false,
    canEditMappedUser: false,
    canResetMappedUser: false,
    canSuspendMappedUser: false,
    canDeleteMappedUser: false,
  })
  const [diagnostics, setDiagnostics] = React.useState<UsersPayload['diagnostics']>(undefined)
  const [users, setUsers] = React.useState<ManagedUser[]>([])
  const [lookups, setLookups] = React.useState<LookupData>({ roles: [], departments: [], managers: [], people: [] })
  const [meta, setMeta] = React.useState<UsersPayload['meta']>(undefined)
  const [query, setQuery] = React.useState('')
  const [roleFilter, setRoleFilter] = React.useState('')
  const [departmentFilter, setDepartmentFilter] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState('')
  const [mode, setMode] = React.useState<'create' | 'edit' | 'reset' | null>(null)
  const [createFormNonce, setCreateFormNonce] = React.useState(0)
  const [panelTab, setPanelTab] = React.useState<'account' | 'permissions'>('account')
  const [selected, setSelected] = React.useState<ManagedUser | null>(null)
  const [form, setForm] = React.useState<AccountForm>(emptyForm)
  const [useCustomPermissions, setUseCustomPermissions] = React.useState(false)
  const [permissionModalOpen, setPermissionModalOpen] = React.useState(false)
  const [permissionState, setPermissionState] = React.useState<PermissionState | null>(null)
  const [permissionDraft, setPermissionDraft] = React.useState<PermissionMatrixRow[]>(buildDefaultPermissionMatrix(emptyForm.roleCode))
  const [resetPassword, setResetPassword] = React.useState('')
  const [statusDialog, setStatusDialog] = React.useState<{ user: ManagedUser; nextStatus: AccountStatus } | null>(null)
  const [deleteDialog, setDeleteDialog] = React.useState<{ user: ManagedUser } | null>(null)
  const [actionMenuUserId, setActionMenuUserId] = React.useState<string | null>(null)
  const [pageIndex, setPageIndex] = React.useState(0)
  const [closeConfirmOpen, setCloseConfirmOpen] = React.useState(false)

  const loadUsers = React.useCallback(async () => {
    setLoading(true)
    setError('')
    setForbidden(false)
    try {
      const response = await fetch('/api/admin/users', { cache: 'no-store' })
      const payload = await response.json().catch(() => null)
      if (response.status === 403) setForbidden(true)
      if (!response.ok) throw new Error(payload?.error ?? 'Không tải được danh sách tài khoản.')
      setUsers(payload.users ?? [])
      setLookups(payload.lookups ?? { roles: [], departments: [], managers: [], people: [] })
      setMeta(payload.meta)
      setAuthAdminError(payload.authAdminError ?? '')
      setWarnings(Array.isArray(payload.warnings) ? payload.warnings : [])
      setSource(payload.source ?? 'profiles_only')
      setCapabilities({
        canCreateUser: payload.capabilities?.canCreateUser === true,
        canEditMappedUser: payload.capabilities?.canEditMappedUser === true,
        canResetMappedUser: payload.capabilities?.canResetMappedUser === true,
        canSuspendMappedUser: payload.capabilities?.canSuspendMappedUser === true,
        canDeleteMappedUser: payload.capabilities?.canDeleteMappedUser === true,
      })
      setDiagnostics(payload.diagnostics)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được danh sách tài khoản.')
      setWarnings([])
      setSource('profiles_only')
      setCapabilities({
        canCreateUser: false,
        canEditMappedUser: false,
        canResetMappedUser: false,
        canSuspendMappedUser: false,
        canDeleteMappedUser: false,
      })
      setDiagnostics(undefined)
      setAuthAdminError('Không tải được danh sách tài khoản. Không thể thao tác tài khoản cho đến khi hệ thống tải danh sách thành công.')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadUsers()
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [loadUsers])

  function openCreate() {
    setSelected(null)
    setResetPassword('')
    setActionMenuUserId(null)
    const roleCode = lookups.roles.find((role) => role.code === 'EMPLOYEE')?.code ?? 'EMPLOYEE'
    setPanelTab('account')
    setPermissionModalOpen(false)
    setUseCustomPermissions(false)
    setPermissionState(null)
    setPermissionDraft(buildDefaultPermissionMatrix(roleCode))
    setForm({ ...emptyForm, roleCode })
    setCreateFormNonce((value) => value + 1)
    setMode('create')
  }

  function openEdit(user: ManagedUser) {
    setSelected(user)
    setResetPassword('')
    setActionMenuUserId(null)
    setPanelTab('account')
    setPermissionModalOpen(false)
    setUseCustomPermissions(false)
    setPermissionState(null)
    setPermissionDraft(buildDefaultPermissionMatrix(user.roleCode ?? 'EMPLOYEE'))
    setForm({
      existingPersonId: '',
      fullName: user.fullName,
      username: user.username ?? user.email?.split('@')[0] ?? '',
      password: '',
      roleCode: user.roleCode ?? 'EMPLOYEE',
      departmentId: user.departmentId ?? '',
      managerId: user.managerId ?? '',
      defaultApproverId: user.defaultApproverId ?? '',
      status: normalizeStatus(user.status),
    })
    setMode('edit')
    void loadUserPermissions(user)
  }

  function openReset(user: ManagedUser) {
    setSelected(user)
    setResetPassword('')
    setPermissionModalOpen(false)
    setActionMenuUserId(null)
    setMode('reset')
  }

  function openStatusDialog(user: ManagedUser, nextStatus: AccountStatus) {
    setActionMenuUserId(null)
    setStatusDialog({ user, nextStatus })
  }

  function openDeleteDialog(user: ManagedUser) {
    setActionMenuUserId(null)
    setDeleteDialog({ user })
  }

  const closePanel = React.useCallback(() => {
    setCloseConfirmOpen(false)
    setPermissionModalOpen(false)
    setMode(null)
    setSelected(null)
    setStatusDialog(null)
    setDeleteDialog(null)
    setActionMenuUserId(null)
  }, [])

  const hasUnsavedPanelChanges = React.useCallback(() => {
    if (mode === 'reset') return resetPassword.trim().length > 0
    if (mode === 'create') {
      return Boolean(
        form.existingPersonId ||
        form.fullName.trim() ||
        form.username.trim() ||
        form.password.trim() ||
        form.departmentId ||
        form.managerId ||
        form.defaultApproverId ||
        form.status !== 'active' ||
        form.roleCode !== 'EMPLOYEE' ||
        useCustomPermissions,
      )
    }
    if (mode === 'edit' && selected) {
      return (
        form.fullName !== selected.fullName ||
        form.roleCode !== (selected.roleCode ?? 'EMPLOYEE') ||
        form.departmentId !== (selected.departmentId ?? '') ||
        form.managerId !== (selected.managerId ?? '') ||
        form.defaultApproverId !== (selected.defaultApproverId ?? '') ||
        form.status !== normalizeStatus(selected.status) ||
        useCustomPermissions !== (permissionState?.mode === 'custom')
      )
    }
    return false
  }, [form, mode, permissionState?.mode, resetPassword, selected, useCustomPermissions])

  const requestClosePanel = React.useCallback(() => {
    if (saving) return
    if (hasUnsavedPanelChanges()) {
      setCloseConfirmOpen(true)
      return
    }
    closePanel()
  }, [closePanel, hasUnsavedPanelChanges, saving])

  React.useEffect(() => {
    if (!mode && !statusDialog && !deleteDialog && !permissionModalOpen && !closeConfirmOpen) return

    const handler = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      if (closeConfirmOpen) {
        setCloseConfirmOpen(false)
      } else if (permissionModalOpen) {
        setPermissionModalOpen(false)
      } else if (statusDialog) {
        setStatusDialog(null)
      } else if (deleteDialog) {
        setDeleteDialog(null)
      } else {
        requestClosePanel()
      }
    }

    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [
    closeConfirmOpen,
    deleteDialog,
    form,
    mode,
    permissionModalOpen,
    permissionState?.mode,
    resetPassword,
    requestClosePanel,
    saving,
    selected,
    statusDialog,
    useCustomPermissions,
  ])

  function resetPermissionDraftToRoleDefault() {
    setUseCustomPermissions(false)
    setPermissionDraft(permissionState?.roleDefault ?? buildDefaultPermissionMatrix(form.roleCode))
  }

  async function loadUserPermissions(user: ManagedUser) {
    try {
      const response = await fetch(`/api/admin/users/${user.profileId}/permissions`, { cache: 'no-store' })
      const payload = await response.json().catch(() => null) as PermissionState | null
      if (!response.ok || !payload) throw new Error(payload?.message ?? 'Khong tai duoc bang phan quyen.')
      setPermissionState(payload)
      setUseCustomPermissions(payload.mode === 'custom')
      setPermissionDraft(payload.permissions ?? buildDefaultPermissionMatrix(user.roleCode ?? form.roleCode))
    } catch (err) {
      const fallback = buildDefaultPermissionMatrix(user.roleCode ?? form.roleCode)
      setPermissionState({
        profileId: user.profileId,
        roleCode: user.roleCode,
        roleLabel: user.roleLabel,
        schemaReady: false,
        mode: 'role_default',
        roleDefault: fallback,
        permissions: fallback,
        overrideCount: 0,
        message: err instanceof Error ? err.message : 'Khong tai duoc bang phan quyen.',
      })
      setUseCustomPermissions(false)
      setPermissionDraft(fallback)
    }
  }

  async function handleSavePermissions() {
    if (!selected) return
    await submitJson(
      `/api/admin/users/${selected.profileId}/permissions`,
      'PATCH',
      { permissions: permissionDraft },
      'Da luu phan quyen tuy chinh.',
      {
        keepPanelOpen: true,
        actionAllowed: canEditUser(selected) && permissionState?.schemaReady === true && selected.roleCode !== 'ADMIN',
      },
    )
    await loadUserPermissions(selected)
  }

  async function handleResetPermissions() {
    if (!selected) return
    await submitJson(
      `/api/admin/users/${selected.profileId}/permissions`,
      'DELETE',
      {},
      'Da reset ve quyen mac dinh theo role.',
      {
        keepPanelOpen: true,
        actionAllowed: canEditUser(selected) && permissionState?.schemaReady === true,
      },
    )
    await loadUserPermissions(selected)
  }

  function setPermissionAction(module: string, action: PermissionAction, checked: boolean) {
    setPermissionDraft((rows) => rows.map((row) => {
      if (row.module !== module) return row
      return { ...row, actions: { ...row.actions, [action]: checked } }
    }))
  }

  function setPermissionScope(module: string, scope: PermissionMatrixRow['scope']) {
    setPermissionDraft((rows) => rows.map((row) => row.module === module ? { ...row, scope } : row))
  }

  function handleRoleChange(value: string) {
    setForm((prev) => ({ ...prev, roleCode: value }))
    if (!useCustomPermissions) setPermissionDraft(buildDefaultPermissionMatrix(value))
  }

  function handleExistingPersonChange(value: string) {
    const person = lookups.people?.find((item) => item.id === value) ?? null
    setForm((prev) => ({
      ...prev,
      existingPersonId: value,
      fullName: person?.name ?? prev.fullName,
      username: person && shouldSuggestUsername(prev.username) ? suggestUsernameFromPersonName(person.name) : prev.username,
      departmentId: person?.departmentId ?? prev.departmentId,
      managerId: person?.managerId ?? prev.managerId,
      defaultApproverId: person?.defaultApproverId ?? prev.defaultApproverId,
    }))
  }

  function canEditUser(user: ManagedUser) {
    return capabilities.canEditMappedUser && user.actionCapabilities?.canEdit === true
  }

  function canResetUser(user: ManagedUser) {
    return capabilities.canResetMappedUser && user.actionCapabilities?.canResetPassword === true
  }

  function canSuspendUser(user: ManagedUser) {
    return capabilities.canSuspendMappedUser && user.actionCapabilities?.canSuspend === true
  }

  function canDeleteUser(user: ManagedUser) {
    return capabilities.canDeleteMappedUser && user.actionCapabilities?.canDelete === true && user.roleCode !== 'ADMIN'
  }

  function inferActionAllowed(url: string, method: 'POST' | 'PATCH' | 'DELETE') {
    if (url === '/api/admin/users' && method === 'POST') return capabilities.canCreateUser

    const targetUser = users.find((user) => url.includes(`/api/admin/users/${user.profileId}`))
    if (!targetUser) return false
    if (url.includes('/reset-password')) return canResetUser(targetUser)
    if (url.includes('/status')) return canSuspendUser(targetUser)
    if (url.includes('/delete')) return canDeleteUser(targetUser)
    return canEditUser(targetUser)
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault()
    await submitJson(
      '/api/admin/users',
      'POST',
      useCustomPermissions ? { ...form, useCustomPermissions: true, permissions: permissionDraft } : form,
      'Đã tạo tài khoản.',
    )
  }

  async function handleEdit(event: React.FormEvent) {
    event.preventDefault()
    if (!selected) return
    await submitJson(`/api/admin/users/${selected.profileId}`, 'PATCH', form, 'Đã cập nhật tài khoản.')
  }

  async function handleReset(event: React.FormEvent) {
    event.preventDefault()
    if (!selected) return
    await submitJson(
      `/api/admin/users/${selected.profileId}/reset-password`,
      'POST',
      { password: resetPassword },
      'Đã reset mật khẩu tạm. Mật khẩu không được lưu trong hệ thống.',
      { keepPanelOpen: true, clearPassword: true },
    )
  }

  async function handleStatus(user: ManagedUser, nextStatus: AccountStatus) {
    await submitJson(
      `/api/admin/users/${user.profileId}/status`,
      'PATCH',
      { status: nextStatus },
      nextStatus === 'active' ? 'Đã mở tài khoản.' : 'Đã khóa tài khoản.',
      { keepPanelOpen: true, actionAllowed: canSuspendUser(user) },
    )
    setStatusDialog(null)
  }

  async function handleDelete(user: ManagedUser) {
    await submitJson(
      `/api/admin/users/${user.profileId}/delete`,
      'DELETE',
      {},
      'Đã xóa mềm tài khoản khỏi danh sách. Auth user đã bị khóa và không bị hard-delete.',
      { keepPanelOpen: true, actionAllowed: canDeleteUser(user) },
    )
    setDeleteDialog(null)
  }

  async function submitJson(
    url: string,
    method: 'POST' | 'PATCH' | 'DELETE',
    body: unknown,
    successMessage: string,
    options?: { keepPanelOpen?: boolean; clearPassword?: boolean; actionAllowed?: boolean },
  ) {
    const actionAllowed = options?.actionAllowed ?? inferActionAllowed(url, method)
    if (!actionAllowed || error) {
      setNotice('')
      setError('Không thể thao tác tài khoản cho đến khi hệ thống tải danh sách thành công.')
      return
    }
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error ?? 'Không lưu được thay đổi.')
      setUsers(payload.users ?? users)
      setNotice(successMessage)
      if (options?.clearPassword) setResetPassword('')
      if (!options?.keepPanelOpen) {
        setMode(null)
        setSelected(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không lưu được thay đổi.')
    } finally {
      setSaving(false)
    }
  }

  const filteredUsers = React.useMemo(() => {
    const needle = query.trim().toLowerCase()
    return users.filter((user) => {
      const matchesQuery = !needle || [
        user.fullName,
        user.username,
        user.email,
        user.departmentName,
        user.roleLabel,
      ].some((value) => value?.toLowerCase().includes(needle))
      const matchesRole = !roleFilter || user.roleCode === roleFilter
      const matchesDepartment = !departmentFilter || user.departmentId === departmentFilter
      const matchesStatus = !statusFilter || normalizeStatus(user.status) === statusFilter
      return matchesQuery && matchesRole && matchesDepartment && matchesStatus
    })
  }, [departmentFilter, query, roleFilter, statusFilter, users])

  const pageCount = Math.max(1, Math.ceil(filteredUsers.length / USERS_PAGE_SIZE))
  const safePageIndex = Math.min(pageIndex, pageCount - 1)
  const paginatedUsers = filteredUsers.slice(
    safePageIndex * USERS_PAGE_SIZE,
    safePageIndex * USERS_PAGE_SIZE + USERS_PAGE_SIZE,
  )
  const rangeStart = filteredUsers.length ? safePageIndex * USERS_PAGE_SIZE + 1 : 0
  const rangeEnd = Math.min(filteredUsers.length, (safePageIndex + 1) * USERS_PAGE_SIZE)

  const warningMessages = React.useMemo(() => {
    const partialActionMessage = source === 'auth_admin_profiles_partial'
      ? capabilities.canCreateUser
        ? 'Auth Admin da san sang de tao tai khoan moi. Mot so ho so cu chua lien ket day du nen thao tac tren tung dong do dang bi khoa.'
        : 'Danh sach tai khoan chi tai duoc mot phan; thao tac ghi dang bi khoa.'
      : ''
    return Array.from(new Set([partialActionMessage, authAdminError, ...warnings].filter(Boolean)))
  }, [authAdminError, capabilities.canCreateUser, source, warnings])
  const formRoleOptions = lookups.roles.map((role) => ({ value: role.code, label: role.label }))
  const departmentOptions = [{ value: '', label: 'Chưa gán phòng ban' }, ...lookups.departments.map((department) => ({ value: department.id, label: repairVietnameseText(department.name) }))]
  const existingPersonOptions = [
    { value: '', label: 'Chọn nhân sự có sẵn hoặc tạo mới' },
    ...(lookups.people ?? [])
      .filter((person) => !person.hasAccount)
      .map((person) => ({ value: person.id, label: formatPersonOption(person) })),
  ]
  const managerOptions = [
    { value: '', label: 'Chưa gán quản lý' },
    ...lookups.managers
      .filter((manager) => manager.id !== selected?.personId)
      .map((manager) => ({ value: manager.id, label: manager.name })),
  ]
  const defaultApproverOptions = [
    { value: '', label: 'Chưa gắn người duyệt' },
    ...lookups.managers
      .filter((person) => person.id !== selected?.personId)
      .map((person) => ({ value: person.id, label: formatPersonOption(person) })),
  ]
  const createActionDisabled = loading || saving || Boolean(error) || !capabilities.canCreateUser

  return (
    <div style={pageStyle}>
      <PageHead
        icon="ti-user-cog"
        title="Quản lý tài khoản"
        desc="Tạo tài khoản, phân quyền, quản lý trạng thái và liên kết nhân sự trong workspace."
        actions={!forbidden ? (
          <Button
            variant="primary"
            onClick={openCreate}
            disabled={createActionDisabled}
            title={createActionDisabled ? createDisabledReason(loading, error, capabilities.canCreateUser) : undefined}
          >
            <i className="ti ti-user-plus" /> Tạo tài khoản
          </Button>
        ) : null}
      />

      {!forbidden ? (
        <details style={debugDetailsStyle}>
          <summary style={debugSummaryStyle}>Thông tin hệ thống</summary>
          <div style={metaRow}>
            <span>Env: <strong>{meta?.appEnv ?? 'Đang tải'}</strong></span>
            <span>Ref: <strong>{meta?.supabaseRef ?? 'Đang tải'}</strong></span>
            <span>Quyền hiện tại: <strong>{meta?.currentRole ?? 'Đang tải'}</strong></span>
            <span>Source: <strong>{source}</strong></span>
            {diagnostics ? (
              <span>
                Mapping: <strong>{diagnostics.completeRows ?? 0}/{(diagnostics.completeRows ?? 0) + (diagnostics.partialRows ?? 0)}</strong>
              </span>
            ) : null}
          </div>
        </details>
      ) : null}

      {error && !forbidden ? <div style={alertStyle('error')}>{error}</div> : null}
      {!forbidden && warningMessages.length ? (
        <div style={alertStyle('warning')}>
          {warningMessages.map((message) => <div key={message}>{message}</div>)}
        </div>
      ) : null}
      {notice ? <div style={alertStyle('success')}>{notice}</div> : null}

      {forbidden ? (
        <section style={forbiddenStyle}>
          <i className="ti ti-lock" style={{ fontSize: 28, color: 'var(--color-text-muted)' }} />
          <div>
            <div style={{ fontWeight: 750, color: 'var(--color-text)' }}>Bạn không có quyền truy cập trang này.</div>
            <div style={{ marginTop: 5, fontSize: 13, color: 'var(--color-text-muted)' }}>
              Chỉ tài khoản ADMIN trên staging hoặc production đã bật env phê duyệt mới được quản lý người dùng trong Phase 2.
            </div>
          </div>
        </section>
      ) : (
        <>
      <section style={toolbarStyle}>
        <Input
          aria-label="Tìm tài khoản"
          placeholder="Tìm theo tên, tên đăng nhập, role, phòng ban..."
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setPageIndex(0)
          }}
          style={{ minWidth: 240 }}
        />
        <SelectField value={roleFilter} onChange={(value) => {
          setRoleFilter(value)
          setPageIndex(0)
        }} options={[{ value: '', label: 'Tất cả role' }, ...formRoleOptions]} />
        <SelectField value={departmentFilter} onChange={(value) => {
          setDepartmentFilter(value)
          setPageIndex(0)
        }} options={[{ value: '', label: 'Tất cả phòng ban' }, ...lookups.departments.map((department) => ({ value: department.id, label: repairVietnameseText(department.name) }))]} />
        <SelectField value={statusFilter} onChange={(value) => {
          setStatusFilter(value)
          setPageIndex(0)
        }} options={[{ value: '', label: 'Tất cả trạng thái' }, ...statusOptions]} />
      </section>

      <section style={layoutStyle}>
        <div style={tableSummaryStyle}>
          <div>
            <strong>{filteredUsers.length}</strong> tài khoản đang hiển thị
            <span style={summaryMutedStyle}> · Tổng {users.length} tài khoản</span>
          </div>
          <div style={paginationStyle}>
            <span style={summaryMutedStyle}>
              Hiển thị {rangeStart}-{rangeEnd} / {filteredUsers.length}
            </span>
            <button
              type="button"
              style={pageButtonStyle}
              onClick={() => setPageIndex((value) => Math.max(0, value - 1))}
              disabled={safePageIndex === 0}
            >
              Trước
            </button>
            <button
              type="button"
              style={pageButtonStyle}
              onClick={() => setPageIndex((value) => Math.min(pageCount - 1, value + 1))}
              disabled={safePageIndex >= pageCount - 1}
            >
              Sau
            </button>
          </div>
        </div>
        <div style={tableWrapStyle}>
          {loading ? (
            <div style={emptyState}>Đang tải danh sách tài khoản...</div>
          ) : filteredUsers.length ? (
            <table style={tableStyle}>
              <thead>
                <tr>
                  <Th style={{ minWidth: 210 }}>Họ tên</Th>
                  <Th style={{ minWidth: 240 }}>Tên đăng nhập / Email nội bộ</Th>
                  <Th style={{ minWidth: 170 }}>Role</Th>
                  <Th style={{ minWidth: 170 }}>Phòng ban</Th>
                  <Th style={{ minWidth: 180 }}>Quản lý</Th>
                  <Th style={{ minWidth: 200 }}>Người duyệt</Th>
                  <Th style={{ minWidth: 230 }}>Tình trạng</Th>
                  <ActionTh>Thao tác</ActionTh>
                </tr>
              </thead>
              <tbody>
                {paginatedUsers.map((user) => {
                  const active = normalizeStatus(user.status) === 'active'
                  const editActionDisabled = loading || saving || Boolean(error) || !canEditUser(user)
                  const resetActionDisabled = loading || saving || Boolean(error) || !canResetUser(user)
                  const statusActionDisabled = loading || saving || Boolean(error) || !canSuspendUser(user)
                  const deleteActionDisabled = loading || saving || Boolean(error) || !canDeleteUser(user)
                  return (
                    <tr key={user.profileId}>
                      <Td>
                        <div style={primaryText}>{user.fullName}</div>
                        <div style={mutedText}>Cập nhật: {formatDate(user.updatedAt)}</div>
                      </Td>
                      <Td>
                        <div style={primaryText}>{user.username ?? 'Chưa có tên đăng nhập'}</div>
                        <div style={mutedText}>{user.email ?? 'Chưa có email nội bộ'}</div>
                      </Td>
                      <Td><BadgeLike tone="lime">{user.roleLabel}</BadgeLike></Td>
                      <Td>{displayValue(user.departmentName, 'Chưa gán')}</Td>
                      <Td>{displayValue(user.managerName, 'Chưa gán')}</Td>
                      <Td>{displayValue(user.defaultApproverName, 'Chưa gắn')}</Td>
                      <Td>
                        <div style={statusStackStyle}>
                          <BadgeLike tone={active ? 'success' : 'warning'}>{user.statusLabel}</BadgeLike>
                          <BadgeLike tone={user.authLinked ? 'success' : 'warning'}>{user.authLinked ? 'Auth linked' : 'Chưa liên kết Auth'}</BadgeLike>
                          <span style={mappingPillStyle(user.mappingStatus)}>{mappingStatusLabel(user.mappingStatus)}</span>
                        </div>
                      </Td>
                      <ActionTd>
                        <div style={actionMenuWrapStyle}>
                          <button
                            type="button"
                            style={actionMenuTriggerStyle}
                            onClick={() => setActionMenuUserId((value) => value === user.profileId ? null : user.profileId)}
                            aria-label={`Mở thao tác cho ${user.fullName}`}
                            aria-expanded={actionMenuUserId === user.profileId}
                          >
                            <i className="ti ti-dots-vertical" />
                          </button>
                          {actionMenuUserId === user.profileId ? (
                            <div style={actionMenuStyle}>
                              <button type="button" style={menuActionButtonStyle('normal', editActionDisabled)} onClick={() => openEdit(user)} disabled={editActionDisabled} title={editActionDisabled ? disabledActionReason(user) : undefined}>Sửa</button>
                              <button type="button" style={menuActionButtonStyle('normal', resetActionDisabled)} onClick={() => openReset(user)} disabled={resetActionDisabled} title={resetActionDisabled ? disabledActionReason(user) : undefined}>Reset mật khẩu</button>
                              <button
                                type="button"
                                style={menuActionButtonStyle(active ? 'danger' : 'normal', statusActionDisabled)}
                                onClick={() => openStatusDialog(user, active ? 'suspended' : 'active')}
                                disabled={statusActionDisabled}
                                title={statusActionDisabled ? disabledActionReason(user) : undefined}
                              >
                                {active ? 'Khóa' : 'Mở'}
                              </button>
                              <button
                                type="button"
                                style={menuActionButtonStyle('danger', deleteActionDisabled)}
                                onClick={() => openDeleteDialog(user)}
                                disabled={deleteActionDisabled}
                                title={deleteActionDisabled ? deleteDisabledActionReason(user) : undefined}
                              >
                                Xóa mềm
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </ActionTd>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ) : (
            <div style={emptyState}>Không có tài khoản phù hợp bộ lọc.</div>
          )}
        </div>

        {mode && typeof document !== 'undefined' ? createPortal((
          <aside style={panelStyle} role="presentation" onMouseDown={(event) => {
            if (event.target === event.currentTarget) requestClosePanel()
          }}>
            {mode === 'reset' && selected ? (
              <form onSubmit={handleReset} style={resetPanelFormStyle}>
                <PanelHead title="Reset mật khẩu tạm" onClose={requestClosePanel} />
                <div style={panelBodyStyle}>
                  <div style={confirmBoxStyle}>
                    <div style={primaryText}>Tài khoản: {selected.fullName}</div>
                    <div style={smallNote}>Chỉ reset user QA/staging khi đã được xác nhận. Mật khẩu tạm không được lưu trong app.</div>
                  </div>
                  <Input
                    label="Mật khẩu tạm mới"
                    type="password"
                    minLength={8}
                    value={resetPassword}
                    onChange={(event) => setResetPassword(event.target.value)}
                    required
                    helpText="Mật khẩu chỉ dùng để gửi cho người dùng, không được lưu trong app."
                  />
                </div>
                <div style={panelFooterStyle}>
                  <button type="button" style={modalSecondaryButtonStyle} onClick={requestClosePanel}>Hủy</button>
                  <Button type="submit" variant="primary" loading={saving}>Reset mật khẩu</Button>
                </div>
              </form>
            ) : (
              <form
                key={mode === 'create' ? `create-account-${createFormNonce}` : selected?.profileId ?? mode}
                onSubmit={mode === 'create' ? handleCreate : handleEdit}
                style={accountPanelFormStyle(mode)}
                autoComplete={mode === 'create' ? 'off' : undefined}
              >
                <PanelHead title={mode === 'create' ? 'Tạo tài khoản' : 'Sửa tài khoản'} onClose={requestClosePanel} />
                {mode === 'edit' ? (
                  <div style={tabRowStyle}>
                    <button type="button" style={tabButtonStyle(panelTab === 'account')} onClick={() => setPanelTab('account')}>Thông tin tài khoản</button>
                    <button type="button" style={tabButtonStyle(panelTab === 'permissions')} onClick={() => setPanelTab('permissions')}>Phân quyền</button>
                  </div>
                ) : null}
                <div style={mode === 'create' ? createPanelBodyStyle : panelBodyStyle}>
                  {(mode === 'create' || panelTab === 'account') ? (
                    <section style={accountFieldsStyle}>
                      {mode === 'create' ? (
                        <FormSelect
                          label="Nhân sự có sẵn"
                          value={form.existingPersonId}
                          onChange={handleExistingPersonChange}
                          options={existingPersonOptions}
                          helpText={form.existingPersonId ? 'Account sẽ được map vào nhân sự đã có, không tạo person mới.' : 'Bỏ trống chỉ khi đây thật sự là nhân sự mới.'}
                        />
                      ) : null}
                      <Input
                        label="Họ tên"
                        value={form.fullName}
                        onChange={(event) => setForm((prev) => ({ ...prev, fullName: event.target.value }))}
                        required
                      />
                      {mode === 'create' ? (
                        <>
                          <Input
                            label="Tên đăng nhập"
                            placeholder="nhung"
                            id="new-account-username"
                            name="new-account-username"
                            autoComplete="off"
                            value={form.username}
                            onChange={(event) => setForm((prev) => ({ ...prev, username: event.target.value }))}
                            required
                            helpText="Người dùng sẽ đăng nhập bằng tên này. Email nội bộ sẽ tự tạo dạng username@vyvystore.vn."
                          />
                          <Input
                            label="Mật khẩu tạm"
                            id="new-account-temporary-password"
                            name="new-account-temporary-password"
                            type="password"
                            autoComplete="new-password"
                            minLength={8}
                            value={form.password}
                            onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
                            required
                            helpText="Chỉ hiển thị trong form này, không lưu vào DB/code/docs."
                          />
                        </>
                      ) : (
                        <div style={readOnlyGridStyle}>
                          <div style={readOnlyInfoStyle}>
                            <span>Tên đăng nhập</span>
                            <strong>{form.username || 'Chưa có'}</strong>
                          </div>
                          <div style={readOnlyInfoStyle}>
                            <span>Email nội bộ hiện tại</span>
                            <strong>{selected?.email ?? 'Chưa có'}</strong>
                          </div>
                          <div style={readOnlyInfoStyle}>
                            <span>Auth linked</span>
                            <strong>{selected?.authLinked ? 'Có' : 'Không'}</strong>
                          </div>
                          <div style={readOnlyInfoStyle}>
                            <span>Mapping status</span>
                            <strong>{mappingStatusLabel(selected?.mappingStatus)}</strong>
                          </div>
                        </div>
                      )}
                      <FormSelect label="Role" value={form.roleCode} onChange={handleRoleChange} options={formRoleOptions} />
                      <FormSelect label="Phòng ban" value={form.departmentId} onChange={(value) => setForm((prev) => ({ ...prev, departmentId: value }))} options={departmentOptions} />
                      <FormSelect label="Người quản lý" value={form.managerId} onChange={(value) => setForm((prev) => ({ ...prev, managerId: value }))} options={managerOptions} />
                      <FormSelect label="Người duyệt mặc định" value={form.defaultApproverId} onChange={(value) => setForm((prev) => ({ ...prev, defaultApproverId: value }))} options={defaultApproverOptions} />
                      <FormSelect label="Trạng thái" value={form.status} onChange={(value) => setForm((prev) => ({ ...prev, status: normalizeStatus(value) }))} options={statusOptions} />
                    </section>
                  ) : null}
                  {(mode === 'create' || panelTab === 'permissions') ? (
                    <PermissionMatrixPanel
                      mode={mode}
                      roleCode={form.roleCode}
                      selected={selected}
                      state={permissionState}
                      rows={permissionDraft}
                      useCustom={useCustomPermissions}
                      saving={saving}
                      open={permissionModalOpen}
                      onOpen={() => setPermissionModalOpen(true)}
                      onClose={() => setPermissionModalOpen(false)}
                      onApply={() => setPermissionModalOpen(false)}
                      onToggleCustom={(checked) => {
                        setUseCustomPermissions(checked)
                        if (!checked) setPermissionDraft(permissionState?.roleDefault ?? buildDefaultPermissionMatrix(form.roleCode))
                      }}
                      onActionChange={setPermissionAction}
                      onScopeChange={setPermissionScope}
                      onSave={handleSavePermissions}
                      onReset={mode === 'create' ? resetPermissionDraftToRoleDefault : handleResetPermissions}
                    />
                  ) : null}
                </div>
                {(mode === 'create' || panelTab === 'account') ? (
                  <div style={panelFooterStyle}>
                    <button type="button" style={modalSecondaryButtonStyle} onClick={requestClosePanel}>Hủy</button>
                    <Button type="submit" variant="primary" loading={saving}>{mode === 'create' ? 'Tạo tài khoản' : 'Lưu thay đổi'}</Button>
                  </div>
                ) : null}
              </form>
            )}
          </aside>
        ), document.body) : null}
        {statusDialog && typeof document !== 'undefined' ? createPortal((
          <aside style={panelStyle} role="presentation" onMouseDown={(event) => {
            if (event.target === event.currentTarget) setStatusDialog(null)
          }}>
            <section style={confirmPanelStyle} role="dialog" aria-modal="true" aria-label="Xác nhận đổi trạng thái tài khoản">
              <PanelHead
                title={statusDialog.nextStatus === 'active' ? 'Mở lại tài khoản' : 'Khóa tài khoản'}
                onClose={() => setStatusDialog(null)}
              />
              <div style={panelBodyStyle}>
                <div style={confirmBoxStyle}>
                  <div style={primaryText}>{statusDialog.user.fullName}</div>
                  <div style={smallNote}>
                    {statusDialog.nextStatus === 'active'
                      ? 'Bạn có chắc muốn mở lại tài khoản này không?'
                      : 'Bạn có chắc muốn khóa tài khoản này không? User sẽ bị chặn đăng nhập hoặc chặn vào app.'}
                  </div>
                </div>
              </div>
              <div style={panelFooterStyle}>
                <button type="button" style={modalSecondaryButtonStyle} onClick={() => setStatusDialog(null)}>Hủy</button>
                <Button
                  type="button"
                  variant={statusDialog.nextStatus === 'active' ? 'primary' : 'danger'}
                  loading={saving}
                  onClick={() => void handleStatus(statusDialog.user, statusDialog.nextStatus)}
                >
                  {statusDialog.nextStatus === 'active' ? 'Mở lại tài khoản' : 'Khóa tài khoản'}
                </Button>
              </div>
            </section>
          </aside>
        ), document.body) : null}
        {deleteDialog && typeof document !== 'undefined' ? createPortal((
          <aside style={panelStyle} role="presentation" onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDeleteDialog(null)
          }}>
            <section style={confirmPanelStyle} role="dialog" aria-modal="true" aria-label="Xác nhận xóa tài khoản">
              <PanelHead
                title="Xóa tài khoản"
                onClose={() => setDeleteDialog(null)}
              />
              <div style={panelBodyStyle}>
                <div style={confirmBoxStyle}>
                  <div style={primaryText}>{deleteDialog.user.fullName}</div>
                  <div style={smallNote}>
                    Thao tác này chỉ xóa mềm khỏi danh sách: khóa đăng nhập, tắt membership và ẩn hồ sơ nhân sự. Auth user vẫn được giữ để audit, không hard-delete.
                  </div>
                </div>
              </div>
              <div style={panelFooterStyle}>
                <button type="button" style={modalSecondaryButtonStyle} onClick={() => setDeleteDialog(null)}>Hủy</button>
                <Button
                  type="button"
                  variant="danger"
                  loading={saving}
                  onClick={() => void handleDelete(deleteDialog.user)}
                >
                  Xóa tài khoản
                </Button>
              </div>
            </section>
          </aside>
        ), document.body) : null}
        {closeConfirmOpen && typeof document !== 'undefined' ? createPortal((
          <aside style={panelStyle} role="presentation" onMouseDown={(event) => {
            if (event.target === event.currentTarget) setCloseConfirmOpen(false)
          }}>
            <section style={confirmPanelStyle} role="dialog" aria-modal="true" aria-label="Xác nhận đóng form">
              <PanelHead title="Đóng form đang nhập?" onClose={() => setCloseConfirmOpen(false)} />
              <div style={panelBodyStyle}>
                <div style={confirmBoxStyle}>
                  <div style={primaryText}>Form đang có dữ liệu chưa lưu.</div>
                  <div style={smallNote}>Nếu đóng bây giờ, nội dung vừa nhập sẽ bị bỏ qua.</div>
                </div>
              </div>
              <div style={panelFooterStyle}>
                <button type="button" style={modalSecondaryButtonStyle} onClick={() => setCloseConfirmOpen(false)}>Tiếp tục nhập</button>
                <Button type="button" variant="danger" onClick={closePanel}>Đóng form</Button>
              </div>
            </section>
          </aside>
        ), document.body) : null}
      </section>
      </>
      )}
    </div>
  )
}

function PanelHead({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div style={panelHeadStyle}>
      <h2 style={{ margin: 0, fontSize: 17 }}>{title}</h2>
      <button type="button" onClick={onClose} style={iconButtonStyle} aria-label="Đóng">
        <i className="ti ti-x" />
      </button>
    </div>
  )
}

function PermissionMatrixPanel({
  mode,
  roleCode,
  selected,
  state,
  rows,
  useCustom,
  saving,
  open,
  onOpen,
  onClose,
  onApply,
  onToggleCustom,
  onActionChange,
  onScopeChange,
  onSave,
  onReset,
}: {
  mode: 'create' | 'edit' | 'reset'
  roleCode: string
  selected: ManagedUser | null
  state: PermissionState | null
  rows: PermissionMatrixRow[]
  useCustom: boolean
  saving: boolean
  open: boolean
  onOpen: () => void
  onClose: () => void
  onApply: () => void
  onToggleCustom: (checked: boolean) => void
  onActionChange: (module: string, action: PermissionAction, checked: boolean) => void
  onScopeChange: (module: string, scope: PermissionMatrixRow['scope']) => void
  onSave: () => void
  onReset: () => void
}) {
  const adminRole = roleCode === 'ADMIN'
  const schemaReady = mode === 'create' ? true : state?.schemaReady === true
  const editable = useCustom && !adminRole && schemaReady
  const roleLabel = selected?.roleLabel ?? roleCode
  const statusText = adminRole
    ? 'ADMIN luôn có full quyền.'
    : useCustom
      ? 'Đang tùy chỉnh quyền riêng cho tài khoản này.'
      : 'Đang dùng quyền mặc định theo role.'
  const schemaMessage = state?.schemaReady === false
    ? state.message ?? 'Cần migration user_permission_overrides trên staging trước khi lưu custom override.'
    : null
  const resetDisabled = saving || adminRole || (mode === 'edit' && !schemaReady)
  const primaryDisabled = mode === 'edit' ? !editable : false

  return (
    <>
      <section style={permissionPanelStyle}>
        <div style={permissionHeaderStyle}>
          <div>
            <div style={labelStyle}>Phân quyền tài khoản</div>
            <div style={{ marginTop: 4, fontWeight: 750 }}>Role: {roleLabel}</div>
          </div>
          <BadgeLike tone={useCustom ? 'warning' : 'lime'}>{useCustom ? 'Tùy chỉnh riêng' : 'Theo role'}</BadgeLike>
        </div>
        <div style={permissionSummaryGridStyle}>
          <div style={readOnlyInfoStyle}>
            <span>Chế độ</span>
            <strong>{useCustom ? 'Tùy chỉnh riêng' : 'Theo role'}</strong>
          </div>
          <div style={readOnlyInfoStyle}>
            <span>Số module</span>
            <strong>{rows.length} module</strong>
          </div>
        </div>
        <div style={smallNote}>{statusText}</div>
        {schemaMessage ? <div style={alertStyle('warning')}>{schemaMessage}</div> : null}
        <button type="button" style={openPermissionModalButtonStyle} onClick={onOpen}>
          Mở bảng phân quyền
        </button>
      </section>

      {open ? (
        <div style={permissionModalBackdropStyle} role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose()
        }}>
          <section style={permissionModalStyle} role="dialog" aria-modal="true" aria-label="Bảng phân quyền tài khoản">
            <div style={permissionModalHeaderStyle}>
              <div>
                <h2 style={permissionModalTitleStyle}>Bảng phân quyền tài khoản</h2>
                <div style={permissionModalMetaStyle}>
                  <span>Role: <strong>{roleLabel}</strong></span>
                  <span>Chế độ: <strong>{useCustom ? 'Tùy chỉnh riêng' : 'Theo role'}</strong></span>
                </div>
              </div>
              <button type="button" onClick={onClose} style={iconButtonStyle} aria-label="Đóng bảng phân quyền">
                <i className="ti ti-x" />
              </button>
            </div>

            <div style={permissionModalBodyStyle}>
              <div style={permissionModalControlStyle}>
                <label style={largeToggleRowStyle}>
                  <input
                    type="checkbox"
                    checked={useCustom}
                    disabled={adminRole}
                    onChange={(event) => onToggleCustom(event.target.checked)}
                    style={largeCheckboxStyle}
                  />
                  <span>Tùy chỉnh quyền riêng cho tài khoản này</span>
                </label>
                <div style={smallNote}>Nếu tắt tùy chỉnh, tài khoản sẽ dùng quyền mặc định theo role.</div>
              </div>
              {schemaMessage ? <div style={alertStyle('warning')}>{schemaMessage}</div> : null}

              <div style={largeMatrixWrapStyle}>
                <table style={largeMatrixTableStyle}>
                  <thead>
                    <tr>
                      <th style={{ ...matrixHeaderCellStyle, width: 310 }}>Module</th>
                      <th style={{ ...matrixHeaderCellStyle, width: 210 }}>Phạm vi</th>
                      {PERMISSION_ACTIONS.map((action) => (
                        <th key={action} style={matrixHeaderCellStyle}>{ACTION_LABELS[action]}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const moduleInfo = PERMISSION_MODULES.find((item) => item.key === row.module)
                      return (
                        <tr key={row.module}>
                          <td style={largeModuleCellStyle}>
                            <div style={primaryText}>{moduleInfo?.label ?? row.module}</div>
                            <div style={permissionDescriptionStyle}>{moduleInfo?.description}</div>
                          </td>
                          <td style={largeScopeCellStyle}>
                            <select
                              value={row.scope}
                              disabled={!editable}
                              onChange={(event) => onScopeChange(row.module, event.target.value as PermissionMatrixRow['scope'])}
                              style={largeScopeSelectStyle}
                            >
                              {PERMISSION_SCOPES.map((scope) => <option key={scope} value={scope}>{SCOPE_LABELS[scope]}</option>)}
                            </select>
                          </td>
                          {PERMISSION_ACTIONS.map((action) => (
                            <td key={action} style={largeCheckboxCellStyle}>
                              <input
                                type="checkbox"
                                checked={row.actions[action]}
                                disabled={!editable}
                                onChange={(event) => onActionChange(row.module, action, event.target.checked)}
                                aria-label={`${moduleInfo?.label ?? row.module} ${ACTION_LABELS[action]}`}
                                style={largeCheckboxStyle}
                              />
                            </td>
                          ))}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={permissionModalFooterStyle}>
              <button type="button" style={modalSecondaryButtonStyle} onClick={onClose}>Hủy</button>
              <button type="button" style={textButton} onClick={onReset} disabled={resetDisabled}>
                Reset về quyền mặc định
              </button>
              <Button
                type="button"
                variant="primary"
                loading={saving}
                disabled={primaryDisabled}
                onClick={mode === 'create' ? onApply : onSave}
              >
                {mode === 'create' ? 'Áp dụng' : 'Lưu phân quyền'}
              </Button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  )
}

function SelectField({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} style={selectStyle}>
      {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  )
}

function FormSelect({
  label,
  value,
  onChange,
  options,
  helpText,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
  helpText?: string
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={labelStyle}>{label}</span>
      <SelectField value={value} onChange={onChange} options={options} />
      {helpText ? <span style={smallNote}>{helpText}</span> : null}
    </label>
  )
}

function Th({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <th style={{ ...thStyle, ...style }}>{children}</th>
}

function Td({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <td style={{ ...tdStyle, ...style }}>{children}</td>
}

function ActionTh({ children }: { children: React.ReactNode }) {
  return <th style={{ ...thStyle, ...actionHeaderCellStyle }}>{children}</th>
}

function ActionTd({ children }: { children: React.ReactNode }) {
  return <td style={{ ...tdStyle, ...actionCellStyle }}>{children}</td>
}

function BadgeLike({ children, tone }: { children: React.ReactNode; tone: 'lime' | 'success' | 'warning' }) {
  return <span style={badgeStyle(tone)}>{children}</span>
}

function normalizeStatus(value: string | null | undefined): AccountStatus {
  if (value === 'inactive' || value === 'suspended') return value
  return 'active'
}

function mappingStatusLabel(value: UserMappingStatus | undefined) {
  if (value === 'complete') return 'Liên kết đầy đủ'
  if (value === 'auth_only') return 'Chỉ có Auth'
  if (value === 'duplicate') return 'Trùng hồ sơ'
  if (value === 'missing_membership') return 'Thiếu membership'
  if (value === 'missing_role') return 'Thiếu vai trò'
  if (value === 'missing_department') return 'Thiếu phòng ban'
  return 'Hồ sơ cũ / chưa liên kết'
}

function displayValue(value: string | null | undefined, fallback: string) {
  const repaired = repairVietnameseText(value?.trim() ?? '')
  return repaired || fallback
}

function repairVietnameseText(value: string) {
  const replacements: Record<string, string> = {
    'V?n h?nh (OPS)': 'Vận hành (OPS)',
    'V?n h?nh': 'Vận hành',
  }
  return replacements[value] ?? value
}

function mappingPillStyle(value: UserMappingStatus | undefined): React.CSSProperties {
  const complete = value === 'complete'
  return {
    ...compactPillStyle,
    color: complete ? '#3A7A4A' : '#A8621A',
    background: complete ? '#E8F5ED' : '#FEF0DC',
    borderColor: complete ? 'rgba(74,140,92,0.28)' : 'rgba(168,98,26,0.26)',
  }
}

function formatPersonOption(person: LookupData['managers'][number]) {
  return [person.name, person.roleLabel, repairVietnameseText(person.departmentName ?? '')].filter(Boolean).join(' — ')
}

function shouldSuggestUsername(value: string) {
  const normalized = value.trim().toLowerCase()
  return normalized === '' || normalized === 'justinbiemap'
}

function suggestUsernameFromPersonName(name: string) {
  const normalized = normalizeVietnameseName(name)
  const aliases: Record<string, string> = {
    'dao hoang vu': 'vu',
    'ma hong': 'mahong',
    'phuc': 'phuc',
    'vy': 'tuongvy',
    'nhung': 'nhung',
    'hiep': 'hiep',
  }
  if (aliases[normalized]) return aliases[normalized]
  const parts = normalized.split(' ').filter(Boolean)
  if (parts.length <= 2) return parts.join('')
  return parts[parts.length - 1] ?? normalized.replace(/\s+/g, '')
}

function normalizeVietnameseName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function disabledActionReason(user: ManagedUser) {
  if (user.mappingStatus !== 'complete') return 'Hồ sơ chưa liên kết đầy đủ nên không thể thao tác.'
  if (!user.authLinked) return 'Tài khoản chưa liên kết Auth nên không thể thao tác.'
  return 'Thao tác đang bị khóa để đảm bảo an toàn.'
}

function createDisabledReason(loading: boolean, error: string, canCreateUser: boolean) {
  if (loading) return 'Đang tải quyền tạo tài khoản.'
  if (error) return 'Cần tải lại danh sách tài khoản trước khi thao tác.'
  if (!canCreateUser) return 'Tài khoản hiện tại chưa có quyền tạo tài khoản.'
  return undefined
}

function deleteDisabledActionReason(user: ManagedUser) {
  if (user.roleCode === 'ADMIN') return 'Không xóa tài khoản ADMIN bằng thao tác nhanh.'
  return disabledActionReason(user)
}

function formatDate(value: string | null) {
  if (!value) return 'Chưa có'
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value))
}

const pageStyle: React.CSSProperties = {
  padding: 'var(--space-6)',
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
  width: '100%',
  maxWidth: 'none',
}

const metaRow: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 10,
  fontSize: 12,
  color: 'var(--color-text-muted)',
}

const debugDetailsStyle: React.CSSProperties = {
  border: '1px solid var(--color-border)',
  borderRadius: 9,
  background: 'var(--color-surface)',
  padding: '8px 12px',
  color: 'var(--color-text-muted)',
  fontSize: 12,
}

const debugSummaryStyle: React.CSSProperties = {
  cursor: 'pointer',
  fontWeight: 750,
  color: 'var(--color-text)',
}

const toolbarStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(260px, 1fr) repeat(3, minmax(150px, 180px))',
  gap: 10,
  alignItems: 'center',
}

const layoutStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  minWidth: 0,
}

const tableSummaryStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  flexWrap: 'wrap',
  marginBottom: 10,
  color: 'var(--color-text)',
  fontSize: 13,
}

const summaryMutedStyle: React.CSSProperties = {
  color: 'var(--color-text-muted)',
}

const paginationStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flexWrap: 'wrap',
}

const pageButtonStyle: React.CSSProperties = {
  minHeight: 32,
  borderRadius: 8,
  border: '1px solid var(--color-border)',
  padding: '0 10px',
  color: 'var(--color-text)',
  background: 'var(--color-surface)',
  fontSize: 12,
  fontWeight: 750,
}

const tableWrapStyle: React.CSSProperties = {
  border: '1px solid var(--color-border)',
  borderRadius: 10,
  background: 'var(--color-surface)',
  overflow: 'auto',
  maxHeight: 'calc(100vh - 260px)',
  width: '100%',
  boxShadow: '0 12px 28px rgba(17,20,24,0.04)',
}

const tableStyle: React.CSSProperties = {
  width: '100%',
  minWidth: 1180,
  borderCollapse: 'separate',
  borderSpacing: 0,
}

const thStyle: React.CSSProperties = {
  position: 'sticky',
  top: 0,
  zIndex: 2,
  textAlign: 'left',
  padding: '12px 14px',
  fontSize: 11,
  color: 'var(--color-text-muted)',
  textTransform: 'uppercase',
  letterSpacing: 0.6,
  borderBottom: '1px solid var(--color-border)',
  background: 'var(--color-surface-2)',
}

const tdStyle: React.CSSProperties = {
  padding: '12px 14px',
  fontSize: 13,
  color: 'var(--color-text)',
  borderBottom: '1px solid var(--color-border)',
  verticalAlign: 'top',
  background: 'var(--color-surface)',
}

const actionHeaderCellStyle: React.CSSProperties = {
  right: 0,
  zIndex: 4,
  width: 88,
  minWidth: 88,
  boxShadow: '-10px 0 18px rgba(17,20,24,0.06)',
}

const actionCellStyle: React.CSSProperties = {
  position: 'sticky',
  right: 0,
  zIndex: 3,
  width: 88,
  minWidth: 88,
  boxShadow: '-10px 0 18px rgba(17,20,24,0.04)',
}

const primaryText: React.CSSProperties = {
  fontWeight: 650,
  color: 'var(--color-text)',
}

const mutedText: React.CSSProperties = {
  marginTop: 4,
  fontSize: 11,
  color: 'var(--color-text-muted)',
}

const panelStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 70,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
  background: 'rgba(17, 20, 24, 0.62)',
}

const panelFormStyle: React.CSSProperties = {
  width: '92vw',
  maxWidth: 1180,
  maxHeight: 'calc(100vh - 48px)',
  display: 'grid',
  gridTemplateRows: 'auto auto minmax(0, 1fr) auto',
  border: '1px solid var(--color-border)',
  borderRadius: 10,
  background: 'var(--color-surface)',
  boxShadow: '0 24px 60px rgba(0,0,0,0.24)',
  overflow: 'hidden',
}

const accountPanelFormStyle = (mode: 'create' | 'edit' | 'reset' | null): React.CSSProperties => ({
  ...panelFormStyle,
  gridTemplateRows: mode === 'edit' ? 'auto auto minmax(0, 1fr) auto' : 'auto minmax(0, 1fr) auto',
})

const resetPanelFormStyle: React.CSSProperties = {
  width: 'min(560px, 92vw)',
  maxHeight: 'calc(100vh - 48px)',
  display: 'grid',
  gridTemplateRows: 'auto minmax(0, 1fr) auto',
  border: '1px solid var(--color-border)',
  borderRadius: 10,
  background: 'var(--color-surface)',
  boxShadow: '0 24px 60px rgba(0,0,0,0.24)',
  overflow: 'hidden',
}

const confirmPanelStyle: React.CSSProperties = {
  ...resetPanelFormStyle,
}

const panelBodyStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
  minHeight: 0,
  overflow: 'auto',
  padding: 18,
}

const createPanelBodyStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))',
  gap: 18,
  minHeight: 0,
  overflow: 'auto',
  padding: 18,
}

const accountFieldsStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
  minWidth: 0,
}

const panelFooterStyle: React.CSSProperties = {
  position: 'sticky',
  bottom: 0,
  zIndex: 2,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  gap: 12,
  flexWrap: 'wrap',
  padding: '14px 18px',
  borderTop: '1px solid var(--color-border)',
  background: 'var(--color-surface)',
  boxShadow: '0 -10px 18px rgba(0,0,0,0.08)',
}

const tabRowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 8,
  border: '1px solid var(--color-border)',
  borderRadius: 9,
  padding: 4,
  background: 'var(--color-surface-2)',
}

const tabButtonStyle = (active: boolean): React.CSSProperties => ({
  minHeight: 34,
  borderRadius: 7,
  border: '1px solid transparent',
  background: active ? 'var(--color-surface)' : 'transparent',
  color: active ? 'var(--color-text)' : 'var(--color-text-muted)',
  fontSize: 12,
  fontWeight: 750,
})

const panelHeadStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  padding: '16px 18px',
  borderBottom: '1px solid var(--color-border)',
  background: 'var(--color-surface)',
}

const iconButtonStyle: React.CSSProperties = {
  width: 30,
  height: 30,
  borderRadius: 8,
  border: '1px solid var(--color-border)',
  color: 'var(--color-text-muted)',
}

const selectStyle: React.CSSProperties = {
  width: '100%',
  height: 38,
  border: '1px solid var(--color-border-strong)',
  borderRadius: 8,
  background: 'var(--color-surface)',
  color: 'var(--color-text)',
  padding: '0 10px',
  fontSize: 13,
}

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 650,
  color: 'var(--color-text-muted)',
}

const statusStackStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
  alignItems: 'center',
}

const compactPillStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  borderRadius: 999,
  border: '1px solid transparent',
  padding: '3px 8px',
  fontSize: 11,
  fontWeight: 750,
  whiteSpace: 'nowrap',
}

const actionMenuWrapStyle: React.CSSProperties = {
  position: 'relative',
  display: 'flex',
  justifyContent: 'center',
}

const actionMenuTriggerStyle: React.CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 9,
  border: '1px solid var(--color-border-strong)',
  background: 'var(--color-surface)',
  color: 'var(--color-text)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 18,
}

const actionMenuStyle: React.CSSProperties = {
  position: 'absolute',
  top: 40,
  right: 0,
  zIndex: 8,
  width: 184,
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  border: '1px solid var(--color-border)',
  borderRadius: 10,
  background: 'var(--color-surface)',
  boxShadow: '0 18px 40px rgba(0,0,0,0.18)',
  padding: 6,
}

const menuActionButtonStyle = (tone: 'normal' | 'danger', disabled: boolean): React.CSSProperties => ({
  width: '100%',
  minHeight: 34,
  borderRadius: 8,
  border: '1px solid transparent',
  padding: '0 10px',
  background: disabled ? 'var(--color-surface-2)' : 'transparent',
  color: disabled ? 'var(--color-text-muted)' : tone === 'danger' ? 'var(--color-danger)' : 'var(--color-text)',
  fontSize: 12,
  fontWeight: 750,
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.72 : 1,
  textAlign: 'left',
  whiteSpace: 'nowrap',
})

const textButton: React.CSSProperties = {
  color: 'var(--color-charcoal)',
  fontSize: 12,
  fontWeight: 700,
  textDecoration: 'underline',
}

const emptyState: React.CSSProperties = {
  padding: 28,
  textAlign: 'center',
  color: 'var(--color-text-muted)',
}

const forbiddenStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  border: '1px solid var(--color-border)',
  borderRadius: 10,
  background: 'var(--color-surface)',
  padding: 20,
}

const smallNote: React.CSSProperties = {
  fontSize: 13,
  color: 'var(--color-text-muted)',
}

const readOnlyInfoStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 5,
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  padding: 10,
  fontSize: 13,
  color: 'var(--color-text-muted)',
}

const readOnlyGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 8,
}

const confirmBoxStyle: React.CSSProperties = {
  border: '1px solid var(--color-border)',
  borderRadius: 9,
  padding: 12,
  background: 'var(--color-surface-2)',
}

const permissionPanelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  borderTop: '1px solid var(--color-border)',
  paddingTop: 14,
}

const permissionHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
}

const permissionSummaryGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 8,
}

const openPermissionModalButtonStyle: React.CSSProperties = {
  minHeight: 44,
  borderRadius: 8,
  border: '1px solid var(--color-border-strong)',
  background: 'var(--color-charcoal)',
  color: '#fff',
  fontSize: 13,
  fontWeight: 800,
}

const permissionModalBackdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 80,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
  background: 'rgba(17, 20, 24, 0.62)',
}

const permissionModalStyle: React.CSSProperties = {
  width: 'min(1180px, 90vw)',
  height: 'min(860px, 88vh)',
  display: 'grid',
  gridTemplateRows: 'auto minmax(0, 1fr) auto',
  border: '1px solid var(--color-border)',
  borderRadius: 10,
  background: 'var(--color-surface)',
  boxShadow: '0 24px 60px rgba(0,0,0,0.24)',
  overflow: 'hidden',
}

const permissionModalHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 16,
  padding: '18px 20px',
  borderBottom: '1px solid var(--color-border)',
  background: 'var(--color-surface)',
}

const permissionModalTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 20,
  fontWeight: 800,
  color: 'var(--color-text)',
}

const permissionModalMetaStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 12,
  marginTop: 8,
  fontSize: 13,
  color: 'var(--color-text-muted)',
}

const permissionModalBodyStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  minHeight: 0,
  padding: '14px 20px',
  overflow: 'hidden',
}

const permissionModalControlStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 16,
  flexWrap: 'wrap',
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  padding: '12px 14px',
  background: 'var(--color-surface-2)',
}

const largeToggleRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  fontSize: 14,
  fontWeight: 800,
  color: 'var(--color-text)',
}

const largeMatrixWrapStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflow: 'auto',
  border: '1px solid var(--color-border)',
  borderRadius: 9,
  background: 'var(--color-surface)',
}

const largeMatrixTableStyle: React.CSSProperties = {
  width: '100%',
  minWidth: 1060,
  borderCollapse: 'collapse',
}

const matrixHeaderCellStyle: React.CSSProperties = {
  position: 'sticky',
  top: 0,
  zIndex: 1,
  textAlign: 'left',
  padding: '13px 14px',
  fontSize: 11,
  color: 'var(--color-text-muted)',
  textTransform: 'uppercase',
  letterSpacing: 0.4,
  borderBottom: '1px solid var(--color-border)',
  background: 'var(--color-surface-2)',
}

const largeModuleCellStyle: React.CSSProperties = {
  padding: '14px 16px',
  borderBottom: '1px solid var(--color-border)',
  verticalAlign: 'top',
}

const permissionDescriptionStyle: React.CSSProperties = {
  marginTop: 5,
  fontSize: 12,
  lineHeight: 1.4,
  color: 'var(--color-text-muted)',
}

const largeScopeCellStyle: React.CSSProperties = {
  width: 230,
  padding: '12px 14px',
  borderBottom: '1px solid var(--color-border)',
  verticalAlign: 'middle',
}

const largeCheckboxCellStyle: React.CSSProperties = {
  width: 82,
  padding: '12px 10px',
  textAlign: 'center',
  borderBottom: '1px solid var(--color-border)',
}

const largeCheckboxStyle: React.CSSProperties = {
  width: 20,
  height: 20,
  cursor: 'pointer',
}

const largeScopeSelectStyle: React.CSSProperties = {
  ...selectStyle,
  minWidth: 190,
  height: 42,
  fontSize: 13,
}

const permissionModalFooterStyle: React.CSSProperties = {
  position: 'sticky',
  bottom: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  gap: 12,
  flexWrap: 'wrap',
  padding: '14px 20px',
  borderTop: '1px solid var(--color-border)',
  background: 'var(--color-surface)',
}

const modalSecondaryButtonStyle: React.CSSProperties = {
  minHeight: 38,
  borderRadius: 8,
  border: '1px solid var(--color-border)',
  padding: '0 14px',
  color: 'var(--color-text)',
  fontSize: 13,
  fontWeight: 750,
}

const alertStyle = (tone: 'error' | 'success' | 'warning'): React.CSSProperties => ({
  border: `1px solid ${tone === 'error' ? 'rgba(184,64,64,0.28)' : tone === 'warning' ? 'rgba(168,98,26,0.26)' : 'rgba(74,140,92,0.28)'}`,
  background: tone === 'error' ? 'rgba(184,64,64,0.08)' : tone === 'warning' ? '#FEF0DC' : 'rgba(74,140,92,0.08)',
  color: tone === 'error' ? 'var(--color-danger)' : tone === 'warning' ? '#A8621A' : '#3A7A4A',
  borderRadius: 9,
  padding: '10px 12px',
  fontSize: 13,
})

const badgeStyle = (tone: 'lime' | 'success' | 'warning'): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  borderRadius: 999,
  padding: '3px 8px',
  fontSize: 11,
  fontWeight: 700,
  color: tone === 'lime' ? 'var(--color-charcoal)' : tone === 'success' ? '#3A7A4A' : '#A8621A',
  background: tone === 'lime' ? 'var(--color-lime)' : tone === 'success' ? '#E8F5ED' : '#FEF0DC',
})
