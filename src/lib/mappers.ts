import 'server-only'

import type {
  CommandCenterActivityLogRow,
  CommandCenterApprovalRow,
  CommandCenterCeoDecisionRequestRow,
  CommandCenterDeliverableRow,
  CommandCenterMeetingRow,
  CommandCenterPersonRow,
  CommandCenterProjectRow,
  CommandCenterTaskRow,
  RawCommandCenterData,
  CommandCenterReminderRow,
} from '@/lib/database.types'
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
    futureRoute: `/tasks/${row.id}`,
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
    futureRoute: `/meetings/${row.id}`,
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
    futureRoute: `/deliverables/${row.id}`,
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
    futureRoute: `/approvals/${row.id}`,
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
    futureRoute: `/follow-ups/${row.id}`,
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
    futureRoute: `/ceo-reports/${row.id}`,
  }
}

function mapActivityLog(row: CommandCenterActivityLogRow): ActivityLogEntry {
  const metadata = row.metadata ? Object.values(row.metadata).filter(Boolean).join(' | ') : ''
  return {
    id: row.id,
    time: row.created_at?.slice(11, 16) ?? '',
    text: `${row.action ?? ''} - ${row.entity_type ?? ''}${metadata ? ` (${metadata})` : ''}`.trim(),
    dotColor: row.action?.includes('COMPLETE')
      ? 'green'
      : row.action?.includes('BLOCK')
        ? 'red'
        : row.action?.includes('APPROVE')
          ? 'violet'
          : 'blue',
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
  const activityLog = raw.activityLogs.map(mapActivityLog)

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
    .map((row) => ({
      taskId: row.task_id!,
      taskTitle: row.name,
      ownerName: people.find((person) => person.id === row.submitter_id)?.name ?? '',
      items: [
        {
          label: 'File/Link',
          present: row.status === 'APPROVED' || row.status === 'SUBMITTED',
          required: true,
        },
      ],
      gateOpen: row.status === 'APPROVED',
    }))

  const kpi = computeKPI(meetings, tasks, approvals, ceoRequests, reminders)
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
