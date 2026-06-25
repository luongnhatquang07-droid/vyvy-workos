import type {
  Task, Meeting, Reminder, Approval, CEODecisionRequest,
  Person, Project, ChaseItem,
  KPIData, PriorityItem, COOSummary, SummaryBannerData,
} from './types'

const TODAY_STR = '2026-06-25'

export function formatRelativeDate(iso: string): string {
  if (iso === TODAY_STR) return 'Hôm nay'
  if (iso < TODAY_STR) {
    const days = Math.round((new Date(TODAY_STR).getTime() - new Date(iso).getTime()) / 86400000)
    return `Trễ ${days} ngày`
  }
  const days = Math.round((new Date(iso).getTime() - new Date(TODAY_STR).getTime()) / 86400000)
  if (days === 1) return 'Ngày mai'
  return iso.slice(5).replace('-', '/')
}

export function computeKPI(
  meetings: Meeting[], tasks: Task[], approvals: Approval[],
  ceoRequests: CEODecisionRequest[], reminders: Reminder[],
): KPIData {
  return {
    meetingsToday: meetings.filter(m => m.date === TODAY_STR).length,
    unimportedDrafts: meetings.reduce((acc, m) => acc + (m.taskDraftCount - m.importedTaskCount), 0),
    pendingDeliverable: new Set(reminders.filter(r => r.response !== 'CLOSED' && r.response !== 'FILE_SUBMITTED').map(r => r.personId)).size,
    overdueItems: tasks.filter(t => t.dueDate < TODAY_STR && t.status !== 'COMPLETED' && t.status !== 'CANCELLED' && t.status !== 'WAITING').length,
    pendingApprovals: approvals.filter(a => a.status === 'pending' || a.status === 'overdue').length,
    ceoItems: ceoRequests.length,
  }
}

export function buildPriorityList(
  tasks: Task[], meetings: Meeting[], approvals: Approval[],
  ceoRequests: CEODecisionRequest[], people: Person[], projects: Project[],
): PriorityItem[] {
  const byPerson = Object.fromEntries(people.map(p => [p.id, p]))
  const byProject = Object.fromEntries(projects.map(p => [p.id, p]))
  const items: PriorityItem[] = []

  tasks.forEach(t => {
    const isOverdue = t.dueDate < TODAY_STR
    const isToday = t.dueDate === TODAY_STR
    if (!isOverdue && !isToday && t.urgency !== 'CRITICAL' && t.urgency !== 'HIGH') return
    const owner = byPerson[t.ownerId]
    const project = t.projectId ? byProject[t.projectId] : undefined
    let statusLabel = isOverdue ? `Trễ ${Math.round((new Date(TODAY_STR).getTime() - new Date(t.dueDate).getTime()) / 86400000)} ngày` : 'Hôm nay'
    let statusVariant: PriorityItem['statusVariant'] = isOverdue ? 'danger' : 'warning'
    if (t.status === 'WAITING') { statusLabel = 'Đang chờ'; statusVariant = 'waiting' }
    if (t.status === 'PENDING_APPROVAL') { statusLabel = 'Chờ duyệt'; statusVariant = 'waiting' }
    items.push({
      id: `task-${t.id}`, title: t.title, kind: t.kind,
      projectName: project?.name, personName: owner?.name,
      deadline: t.dueDate, urgency: t.urgency,
      status: t.status, statusLabel, statusVariant,
      nextAction: t.status === 'PENDING_APPROVAL' ? 'Duyệt' : isOverdue ? 'Nhắc ngay' : 'Xử lý',
      sourceId: t.id, futureRoute: t.futureRoute,
    })
  })

  meetings.filter(m => m.status !== 'done' && (m.taskDraftCount > m.importedTaskCount || m.status === 'no_minutes')).forEach(m => {
    items.push({
      id: `meeting-${m.id}`, title: m.title, kind: 'IMPORT',
      deadline: m.date, urgency: 'MEDIUM',
      status: 'NOT_STARTED',
      statusLabel: m.status === 'no_minutes' ? 'Chưa biên bản' : `${m.taskDraftCount - m.importedTaskCount} draft chưa nhập`,
      statusVariant: 'waiting',
      nextAction: 'Nhập đầu việc',
      sourceId: m.id, futureRoute: m.futureRoute,
    })
  })

  approvals.filter(a => a.status === 'overdue' || a.status === 'pending').forEach(a => {
    items.push({
      id: `approval-${a.id}`, title: a.title, kind: 'APPROVE',
      deadline: a.deadline, urgency: a.status === 'overdue' ? 'HIGH' : 'MEDIUM',
      status: 'PENDING_APPROVAL',
      statusLabel: a.status === 'overdue' ? `Trễ duyệt ${a.daysWaiting} ngày` : `Chờ ${a.daysWaiting} ngày`,
      statusVariant: a.status === 'overdue' ? 'danger' : 'warning',
      nextAction: 'Phê duyệt', sourceId: a.id, futureRoute: a.futureRoute,
    })
  })

  // Sort: critical overdue → overdue → due today → pending approval → waiting
  const rank = (item: PriorityItem) => {
    if (item.urgency === 'CRITICAL' && item.statusVariant === 'danger') return 0
    if (item.statusVariant === 'danger') return 1
    if (item.urgency === 'HIGH' && item.statusVariant === 'warning') return 2
    if (item.statusVariant === 'warning') return 3
    if (item.statusVariant === 'waiting') return 4
    return 5
  }
  return items.sort((a, b) => rank(a) - rank(b))
}

export function buildCOOSummary(
  tasks: Task[], ceoRequests: CEODecisionRequest[],
  approvals: Approval[], reminders: Reminder[], meetings: Meeting[],
): COOSummary {
  const overdueCount = tasks.filter(t => t.dueDate < TODAY_STR && t.status !== 'COMPLETED' && t.status !== 'CANCELLED').length
  const criticalCEO = ceoRequests.filter(c => c.severity === 'critical')
  const lateApprovals = approvals.filter(a => a.status === 'overdue')
  const noResponseCount = reminders.filter(r => r.response === 'NO_RESPONSE' && r.reminderCount >= 2).length

  const urgentItems: string[] = []
  if (criticalCEO.length > 0) urgentItems.push(`${criticalCEO.length} vấn đề nghiêm trọng cần báo CEO ngay hôm nay`)
  if (overdueCount > 0) urgentItems.push(`${overdueCount} việc đã quá hạn cần xử lý`)
  if (lateApprovals.length > 0) urgentItems.push(`${lateApprovals.length} yêu cầu phê duyệt đang trễ hạn`)

  const risks: string[] = [
    'App Mobile AT_RISK — chỉ 18% tiến độ, nguy cơ trượt MVP tháng 8',
    'Website Redesign WARNING — landing page trễ 2 ngày, Go-live 05/07 là đường găng',
  ]

  const watchItems: string[] = []
  if (noResponseCount > 0) watchItems.push(`${noResponseCount} người nhắc ≥2 lần chưa phản hồi — cân nhắc escalate`)
  watchItems.push('Theo dõi cam kết sau họp NCC: 2 quyết định chưa ra đầu việc')

  const proposedActions: string[] = []
  proposedActions.push('Báo CEO về App Mobile và vượt ngân sách thiết kế trước 12:00 hôm nay')
  const pendingMeeting = meetings.find(m => m.taskDraftCount > m.importedTaskCount)
  if (pendingMeeting) proposedActions.push(`Nhập ${pendingMeeting.taskDraftCount} đầu việc từ "${pendingMeeting.title}" vào Task Inbox`)
  proposedActions.push('Nhắc Ngọc Vy về file thiết kế bao bì (đã 2 lần không phản hồi — đề xuất báo trưởng phòng)')

  return { urgentItems, risks, watchItems, proposedActions }
}

export function buildSummaryBanner(
  kpi: KPIData, chaseItems: ChaseItem[], ceoRequests: CEODecisionRequest[],
): SummaryBannerData {
  const escalateCount = chaseItems.filter(c => c.suggestEscalate).length
  const paragraph = `Hôm nay có **${kpi.meetingsToday} cuộc họp** (${kpi.unimportedDrafts > 0 ? `${kpi.unimportedDrafts} đầu việc chưa nhập từ họp` : '1 cần chuẩn bị tài liệu'}). **${kpi.overdueItems} việc đang quá hạn** và 1 hợp đồng quá hạn duyệt. Cần **dí ${kpi.pendingDeliverable} người** đang nợ file/báo cáo${escalateCount > 0 ? ` — trong đó ${escalateCount} người đã 2 lần không phản hồi, **nên escalate lên trưởng phòng**` : ''}. **${kpi.ceoItems} việc cần đưa vào báo cáo CEO**: ${ceoRequests.map(c => c.title).join(' và ')}.`
  const chips = [
    { label: `${kpi.meetingsToday} họp`, colorClass: 'default' as const },
    { label: `${kpi.overdueItems} quá hạn`, colorClass: 'danger' as const },
    { label: `${kpi.pendingDeliverable} cần dí`, colorClass: 'default' as const },
    { label: `${kpi.pendingDeliverable} nợ file`, colorClass: 'default' as const },
    { label: `${kpi.pendingApprovals} chờ duyệt`, colorClass: 'default' as const },
    { label: `${kpi.ceoItems} báo CEO`, colorClass: 'lime' as const },
  ]
  return { paragraph, chips }
}

export function filterPriorityItems(items: PriorityItem[], filter: string): PriorityItem[] {
  if (filter === 'all') return items
  if (filter === 'overdue') return items.filter(i => i.statusVariant === 'danger')
  if (filter === 'today') return items.filter(i => i.deadline === TODAY_STR || i.statusVariant === 'danger')
  if (filter === 'next_24h') return items.filter(i => i.deadline === TODAY_STR || i.deadline === '2026-06-26')
  if (filter === 'waiting') return items.filter(i => i.statusVariant === 'waiting')
  if (filter === 'pending_approval') return items.filter(i => i.status === 'PENDING_APPROVAL' || i.kind === 'APPROVE')
  if (filter === 'ceo_report') return items.filter(i => i.kind === 'APPROVE' || i.urgency === 'CRITICAL')
  return items
}
