import type {
  Task, Meeting, Deliverable, Reminder, Approval, CEODecisionRequest,
  Person, Project, KPIData, PriorityItem, COOSummary, MeetingTaskDraft,
} from './types'
import { TODAY } from './data/mock-data'

// ---- Date helpers ----

export function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000)
}

export function daysOverdue(dueDate: string): number {
  return Math.max(0, daysBetween(dueDate, TODAY))
}

export function isToday(date: string) { return date === TODAY }
export function isTomorrow(date: string) { return daysBetween(TODAY, date) === 1 }
export function isDueSoon(date: string) {
  const d = daysBetween(TODAY, date)
  return d >= 0 && d <= 3
}

export function formatDate(iso: string): string {
  const [, mm, dd] = iso.split('-')
  return `${dd}/${mm}`
}

export function formatRelativeDate(iso: string): string {
  const d = daysBetween(TODAY, iso)
  if (d < 0) return `Quá hạn ${Math.abs(d)} ngày`
  if (d === 0) return 'Hôm nay'
  if (d === 1) return 'Ngày mai'
  return `${d} ngày nữa`
}

// ---- KPI counting ----

export function computeKPI(
  meetings: Meeting[],
  taskDrafts: MeetingTaskDraft[],
  tasks: Task[],
  deliverables: Deliverable[],
  reminders: Reminder[],
  approvals: Approval[],
  ceoRequests: CEODecisionRequest[],
): KPIData {
  const meetingsToday = meetings.filter(m => isToday(m.date) && m.status !== 'done').length

  const unimportedDrafts = taskDrafts.filter(d => !d.imported).length

  const owingPeople = new Set<string>()
  deliverables.filter(d => d.status === 'missing' || d.status === 'draft').forEach(d => owingPeople.add(d.ownerId))
  reminders.filter(r => r.response === 'no_response').forEach(r => owingPeople.add(r.personId))
  const pendingDeliverable = owingPeople.size

  const overdueItems =
    tasks.filter(t => t.status === 'overdue').length +
    deliverables.filter(d => d.status === 'missing' && daysBetween(d.dueDate, TODAY) > 0).length

  const pendingApprovals = approvals.filter(a => a.status === 'pending' || a.status === 'overdue').length

  const ceoItems = ceoRequests.length

  return { meetingsToday, unimportedDrafts, pendingDeliverable, overdueItems, pendingApprovals, ceoItems }
}

// ---- Priority list builder ----

const PRIORITY_ORDER: Record<string, number> = {
  task_overdue_critical: 1,
  ceo_escalation_critical: 2,
  task_overdue_high: 3,
  approval_urgent: 4,
  task_due_today: 5,
  deliverable_missing: 6,
  meeting_no_tasks: 7,
  reminder_pending: 8,
  ceo_escalation_warning: 9,
  task_overdue_medium: 10,
}

function rank(type: string, priority: string): number {
  return PRIORITY_ORDER[`${type}_${priority}`] ?? PRIORITY_ORDER[type] ?? 99
}

export function buildPriorityList(
  tasks: Task[],
  meetings: Meeting[],
  deliverables: Deliverable[],
  reminders: Reminder[],
  approvals: Approval[],
  ceoRequests: CEODecisionRequest[],
  people: Person[],
  projects: Project[],
): PriorityItem[] {
  const byPerson = Object.fromEntries(people.map(p => [p.id, p]))
  const byProject = Object.fromEntries(projects.map(p => [p.id, p]))

  const items: PriorityItem[] = []

  // Overdue tasks
  tasks.filter(t => t.status === 'overdue').forEach(t => {
    const owner = byPerson[t.ownerId]
    const project = t.projectId ? byProject[t.projectId] : undefined
    items.push({
      id: t.id,
      type: 'task_overdue',
      title: t.title,
      subtitle: `Quá hạn ${daysOverdue(t.dueDate)} ngày`,
      projectName: project?.name,
      personName: owner?.name,
      dueDate: t.dueDate,
      priority: t.priority,
      status: `Quá hạn ${daysOverdue(t.dueDate)}n`,
      statusVariant: 'danger',
      nextAction: 'Nhắc người phụ trách',
      sourceModule: 'tasks',
      sourceId: t.id,
      futureRoute: t.futureRoute,
    })
  })

  // Due today tasks
  tasks.filter(t => t.status === 'due_today').forEach(t => {
    const owner = byPerson[t.ownerId]
    const project = t.projectId ? byProject[t.projectId] : undefined
    items.push({
      id: t.id,
      type: 'task_due_today',
      title: t.title,
      subtitle: 'Đến hạn hôm nay',
      projectName: project?.name,
      personName: owner?.name,
      dueDate: t.dueDate,
      priority: t.priority,
      status: 'Hôm nay',
      statusVariant: 'warning',
      nextAction: 'Kiểm tra tiến độ',
      sourceModule: 'tasks',
      sourceId: t.id,
      futureRoute: t.futureRoute,
    })
  })

  // Meetings needing action
  meetings.filter(m => ['no_minutes', 'draft_pending', 'minutes_no_tasks', 'follow_up_needed'].includes(m.status))
    .forEach(m => {
      const project = m.projectId ? byProject[m.projectId] : undefined
      const statusLabelMap: Record<string, string> = {
        no_minutes: 'Chưa có biên bản',
        draft_pending: `${m.taskDraftCount} draft chưa nhập`,
        minutes_no_tasks: 'Chưa ra đầu việc',
        follow_up_needed: 'Cần follow-up',
      }
      const statusLabel = statusLabelMap[m.status] ?? m.status
      items.push({
        id: m.id,
        type: 'meeting_no_tasks',
        title: m.title,
        subtitle: `${formatDate(m.date)} ${m.time}`,
        projectName: project?.name,
        dueDate: m.date,
        priority: isToday(m.date) ? 'high' : 'medium',
        status: statusLabel,
        statusVariant: isToday(m.date) ? 'warning' : 'default',
        nextAction: m.status === 'draft_pending' ? 'Nhập đầu việc' : 'Thêm biên bản',
        sourceModule: 'meetings',
        sourceId: m.id,
        futureRoute: m.futureRoute,
      })
    })

  // Missing deliverables
  deliverables.filter(d => d.status === 'missing').forEach(d => {
    const owner = byPerson[d.ownerId]
    const project = d.projectId ? byProject[d.projectId] : undefined
    items.push({
      id: d.id,
      type: 'deliverable_missing',
      title: d.title,
      subtitle: `Quá hạn ${daysOverdue(d.dueDate)} ngày`,
      projectName: project?.name,
      personName: owner?.name,
      dueDate: d.dueDate,
      priority: daysOverdue(d.dueDate) > 3 ? 'high' : 'medium',
      status: 'Thiếu',
      statusVariant: 'danger',
      nextAction: 'Gửi nhắc',
      sourceModule: 'deliverables',
      sourceId: d.id,
      futureRoute: d.futureRoute,
    })
  })

  // Urgent approvals
  approvals.filter(a => a.status === 'overdue' || (a.status === 'pending' && a.daysWaiting >= 3)).forEach(a => {
    const project = a.projectId ? byProject[a.projectId] : undefined
    items.push({
      id: a.id,
      type: 'approval_urgent',
      title: a.title,
      subtitle: `Chờ ${a.daysWaiting} ngày`,
      projectName: project?.name,
      personName: byPerson[a.approverId]?.name,
      dueDate: a.deadline,
      priority: a.status === 'overdue' ? 'critical' : 'high',
      status: a.status === 'overdue' ? 'Trễ duyệt' : 'Chờ duyệt lâu',
      statusVariant: a.status === 'overdue' ? 'danger' : 'warning',
      nextAction: 'Nhắc người duyệt',
      sourceModule: 'approvals',
      sourceId: a.id,
      futureRoute: a.futureRoute,
    })
  })

  // CEO escalations
  ceoRequests.filter(c => c.severity === 'critical').forEach(c => {
    const project = c.projectId ? byProject[c.projectId] : undefined
    items.push({
      id: c.id,
      type: 'ceo_escalation',
      title: c.title,
      subtitle: c.issue.slice(0, 80) + (c.issue.length > 80 ? '…' : ''),
      projectName: project?.name,
      dueDate: c.createdDate,
      priority: 'critical',
      status: 'Cần báo CEO',
      statusVariant: 'danger',
      nextAction: 'Báo CEO ngay',
      sourceModule: 'ceo_requests',
      sourceId: c.id,
      futureRoute: c.futureRoute,
    })
  })

  // Pending reminders with no response
  reminders.filter(r => r.response === 'no_response').forEach(r => {
    const person = byPerson[r.personId]
    items.push({
      id: r.id,
      type: 'reminder_pending',
      title: r.content,
      subtitle: `Đã nhắc ${r.reminderCount} lần — chưa phản hồi`,
      personName: person?.name,
      dueDate: r.dueDate,
      priority: r.reminderCount >= 2 ? 'high' : 'medium',
      status: 'Chưa phản hồi',
      statusVariant: 'warning',
      nextAction: 'Nhắc thêm lần nữa',
      sourceModule: 'reminders',
      sourceId: r.id,
      futureRoute: r.futureRoute,
    })
  })

  // Sort by priority
  items.sort((a, b) => rank(a.type, a.priority) - rank(b.type, b.priority))
  return items
}

// ---- COO summary rule engine ----

export function buildCOOSummary(
  tasks: Task[],
  ceoRequests: CEODecisionRequest[],
  approvals: Approval[],
  reminders: Reminder[],
  meetings: Meeting[],
): COOSummary {
  const overdueCount = tasks.filter(t => t.status === 'overdue').length
  const criticalCEO = ceoRequests.filter(c => c.severity === 'critical')
  const lateApprovals = approvals.filter(a => a.status === 'overdue' || a.daysWaiting >= 3)
  const noResponseReminders = reminders.filter(r => r.response === 'no_response')
  const pendingMeetings = meetings.filter(m => m.status === 'draft_pending')

  const urgentItems: string[] = []
  if (criticalCEO.length > 0) urgentItems.push(`${criticalCEO.length} vấn đề nghiêm trọng cần báo CEO ngay hôm nay`)
  if (overdueCount > 0) urgentItems.push(`${overdueCount} việc đã quá hạn, trong đó có báo cáo tài chính Q2`)
  if (lateApprovals.length > 0) urgentItems.push(`${lateApprovals.length} yêu cầu phê duyệt đang trễ hoặc sắp trễ`)

  const risks: string[] = []
  risks.push('ERP có nguy cơ trễ Go-live — vendor chưa xác nhận timeline mới')
  risks.push('Báo cáo tài chính Q2 trễ có thể vi phạm hợp đồng kiểm toán')

  const watchItems: string[] = []
  if (pendingMeetings.length > 0) watchItems.push(`${pendingMeetings[0].title} có ${pendingMeetings[0].taskDraftCount} draft chưa import`)
  if (noResponseReminders.length > 0) watchItems.push(`${noResponseReminders.length} người chưa phản hồi nhắc việc`)

  const proposedActions: string[] = []
  proposedActions.push('Báo CEO về ERP và báo cáo tài chính trước 12:00 hôm nay')
  if (pendingMeetings.length > 0) proposedActions.push(`Nhập ${pendingMeetings[0].taskDraftCount} đầu việc từ họp ERP vào Task Inbox`)
  proposedActions.push('Nhắc Hùng Trần về roadmap ERP (chưa phản hồi lần 2)')

  return { urgentItems, risks, watchItems, proposedActions }
}

// ---- Filter helpers ----

export function filterPriorityItems(
  items: PriorityItem[],
  filter: string,
): PriorityItem[] {
  switch (filter) {
    case 'today':
      return items.filter(i => i.dueDate === TODAY)
    case 'next_24h':
      return items.filter(i => i.dueDate && daysBetween(TODAY, i.dueDate) <= 1)
    case 'overdue':
      return items.filter(i => i.statusVariant === 'danger' && i.type !== 'ceo_escalation')
    case 'waiting':
      return items.filter(i => i.statusVariant === 'waiting' || i.type === 'reminder_pending')
    case 'pending_approval':
      return items.filter(i => i.type === 'approval_urgent')
    case 'ceo_report':
      return items.filter(i => i.type === 'ceo_escalation')
    default:
      return items
  }
}
