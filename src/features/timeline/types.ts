import type { TaskStatus } from '@/lib/tasks/taskStatusService'

export type TimelineOwnerColorKey =
  | 'blue'
  | 'teal'
  | 'orange'
  | 'indigo'
  | 'purple'
  | 'neutral'

export interface TimelineOwner {
  id: string
  name: string
  colorKey: TimelineOwnerColorKey
}

export interface TimelineWorkstream {
  id: string
  name: string
}

export interface TimelineStep {
  id: string
  title: string
  status: TaskStatus
}

export interface TimelineTask {
  id: string
  title: string
  description: string | null
  ownerId: string | null
  ownerName: string
  workstreamId: string | null
  workstreamName: string
  startDate: string | null
  dueDate: string | null
  status: TaskStatus
  steps: TimelineStep[]
  canEdit: boolean
}

export interface TimelinePageData {
  projectId: string
  projectName: string
  tasks: TimelineTask[]
  owners: TimelineOwner[]
  workstreams: TimelineWorkstream[]
}

export type TimelineZoom = 'week' | 'day'

export interface TimelineFilters {
  ownerId: 'all' | string
  workstreamId: 'all' | string
  status: 'all' | TaskStatus
}

export interface TimelineScaleColumn {
  key: string
  label: string
  startDate: string
  endDate: string
}

export interface TimelineScale {
  columns: TimelineScaleColumn[]
  cellWidth: number
  timelineWidth: number
  todayColumnIndex: number | null
}

export type TimelineScheduleValidation =
  | { valid: true; reason: null }
  | {
      valid: false
      reason: 'PARTIAL_SCHEDULE' | 'INVALID_START_DATE' | 'INVALID_DUE_DATE' | 'INVALID_RANGE'
    }

export type TimelineSeedStatus = 'todo' | 'in_progress' | 'done'
