import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { createClient as createServerClient } from '@/lib/supabase/server'
import {
  isVersionInvalid,
  isVersionPending,
  isVersionRevision,
  normalizeVersionReviewStatus,
  type VersionReviewStatus,
} from '@/lib/deliverableVersionStatus'
import {
  ensureLocalQaWriteAllowed,
  guardExistingEntityWrite,
  isLocalProductionDatabaseRequest,
} from '@/lib/localQaGuard'
import { getCurrentUserProfile, type RbacClient, type RbacUserContext } from '@/lib/rbac/permissions'
import { canSubmitToDeliverable, RBAC_FORBIDDEN_MESSAGE } from '@/lib/rbac/workspaceResourceAccess'

const MAX_FILE_SIZE = 25 * 1024 * 1024
const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'project-files'
const ALLOWED_EXTENSIONS = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'zip', 'html', 'htm'])

type UploadContext =
  | { ok: true; workspaceId: string; uploaderId: string | null; actor: RbacUserContext }
  | { ok: false; status: number; message: string }

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Lỗi không xác định'
}

function cleanId(value: FormDataEntryValue | null) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function cleanText(value: FormDataEntryValue | null) {
  return typeof value === 'string' ? value.trim() : ''
}

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_')
}

function getExtension(name: string) {
  return name.split('.').pop()?.toLowerCase() ?? ''
}

function uploadContentType(file: File) {
  const extension = getExtension(file.name)
  if (file.type) return file.type
  if (extension === 'html' || extension === 'htm') return 'text/html'
  return 'application/octet-stream'
}

function validateFile(file: File) {
  if (file.size <= 0) return 'File đang rỗng, chưa thể tải lên.'
  if (file.size > MAX_FILE_SIZE) return 'File vượt quá giới hạn 25MB.'

  const extension = getExtension(file.name)
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    return 'Chỉ hỗ trợ PDF, Word, Excel/CSV, ảnh, ZIP và HTML.'
  }

  return ''
}

async function ensureStorageBucket() {
  const client = createServiceClient()
  const { data: buckets, error: listError } = await client.storage.listBuckets()
  if (listError) throw new Error(`Không kiểm tra được Supabase Storage: ${listError.message}`)
  if (buckets?.some((bucket) => bucket.name === STORAGE_BUCKET)) return

  const { error } = await client.storage.createBucket(STORAGE_BUCKET, {
    public: false,
    fileSizeLimit: MAX_FILE_SIZE,
  })
  if (error && !/already exists/i.test(error.message)) {
    throw new Error(`Chưa thể tạo bucket ${STORAGE_BUCKET}: ${error.message}`)
  }
}

async function getUploadContext(workspaceId: string): Promise<UploadContext> {
  const sb = await createServerClient()
  const {
    data: { user },
  } = await sb.auth.getUser()

  if (!user) {
    return { ok: false, status: 401, message: 'Bạn cần đăng nhập trước khi tải file.' }
  }

  const profileRes = await sb
    .from('profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (profileRes.error) {
    return { ok: false, status: 500, message: 'Không kiểm tra được hồ sơ đăng nhập.' }
  }

  if (!profileRes.data?.id) {
    return { ok: false, status: 403, message: 'Tài khoản chưa có profile trong workspace.' }
  }

  const membershipRes = await sb
    .from('workspace_memberships')
    .select('workspace_id, profile_id')
    .eq('profile_id', profileRes.data.id)
    .eq('workspace_id', workspaceId)
    .eq('is_active', true)
    .maybeSingle()

  if (membershipRes.error) {
    return { ok: false, status: 500, message: 'Không kiểm tra được quyền workspace.' }
  }

  if (!membershipRes.data) {
    return { ok: false, status: 403, message: 'Tài khoản không có quyền tải file vào workspace này.' }
  }

  const personRes = await sb
    .from('people')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('profile_id', membershipRes.data.profile_id)
    .is('deleted_at', null)
    .maybeSingle()

  const actor = await getCurrentUserProfile(sb as unknown as RbacClient)
  if (!actor || actor.workspaceId !== workspaceId) {
    return { ok: false, status: 403, message: RBAC_FORBIDDEN_MESSAGE }
  }

  return {
    ok: true,
    workspaceId,
    uploaderId: personRes.data?.id ?? null,
    actor,
  }
}

async function belongsToWorkspace(
  table: 'projects' | 'tasks' | 'deliverables' | 'people',
  id: string | null,
  workspaceId: string,
) {
  if (!id) return true
  const client = createServiceClient()
  const { data, error } = await client
    .from(table)
    .select('id')
    .eq('id', id)
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .maybeSingle()

  if (error) return false
  return Boolean(data)
}

async function validateEntityScope({
  workspaceId,
  projectId,
  taskId,
  deliverableId,
}: {
  workspaceId: string
  projectId: string | null
  taskId: string | null
  deliverableId: string | null
}) {
  const [projectOk, taskOk, deliverableOk] = await Promise.all([
    belongsToWorkspace('projects', projectId, workspaceId),
    belongsToWorkspace('tasks', taskId, workspaceId),
    belongsToWorkspace('deliverables', deliverableId, workspaceId),
  ])

  if (!projectOk) return 'Dự án không thuộc workspace hiện tại.'
  if (!taskOk) return 'Đầu việc không thuộc workspace hiện tại.'
  if (!deliverableOk) return 'Hạng mục bàn giao không thuộc workspace hiện tại.'
  return ''
}

async function loadDeliverableForUpload(workspaceId: string, deliverableId: string | null) {
  if (!deliverableId) return null
  const client = createServiceClient()
  const { data, error } = await client
    .from('deliverables')
    .select('id,workspace_id,project_id,task_id,step_id,name,description,reviewer_id,due_date')
    .eq('id', deliverableId)
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .maybeSingle()

  if (error) throw error
  return data
}

async function ensureApproval({
  workspaceId,
  deliverableId,
  projectId,
  taskId,
  stepId,
  requesterId,
  approverId,
  dueAt,
}: {
  workspaceId: string
  deliverableId: string
  projectId: string | null
  taskId: string | null
  stepId: string | null
  requesterId: string | null
  approverId: string | null
  dueAt: string | null
}) {
  const client = createServiceClient()
  const existing = await client
    .from('approvals')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('deliverable_id', deliverableId)
    .in('status', ['PENDING', 'PENDING_REVIEW', 'REVISION_REQUESTED', 'REJECTED'])
    .limit(1)
    .maybeSingle()

  if (existing.error) throw existing.error

  const payload = {
    project_id: projectId,
    task_id: taskId,
    step_id: stepId,
    requested_by: requesterId,
    approver_id: approverId,
    due_at: dueAt,
    status: 'PENDING',
    completed_at: null,
    is_required: true,
    updated_at: new Date().toISOString(),
  }

  if (existing.data?.id) {
    const updateRes = await client.from('approvals').update(payload).eq('id', existing.data.id)
    if (updateRes.error) throw updateRes.error
    await client.from('approval_actions').insert({
      approval_id: existing.data.id,
      action: 'REQUESTED',
      actor_id: requesterId,
      comment: 'Cập nhật người duyệt cho version mới.',
    })
    return existing.data.id as string
  }

  const insertRes = await client
    .from('approvals')
    .insert({
      workspace_id: workspaceId,
      deliverable_id: deliverableId,
      ...payload,
    })
    .select('id')
    .single()

  if (insertRes.error || !insertRes.data) throw insertRes.error ?? new Error('Không tạo được approval.')
  await client.from('approval_actions').insert({
    approval_id: insertRes.data.id,
    action: 'REQUESTED',
    actor_id: requesterId,
    comment: 'Tạo yêu cầu duyệt file/báo cáo.',
  })
  return insertRes.data.id as string
}

async function logActivity(
  workspaceId: string,
  actorId: string | null,
  action: string,
  deliverableId: string,
  metadata: Record<string, unknown> = {},
) {
  const client = createServiceClient()
  await client.from('activity_logs').insert({
    workspace_id: workspaceId,
    actor_id: actorId,
    action,
    entity_type: 'deliverable',
    entity_id: deliverableId,
    metadata,
  })
}

async function recomputeDeliverableStatus(
  client: ReturnType<typeof createServiceClient>,
  workspaceId: string,
  actorId: string | null,
  deliverableId: string,
) {
  const versionsRes = await client
    .from('deliverable_versions')
    .select('id,version_number,review_status')
    .eq('deliverable_id', deliverableId)
    .order('version_number', { ascending: false })

  if (versionsRes.error) throw versionsRes.error

  const latestRelevant = (versionsRes.data ?? [])
    .map((version) => ({ id: version.id, reviewStatus: normalizeVersionReviewStatus(version.review_status) }))
    .find((version) => !isVersionInvalid(version.reviewStatus))

  let status: 'NOT_SUBMITTED' | 'SUBMITTED' | 'REVISION_REQUIRED' | 'APPROVED' = 'NOT_SUBMITTED'
  let approvedVersionId: string | null = null

  if (latestRelevant?.reviewStatus === 'APPROVED') {
    status = 'APPROVED'
    approvedVersionId = latestRelevant.id
  } else if (latestRelevant && isVersionRevision(latestRelevant.reviewStatus)) {
    status = 'REVISION_REQUIRED'
  } else if (latestRelevant && isVersionPending(latestRelevant.reviewStatus)) {
    status = 'SUBMITTED'
  }

  const updateRes = await client
    .from('deliverables')
    .update({
      status,
      approved_version_id: approvedVersionId,
      updated_at: new Date().toISOString(),
      updated_by: actorId,
    })
    .eq('id', deliverableId)
    .eq('workspace_id', workspaceId)

  if (updateRes.error) throw updateRes.error
}

async function markSupersededUploadVersion({
  client,
  workspaceId,
  actorId,
  deliverableId,
  versionId,
  reason,
}: {
  client: ReturnType<typeof createServiceClient>
  workspaceId: string
  actorId: string | null
  deliverableId: string
  versionId: string
  reason: string
}) {
  const oldVersionRes = await client
    .from('deliverable_versions')
    .select('id,version_number,review_status')
    .eq('id', versionId)
    .eq('deliverable_id', deliverableId)
    .maybeSingle()

  if (oldVersionRes.error) throw oldVersionRes.error
  if (!oldVersionRes.data) throw new Error('Không tìm thấy version cần thay thế.')

  const previousStatus = normalizeVersionReviewStatus(oldVersionRes.data.review_status)
  if (isVersionInvalid(previousStatus)) throw new Error('Version này đã được xử lý trước đó.')

  const nextStatus: Extract<VersionReviewStatus, 'UPLOADED_BY_MISTAKE' | 'SUPERSEDED'> =
    previousStatus === 'APPROVED' ? 'SUPERSEDED' : 'UPLOADED_BY_MISTAKE'

  const updateRes = await client
    .from('deliverable_versions')
    .update({
      review_status: nextStatus,
      review_comment: reason,
      reviewed_by: actorId,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', versionId)
    .eq('deliverable_id', deliverableId)

  if (updateRes.error) throw updateRes.error

  await logActivity(
    workspaceId,
    actorId,
    nextStatus === 'SUPERSEDED' ? 'deliverable.version.superseded' : 'deliverable.version.marked_mistake',
    deliverableId,
    {
      versionId,
      versionNumber: oldVersionRes.data.version_number,
      reason,
      before: previousStatus,
      after: nextStatus,
    },
  )
}

async function guardUploadTarget({
  request,
  workspaceId,
  fileName,
  projectId,
  taskId,
  deliverable,
}: {
  request: Request
  workspaceId: string
  fileName: string
  projectId: string | null
  taskId: string | null
  deliverable: {
    id: string
    project_id: string | null
    task_id: string | null
    step_id: string | null
    name?: string | null
    description?: string | null
  } | null
}) {
  if (!isLocalProductionDatabaseRequest(request)) return null

  if (deliverable?.project_id) {
    return guardExistingEntityWrite({
      request,
      client: createServiceClient(),
      table: 'projects',
      id: deliverable.project_id,
      workspaceId,
      fields: ['name', 'code'],
      detail: 'Không được upload file vào dự án thật từ localhost.',
    })
  }

  if (projectId) {
    return guardExistingEntityWrite({
      request,
      client: createServiceClient(),
      table: 'projects',
      id: projectId,
      workspaceId,
      fields: ['name', 'code'],
      detail: 'Không được upload file vào dự án thật từ localhost.',
    })
  }

  if (deliverable?.task_id) {
    return guardExistingEntityWrite({
      request,
      client: createServiceClient(),
      table: 'tasks',
      id: deliverable.task_id,
      workspaceId,
      fields: ['title'],
      detail: 'Không được upload file vào đầu việc thật từ localhost.',
    })
  }

  if (taskId) {
    return guardExistingEntityWrite({
      request,
      client: createServiceClient(),
      table: 'tasks',
      id: taskId,
      workspaceId,
      fields: ['title'],
      detail: 'Không được upload file vào đầu việc thật từ localhost.',
    })
  }

  if (deliverable?.step_id) {
    return guardExistingEntityWrite({
      request,
      client: createServiceClient(),
      table: 'task_steps',
      id: deliverable.step_id,
      workspaceId,
      fields: ['title'],
      detail: 'Không được upload file vào bước thật từ localhost.',
    })
  }

  return ensureLocalQaWriteAllowed(request, { fileName }, 'Muon upload QA tu localhost vao production phai bat server-side env ALLOW_LOCAL_PROD_QA_WRITES.')
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const file = form.get('file') as File | null
    const workspaceId = cleanId(form.get('workspaceId'))
    const projectId = cleanId(form.get('projectId'))
    const taskId = cleanId(form.get('taskId'))
    const deliverableId = cleanId(form.get('deliverableId'))
    const supersedesVersionId = cleanId(form.get('supersedesVersionId'))
    const changeNote = cleanText(form.get('changeNote'))
    const replaceReason = cleanText(form.get('replaceReason')) || changeNote || 'Thay file bằng version mới.'
    const requestedApproverId = cleanId(form.get('approverId'))

    if (!file || !workspaceId) {
      return NextResponse.json({ error: 'Thiếu file hoặc workspaceId.' }, { status: 400 })
    }

    const fileError = validateFile(file)
    if (fileError) {
      return NextResponse.json({ error: fileError }, { status: 400 })
    }

    const context = await getUploadContext(workspaceId)
    if (!context.ok) {
      return NextResponse.json({ error: context.message }, { status: context.status })
    }

    const scopeError = await validateEntityScope({ workspaceId, projectId, taskId, deliverableId })
    if (scopeError) {
      return NextResponse.json({ error: scopeError }, { status: 403 })
    }

    const client = createServiceClient()
    const deliverable = await loadDeliverableForUpload(workspaceId, deliverableId)
    const guard = await guardUploadTarget({
      request: req,
      workspaceId,
      fileName: file.name,
      projectId,
      taskId,
      deliverable,
    })
    if (guard) return guard
    if (!(await canSubmitToDeliverable(context.actor, workspaceId, deliverableId, {
      projectId: deliverable?.project_id ?? projectId,
      taskId: deliverable?.task_id ?? taskId,
      stepId: deliverable?.step_id ?? null,
    }))) {
      return NextResponse.json({ error: RBAC_FORBIDDEN_MESSAGE }, { status: 403 })
    }

    const finalApproverId = requestedApproverId ?? deliverable?.reviewer_id ?? null
    if (finalApproverId && !(await belongsToWorkspace('people', finalApproverId, workspaceId))) {
      return NextResponse.json({ error: 'Người duyệt không thuộc workspace hiện tại.' }, { status: 403 })
    }

    await ensureStorageBucket()
    const folder = [workspaceId, projectId, taskId].filter(Boolean).join('/')
    const storagePath = `${folder}/${Date.now()}_${crypto.randomUUID()}_${sanitizeFileName(file.name)}`

    const bytes = await file.arrayBuffer()
    const mimeType = uploadContentType(file)
    const { error: uploadError } = await client.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, bytes, { contentType: mimeType, upsert: false })

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 })
    }

    const { data: attachment, error: attachmentError } = await client
      .from('attachments')
      .insert({
        workspace_id: workspaceId,
        storage_path: storagePath,
        file_name: file.name,
        mime_type: mimeType,
        size_bytes: file.size,
        uploaded_by: context.uploaderId,
      })
      .select('id')
      .single()

    if (attachmentError || !attachment) {
      return NextResponse.json({ error: 'File đã lên storage nhưng ghi attachment thất bại.' }, { status: 500 })
    }

    let versionId: string | null = null
    let versionNumber: number | null = null

    if (deliverableId) {
      const { count } = await client
        .from('deliverable_versions')
        .select('*', { count: 'exact', head: true })
        .eq('deliverable_id', deliverableId)

      versionNumber = (count ?? 0) + 1
      const versionRes = await client.from('deliverable_versions').insert({
        deliverable_id: deliverableId,
        version_number: versionNumber,
        attachment_id: attachment.id,
        submitted_by: context.uploaderId,
        change_note: changeNote || null,
        review_status: 'PENDING_REVIEW',
      }).select('id,version_number').single()

      if (versionRes.error || !versionRes.data) {
        return NextResponse.json({ error: versionRes.error?.message ?? 'File đã lưu nhưng chưa tạo được version.' }, { status: 500 })
      }
      versionId = versionRes.data.id

      if (supersedesVersionId) {
        await markSupersededUploadVersion({
          client,
          workspaceId,
          actorId: context.uploaderId,
          deliverableId,
          versionId: supersedesVersionId,
          reason: replaceReason,
        })
      }

      if (finalApproverId && deliverable?.reviewer_id !== finalApproverId) {
        const reviewerRes = await client
          .from('deliverables')
          .update({
            reviewer_id: finalApproverId,
            updated_by: context.uploaderId,
            updated_at: new Date().toISOString(),
          })
          .eq('id', deliverableId)
          .eq('workspace_id', workspaceId)
        if (reviewerRes.error) throw reviewerRes.error
      }

      await ensureApproval({
        workspaceId,
        deliverableId,
        projectId: deliverable?.project_id ?? projectId,
        taskId: deliverable?.task_id ?? taskId,
        stepId: deliverable?.step_id ?? null,
        requesterId: context.uploaderId,
        approverId: finalApproverId,
        dueAt: deliverable?.due_date ?? null,
      })

      await recomputeDeliverableStatus(client, workspaceId, context.uploaderId, deliverableId)

      await client
        .from('reminders')
        .update({
          response_status: 'FILE_SUBMITTED',
          status: 'closed',
          updated_at: new Date().toISOString(),
        })
        .eq('workspace_id', workspaceId)
        .eq('deliverable_id', deliverableId)

      await logActivity(context.workspaceId, context.uploaderId, 'deliverable.version.uploaded_file', deliverableId, {
        versionId,
        versionNumber,
        attachmentId: attachment.id,
        fileName: file.name,
        supersedesVersionId,
        before: null,
        after: 'PENDING_REVIEW',
      })
    }

    const { data: signedUrl } = await client.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(storagePath, 86400)

    return NextResponse.json({
      ok: true,
      attachmentId: attachment.id,
      storagePath,
      fileName: file.name,
      fileSize: file.size,
      mimeType,
      url: signedUrl?.signedUrl ?? null,
      versionId,
      versionNumber,
    })
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId') ?? ''
  const projectId = searchParams.get('projectId')
  const taskId = searchParams.get('taskId')

  if (!workspaceId) {
    return NextResponse.json({ error: 'Thiếu workspaceId.' }, { status: 400 })
  }

  const context = await getUploadContext(workspaceId)
  if (!context.ok) {
    return NextResponse.json({ error: context.message, files: [] }, { status: context.status })
  }

  const scopeError = await validateEntityScope({ workspaceId, projectId, taskId, deliverableId: null })
  if (scopeError) {
    return NextResponse.json({ error: scopeError, files: [] }, { status: 403 })
  }
  if (!(await canSubmitToDeliverable(context.actor, workspaceId, null, { projectId, taskId }))) {
    return NextResponse.json({ error: RBAC_FORBIDDEN_MESSAGE, files: [] }, { status: 403 })
  }

  const client = createServiceClient()
  const folder = [workspaceId, projectId, taskId].filter(Boolean).join('/')

  const { data: files, error } = await client.storage
    .from(STORAGE_BUCKET)
    .list(folder, { limit: 50, sortBy: { column: 'created_at', order: 'desc' } })

  if (error) return NextResponse.json({ error: error.message, files: [] }, { status: 500 })

  const withUrls = await Promise.all((files ?? []).map(async (file) => {
    const path = `${folder}/${file.name}`
    const { data } = await client.storage.from(STORAGE_BUCKET).createSignedUrl(path, 3600)
    return { ...file, url: data?.signedUrl ?? null, storagePath: path }
  }))

  return NextResponse.json({ files: withUrls })
}
