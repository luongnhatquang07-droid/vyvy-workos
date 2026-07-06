import type { SupabaseClient } from '@supabase/supabase-js'
import {
  isActiveAccountStatus,
  roleLabel,
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

export async function loadUserManagementData(service: ServiceClient, workspaceId: string) {
  const [profilesRes, peopleRes, membershipsRes, rolesRes, departmentsRes, authUsers] = await Promise.all([
    service
      .from('profiles')
      .select('id,auth_user_id,display_name,username,status,created_at,updated_at')
      .eq('workspace_id', workspaceId),
    service
      .from('people')
      .select('id,profile_id,full_name,email,department_id,manager_id,status,created_at,updated_at')
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null),
    service
      .from('workspace_memberships')
      .select('id,profile_id,role_id,is_active,joined_at')
      .eq('workspace_id', workspaceId),
    service.from('roles').select('id,code,name').order('code', { ascending: true }),
    service
      .from('departments')
      .select('id,name,code,head_person_id,status')
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .order('name', { ascending: true }),
    listAuthUsers(service),
  ])

  for (const result of [profilesRes, peopleRes, membershipsRes, rolesRes, departmentsRes]) {
    if (result.error) throw result.error
  }

  const profiles = (profilesRes.data ?? []) as ProfileRow[]
  const people = (peopleRes.data ?? []) as PersonRow[]
  const memberships = (membershipsRes.data ?? []) as MembershipRow[]
  const roles = (rolesRes.data ?? []) as RoleRow[]
  const departments = (departmentsRes.data ?? []) as DepartmentRow[]

  const peopleByProfile = new Map(people.map((person) => [person.profile_id, person]))
  const peopleById = new Map(people.map((person) => [person.id, person]))
  const membershipsByProfile = new Map(memberships.map((membership) => [membership.profile_id, membership]))
  const rolesById = new Map(roles.map((role) => [role.id, role]))
  const departmentsById = new Map(departments.map((department) => [department.id, department]))
  const authById = new Map(authUsers.map((user) => [user.id, user]))

  const users = profiles.map((profile) => {
    const person = peopleByProfile.get(profile.id) ?? null
    const membership = membershipsByProfile.get(profile.id) ?? null
    const role = membership ? rolesById.get(membership.role_id) ?? null : null
    const department = person?.department_id ? departmentsById.get(person.department_id) ?? null : null
    const manager = person?.manager_id ? peopleById.get(person.manager_id) ?? null : null
    const authUser = profile.auth_user_id ? authById.get(profile.auth_user_id) ?? null : null
    const status = person?.status ?? profile.status ?? (membership?.is_active === false ? 'inactive' : 'active')

    return {
      profileId: profile.id,
      personId: person?.id ?? null,
      authUserId: profile.auth_user_id,
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
      authLinked: Boolean(profile.auth_user_id && authUser),
      isActiveMembership: membership?.is_active !== false,
      createdAt: person?.created_at ?? profile.created_at,
      updatedAt: person?.updated_at ?? profile.updated_at,
    }
  })

  return {
    users,
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

  const authUsers = await listAuthUsers(service)
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
  const users: AuthUserRow[] = []
  let page = 1

  while (page <= 10) {
    const result = await service.auth.admin.listUsers({ page, perPage: 100 })
    if (result.error) throw result.error
    users.push(...((result.data.users ?? []) as AuthUserRow[]))
    if ((result.data.users ?? []).length < 100) break
    page += 1
  }

  return users
}
