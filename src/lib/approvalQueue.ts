import type {
  CommandCenterApprovalRow,
  CommandCenterDeliverableRow,
  CommandCenterDeliverableVersionRow,
  CommandCenterTaskStepRow,
  CommandCenterTaskRow,
} from '@/lib/database.types'
import {
  isVersionInvalid,
  isVersionPending,
  normalizeVersionReviewStatus,
} from '@/lib/deliverableVersionStatus'

const CLOSED_TASK_STATUSES = new Set(['COMPLETED', 'CANCELLED'])
const OPEN_APPROVAL_STATUSES = new Set([
  'NOT_REQUESTED',
  'PENDING',
  'PENDING_REVIEW',
  'PENDING_APPROVAL',
  'SUBMITTED',
  'WAITING_APPROVAL',
])

export function isOpenApprovalStatus(status: string | null | undefined) {
  return Boolean(status && OPEN_APPROVAL_STATUSES.has(status))
}

export interface MissingApprovalAuditRow {
  deliverableId: string
  deliverableName: string
  taskId: string | null
  taskTitle: string | null
  latestVersionId: string
  latestVersionNumber: number
  stepId: string | null
  versionStatus: string
  approvalRow: 'missing' | 'present'
  reason: string
}

export function withSyntheticPendingApprovals({
  approvals,
  deliverables,
  versions,
  tasks,
  taskSteps = [],
}: {
  approvals: CommandCenterApprovalRow[]
  deliverables: CommandCenterDeliverableRow[]
  versions: CommandCenterDeliverableVersionRow[]
  tasks: CommandCenterTaskRow[]
  taskSteps?: CommandCenterTaskStepRow[]
}) {
  const syntheticRows = auditMissingApprovalRequests({ approvals, deliverables, versions, tasks, taskSteps })
    .filter((row) => row.approvalRow === 'missing')
    .map((row): CommandCenterApprovalRow => {
      const deliverable = deliverables.find((item) => item.id === row.deliverableId)
      const version = versions.find((item) => item.id === row.latestVersionId)
      return {
        id: `synthetic-${row.deliverableId}-${row.latestVersionId}`,
        task_id: deliverable?.task_id ?? row.taskId,
        step_id: deliverable?.step_id ?? null,
        deliverable_id: row.deliverableId,
        project_id: deliverable?.project_id ?? null,
        requested_by: version?.submitted_by ?? deliverable?.submitter_id ?? null,
        approver_id: deliverable?.reviewer_id ?? null,
        status: 'PENDING_REVIEW',
        requested_at: version?.submitted_at ?? deliverable?.updated_at ?? deliverable?.created_at ?? null,
        due_at: deliverable?.due_date ?? null,
      }
    })

  return [...approvals, ...syntheticRows]
}

export function auditMissingApprovalRequests({
  approvals,
  deliverables,
  versions,
  tasks,
  taskSteps = [],
}: {
  approvals: CommandCenterApprovalRow[]
  deliverables: CommandCenterDeliverableRow[]
  versions: CommandCenterDeliverableVersionRow[]
  tasks: CommandCenterTaskRow[]
  taskSteps?: CommandCenterTaskStepRow[]
}): MissingApprovalAuditRow[] {
  const tasksById = new Map(tasks.map((task) => [task.id, task]))
  const stepsById = new Map(taskSteps.map((step) => [step.id, step]))
  const approvalsByDeliverable = new Map<string, CommandCenterApprovalRow[]>()
  const versionsByDeliverable = new Map<string, CommandCenterDeliverableVersionRow[]>()

  approvals.forEach((approval) => {
    if (!approval.deliverable_id) return
    const group = approvalsByDeliverable.get(approval.deliverable_id) ?? []
    group.push(approval)
    approvalsByDeliverable.set(approval.deliverable_id, group)
  })
  versions.forEach((version) => {
    const group = versionsByDeliverable.get(version.deliverable_id) ?? []
    group.push(version)
    versionsByDeliverable.set(version.deliverable_id, group)
  })

  return deliverables.flatMap((deliverable) => {
    const latest = latestRelevantVersion(versionsByDeliverable.get(deliverable.id) ?? [])
    if (!latest) return []

    const versionStatus = normalizeVersionReviewStatus(latest.review_status)
    const step = deliverable.step_id ? stepsById.get(deliverable.step_id) : null
    const task = deliverable.task_id
      ? tasksById.get(deliverable.task_id)
      : step?.task_id
        ? tasksById.get(step.task_id)
        : null
    const isClosedTask = task ? CLOSED_TASK_STATUSES.has(task.status) : false
    const isClosedStep = step ? CLOSED_TASK_STATUSES.has(step.status) : false
    const openApproval = (approvalsByDeliverable.get(deliverable.id) ?? []).find((approval) =>
      isOpenApprovalStatus(approval.status),
    )
    const shouldQueue = isVersionPending(versionStatus) && !isClosedTask && !isClosedStep

    if (!shouldQueue) return []

    return [{
      deliverableId: deliverable.id,
      deliverableName: deliverable.name,
      taskId: task?.id ?? deliverable.task_id,
      taskTitle: task?.title ?? null,
      latestVersionId: latest.id,
      latestVersionNumber: latest.version_number,
      stepId: step?.id ?? deliverable.step_id ?? null,
      versionStatus,
      approvalRow: openApproval ? 'present' : 'missing',
      reason: openApproval ? 'Latest version already has a pending approval row.' : 'Latest pending version is missing a pending approval row.',
    }]
  })
}

function latestRelevantVersion(versions: CommandCenterDeliverableVersionRow[]) {
  return [...versions]
    .sort((a, b) => b.version_number - a.version_number)
    .find((version) => !isVersionInvalid(normalizeVersionReviewStatus(version.review_status))) ?? null
}
