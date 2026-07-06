import type { SupabaseClient } from '@supabase/supabase-js'
import {
  isActiveAccountStatus,
  roleLabel,
  usernameFromEmail,
  userStatusLabel,
} from '@/lib/admin/userManagement'

type ServiceClient = SupabaseClient

interface ProfileRow {
  id: string
  auth_user_id: string | null
  display_name: string
  username: string | null
  status: string | null
  created_at: string | null
  updated_at: string | null
}

interface PersonRow {
  id: string
  profile_id: string | null
  full_name: string
  email: string | null
  department_id: string | null
  manager_id: string | null
  status: string | null
  created_at: string | null
  updated_at: string | null
}

interface MembershipRow {
  id: string
  profile_id: string
  role_id: string
  is_active: boolean | null
  joined_at: string | null
}

interface RoleRow {
  id: string
  code: string
  name: string
}

interface DepartmentRow {
  id: string
  name: string
  code: string | null
  head_person_id: string | null
  status: string | null
}

interface AuthUserRow {
  id: string
  email?: string
  created_at?: string
  last_sign_in_at?: string | null
}

export type UserManagementSource =
  | 'auth_admin_profiles'
  | 'auth_admin_profiles_partial'
  | 'auth_admin_only'
  | 'profiles_only'

export type UserMappingStatus =
  | 'complete'
  | 'auth_only'
  | 'profile_only'
  | 'duplicate'
  | 'missing_membership'
  | 'missing_role'
  | 'missing_department'

interface RowActionCapabilities {
  canEdit: boolean
  canResetPassword: boolean
  canSuspend: boolean
}

interface UserManagementCapabilities {
  canCreateUser: boolean
  canEditMappedUser: boolean
  canResetMappedUser: boolean
  canSuspendMappedUser: boolean
}

export interface AuthAdminErrorDetails {
  name: string | null
  status: number | null
  code: string | null
  messageSafe: string
}

export interface AuthAdminDiagnostics {
  supabaseJsListUsersOk: boolean
  supabaseJsError: AuthAdminErrorDetails | null
  directFetchListUsersOk: boolean
  directFetchStatus: number | null
  directFetchError: AuthAdminErrorDetails | null
  returnedUserCount: number
}

export async function loadUserManagementData(service: ServiceClient, workspaceId: string) {
  const [authUsersResult, profilesRes, peopleRes, membershipsRes, rolesRes, departmentsRes] = await Promise.all([
    listAuthUsersForDisplay(service),
    safeRows<ProfileRow>(
      'profiles',
      service
        .from('profiles')
        .select('id,auth_user_id,display_name,username,status,created_at,updated_at')
        .eq('workspace_id', workspaceId),
    ),
    safeRows<PersonRow>(
      'people',
      service
        .from('people')
        .select('id,profile_id,full_name,email,department_id,manager_id,status,created_at,updated_at')
        .eq('workspace_id', workspaceId)
        .is('deleted_at', null),
    ),
    safeRows<MembershipRow>(
      'workspace_memberships',
      service
        .from('workspace_memberships')
        .select('id,profile_id,role_id,is_active,joined_at')
        .eq('workspace_id', workspaceId),
    ),
    safeRows<RoleRow>('roles', service.from('roles').select('id,code,name').order('code', { ascending: true })),
    safeRows<DepartmentRow>(
      'departments',
      service
        .from('departments')
        .select('id,name,code,head_person_id,status')
        .eq('workspace_id', workspaceId)
        .is('deleted_at', null)
        .order('name', { ascending: true }),
    ),
  ])

  const profiles = profilesRes.data
  const people = peopleRes.data
  const memberships = membershipsRes.data
  const roles = rolesRes.data
  const departments = departmentsRes.data
  const authUsers = authUsersResult.users

  const peopleByProfile = new Map<string, PersonRow>()
  for (const person of people) {
    if (!person.profile_id) continue
    const existing = peopleByProfile.get(person.profile_id)
    peopleByProfile.set(person.profile_id, choosePerson(existing, person))
  }

  const peopleById = new Map(people.map((person) => [person.id, person]))
  const rolesById = new Map(roles.map((role) => [role.id, role]))
  const membershipsByProfile = new Map<string, MembershipRow>()
  for (const membership of memberships) {
    const existing = membershipsByProfile.get(membership.profile_id)
    membershipsByProfile.set(membership.profile_id, chooseMembership(existing, membership, rolesById))
  }

  const departmentsById = new Map(departments.map((department) => [department.id, department]))
  const authById = new Map(authUsers.map((user) => [user.id, user]))
  const profilesByAuthId = new Set(profiles.map((profile) => profile.auth_user_id).filter(Boolean))
  const profileCountByAuthId = new Map<string, number>()
  for (const profile of profiles) {
    if (!profile.auth_user_id) continue
    profileCountByAuthId.set(profile.auth_user_id, (profileCountByAuthId.get(profile.auth_user_id) ?? 0) + 1)
  }

  const users = profiles.map((profile) => {
    const person = peopleByProfile.get(profile.id) ?? null
    const membership = membershipsByProfile.get(profile.id) ?? null
    const role = membership ? rolesById.get(membership.role_id) ?? null : null
    const department = person?.department_id ? departmentsById.get(person.department_id) ?? null : null
    const manager = person?.manager_id ? peopleById.get(person.manager_id) ?? null : null
    const authUser = profile.auth_user_id ? authById.get(profile.auth_user_id) ?? null : null
    const status = person?.status ?? profile.status ?? (membership?.is_active === false ? 'inactive' : 'active')
    const authLinked = Boolean(profile.auth_user_id && authUser)
    const mappingStatus = resolveProfileMappingStatus({
      profile,
      person,
      membership,
      role,
      department,
      authLinked,
      duplicateAuthId: Boolean(profile.auth_user_id && (profileCountByAuthId.get(profile.auth_user_id) ?? 0) > 1),
    })
    const actionCapabilities = rowActionCapabilities(mappingStatus)

    return {
      profileId: profile.id,
      personId: person?.id ?? null,
      authUserId: profile.auth_user_id,
      membershipId: membership?.id ?? null,
      displayName: profile.display_name,
      fullName: person?.full_name ?? profile.display_name,
      email: person?.email ?? authUser?.email ?? null,
      username: profile.username,
      roleCode: role?.code ?? null,
      roleLabel: roleLabel(role?.code),
      departmentId: person?.department_id ?? null,
      departmentName: department?.name ?? null,
      managerId: person?.manager_id ?? null,
      managerName: manager?.full_name ?? null,
      status,
      statusLabel: userStatusLabel(status),
      authLinked,
      isActiveMembership: membership?.is_active !== false,
      mappingStatus,
      actionCapabilities,
      createdAt: person?.created_at ?? profile.created_at,
      updatedAt: person?.updated_at ?? profile.updated_at,
    }
  })

  if (authUsersResult.available) {
    for (const authUser of authUsers) {
      if (profilesByAuthId.has(authUser.id)) continue
      users.push({
        profileId: `auth:${authUser.id}`,
        personId: null,
        authUserId: authUser.id,
        membershipId: null,
        displayName: authUser.email ?? 'Auth user',
        fullName: authUser.email ?? 'Auth user',
        email: authUser.email ?? null,
        username: authUser.email ? usernameFromEmail(authUser.email) : null,
        roleCode: null,
        roleLabel: roleLabel(null),
        departmentId: null,
        departmentName: null,
        managerId: null,
        managerName: null,
        status: 'active',
        statusLabel: userStatusLabel('active'),
        authLinked: true,
        isActiveMembership: false,
        mappingStatus: 'auth_only' as UserMappingStatus,
        actionCapabilities: rowActionCapabilities('auth_only'),
        createdAt: authUser.created_at ?? null,
        updatedAt: authUser.last_sign_in_at ?? authUser.created_at ?? null,
      })
    }
  }

  const warnings = [
    ...authUsersResult.warnings,
    profilesRes.warning,
    peopleRes.warning,
    membershipsRes.warning,
    rolesRes.warning,
    departmentsRes.warning,
  ].filter(Boolean) as string[]

  const source = resolveUserManagementSource({
    authAvailable: authUsersResult.available,
    authPartial: authUsersResult.partial,
    profilesOk: profilesRes.ok,
    mergeWarnings: warnings.length > authUsersResult.warnings.length,
  })
  const capabilities = resolveCapabilities({
    authAvailable: authUsersResult.available,
    profilesOk: profilesRes.ok,
    peopleOk: peopleRes.ok,
    membershipsOk: membershipsRes.ok,
    rolesOk: rolesRes.ok,
    departmentsOk: departmentsRes.ok,
  })
  const writeActionsAvailable = Object.values(capabilities).some(Boolean)

  return {
    users,
    source,
    total: users.length,
    authAdminAvailable: authUsersResult.available,
    authAdminError: authUsersResult.available ? null : authUsersResult.error,
    writeActionsAvailable,
    capabilities,
    warnings,
    profileMergeWarning: warnings.length ? warnings.join(' ') : null,
    diagnostics: {
      authUsersCount: authUsers.length,
      profilesCount: profiles.length,
      peopleCount: people.length,
      membershipsCount: memberships.length,
      rolesCount: roles.length,
      departmentsCount: departments.length,
      completeRows: users.filter((user) => user.mappingStatus === 'complete').length,
      partialRows: users.filter((user) => user.mappingStatus !== 'complete').length,
    },
    lookups: {
      roles: roles.map((role) => ({ id: role.id, code: role.code, label: roleLabel(role.code), name: role.name })),
      departments: departments.map((department) => ({
        id: department.id,
        name: department.name,
        code: department.code,
        status: department.status,
      })),
      managers: people.map((person) => ({
        id: person.id,
        name: person.full_name,
        email: person.email,
        departmentId: person.department_id,
      })),
    },
  }
}

export async function findRoleByCode(service: ServiceClient, code: string) {
  const result = await service.from('roles').select('id,code,name').eq('code', code).maybeSingle()
  if (result.error) throw result.error
  return result.data as RoleRow | null
}

export async function entityExists(
  service: ServiceClient,
  table: 'departments' | 'people',
  workspaceId: string,
  id: string,
) {
  const result = await service
    .from(table)
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()
  if (result.error) throw result.error
  return Boolean(result.data)
}

export async function requireCompleteManagedUserRow(
  service: ServiceClient,
  workspaceId: string,
  profileId: string,
) {
  const profileRes = await service
    .from('profiles')
    .select('id,auth_user_id')
    .eq('workspace_id', workspaceId)
    .eq('id', profileId)
    .maybeSingle()
  if (profileRes.error) throw profileRes.error
  if (!profileRes.data) {
    return { ok: false as const, status: 404, message: 'Khong tim thay tai khoan.' }
  }
  if (!profileRes.data.auth_user_id) {
    return { ok: false as const, status: 400, message: 'Tai khoan chua lien ket Auth user.' }
  }

  const [personRes, membershipRes] = await Promise.all([
    service
      .from('people')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('profile_id', profileId)
      .is('deleted_at', null)
      .maybeSingle(),
    service
      .from('workspace_memberships')
      .select('id,role_id')
      .eq('workspace_id', workspaceId)
      .eq('profile_id', profileId)
      .maybeSingle(),
  ])
  if (personRes.error) throw personRes.error
  if (membershipRes.error) throw membershipRes.error
  if (!personRes.data?.id) {
    return { ok: false as const, status: 400, message: 'Tai khoan chua co ho so nhan su hop le.' }
  }
  if (!membershipRes.data?.id || !membershipRes.data.role_id) {
    return { ok: false as const, status: 400, message: 'Tai khoan chua co membership hop le.' }
  }

  return {
    ok: true as const,
    profile: profileRes.data,
    person: personRes.data,
    membership: membershipRes.data,
  }
}

export async function findDuplicateEmail(service: ServiceClient, workspaceId: string, email: string) {
  const peopleRes = await service
    .from('people')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('email', email)
    .is('deleted_at', null)
    .maybeSingle()
  if (peopleRes.error) throw peopleRes.error
  if (peopleRes.data) return true

  const authUsersResult = await listAuthUsersResilient(service)
  const authUsers = authUsersResult.users
  return authUsers.some((user) => user.email?.toLowerCase() === email)
}

export async function updateMembershipRole(
  service: ServiceClient,
  workspaceId: string,
  profileId: string,
  roleId: string,
  status: string,
) {
  const existing = await service
    .from('workspace_memberships')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('profile_id', profileId)
    .maybeSingle()
  if (existing.error) throw existing.error

  if (existing.data?.id) {
    const updateRes = await service
      .from('workspace_memberships')
      .update({ role_id: roleId, is_active: isActiveAccountStatus(status) })
      .eq('id', existing.data.id)
      .eq('workspace_id', workspaceId)
    if (updateRes.error) throw updateRes.error
    return
  }

  const insertRes = await service.from('workspace_memberships').insert({
    workspace_id: workspaceId,
    profile_id: profileId,
    role_id: roleId,
    is_active: isActiveAccountStatus(status),
  })
  if (insertRes.error) throw insertRes.error
}

export async function listAuthUsers(service: ServiceClient) {
  const result = await listAuthUsersResilient(service)
  if (!result.available || result.error) throw new Error(result.error ?? 'Auth Admin unavailable.')
  if (result.partial) {
    throw new Error('Auth Admin returned a partial user list. User write actions are locked until the full list is available.')
  }
  return result.users
}

export async function diagnoseAuthAdminListUsers(service: ServiceClient): Promise<AuthAdminDiagnostics> {
  let supabaseJsListUsersOk = false
  let supabaseJsError: AuthAdminErrorDetails | null = null
  let directFetchListUsersOk = false
  let directFetchStatus: number | null = null
  let directFetchError: AuthAdminErrorDetails | null = null
  let returnedUserCount = 0

  try {
    const result = await service.auth.admin.listUsers({ page: 1, perPage: 1 })
    if (result.error) throw result.error
    supabaseJsListUsersOk = true
    returnedUserCount = result.data.users?.length ?? 0
  } catch (error) {
    supabaseJsError = authAdminErrorDetails(error)
  }

  try {
    const direct = await fetchAuthAdminUsersPage(1, 1)
    directFetchListUsersOk = true
    directFetchStatus = direct.status
    returnedUserCount = Math.max(returnedUserCount, direct.users.length)
  } catch (error) {
    directFetchError = authAdminErrorDetails(error)
    directFetchStatus = directFetchError.status
  }

  return {
    supabaseJsListUsersOk,
    supabaseJsError,
    directFetchListUsersOk,
    directFetchStatus,
    directFetchError,
    returnedUserCount,
  }
}

async function listAuthUsersPage(service: ServiceClient, page: number, perPage: number) {
  try {
    const result = await service.auth.admin.listUsers({ page, perPage })
    if (result.error) throw result.error
    return (result.data.users ?? []) as AuthUserRow[]
  } catch (supabaseJsError) {
    try {
      const direct = await fetchAuthAdminUsersPage(page, perPage)
      return direct.users
    } catch (directError) {
      throw directError ?? supabaseJsError
    }
  }
}

async function fetchAuthAdminUsersPage(page: number, perPage: number) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    throw authAdminSafeError('missing_service_role', 500, 'Thiếu cấu hình Supabase service role server-side.')
  }

  const url = new URL('/auth/v1/admin/users', supabaseUrl)
  url.searchParams.set('page', String(page))
  url.searchParams.set('per_page', String(perPage))

  const response = await fetch(url, {
    cache: 'no-store',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
  })
  const payload = await response.json().catch(() => null) as {
    users?: AuthUserRow[]
    code?: string
    error_code?: string
    error?: string
    msg?: string
    message?: string
  } | null

  if (!response.ok) {
    throw authAdminSafeError(
      payload?.code ?? payload?.error_code ?? payload?.error ?? `http_${response.status}`,
      response.status,
      payload?.message ?? payload?.msg ?? response.statusText,
    )
  }

  return {
    status: response.status,
    users: (payload?.users ?? []) as AuthUserRow[],
  }
}

async function listAuthUsersForDisplay(service: ServiceClient) {
  return listAuthUsersResilient(service)
}

async function listAuthUsersResilient(service: ServiceClient) {
  try {
    return {
      users: await listAuthUsersWithPageSize(service, 100, 10),
      error: null as string | null,
      available: true,
      partial: false,
      warnings: [] as string[],
    }
  } catch (bulkError) {
    const fallback = await listAuthUsersBySinglePages(service, 100)
    if (fallback.available) {
      return {
        users: fallback.users,
        error: null as string | null,
        available: true,
        partial: fallback.partial,
        warnings: [
          'Auth Admin bulk list failed; loaded users with a safer small-page fallback.',
          ...fallback.warnings,
        ],
      }
    }

    return {
      users: [] as AuthUserRow[],
      error: adminAuthErrorMessage(bulkError),
      available: false,
      partial: false,
      warnings: [] as string[],
    }
  }
}

async function listAuthUsersWithPageSize(service: ServiceClient, perPage: number, maxPages: number) {
  const users: AuthUserRow[] = []
  let page = 1

  while (page <= maxPages) {
    const pageUsers = await listAuthUsersPage(service, page, perPage)
    users.push(...pageUsers)
    if (pageUsers.length < perPage) break
    page += 1
  }

  return users
}

async function listAuthUsersBySinglePages(service: ServiceClient, maxPages: number) {
  const users: AuthUserRow[] = []
  const warnings: string[] = []

  for (let page = 1; page <= maxPages; page += 1) {
    try {
      const pageUsers = await listAuthUsersPage(service, page, 1)
      users.push(...pageUsers)
      if (pageUsers.length < 1) {
        return { users, available: true, partial: false, warnings }
      }
    } catch (error) {
      if (users.length > 0) {
        warnings.push(adminAuthErrorMessage(error))
        return { users, available: true, partial: true, warnings }
      }

      return { users, available: false, partial: false, warnings: [adminAuthErrorMessage(error)] }
    }
  }

  warnings.push('Auth Admin user list hit the safety page limit and may be incomplete.')
  return { users, available: true, partial: true, warnings }
}

async function safeRows<T>(
  label: string,
  query: PromiseLike<{ data: T[] | null; error: unknown }>,
) {
  const result = await query
  if (result.error) {
    return {
      data: [] as T[],
      ok: false,
      warning: safeDataLoadWarning(label),
    }
  }

  return {
    data: result.data ?? [],
    ok: true,
    warning: null as string | null,
  }
}

function safeDataLoadWarning(label: string) {
  return `Dang tai duoc danh sach nguoi dung, nhung chua dong bo duoc bang ${label}.`
}

function resolveUserManagementSource(input: {
  authAvailable: boolean
  authPartial: boolean
  profilesOk: boolean
  mergeWarnings: boolean
}): UserManagementSource {
  if (!input.authAvailable) return 'profiles_only'
  if (!input.profilesOk) return 'auth_admin_only'
  if (input.authPartial || input.mergeWarnings) return 'auth_admin_profiles_partial'
  return 'auth_admin_profiles'
}

function resolveCapabilities(input: {
  authAvailable: boolean
  profilesOk: boolean
  peopleOk: boolean
  membershipsOk: boolean
  rolesOk: boolean
  departmentsOk: boolean
}): UserManagementCapabilities {
  const canCreateUser = input.authAvailable && input.profilesOk && input.rolesOk
  const canOperateMappedRows = canCreateUser && input.peopleOk && input.membershipsOk && input.departmentsOk

  return {
    canCreateUser,
    canEditMappedUser: canOperateMappedRows,
    canResetMappedUser: canOperateMappedRows,
    canSuspendMappedUser: canOperateMappedRows,
  }
}

function resolveProfileMappingStatus(input: {
  profile: ProfileRow
  person: PersonRow | null
  membership: MembershipRow | null
  role: RoleRow | null
  department: DepartmentRow | null
  authLinked: boolean
  duplicateAuthId: boolean
}): UserMappingStatus {
  if (input.duplicateAuthId) return 'duplicate'
  if (!input.profile.auth_user_id || !input.authLinked || !input.person) return 'profile_only'
  if (!input.membership) return 'missing_membership'
  if (!input.role) return 'missing_role'
  if (input.person.department_id && !input.department) return 'missing_department'
  return 'complete'
}

function rowActionCapabilities(mappingStatus: UserMappingStatus): RowActionCapabilities {
  const complete = mappingStatus === 'complete'
  return {
    canEdit: complete,
    canResetPassword: complete,
    canSuspend: complete,
  }
}

function choosePerson(current: PersonRow | undefined, next: PersonRow) {
  if (!current) return next
  if (current.status !== 'active' && next.status === 'active') return next
  if (!current.email && next.email) return next
  return current
}

function chooseMembership(
  current: MembershipRow | undefined,
  next: MembershipRow,
  rolesById: Map<string, RoleRow>,
) {
  if (!current) return next
  if (current.is_active === false && next.is_active !== false) return next
  if (current.is_active !== false && next.is_active === false) return current
  return rolePriority(next.role_id, rolesById) > rolePriority(current.role_id, rolesById) ? next : current
}

function rolePriority(roleId: string, rolesById: Map<string, RoleRow>) {
  const code = rolesById.get(roleId)?.code
  if (code === 'ADMIN') return 100
  if (code === 'CEO') return 80
  if (code === 'COO') return 70
  if (code === 'DEPARTMENT_HEAD') return 50
  if (code === 'PROJECT_COORDINATOR') return 40
  if (code === 'EMPLOYEE') return 10
  if (code === 'CEO_READONLY') return 5
  return 0
}

export function adminAuthErrorMessage(error: unknown) {
  const raw = rawErrorMessage(error)
  const normalized = raw.toLowerCase()

  if (normalized.includes('database error finding users')) {
    return 'Dang tai duoc danh sach ho so, nhung chua dong bo duoc day du Auth users.'
  }

  if (normalized.includes('invalid') || normalized.includes('jwt') || normalized.includes('api key')) {
    return 'Supabase Auth Admin từ chối service role key. Kiểm tra lại Production service role key trước khi thao tác tài khoản.'
  }

  if (
    normalized.includes('fetch') ||
    normalized.includes('network') ||
    normalized.includes('"url"') ||
    normalized.includes('/auth/v1/admin')
  ) {
    return 'Không kết nối được Supabase Auth Admin. Danh sách hồ sơ vẫn có thể xem, nhưng thao tác tài khoản đang bị khóa.'
  }

  return raw && !raw.includes('/auth/v1/admin')
    ? raw
    : 'Không tải được danh sách Auth users từ Supabase Auth Admin. Thao tác tài khoản đang bị khóa.'
}

export function authAdminErrorDetails(error: unknown): AuthAdminErrorDetails {
  const record = error && typeof error === 'object' ? error as Record<string, unknown> : {}
  return {
    name: safeString(record.name),
    status: safeNumber(record.status),
    code: safeString(record.code),
    messageSafe: adminAuthErrorMessage(error),
  }
}

function authAdminSafeError(code: string, status: number, message: string) {
  const error = new Error(message)
  Object.assign(error, { code, status, name: 'AuthAdminSafeError' })
  return error
}

function safeString(value: unknown) {
  return typeof value === 'string' && value.length <= 80 ? value : null
}

function safeNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function rawErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error && 'message' in error) return String(error.message)
  if (typeof error === 'string') return error
  return ''
}
