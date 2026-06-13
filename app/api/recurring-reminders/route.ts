import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const APP_TIME_ZONE = 'Asia/Bangkok'
const APP_TIME_ZONE_OFFSET_MINUTES = 7 * 60

type RecurringTask = {
  id: string
  title: string
  description: string | null
  kind: string
  frequency: string
  weekday: number | null
  month_day: number | null
  time_of_day: string
  assignee_id: string | null
  recipient_ids?: string[] | null
  remind_days_before: number
  remind_minutes_before: number
  is_active: boolean
  notified_early_for: string | null
  notified_near_for: string | null
}

function recurringRecipientIds(task: RecurringTask): string[] {
  const ids = new Set<string>()
  ;(task.recipient_ids || []).forEach((id) => { if (id) ids.add(id) })
  if (task.assignee_id) ids.add(task.assignee_id)
  return Array.from(ids)
}

type AuthorizedActor = {
  source: 'cron' | 'manual' | 'local-dev'
  actorId: string | null
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error('Missing Supabase server environment variables')
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

function appNow(date: Date) {
  return new Date(date.getTime() + APP_TIME_ZONE_OFFSET_MINUTES * 60_000)
}

function appDateToUtc(year: number, month: number, day: number, hour: number, minute: number) {
  return new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0) - APP_TIME_ZONE_OFFSET_MINUTES * 60_000)
}

function nextOccurrence(task: RecurringTask, from = new Date()): Date {
  const [hour = 9, minute = 0] = (task.time_of_day || '09:00').split(':').map(Number)
  const local = appNow(from)
  const year = local.getUTCFullYear()
  const month = local.getUTCMonth() + 1
  const day = local.getUTCDate()
  const candidate = appDateToUtc(year, month, day, hour, minute)

  if (task.frequency === 'daily') {
    if (candidate <= from) {
      const nextLocal = appNow(new Date(candidate.getTime() + 24 * 60 * 60_000))
      return appDateToUtc(nextLocal.getUTCFullYear(), nextLocal.getUTCMonth() + 1, nextLocal.getUTCDate(), hour, minute)
    }
    return candidate
  }

  if (task.frequency === 'weekly') {
    const target = task.weekday ?? 1
    let diff = (target - local.getUTCDay() + 7) % 7
    if (diff === 0 && candidate <= from) diff = 7
    const nextLocal = new Date(Date.UTC(year, month - 1, day + diff, hour, minute, 0, 0))
    return appDateToUtc(nextLocal.getUTCFullYear(), nextLocal.getUTCMonth() + 1, nextLocal.getUTCDate(), hour, minute)
  }

  const monthDay = Math.max(1, Math.min(28, task.month_day ?? 1))
  let targetYear = year
  let targetMonth = month
  let monthly = appDateToUtc(targetYear, targetMonth, monthDay, hour, minute)

  if (monthly <= from) {
    targetMonth += 1
    if (targetMonth > 12) {
      targetMonth = 1
      targetYear += 1
    }
    monthly = appDateToUtc(targetYear, targetMonth, monthDay, hour, minute)
  }

  return monthly
}

function occurrenceKey(task: RecurringTask, occurrence: Date): string {
  const local = appNow(occurrence)
  return [
    local.getUTCFullYear(),
    String(local.getUTCMonth() + 1).padStart(2, '0'),
    String(local.getUTCDate()).padStart(2, '0'),
  ].join('-') + `T${task.time_of_day}`
}

function formatOccurrence(occurrence: Date): string {
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: APP_TIME_ZONE,
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(occurrence)
}

async function authorize(request: Request, supabase: ReturnType<typeof serviceClient>): Promise<AuthorizedActor | null> {
  const authHeader = request.headers.get('authorization') || ''
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return { source: 'cron', actorId: null }
  }

  const host = request.headers.get('host') || ''
  if (!authHeader && process.env.NODE_ENV !== 'production' && (host.startsWith('localhost') || host.startsWith('127.'))) {
    return { source: 'local-dev', actorId: null }
  }

  if (!authHeader.startsWith('Bearer ')) return null

  const token = authHeader.slice('Bearer '.length)
  const { data: userData, error: userError } = await supabase.auth.getUser(token)
  const user = userData?.user
  if (userError || !user) return null

  let { data: employee } = await supabase
    .from('employees')
    .select('id, role, can_view_all, can_manage_tasks, can_manage_users')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!employee && user.email) {
    const byEmail = await supabase
      .from('employees')
      .select('id, role, can_view_all, can_manage_tasks, can_manage_users')
      .eq('email', user.email)
      .maybeSingle()
    employee = byEmail.data
  }

  if (!employee) return null

  const role = employee.role || 'employee'
  const canRun =
    role === 'ceo' ||
    role === 'coo' ||
    role === 'admin' ||
    Boolean(employee.can_view_all || employee.can_manage_tasks || employee.can_manage_users)

  if (!canRun) return null

  return { source: 'manual', actorId: employee.id }
}

async function createRunLog(
  supabase: ReturnType<typeof serviceClient>,
  actor: AuthorizedActor,
  status: 'running' | 'success' | 'error',
  detail: Record<string, unknown>
) {
  const { data } = await supabase
    .from('recurring_task_runs')
    .insert({
      source: actor.source,
      status,
      triggered_by: actor.actorId,
      detail,
    })
    .select('id')
    .maybeSingle()

  return data?.id as string | undefined
}

async function finishRunLog(
  supabase: ReturnType<typeof serviceClient>,
  runId: string | undefined,
  status: 'success' | 'error',
  detail: Record<string, unknown>
) {
  if (!runId) return
  const scanned = typeof detail.scanned === 'number' ? detail.scanned : null
  const notificationsSent = typeof detail.notificationsSent === 'number' ? detail.notificationsSent : null

  await supabase
    .from('recurring_task_runs')
    .update({
      status,
      finished_at: new Date().toISOString(),
      scanned,
      notifications_sent: notificationsSent,
      detail,
    })
    .eq('id', runId)
}

async function processReminders(supabase: ReturnType<typeof serviceClient>, actor: AuthorizedActor) {
  const now = new Date()
  const { data, error } = await supabase
    .from('recurring_tasks')
    .select('*')
    .eq('is_active', true)

  if (error) throw error

  const tasks = (data || []) as RecurringTask[]
  const reminders: Array<{
    taskId: string
    title: string
    kind: 'early' | 'near'
    occurrence: string
    recipientId: string
  }> = []

  for (const task of tasks) {
    const recipients = recurringRecipientIds(task)
    if (recipients.length === 0) continue

    const occurrence = nextOccurrence(task, now)
    const key = occurrenceKey(task, occurrence)
    const msTo = occurrence.getTime() - now.getTime()
    const nearWindowMs = Math.max(1, task.remind_minutes_before || 60) * 60_000
    const earlyWindowMs = Math.max(0, task.remind_days_before || 0) * 86_400_000

    if (
      (task.frequency === 'weekly' || task.frequency === 'monthly') &&
      earlyWindowMs > 0 &&
      msTo <= earlyWindowMs &&
      msTo > nearWindowMs &&
      task.notified_early_for !== key
    ) {
      const { data: claimed } = await supabase
        .from('recurring_tasks')
        .update({ notified_early_for: key })
        .eq('id', task.id)
        .or(`notified_early_for.is.null,notified_early_for.neq."${key}"`)
        .select('id')

      if (claimed && claimed.length > 0) {
        await supabase.from('notifications').insert(recipients.map((recipient_id) => ({
          recipient_id,
          type: 'recurring_reminder',
          title: `Sắp tới: ${task.title}`,
          body: `${formatOccurrence(occurrence)} - chuẩn bị trước cho việc định kỳ.`,
        })))
        reminders.push(...recipients.map((recipientId) => ({
          taskId: task.id,
          title: task.title,
          kind: 'early' as const,
          occurrence: occurrence.toISOString(),
          recipientId,
        })))
      }
    }

    if (msTo > 0 && msTo <= nearWindowMs && task.notified_near_for !== key) {
      const { data: claimed } = await supabase
        .from('recurring_tasks')
        .update({ notified_near_for: key })
        .eq('id', task.id)
        .or(`notified_near_for.is.null,notified_near_for.neq."${key}"`)
        .select('id')

      if (claimed && claimed.length > 0) {
        const minutes = Math.ceil(msTo / 60_000)
        await supabase.from('notifications').insert(recipients.map((recipient_id) => ({
          recipient_id,
          type: 'recurring_reminder',
          title: task.kind === 'meeting'
            ? `Còn ${minutes} phút nữa họp: ${task.title}`
            : `Sắp đến hạn nộp: ${task.title}`,
          body: `${formatOccurrence(occurrence)} - giờ đã hẹn trong việc định kỳ.`,
        })))
        reminders.push(...recipients.map((recipientId) => ({
          taskId: task.id,
          title: task.title,
          kind: 'near' as const,
          occurrence: occurrence.toISOString(),
          recipientId,
        })))
      }
    }
  }

  return {
    ok: true,
    source: actor.source,
    timeZone: APP_TIME_ZONE,
    now: now.toISOString(),
    scanned: tasks.length,
    notificationsSent: reminders.length,
    reminders,
  }
}

async function handle(request: Request) {
  const supabase = serviceClient()
  const actor = await authorize(request, supabase)

  if (!actor) {
    return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const runId = await createRunLog(supabase, actor, 'running', { startedAt: new Date().toISOString() })

  try {
    const result = await processReminders(supabase, actor)
    await finishRunLog(supabase, runId, 'success', result)
    return Response.json(result)
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : error && typeof error === 'object' && 'message' in error
          ? String(error.message)
          : 'Unknown recurring reminder error'
    const detail = {
      ok: false,
      error: message,
    }
    await finishRunLog(supabase, runId, 'error', detail)
    return Response.json(detail, { status: 500 })
  }
}

export async function GET(request: Request) {
  return handle(request)
}

export async function POST(request: Request) {
  return handle(request)
}
