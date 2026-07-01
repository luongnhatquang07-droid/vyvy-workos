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

const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'project-files'

type WorkspaceContext =
  | { ok: true; workspaceId: string; profileId: string; personId: string | null }
  | { ok: false; response: NextResponse }

type DeliverableStatus = 'REQUIRED' | 'NOT_SUBMITTED' | 'SUBMITTED' | 'MISSING_INFORMATION' | 'REVISION_REQUIRED' | 'APPROVED'
type ReviewStatus = VersionReviewStatus

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

function cleanId(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function cleanText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function cleanDate(value: unknown) {
  const text = cleanText(value)
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null
}

async function getWorkspaceContext(workspaceId: string): Promise<WorkspaceContext> {
  if (!workspaceId) return { ok: false, response: jsonError('Thiếu workspaceId.', 400) }

  const sb = await createServerClient()
  const {
    data: { user },
  } = await sb.auth.getUser()

  if (!user) return { ok: false, response: jsonError('Bạn cần đăng nhập trước khi thao tác bàn giao.', 401) }

  const profileRes = await sb
    .from('profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (profileRes.error) return { ok: false, response: jsonError('Không kiểm tra được hồ sơ đăng nhập.', 500) }
  if (!profileRes.data?.id) return { ok: false, response: jsonError('Tài khoản chưa có profile trong workspace.', 403) }

  const membershipRes = await sb
    .from('workspace_memberships')
    .select('workspace_id, profile_id')
    .eq('profile_id', profileRes.data.id)
    .eq('workspace_id', workspaceId)
    .eq('is_active', true)
    .maybeSingle()

  if (membershipRes.error) return { ok: false, response: jsonError('Không kiểm tra được quyền workspace.', 500) }
  if (!membershipRes.data) return { ok: false, response: jsonError('Tài khoản không có quyền trong workspace này.', 403) }

  const personRes = await sb
    .from('people')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('profile_id', profileRes.data.id)
    .is('deleted_at', null)
    .maybeSingle()

  return {
    ok: true,
    workspaceId,
    profileId: profileRes.data.id,
    personId: personRes.data?.id ?? null,
  }
}

async function ensureEntityInWorkspace(
  table: 'projects' | 'tasks' | 'task_steps' | 'deliverables' | 'people',
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
  return !error && Boolean(data)
}

async function nextVersionNumber(deliverableId: string) {
  const client = createServiceClient()
  const { count, error } = await client
    .from('deliverable_versions')
    .select('*', { count: 'exact', head: true })
    .eq('deliverable_id', deliverableId)
  if (error) throw error
  return (count ?? 0) + 1
}

async function getLatestVersion(deliverableId: string) {
  const client = createServiceClient()
  const { data, error } = await client
    .from('deliverable_versions')
    .select('id,version_number,review_status')
    .eq('deliverable_id', deliverableId)
    .order('version_number', { ascending: false })
  if (error) throw error
  const versions = (data ?? []) as Array<{ id: string; version_number: number; review_status: string | null }>
  const latest = versions.find((version) => !isVersionInvalid(normalizeVersionReviewStatus(version.review_status)))
  return latest
    ? { ...latest, review_status: normalizeVersionReviewStatus(latest.review_status) }
    : null
}

async function loadDeliverableDetail(workspaceId: string, deliverableId: string) {
  const client = createServiceClient()
  const deliverableRes = await client
    .from('deliverables')
    .select('id,workspace_id,project_id,task_id,step_id,name,description,type,required_format,submitter_id,reviewer_id,due_date,status,is_required,approved_version_id,created_at,updated_at')
    .eq('workspace_id', workspaceId)
    .eq('id', deliverableId)
    .is('deleted_at', null)
    .maybeSingle()

  if (deliverableRes.error) throw deliverableRes.error
  if (!deliverableRes.data) return null

  const versionsRes = await client
    .from('deliverable_versions')
    .select('id,deliverable_id,version_number,attachment_id,external_url,submitted_by,submitted_at,change_note,review_status,review_comment,reviewed_by,reviewed_at')
    .eq('deliverable_id', deliverableId)
    .order('version_number', { ascending: false })

  if (versionsRes.error) throw versionsRes.error

  const versions = versionsRes.data ?? []
  const attachmentIds = versions.map((version) => version.attachment_id).filter(Boolean) as string[]
  const attachmentsById: Record<string, {
    id: string
    file_name: string | null
    mime_type: string | null
    size_bytes: number | null
    storage_path: string
    uploaded_by: string | null
    uploaded_at: string | null
  }> = {}

  if (attachmentIds.length) {
    const attachmentsRes = await client
      .from('attachments')
      .select('id,file_name,mime_type,size_bytes,storage_path,uploaded_by,uploaded_at')
      .in('id', attachmentIds)
      .is('deleted_at', null)
    if (attachmentsRes.error) throw attachmentsRes.error
    for (const attachment of attachmentsRes.data ?? []) {
      attachmentsById[attachment.id] = attachment
    }
  }

  const versionsWithFiles = await Promise.all(versions.map(async (version) => {
    const attachment = version.attachment_id ? attachmentsById[version.attachment_id] : null
    let signedUrl: string | null = null
    if (attachment?.storage_path) {
      const { data } = await client.storage.from(STORAGE_BUCKET).createSignedUrl(attachment.storage_path, 3600)
      signedUrl = data?.signedUrl ?? null
    }
    return {
      ...version,
      storageMode: version.external_url ? 'external_url' : 'supabase',
      attachment: attachment
        ? {
            ...attachment,
            url: signedUrl,
          }
        : null,
    }
  }))

  return { deliverable: deliverableRes.data, versions: versionsWithFiles }
}

async function closeRelatedReminders(workspaceId: string, deliverableId: string) {
  const client = createServiceClient()
  await client
    .from('reminders')
    .update({
      response_status: 'FILE_SUBMITTED',
      status: 'closed',
      updated_at: new Date().toISOString(),
    })
    .eq('workspace_id', workspaceId)
    .eq('deliverable_id', deliverableId)
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
  if (!approverId) return
  const client = createServiceClient()
  const existing = await client
    .from('approvals')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('deliverable_id', deliverableId)
    .neq('status', 'APPROVED')
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
    is_required: true,
    updated_at: new Date().toISOString(),
  }

  if (existing.data?.id) {
    const updateRes = await client.from('approvals').update(payload).eq('id', existing.data.id)
    if (updateRes.error) throw updateRes.error
    return
  }

  const insertRes = await client.from('approvals').insert({
    workspace_id: workspaceId,
    deliverable_id: deliverableId,
    ...payload,
  })
  if (insertRes.error) throw insertRes.error
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

  const versions = (versionsRes.data ?? []).map((version) => ({
    id: version.id,
    versionNumber: version.version_number,
    reviewStatus: normalizeVersionReviewStatus(version.review_status),
  }))
  const latestRelevant = versions.find((version) => !isVersionInvalid(version.reviewStatus))

  let status: DeliverableStatus = 'NOT_SUBMITTED'
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
      updated_by: actorId,
      updated_at: new Date().toISOString(),
    })
    .eq('workspace_id', workspaceId)
    .eq('id', deliverableId)

  if (updateRes.error) throw updateRes.error
  return { status, approvedVersionId }
}

async function markVersionLifecycleStatus({
  client,
  workspaceId,
  actorId,
  deliverableId,
  versionId,
  nextStatus,
  reason,
  action,
}: {
  client: ReturnType<typeof createServiceClient>
  workspaceId: string
  actorId: string | null
  deliverableId: string
  versionId: string
  nextStatus: Extract<ReviewStatus, 'UPLOADED_BY_MISTAKE' | 'SUPERSEDED'>
  reason: string
  action: string
}) {
  const versionRes = await client
    .from('deliverable_versions')
    .select('id,version_number,review_status')
    .eq('id', versionId)
    .eq('deliverable_id', deliverableId)
    .maybeSingle()

  if (versionRes.error) throw versionRes.error
  if (!versionRes.data) throw new Error('Không tìm thấy version.')

  const previousStatus = normalizeVersionReviewStatus(versionRes.data.review_status)
  const comment = reason ? `${reason}` : nextStatus === 'SUPERSEDED' ? 'Đánh dấu đã thay thế.' : 'Đánh dấu up nhầm.'

  const updateRes = await client
    .from('deliverable_versions')
    .update({
      review_status: nextStatus,
      review_comment: comment,
      reviewed_by: actorId,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', versionId)
    .eq('deliverable_id', deliverableId)

  if (updateRes.error) throw updateRes.error

  await logActivity(workspaceId, actorId, action, deliverableId, {
    versionId,
    versionNumber: versionRes.data.version_number,
    reason: comment,
    before: previousStatus,
    after: nextStatus,
  })
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const workspaceId = searchParams.get('workspaceId') ?? ''
  const deliverableId = searchParams.get('deliverableId') ?? ''
  const context = await getWorkspaceContext(workspaceId)
  if (!context.ok) return context.response
  if (!deliverableId) return jsonError('Thiếu deliverableId.', 400)

  try {
    const detail = await loadDeliverableDetail(context.workspaceId, deliverableId)
    if (!detail) return jsonError('Không tìm thấy hạng mục bàn giao.', 404)
    return NextResponse.json(detail)
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Không tải được chi tiết bàn giao.', 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>
    const workspaceId = cleanId(body.workspaceId)
    const context = await getWorkspaceContext(workspaceId ?? '')
    if (!context.ok) return context.response

    const projectId = cleanId(body.projectId)
    const taskId = cleanId(body.taskId)
    const stepId = cleanId(body.stepId)
    const submitterId = cleanId(body.submitterId)
    const reviewerId = cleanId(body.reviewerId)

    if (!cleanText(body.name)) return jsonError('Tên bàn giao không được để trống.', 400)
    const checks = await Promise.all([
      ensureEntityInWorkspace('projects', projectId, context.workspaceId),
      ensureEntityInWorkspace('tasks', taskId, context.workspaceId),
      ensureEntityInWorkspace('task_steps', stepId, context.workspaceId),
      ensureEntityInWorkspace('people', submitterId, context.workspaceId),
      ensureEntityInWorkspace('people', reviewerId, context.workspaceId),
    ])
    if (checks.some((value) => !value)) return jsonError('Dữ liệu liên kết không thuộc workspace hiện tại.', 403)

    const client = createServiceClient()
    const insertRes = await client
      .from('deliverables')
      .insert({
        workspace_id: context.workspaceId,
        project_id: projectId,
        task_id: taskId,
        step_id: stepId,
        name: cleanText(body.name),
        description: cleanText(body.description) || null,
        type: cleanText(body.type) || 'file',
        required_format: cleanText(body.requiredFormat) || null,
        submitter_id: submitterId,
        reviewer_id: reviewerId,
        due_date: cleanDate(body.dueDate),
        status: 'NOT_SUBMITTED' satisfies DeliverableStatus,
        is_required: body.isRequired !== false,
        created_by: context.personId,
        updated_by: context.personId,
      })
      .select('id,workspace_id,project_id,task_id,step_id,reviewer_id,due_date')
      .single()

    if (insertRes.error || !insertRes.data) {
      return jsonError(insertRes.error?.message ?? 'Không tạo được bàn giao.', 500)
    }

    if (body.requiresApproval === true && reviewerId) {
      await ensureApproval({
        workspaceId: context.workspaceId,
        deliverableId: insertRes.data.id,
        projectId,
        taskId,
        stepId,
        requesterId: context.personId,
        approverId: reviewerId,
        dueAt: insertRes.data.due_date,
      })
    }

    await logActivity(context.workspaceId, context.personId, 'deliverable.created', insertRes.data.id)
    return NextResponse.json({ ok: true, deliverableId: insertRes.data.id })
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Không tạo được bàn giao.', 500)
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>
    const workspaceId = cleanId(body.workspaceId)
    const deliverableId = cleanId(body.deliverableId)
    const action = cleanText(body.action)
    const context = await getWorkspaceContext(workspaceId ?? '')
    if (!context.ok) return context.response
    if (!deliverableId) return jsonError('Thiếu deliverableId.', 400)

    const client = createServiceClient()
    const detail = await loadDeliverableDetail(context.workspaceId, deliverableId)
    if (!detail) return jsonError('Không tìm thấy hạng mục bàn giao.', 404)
    const deliverable = detail.deliverable as {
      id: string
      project_id: string | null
      task_id: string | null
      step_id: string | null
      reviewer_id: string | null
      due_date: string | null
      approved_version_id: string | null
    }

    if (action === 'submitLink') {
      const externalUrl = cleanText(body.externalUrl)
      if (!/^https?:\/\/\S+/i.test(externalUrl)) return jsonError('Link phải bắt đầu bằng http:// hoặc https://.', 400)
      const supersedesVersionId = cleanId(body.supersedesVersionId)
      const replaceReason = cleanText(body.replaceReason) || cleanText(body.changeNote) || 'Tạo version link thay thế.'
      const versionNumber = await nextVersionNumber(deliverableId)
      const versionRes = await client
        .from('deliverable_versions')
        .insert({
          deliverable_id: deliverableId,
          version_number: versionNumber,
          external_url: externalUrl,
          submitted_by: context.personId,
          change_note: cleanText(body.changeNote) || null,
          review_status: 'PENDING_REVIEW',
        })
        .select('id')
        .single()
      if (versionRes.error || !versionRes.data) return jsonError(versionRes.error?.message ?? 'Không lưu được version link.', 500)

      if (supersedesVersionId) {
        const oldVersion = (detail.versions ?? []).find((version) => version.id === supersedesVersionId)
        const oldStatus = normalizeVersionReviewStatus(oldVersion?.review_status)
        await markVersionLifecycleStatus({
          client,
          workspaceId: context.workspaceId,
          actorId: context.personId,
          deliverableId,
          versionId: supersedesVersionId,
          nextStatus: oldStatus === 'APPROVED' ? 'SUPERSEDED' : 'UPLOADED_BY_MISTAKE',
          reason: replaceReason,
          action: oldStatus === 'APPROVED' ? 'deliverable.version.superseded' : 'deliverable.version.marked_mistake',
        })
      }

      await recomputeDeliverableStatus(client, context.workspaceId, context.personId, deliverableId)
      await closeRelatedReminders(context.workspaceId, deliverableId)

      if (body.requiresApproval === true && deliverable.reviewer_id) {
        await ensureApproval({
          workspaceId: context.workspaceId,
          deliverableId,
          projectId: deliverable.project_id,
          taskId: deliverable.task_id,
          stepId: deliverable.step_id,
          requesterId: context.personId,
          approverId: deliverable.reviewer_id,
          dueAt: deliverable.due_date,
        })
      }

      await logActivity(context.workspaceId, context.personId, 'deliverable.version.submitted_link', deliverableId, {
        versionId: versionRes.data.id,
        versionNumber,
        supersedesVersionId,
        before: null,
        after: 'PENDING_REVIEW',
      })
      return NextResponse.json({ ok: true, versionId: versionRes.data.id, versionNumber })
    }

    if (action === 'approve' || action === 'requestRevision' || action === 'markMissing') {
      const versionId = cleanId(body.versionId) ?? (await getLatestVersion(deliverableId))?.id
      if (!versionId) return jsonError('Chưa có version nào để review.', 400)

      const currentVersionRes = await client
        .from('deliverable_versions')
        .select('id,review_status')
        .eq('id', versionId)
        .eq('deliverable_id', deliverableId)
        .maybeSingle()
      if (currentVersionRes.error) return jsonError(currentVersionRes.error.message, 500)
      if (!currentVersionRes.data) return jsonError('Không tìm thấy version cần review.', 404)
      const previousReviewStatus = normalizeVersionReviewStatus(currentVersionRes.data.review_status)
      if (isVersionInvalid(previousReviewStatus)) return jsonError('Version này đã bị đánh dấu up nhầm hoặc đã thay thế, không thể review.', 400)

      const reviewStatus: ReviewStatus = action === 'approve' ? 'APPROVED' : 'REVISION_REQUESTED'
      const nextStatus: DeliverableStatus =
        action === 'approve'
          ? 'APPROVED'
          : action === 'markMissing'
            ? 'MISSING_INFORMATION'
            : 'REVISION_REQUIRED'

      const versionRes = await client
        .from('deliverable_versions')
        .update({
          review_status: reviewStatus,
          review_comment: cleanText(body.reviewComment) || null,
          reviewed_by: context.personId,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', versionId)
        .eq('deliverable_id', deliverableId)
      if (versionRes.error) return jsonError(versionRes.error.message, 500)

      const updatePayload: Record<string, unknown> = {
        status: nextStatus,
        updated_by: context.personId,
        updated_at: new Date().toISOString(),
      }
      if (action === 'approve') updatePayload.approved_version_id = versionId
      const updateRes = await client
        .from('deliverables')
        .update(updatePayload)
        .eq('workspace_id', context.workspaceId)
        .eq('id', deliverableId)
      if (updateRes.error) return jsonError(updateRes.error.message, 500)

      if (action === 'approve') {
        await client
          .from('approvals')
          .update({ status: 'APPROVED', completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq('workspace_id', context.workspaceId)
          .eq('deliverable_id', deliverableId)
      }

      await logActivity(context.workspaceId, context.personId, `deliverable.${action}`, deliverableId, {
        versionId,
        reason: cleanText(body.reviewComment) || null,
        before: previousReviewStatus,
        after: reviewStatus,
      })
      return NextResponse.json({ ok: true })
    }

    if (action === 'deleteVersion') {
      const versionId = cleanId(body.versionId)
      if (!versionId) return jsonError('Thiếu versionId.', 400)
      const reason = cleanText(body.reason)
      if (!reason) return jsonError('Cần nhập lý do trước khi xóa/hủy version.', 400)

      const versionRes = await client
        .from('deliverable_versions')
        .select('id,version_number,review_status')
        .eq('id', versionId)
        .eq('deliverable_id', deliverableId)
        .maybeSingle()
      if (versionRes.error) return jsonError(versionRes.error.message, 500)
      if (!versionRes.data) return jsonError('Không tìm thấy version.', 404)
      if (versionRes.data.review_status === 'APPROVED') return jsonError('Không thể xóa version đã duyệt.', 400)

      await markVersionLifecycleStatus({
        client,
        workspaceId: context.workspaceId,
        actorId: context.personId,
        deliverableId,
        versionId,
        nextStatus: 'UPLOADED_BY_MISTAKE',
        reason,
        action: 'deliverable.version.deleted_soft',
      })
      await recomputeDeliverableStatus(client, context.workspaceId, context.personId, deliverableId)
      return NextResponse.json({ ok: true })
    }

    if (action === 'markVersionMistake' || action === 'supersedeVersion') {
      const versionId = cleanId(body.versionId)
      const reason = cleanText(body.reason)
      if (!versionId) return jsonError('Thiếu versionId.', 400)
      if (!reason) return jsonError('Cần nhập lý do xử lý version.', 400)

      const versionRes = await client
        .from('deliverable_versions')
        .select('id,review_status')
        .eq('id', versionId)
        .eq('deliverable_id', deliverableId)
        .maybeSingle()
      if (versionRes.error) return jsonError(versionRes.error.message, 500)
      if (!versionRes.data) return jsonError('Không tìm thấy version.', 404)

      const previousStatus = normalizeVersionReviewStatus(versionRes.data.review_status)
      if (action === 'markVersionMistake' && previousStatus === 'APPROVED') {
        return jsonError('Version đã duyệt không được đánh dấu up nhầm. Hãy tạo version thay thế hoặc đánh dấu đã thay thế.', 400)
      }
      if (isVersionInvalid(previousStatus)) {
        return jsonError('Version này đã được xử lý trước đó.', 400)
      }

      const nextStatus = action === 'supersedeVersion' ? 'SUPERSEDED' : 'UPLOADED_BY_MISTAKE'
      await markVersionLifecycleStatus({
        client,
        workspaceId: context.workspaceId,
        actorId: context.personId,
        deliverableId,
        versionId,
        nextStatus,
        reason,
        action: action === 'supersedeVersion' ? 'deliverable.version.superseded' : 'deliverable.version.marked_mistake',
      })
      await recomputeDeliverableStatus(client, context.workspaceId, context.personId, deliverableId)
      return NextResponse.json({ ok: true })
    }

    if (action === 'confirmReminder') {
      const confirmedSent = body.confirmedSent === true
      if (!confirmedSent) return NextResponse.json({ ok: true, skipped: true })

      const personId = cleanId(body.personId) ?? cleanId((detail.deliverable as { submitter_id?: string | null }).submitter_id)
      if (!personId) return jsonError('Chưa có người nhận nhắc.', 400)

      const nextFollowUp = new Date()
      nextFollowUp.setDate(nextFollowUp.getDate() + 1)

      const existing = await client
        .from('reminders')
        .select('id,reminder_level')
        .eq('workspace_id', context.workspaceId)
        .eq('deliverable_id', deliverableId)
        .eq('person_id', personId)
        .limit(1)
        .maybeSingle()
      if (existing.error) return jsonError(existing.error.message, 500)

      const reminderPayload = {
        task_id: deliverable.task_id,
        person_id: personId,
        channel: 'messenger',
        response_status: 'REMINDERED',
        status: 'open',
        last_reminded_at: new Date().toISOString(),
        next_follow_up_at: nextFollowUp.toISOString(),
        updated_at: new Date().toISOString(),
      }

      let reminderId = existing.data?.id as string | undefined
      let reminderLevel = (existing.data?.reminder_level ?? 0) + 1
      if (reminderId) {
        const updateRes = await client
          .from('reminders')
          .update({ ...reminderPayload, reminder_level: reminderLevel })
          .eq('id', reminderId)
        if (updateRes.error) return jsonError(updateRes.error.message, 500)
      } else {
        reminderLevel = 1
        const insertRes = await client
          .from('reminders')
          .insert({
            workspace_id: context.workspaceId,
            deliverable_id: deliverableId,
            reminder_level: reminderLevel,
            ...reminderPayload,
          })
          .select('id')
          .single()
        if (insertRes.error || !insertRes.data) return jsonError(insertRes.error?.message ?? 'Không tạo được reminder.', 500)
        reminderId = insertRes.data.id
      }

      await client.from('reminder_logs').insert({
        reminder_id: reminderId,
        sent_by: context.personId,
        channel: 'messenger',
        message_content: cleanText(body.message),
        confirmed_sent: true,
        result: 'REMINDERED',
        follow_up_at: nextFollowUp.toISOString(),
      })

      await logActivity(context.workspaceId, context.personId, 'deliverable.reminder.sent', deliverableId, { reminderLevel })
      return NextResponse.json({ ok: true, reminderLevel })
    }

    return jsonError('Action không được hỗ trợ.', 400)
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Không xử lý được thao tác bàn giao.', 500)
  }
}
