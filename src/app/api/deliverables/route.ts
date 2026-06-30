import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { createClient as createServerClient } from '@/lib/supabase/server'

const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'project-files'

type WorkspaceContext =
  | { ok: true; workspaceId: string; profileId: string; personId: string | null }
  | { ok: false; response: NextResponse }

type DeliverableStatus = 'REQUIRED' | 'NOT_SUBMITTED' | 'SUBMITTED' | 'MISSING_INFORMATION' | 'REVISION_REQUIRED' | 'APPROVED'
type ReviewStatus = 'NOT_REQUESTED' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVISION_REQUESTED' | 'CANCELLED'

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
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data as { id: string; version_number: number; review_status: ReviewStatus } | null
}

async function loadDeliverableDetail(workspaceId: string, deliverableId: string) {
  const client = createServiceClient()
  const deliverableRes = await client
    .from('deliverables')
    .select('id,workspace_id,project_id,task_id,step_id,name,description,type,required_format,submitter_id,reviewer_id,due_date,status,is_required,approved_version_id,created_at,updated_at')
    .eq('workspace_id', workspaceId)
    .eq('id', deliverableId)
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
      const versionNumber = await nextVersionNumber(deliverableId)
      const versionRes = await client
        .from('deliverable_versions')
        .insert({
          deliverable_id: deliverableId,
          version_number: versionNumber,
          external_url: externalUrl,
          submitted_by: context.personId,
          change_note: cleanText(body.changeNote) || null,
          review_status: 'PENDING',
        })
        .select('id')
        .single()
      if (versionRes.error || !versionRes.data) return jsonError(versionRes.error?.message ?? 'Không lưu được version link.', 500)

      const updateRes = await client
        .from('deliverables')
        .update({ status: 'SUBMITTED', updated_by: context.personId, updated_at: new Date().toISOString() })
        .eq('workspace_id', context.workspaceId)
        .eq('id', deliverableId)
      if (updateRes.error) return jsonError(updateRes.error.message, 500)
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

      await logActivity(context.workspaceId, context.personId, 'deliverable.version.submitted_link', deliverableId, { versionNumber })
      return NextResponse.json({ ok: true, versionId: versionRes.data.id, versionNumber })
    }

    if (action === 'approve' || action === 'requestRevision' || action === 'markMissing') {
      const versionId = cleanId(body.versionId) ?? (await getLatestVersion(deliverableId))?.id
      if (!versionId) return jsonError('Chưa có version nào để review.', 400)

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

      await logActivity(context.workspaceId, context.personId, `deliverable.${action}`, deliverableId, { versionId })
      return NextResponse.json({ ok: true })
    }

    if (action === 'deleteVersion') {
      const versionId = cleanId(body.versionId)
      if (!versionId) return jsonError('Thiếu versionId.', 400)
      if (deliverable.approved_version_id === versionId) return jsonError('Không thể xóa version đã duyệt.', 400)

      const versionRes = await client
        .from('deliverable_versions')
        .select('id,attachment_id,review_status')
        .eq('id', versionId)
        .eq('deliverable_id', deliverableId)
        .maybeSingle()
      if (versionRes.error) return jsonError(versionRes.error.message, 500)
      if (!versionRes.data) return jsonError('Không tìm thấy version.', 404)
      if (versionRes.data.review_status === 'APPROVED') return jsonError('Không thể xóa version đã duyệt.', 400)

      const deleteRes = await client.from('deliverable_versions').delete().eq('id', versionId)
      if (deleteRes.error) return jsonError(deleteRes.error.message, 500)
      if (versionRes.data.attachment_id) {
        await client.from('attachments').update({ deleted_at: new Date().toISOString() }).eq('id', versionRes.data.attachment_id)
      }

      const latest = await getLatestVersion(deliverableId)
      const status: DeliverableStatus = latest ? 'SUBMITTED' : 'NOT_SUBMITTED'
      await client
        .from('deliverables')
        .update({ status, updated_by: context.personId, updated_at: new Date().toISOString() })
        .eq('workspace_id', context.workspaceId)
        .eq('id', deliverableId)
      await logActivity(context.workspaceId, context.personId, 'deliverable.version.deleted', deliverableId, { versionId })
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
