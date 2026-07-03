'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { FileList } from '@/components/ui/FileList'
import { FileUpload } from '@/components/ui/FileUpload'
import type {
  Approval,
  CEODecisionRequest,
  Deliverable,
  DrawerItemType,
  DrawerState,
  Meeting,
  Person,
  Project,
  Reminder,
  Task,
} from '../types'
import { formatRelativeDate } from '../utils'

interface DrawerData {
  reminders: Reminder[]
  meetings: Meeting[]
  approvals: Approval[]
  ceoRequests: CEODecisionRequest[]
  tasks: Task[]
  deliverables: Deliverable[]
  people: Person[]
  projects: Project[]
}

interface CommandCenterDrawerProps {
  state: DrawerState
  data: DrawerData
  workspaceId?: string
  onClose: () => void
}

export function CommandCenterDrawer({ state, data, workspaceId, onClose }: CommandCenterDrawerProps) {
  const byPerson = Object.fromEntries(data.people.map((person) => [person.id, person]))
  const byProject = Object.fromEntries(data.projects.map((project) => [project.id, project]))

  React.useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    if (state.open) document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [state.open, onClose])

  if (!state.open || !state.type || !state.id) return null

  const content = resolveContent(state.type, state.id, data, byPerson, byProject, workspaceId)

  return (
    <>
      <div
        role="presentation"
        style={backdropStyle}
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={content?.title ?? 'Chi tiết'}
        style={drawerStyle}
      >
        <div style={drawerHeaderStyle}>
          {content?.badge}
          <h2 style={drawerTitleStyle}>{content?.title ?? '—'}</h2>
          <button onClick={onClose} aria-label="Đóng" style={closeButtonStyle}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 2L12 12M12 2L2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div style={{ padding: 'var(--space-5)', flex: 1 }}>
          {content ? content.body : (
            <div style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
              Không tìm thấy dữ liệu.
            </div>
          )}
        </div>

        <div style={footerNoteStyle}>
          Dữ liệu được đọc theo workspace hiện tại. Nếu nút mở chi tiết chưa hoạt động, kiểm tra route tương ứng hoặc quyền truy cập.
        </div>
      </div>
    </>
  )
}

type ResolvedContent = { title: string; badge?: React.ReactNode; body: React.ReactNode }

function resolveContent(
  type: DrawerItemType,
  id: string,
  data: DrawerData,
  byPerson: Record<string, Person>,
  byProject: Record<string, Project>,
  workspaceId?: string,
): ResolvedContent | null {
  switch (type) {
    case 'reminder': {
      const item = data.reminders.find((reminder) => reminder.id === id)
      if (!item) return null
      const person = byPerson[item.personId]
      return {
        title: item.content,
        badge: <TypeBadge label="Nhắc việc" color="var(--color-danger)" />,
        body: (
          <DrawerBody
            rows={[
              ['Người nợ', person ? `${person.name} · ${person.role}` : '—'],
              ['Hạn', formatRelativeDate(item.dueDate)],
              ['Đã nhắc', `${item.reminderCount} lần · Lần cuối: ${item.lastReminderDate.slice(5).replace('-', '/')}`],
              ['Trạng thái phản hồi', <StatusChip key="response" label={formatReminderResponse(item.response)} tone="waiting" />],
              item.responseNote ? ['Ghi chú phản hồi', item.responseNote] : null,
            ]}
            futureRoute={item.futureRoute}
          />
        ),
      }
    }

    case 'meeting': {
      const item = data.meetings.find((meeting) => meeting.id === id)
      if (!item) return null
      const attendees = item.attendees.map((personId) => byPerson[personId]?.name).filter(Boolean).join(', ')
      const project = item.projectId ? byProject[item.projectId] : undefined
      return {
        title: item.title,
        badge: <TypeBadge label="Cuộc họp" color="var(--color-warning)" />,
        body: (
          <DrawerBody
            rows={[
              ['Ngày', `${item.date.slice(5).replace('-', '/')} lúc ${item.time}`],
              ['Trạng thái', <StatusChip key="meeting-status" label={formatMeetingStatus(item.status)} tone="waiting" />],
              ['Người tham dự', attendees || '—'],
              project ? ['Dự án', project.name] : null,
              item.taskDraftCount > 0 ? ['Draft đầu việc', `${item.taskDraftCount} mục chờ import`] : null,
            ]}
            futureRoute={item.futureRoute}
          />
        ),
      }
    }

    case 'approval': {
      const item = data.approvals.find((approval) => approval.id === id)
      if (!item) return null
      const requester = byPerson[item.requesterId]
      const approver = byPerson[item.approverId]
      const project = item.projectId ? byProject[item.projectId] : undefined
      return {
        title: item.title,
        badge: <TypeBadge label="Chờ phê duyệt" color="var(--color-warning)" />,
        body: (
          <DrawerBody
            rows={[
              ['Mô tả', item.description],
              ['Người gửi', requester?.name ?? '—'],
              ['Người duyệt', approver?.name ?? '—'],
              project ? ['Dự án', project.name] : null,
              ['Ngày gửi', item.submittedDate.slice(5).replace('-', '/')],
              ['Hạn duyệt', formatRelativeDate(item.deadline)],
              ['Đã chờ', `${item.daysWaiting} ngày`],
              ['Trạng thái', <StatusChip key="approval-status" label={formatApprovalStatus(item.status)} tone={item.status === 'overdue' ? 'danger' : 'warning'} />],
            ]}
            futureRoute={item.futureRoute}
          />
        ),
      }
    }

    case 'ceo': {
      const item = data.ceoRequests.find((request) => request.id === id)
      if (!item) return null
      const escalatedBy = byPerson[item.escalatedBy]
      const project = item.projectId ? byProject[item.projectId] : undefined
      const severityTone = item.severity === 'critical' ? 'danger' : item.severity === 'warning' ? 'warning' : 'neutral'
      const severityColor = item.severity === 'critical'
        ? 'var(--color-danger)'
        : item.severity === 'warning'
          ? 'var(--color-warning)'
          : 'var(--color-text-muted)'
      return {
        title: item.title,
        badge: <TypeBadge label="Cần báo CEO" color={severityColor} />,
        body: (
          <DrawerBody
            rows={[
              ['Vấn đề', item.issue],
              ['Mức độ', <StatusChip key="severity" label={formatSeverity(item.severity)} tone={severityTone} />],
              project ? ['Dự án', project.name] : null,
              ['Ảnh hưởng', item.impact],
              ['Hậu quả nếu chậm', item.consequence],
              ['Hành động đề xuất', item.proposedAction],
              ['Người escalate', escalatedBy?.name ?? '—'],
              ['Ngày tạo', item.createdDate.slice(5).replace('-', '/')],
            ]}
            futureRoute={item.futureRoute}
          />
        ),
      }
    }

    case 'task': {
      const item = data.tasks.find((task) => task.id === id)
      if (!item) return null
      const owner = byPerson[item.ownerId]
      const project = item.projectId ? byProject[item.projectId] : undefined
      return {
        title: item.title,
        badge: <TypeBadge label="Đầu việc" color="var(--color-text-muted)" />,
        body: (
          <TaskBody
            rows={[
              ['Owner', owner ? `${owner.name} · ${owner.role}` : '—'],
              project ? ['Dự án', project.name] : null,
              ['Hạn', formatRelativeDate(item.dueDate)],
              ['Trạng thái', <StatusChip key="task-status" label={formatTaskStatus(item.status)} tone={statusTone(item.status)} />],
              item.waitingFor ? ['Đang chờ', item.waitingFor] : null,
            ]}
            futureRoute={item.futureRoute}
            projectId={item.projectId}
            taskId={item.id}
            workspaceId={workspaceId}
          />
        ),
      }
    }

    case 'deliverable': {
      const item = data.deliverables.find((deliverable) => deliverable.id === id)
      if (!item) return null
      const owner = byPerson[item.ownerId]
      const project = item.projectId ? byProject[item.projectId] : undefined
      return {
        title: item.title,
        badge: <TypeBadge label="File / bàn giao" color="var(--color-text-muted)" />,
        body: (
          <TaskBody
            rows={[
              ['Owner', owner ? `${owner.name} · ${owner.role}` : '—'],
              project ? ['Dự án', project.name] : null,
              ['Hạn nộp', formatRelativeDate(item.dueDate)],
              ['Loại', formatDeliverableType(item.type)],
              ['Trạng thái', <StatusChip key="deliverable-status" label={formatDeliverableStatus(item.status)} tone={deliverableTone(item.status)} />],
            ]}
            futureRoute={item.futureRoute}
            projectId={item.projectId}
            taskId={item.taskId}
            deliverableId={item.id}
            workspaceId={workspaceId}
          />
        ),
      }
    }

    default:
      return null
  }
}

function TypeBadge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      fontSize: 10,
      fontWeight: 700,
      padding: '2px 8px',
      borderRadius: 'var(--radius-sm)',
      border: `1px solid ${color}`,
      color,
      background: 'rgba(255,255,255,.04)',
      flexShrink: 0,
    }}>
      {label}
    </span>
  )
}

interface TaskBodyProps {
  rows: DrawerRow[]
  futureRoute?: string
  workspaceId?: string
  projectId?: string
  taskId?: string
  deliverableId?: string
}

function TaskBody({ rows, futureRoute, workspaceId, projectId, taskId, deliverableId }: TaskBodyProps) {
  const [refreshKey, setRefreshKey] = React.useState(0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <DrawerBody rows={rows} futureRoute={futureRoute} />

      <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-4)' }}>
        <div style={sectionLabelStyle}>Tệp đính kèm</div>
        {workspaceId ? (
          <>
            <FileList
              workspaceId={workspaceId}
              projectId={projectId}
              taskId={taskId}
              deliverableId={deliverableId}
              refreshKey={refreshKey}
            />
            <div style={{ marginTop: 'var(--space-3)' }}>
              <FileUpload
                workspaceId={workspaceId}
                projectId={projectId}
                taskId={taskId}
                deliverableId={deliverableId}
                compact
                label="Tải file lên đầu việc này"
                onUploaded={() => setRefreshKey((key) => key + 1)}
              />
            </div>
          </>
        ) : (
          <div style={mutedTextStyle}>
            Chưa xác định được workspace nên chưa thể tải hoặc xem file. Hãy đăng nhập lại hoặc kiểm tra quyền workspace.
          </div>
        )}
      </div>
    </div>
  )
}

type DrawerRow = [string, React.ReactNode] | null

function DrawerBody({ rows, futureRoute }: { rows: DrawerRow[]; futureRoute?: string }) {
  const router = useRouter()
  const [copied, setCopied] = React.useState(false)
  const valid = rows.filter((row): row is [string, React.ReactNode] => row !== null)

  async function copyLink() {
    if (!futureRoute) return
    try {
      await navigator.clipboard.writeText(futureRoute)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      {valid.map(([label, value]) => (
        <div key={label} style={drawerRowStyle}>
          <span style={drawerLabelStyle}>{label}</span>
          <span style={drawerValueStyle}>{value}</span>
        </div>
      ))}

      {futureRoute ? (
        <div style={linkActionsStyle}>
          <button type="button" style={primaryLinkButtonStyle} onClick={() => router.push(futureRoute)}>
            Mở đầu việc ↗
          </button>
          <button type="button" style={secondaryLinkButtonStyle} onClick={copyLink}>
            {copied ? 'Đã copy' : 'Copy link'}
          </button>
        </div>
      ) : null}
    </div>
  )
}

type StatusTone = 'neutral' | 'warning' | 'danger' | 'success' | 'waiting'

function StatusChip({ label, tone = 'neutral' }: { label: string; tone?: StatusTone }) {
  const color = toneColor(tone)
  return (
    <span style={{
      display: 'inline-flex',
      width: 'fit-content',
      alignItems: 'center',
      padding: '3px 8px',
      borderRadius: 999,
      border: `1px solid ${color}`,
      color,
      background: toneBackground(tone),
      fontSize: 11,
      fontWeight: 800,
    }}>
      {label}
    </span>
  )
}

function formatTaskStatus(status?: string | null) {
  return TASK_STATUS_LABELS[status ?? ''] ?? 'Chưa rõ'
}

function formatMeetingStatus(status?: string | null) {
  return MEETING_STATUS_LABELS[status ?? ''] ?? 'Cần kiểm tra'
}

function formatApprovalStatus(status?: string | null) {
  return APPROVAL_STATUS_LABELS[status ?? ''] ?? 'Chưa rõ'
}

function formatReminderResponse(response?: string | null) {
  return REMINDER_RESPONSE_LABELS[response ?? ''] ?? 'Chưa phản hồi'
}

function formatDeliverableStatus(status?: string | null) {
  return DELIVERABLE_STATUS_LABELS[status ?? ''] ?? 'Chưa rõ'
}

function formatDeliverableType(type?: string | null) {
  return DELIVERABLE_TYPE_LABELS[type ?? ''] ?? 'Tài liệu'
}

function formatSeverity(severity?: string | null) {
  return SEVERITY_LABELS[severity ?? ''] ?? 'Thông tin'
}

function statusTone(status?: string | null): StatusTone {
  if (status === 'COMPLETED' || status === 'DONE') return 'success'
  if (status === 'BLOCKED' || status === 'CANCELLED') return 'danger'
  if (status === 'REVISION_REQUIRED') return 'danger'
  if (status === 'WAITING' || status === 'PENDING_APPROVAL' || status === 'PENDING_REVIEW') return 'warning'
  if (status === 'IN_PROGRESS') return 'waiting'
  return 'neutral'
}

function deliverableTone(status?: string | null): StatusTone {
  if (status === 'APPROVED' || status === 'SUBMITTED') return 'success'
  if (status === 'REVISION_REQUIRED' || status === 'MISSING_INFORMATION' || status === 'NOT_SUBMITTED') return 'danger'
  if (status === 'REQUIRED') return 'warning'
  return 'neutral'
}

function toneColor(tone: StatusTone) {
  if (tone === 'success') return 'var(--color-success)'
  if (tone === 'danger') return 'var(--color-danger)'
  if (tone === 'warning') return 'var(--color-warning)'
  if (tone === 'waiting') return 'var(--color-waiting)'
  return 'var(--color-text-muted)'
}

function toneBackground(tone: StatusTone) {
  if (tone === 'success') return 'var(--color-success-bg)'
  if (tone === 'danger') return 'var(--color-danger-bg)'
  if (tone === 'warning') return 'var(--color-warning-bg)'
  if (tone === 'waiting') return 'var(--color-waiting-bg)'
  return 'var(--color-surface-2)'
}

const TASK_STATUS_LABELS: Record<string, string> = {
  NOT_STARTED: 'Chưa bắt đầu',
  TODO: 'Chưa bắt đầu',
  IN_PROGRESS: 'Đang làm',
  WAITING: 'Đang chờ',
  PENDING_APPROVAL: 'Chờ duyệt',
  PENDING_REVIEW: 'Chờ duyệt',
  REVISION_REQUIRED: 'Cần sửa',
  COMPLETED: 'Hoàn thành',
  DONE: 'Hoàn thành',
  BLOCKED: 'Bị chặn',
  CANCELLED: 'Đã hủy',
}

const MEETING_STATUS_LABELS: Record<string, string> = {
  no_minutes: 'Chưa có biên bản',
  minutes_no_tasks: 'Biên bản chưa có đầu việc',
  draft_pending: 'Draft chờ nhập',
  follow_up_needed: 'Cần follow-up',
  done: 'Đã xong',
}

const APPROVAL_STATUS_LABELS: Record<string, string> = {
  pending: 'Chờ duyệt',
  approved: 'Đã duyệt',
  rejected: 'Từ chối',
  overdue: 'Trễ duyệt',
}

const REMINDER_RESPONSE_LABELS: Record<string, string> = {
  NOT_REMINDED: 'Chưa nhắc',
  SENT: 'Đã nhắc',
  SEEN: 'Đã xem',
  WAITING_RESPONSE: 'Chờ phản hồi',
  PROMISED: 'Đã hứa',
  EXTENSION_REQUESTED: 'Xin gia hạn',
  FILE_SUBMITTED: 'Đã nộp file',
  NO_RESPONSE: 'Chưa phản hồi',
  ESCALATED: 'Đã escalate',
  CLOSED: 'Đã đóng',
}

const DELIVERABLE_STATUS_LABELS: Record<string, string> = {
  REQUIRED: 'Bắt buộc nộp',
  NOT_SUBMITTED: 'Chưa nộp',
  SUBMITTED: 'Đã nộp',
  MISSING_INFORMATION: 'Thiếu thông tin',
  REVISION_REQUIRED: 'Cần sửa',
  APPROVED: 'Đã duyệt',
}

const DELIVERABLE_TYPE_LABELS: Record<string, string> = {
  report: 'Báo cáo',
  file: 'File',
  presentation: 'Slide / trình bày',
  contract: 'Hợp đồng',
  data: 'Dữ liệu',
}

const SEVERITY_LABELS: Record<string, string> = {
  critical: 'Nghiêm trọng',
  warning: 'Cần chú ý',
  info: 'Thông tin',
}

const backdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 199,
  background: 'rgba(10,10,10,0.38)',
  backdropFilter: 'blur(2px)',
}

const drawerStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  right: 0,
  bottom: 0,
  width: 'min(480px, 92vw)',
  background: 'var(--color-surface)',
  borderLeft: '1px solid var(--color-border)',
  boxShadow: '-4px 0 32px rgba(0,0,0,0.12)',
  zIndex: 200,
  display: 'flex',
  flexDirection: 'column',
  overflowY: 'auto',
}

const drawerHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-3)',
  padding: 'var(--space-4) var(--space-5)',
  borderBottom: '1px solid var(--color-border)',
  position: 'sticky',
  top: 0,
  background: 'var(--color-surface)',
  zIndex: 1,
}

const drawerTitleStyle: React.CSSProperties = {
  fontFamily: 'var(--font-serif)',
  fontSize: 'var(--text-base)',
  fontWeight: 700,
  margin: 0,
  flex: 1,
  lineHeight: 1.3,
}

const closeButtonStyle: React.CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--color-border)',
  background: 'transparent',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--color-text-muted)',
  flexShrink: 0,
}

const footerNoteStyle: React.CSSProperties = {
  padding: 'var(--space-4) var(--space-5)',
  borderTop: '1px solid var(--color-border)',
  fontSize: 11,
  color: 'var(--color-text-muted)',
  fontStyle: 'italic',
}

const sectionLabelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--color-text-muted)',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  marginBottom: 'var(--space-3)',
}

const mutedTextStyle: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  color: 'var(--color-text-muted)',
  lineHeight: 1.5,
}

const drawerRowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '120px 1fr',
  gap: 'var(--space-3)',
  alignItems: 'flex-start',
}

const drawerLabelStyle: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  color: 'var(--color-text-muted)',
  fontWeight: 500,
  paddingTop: 1,
}

const drawerValueStyle: React.CSSProperties = {
  fontSize: 'var(--text-sm)',
  color: 'var(--color-text)',
  lineHeight: 1.5,
}

const linkActionsStyle: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  marginTop: 'var(--space-4)',
  paddingTop: 'var(--space-4)',
  borderTop: '1px solid var(--color-border)',
}

const primaryLinkButtonStyle: React.CSSProperties = {
  flex: 1,
  border: '1px solid var(--color-lime)',
  background: 'var(--color-lime)',
  color: 'var(--color-charcoal)',
  borderRadius: 'var(--radius-md)',
  padding: '9px 12px',
  fontSize: 12,
  fontWeight: 800,
  cursor: 'pointer',
}

const secondaryLinkButtonStyle: React.CSSProperties = {
  border: '1px solid var(--color-border)',
  background: 'var(--color-surface-2)',
  color: 'var(--color-text)',
  borderRadius: 'var(--radius-md)',
  padding: '9px 12px',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
}
