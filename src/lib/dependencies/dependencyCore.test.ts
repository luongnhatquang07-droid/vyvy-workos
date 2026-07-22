import { describe, expect, it } from 'vitest'

import {
  addDependencyRpcArgs,
  computeSubtaskState,
  deleteDependencyRpcArgs,
  getDependencyErrorDescriptor,
  replaceDependenciesRpcArgs,
  wouldCreateDependencyCycle,
} from './dependencyCore'
import { DEPENDENCY_ERROR_CODES, type SubtaskDependencyEdge } from './types'

type EdgeDirection = Pick<SubtaskDependencyEdge, 'from_subtask_id' | 'to_subtask_id'>

function edge(from: string, to: string): EdgeDirection {
  return { from_subtask_id: from, to_subtask_id: to }
}

describe('wouldCreateDependencyCycle', () => {
  it('rejects a self dependency', () => {
    expect(wouldCreateDependencyCycle([], 'A', 'A')).toBe(true)
  })

  it('detects direct and transitive cycles in prerequisite-to-dependent direction', () => {
    expect(wouldCreateDependencyCycle([edge('A', 'B')], 'B', 'A')).toBe(true)
    expect(wouldCreateDependencyCycle([edge('A', 'B'), edge('B', 'C')], 'C', 'A')).toBe(true)
  })

  it('allows a forward edge and ignores disconnected components', () => {
    const edges = [edge('A', 'B'), edge('X', 'Y')]
    expect(wouldCreateDependencyCycle(edges, 'B', 'C')).toBe(false)
    expect(wouldCreateDependencyCycle(edges, 'Y', 'A')).toBe(false)
  })

  it('handles duplicate graph input without looping', () => {
    const edges = [edge('A', 'B'), edge('A', 'B'), edge('B', 'C')]
    expect(wouldCreateDependencyCycle(edges, 'C', 'A')).toBe(true)
  })
})

describe('computeSubtaskState', () => {
  it('returns ready when no prerequisite exists', () => {
    expect(computeSubtaskState([], [])).toEqual({
      state: 'ready',
      total: 0,
      completed: 0,
      incomplete: [],
    })
  })

  it('returns ready only when every unique prerequisite is completed', () => {
    const result = computeSubtaskState(
      [edge('A', 'TARGET'), edge('A', 'TARGET'), edge('B', 'TARGET')],
      [
        { id: 'A', title: 'A', status: 'COMPLETED' },
        { id: 'B', title: 'B', status: 'COMPLETED' },
      ],
    )
    expect(result).toEqual({ state: 'ready', total: 2, completed: 2, incomplete: [] })
  })

  it('returns waiting for active, cancelled, missing, or deleted prerequisites', () => {
    const result = computeSubtaskState(
      [
        edge('A', 'TARGET'),
        edge('B', 'TARGET'),
        edge('C', 'TARGET'),
        edge('D', 'TARGET'),
        edge('E', 'TARGET'),
      ],
      [
        { id: 'A', title: 'Done', status: 'COMPLETED' },
        { id: 'B', title: 'Doing', status: 'IN_PROGRESS' },
        { id: 'C', title: 'Cancelled', status: 'CANCELLED' },
        { id: 'D', title: 'Deleted', status: 'COMPLETED', deleted_at: '2026-07-22T00:00:00Z' },
      ],
    )
    expect(result.state).toBe('waiting')
    expect(result.total).toBe(5)
    expect(result.completed).toBe(1)
    expect(result.incomplete).toEqual([
      { id: 'B', title: 'Doing', status: 'IN_PROGRESS', missing: false },
      { id: 'C', title: 'Cancelled', status: 'CANCELLED', missing: false },
      { id: 'D', title: 'Deleted', status: 'COMPLETED', missing: true },
      { id: 'E', title: 'Đầu việc không còn khả dụng', status: null, missing: true },
    ])
  })
})

describe('getDependencyErrorDescriptor', () => {
  it('maps every stable PostgreSQL dependency SQLSTATE', () => {
    const expectedStatuses = [409, 400, 400, 400, 409, 404, 404, 403]
    DEPENDENCY_ERROR_CODES.forEach((code, index) => {
      const descriptor = getDependencyErrorDescriptor({ code })
      expect(descriptor.code).toBe(code)
      expect(descriptor.status).toBe(expectedStatuses[index])
      expect(descriptor.message.length).toBeGreaterThan(10)
    })
  })

  it('does not expose an unknown raw database error', () => {
    const descriptor = getDependencyErrorDescriptor({ code: 'XX000', message: 'sensitive raw detail' })
    expect(descriptor).toEqual({
      code: 'DEPENDENCY_UNKNOWN',
      message: 'Không thể xử lý quan hệ phụ thuộc. Vui lòng thử lại.',
      status: 500,
    })
    expect(descriptor.message).not.toContain('sensitive')
  })
})

describe('dependency RPC argument contracts', () => {
  it('uses the exact PostgreSQL parameter names', () => {
    expect(addDependencyRpcArgs('FROM', 'TO')).toEqual({ from_id: 'FROM', to_id: 'TO' })
    expect(deleteDependencyRpcArgs('EDGE')).toEqual({ edge_id: 'EDGE' })
    expect(replaceDependenciesRpcArgs('TO', ['A', 'B'])).toEqual({
      dependent_id: 'TO',
      new_prerequisite_ids: ['A', 'B'],
    })
  })
})
