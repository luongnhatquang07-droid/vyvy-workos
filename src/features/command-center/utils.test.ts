import { describe, expect, it } from 'vitest'

import type { Task } from './types'
import { computeKPI } from './utils'

function makeTask(id: string, status: Task['status']): Task {
  return {
    id,
    title: `Task ${id}`,
    ownerId: '',
    dueDate: '',
    status,
    urgency: 'LOW',
    kind: 'IMPORT',
    futureRoute: `/projects?task=${id}`,
  }
}

describe('computeKPI', () => {
  it('counts only tasks whose exact status is UNASSIGNED', () => {
    const tasks = [
      makeTask('unassigned-1', 'UNASSIGNED'),
      makeTask('unassigned-2', 'UNASSIGNED'),
      makeTask('planned', 'NOT_STARTED'),
      makeTask('completed', 'COMPLETED'),
    ]

    expect(computeKPI([], tasks, [], [], []).unassignedTasks).toBe(2)
  })

  it('returns zero when visible tasks contain no UNASSIGNED item', () => {
    const tasks = [
      makeTask('planned', 'NOT_STARTED'),
      makeTask('in-progress', 'IN_PROGRESS'),
    ]

    expect(computeKPI([], tasks, [], [], []).unassignedTasks).toBe(0)
  })
})
