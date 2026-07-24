type StatusLike = string | null | undefined

export interface DeadlineEntity {
  id: string
  due_date: string | null
  status?: StatusLike
  deleted_at?: string | null
}

export interface DeadlineWorkstream extends DeadlineEntity {
  project_id: string | null
}

export interface DeadlineTask extends DeadlineEntity {
  project_id: string | null
  workstream_id: string | null
}

export interface DeadlineStep extends DeadlineEntity {
  task_id: string
}

export interface DeadlineRollupOptions {
  includeCompleted?: boolean
}

export interface DeadlineRollupResult {
  projectDeadlines: Map<string, string | null>
  workstreamDeadlines: Map<string, string | null>
  taskDeadlines: Map<string, string | null>
  stepDeadlines: Map<string, string | null>
}

const CLOSED_STATUSES = new Set(['CANCELLED', 'CANCELED', 'DELETED', 'ARCHIVED'])

function isActiveForDeadline(entity: { status?: StatusLike; deleted_at?: string | null }, options: DeadlineRollupOptions) {
  if (entity.deleted_at) return false
  const status = (entity.status ?? '').toUpperCase()
  if (CLOSED_STATUSES.has(status)) return false
  if (options.includeCompleted === false && status === 'COMPLETED') return false
  return true
}

function latestDate(values: Array<string | null | undefined>) {
  return values.filter(Boolean).sort().at(-1) ?? null
}

function maxDate(current: string | null | undefined, child: string | null | undefined) {
  if (!current) return child ?? null
  if (!child) return current
  return child > current ? child : current
}

export function getEffectiveDeadlineForStep(step: DeadlineStep, options: DeadlineRollupOptions = {}) {
  return isActiveForDeadline(step, options) ? step.due_date : null
}

export function getEffectiveDeadlineForSubtask(
  subtask: DeadlineTask,
  steps: DeadlineStep[],
  options: DeadlineRollupOptions = {},
) {
  if (!isActiveForDeadline(subtask, options)) return null
  const childDeadline = latestDate(
    steps
      .filter((step) => step.task_id === subtask.id)
      .map((step) => getEffectiveDeadlineForStep(step, options)),
  )
  return maxDate(subtask.due_date, childDeadline)
}

/**
 * Keeps an explicitly missing UNASSIGNED task deadline visible to consumers.
 * Project/workstream rollups still use the full child-step deadline graph.
 */
export function resolveTaskDeadlineAfterRollup(
  task: DeadlineTask,
  rolledUpDeadline: string | null | undefined,
) {
  if (task.status === 'UNASSIGNED' && task.due_date === null) return null
  return rolledUpDeadline ?? task.due_date
}

export function getEffectiveDeadlineForWorkstream(
  workstream: DeadlineWorkstream,
  subtasks: DeadlineTask[],
  steps: DeadlineStep[],
  options: DeadlineRollupOptions = {},
) {
  if (!isActiveForDeadline(workstream, options)) return null
  const childDeadline = latestDate(
    subtasks
      .filter((task) => task.workstream_id === workstream.id)
      .map((task) => getEffectiveDeadlineForSubtask(task, steps, options)),
  )
  return maxDate(workstream.due_date, childDeadline)
}

export function getEffectiveDeadlineForProject(
  project: DeadlineEntity,
  workstreams: DeadlineWorkstream[],
  subtasks: DeadlineTask[],
  steps: DeadlineStep[],
  options: DeadlineRollupOptions = {},
) {
  if (!isActiveForDeadline(project, options)) return null
  const workstreamDeadline = latestDate(
    workstreams
      .filter((workstream) => workstream.project_id === project.id)
      .map((workstream) => getEffectiveDeadlineForWorkstream(workstream, subtasks, steps, options)),
  )
  const directTaskDeadline = latestDate(
    subtasks
      .filter((task) => task.project_id === project.id && !task.workstream_id)
      .map((task) => getEffectiveDeadlineForSubtask(task, steps, options)),
  )
  return maxDate(project.due_date, latestDate([workstreamDeadline, directTaskDeadline]))
}

export function buildDeadlineRollups({
  projects,
  workstreams,
  subtasks,
  steps,
  options = {},
}: {
  projects: DeadlineEntity[]
  workstreams: DeadlineWorkstream[]
  subtasks: DeadlineTask[]
  steps: DeadlineStep[]
  options?: DeadlineRollupOptions
}): DeadlineRollupResult {
  const stepDeadlines = new Map<string, string | null>()
  const taskDeadlines = new Map<string, string | null>()
  const workstreamDeadlines = new Map<string, string | null>()
  const projectDeadlines = new Map<string, string | null>()

  steps.forEach((step) => {
    stepDeadlines.set(step.id, getEffectiveDeadlineForStep(step, options))
  })
  subtasks.forEach((task) => {
    taskDeadlines.set(task.id, getEffectiveDeadlineForSubtask(task, steps, options))
  })
  workstreams.forEach((workstream) => {
    workstreamDeadlines.set(
      workstream.id,
      getEffectiveDeadlineForWorkstream(workstream, subtasks, steps, options),
    )
  })
  projects.forEach((project) => {
    projectDeadlines.set(
      project.id,
      getEffectiveDeadlineForProject(project, workstreams, subtasks, steps, options),
    )
  })

  return { projectDeadlines, workstreamDeadlines, taskDeadlines, stepDeadlines }
}
