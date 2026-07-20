import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { createClient as createServerClient } from '@/lib/supabase/server'
import {
  ensureLocalQaWriteAllowed,
  guardExistingEntityWrite,
  isLocalProductionDatabaseRequest,
  localQaGuardResponse,
} from '@/lib/localQaGuard'
import { resolveRbacUserContext, type RbacClient, type RbacUserContext } from '@/lib/rbac/permissions'
import { canSubmitToDeliverable, RBAC_FORBIDDEN_MESSAGE } from '@/lib/rbac/workspaceResourceAccess'

type FollowUpAction = 'markSent' | 'schedule' | 'escalate'

interface FollowUpItemPayload {
  reminderId?: string | null
  deliverableId?: string | null
  taskId?: string | null
  personId?: string | null
}

interface FollowUpPostBody {
  action?: FollowUpAction
  items?: FollowUpItemPayload[]
  message?: string
  channel?: string
  nextFollowUpAt?: string | null
}

type WorkspaceContext =
  | { ok: true; workspaceId: string; profileId: string; personId: string | null; actor: RbacUserContext }
  | { ok: false; response: NextResponse }

export async function GET(request: NextRequest) {
  const auth = await getWorkspaceContext()
  if (!auth.ok) return auth.response

  const ids = request.nextUrl.searchParams
    .get('reminderIds')
    ?.split(',')
    .map((id) => id.trim())
    .filter(Boolean) ?? []

  if (!ids.length) return NextResponse.json({ logs: [] })

  const client = createServiceClient()
  const allowed = await client
    .from('reminders')
    .select('id')
    .eq('workspace_id', auth.workspaceId)
    .in('id', ids)

  if (allowed.error) return jsonError(allowed.error.message, 500)

  const allowedIds = (allowed.data ?? []).map((row) => row.id)
  if (!allowedIds.length) return NextResponse.json({ logs: [] })

  const logs = await client
    .from('reminder_logs')
    .select('id,reminder_id,sent_by,channel,message_content,sent_at,confirmed_sent,result,follow_up_at')
    .in('reminder_id', allowedIds)
    .order('sent_at', { ascending: false })
    .limit(50)

  if (logs.error) return jsonError(logs.error.message, 500)
  return NextResponse.json({ logs: logs.data ?? [] })
}

export async function POST(request: NextRequest) {
  const auth = await getWorkspaceContext()
  if (!auth.ok) return auth.response

  const body = (await request.json()) as FollowUpPostBody
  const action = body.action
  const items = normalizeItems(body.items ?? [])

  if (!action || !['markSent', 'schedule', 'escalate'].includes(action)) {
    return jsonError('Thao tác follow-up chưa được hỗ trợ.', 400)
  }

  if (!items.length) return jsonError('Thiếu item cần nhắc.', 400)

  const guard = await guardFollowUpWrite(request, auth.workspaceId, body, items)
  if (guard) return guard
  const rbacGuard = await guardFollowUpPermission(auth, items)
  if (rbacGuard) return rbacGuard

  const client = createServiceClient()
  const results: Array<{ reminderId: string; reminderLevel: number }> = []
  const now = new Date().toISOString()
  const nextFollowUpAt = parseDateTime(body.nextFollowUpAt) ?? defaultNextFollowUp()
  const channel = cleanText(body.channel) || 'manual'
  const message = cleanText(body.message)

  for (const item of items) {
    const resolved = await resolveReminderContext(client, auth.workspaceId, item)
    if ('error' in resolved) return jsonError(resolved.error, resolved.status)

    if (action === 'markSent') {
      if (!message) return jsonError('Thiếu nội dung tin nhắc đã gửi.', 400)

      const reminderLevel = resolved.reminder.last_reminded_at
        ? (resolved.reminder.reminder_level ?? 0) + 1
        : Math.max(1, resolved.reminder.reminder_level ?? 0)

      const updateRes = await client
        .from('reminders')
        .update({
          reminder_level: reminderLevel,
          response_status: 'REMINDERED',
          status: 'open',
          last_reminded_at: now,
          next_follow_up_at: nextFollowUpAt,
          updated_at: now,
        })
        .eq('id', resolved.reminder.id)
        .eq('workspace_id', auth.workspaceId)

      if (updateRes.error) return jsonError(updateRes.error.message, 500)

      const logRes = await client.from('reminder_logs').insert({
        reminder_id: resolved.reminder.id,
        sent_by: auth.personId,
        channel,
        message_content: message,
        confirmed_sent: true,
        result: 'REMINDERED',
        follow_up_at: nextFollowUpAt,
      })

      if (logRes.error) return jsonError(logRes.error.message, 500)
      await logActivity(client, auth.workspaceId, auth.personId, 'follow_up.reminder.sent', resolved.reminder.id, {
        reminderLevel,
        channel,
      })
      results.push({ reminderId: resolved.reminder.id, reminderLevel })
    }

    if (action === 'schedule') {
      const updateRes = await client
        .from('reminders')
        .update({
          next_follow_up_at: nextFollowUpAt,
          response_status: resolved.reminder.response_status === 'NOT_REMINDERED' ? 'WAITING_RESPONSE' : resolved.reminder.response_status,
          status: 'open',
          updated_at: now,
        })
        .eq('id', resolved.reminder.id)
        .eq('workspace_id', auth.workspaceId)

      if (updateRes.error) return jsonError(updateRes.error.message, 500)
      await logActivity(client, auth.workspaceId, auth.personId, 'follow_up.reminder.scheduled', resolved.reminder.id, {
        nextFollowUpAt,
      })
      results.push({ reminderId: resolved.reminder.id, reminderLevel: resolved.reminder.reminder_level ?? 0 })
    }

    if (action === 'escalate') {
      const updateRes = await client
        .from('reminders')
        .update({
          response_status: 'ESCALATED',
          status: 'open',
          updated_at: now,
        })
        .eq('id', resolved.reminder.id)
        .eq('workspace_id', auth.workspaceId)

      if (updateRes.error) return jsonError(updateRes.error.message, 500)
      await logActivity(client, auth.workspaceId, auth.personId, 'follow_up.reminder.escalated', resolved.reminder.id, {
        reminderLevel: resolved.reminder.reminder_level ?? 0,
      })
      results.push({ reminderId: resolved.reminder.id, reminderLevel: resolved.reminder.reminder_level ?? 0 })
    }
  }

  return NextResponse.json({ ok: true, results })
}

async function guardFollowUpWrite(
  request: Request,
  workspaceId: string,
  body: FollowUpPostBody,
  items: ReturnType<typeof normalizeItems>,
) {
  if (!isLocalProductionDatabaseRequest(request)) return null

  const client = createServiceClient()
  for (const item of items) {
    if (item.reminderId) {
      const reminder = await client
        .from('reminders')
        .select('id,task_id,deliverable_id')
        .eq('workspace_id', workspaceId)
        .eq('id', item.reminderId)
        .maybeSingle()
      if (reminder.error || !reminder.data) return localQaGuardResponse('Không được thay đổi reminder thật từ localhost.')
      const guard = await guardFollowUpTarget(request, workspaceId, reminder.data.task_id, reminder.data.deliverable_id)
      if (guard) return guard
      continue
    }

    const guard = await guardFollowUpTarget(request, workspaceId, item.taskId, item.deliverableId)
    if (guard) return guard
  }

  return ensureLocalQaWriteAllowed(request, body, 'Muon ghi follow-up QA tu localhost vao production phai bat server-side env ALLOW_LOCAL_PROD_QA_WRITES.')
}

async function guardFollowUpPermission(
  auth: Extract<WorkspaceContext, { ok: true }>,
  items: ReturnType<typeof normalizeItems>,
) {
  const client = createServiceClient()
  for (const item of items) {
    let taskId = item.taskId
    let deliverableId = item.deliverableId
    let personId = item.personId

    if (item.reminderId) {
      const reminder = await client
        .from('reminders')
        .select('task_id,deliverable_id,person_id')
        .eq('workspace_id', auth.workspaceId)
        .eq('id', item.reminderId)
        .maybeSingle()
      if (reminder.error || !reminder.data) return jsonError(RBAC_FORBIDDEN_MESSAGE, 403)
      taskId = reminder.data.task_id
      deliverableId = reminder.data.deliverable_id
      personId = reminder.data.person_id
    }

    if (personId && personId === auth.personId) continue
    if (await canSubmitToDeliverable(auth.actor, auth.workspaceId, deliverableId, { taskId })) continue
    return jsonError(RBAC_FORBIDDEN_MESSAGE, 403)
  }

  return null
}

async function guardFollowUpTarget(
  request: Request,
  workspaceId: string,
  taskId: string | null,
  deliverableId: string | null,
) {
  if (deliverableId) {
    const client = createServiceClient()
    const deliverable = await client
      .from('deliverables')
      .select('id,project_id,task_id,name,description')
      .eq('workspace_id', workspaceId)
      .eq('id', deliverableId)
      .maybeSingle()
    if (deliverable.error || !deliverable.data) return localQaGuardResponse('Không được nhắc file/bàn giao thật từ localhost.')

    if (deliverable.data.project_id) {
      return guardExistingEntityWrite({
        request,
        client,
        table: 'projects',
        id: deliverable.data.project_id,
        workspaceId,
        fields: ['name', 'code'],
        detail: 'Không được nhắc file/bàn giao thuộc dự án thật từ localhost.',
      })
    }

    if (deliverable.data.task_id) {
      return guardExistingEntityWrite({
        request,
        client,
        table: 'tasks',
        id: deliverable.data.task_id,
        workspaceId,
        fields: ['title'],
        detail: 'Không được nhắc file/bàn giao thuộc đầu việc thật từ localhost.',
      })
    }

    return ensureLocalQaWriteAllowed(request, deliverable.data, 'Muon nhac file/ban giao QA tu localhost vao production phai bat server-side env ALLOW_LOCAL_PROD_QA_WRITES.')
  }

  if (taskId) {
    return guardExistingEntityWrite({
      request,
      client: createServiceClient(),
      table: 'tasks',
      id: taskId,
      workspaceId,
      fields: ['title'],
      detail: 'Không được nhắc đầu việc thật từ localhost.',
    })
  }

  return localQaGuardResponse('Không được tạo follow-up không rõ target từ localhost.')
}

async function getWorkspaceContext(): Promise<WorkspaceContext> {
  const sb = await createServerClient()
  const resolution = await resolveRbacUserContext(sb as unknown as RbacClient)

  if (!resolution.ok) {
    switch (resolution.stage) {
      case 'unauthenticated':
        return { ok: false, response: jsonError('Bạn cần đăng nhập trước khi nhắc việc.', 401) }
      case 'profile_error':
        return { ok: false, response: jsonError('Không đọc được hồ sơ đăng nhập.', 500) }
      case 'no_profile':
        return { ok: false, response: jsonError('Tài khoản chưa có profile trong workspace.', 403) }
      case 'membership_error':
        return { ok: false, response: jsonError('Không đọc được quyền workspace.', 500) }
      case 'no_membership':
        return { ok: false, response: jsonError('Tài khoản chưa được gắn workspace.', 403) }
      case 'workspace_mismatch':
        return { ok: false, response: jsonError(RBAC_FORBIDDEN_MESSAGE, 403) }
    }
  }

  const actor = resolution.context
  if (!actor.profileId) return { ok: false, response: jsonError('Tài khoản chưa có profile trong workspace.', 403) }

  return {
    ok: true,
    workspaceId: actor.workspaceId as string,
    profileId: actor.profileId,
    personId: actor.personId,
    actor,
  }
}

async function resolveReminderContext(
  client: ReturnType<typeof createServiceClient>,
  workspaceId: string,
  item: FollowUpItemPayload,
): Promise<{
  reminder: {
    id: string
    reminder_level: number | null
    response_status: string | null
    last_reminded_at: string | null
  }
} | { error: string; status: number }> {
  if (item.reminderId) {
    const existing = await client
      .from('reminders')
      .select('id,task_id,deliverable_id,reminder_level,response_status,last_reminded_at,status')
      .eq('workspace_id', workspaceId)
      .eq('id', item.reminderId)
      .neq('status', 'closed')
      .neq('response_status', 'CLOSED')
      .maybeSingle()

    if (existing.error) return { error: existing.error.message, status: 500 }
    if (!existing.data) return { error: 'Không tìm thấy reminder trong workspace.', status: 404 }
    return { reminder: existing.data }
  }

  const personId = cleanId(item.personId)
  if (!personId) return { error: 'Thiếu người cần nhắc.', status: 400 }

  const deliverableId = cleanId(item.deliverableId)
  const taskId = cleanId(item.taskId)

  if (deliverableId) {
    const deliverable = await client
      .from('deliverables')
      .select('id,task_id')
      .eq('workspace_id', workspaceId)
      .eq('id', deliverableId)
      .is('deleted_at', null)
      .maybeSingle()
    if (deliverable.error) return { error: deliverable.error.message, status: 500 }
    if (!deliverable.data) return { error: 'Không tìm thấy bàn giao trong workspace.', status: 404 }

    const existing = await client
      .from('reminders')
      .select('id,reminder_level,response_status,last_reminded_at')
      .eq('workspace_id', workspaceId)
      .eq('deliverable_id', deliverableId)
      .eq('person_id', personId)
      .limit(1)
      .maybeSingle()
    if (existing.error) return { error: existing.error.message, status: 500 }
    if (existing.data) return { reminder: existing.data }

    const created = await client
      .from('reminders')
      .insert({
        workspace_id: workspaceId,
        task_id: deliverable.data.task_id ?? taskId,
        deliverable_id: deliverableId,
        person_id: personId,
        channel: 'messenger',
        reminder_level: 0,
        response_status: 'NOT_REMINDERED',
        status: 'open',
      })
      .select('id,reminder_level,response_status,last_reminded_at')
      .single()
    if (created.error || !created.data) return { error: created.error?.message ?? 'Không tạo được reminder.', status: 500 }
    return { reminder: created.data }
  }

  if (taskId) {
    const task = await client
      .from('tasks')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('id', taskId)
      .is('deleted_at', null)
      .maybeSingle()
    if (task.error) return { error: task.error.message, status: 500 }
    if (!task.data) return { error: 'Không tìm thấy task trong workspace.', status: 404 }

    const existing = await client
      .from('reminders')
      .select('id,reminder_level,response_status,last_reminded_at')
      .eq('workspace_id', workspaceId)
      .eq('task_id', taskId)
      .eq('person_id', personId)
      .limit(1)
      .maybeSingle()
    if (existing.error) return { error: existing.error.message, status: 500 }
    if (existing.data) return { reminder: existing.data }

    const created = await client
      .from('reminders')
      .insert({
        workspace_id: workspaceId,
        task_id: taskId,
        person_id: personId,
        channel: 'messenger',
        reminder_level: 0,
        response_status: 'NOT_REMINDERED',
        status: 'open',
      })
      .select('id,reminder_level,response_status,last_reminded_at')
      .single()
    if (created.error || !created.data) return { error: created.error?.message ?? 'Không tạo được reminder.', status: 500 }
    return { reminder: created.data }
  }

  return { error: 'Thiếu task hoặc bàn giao cần nhắc.', status: 400 }
}

async function logActivity(
  client: ReturnType<typeof createServiceClient>,
  workspaceId: string,
  actorId: string | null,
  action: string,
  entityId: string,
  metadata: Record<string, unknown>,
) {
  await client.from('activity_logs').insert({
    workspace_id: workspaceId,
    actor_id: actorId,
    action,
    entity_type: 'reminder',
    entity_id: entityId,
    metadata,
  })
}

function normalizeItems(items: FollowUpItemPayload[]) {
  return items
    .map((item) => ({
      reminderId: cleanId(item.reminderId),
      deliverableId: cleanId(item.deliverableId),
      taskId: cleanId(item.taskId),
      personId: cleanId(item.personId),
    }))
    .filter((item) => item.reminderId || item.deliverableId || item.taskId)
}

function parseDateTime(value: unknown) {
  const text = cleanText(value)
  if (!text) return null
  const parsed = new Date(text)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

function defaultNextFollowUp() {
  const next = new Date()
  next.setDate(next.getDate() + 1)
  return next.toISOString()
}

function cleanText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function cleanId(value: unknown) {
  const text = cleanText(value)
  return text || null
}

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}
