import type { VersionReviewStatus } from '@/lib/deliverableVersionStatus'
import type { CommandCenterDeliverableRow } from '@/lib/database.types'

export type TaskStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'WAITING' | 'BLOCKED' | 'PENDING_APPROVAL' | 'REVISION_REQUIRED' | 'COMPLETED' | 'CANCELLED'
export type ProjectQuickFilter = 'all' | 'unassigned'
export type ProjectStatusFilter = 'all' | 'overdue' | TaskStatus
export type ProjectDeadlineFilter = 'all' | 'today' | 'this_week' | 'next_week' | 'overdue' | 'this_month' | 'none'
export type ProjectAssigneeFilter = 'all' | string
export type DeadlineSignalKind = 'overdue' | 'today' | 'upcoming' | 'normal' | 'none'
export type BadgeTone = 'neutral' | 'warning' | 'danger' | 'success'

export interface ProjectFilters {
  quick: ProjectQuickFilter
  status: ProjectStatusFilter
  deadline: ProjectDeadlineFilter
  assigneeId: ProjectAssigneeFilter
  search: string
}

export interface AttachmentItem {
  id: string
  name: string
  url: string | null
  deliverableId?: string | null
  versionId?: string | null
  attachmentId?: string | null
  stepId?: string | null
  mimeType?: string | null
  sizeBytes?: number | null
  status?: VersionReviewStatus | null
  submittedBy?: string | null
  submittedAt?: string | null
  versionNumber?: number | null
}

export type DeliverableBlocker = 'MISTAKE' | 'REVISION' | 'MISSING' | 'PENDING_APPROVAL' | null

export interface StepItem {
  id: string
  title: string
  description: string
  ownerId: string | null
  reviewerId: string | null
  dueDate: string
  missingDueDate?: boolean
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  createdAt?: string | null
  sortOrder?: number | null
  status: TaskStatus
  note: string
  isRequired: boolean
  requiresDeliverable: boolean
  deliverableId: string | null
  deliverableStatus: CommandCenterDeliverableRow['status'] | null
  deliverableReviewStatus: VersionReviewStatus | null
  deliverableIsValid: boolean
  deliverableBlocker: DeliverableBlocker
  deliverableRequiresApproval: boolean
  deliverableReviewerId: string | null
}

export interface SubtaskItem {
  id: string
  sourceTaskId: string | null
  title: string
  description: string
  ownerId: string | null
  reviewerId: string | null
  supporterIds: string[]
  startDate: string
  dueDate: string
  missingStartDate?: boolean
  missingDueDate?: boolean
  status: TaskStatus
  reportText: string
  needsFile: boolean
  taskDeliverableValid: boolean
  fileBlocker: DeliverableBlocker
  attachments: AttachmentItem[]
  deadlineHistory: Array<{ id: string; oldDate: string; newDate: string; reason: string }>
  steps: StepItem[]
}

export interface WorkstreamItem {
  id: string
  title: string
  description: string
  ownerId: string | null
  reviewerId: string | null
  storedStatus: string | null
  startDate: string
  dueDate: string
  status: TaskStatus
  subtasks: SubtaskItem[]
}

export interface MeetingItem {
  id: string
  title: string
  schedule: string
  cadence: string
  recap: string
  filesNeeded: string
  links: string
}

export interface ProjectWorkspace {
  id: string
  sourceProjectId: string | null
  name: string
  code: string
  status: TaskStatus
  storedStatus: string | null
  ownerId: string | null
  reviewerId: string | null
  startDate: string
  dueDate: string
  description: string
  workstreams: WorkstreamItem[]
  meetings: MeetingItem[]
}

export interface ProjectHealthSummary {
  label: string
  bg: string
  color: string
}
