export interface SubtaskDependencyEdge {
  id: string
  workspace_id: string
  project_id: string
  /** Prerequisite endpoint. Direction is always prerequisite -> dependent. */
  from_subtask_id: string
  /** Dependent endpoint. Direction is always prerequisite -> dependent. */
  to_subtask_id: string
  created_at: string
  created_by: string | null
}

export interface DependencyEndpointSnapshot {
  id: string
  title: string
  status: string
  deleted_at?: string | null
}

export interface IncompleteDependency {
  id: string
  title: string
  status: string | null
  missing: boolean
}

export type DependencyReadiness = 'ready' | 'waiting'

export interface ComputedSubtaskState {
  state: DependencyReadiness
  total: number
  completed: number
  incomplete: IncompleteDependency[]
}

export const DEPENDENCY_ERROR_CODES = [
  'DP001',
  'DP002',
  'DP003',
  'DP004',
  'DP005',
  'DP006',
  'DP007',
  'DP008',
] as const

export type DependencyErrorCode = (typeof DEPENDENCY_ERROR_CODES)[number]

export interface DependencyErrorDescriptor {
  code: DependencyErrorCode | 'DEPENDENCY_UNKNOWN'
  message: string
  status: number
}
