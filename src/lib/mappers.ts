import 'server-only'

import type {
  CommandCenterActivityLogRow,
  CommandCenterApprovalRow,
  CommandCenterCeoDecisionRequestRow,
  CommandCenterDeliverableRow,
  CommandCenterDeliverableVersionRow,
  CommandCenterMeetingRow,
  CommandCenterPersonRow,
  CommandCenterProjectRow,
  CommandCenterTaskRow,
  RawCommandCenterData,
  CommandCenterReminderRow,
} from '@/lib/database.types'
import {
  isVersionInvalid,
  isVersionPending,
  isVersionRevision,
  isVersionValidForCompletion,
  normalizeVersionReviewStatus,
} from '@/lib/deliverableVersionStatus'
import type {
  ActionKind,
  ActivityLogEntry,
  Approval,
  CEODecisionRequest,
  ChaseItem,
  CommandCenterData,
  Commitment,
  Deliverable,
  DeliverableCheck,
  Meeting,
  Person,
  Project,
  Reminder,
  ReminderResponse,
  Task,
} from '@/features/command-center/types'
import {
  buildCOOSummary,
  buildPriorityList,
  buildSummaryBanner,
  computeKPI,
  getVietnamDateKey,
} from '@/features/command-center/utils'

function mapReminderResponse(value: string | null): ReminderResponse {
  switch (value) {
    case 'NOT_REMINDERED':
      return 'NOT_REMINDED'
    case 'REMINDERED':
      return 'SENT'
    case 'VIEWED':
      return 'SEEN'
    case 'WAITING_RESPONSE':
      return 'WAITING_RESPONSE'
    case 'PROMISED_DELIVERY':
      return 'PROMISED'
    case 'DEADLINE_EXTENSION_REQUESTED':
      return 'EXTENSION_REQUESTED'
    case 'FILE_SUBMITTED':
      return 'FILE_SUBMITTED'
    case 'NO_RESPONSE':
      return 'NO_RESPONSE'
    case 'ESCALATED':
      return 'ESCALATED'
    case 'CLOSED':
      return 'CLOSED'
    default:
      return 'NOT_REMINDED'
  }
}

function inferKind(title: string): ActionKind {
  const normalized = title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
  if (normalized.includes('hop') || normalized.includes('meeting')) return 'MEETING'
  if (normalized.includes('duyet') || normalized.includes('approve')) return 'APPROVE'
  if (normalized.includes('nhac') || normalized.includes('remind')) return 'REMIND'
  if (normalized.includes('bao cao') || normalized.includes('report')) return 'COLLECT_REPORT'
  if (normalized.includes('file') || normalized.includes('tai lieu')) return 'COLLECT_FILE'
  return 'IMPORT'
}

function initials(name: string): string {
  return name
    .split(' ')
    .map((word) => word[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function mapPerson(row: CommandCenterPersonRow): Person {
  return {
    id: row.id,
    name: row.full_name,
    role: row.job_title ?? '',
    department: Array.isArray(row.department) ? row.department[0]?.name ?? '' : row.department?.name ?? '',
    avatarInitials: initials(row.full_name),
  }
}

function mapProject(row: CommandCenterProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    code: row.code ?? initials(row.name),
    health: row.health_status ?? 'NO_DATA',
  }
}

function mapTask(row: CommandCenterTaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    ownerId: row.owner_id ?? '',
    projectId: row.project_id ?? undefined,
    dueDate: row.due_date ?? '',
    status: row.status,
    urgency: row.priority,
    waitingFor: row.waiting_for_content ?? undefined,
    kind: inferKind(row.title),
    futureRoute: buildProjectTaskRoute(row),
  }
}

function mapMeeting(row: CommandCenterMeetingRow, drafts: RawCommandCenterData['taskDrafts']): Meeting {
  const meetingDate = row.start_at ? new Date(row.start_at) : null
  return {
    id: row.id,
    title: row.title,
    date: row.start_at?.slice(0, 10) ?? '',
    time:
      meetingDate && !Number.isNaN(+meetingDate)
        ? meetingDate.toLocaleTimeString('vi-VN', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Asia/Ho_Chi_Minh',
          })
        : '',
    status: (row.status ?? 'no_minutes') as Meeting['status'],
    attendees: [],
    taskDraftCount: drafts.filter(
      (draft) => draft.meeting_id === row.id && draft.import_status === 'pending',
    ).length,
    decisionCount: 0,
    importedTaskCount: 0,
    projectId: row.project_id ?? undefined,
    futureRoute: row.project_id ? `/projects?projectId=${encodeURIComponent(row.project_id)}&tab=meetings` : '/meetings',
  }
}

function mapDeliverable(row: CommandCenterDeliverableRow): Deliverable {
  return {
    id: row.id,
    title: row.name,
    taskId: row.task_id ?? undefined,
    ownerId: row.submitter_id ?? '',
    projectId: row.project_id ?? undefined,
    dueDate: row.due_date ?? '',
    status: row.status,
    type: (row.type as Deliverable['type']) ?? 'file',
    futureRoute: `/deliverables?deliverableId=${encodeURIComponent(row.id)}`,
  }
}

function mapApproval(
  row: CommandCenterApprovalRow,
  tasks: CommandCenterTaskRow[],
  deliverables: CommandCenterDeliverableRow[],
  today: string,
): Approval {
  const submittedDate = row.requested_at?.slice(0, 10) ?? ''
  const deadline = row.due_at ?? ''
  const task = tasks.find((item) => item.id === row.task_id)
  const deliverable = deliverables.find((item) => item.id === row.deliverable_id)
  const isOverdue = Boolean(deadline) && deadline < today
  const daysWaiting = submittedDate
    ? Math.max(0, Math.round((Date.parse(today) - Date.parse(submittedDate)) / 86400000))
    : 0

  return {
    id: row.id,
    title: task?.title ?? deliverable?.name ?? 'Phê duyệt',
    description: '',
    requesterId: row.requested_by ?? '',
    approverId: row.approver_id ?? '',
    projectId: row.project_id ?? undefined,
    submittedDate,
    deadline,
    status:
      row.status === 'PENDING'
        ? isOverdue
          ? 'overdue'
          : 'pending'
        : row.status === 'APPROVED'
          ? 'approved'
          : row.status === 'REJECTED'
            ? 'rejected'
            : 'pending',
    daysWaiting,
    futureRoute: `/approvals?approvalId=${encodeURIComponent(row.id)}`,
  }
}

function mapReminder(
  row: CommandCenterReminderRow,
  tasks: CommandCenterTaskRow[],
  deliverables: CommandCenterDeliverableRow[],
): Reminder {
  const task = tasks.find((item) => item.id === row.task_id)
  const deliverable = deliverables.find((item) => item.id === row.deliverable_id)
  const dueDate = deliverable?.due_date ?? task?.due_date ?? ''

  return {
    id: row.id,
    personId: row.person_id ?? '',
    taskId: row.task_id ?? undefined,
    deliverableId: row.deliverable_id ?? undefined,
    content: deliverable?.name ?? task?.title ?? 'Nhắc hoàn tất file hoặc báo cáo',
    dueDate,
    reminderCount: row.reminder_level,
    lastReminderDate: row.last_reminded_at?.slice(0, 10) ?? '',
    response: mapReminderResponse(row.response_status),
    futureRoute: `/follow-ups?reminderId=${encodeURIComponent(row.id)}`,
  }
}

function mapCeoRequest(row: CommandCenterCeoDecisionRequestRow): CEODecisionRequest {
  return {
    id: row.id,
    title: row.title,
    projectId: row.project_id ?? undefined,
    severity: 'warning',
    issue: row.context ?? '',
    impact: row.delay_impact ?? '',
    consequence: row.delay_impact ?? '',
    proposedAction: row.recommendation ?? '',
    createdDate: row.created_at?.slice(0, 10) ?? '',
    escalatedBy: '',
    futureRoute: `/ceo-reports?requestId=${encodeURIComponent(row.id)}`,
  }
}

function buildProjectTaskRoute(row: CommandCenterTaskRow) {
  const params = new URLSearchParams()
  params.set('taskId', row.id)
  if (row.project_id) params.set('projectId', row.project_id)
  if (row.workstream_id) params.set('workstreamId', row.workstream_id)
  params.set('tab', 'overview')
  return `/projects?${params.toString()}`
}

function mapActivityLog(row: CommandCenterActivityLogRow, people: Person[]): ActivityLogEntry {
  const actorName = people.find((person) => person.id === row.actor_id)?.name
  const metadata = formatOperationalActivityMetadata(row.metadata)
  const label = getOperationalActivityLabel(row.action)
  return {
    id: row.id,
    time: row.created_at?.slice(11, 16) ?? '',
    text: `${actorName ? `${actorName}: ` : ''}${label}${metadata ? ` · ${metadata}` : ''}`,
    dotColor: row.action?.includes('approved') || row.action?.includes('approve')
      ? 'green'
      : row.action?.includes('revision') || row.action?.includes('markMissing')
        ? 'red'
        : row.action?.includes('escalated')
          ? 'violet'
          : row.action?.includes('scheduled')
            ? 'amber'
            : 'blue',
  }
}

function getOperationalActivityLabel(action: string | null) {
  switch (action) {
    case 'follow_up.reminder.sent':
      return 'Đã gửi nhắc việc'
    case 'follow_up.reminder.scheduled':
      return 'Đã hẹn nhắc lại'
    case 'follow_up.reminder.escalated':
      return 'Đã đánh dấu cần escalate'
    case 'deliverable.reminder.sent':
      return 'Đã gửi nhắc nộp file/báo cáo'
    case 'deliverable.approve':
    case 'approval.approved':
      return 'Báo cáo đã duyệt'
    case 'deliverable.requestRevision':
    case 'approval.revision_required':
      return 'Báo cáo bị yêu cầu sửa'
    case 'deliverable.markMissing':
      return 'Báo cáo thiếu thông tin'
    case 'approval.requested':
      return 'Đã gửi yêu cầu duyệt'
    case 'approval.rejected':
      return 'Yêu cầu duyệt bị từ chối'
    case 'escalation.created':
      return 'Đã tạo escalation'
    default:
      return 'Cập nhật theo dõi'
  }
}

function formatOperationalActivityMetadata(metadata: Record<string, unknown> | null) {
  if (!metadata) return ''
  const parts: string[] = []
  const reminderLevel = metadata.reminderLevel
  const channel = metadata.channel
  const nextFollowUpAt = metadata.nextFollowUpAt
  const reason = metadata.reason ?? metadata.reviewComment

  if (typeof reminderLevel === 'number' && Number.isFinite(reminderLevel)) {
    parts.push(`lần ${reminderLevel}`)
  }
  if (typeof channel === 'string' && channel.trim()) {
    parts.push(`qua ${channel.trim()}`)
  }
  if (typeof nextFollowUpAt === 'string' && nextFollowUpAt.trim()) {
    parts.push(`hẹn ${formatActivityDateTime(nextFollowUpAt)}`)
  }
  if (typeof reason === 'string' && reason.trim()) {
    parts.push(`lý do: ${shortenActivityText(reason.trim())}`)
  }

  return parts.join(' · ')
}

function formatActivityDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh',
  })
}

function shortenActivityText(value: string) {
  return value.length > 72 ? `${value.slice(0, 69)}...` : value
}

function getDeliverableCheckState(
  row: CommandCenterDeliverableRow,
  versions: CommandCenterDeliverableVersionRow[],
) {
  const requiresApproval = true
  const relatedVersions = versions
    .filter((version) => version.deliverable_id === row.id)
    .sort((a, b) => b.version_number - a.version_number)
  const latestRelevant = relatedVersions.find((version) => !isVersionInvalid(normalizeVersionReviewStatus(version.review_status)))

  if (latestRelevant) {
    const status = normalizeVersionReviewStatus(latestRelevant.review_status)
    return {
      present: !isVersionRevision(status) && (status === 'APPROVED' || isVersionPending(status)),
      gateOpen: isVersionValidForCompletion(status, requiresApproval),
    }
  }

  if (relatedVersions.length) {
    return { present: false, gateOpen: false }
  }

  return {
    present: row.status === 'APPROVED' || row.status === 'SUBMITTED',
    gateOpen: row.status === 'APPROVED',
  }
}

export function toCommandCenterVM(raw: RawCommandCenterData): CommandCenterData {
  const today = getVietnamDateKey()

  const people = raw.people.map(mapPerson)
  const projects = raw.projects.map(mapProject)
  const tasks = raw.tasks.map(mapTask)
  const meetings = raw.meetings.map((row) => mapMeeting(row, raw.taskDrafts))
  const deliverables = raw.deliverables.map(mapDeliverable)
  const approvals = raw.approvals.map((row) => mapApproval(row, raw.tasks, raw.deliverables, today))
  const reminders = raw.reminders.map((row) => mapReminder(row, raw.tasks, raw.deliverables))
  const ceoRequests = raw.ceoRequests.map(mapCeoRequest)
  const activityLog = raw.activityLogs.map((row) => mapActivityLog(row, people))

  const chaseItems: ChaseItem[] = raw.reminders.map((row) => {
    const response = mapReminderResponse(row.response_status)
    const deliverable = raw.deliverables.find((item) => item.id === row.deliverable_id)
    const task = raw.tasks.find((item) => item.id === row.task_id)

    return {
      personId: row.person_id ?? '',
      owedItem: deliverable?.name ?? task?.title ?? 'Chưa rõ',
      deadline: deliverable?.due_date ?? task?.due_date ?? undefined,
      remindCount: row.reminder_level,
      response,
      escalationStep: 'REMIND_1',
      suggestEscalate: row.reminder_level >= 2 && response === 'NO_RESPONSE',
    }
  })

  const remindedDeliverables = new Set(raw.reminders.map((row) => row.deliverable_id).filter(Boolean))
  raw.deliverables
    .filter((row) => row.submitter_id && !remindedDeliverables.has(row.id) && !['SUBMITTED', 'APPROVED'].includes(row.status))
    .forEach((row) => {
      chaseItems.push({
        personId: row.submitter_id ?? '',
        owedItem: row.name,
        deadline: row.due_date ?? undefined,
        remindCount: 0,
        response: 'NOT_REMINDED',
        escalationStep: 'REMIND_1',
        suggestEscalate: Boolean(row.due_date && row.due_date < today),
      })
    })

  const commitments: Commitment[] = raw.reminders
    .filter((row) => mapReminderResponse(row.response_status) === 'PROMISED')
    .map((row) => {
      const task = raw.tasks.find((item) => item.id === row.task_id)
      const deliverable = raw.deliverables.find((item) => item.id === row.deliverable_id)

      return {
        personId: row.person_id ?? '',
        promisedWhat: deliverable?.name ?? task?.title ?? '',
        promisedDate: row.next_follow_up_at?.slice(0, 10) ?? '',
        delivered: false,
      }
    })

  const deliverableChecks: DeliverableCheck[] = raw.deliverables
    .filter((row) => row.task_id)
    .map((row) => {
      const checkState = getDeliverableCheckState(row, raw.deliverableVersions)
      return {
        taskId: row.task_id!,
        taskTitle: row.name,
        ownerName: people.find((person) => person.id === row.submitter_id)?.name ?? '',
        items: [
          {
            label: 'File/Link',
            present: checkState.present,
            required: true,
          },
        ],
        gateOpen: checkState.gateOpen,
      }
    })

  const kpi = computeKPI(meetings, tasks, approvals, ceoRequests, reminders, deliverables)
  const priorityItems = buildPriorityList(tasks, meetings, approvals, ceoRequests, people, projects)
  const cooSummary = buildCOOSummary(tasks, ceoRequests, approvals, reminders, meetings, projects)
  const summaryBanner = buildSummaryBanner(kpi, chaseItems, ceoRequests)

  return {
    people,
    projects,
    meetings,
    tasks,
    deliverables,
    deliverableChecks,
    reminders,
    chaseItems,
    commitments,
    approvals,
    ceoRequests,
    activityLog,
    kpi,
    priorityItems,
    cooSummary,
    summaryBanner,
  }
}
