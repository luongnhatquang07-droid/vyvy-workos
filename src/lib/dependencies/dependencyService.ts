import 'server-only'

import type { SubtaskDependencyRow, TaskRow } from '@/lib/database.types'
import { createClient } from '@/lib/supabase/server'
import {
  resolveRbacUserContext,
  type RbacClient,
  type RbacContextFailureStage,
  type RbacUserContext,
} from '@/lib/rbac/permissions'
import { canEditWorkspaceEntity } from '@/lib/rbac/workspaceResourceAccess'
import {
  addDependencyRpcArgs,
  computeSubtaskState as computeDependencyState,
  deleteDependencyRpcArgs,
  getDependencyErrorDescriptor,
  replaceDependenciesRpcArgs,
} from './dependencyCore'
import type {
  ComputedSubtaskState,
  DependencyErrorDescriptor,
  SubtaskDependencyEdge,
} from './types'

export { computeSubtaskState } from './dependencyCore'
export type { ComputedSubtaskState, SubtaskDependencyEdge } from './types'

type SessionClient = Awaited<ReturnType<typeof createClient>>
type DependencyTask = Pick<
  TaskRow,
  'id' | 'workspace_id' | 'project_id' | 'title' | 'status' | 'deleted_at'
>

interface DependencyRequestContext {
  client: SessionClient
  workspaceId: string
  actor: RbacUserContext
}

const EDGE_SELECT = [
  'id',
  'workspace_id',
  'project_id',
  'from_subtask_id',
  'to_subtask_id',
  'created_at',
  'created_by',
].join(',')

export class DependencyServiceError extends Error {
  readonly code: string
  readonly status: number

  constructor(message: string, status: number, code: string) {
    super(message)
    this.name = 'DependencyServiceError'
    this.status = status
    this.code = code
  }
}

export async function createDependency(fromSubtaskId: string, toSubtaskId: string) {
  const context = await getDependencyRequestContext()
  if (fromSubtaskId === toSubtaskId) throwDescriptor(getDependencyErrorDescriptor('DP004'))

  const dependent = await loadEditableDependent(context, toSubtaskId)
  await assertPrerequisiteInProject(context, fromSubtaskId, dependent.project_id as string)

  // Keep the authenticated cookie client here. The SECURITY DEFINER RPC uses
  // auth.uid(); calling it with a service-role client would lose the actor.
  const result = await context.client.rpc(
    'add_subtask_dependency',
    addDependencyRpcArgs(fromSubtaskId, toSubtaskId),
  )
  if (result.error) throwMappedDatabaseError(result.error)
  if (typeof result.data !== 'string') throwMappedDatabaseError(null)
  return { edgeId: result.data }
}

export async function deleteDependency(dependentSubtaskId: string, edgeId: string) {
  const context = await getDependencyRequestContext()
  const result = await context.client
    .from('subtask_dependencies')
    .select(`${EDGE_SELECT},deleted_at,deleted_by`)
    .eq('workspace_id', context.workspaceId)
    .eq('id', edgeId)
    .is('deleted_at', null)
    .maybeSingle()
  if (result.error) throwMappedDatabaseError(result.error)

  const edge = result.data as SubtaskDependencyRow | null
  if (edge && edge.to_subtask_id !== dependentSubtaskId) {
    throwDescriptor(getDependencyErrorDescriptor('DP006'))
  }
  if (edge) await assertProjectEdit(context, edge.project_id)

  // A1b treats an already-retired edge as an authorized no-op. RLS hides that
  // retired row, so a missing active read must still reach the RPC. Active rows
  // retain the URL-dependent cross-check above.
  const rpcResult = await context.client.rpc(
    'delete_subtask_dependency',
    deleteDependencyRpcArgs(edgeId),
  )
  if (rpcResult.error) throwMappedDatabaseError(rpcResult.error)
}

export async function replaceDependencies(
  dependentSubtaskId: string,
  prerequisiteSubtaskIds: readonly string[],
) {
  const context = await getDependencyRequestContext()
  if (prerequisiteSubtaskIds.length > 20) throwDescriptor(getDependencyErrorDescriptor('DP002'))
  if (new Set(prerequisiteSubtaskIds).size !== prerequisiteSubtaskIds.length) {
    throwDescriptor(getDependencyErrorDescriptor('DP005'))
  }
  if (prerequisiteSubtaskIds.includes(dependentSubtaskId)) {
    throwDescriptor(getDependencyErrorDescriptor('DP004'))
  }

  const dependent = await loadEditableDependent(context, dependentSubtaskId)
  if (prerequisiteSubtaskIds.length) {
    const prerequisites = await loadActiveTasks(context, prerequisiteSubtaskIds)
    if (prerequisites.length !== prerequisiteSubtaskIds.length) {
      throwDescriptor(getDependencyErrorDescriptor('DP007'))
    }
    if (prerequisites.some((task) => task.project_id !== dependent.project_id)) {
      throwDescriptor(getDependencyErrorDescriptor('DP003'))
    }
  }

  const result = await context.client.rpc(
    'replace_subtask_dependencies',
    replaceDependenciesRpcArgs(dependentSubtaskId, prerequisiteSubtaskIds),
  )
  if (result.error) throwMappedDatabaseError(result.error)
  if (!Array.isArray(result.data) || result.data.some((id) => typeof id !== 'string')) {
    throwMappedDatabaseError(null)
  }
  return { edgeIds: result.data as string[] }
}

export async function listForProject(projectId: string): Promise<SubtaskDependencyEdge[]> {
  const context = await getDependencyRequestContext()
  await assertReadableProject(context, projectId)
  return listProjectEdges(context, projectId)
}

export async function listForSubtask(subtaskId: string) {
  const context = await getDependencyRequestContext()
  await assertReadableSubtask(context, subtaskId)
  return listSubtaskEdges(context, subtaskId)
}

export async function getSubtaskDependencyState(subtaskId: string): Promise<ComputedSubtaskState> {
  const context = await getDependencyRequestContext()
  await assertReadableSubtask(context, subtaskId)
  const { prerequisites } = await listSubtaskEdges(context, subtaskId)
  const prerequisiteIds = Array.from(new Set(prerequisites.map((edge) => edge.from_subtask_id)))
  if (!prerequisiteIds.length) return computeDependencyState([], [])

  const result = await context.client
    .from('tasks')
    .select('id,title,status,deleted_at')
    .eq('workspace_id', context.workspaceId)
    .in('id', prerequisiteIds)
  if (result.error) throwMappedDatabaseError(result.error)

  const snapshots = (result.data ?? []).map((task) => ({
    id: String(task.id),
    title: String(task.title ?? ''),
    status: String(task.status ?? ''),
    deleted_at: task.deleted_at ? String(task.deleted_at) : null,
  }))
  return computeDependencyState(prerequisites, snapshots)
}

async function getDependencyRequestContext(): Promise<DependencyRequestContext> {
  const client = await createClient()
  const resolution = await resolveRbacUserContext(client as unknown as RbacClient)
  if (!resolution.ok) throwContextFailure(resolution.stage)
  if (!resolution.context.workspaceId) {
    throw new DependencyServiceError(
      'Tài khoản chưa được gắn workspace.',
      403,
      'DEPENDENCY_WORKSPACE_REQUIRED',
    )
  }
  return {
    client,
    workspaceId: resolution.context.workspaceId,
    actor: resolution.context,
  }
}

async function loadEditableDependent(context: DependencyRequestContext, subtaskId: string) {
  const result = await context.client
    .from('tasks')
    .select('id,workspace_id,project_id,title,status,deleted_at')
    .eq('workspace_id', context.workspaceId)
    .eq('id', subtaskId)
    .maybeSingle()
  if (result.error) throwMappedDatabaseError(result.error)

  const task = result.data as DependencyTask | null
  // Match the RPC's fail-closed behavior: without a visible dependent project,
  // project.edit cannot be proven and endpoint existence is not disclosed.
  if (!task?.project_id) throwDescriptor(getDependencyErrorDescriptor('DP008'))
  await assertProjectEdit(context, task.project_id)
  if (task.deleted_at) throwDescriptor(getDependencyErrorDescriptor('DP007'))
  return task
}

async function assertPrerequisiteInProject(
  context: DependencyRequestContext,
  prerequisiteSubtaskId: string,
  projectId: string,
) {
  const tasks = await loadActiveTasks(context, [prerequisiteSubtaskId])
  if (!tasks.length) throwDescriptor(getDependencyErrorDescriptor('DP007'))
  if (tasks[0]?.project_id !== projectId) throwDescriptor(getDependencyErrorDescriptor('DP003'))
}

async function loadActiveTasks(context: DependencyRequestContext, ids: readonly string[]) {
  const result = await context.client
    .from('tasks')
    .select('id,workspace_id,project_id,title,status,deleted_at')
    .eq('workspace_id', context.workspaceId)
    .in('id', [...ids])
    .is('deleted_at', null)
  if (result.error) throwMappedDatabaseError(result.error)
  return (result.data ?? []) as DependencyTask[]
}

async function assertProjectEdit(context: DependencyRequestContext, projectId: string) {
  const allowed = await canEditWorkspaceEntity(
    context.actor,
    context.workspaceId,
    'project',
    projectId,
  )
  if (!allowed) throwDescriptor(getDependencyErrorDescriptor('DP008'))
}

async function assertReadableProject(context: DependencyRequestContext, projectId: string) {
  const result = await context.client
    .from('projects')
    .select('id')
    .eq('workspace_id', context.workspaceId)
    .eq('id', projectId)
    .is('deleted_at', null)
    .maybeSingle()
  if (result.error) throwMappedDatabaseError(result.error)
  if (!result.data) {
    throw new DependencyServiceError(
      'Không tìm thấy dự án hoặc bạn không có quyền xem dự án này.',
      404,
      'DEPENDENCY_PROJECT_NOT_FOUND',
    )
  }
}

async function assertReadableSubtask(context: DependencyRequestContext, subtaskId: string) {
  const result = await context.client
    .from('tasks')
    .select('id')
    .eq('workspace_id', context.workspaceId)
    .eq('id', subtaskId)
    .is('deleted_at', null)
    .maybeSingle()
  if (result.error) throwMappedDatabaseError(result.error)
  if (!result.data) {
    throw new DependencyServiceError(
      'Không tìm thấy đầu việc con hoặc bạn không có quyền xem đầu việc này.',
      404,
      'DEPENDENCY_SUBTASK_NOT_FOUND',
    )
  }
}

async function listProjectEdges(context: DependencyRequestContext, projectId: string) {
  const result = await context.client
    .from('subtask_dependencies')
    .select(EDGE_SELECT)
    .eq('workspace_id', context.workspaceId)
    .eq('project_id', projectId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
  if (result.error) throwMappedDatabaseError(result.error)
  return (result.data ?? []) as unknown as SubtaskDependencyEdge[]
}

async function listSubtaskEdges(context: DependencyRequestContext, subtaskId: string) {
  const baseQuery = () => context.client
    .from('subtask_dependencies')
    .select(EDGE_SELECT)
    .eq('workspace_id', context.workspaceId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
  const [prerequisiteResult, dependentResult] = await Promise.all([
    baseQuery().eq('to_subtask_id', subtaskId),
    baseQuery().eq('from_subtask_id', subtaskId),
  ])
  if (prerequisiteResult.error) throwMappedDatabaseError(prerequisiteResult.error)
  if (dependentResult.error) throwMappedDatabaseError(dependentResult.error)
  return {
    prerequisites: (prerequisiteResult.data ?? []) as unknown as SubtaskDependencyEdge[],
    dependents: (dependentResult.data ?? []) as unknown as SubtaskDependencyEdge[],
  }
}

function throwContextFailure(stage: RbacContextFailureStage): never {
  const errors: Record<RbacContextFailureStage, DependencyServiceError> = {
    unauthenticated: new DependencyServiceError(
      'Bạn cần đăng nhập để quản lý quan hệ phụ thuộc.',
      401,
      'DEPENDENCY_UNAUTHENTICATED',
    ),
    profile_error: new DependencyServiceError(
      'Không đọc được hồ sơ đăng nhập. Vui lòng thử lại.',
      500,
      'DEPENDENCY_PROFILE_ERROR',
    ),
    no_profile: new DependencyServiceError(
      'Tài khoản chưa có profile trong workspace.',
      403,
      'DEPENDENCY_PROFILE_REQUIRED',
    ),
    membership_error: new DependencyServiceError(
      'Không đọc được quyền workspace. Vui lòng thử lại.',
      500,
      'DEPENDENCY_MEMBERSHIP_ERROR',
    ),
    no_membership: new DependencyServiceError(
      'Tài khoản chưa được gắn workspace.',
      403,
      'DEPENDENCY_MEMBERSHIP_REQUIRED',
    ),
    workspace_mismatch: new DependencyServiceError(
      'Bạn không có quyền truy cập workspace này.',
      403,
      'DEPENDENCY_WORKSPACE_MISMATCH',
    ),
  }
  throw errors[stage]
}

function throwMappedDatabaseError(error: unknown): never {
  throwDescriptor(getDependencyErrorDescriptor(error))
}

function throwDescriptor(descriptor: DependencyErrorDescriptor): never {
  throw new DependencyServiceError(descriptor.message, descriptor.status, descriptor.code)
}
