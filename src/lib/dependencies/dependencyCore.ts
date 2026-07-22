import {
  DEPENDENCY_ERROR_CODES,
  type ComputedSubtaskState,
  type DependencyEndpointSnapshot,
  type DependencyErrorCode,
  type DependencyErrorDescriptor,
  type SubtaskDependencyEdge,
} from './types'

type DependencyDirection = Pick<SubtaskDependencyEdge, 'from_subtask_id' | 'to_subtask_id'>

const ERROR_DESCRIPTORS: Record<DependencyErrorCode, DependencyErrorDescriptor> = {
  DP001: {
    code: 'DP001',
    message: 'Không thể thêm phụ thuộc vì quan hệ này sẽ tạo vòng lặp giữa các đầu việc.',
    status: 409,
  },
  DP002: {
    code: 'DP002',
    message: 'Mỗi đầu việc con chỉ được có tối đa 20 phụ thuộc.',
    status: 400,
  },
  DP003: {
    code: 'DP003',
    message: 'Chỉ có thể tạo phụ thuộc giữa các đầu việc con trong cùng dự án.',
    status: 400,
  },
  DP004: {
    code: 'DP004',
    message: 'Đầu việc con không thể phụ thuộc vào chính nó.',
    status: 400,
  },
  DP005: {
    code: 'DP005',
    message: 'Quan hệ phụ thuộc này đã tồn tại hoặc danh sách có đầu việc trùng lặp.',
    status: 409,
  },
  DP006: {
    code: 'DP006',
    message: 'Không tìm thấy quan hệ phụ thuộc cần xóa.',
    status: 404,
  },
  DP007: {
    code: 'DP007',
    message: 'Không tìm thấy đầu việc con hợp lệ hoặc đầu việc đã bị xóa.',
    status: 404,
  },
  DP008: {
    code: 'DP008',
    message: 'Bạn không có quyền chỉnh sửa phụ thuộc của dự án này.',
    status: 403,
  },
}

const UNKNOWN_ERROR: DependencyErrorDescriptor = {
  code: 'DEPENDENCY_UNKNOWN',
  message: 'Không thể xử lý quan hệ phụ thuộc. Vui lòng thử lại.',
  status: 500,
}

/**
 * Client-side prediction only. PostgreSQL RPC cycle detection and its project
 * advisory lock remain authoritative for every mutation.
 */
export function wouldCreateDependencyCycle(
  edges: readonly DependencyDirection[],
  prerequisiteSubtaskId: string,
  dependentSubtaskId: string,
) {
  if (prerequisiteSubtaskId === dependentSubtaskId) return true

  const outgoing = new Map<string, Set<string>>()
  for (const edge of edges) {
    const targets = outgoing.get(edge.from_subtask_id) ?? new Set<string>()
    targets.add(edge.to_subtask_id)
    outgoing.set(edge.from_subtask_id, targets)
  }

  const queue = [dependentSubtaskId]
  const visited = new Set<string>()
  while (queue.length) {
    const current = queue.shift()
    if (!current || visited.has(current)) continue
    if (current === prerequisiteSubtaskId) return true
    visited.add(current)
    for (const next of outgoing.get(current) ?? []) {
      if (!visited.has(next)) queue.push(next)
    }
  }

  return false
}

export function computeSubtaskState(
  incomingEdges: readonly Pick<SubtaskDependencyEdge, 'from_subtask_id' | 'to_subtask_id'>[],
  endpointSnapshots: ReadonlyMap<string, DependencyEndpointSnapshot> | readonly DependencyEndpointSnapshot[],
): ComputedSubtaskState {
  const endpoints = Array.isArray(endpointSnapshots)
    ? new Map(
        (endpointSnapshots as readonly DependencyEndpointSnapshot[])
          .map((endpoint) => [endpoint.id, endpoint]),
      )
    : endpointSnapshots as ReadonlyMap<string, DependencyEndpointSnapshot>
  const prerequisiteIds = Array.from(new Set(incomingEdges.map((edge) => edge.from_subtask_id)))
  const incomplete: ComputedSubtaskState['incomplete'] = []
  let completed = 0

  for (const id of prerequisiteIds) {
    const endpoint = endpoints.get(id)
    if (endpoint && !endpoint.deleted_at && endpoint.status === 'COMPLETED') {
      completed += 1
      continue
    }
    incomplete.push({
      id,
      title: endpoint?.title || 'Đầu việc không còn khả dụng',
      status: endpoint?.status ?? null,
      missing: !endpoint || Boolean(endpoint.deleted_at),
    })
  }

  return {
    state: incomplete.length === 0 ? 'ready' : 'waiting',
    total: prerequisiteIds.length,
    completed,
    incomplete,
  }
}

export function getDependencyErrorDescriptor(errorOrCode: unknown): DependencyErrorDescriptor {
  const code = extractErrorCode(errorOrCode)
  return code ? ERROR_DESCRIPTORS[code] : UNKNOWN_ERROR
}

export function addDependencyRpcArgs(fromSubtaskId: string, toSubtaskId: string) {
  return { from_id: fromSubtaskId, to_id: toSubtaskId }
}

export function deleteDependencyRpcArgs(edgeId: string) {
  return { edge_id: edgeId }
}

export function replaceDependenciesRpcArgs(
  dependentSubtaskId: string,
  prerequisiteSubtaskIds: readonly string[],
) {
  return {
    dependent_id: dependentSubtaskId,
    new_prerequisite_ids: [...prerequisiteSubtaskIds],
  }
}

function extractErrorCode(value: unknown): DependencyErrorCode | null {
  const candidate = typeof value === 'string'
    ? value
    : typeof value === 'object' && value && 'code' in value
      ? String(value.code)
      : ''
  return (DEPENDENCY_ERROR_CODES as readonly string[]).includes(candidate)
    ? candidate as DependencyErrorCode
    : null
}
