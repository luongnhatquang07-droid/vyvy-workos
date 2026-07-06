import {
  isLegacyReadOnlyRole,
  normalizeRole,
  type CanonicalRole,
  type WorkspaceRole,
} from './roles'

type QueryError = { message?: string } | null

type QueryResult<T> = Promise<{ data: T | null; error?: QueryError }>

interface QueryBuilder<T = Record<string, unknown>> {
  select(columns: string): QueryBuilder<T>
  eq(column: string, value: string | boolean): QueryBuilder<T>
  is(column: string, value: null): QueryBuilder<T>
  limit(count: number): QueryBuilder<T>
  maybeSingle(): QueryResult<T>
}

export interface RbacClient {
  auth: {
    getUser(): Promise<{ data: { user: { id: string } | null }; error?: QueryError }>
  }
  from<T = Record<string, unknown>>(table: string): QueryBuilder<T>
}

export interface RbacUserContext {
  authUserId: string | null
  profileId: string | null
  personId: string | null
  workspaceId: string | null
  role: WorkspaceRole | string | null
  normalizedRole: CanonicalRole | null
  departmentId: string | null
  managedDepartmentIds: string[]
  status: string | null
}

interface ProfileRecord {
  id: string
  status: string | null
}

interface MembershipRecord {
  workspace_id: string
  role_id: string
  is_active: boolean
}

interface RoleRecord {
  code: string
}

interface PersonRecord {
  id: string
  department_id: string | null
  status: string | null
}

interface DepartmentRecord {
  id: string
}

export interface RbacResource {
  id?: string | null
  project_id?: string | null
  workstream_id?: string | null
  task_id?: string | null
  step_id?: string | null
  owner_id?: string | null
  ownerId?: string | null
  person_id?: string | null
  personId?: string | null
  submitter_id?: string | null
  submitterId?: string | null
  reviewer_id?: string | null
  reviewerId?: string | null
  requested_by?: string | null
  requestedBy?: string | null
  approver_id?: string | null
  approverId?: string | null
  department_id?: string | null
  departmentId?: string | null
  owner_department_id?: string | null
  ownerDepartmentId?: string | null
  department_head_person_id?: string | null
  departmentHeadPersonId?: string | null
  assignee_ids?: string[] | null
  assigneeIds?: string[] | null
  supporter_ids?: string[] | null
  supporterIds?: string[] | null
  reviewer_ids?: string[] | null
  reviewerIds?: string[] | null
  co_owner_ids?: string[] | null
  coOwnerIds?: string[] | null
  watcher_ids?: string[] | null
  watcherIds?: string[] | null
  member_ids?: string[] | null
  memberIds?: string[] | null
}

export async function getCurrentUserProfile(client: RbacClient): Promise<RbacUserContext | null> {
  const userResult = await client.auth.getUser()
  const authUserId = userResult.data.user?.id ?? null
  if (!authUserId) return null

  const profileResult = await client
    .from<ProfileRecord>('profiles')
    .select('id,status')
    .eq('auth_user_id', authUserId)
    .maybeSingle()

  if (profileResult.error || !profileResult.data?.id) return null

  const membershipResult = await client
    .from<MembershipRecord>('workspace_memberships')
    .select('workspace_id,role_id,is_active')
    .eq('profile_id', profileResult.data.id)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()

  if (membershipResult.error || !membershipResult.data?.workspace_id) return null

  const roleResult = await client
    .from<RoleRecord>('roles')
    .select('code')
    .eq('id', membershipResult.data.role_id)
    .maybeSingle()

  const personResult = await client
    .from<PersonRecord>('people')
    .select('id,department_id,status')
    .eq('workspace_id', membershipResult.data.workspace_id)
    .eq('profile_id', profileResult.data.id)
    .is('deleted_at', null)
    .maybeSingle()

  const role = roleResult.data?.code ?? null
  const person = personResult.data ?? null
  const managedDepartmentIds = await getManagedDepartmentIds(client, membershipResult.data.workspace_id, person?.id ?? null)

  return {
    authUserId,
    profileId: profileResult.data.id,
    personId: person?.id ?? null,
    workspaceId: membershipResult.data.workspace_id,
    role,
    normalizedRole: normalizeRole(role),
    departmentId: person?.department_id ?? null,
    managedDepartmentIds,
    status: person?.status ?? profileResult.data.status ?? null,
  }
}

export function normalizeUserRole(user: Pick<RbacUserContext, 'role'> | null | undefined) {
  return normalizeRole(user?.role)
}

export function isAdmin(user: Pick<RbacUserContext, 'role'> | null | undefined) {
  return normalizeUserRole(user) === 'ADMIN'
}

export function isExecutive(user: Pick<RbacUserContext, 'role'> | null | undefined) {
  const role = normalizeUserRole(user)
  return role === 'ADMIN' || role === 'CEO' || role === 'COO'
}

export function isDepartmentHead(user: Pick<RbacUserContext, 'role'> | null | undefined) {
  return normalizeUserRole(user) === 'DEPARTMENT_HEAD'
}

export function isEmployee(user: Pick<RbacUserContext, 'role'> | null | undefined) {
  return normalizeUserRole(user) === 'EMPLOYEE'
}

export function canManageUsers(user: RbacUserContext | null | undefined) {
  return isActiveUser(user) && isAdmin(user)
}

export function canViewProject(user: RbacUserContext | null | undefined, project: RbacResource | null | undefined) {
  if (!isActiveUser(user)) return false
  if (isExecutive(user)) return true
  if (isDepartmentHead(user)) return isSameDepartment(user, project) || isAssignedToResource(user, project)
  return isAssignedToResource(user, project)
}

export function canEditProject(user: RbacUserContext | null | undefined, project: RbacResource | null | undefined) {
  if (!isActiveUser(user) || isReadOnly(user)) return false
  if (isAdmin(user) || normalizeUserRole(user) === 'COO') return true
  if (isDepartmentHead(user)) return isSameDepartment(user, project) || isAssignedToResource(user, project)
  return false
}

export function canViewWorkstream(user: RbacUserContext | null | undefined, workstream: RbacResource | null | undefined) {
  return canViewProject(user, workstream)
}

export function canEditWorkstream(user: RbacUserContext | null | undefined, workstream: RbacResource | null | undefined) {
  return canEditProject(user, workstream)
}

export function canViewSubtask(user: RbacUserContext | null | undefined, subtask: RbacResource | null | undefined) {
  if (!isActiveUser(user)) return false
  if (isExecutive(user)) return true
  if (isDepartmentHead(user)) return isSameDepartment(user, subtask) || isAssignedToResource(user, subtask)
  return isAssignedToResource(user, subtask)
}

export function canEditSubtask(user: RbacUserContext | null | undefined, subtask: RbacResource | null | undefined) {
  if (!isActiveUser(user) || isReadOnly(user)) return false
  if (isAdmin(user) || normalizeUserRole(user) === 'COO') return true
  if (isDepartmentHead(user)) return isSameDepartment(user, subtask) || isAssignedToResource(user, subtask)
  return isAssignedToResource(user, subtask)
}

export function canViewStep(user: RbacUserContext | null | undefined, step: RbacResource | null | undefined) {
  return canViewSubtask(user, step)
}

export function canEditStep(user: RbacUserContext | null | undefined, step: RbacResource | null | undefined) {
  return canEditSubtask(user, step)
}

export function canApproveDeliverable(user: RbacUserContext | null | undefined, deliverable: RbacResource | null | undefined) {
  if (!isActiveUser(user) || isReadOnly(user)) return false
  if (isAdmin(user) || normalizeUserRole(user) === 'COO') return true
  if (normalizeUserRole(user) === 'CEO') return true
  if (isDepartmentHead(user)) return isSameDepartment(user, deliverable) || isAssignedReviewer(user, deliverable)
  return isAssignedReviewer(user, deliverable)
}

export function canViewReports(user: RbacUserContext | null | undefined) {
  if (!isActiveUser(user)) return false
  return isExecutive(user) || isDepartmentHead(user)
}

export function canViewTeamWorkload(user: RbacUserContext | null | undefined) {
  if (!isActiveUser(user)) return false
  return isExecutive(user) || isDepartmentHead(user)
}

export function canViewFileLibrary(user: RbacUserContext | null | undefined, file: RbacResource | null | undefined) {
  if (!isActiveUser(user)) return false
  if (isExecutive(user)) return true
  if (isDepartmentHead(user)) return isSameDepartment(user, file) || isAssignedToResource(user, file)
  return isAssignedToResource(user, file)
}

async function getManagedDepartmentIds(client: RbacClient, workspaceId: string, personId: string | null) {
  if (!personId) return []

  const departmentResult = await client
    .from<DepartmentRecord>('departments')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('head_person_id', personId)
    .is('deleted_at', null)
    .maybeSingle()

  if (departmentResult.error || !departmentResult.data?.id) return []
  return [departmentResult.data.id]
}

function isActiveUser(user: RbacUserContext | null | undefined): user is RbacUserContext {
  if (!user) return false
  return user.status !== 'inactive' && user.status !== 'suspended'
}

function isReadOnly(user: Pick<RbacUserContext, 'role'> | null | undefined) {
  return isLegacyReadOnlyRole(user?.role)
}

function isSameDepartment(user: RbacUserContext, resource: RbacResource | null | undefined) {
  const resourceDepartmentId = firstString(
    resource?.department_id,
    resource?.departmentId,
    resource?.owner_department_id,
    resource?.ownerDepartmentId,
  )

  if (resourceDepartmentId && user.departmentId === resourceDepartmentId) return true
  if (resourceDepartmentId && user.managedDepartmentIds.includes(resourceDepartmentId)) return true

  const departmentHeadPersonId = firstString(resource?.department_head_person_id, resource?.departmentHeadPersonId)
  return Boolean(departmentHeadPersonId && user.personId === departmentHeadPersonId)
}

function isAssignedToResource(user: RbacUserContext, resource: RbacResource | null | undefined) {
  if (!user.personId || !resource) return false

  const directIds = [
    resource.owner_id,
    resource.ownerId,
    resource.person_id,
    resource.personId,
    resource.submitter_id,
    resource.submitterId,
    resource.reviewer_id,
    resource.reviewerId,
    resource.requested_by,
    resource.requestedBy,
    resource.approver_id,
    resource.approverId,
  ]

  if (directIds.some((id) => id === user.personId)) return true

  return [
    resource.assignee_ids,
    resource.assigneeIds,
    resource.supporter_ids,
    resource.supporterIds,
    resource.reviewer_ids,
    resource.reviewerIds,
    resource.co_owner_ids,
    resource.coOwnerIds,
    resource.watcher_ids,
    resource.watcherIds,
    resource.member_ids,
    resource.memberIds,
  ].some((ids) => Array.isArray(ids) && ids.includes(user.personId as string))
}

function isAssignedReviewer(user: RbacUserContext, resource: RbacResource | null | undefined) {
  if (!user.personId || !resource) return false
  if (resource.reviewer_id === user.personId || resource.reviewerId === user.personId) return true
  if (resource.approver_id === user.personId || resource.approverId === user.personId) return true
  if (Array.isArray(resource.reviewer_ids) && resource.reviewer_ids.includes(user.personId)) return true
  if (Array.isArray(resource.reviewerIds) && resource.reviewerIds.includes(user.personId)) return true
  return false
}

function firstString(...values: Array<string | null | undefined>) {
  return values.find((value): value is string => typeof value === 'string' && value.length > 0) ?? null
}
