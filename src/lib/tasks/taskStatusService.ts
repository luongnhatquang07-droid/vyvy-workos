export const TASK_STATUSES = [
  'UNASSIGNED',
  'NOT_STARTED',
  'IN_PROGRESS',
  'WAITING',
  'BLOCKED',
  'PENDING_APPROVAL',
  'REVISION_REQUIRED',
  'COMPLETED',
  'CANCELLED',
] as const

export type TaskStatus = (typeof TASK_STATUSES)[number]

const TASK_STATUS_SET = new Set<string>(TASK_STATUSES)

export interface TaskAssignmentStatusInput {
  status: TaskStatus
  ownerId: string | null | undefined
  dueDate: string | null | undefined
}

export function isTaskStatus(value: unknown): value is TaskStatus {
  return typeof value === 'string' && TASK_STATUS_SET.has(value)
}

/**
 * Mirrors the database trigger as application-layer defense in depth.
 * UNASSIGNED becomes NOT_STARTED only after both assignment fields exist;
 * every other status is intentionally preserved.
 */
export function normalizeTaskStatusForAssignment({
  status,
  ownerId,
  dueDate,
}: TaskAssignmentStatusInput): TaskStatus {
  if (status !== 'UNASSIGNED') return status
  return hasValue(ownerId) && hasValue(dueDate) ? 'NOT_STARTED' : 'UNASSIGNED'
}

function hasValue(value: string | null | undefined) {
  return typeof value === 'string' && value.trim().length > 0
}
