import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { loadProjectMemberScope } from '@/lib/documents/scopeMembers'
import {
  canEditProject,
  canEditWorkstream,
  canViewProject,
  canViewWorkstream,
  getCurrentUserProfile,
  type RbacClient,
  type RbacResource,
  type RbacUserContext,
} from '@/lib/rbac/permissions'
import type {
  CreatePlanDocumentInput,
  PlanAssetDto,
  PlanDocumentDto,
  PlanDocumentType,
  PlanTargetType,
  PlanVersionDto,
  ProjectPlanTreeDto,
} from '@/lib/documents/types'

type ServiceClient = ReturnType<typeof createServiceClient>

interface ProjectRecord {
  id: string
  owner_id: string | null
  reviewer_id: string | null
}

interface WorkstreamRecord {
  id: string
  project_id: string
  owner_id: string | null
  reviewer_id: string | null
}

export interface PlanRequestContext {
  service: ServiceClient
  workspaceId: string
  actor: RbacUserContext
}

export class DocumentSchemaNotReadyError extends Error {
  readonly code = 'DOCUMENT_SCHEMA_NOT_READY'
}

export class PlanAccessError extends Error {
  readonly status: number

  constructor(message: string, status = 403) {
    super(message)
    this.status = status
  }
}

export async function getPlanRequestContext(): Promise<PlanRequestContext | null> {
  const session = await createClient()
  const actor = await getCurrentUserProfile(session as unknown as RbacClient)
  if (!actor?.workspaceId) return null

  return {
    service: createServiceClient(),
    workspaceId: actor.workspaceId,
    actor,
  }
}

export async function loadProjectPlanTree(
  context: PlanRequestContext,
  projectId: string,
): Promise<ProjectPlanTreeDto> {
  const { service, workspaceId, actor } = context
  const [projectResult, workstreamsResult] = await Promise.all([
    service
      .from('projects')
      .select('id,owner_id,reviewer_id')
      .eq('workspace_id', workspaceId)
      .eq('id', projectId)
      .is('deleted_at', null)
      .maybeSingle(),
    service
      .from('workstreams')
      .select('id,project_id,owner_id,reviewer_id')
      .eq('workspace_id', workspaceId)
      .eq('project_id', projectId)
      .is('deleted_at', null),
  ])

  if (projectResult.error) throw projectResult.error
  if (workstreamsResult.error) throw workstreamsResult.error
  if (!projectResult.data) throw new PlanAccessError('Không tìm thấy dự án.', 404)

  const project = projectResult.data as ProjectRecord
  const workstreams = (workstreamsResult.data ?? []) as WorkstreamRecord[]
  const departments = await loadOwnerDepartments(service, workspaceId, [
    project.owner_id,
    ...workstreams.map((workstream) => workstream.owner_id),
  ])
  const scopeMembers = await loadProjectMemberScope(service, workspaceId, projectId)
  const projectResource = projectRbacResource(project, departments, scopeMembers.project)
  if (!canViewProject(actor, projectResource)) {
    throw new PlanAccessError('Bạn không có quyền xem kế hoạch của dự án này.')
  }

  const visibleWorkstreams = workstreams.filter((workstream) =>
    canViewWorkstream(actor, workstreamRbacResource(
      workstream,
      project,
      departments,
      scopeMembers.workstreams.get(workstream.id) ?? [],
    )),
  )
  const workstreamAccess = Object.fromEntries(
    visibleWorkstreams.map((workstream) => [
      workstream.id,
      {
        canManage: canEditWorkstream(actor, workstreamRbacResource(
          workstream,
          project,
          departments,
          scopeMembers.workstreams.get(workstream.id) ?? [],
        )),
        documents: [] as PlanDocumentDto[],
      },
    ]),
  )

  const targetIds = [projectId, ...visibleWorkstreams.map((workstream) => workstream.id)]
  const typeResult = await service
    .from('document_types')
    .select('id,code')
    .in('code', ['PROJECT_PLAN', 'WORKSTREAM_PLAN'])
    .eq('is_active', true)
  if (typeResult.error) throwDocumentSchemaError(typeResult.error)

  const typeById = new Map(
    (typeResult.data ?? []).map((row) => [row.id as string, row.code as PlanDocumentType]),
  )
  const targetResult = await service
    .from('document_targets')
    .select('document_id,target_type,target_id')
    .eq('workspace_id', workspaceId)
    .in('target_id', targetIds)
    .in('target_type', ['PROJECT', 'WORKSTREAM'])
  if (targetResult.error) throwDocumentSchemaError(targetResult.error)

  const targetRows = targetResult.data ?? []
  const documentIds = Array.from(new Set(targetRows.map((row) => row.document_id as string)))
  if (!documentIds.length) {
    return {
      projectId,
      canManageProjectPlan: canEditProject(actor, projectResource),
      projectPlans: [],
      workstreams: workstreamAccess,
    }
  }

  const documentResult = await service
    .from('documents')
    .select('id,document_type_id,title,description')
    .eq('workspace_id', workspaceId)
    .eq('status', 'ACTIVE')
    .is('deleted_at', null)
    .in('id', documentIds)
  if (documentResult.error) throwDocumentSchemaError(documentResult.error)

  const documentRows = (documentResult.data ?? []).filter((row) => typeById.has(row.document_type_id as string))
  const activeDocumentIds = documentRows.map((row) => row.id as string)
  if (!activeDocumentIds.length) {
    return {
      projectId,
      canManageProjectPlan: canEditProject(actor, projectResource),
      projectPlans: [],
      workstreams: workstreamAccess,
    }
  }

  const versionResult = await service
    .from('document_versions')
    .select('id,document_id,version_number,status,change_note,submitted_by,created_at')
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .in('document_id', activeDocumentIds)
    .order('version_number', { ascending: false })
  if (versionResult.error) throwDocumentSchemaError(versionResult.error)

  const versionRows = versionResult.data ?? []
  const versionIds = versionRows.map((row) => row.id as string)
  const submitterIds = Array.from(
    new Set(versionRows.map((row) => row.submitted_by as string | null).filter(Boolean) as string[]),
  )
  const [assetResult, submitterResult] = await Promise.all([
    versionIds.length
      ? service
          .from('document_assets')
          .select('id,document_version_id,asset_type,attachment_id,external_url,title,created_at')
          .eq('workspace_id', workspaceId)
          .is('deleted_at', null)
          .in('document_version_id', versionIds)
      : Promise.resolve({ data: [], error: null }),
    submitterIds.length
      ? service
          .from('people')
          .select('id,full_name')
          .eq('workspace_id', workspaceId)
          .is('deleted_at', null)
          .in('id', submitterIds)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (assetResult.error) throwDocumentSchemaError(assetResult.error)
  if (submitterResult.error) throw submitterResult.error

  const assetRows = assetResult.data ?? []
  const attachmentIds = Array.from(
    new Set(assetRows.map((row) => row.attachment_id as string | null).filter(Boolean) as string[]),
  )
  const attachmentResult = attachmentIds.length
    ? await service
        .from('attachments')
        .select('id,storage_path,file_name,mime_type,size_bytes')
        .eq('workspace_id', workspaceId)
        .is('deleted_at', null)
        .in('id', attachmentIds)
    : { data: [], error: null }
  if (attachmentResult.error) throw attachmentResult.error

  const submitters = new Map(
    (submitterResult.data ?? []).map((row) => [row.id as string, row.full_name as string]),
  )
  const attachments = new Map(
    (attachmentResult.data ?? []).map((row) => [row.id as string, row]),
  )
  const assetsByVersion = new Map<string, PlanAssetDto[]>()
  for (const row of assetRows) {
    const versionId = row.document_version_id as string
    const attachment = row.attachment_id ? attachments.get(row.attachment_id as string) : null
    const type = row.asset_type as 'FILE' | 'LINK'
    if (type !== 'FILE' && type !== 'LINK') continue
    const storagePath = attachment?.storage_path as string | undefined
    const externalUrl = (row.external_url as string | null) ?? null
    const item: PlanAssetDto = {
      id: row.id as string,
      type,
      title: (row.title as string | null) || (attachment?.file_name as string | null) || externalUrl || 'Tài liệu kế hoạch',
      attachmentId: (row.attachment_id as string | null) ?? null,
      externalUrl,
      openUrl: type === 'FILE' && storagePath
        ? fileOpenUrl(workspaceId, storagePath)
        : externalUrl,
      fileName: (attachment?.file_name as string | null) ?? null,
      mimeType: (attachment?.mime_type as string | null) ?? null,
      sizeBytes: (attachment?.size_bytes as number | null) ?? null,
      createdAt: row.created_at as string,
    }
    assetsByVersion.set(versionId, [...(assetsByVersion.get(versionId) ?? []), item])
  }

  const versionsByDocument = new Map<string, PlanVersionDto[]>()
  for (const row of versionRows) {
    const documentId = row.document_id as string
    const submittedBy = (row.submitted_by as string | null) ?? null
    const item: PlanVersionDto = {
      id: row.id as string,
      versionNumber: row.version_number as number,
      status: row.status as string,
      changeNote: (row.change_note as string | null) ?? null,
      submittedBy,
      submittedByName: submittedBy ? submitters.get(submittedBy) ?? null : null,
      createdAt: row.created_at as string,
      assets: assetsByVersion.get(row.id as string) ?? [],
    }
    versionsByDocument.set(documentId, [...(versionsByDocument.get(documentId) ?? []), item])
  }

  const targetByDocument = new Map(
    targetRows.map((row) => [row.document_id as string, row]),
  )
  const projectPlans: PlanDocumentDto[] = []
  for (const row of documentRows) {
    const versions = versionsByDocument.get(row.id as string) ?? []
    const target = targetByDocument.get(row.id as string)
    const type = typeById.get(row.document_type_id as string)
    if (!target || !type || !versions.length) continue

    const document: PlanDocumentDto = {
      id: row.id as string,
      type,
      targetType: target.target_type as PlanTargetType,
      targetId: target.target_id as string,
      title: row.title as string,
      description: (row.description as string | null) ?? null,
      latestVersion: versions[0],
      versions,
    }
    if (document.targetType === 'PROJECT' && document.targetId === projectId) {
      projectPlans.push(document)
    } else if (document.targetType === 'WORKSTREAM' && workstreamAccess[document.targetId]) {
      workstreamAccess[document.targetId].documents.push(document)
    }
  }

  sortPlanDocuments(projectPlans)
  Object.values(workstreamAccess).forEach((entry) => sortPlanDocuments(entry.documents))
  return {
    projectId,
    canManageProjectPlan: canEditProject(actor, projectResource),
    projectPlans,
    workstreams: workstreamAccess,
  }
}

export async function createPlanDocumentVersion(
  context: PlanRequestContext,
  input: CreatePlanDocumentInput,
) {
  const title = input.title.trim()
  if (!title) throw new PlanAccessError('Tên tài liệu kế hoạch không được để trống.', 400)
  if (!context.actor.personId) {
    throw new PlanAccessError('Tài khoản chưa liên kết nhân sự để ghi lịch sử tài liệu.', 403)
  }

  const access = await loadPlanTargetAccess(context, input.projectId, input.targetType, input.targetId)
  if (!access.canView) throw new PlanAccessError('Bạn không có quyền xem phạm vi kế hoạch này.')
  if (!access.canManage) throw new PlanAccessError('Bạn không có quyền cập nhật kế hoạch này.')

  const typeCode: PlanDocumentType = input.targetType === 'PROJECT' ? 'PROJECT_PLAN' : 'WORKSTREAM_PLAN'
  const rpcResult = await context.service.rpc('create_document_version', {
    p_workspace_id: context.workspaceId,
    p_document_type_code: typeCode,
    p_target_type: input.targetType,
    p_target_id: input.targetId,
    p_title: title,
    p_asset_type: input.assetType,
    p_document_id: input.documentId ?? null,
    p_description: input.description?.trim() || null,
    p_change_note: input.changeNote?.trim() || null,
    p_attachment_id: input.attachmentId ?? null,
    p_external_url: input.externalUrl ?? null,
    p_asset_title: title,
    p_asset_comment: null,
    p_actor_id: context.actor.personId,
  })
  if (rpcResult.error) throwDocumentSchemaError(rpcResult.error)
  return Array.isArray(rpcResult.data) ? rpcResult.data[0] : rpcResult.data
}

export async function loadPlanTargetAccess(
  context: PlanRequestContext,
  projectId: string,
  targetType: PlanTargetType,
  targetId: string,
) {
  const projectResult = await context.service
    .from('projects')
    .select('id,owner_id,reviewer_id')
    .eq('workspace_id', context.workspaceId)
    .eq('id', projectId)
    .is('deleted_at', null)
    .maybeSingle()
  if (projectResult.error) throw projectResult.error
  if (!projectResult.data) throw new PlanAccessError('Không tìm thấy dự án.', 404)
  const project = projectResult.data as ProjectRecord
  const scopeMembers = await loadProjectMemberScope(context.service, context.workspaceId, projectId)

  if (targetType === 'PROJECT') {
    if (targetId !== projectId) throw new PlanAccessError('Phạm vi Project Plan không hợp lệ.', 400)
    const departments = await loadOwnerDepartments(context.service, context.workspaceId, [project.owner_id])
    const resource = projectRbacResource(project, departments, scopeMembers.project)
    return {
      canView: canViewProject(context.actor, resource),
      canManage: canEditProject(context.actor, resource),
    }
  }

  const workstreamResult = await context.service
    .from('workstreams')
    .select('id,project_id,owner_id,reviewer_id')
    .eq('workspace_id', context.workspaceId)
    .eq('id', targetId)
    .eq('project_id', projectId)
    .is('deleted_at', null)
    .maybeSingle()
  if (workstreamResult.error) throw workstreamResult.error
  if (!workstreamResult.data) throw new PlanAccessError('Không tìm thấy đầu việc lớn.', 404)
  const workstream = workstreamResult.data as WorkstreamRecord
  const departments = await loadOwnerDepartments(context.service, context.workspaceId, [
    project.owner_id,
    workstream.owner_id,
  ])
  const resource = workstreamRbacResource(
    workstream,
    project,
    departments,
    scopeMembers.workstreams.get(workstream.id) ?? [],
  )
  return {
    canView: canViewWorkstream(context.actor, resource),
    canManage: canEditWorkstream(context.actor, resource),
  }
}

async function loadOwnerDepartments(
  service: ServiceClient,
  workspaceId: string,
  ownerIds: Array<string | null>,
) {
  const ids = Array.from(new Set(ownerIds.filter(Boolean) as string[]))
  if (!ids.length) return new Map<string, string | null>()
  const result = await service
    .from('people')
    .select('id,department_id')
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .in('id', ids)
  if (result.error) throw result.error
  return new Map(
    (result.data ?? []).map((row) => [row.id as string, (row.department_id as string | null) ?? null]),
  )
}

function projectRbacResource(
  project: ProjectRecord,
  departments: Map<string, string | null>,
  members: string[] = [],
): RbacResource {
  return {
    id: project.id,
    owner_id: project.owner_id,
    reviewer_id: project.reviewer_id,
    owner_department_id: project.owner_id ? departments.get(project.owner_id) ?? null : null,
    member_ids: Array.from(new Set([project.owner_id, project.reviewer_id, ...members].filter(Boolean) as string[])),
  }
}

function workstreamRbacResource(
  workstream: WorkstreamRecord,
  project: ProjectRecord,
  departments: Map<string, string | null>,
  members: string[] = [],
): RbacResource {
  return {
    id: workstream.id,
    project_id: project.id,
    owner_id: workstream.owner_id,
    reviewer_id: workstream.reviewer_id,
    project_owner_id: project.owner_id,
    owner_department_id: workstream.owner_id ? departments.get(workstream.owner_id) ?? null : null,
    member_ids: Array.from(new Set([workstream.owner_id, workstream.reviewer_id, project.owner_id, project.reviewer_id, ...members].filter(Boolean) as string[])),
  }
}

function fileOpenUrl(workspaceId: string, storagePath: string) {
  return `/api/files/open?${new URLSearchParams({ workspaceId, path: storagePath }).toString()}`
}

function sortPlanDocuments(documents: PlanDocumentDto[]) {
  documents.sort((left, right) =>
    new Date(right.latestVersion.createdAt).getTime() - new Date(left.latestVersion.createdAt).getTime(),
  )
}

function throwDocumentSchemaError(error: { code?: string; message?: string }): never {
  const message = error.message ?? 'Document System chưa sẵn sàng.'
  if (
    error.code === '42P01' ||
    error.code === '42883' ||
    error.code === 'PGRST202' ||
    error.code === 'PGRST205' ||
    /document_(types|targets|versions|assets)|create_document_version/i.test(message)
  ) {
    throw new DocumentSchemaNotReadyError('Document System chưa được cài trên môi trường hiện tại.')
  }
  throw new Error(message)
}
