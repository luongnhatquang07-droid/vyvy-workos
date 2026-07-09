import { NextResponse } from 'next/server'
import { EMPTY_SIDEBAR_COUNTS } from '@/lib/data/queries/sidebarCounts'
import { createClient } from '@/lib/supabase/server'

const OPEN_APPROVAL_STATUSES = [
  'NOT_REQUESTED',
  'PENDING',
  'PENDING_REVIEW',
  'PENDING_APPROVAL',
  'SUBMITTED',
  'WAITING_APPROVAL',
]

export async function GET() {
  const sb = await createClient()
  const {
    data: { user },
  } = await sb.auth.getUser()

  if (!user) return NextResponse.json({ counts: EMPTY_SIDEBAR_COUNTS }, { status: 401 })

  const profileRes = await sb
    .from('profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (profileRes.error || !profileRes.data?.id) {
    return NextResponse.json({ counts: EMPTY_SIDEBAR_COUNTS }, { status: profileRes.error ? 500 : 403 })
  }

  const membershipRes = await sb
    .from('workspace_memberships')
    .select('workspace_id')
    .eq('profile_id', profileRes.data.id)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()

  const workspaceId = membershipRes.data?.workspace_id
  if (membershipRes.error || !workspaceId) {
    return NextResponse.json({ counts: EMPTY_SIDEBAR_COUNTS }, { status: membershipRes.error ? 500 : 403 })
  }

  const today = dateKey(new Date())
  const tomorrow = dateKey(addDays(new Date(), 1))

  const [
    projectsRes,
    draftsRes,
    approvalsRes,
    remindersRes,
    overdueTasksRes,
    overdueDeliverablesRes,
    ceoRes,
    meetingsRes,
  ] = await Promise.all([
    countQuery(sb.from('projects').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).is('deleted_at', null)),
    countQuery(sb.from('meeting_task_drafts').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).neq('import_status', 'imported')),
    countQuery(sb.from('approvals').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).in('status', OPEN_APPROVAL_STATUSES)),
    countQuery(
      sb.from('reminders')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
        .not('response_status', 'in', '(CLOSED,FILE_SUBMITTED)')
        .or(`next_follow_up_at.is.null,next_follow_up_at.lte.${today}`),
    ),
    countQuery(
      sb.from('tasks')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
        .is('deleted_at', null)
        .lt('due_date', today)
        .not('status', 'in', '(COMPLETED,CANCELLED,WAITING)'),
    ),
    countQuery(
      sb.from('deliverables')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
        .is('deleted_at', null)
        .lt('due_date', today)
        .not('status', 'in', '(SUBMITTED,APPROVED)'),
    ),
    countQuery(sb.from('ceo_decision_requests').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).neq('status', 'closed')),
    countQuery(
      sb.from('meetings')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
        .is('deleted_at', null)
        .gte('start_at', `${today}T00:00:00`)
        .lt('start_at', `${tomorrow}T00:00:00`),
    ),
  ])

  const counts = {
    'command-center': draftsRes + approvalsRes + remindersRes + overdueTasksRes + ceoRes,
    meetings: meetingsRes,
    'task-inbox': draftsRes,
    'follow-ups': remindersRes,
    projects: projectsRes,
    approvals: approvalsRes,
    deliverables: overdueDeliverablesRes,
    'ceo-reports': ceoRes,
  }

  return NextResponse.json({ counts })
}

async function countQuery(query: PromiseLike<{ count: number | null }>) {
  const { count } = await query
  return count ?? 0
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
