'use client'

import React from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { PageHead } from '@/components/ui/PageHead'

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
  status: AccountStatus | string
  statusLabel: string
  authLinked: boolean
  isActiveMembership: boolean
  mappingStatus?: UserMappingStatus
  actionCapabilities?: {
    canEdit?: boolean
    canResetPassword?: boolean
    canSuspend?: boolean
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
  managers: Array<{ id: string; name: string; email: string | null; departmentId: string | null }>
}

interface UserActionCapabilities {
  canCreateUser: boolean
  canEditMappedUser: boolean
  canResetMappedUser: boolean
  canSuspendMappedUser: boolean
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
  fullName: string
  email: string
  password: string
  roleCode: string
  departmentId: string
  managerId: string
  status: AccountStatus
}

const emptyForm: AccountForm = {
  fullName: '',
  email: '',
  password: '',
  roleCode: 'EMPLOYEE',
  departmentId: '',
  managerId: '',
  status: 'active',
}

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
  })
  const [diagnostics, setDiagnostics] = React.useState<UsersPayload['diagnostics']>(undefined)
  const [users, setUsers] = React.useState<ManagedUser[]>([])
  const [lookups, setLookups] = React.useState<LookupData>({ roles: [], departments: [], managers: [] })
  const [meta, setMeta] = React.useState<UsersPayload['meta']>(undefined)
  const [query, setQuery] = React.useState('')
  const [roleFilter, setRoleFilter] = React.useState('')
  const [departmentFilter, setDepartmentFilter] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState('')
  const [mode, setMode] = React.useState<'create' | 'edit' | 'reset' | null>(null)
  const [selected, setSelected] = React.useState<ManagedUser | null>(null)
  const [form, setForm] = React.useState<AccountForm>(emptyForm)
  const [resetPassword, setResetPassword] = React.useState('')

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
      setLookups(payload.lookups ?? { roles: [], departments: [], managers: [] })
      setMeta(payload.meta)
      setAuthAdminError(payload.authAdminError ?? '')
      setWarnings(Array.isArray(payload.warnings) ? payload.warnings : [])
      setSource(payload.source ?? 'profiles_only')
      setCapabilities({
        canCreateUser: payload.capabilities?.canCreateUser === true,
        canEditMappedUser: payload.capabilities?.canEditMappedUser === true,
        canResetMappedUser: payload.capabilities?.canResetMappedUser === true,
        canSuspendMappedUser: payload.capabilities?.canSuspendMappedUser === true,
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
    setForm({ ...emptyForm, roleCode: lookups.roles.find((role) => role.code === 'EMPLOYEE')?.code ?? 'EMPLOYEE' })
    setMode('create')
  }

  function openEdit(user: ManagedUser) {
    setSelected(user)
    setResetPassword('')
    setForm({
      fullName: user.fullName,
      email: user.email ?? '',
      password: '',
      roleCode: user.roleCode ?? 'EMPLOYEE',
      departmentId: user.departmentId ?? '',
      managerId: user.managerId ?? '',
      status: normalizeStatus(user.status),
    })
    setMode('edit')
  }

  function openReset(user: ManagedUser) {
    setSelected(user)
    setResetPassword('')
    setMode('reset')
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

  function inferActionAllowed(url: string, method: 'POST' | 'PATCH') {
    if (url === '/api/admin/users' && method === 'POST') return capabilities.canCreateUser

    const targetUser = users.find((user) => url.includes(`/api/admin/users/${user.profileId}`))
    if (!targetUser) return false
    if (url.includes('/reset-password')) return canResetUser(targetUser)
    if (url.includes('/status')) return canSuspendUser(targetUser)
    return canEditUser(targetUser)
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault()
    await submitJson('/api/admin/users', 'POST', form, 'Đã tạo tài khoản staging.')
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
      { keepPanelOpen: true },
    )
  }

  async function submitJson(
    url: string,
    method: 'POST' | 'PATCH',
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
        user.email,
        user.username,
        user.departmentName,
        user.roleLabel,
      ].some((value) => value?.toLowerCase().includes(needle))
      const matchesRole = !roleFilter || user.roleCode === roleFilter
      const matchesDepartment = !departmentFilter || user.departmentId === departmentFilter
      const matchesStatus = !statusFilter || normalizeStatus(user.status) === statusFilter
      return matchesQuery && matchesRole && matchesDepartment && matchesStatus
    })
  }, [departmentFilter, query, roleFilter, statusFilter, users])

  const warningMessages = React.useMemo(() => {
    const partialActionMessage = source === 'auth_admin_profiles_partial'
      ? capabilities.canCreateUser
        ? 'Auth Admin da san sang de tao tai khoan moi. Mot so ho so cu chua lien ket day du nen thao tac tren tung dong do dang bi khoa.'
        : 'Danh sach tai khoan chi tai duoc mot phan; thao tac ghi dang bi khoa.'
      : ''
    return Array.from(new Set([partialActionMessage, authAdminError, ...warnings].filter(Boolean)))
  }, [authAdminError, capabilities.canCreateUser, source, warnings])
  const formRoleOptions = lookups.roles.map((role) => ({ value: role.code, label: role.label }))
  const departmentOptions = [{ value: '', label: 'Chưa gán phòng ban' }, ...lookups.departments.map((department) => ({ value: department.id, label: department.name }))]
  const managerOptions = [
    { value: '', label: 'Chưa gán quản lý' },
    ...lookups.managers
      .filter((manager) => manager.id !== selected?.personId)
      .map((manager) => ({ value: manager.id, label: manager.name })),
  ]
  const createActionDisabled = loading || saving || Boolean(error) || !capabilities.canCreateUser

  return (
    <div style={pageStyle}>
      <PageHead
        icon="ti-user-cog"
        title="Quản lý tài khoản"
        desc="Tạo, phân quyền và khóa/mở tài khoản trên staging hoặc production đã bật env phê duyệt. Phase 2 chưa enforce toàn app."
        actions={!forbidden ? <Button variant="primary" onClick={openCreate} disabled={createActionDisabled}><i className="ti ti-user-plus" /> Tạo tài khoản</Button> : null}
      />

      {!forbidden ? (
        <div style={metaRow}>
          <span>Env: <strong>{meta?.appEnv ?? 'staging'}</strong></span>
          <span>Ref: <strong>{meta?.supabaseRef ?? 'unknown'}</strong></span>
          <span>Quyền hiện tại: <strong>{meta?.currentRole ?? 'ADMIN'}</strong></span>
          <span>Source: <strong>{source}</strong></span>
          {diagnostics ? (
            <span>
              Mapping: <strong>{diagnostics.completeRows ?? 0}/{(diagnostics.completeRows ?? 0) + (diagnostics.partialRows ?? 0)}</strong>
            </span>
          ) : null}
        </div>
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
          placeholder="Tìm theo tên, email, role, phòng ban..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          style={{ minWidth: 240 }}
        />
        <SelectField value={roleFilter} onChange={setRoleFilter} options={[{ value: '', label: 'Tất cả role' }, ...formRoleOptions]} />
        <SelectField value={departmentFilter} onChange={setDepartmentFilter} options={[{ value: '', label: 'Tất cả phòng ban' }, ...lookups.departments.map((department) => ({ value: department.id, label: department.name }))]} />
        <SelectField value={statusFilter} onChange={setStatusFilter} options={[{ value: '', label: 'Tất cả trạng thái' }, ...statusOptions]} />
      </section>

      <section style={layoutStyle}>
        <div style={tableWrapStyle}>
          {loading ? (
            <div style={emptyState}>Đang tải danh sách tài khoản...</div>
          ) : filteredUsers.length ? (
            <table style={tableStyle}>
              <thead>
                <tr>
                  <Th>Họ tên</Th>
                  <Th>Email / Username</Th>
                  <Th>Role</Th>
                  <Th>Phòng ban</Th>
                  <Th>Quản lý</Th>
                  <Th>Trạng thái</Th>
                  <Th>Auth</Th>
                  <Th>Thao tác</Th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => {
                  const active = normalizeStatus(user.status) === 'active'
                  const editActionDisabled = loading || saving || Boolean(error) || !canEditUser(user)
                  const resetActionDisabled = loading || saving || Boolean(error) || !canResetUser(user)
                  const statusActionDisabled = loading || saving || Boolean(error) || !canSuspendUser(user)
                  return (
                    <tr key={user.profileId}>
                      <Td>
                        <div style={primaryText}>{user.fullName}</div>
                        <div style={mutedText}>Cập nhật: {formatDate(user.updatedAt)}</div>
                      </Td>
                      <Td>
                        <div style={primaryText}>{user.email ?? 'Chưa có email'}</div>
                        <div style={mutedText}>{user.username ?? 'Chưa có username'}</div>
                      </Td>
                      <Td><BadgeLike tone="lime">{user.roleLabel}</BadgeLike></Td>
                      <Td>{user.departmentName ?? 'Chưa gán'}</Td>
                      <Td>{user.managerName ?? 'Chưa gán'}</Td>
                      <Td><BadgeLike tone={active ? 'success' : 'warning'}>{user.statusLabel}</BadgeLike></Td>
                      <Td>
                        <div style={primaryText}>{user.authLinked ? 'Có' : 'Không'}</div>
                        <div style={mutedText}>{mappingStatusLabel(user.mappingStatus)}</div>
                      </Td>
                      <Td>
                        <div style={actionStack}>
                          <button type="button" style={textButton} onClick={() => openEdit(user)} disabled={editActionDisabled}>Sửa</button>
                          <button type="button" style={textButton} onClick={() => openReset(user)} disabled={resetActionDisabled}>Reset mật khẩu</button>
                          <button
                            type="button"
                            style={active ? dangerTextButton : textButton}
                            onClick={() => handleStatus(user, active ? 'suspended' : 'active')}
                            disabled={statusActionDisabled}
                          >
                            {active ? 'Khóa' : 'Mở'}
                          </button>
                        </div>
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ) : (
            <div style={emptyState}>Không có tài khoản phù hợp bộ lọc.</div>
          )}
        </div>

        {mode ? (
          <aside style={panelStyle}>
            {mode === 'reset' && selected ? (
              <form onSubmit={handleReset} style={panelFormStyle}>
                <PanelHead title="Reset mật khẩu tạm" onClose={() => setMode(null)} />
                <div style={smallNote}>Tài khoản: <strong>{selected.fullName}</strong></div>
                <Input
                  label="Mật khẩu tạm mới"
                  type="password"
                  minLength={8}
                  value={resetPassword}
                  onChange={(event) => setResetPassword(event.target.value)}
                  required
                  helpText="Mật khẩu chỉ dùng để gửi cho người dùng, không được lưu trong app."
                />
                <Button type="submit" variant="primary" loading={saving}>Reset mật khẩu</Button>
              </form>
            ) : (
              <form onSubmit={mode === 'create' ? handleCreate : handleEdit} style={panelFormStyle}>
                <PanelHead title={mode === 'create' ? 'Tạo tài khoản staging' : 'Sửa tài khoản'} onClose={() => setMode(null)} />
                <Input
                  label="Họ tên"
                  value={form.fullName}
                  onChange={(event) => setForm((prev) => ({ ...prev, fullName: event.target.value }))}
                  required
                />
                {mode === 'create' ? (
                  <>
                    <Input
                      label="Email"
                      type="email"
                      value={form.email}
                      onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                      required
                    />
                    <Input
                      label="Mật khẩu tạm"
                      type="password"
                      minLength={8}
                      value={form.password}
                      onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
                      required
                      helpText="Chỉ hiển thị trong form này, không lưu vào DB/code/docs."
                    />
                  </>
                ) : null}
                <FormSelect label="Role" value={form.roleCode} onChange={(value) => setForm((prev) => ({ ...prev, roleCode: value }))} options={formRoleOptions} />
                <FormSelect label="Phòng ban" value={form.departmentId} onChange={(value) => setForm((prev) => ({ ...prev, departmentId: value }))} options={departmentOptions} />
                <FormSelect label="Người quản lý" value={form.managerId} onChange={(value) => setForm((prev) => ({ ...prev, managerId: value }))} options={managerOptions} />
                <FormSelect label="Trạng thái" value={form.status} onChange={(value) => setForm((prev) => ({ ...prev, status: normalizeStatus(value) }))} options={statusOptions} />
                <Button type="submit" variant="primary" loading={saving}>{mode === 'create' ? 'Tạo tài khoản' : 'Lưu thay đổi'}</Button>
              </form>
            )}
          </aside>
        ) : null}
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

function SelectField({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} style={selectStyle}>
      {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  )
}

function FormSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={labelStyle}>{label}</span>
      <SelectField value={value} onChange={onChange} options={options} />
    </label>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return <th style={thStyle}>{children}</th>
}

function Td({ children }: { children: React.ReactNode }) {
  return <td style={tdStyle}>{children}</td>
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

function formatDate(value: string | null) {
  if (!value) return 'Chưa có'
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value))
}

const pageStyle: React.CSSProperties = {
  padding: 'var(--space-6)',
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
}

const metaRow: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 10,
  fontSize: 12,
  color: 'var(--color-text-muted)',
}

const toolbarStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(260px, 1fr) repeat(3, minmax(150px, 180px))',
  gap: 10,
  alignItems: 'center',
}

const layoutStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) minmax(320px, 380px)',
  gap: 16,
  alignItems: 'start',
}

const tableWrapStyle: React.CSSProperties = {
  border: '1px solid var(--color-border)',
  borderRadius: 10,
  background: 'var(--color-surface)',
  overflow: 'auto',
}

const tableStyle: React.CSSProperties = {
  width: '100%',
  minWidth: 980,
  borderCollapse: 'collapse',
}

const thStyle: React.CSSProperties = {
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
  border: '1px solid var(--color-border)',
  borderRadius: 10,
  background: 'var(--color-surface)',
  padding: 16,
  position: 'sticky',
  top: 18,
}

const panelFormStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
}

const panelHeadStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
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

const actionStack: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
}

const textButton: React.CSSProperties = {
  color: 'var(--color-charcoal)',
  fontSize: 12,
  fontWeight: 700,
  textDecoration: 'underline',
}

const dangerTextButton: React.CSSProperties = {
  ...textButton,
  color: 'var(--color-danger)',
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
