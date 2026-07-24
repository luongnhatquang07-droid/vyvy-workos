import type { TaskStatus } from '@/lib/tasks/taskStatusService'

import type {
  TimelineFilters,
  TimelineScale,
  TimelineScaleColumn,
  TimelineScheduleValidation,
  TimelineSeedStatus,
  TimelineTask,
  TimelineZoom,
} from './types'

const DAY_MS = 24 * 60 * 60 * 1000
const DAY_CELL_WIDTH = 72
const WEEK_CELL_WIDTH = 168
const DAY_VIEW_PAST_DAYS = 3
const DAY_VIEW_FUTURE_DAYS = 27
const WEEK_VIEW_PAST_DAYS = 7
const WEEK_VIEW_FUTURE_DAYS = 77
const MAX_TIMELINE_DISTANCE_FROM_TODAY_DAYS = 365
const VIETNAM_UTC_OFFSET_MS = 7 * 60 * 60 * 1000

const TIMELINE_SEED_STATUS_MAP: Record<TimelineSeedStatus, TaskStatus> = {
  todo: 'NOT_STARTED',
  in_progress: 'IN_PROGRESS',
  done: 'COMPLETED',
}

export function isTimelineDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false

  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))

  return (
    date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
  )
}

export function shiftTimelineDate(dateKey: string, days: number): string {
  const date = parseTimelineDate(dateKey)
  date.setUTCDate(date.getUTCDate() + days)
  return formatTimelineDate(date)
}

export function timelineDateDiff(fromDate: string, toDate: string): number {
  return Math.round(
    (parseTimelineDate(toDate).getTime() - parseTimelineDate(fromDate).getTime()) / DAY_MS,
  )
}

export function formatTimelineDate(value: Date | string): string {
  const date = typeof value === 'string' ? parseTimelineDate(value) : value
  return [
    String(date.getUTCFullYear()).padStart(4, '0'),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-')
}

export function getTimelineToday(now = new Date()): string {
  return formatTimelineDate(new Date(now.getTime() + VIETNAM_UTC_OFFSET_MS))
}

export function getTimelineScale(
  tasks: ReadonlyArray<Pick<TimelineTask, 'startDate' | 'dueDate'>>,
  zoom: TimelineZoom,
  today = getTimelineToday(),
): TimelineScale {
  assertTimelineDate(today, 'today')

  const minimumAllowedDate = shiftTimelineDate(today, -MAX_TIMELINE_DISTANCE_FROM_TODAY_DAYS)
  const maximumAllowedDate = shiftTimelineDate(today, MAX_TIMELINE_DISTANCE_FROM_TODAY_DAYS)
  const scheduledDateKeys = tasks.flatMap((task) => {
    const validation = validateTimelineSchedule(task.startDate, task.dueDate)
    if (!validation.valid || task.startDate === null || task.dueDate === null) return []
    return [
      clampTimelineDate(task.startDate, minimumAllowedDate, maximumAllowedDate),
      clampTimelineDate(task.dueDate, minimumAllowedDate, maximumAllowedDate),
    ]
  })
  const rangeStart = minTimelineDate([
    shiftTimelineDate(today, zoom === 'day' ? -DAY_VIEW_PAST_DAYS : -WEEK_VIEW_PAST_DAYS),
    ...scheduledDateKeys,
  ])
  const rangeEnd = maxTimelineDate([
    shiftTimelineDate(today, zoom === 'day' ? DAY_VIEW_FUTURE_DAYS : WEEK_VIEW_FUTURE_DAYS),
    ...scheduledDateKeys,
  ])

  const columns = zoom === 'day'
    ? createDayColumns(rangeStart, rangeEnd)
    : createWeekColumns(rangeStart, rangeEnd)
  const cellWidth = zoom === 'day' ? DAY_CELL_WIDTH : WEEK_CELL_WIDTH
  const todayColumnIndex = columns.findIndex(
    (column) => today >= column.startDate && today <= column.endDate,
  )

  return {
    columns,
    cellWidth,
    timelineWidth: columns.length * cellWidth,
    todayColumnIndex: todayColumnIndex === -1 ? null : todayColumnIndex,
  }
}

export function getDropSchedule(
  task: Pick<TimelineTask, 'startDate' | 'dueDate'>,
  targetDate: string,
  zoom: TimelineZoom,
): Pick<TimelineTask, 'startDate' | 'dueDate'> {
  assertTimelineDate(targetDate, 'targetDate')
  void task
  void zoom

  return {
    startDate: targetDate,
    dueDate: targetDate,
  }
}

export function isUnscheduled(
  task: Pick<TimelineTask, 'startDate' | 'dueDate'>,
): boolean {
  return task.startDate === null || task.dueDate === null
}

export function willUseUnassignedCompletionBypass({
  currentStatus,
  nextStatus,
  ownerId,
  dueDate,
}: {
  currentStatus: TaskStatus
  nextStatus: TaskStatus
  ownerId: string | null
  dueDate: string | null
}): boolean {
  return (
    currentStatus === 'UNASSIGNED'
    && nextStatus === 'COMPLETED'
    && (!ownerId || !dueDate)
  )
}

export function validateTimelineSchedule(
  startDate: string | null,
  dueDate: string | null,
): TimelineScheduleValidation {
  if (startDate === null && dueDate === null) {
    return { valid: true, reason: null }
  }
  if (startDate === null || dueDate === null) {
    return { valid: false, reason: 'PARTIAL_SCHEDULE' }
  }
  if (!isTimelineDateKey(startDate)) {
    return { valid: false, reason: 'INVALID_START_DATE' }
  }
  if (!isTimelineDateKey(dueDate)) {
    return { valid: false, reason: 'INVALID_DUE_DATE' }
  }
  if (startDate > dueDate) {
    return { valid: false, reason: 'INVALID_RANGE' }
  }

  return { valid: true, reason: null }
}

export function matchesTimelineFilters(
  task: Pick<TimelineTask, 'ownerId' | 'workstreamId' | 'status'>,
  filters: TimelineFilters,
): boolean {
  if (filters.ownerId !== 'all' && task.ownerId !== filters.ownerId) return false
  if (filters.workstreamId !== 'all' && task.workstreamId !== filters.workstreamId) return false
  if (filters.status !== 'all' && task.status !== filters.status) return false
  return true
}

export function filterTimelineTasks(
  tasks: readonly TimelineTask[],
  filters: TimelineFilters,
): TimelineTask[] {
  return tasks.filter((task) => matchesTimelineFilters(task, filters))
}

export function toggleTimelineCompletion(status: TaskStatus): TaskStatus {
  return status === 'COMPLETED' ? 'NOT_STARTED' : 'COMPLETED'
}

export function mapTimelineStatus(status: TimelineSeedStatus): TaskStatus {
  return TIMELINE_SEED_STATUS_MAP[status]
}

function createDayColumns(startDate: string, endDate: string): TimelineScaleColumn[] {
  const columns: TimelineScaleColumn[] = []
  for (let date = startDate; date <= endDate; date = shiftTimelineDate(date, 1)) {
    columns.push({
      key: date,
      label: formatDayLabel(date),
      startDate: date,
      endDate: date,
    })
  }
  return columns
}

function createWeekColumns(rangeStart: string, rangeEnd: string): TimelineScaleColumn[] {
  const firstWeekStart = startOfUtcWeek(rangeStart)
  const lastWeekStart = startOfUtcWeek(rangeEnd)
  const columns: TimelineScaleColumn[] = []

  for (
    let weekStart = firstWeekStart;
    weekStart <= lastWeekStart;
    weekStart = shiftTimelineDate(weekStart, 7)
  ) {
    const weekEnd = shiftTimelineDate(weekStart, 6)
    columns.push({
      key: weekStart,
      label: `${formatShortDate(weekStart)}–${formatShortDate(weekEnd)}`,
      startDate: weekStart,
      endDate: weekEnd,
    })
  }
  return columns
}

function startOfUtcWeek(dateKey: string): string {
  const date = parseTimelineDate(dateKey)
  const mondayOffset = (date.getUTCDay() + 6) % 7
  return shiftTimelineDate(dateKey, -mondayOffset)
}

function formatDayLabel(dateKey: string): string {
  const date = parseTimelineDate(dateKey)
  const weekday = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][date.getUTCDay()]
  return `${weekday} ${formatShortDate(dateKey)}`
}

function formatShortDate(dateKey: string): string {
  return `${dateKey.slice(8, 10)}/${dateKey.slice(5, 7)}`
}

function minTimelineDate(dateKeys: string[]): string {
  return dateKeys.reduce((minimum, dateKey) => dateKey < minimum ? dateKey : minimum)
}

function maxTimelineDate(dateKeys: string[]): string {
  return dateKeys.reduce((maximum, dateKey) => dateKey > maximum ? dateKey : maximum)
}

function clampTimelineDate(dateKey: string, minimum: string, maximum: string): string {
  if (dateKey < minimum) return minimum
  if (dateKey > maximum) return maximum
  return dateKey
}

function parseTimelineDate(dateKey: string): Date {
  assertTimelineDate(dateKey, 'dateKey')
  return new Date(`${dateKey}T00:00:00.000Z`)
}

function assertTimelineDate(value: string, name: string): void {
  if (!isTimelineDateKey(value)) {
    throw new RangeError(`${name} must be a valid ISO date key (YYYY-MM-DD).`)
  }
}
