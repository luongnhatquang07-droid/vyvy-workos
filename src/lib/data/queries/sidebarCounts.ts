import type {
  CommandCenterApprovalRow,
  CommandCenterReminderRow,
  CommandCenterTaskRow,
  RawCommandCenterData,
} from '@/lib/database.types'

export interface SidebarCounts {
  'command-center': number
  meetings: number
  'task-inbox': number
  'follow-ups': number
  projects: number
  approvals: number
  deliverables: number
  'ceo-reports': number
}

export const EMPTY_SIDEBAR_COUNTS: SidebarCounts = {
  'command-center': 0,
  meetings: 0,
  'task-inbox': 0,
  'follow-ups': 0,
  projects: 0,
  approvals: 0,
  deliverables: 0,
  'ceo-reports': 0,
}

export function getSidebarCounts(data: RawCommandCenterData, today = todayKey()): SidebarCounts {
  const pendingDrafts = data.taskDrafts.filter((draft) => draft.import_status !== 'imported').length
  const pendingApprovals = getPendingApprovals(data.approvals, today).length
  const remindersDue = getDueReminders(data.reminders, today).length
  const overdueTasks = getOverdueTasks(data.tasks, today).length
  const overdueDeliverables = data.deliverables.filter(
    (item) =>
      item.due_date &&
      item.due_date < today &&
      !['SUBMITTED', 'APPROVED'].includes(item.status),
  ).length
  const ceoAttention = data.ceoRequests.filter((item) => item.status !== 'closed').length
  const meetingsToday = data.meetings.filter((meeting) => meeting.start_at?.slice(0, 10) === today).length

  return {
    'command-center': pendingDrafts + pendingApprovals + remindersDue + overdueTasks + ceoAttention,
    meetings: meetingsToday,
    'task-inbox': pendingDrafts,
    'follow-ups': remindersDue,
    projects: data.projects.length,
    approvals: pendingApprovals,
    deliverables: overdueDeliverables,
    'ceo-reports': ceoAttention,
  }
}

function getPendingApprovals(approvals: CommandCenterApprovalRow[], today: string) {
  return approvals.filter((approval) => approval.status === 'PENDING' || Boolean(approval.due_at && approval.due_at < today))
}

function getDueReminders(reminders: CommandCenterReminderRow[], today: string) {
  return reminders.filter((reminder) => {
    if (reminder.response_status === 'CLOSED' || reminder.response_status === 'FILE_SUBMITTED') return false
    return !reminder.next_follow_up_at || reminder.next_follow_up_at.slice(0, 10) <= today
  })
}

function getOverdueTasks(tasks: CommandCenterTaskRow[], today: string) {
  return tasks.filter(
    (task) =>
      task.due_date &&
      task.due_date < today &&
      !['COMPLETED', 'CANCELLED', 'WAITING'].includes(task.status),
  )
}

function todayKey() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}
