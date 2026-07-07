import {
  isLegacyReadOnlyRole,
  normalizeRole,
  type CanonicalRole,
  type WorkspaceRole,
} from './roles'

type QueryError = { message?: string } | null

type QueryResult<T> = Promise<{ data: T | null; error?: QueryError }>

interface QueryBuilder<T = Record<string, unknown>> extends PromiseLike<{ data: T[] | null; error?: QueryError }> {
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
  displayName: string | null
  personId: string | null
  workspaceId: string | null
  role: WorkspaceRole | string | null
  normalizedRole: CanonicalRole | null
  departmentId: string | null
  departmentName: string | null
  managedDepartmentIds: string[]
  status: string | null
  permissionOverrides: RbacPermissionOverride[]
}

export interface RbacPermissionOverride {
  module: string
  scope: string
  actions: {
    view: boolean
    create: boolean
    edit: boolean
    delete: boolean
    approve: boolean
    approve_on_behalf: boolean
    upload: boolean
    export: boolean
  }
}

interface ProfileRecord {
  id: string
  display_name: string | null
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
  full_name: string | null
  department_id: string | null
  status: string | null
}

interface DepartmentRecord {
  id: string
  name?: string | null
}

interface PermissionOverrideRecord {
  module: string
  scope: string | null
  can_view: boolean | null
  can_create: boolean | null
  can_edit: boolean | null
  can_delete: boolean | null
  can_approve: boolean | null
  can_approve_on_behalf: boolean | null
  can_upload: boolean | null
  can_export: boolean | null
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
    .select('id,display_name,status')
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
    .select('id,full_name,department_id,status')
    .eq('workspace_id', membershipResult.data.workspace_id)
    .eq('profile_id', profileResult.data.id)
    .is('deleted_at', null)
    .maybeSingle()

  const role = roleResult.data?.code ?? null
  const person = personResult.data ?? null
  let departmentName: string | null = null
  if (person?.department_id) {
    const departmentResult = await client
      .from<DepartmentRecord>('departments')
      .select('id,name')
      .eq('id', person.department_id)
      .maybeSingle()

    if (!departmentResult.error) departmentName = departmentResult.data?.name ?? null
  }
  const managedDepartmentIds = await getManagedDepartmentIds(client, membershipResult.data.workspace_id, person?.id ?? null)
  const permissionOverrides = await getPermissionOverrides(client, profileResult.data.id)

  return {
    authUserId,
    profileId: profileResult.data.id,
    displayName: person?.full_name ?? profileResult.data.display_name ?? null,
    personId: person?.id ?? null,
    workspaceId: membershipResult.data.workspace_id,
    role,
    normalizedRole: normalizeRole(role),
    departmentId: person?.department_id ?? null,
    departmentName,
    managedDepartmentIds,
    status: person?.status ?? profileResult.data.status ?? null,
    permissionOverrides,
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
  const override = permissionOverrideDecision(user, 'projects', 'view', project)
  if (override !== null) return override
  if (isExecutive(user)) return true
  if (isDepartmentHead(user)) return isSameDepartment(user, project) || isAssignedToResource(user, project)
  return isAssignedToResource(user, project)
}

export function canEditProject(user: RbacUserContext | null | undefined, project: RbacResource | null | undefined) {
  if (!isActiveUser(user) || isReadOnly(user)) return false
  const override = permissionOverrideDecision(user, 'projects', 'edit', project)
  if (override !== null) return override
  if (isAdmin(user) || normalizeUserRole(user) === 'COO') return true
  if (isDepartmentHead(user)) return isSameDepartment(user, project) || isAssignedToResource(user, project)
  return false
}

export function canViewWorkstream(user: RbacUserContext | null | undefined, workstream: RbacResource | null | undefined) {
  if (!isActiveUser(user)) return false
  const override = permissionOverrideDecision(user, 'workstreams', 'view', workstream)
  if (override !== null) return override
  return canViewProject(user, workstream)
}

export function canEditWorkstream(user: RbacUserContext | null | undefined, workstream: RbacResource | null | undefined) {
  if (!isActiveUser(user) || isReadOnly(user)) return false
  const override = permissionOverrideDecision(user, 'workstreams', 'edit', workstream)
  if (override !== null) return override
  return canEditProject(user, workstream)
}

export function canViewSubtask(user: RbacUserContext | null | undefined, subtask: RbacResource | null | undefined) {
  if (!isActiveUser(user)) return false
  const override = permissionOverrideDecision(user, 'subtasks', 'view', subtask)
  if (override !== null) return override
  if (isExecutive(user)) return true
  if (isDepartmentHead(user)) return isSameDepartment(user, subtask) || isAssignedToResource(user, subtask)
  return isAssignedToResource(user, subtask)
}

export function canEditSubtask(user: RbacUserContext | null | undefined, subtask: RbacResource | null | undefined) {
  if (!isActiveUser(user) || isReadOnly(user)) return false
  const override = permissionOverrideDecision(user, 'subtasks', 'edit', subtask)
  if (override !== null) return override
  if (isAdmin(user) || normalizeUserRole(user) === 'COO') return true
  if (isDepartmentHead(user)) return isSameDepartment(user, subtask) || isAssignedToResource(user, subtask)
  return isAssignedToResource(user, subtask)
}

export function canViewStep(user: RbacUserContext | null | undefined, step: RbacResource | null | undefined) {
  if (!isActiveUser(user)) return false
  const override = permissionOverrideDecision(user, 'steps', 'view', step)
  if (override !== null) return override
  return canViewSubtask(user, step)
}

export function canEditStep(user: RbacUserContext | null | undefined, step: RbacResource | null | undefined) {
  if (!isActiveUser(user) || isReadOnly(user)) return false
  const override = permissionOverrideDecision(user, 'steps', 'edit', step)
  if (override !== null) return override
  return canEditSubtask(user, step)
}

export function canApproveDeliverable(user: RbacUserContext | null | undefined, deliverable: RbacResource | null | undefined) {
  if (!isActiveUser(user) || isReadOnly(user)) return false
  if (isAssignedReviewer(user, deliverable)) return true
  if (canApproveOnBehalf(user, deliverable)) return true
  const override = permissionOverrideDecision(user, 'approvals', 'approve', deliverable)
  if (override !== null) return override
  if (isAdmin(user) || normalizeUserRole(user) === 'COO') return true
  if (normalizeUserRole(user) === 'CEO') return true
  if (isDepartmentHead(user)) return isSameDepartment(user, deliverable)
  return false
}

export function canApproveOnBehalf(user: RbacUserContext | null | undefined, deliverable: RbacResource | null | undefined) {
  if (!isActiveUser(user) || isReadOnly(user)) return false
  const override = permissionOverrideDecision(user, 'approvals', 'approve_on_behalf', deliverable)
  if (override !== null) return override
  const role = normalizeUserRole(user)
  return role === 'ADMIN' || role === 'COO' || role === 'CEO'
}

export function canViewReports(user: RbacUserContext | null | undefined) {
  if (!isActiveUser(user)) return false
  const override = permissionOverrideDecision(user, 'reports', 'view')
  if (override !== null) return override
  return isExecutive(user) || isDepartmentHead(user)
}

export function canViewTeamWorkload(user: RbacUserContext | null | undefined) {
  if (!isActiveUser(user)) return false
  const override = permissionOverrideDecision(user, 'reports', 'view')
  if (override !== null) return override
  return isExecutive(user) || isDepartmentHead(user)
}

export function canViewFileLibrary(user: RbacUserContext | null | undefined, file: RbacResource | null | undefined) {
  if (!isActiveUser(user)) return false
  const override = permissionOverrideDecision(user, 'file_library', 'view', file)
  if (override !== null) return override
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

async function getPermissionOverrides(client: RbacClient, profileId: string) {
  try {
    const result = await client
      .from<PermissionOverrideRecord>('user_permission_overrides')
      .select('module,scope,can_view,can_create,can_edit,can_delete,can_approve,can_approve_on_behalf,can_upload,can_export')
      .eq('profile_id', profileId)
      .eq('is_enabled', true)

    if (result.error || !Array.isArray(result.data)) return []
    return result.data.map((row) => ({
      module: row.module,
      scope: row.scope ?? 'none',
      actions: {
        view: row.can_view === true,
        create: row.can_create === true,
        edit: row.can_edit === true,
        delete: row.can_delete === true,
        approve: row.can_approve === true,
        approve_on_behalf: row.can_approve_on_behalf === true,
        upload: row.can_upload === true,
        export: row.can_export === true,
      },
    }))
  } catch {
    return []
  }
}

function permissionOverrideDecision(
  user: RbacUserContext | null | undefined,
  module: string,
  action: keyof RbacPermissionOverride['actions'],
  resource?: RbacResource | null,
) {
  if (!user) return null
  if (isAdmin(user)) return true
  const row = user.permissionOverrides.find((permission) => permission.module === module)
  if (!row) return null
  if (!row.actions[action]) return false
  return scopeAllows(user, row.scope, resource)
}

function scopeAllows(user: RbacUserContext, scope: string, resource?: RbacResource | null) {
  if (scope === 'company') return true
  if (scope === 'department') return resource ? isSameDepartment(user, resource) : Boolean(user.departmentId)
  if (scope === 'own' || scope === 'assigned_projects') return resource ? isAssignedToResource(user, resource) : Boolean(user.personId)
  return false
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
