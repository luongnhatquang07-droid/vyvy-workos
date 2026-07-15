export type PlanDocumentType = 'PROJECT_PLAN' | 'WORKSTREAM_PLAN'
export type PlanTargetType = 'PROJECT' | 'WORKSTREAM'
export type PlanAssetType = 'FILE' | 'LINK'

export interface PlanAssetDto {
  id: string
  type: PlanAssetType
  title: string
  attachmentId: string | null
  externalUrl: string | null
  openUrl: string | null
  fileName: string | null
  mimeType: string | null
  sizeBytes: number | null
  createdAt: string
}

export interface PlanVersionDto {
  id: string
  versionNumber: number
  status: string
  changeNote: string | null
  submittedBy: string | null
  submittedByName: string | null
  createdAt: string
  assets: PlanAssetDto[]
}

export interface PlanDocumentDto {
  id: string
  type: PlanDocumentType
  targetType: PlanTargetType
  targetId: string
  title: string
  description: string | null
  latestVersion: PlanVersionDto
  versions: PlanVersionDto[]
}

export interface WorkstreamPlanDto {
  canManage: boolean
  documents: PlanDocumentDto[]
}

export interface ProjectPlanTreeDto {
  projectId: string
  canManageProjectPlan: boolean
  projectPlans: PlanDocumentDto[]
  workstreams: Record<string, WorkstreamPlanDto>
}

export interface PlanTreeResponse {
  ok: boolean
  data?: ProjectPlanTreeDto
  error?: string
  code?: string
}

export interface CreatePlanDocumentInput {
  projectId: string
  targetType: PlanTargetType
  targetId: string
  documentId?: string | null
  title: string
  description?: string | null
  changeNote?: string | null
  assetType: PlanAssetType
  attachmentId?: string | null
  externalUrl?: string | null
}
