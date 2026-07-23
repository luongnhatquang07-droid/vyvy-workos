import { describe, expect, it } from 'vitest'

import {
  isTaskStatus,
  normalizeTaskStatusForAssignment,
  type TaskAssignmentStatusInput,
} from './taskStatusService'

function normalize(input: TaskAssignmentStatusInput) {
  return normalizeTaskStatusForAssignment(input)
}

describe('normalizeTaskStatusForAssignment', () => {
  it('keeps UNASSIGNED when both owner and deadline are missing', () => {
    expect(normalize({ status: 'UNASSIGNED', ownerId: null, dueDate: null })).toBe('UNASSIGNED')
  })

  it('keeps UNASSIGNED when only the owner exists', () => {
    expect(normalize({ status: 'UNASSIGNED', ownerId: 'person-1', dueDate: null })).toBe('UNASSIGNED')
  })

  it('keeps UNASSIGNED when only the deadline exists', () => {
    expect(normalize({ status: 'UNASSIGNED', ownerId: null, dueDate: '2026-07-30' })).toBe('UNASSIGNED')
  })

  it('moves UNASSIGNED to NOT_STARTED when owner and deadline both exist', () => {
    expect(normalize({
      status: 'UNASSIGNED',
      ownerId: 'person-1',
      dueDate: '2026-07-30',
    })).toBe('NOT_STARTED')
  })

  it('does not change a non-UNASSIGNED active status', () => {
    expect(normalize({ status: 'IN_PROGRESS', ownerId: null, dueDate: null })).toBe('IN_PROGRESS')
  })

  it('does not revert COMPLETED when assignment data becomes incomplete', () => {
    expect(normalize({ status: 'COMPLETED', ownerId: null, dueDate: '2026-07-30' })).toBe('COMPLETED')
  })

  it('treats whitespace-only assignment values as missing and validates exact enum casing', () => {
    expect(normalize({ status: 'UNASSIGNED', ownerId: '   ', dueDate: '2026-07-30' })).toBe('UNASSIGNED')
    expect(isTaskStatus('UNASSIGNED')).toBe(true)
    expect(isTaskStatus('unassigned')).toBe(false)
  })
})
