import { describe, expect, it } from 'vitest'

import {
  buildDeadlineRollups,
  resolveTaskDeadlineAfterRollup,
  type DeadlineStep,
  type DeadlineTask,
  type DeadlineWorkstream,
} from './deadlineRollup'

const project = {
  id: 'project-1',
  due_date: null,
  status: 'IN_PROGRESS',
}

const workstream: DeadlineWorkstream = {
  id: 'workstream-1',
  project_id: project.id,
  due_date: null,
  status: 'IN_PROGRESS',
}

function task(overrides: Partial<DeadlineTask>): DeadlineTask {
  return {
    id: 'task-1',
    project_id: project.id,
    workstream_id: workstream.id,
    due_date: null,
    status: 'NOT_STARTED',
    ...overrides,
  }
}

function step(dueDate: string): DeadlineStep {
  return {
    id: 'step-1',
    task_id: 'task-1',
    due_date: dueDate,
    status: 'NOT_STARTED',
  }
}

function rollup(taskRow: DeadlineTask, stepRow: DeadlineStep) {
  return buildDeadlineRollups({
    projects: [project],
    workstreams: [workstream],
    subtasks: [taskRow],
    steps: [stepRow],
  })
}

describe('resolveTaskDeadlineAfterRollup', () => {
  it('keeps an UNASSIGNED task deadline null while preserving parent rollups', () => {
    const taskRow = task({ status: 'UNASSIGNED', due_date: null })
    const result = rollup(taskRow, step('2026-08-10'))

    expect(resolveTaskDeadlineAfterRollup(taskRow, result.taskDeadlines.get(taskRow.id))).toBeNull()
    expect(result.workstreamDeadlines.get(workstream.id)).toBe('2026-08-10')
    expect(result.projectDeadlines.get(project.id)).toBe('2026-08-10')
  })

  it('keeps rolling a child deadline into a NOT_STARTED task without its own deadline', () => {
    const taskRow = task({ status: 'NOT_STARTED', due_date: null })
    const result = rollup(taskRow, step('2026-08-10'))

    expect(resolveTaskDeadlineAfterRollup(taskRow, result.taskDeadlines.get(taskRow.id))).toBe('2026-08-10')
  })

  it('keeps the existing max-deadline rollup for a planned task with its own deadline', () => {
    const taskRow = task({ status: 'NOT_STARTED', due_date: '2026-08-05' })
    const result = rollup(taskRow, step('2026-08-10'))

    expect(resolveTaskDeadlineAfterRollup(taskRow, result.taskDeadlines.get(taskRow.id))).toBe('2026-08-10')
  })
})
