import type { TaskStatus } from '@/lib/tasks/taskStatusService'
import type { TimelineOwnerColorKey, TimelineTask } from '@/features/timeline/types'

export const TIMELINE_STATUS_OPTIONS: Array<{
  value: TaskStatus
  label: string
  color: string
}> = [
  { value: 'UNASSIGNED', label: 'Chưa giao việc', color: '#A16207' },
  { value: 'NOT_STARTED', label: 'Chưa bắt đầu', color: '#64748B' },
  { value: 'IN_PROGRESS', label: 'Đang làm', color: '#2563EB' },
  { value: 'WAITING', label: 'Đang chờ', color: '#D97706' },
  { value: 'BLOCKED', label: 'Bị chặn', color: '#DC2626' },
  { value: 'PENDING_APPROVAL', label: 'Chờ duyệt', color: '#7C3AED' },
  { value: 'REVISION_REQUIRED', label: 'Cần chỉnh sửa', color: '#C2410C' },
  { value: 'COMPLETED', label: 'Hoàn thành', color: '#059669' },
  { value: 'CANCELLED', label: 'Đã hủy', color: '#6B7280' },
]

export const OWNER_COLORS: Record<TimelineOwnerColorKey, string> = {
  blue: '#378ADD',
  teal: '#0F9F8F',
  orange: '#E07B39',
  indigo: '#6366F1',
  purple: '#9B59D0',
  neutral: '#64748B',
}

export function getStatusLabel(status: TaskStatus) {
  return TIMELINE_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status
}

export function getStatusColor(status: TaskStatus) {
  return TIMELINE_STATUS_OPTIONS.find((option) => option.value === status)?.color ?? '#64748B'
}

export function formatDisplayDate(dateKey: string | null) {
  if (!dateKey) return 'Chưa có'
  const [year, month, day] = dateKey.split('-')
  return `${day}/${month}/${year}`
}

export function buildTimelineUnassignedCompletionMessage(
  task: Pick<TimelineTask, 'title' | 'ownerId' | 'dueDate'>,
  dueDate = task.dueDate,
) {
  const missingOwner = !task.ownerId
  const missingDueDate = !dueDate
  const missing = missingOwner && missingDueDate
    ? 'người phụ trách và deadline'
    : missingOwner
      ? 'người phụ trách'
      : 'deadline'

  return `Đầu việc ${task.title} chưa có ${missing}. Sẽ BỎ QUA yêu cầu file/báo cáo và các bước bắt buộc. Chỉ dùng cho việc vặt không cần bàn giao. Hành động này được ghi lại trong audit trail.`
}
