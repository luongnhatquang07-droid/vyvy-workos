import type {
  Approval,
  CEODecisionRequest,
  ChaseItem,
  COOSummary,
  Deliverable,
  KPIData,
  Meeting,
  Person,
  PriorityItem,
  Project,
  Reminder,
  SummaryBannerData,
  Task,
} from './types'

export function getVietnamDateKey(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const year = parts.find((part) => part.type === 'year')?.value ?? '0000'
  const month = parts.find((part) => part.type === 'month')?.value ?? '01'
  const day = parts.find((part) => part.type === 'day')?.value ?? '01'
  return `${year}-${month}-${day}`
}

export function formatRelativeDate(iso: string): string {
  const today = getVietnamDateKey()
  if (!iso) return 'Chưa có hạn'
  if (iso === today) return 'Hôm nay'
  if (iso < today) {
    const days = Math.round((new Date(today).getTime() - new Date(iso).getTime()) / 86400000)
    return `Trễ ${days} ngày`
  }
  const days = Math.round((new Date(iso).getTime() - new Date(today).getTime()) / 86400000)
  if (days === 1) return 'Ngày mai'
  return iso.slice(5).replace('-', '/')
}

export function computeKPI(
  meetings: Meeting[],
  tasks: Task[],
  approvals: Approval[],
  ceoRequests: CEODecisionRequest[],
  reminders: Reminder[],
  deliverables: Deliverable[] = [],
): KPIData {
  const today = getVietnamDateKey()
  const pendingPeople = new Set(
    reminders
      .filter((reminder) => reminder.response !== 'CLOSED' && reminder.response !== 'FILE_SUBMITTED')
      .map((reminder) => reminder.personId)
      .filter(Boolean),
  )
  deliverables
    .filter((deliverable) => !['SUBMITTED', 'APPROVED'].includes(deliverable.status))
    .forEach((deliverable) => {
      if (deliverable.ownerId) pendingPeople.add(deliverable.ownerId)
    })
  return {
    meetingsToday: meetings.filter((meeting) => meeting.date === today).length,
    unimportedDrafts: meetings.reduce((acc, meeting) => acc + Math.max(0, meeting.taskDraftCount - meeting.importedTaskCount), 0),
    pendingDeliverable: pendingPeople.size,
    overdueItems: tasks.filter((task) => Boolean(task.dueDate) && task.dueDate < today && task.status !== 'COMPLETED' && task.status !== 'CANCELLED' && task.status !== 'WAITING').length,
    pendingApprovals: approvals.filter((approval) => approval.status === 'pending' || approval.status === 'overdue').length,
    ceoItems: ceoRequests.length,
  }
}

export function buildPriorityList(
  tasks: Task[],
  meetings: Meeting[],
  approvals: Approval[],
  ceoRequests: CEODecisionRequest[],
  people: Person[],
  projects: Project[],
): PriorityItem[] {
  const today = getVietnamDateKey()
  const byPerson = Object.fromEntries(people.map((person) => [person.id, person]))
  const byProject = Object.fromEntries(projects.map((project) => [project.id, project]))
  const items: PriorityItem[] = []

  tasks.forEach((task) => {
    if (task.status === 'COMPLETED' || task.status === 'CANCELLED') return

    const isOverdue = Boolean(task.dueDate) && task.dueDate < today
    const isToday = task.dueDate === today
    if (!isOverdue && !isToday && task.urgency !== 'CRITICAL' && task.urgency !== 'HIGH') return

    const owner = byPerson[task.ownerId]
    const project = task.projectId ? byProject[task.projectId] : undefined
    let statusLabel = isOverdue
      ? `Trễ ${Math.round((new Date(today).getTime() - new Date(task.dueDate).getTime()) / 86400000)} ngày`
      : 'Hôm nay'
    let statusVariant: PriorityItem['statusVariant'] = isOverdue ? 'danger' : 'warning'

    if (task.status === 'WAITING') {
      statusLabel = 'Đang chờ'
      statusVariant = 'waiting'
    }
    if (task.status === 'PENDING_APPROVAL') {
      statusLabel = 'Chờ duyệt'
      statusVariant = 'waiting'
    }

    items.push({
      id: `task-${task.id}`,
      title: task.title,
      kind: task.kind,
      projectName: project?.name,
      personName: owner?.name,
      deadline: task.dueDate,
      urgency: task.urgency,
      status: task.status,
      statusLabel,
      statusVariant,
      nextAction: task.status === 'PENDING_APPROVAL' ? 'Duyệt' : isOverdue ? 'Nhắc ngay' : 'Xử lý',
      sourceId: task.id,
      futureRoute: task.futureRoute,
    })
  })

  meetings
    .filter((meeting) => meeting.status !== 'done' && (meeting.taskDraftCount > meeting.importedTaskCount || meeting.status === 'no_minutes'))
    .forEach((meeting) => {
      const remainingDrafts = Math.max(0, meeting.taskDraftCount - meeting.importedTaskCount)
      items.push({
        id: `meeting-${meeting.id}`,
        title: meeting.title,
        kind: 'IMPORT',
        deadline: meeting.date,
        urgency: 'MEDIUM',
        status: 'NOT_STARTED',
        statusLabel: meeting.status === 'no_minutes' ? 'Chưa biên bản' : `${remainingDrafts} draft chưa nhập`,
        statusVariant: 'waiting',
        nextAction: 'Nhập đầu việc',
        sourceId: meeting.id,
        futureRoute: meeting.futureRoute,
      })
    })

  approvals
    .filter((approval) => approval.status === 'overdue' || approval.status === 'pending')
    .forEach((approval) => {
      items.push({
        id: `approval-${approval.id}`,
        title: approval.title,
        kind: 'APPROVE',
        deadline: approval.deadline,
        urgency: approval.status === 'overdue' ? 'HIGH' : 'MEDIUM',
        status: 'PENDING_APPROVAL',
        statusLabel: approval.status === 'overdue' ? `Trễ duyệt ${approval.daysWaiting} ngày` : `Chờ ${approval.daysWaiting} ngày`,
        statusVariant: approval.status === 'overdue' ? 'danger' : 'warning',
        nextAction: 'Phê duyệt',
        sourceId: approval.id,
        futureRoute: approval.futureRoute,
      })
    })

  ceoRequests.forEach((request) => {
    if (request.severity !== 'critical') return
    items.push({
      id: `ceo-${request.id}`,
      title: request.title,
      kind: 'APPROVE',
      projectName: request.projectId ? byProject[request.projectId]?.name : undefined,
      deadline: request.createdDate,
      urgency: 'CRITICAL',
      status: 'PENDING_APPROVAL',
      statusLabel: 'Báo CEO',
      statusVariant: 'danger',
      nextAction: 'Mở báo cáo',
      sourceId: request.id,
      futureRoute: request.futureRoute,
    })
  })

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
  tasks: Task[],
  ceoRequests: CEODecisionRequest[],
  approvals: Approval[],
  reminders: Reminder[],
  meetings: Meeting[],
  projects: Project[] = [],
): COOSummary {
  const today = getVietnamDateKey()
  const overdueCount = tasks.filter((task) => Boolean(task.dueDate) && task.dueDate < today && task.status !== 'COMPLETED' && task.status !== 'CANCELLED').length
  const criticalCEO = ceoRequests.filter((request) => request.severity === 'critical')
  const lateApprovals = approvals.filter((approval) => approval.status === 'overdue')
  const noResponseCount = reminders.filter((reminder) => reminder.response === 'NO_RESPONSE' && reminder.reminderCount >= 2).length
  const blockedCount = tasks.filter((task) => task.status === 'BLOCKED').length

  const urgentItems: string[] = []
  if (criticalCEO.length > 0) urgentItems.push(`${criticalCEO.length} vấn đề nghiêm trọng cần báo CEO hôm nay`)
  if (overdueCount > 0) urgentItems.push(`${overdueCount} việc quá hạn cần xử lý`)
  if (lateApprovals.length > 0) urgentItems.push(`${lateApprovals.length} yêu cầu phê duyệt đang trễ hạn`)
  if (blockedCount > 0) urgentItems.push(`${blockedCount} việc đang bị chặn`)

  const atRiskProjects = projects.filter((project) => project.health === 'AT_RISK' || project.health === 'CRITICAL')
  const warningProjects = projects.filter((project) => project.health === 'WARNING')
  const risks: string[] = []
  atRiskProjects.forEach((project) => risks.push(`${project.name} có rủi ro cao, cần can thiệp`))
  warningProjects.forEach((project) => risks.push(`${project.name} cần theo dõi sát tiến độ`))
  if (risks.length === 0 && projects.length > 0) risks.push('Tất cả dự án đang trong ngưỡng an toàn')

  const watchItems: string[] = []
  if (noResponseCount > 0) watchItems.push(`${noResponseCount} người đã nhắc nhiều lần nhưng chưa phản hồi`)
  const pendingMeetingCount = meetings.filter((meeting) => meeting.status !== 'done' && meeting.taskDraftCount > meeting.importedTaskCount).length
  if (pendingMeetingCount > 0) watchItems.push(`${pendingMeetingCount} cuộc họp còn đầu việc chưa nhập vào hệ thống`)
  const waitingCount = tasks.filter((task) => task.status === 'WAITING').length
  if (waitingCount > 0) watchItems.push(`${waitingCount} việc đang chờ phản hồi`)

  const proposedActions: string[] = []
  if (criticalCEO.length > 0 || atRiskProjects.length > 0) {
    const names = [...criticalCEO.map((request) => request.title), ...atRiskProjects.map((project) => project.name)].slice(0, 2).join(' và ')
    proposedActions.push(`Báo CEO về ${names} trước 12:00 hôm nay`)
  }
  const pendingMeeting = meetings.find((meeting) => meeting.taskDraftCount > meeting.importedTaskCount)
  if (pendingMeeting) proposedActions.push(`Nhập ${pendingMeeting.taskDraftCount} đầu việc từ "${pendingMeeting.title}" vào Task Inbox`)
  const escalateCandidates = reminders.filter((reminder) => reminder.response === 'NO_RESPONSE' && reminder.reminderCount >= 2)
  const escalatePersonCount = new Set(escalateCandidates.map((reminder) => reminder.personId)).size
  if (escalatePersonCount > 0) proposedActions.push(`${escalatePersonCount} người cần báo trưởng phòng do không phản hồi`)
  if (lateApprovals.length > 0) proposedActions.push(`Xử lý ${lateApprovals.length} phê duyệt đang trễ hạn`)

  return { urgentItems, risks, watchItems, proposedActions }
}

export function buildSummaryBanner(
  kpi: KPIData,
  chaseItems: ChaseItem[],
  ceoRequests: CEODecisionRequest[],
): SummaryBannerData {
  const escalateCount = new Set(chaseItems.filter((item) => item.suggestEscalate).map((item) => item.personId)).size
  const meetingPart = kpi.meetingsToday > 0
    ? `Hôm nay có **${kpi.meetingsToday} cuộc họp**`
    : 'Hôm nay chưa có cuộc họp nào'
  const draftPart = kpi.unimportedDrafts > 0
    ? `, trong đó **${kpi.unimportedDrafts} đầu việc** chưa nhập từ họp`
    : ''
  const overduePart = kpi.overdueItems > 0
    ? `Có **${kpi.overdueItems} việc đang quá hạn** cần xử lý`
    : 'Không có việc quá hạn từ dữ liệu hiện tại'
  const deliverablePart = kpi.pendingDeliverable > 0
    ? `Cần nhắc **${kpi.pendingDeliverable} người** đang nợ file/báo cáo`
    : 'Không có người đang nợ file/báo cáo'
  const escalationPart = escalateCount > 0
    ? `, trong đó ${escalateCount} người đã 2 lần không phản hồi và nên báo trưởng phòng`
    : ''
  const ceoTitles = ceoRequests.map((request) => request.title).filter(Boolean).join(' và ')
  const ceoPart = kpi.ceoItems > 0
    ? `Có **${kpi.ceoItems} việc cần đưa vào báo cáo CEO**${ceoTitles ? `: ${ceoTitles}` : ''}`
    : 'Chưa có việc cần đưa vào báo cáo CEO'
  const paragraph = `${meetingPart}${draftPart}. ${overduePart}. ${deliverablePart}${escalationPart}. ${ceoPart}.`

  const chips = [
    { label: `${kpi.meetingsToday} họp`, colorClass: 'default' as const, route: '/meetings' },
    { label: `${kpi.unimportedDrafts} draft chưa nhập`, colorClass: 'waiting' as const, route: '/task-inbox' },
    { label: `${kpi.pendingDeliverable} người nợ file`, colorClass: 'default' as const, route: '/follow-ups' },
    { label: `${kpi.overdueItems} việc quá hạn`, colorClass: 'danger' as const, route: '/follow-ups' },
    { label: `${kpi.pendingApprovals} yêu cầu duyệt`, colorClass: 'warning' as const, route: '/approvals' },
    { label: `${kpi.ceoItems} báo CEO`, colorClass: 'lime' as const, route: '/ceo-reports' },
  ]
  return { paragraph, chips }
}

export function filterPriorityItems(items: PriorityItem[], filter: string): PriorityItem[] {
  const today = getVietnamDateKey()
  if (filter === 'all') return items
  if (filter === 'overdue') return items.filter((item) => item.statusVariant === 'danger')
  if (filter === 'today') return items.filter((item) => item.deadline === today || item.statusVariant === 'danger')
  if (filter === 'next_24h') {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const tomorrowStr = getVietnamDateKey(tomorrow)
    return items.filter((item) => item.deadline === today || item.deadline === tomorrowStr)
  }
  if (filter === 'waiting') return items.filter((item) => item.statusVariant === 'waiting')
  if (filter === 'pending_approval') return items.filter((item) => item.status === 'PENDING_APPROVAL' || item.kind === 'APPROVE')
  if (filter === 'ceo_report') return items.filter((item) => item.kind === 'APPROVE' || item.urgency === 'CRITICAL')
  return items
}
