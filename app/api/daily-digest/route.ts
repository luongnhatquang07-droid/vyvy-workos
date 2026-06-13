import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const APP_TIME_ZONE = 'Asia/Bangkok'
const APP_TIME_ZONE_OFFSET_MINUTES = 7 * 60

type Task = {
  id: string
  title: string
  due_date: string | null
  status: string | null
  issue_status: string | null
  assignee_id: string | null
  head_id: string | null
  priority: string | null
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

function vietnamTodayString(now: Date): string {
  const local = appNow(now)
  const y = local.getUTCFullYear()
  const m = String(local.getUTCMonth() + 1).padStart(2, '0')
  const d = String(local.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function formatDateViVN(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: APP_TIME_ZONE,
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
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

function priorityRank(p: string | null): number {
  return p === 'high' ? 0 : p === 'medium' ? 1 : 2
}

function buildNotificationContent(
  today: string,
  dueToday: Task[],
  overdue: Task[]
): { title: string; body: string } {
  const dateLabel = formatDateViVN(today)

  let title: string
  if (overdue.length > 0 && dueToday.length > 0) {
    title = `📋 ${dateLabel}: ${dueToday.length} việc hôm nay · ${overdue.length} việc đang trễ`
  } else if (dueToday.length > 0) {
    title = `📋 Hôm nay, ${dateLabel}: ${dueToday.length} việc phải xong`
  } else {
    title = `⚠️ ${overdue.length} việc đang trễ hạn`
  }

  // Uu tien "nen lam truoc": viec tre (tre lau nhat truoc) -> viec hom nay (uu tien cao truoc)
  const overdueSorted = [...overdue].sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''))
  const dueSorted = [...dueToday].sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority))
  const ordered = [...overdueSorted, ...dueSorted]
  const top = ordered.slice(0, 3).map((t, i) => `${i + 1}. ${t.title}`)
  const remaining = ordered.length - top.length
  let body = `Nên làm trước — ${top.join(' · ')}`
  if (remaining > 0) {
    body += ` · +${remaining} việc khác`
  }

  return { title, body }
}

async function processDailyDigest(supabase: ReturnType<typeof serviceClient>, actor: AuthorizedActor) {
  const now = new Date()
  const today = vietnamTodayString(now)

  const { data, error } = await supabase
    .from('tasks')
    .select('id, title, due_date, status, issue_status, assignee_id, head_id, priority')
    .not('status', 'eq', 'completed')
    .not('status', 'eq', 'cancelled')
    .limit(5000)

  if (error) throw error

  const tasks = (data || []) as Task[]

  const dueTodayTasks: Task[] = []
  const overdueTasks: Task[] = []

  for (const task of tasks) {
    if (!task.due_date) continue
    const dueDate = task.due_date.slice(0, 10)
    if (dueDate === today) {
      dueTodayTasks.push(task)
    } else if (dueDate < today) {
      overdueTasks.push(task)
    }
  }

  // Batch update issue_status = 'problem' for overdue tasks
  const overdueIds = overdueTasks.map((t) => t.id)
  if (overdueIds.length > 0) {
    await supabase
      .from('tasks')
      .update({ issue_status: 'problem' })
      .in('id', overdueIds)
      .neq('issue_status', 'problem')
  }

  // Build map: employeeId → { dueToday, overdue }
  const employeeMap = new Map<string, { dueToday: Task[]; overdue: Task[] }>()

  function addToMap(employeeId: string | null, task: Task, bucket: 'dueToday' | 'overdue') {
    if (!employeeId) return
    if (!employeeMap.has(employeeId)) {
      employeeMap.set(employeeId, { dueToday: [], overdue: [] })
    }
    employeeMap.get(employeeId)![bucket].push(task)
  }

  for (const task of dueTodayTasks) {
    const recipients = new Set<string>()
    if (task.assignee_id) recipients.add(task.assignee_id)
    if (task.head_id) recipients.add(task.head_id)
    for (const id of recipients) {
      addToMap(id, task, 'dueToday')
    }
  }

  for (const task of overdueTasks) {
    const recipients = new Set<string>()
    if (task.assignee_id) recipients.add(task.assignee_id)
    if (task.head_id) recipients.add(task.head_id)
    for (const id of recipients) {
      addToMap(id, task, 'overdue')
    }
  }

  // Build notifications, cap at 50
  const notificationsToInsert: Array<{
    recipient_id: string
    type: string
    title: string
    body: string
  }> = []

  for (const [employeeId, { dueToday, overdue }] of employeeMap.entries()) {
    if (dueToday.length === 0 && overdue.length === 0) continue
    if (notificationsToInsert.length >= 50) break

    const { title, body } = buildNotificationContent(today, dueToday, overdue)
    notificationsToInsert.push({
      recipient_id: employeeId,
      type: 'daily_digest',
      title,
      body,
    })
  }

  if (notificationsToInsert.length > 0) {
    await supabase.from('notifications').insert(notificationsToInsert)
  }

  return {
    ok: true,
    source: actor.source,
    timeZone: APP_TIME_ZONE,
    today,
    now: now.toISOString(),
    scanned: tasks.length,
    dueTodayCount: dueTodayTasks.length,
    overdueCount: overdueTasks.length,
    overdueMarkedProblem: overdueIds.length,
    notificationsSent: notificationsToInsert.length,
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
    const result = await processDailyDigest(supabase, actor)
    await finishRunLog(supabase, runId, 'success', result)
    return Response.json(result)
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : error && typeof error === 'object' && 'message' in error
          ? String((error as { message: unknown }).message)
          : 'Unknown daily digest error'
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
