import { describe, expect, it } from 'vitest'

import type { TimelineFilters, TimelineTask } from './types'
import {
  filterTimelineTasks,
  formatTimelineDate,
  getDropSchedule,
  getTimelineScale,
  getTimelineToday,
  isTimelineDateKey,
  isUnscheduled,
  mapTimelineStatus,
  matchesTimelineFilters,
  shiftTimelineDate,
  timelineDateDiff,
  toggleTimelineCompletion,
  validateTimelineSchedule,
  willUseUnassignedCompletionBypass,
} from './timelineUtils'

function makeTask(patch: Partial<TimelineTask> = {}): TimelineTask {
  return {
    id: 'task-1',
    title: 'Đầu việc timeline',
    description: null,
    ownerId: 'owner-1',
    ownerName: 'Vũ',
    workstreamId: 'workstream-6',
    workstreamName: 'Mục 6',
    startDate: null,
    dueDate: null,
    status: 'NOT_STARTED',
    steps: [],
    canEdit: true,
    ...patch,
  }
}

const ALL_FILTERS: TimelineFilters = {
  ownerId: 'all',
  workstreamId: 'all',
  status: 'all',
}

describe('timeline ISO date math', () => {
  it('validates real ISO calendar dates instead of accepting normalized overflow', () => {
    expect(isTimelineDateKey('2026-02-28')).toBe(true)
    expect(isTimelineDateKey('2026-02-29')).toBe(false)
    expect(isTimelineDateKey('2026-13-01')).toBe(false)
    expect(isTimelineDateKey('28/02/2026')).toBe(false)
  })

  it('shifts across month and leap-day boundaries in UTC', () => {
    expect(shiftTimelineDate('2028-02-28', 1)).toBe('2028-02-29')
    expect(shiftTimelineDate('2028-02-29', 1)).toBe('2028-03-01')
    expect(shiftTimelineDate('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('is stable when formatting a Date with a non-midnight timestamp', () => {
    expect(formatTimelineDate(new Date('2026-07-24T23:59:59.999Z'))).toBe('2026-07-24')
    expect(timelineDateDiff('2026-07-24', '2026-08-02')).toBe(9)
  })

  it('uses the Vietnam calendar day for the default timeline date', () => {
    expect(getTimelineToday(new Date('2026-07-24T16:59:59.000Z'))).toBe('2026-07-24')
    expect(getTimelineToday(new Date('2026-07-24T17:00:00.000Z'))).toBe('2026-07-25')
  })
})

describe('timeline schedule rules', () => {
  it('treats exactly two null dates as an unscheduled valid task', () => {
    const task = makeTask()
    expect(isUnscheduled(task)).toBe(true)
    expect(validateTimelineSchedule(task.startDate, task.dueDate)).toEqual({
      valid: true,
      reason: null,
    })
  })

  it('rejects a partial schedule', () => {
    expect(isUnscheduled(makeTask({ startDate: '2026-07-24' }))).toBe(true)
    expect(isUnscheduled(makeTask({ dueDate: '2026-07-24' }))).toBe(true)
    expect(validateTimelineSchedule('2026-07-24', null)).toEqual({
      valid: false,
      reason: 'PARTIAL_SCHEDULE',
    })
    expect(validateTimelineSchedule(null, '2026-07-24')).toEqual({
      valid: false,
      reason: 'PARTIAL_SCHEDULE',
    })
  })

  it('rejects invalid dates and a reversed range', () => {
    expect(validateTimelineSchedule('2026-02-30', '2026-03-01').reason).toBe('INVALID_START_DATE')
    expect(validateTimelineSchedule('2026-03-01', '2026-02-30').reason).toBe('INVALID_DUE_DATE')
    expect(validateTimelineSchedule('2026-07-25', '2026-07-24').reason).toBe('INVALID_RANGE')
  })

  it('assigns a dropped task to exactly one target day for both zoom levels', () => {
    const task = makeTask()
    expect(getDropSchedule(task, '2026-07-27', 'day')).toEqual({
      startDate: '2026-07-27',
      dueDate: '2026-07-27',
    })
    expect(getDropSchedule(task, '2026-07-27', 'week')).toEqual({
      startDate: '2026-07-27',
      dueDate: '2026-07-27',
    })
  })
})

describe('timeline scale generation', () => {
  it('builds a usable day horizon, includes task dates, and marks today', () => {
    const task = makeTask({ startDate: '2026-07-22', dueDate: '2026-07-24' })
    const scale = getTimelineScale([task], 'day', '2026-07-23')

    expect(scale.columns).toHaveLength(31)
    expect(scale.columns[0].key).toBe('2026-07-20')
    expect(scale.columns.at(-1)?.key).toBe('2026-08-19')
    expect(scale.columns.some((column) => column.key === '2026-07-22')).toBe(true)
    expect(scale.cellWidth).toBe(72)
    expect(scale.timelineWidth).toBe(2232)
    expect(scale.todayColumnIndex).toBe(3)
  })

  it('builds Monday-to-Sunday week columns across a year boundary', () => {
    const task = makeTask({ startDate: '2026-12-31', dueDate: '2027-01-05' })
    const scale = getTimelineScale([task], 'week', '2026-12-31')

    expect(scale.columns[0]).toMatchObject({
      startDate: '2026-12-21',
      endDate: '2026-12-27',
    })
    expect(scale.columns).toContainEqual({
      key: '2027-01-04',
      label: '04/01–10/01',
      startDate: '2027-01-04',
      endDate: '2027-01-10',
    })
    expect(scale.todayColumnIndex).toBe(1)
  })

  it('keeps a useful scheduling horizon when every task is unscheduled', () => {
    const dayScale = getTimelineScale([makeTask()], 'day', '2026-07-24')
    const weekScale = getTimelineScale([makeTask()], 'week', '2026-07-24')

    expect(dayScale.columns).toHaveLength(31)
    expect(dayScale.columns[0].startDate).toBe('2026-07-21')
    expect(dayScale.columns.at(-1)?.endDate).toBe('2026-08-20')
    expect(weekScale.columns.length).toBeGreaterThanOrEqual(12)
    expect(weekScale.columns[0]).toMatchObject({
      startDate: '2026-07-13',
      endDate: '2026-07-19',
    })
  })

  it('bounds extreme dates so the grid cannot allocate an unbounded range', () => {
    const scale = getTimelineScale([
      makeTask({ startDate: '1900-01-01', dueDate: '2999-12-31' }),
    ], 'day', '2026-07-24')

    expect(scale.columns.length).toBeLessThanOrEqual(731)
    expect(scale.columns[0]?.startDate).toBe('2025-07-24')
    expect(scale.columns.at(-1)?.endDate).toBe('2027-07-24')
  })
})

describe('timeline status and filters', () => {
  it('maps the prompt status vocabulary to the full database union', () => {
    expect(mapTimelineStatus('todo')).toBe('NOT_STARTED')
    expect(mapTimelineStatus('in_progress')).toBe('IN_PROGRESS')
    expect(mapTimelineStatus('done')).toBe('COMPLETED')
  })

  it('toggles completion without narrowing the accepted TaskStatus union', () => {
    expect(toggleTimelineCompletion('WAITING')).toBe('COMPLETED')
    expect(toggleTimelineCompletion('COMPLETED')).toBe('NOT_STARTED')
  })

  it('requires confirmation only while completion will use the UNASSIGNED bypass', () => {
    expect(willUseUnassignedCompletionBypass({
      currentStatus: 'UNASSIGNED',
      nextStatus: 'COMPLETED',
      ownerId: null,
      dueDate: null,
    })).toBe(true)
    expect(willUseUnassignedCompletionBypass({
      currentStatus: 'UNASSIGNED',
      nextStatus: 'COMPLETED',
      ownerId: 'person-1',
      dueDate: '2026-07-25',
    })).toBe(false)
    expect(willUseUnassignedCompletionBypass({
      currentStatus: 'NOT_STARTED',
      nextStatus: 'COMPLETED',
      ownerId: null,
      dueDate: null,
    })).toBe(false)
  })

  it('matches owner, workstream, and full-union status filters', () => {
    const task = makeTask({ status: 'BLOCKED' })
    expect(matchesTimelineFilters(task, ALL_FILTERS)).toBe(true)
    expect(matchesTimelineFilters(task, {
      ownerId: 'owner-1',
      workstreamId: 'workstream-6',
      status: 'BLOCKED',
    })).toBe(true)
    expect(matchesTimelineFilters(task, { ...ALL_FILTERS, status: 'IN_PROGRESS' })).toBe(false)
    expect(matchesTimelineFilters(task, { ...ALL_FILTERS, ownerId: 'owner-2' })).toBe(false)
  })

  it('filters a task collection without mutating the source array', () => {
    const source = [
      makeTask({ id: 'task-1', ownerId: 'owner-1' }),
      makeTask({ id: 'task-2', ownerId: 'owner-2' }),
    ]
    const result = filterTimelineTasks(source, { ...ALL_FILTERS, ownerId: 'owner-2' })

    expect(result.map((task) => task.id)).toEqual(['task-2'])
    expect(source).toHaveLength(2)
  })
})
