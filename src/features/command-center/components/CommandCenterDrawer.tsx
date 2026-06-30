'use client'
import React from 'react'
import type {
  DrawerState, DrawerItemType,
  Reminder, Meeting, Approval, CEODecisionRequest, Task, Deliverable,
  Person, Project,
} from '../types'
import { formatRelativeDate } from '../utils'
import { FileUpload } from '@/components/ui/FileUpload'
import { FileList } from '@/components/ui/FileList'

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
  const byPerson = Object.fromEntries(data.people.map(p => [p.id, p]))
  const byProject = Object.fromEntries(data.projects.map(p => [p.id, p]))

  // Trap focus / Escape
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    if (state.open) document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [state.open, onClose])

  if (!state.open || !state.type || !state.id) return null

  const content = resolveContent(state.type, state.id, data, byPerson, byProject, workspaceId)

  return (
    <>
      {/* Backdrop */}
      <div
        role="presentation"
        style={{
          position: 'fixed', inset: 0, zIndex: 199,
          background: 'rgba(10,10,10,0.38)',
          backdropFilter: 'blur(2px)',
        }}
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={content?.title ?? 'Chi tiết'}
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0,
          width: 'min(480px, 92vw)',
          background: 'var(--color-surface)',
          borderLeft: '1px solid var(--color-border)',
          boxShadow: '-4px 0 32px rgba(0,0,0,0.12)',
          zIndex: 200,
          display: 'flex', flexDirection: 'column',
          overflowY: 'auto',
        }}
      >
        {/* Drawer header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
          padding: 'var(--space-4) var(--space-5)',
          borderBottom: '1px solid var(--color-border)',
          position: 'sticky', top: 0,
          background: 'var(--color-surface)',
          zIndex: 1,
        }}>
          {content?.badge}
          <h2 style={{
            fontFamily: 'var(--font-serif)', fontSize: 'var(--text-base)', fontWeight: 700,
            margin: 0, flex: 1, lineHeight: 1.3,
          }}>{content?.title ?? '—'}</h2>
          <button
            onClick={onClose}
            aria-label="Đóng"
            style={{
              width: 32, height: 32, borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)', background: 'transparent',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--color-text-muted)', flexShrink: 0,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 2L12 12M12 2L2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Drawer body */}
        <div style={{ padding: 'var(--space-5)', flex: 1 }}>
          {content ? content.body : (
            <div style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
              Không tìm thấy dữ liệu.
            </div>
          )}
        </div>

        {/* Footer note */}
        <div style={{
          padding: 'var(--space-4) var(--space-5)',
          borderTop: '1px solid var(--color-border)',
          fontSize: 11, color: 'var(--color-text-muted)', fontStyle: 'italic',
        }}>
          Dữ liệu được đọc theo workspace hiện tại. Nếu liên kết chi tiết chưa mở được, kiểm tra route tương ứng hoặc quyền truy cập.
        </div>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Content resolvers per type
// ---------------------------------------------------------------------------

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
      const item = data.reminders.find(r => r.id === id)
      if (!item) return null
      const person = byPerson[item.personId]
      return {
        title: item.content,
        badge: <TypeBadge label="Nhắc việc" color="var(--color-danger)" />,
        body: (
          <DrawerBody rows={[
            ['Người nợ', person ? `${person.name} · ${person.role}` : '—'],
            ['Hạn', formatRelativeDate(item.dueDate)],
            ['Đã nhắc', `${item.reminderCount} lần · Lần cuối: ${item.lastReminderDate.slice(5).replace('-', '/')}`],
            ['Trạng thái phản hồi', item.response],
            item.responseNote ? ['Ghi chú phản hồi', item.responseNote] : null,
          ]} futureRoute={item.futureRoute} />
        ),
      }
    }
    case 'meeting': {
      const item = data.meetings.find(m => m.id === id)
      if (!item) return null
      const attendees = item.attendees.map(id => byPerson[id]?.name).filter(Boolean).join(', ')
      const project = item.projectId ? byProject[item.projectId] : undefined
      return {
        title: item.title,
        badge: <TypeBadge label="Cuộc họp" color="var(--color-warning)" />,
        body: (
          <DrawerBody rows={[
            ['Ngày', `${item.date.slice(5).replace('-', '/')} lúc ${item.time}`],
            ['Trạng thái', item.status],
            ['Người tham dự', attendees || '—'],
            project ? ['Dự án', project.name] : null,
            item.taskDraftCount > 0 ? ['Draft đầu việc', `${item.taskDraftCount} mục chờ import`] : null,
          ]} futureRoute={item.futureRoute} />
        ),
      }
    }
    case 'approval': {
      const item = data.approvals.find(a => a.id === id)
      if (!item) return null
      const requester = byPerson[item.requesterId]
      const approver = byPerson[item.approverId]
      const project = item.projectId ? byProject[item.projectId] : undefined
      return {
        title: item.title,
        badge: <TypeBadge label="Chờ phê duyệt" color="var(--color-warning)" />,
        body: (
          <DrawerBody rows={[
            ['Mô tả', item.description],
            ['Người gửi', requester?.name ?? '—'],
            ['Người duyệt', approver?.name ?? '—'],
            project ? ['Dự án', project.name] : null,
            ['Ngày gửi', item.submittedDate.slice(5).replace('-', '/')],
            ['Hạn duyệt', formatRelativeDate(item.deadline)],
            ['Đã chờ', `${item.daysWaiting} ngày`],
            ['Trạng thái', item.status],
          ]} futureRoute={item.futureRoute} />
        ),
      }
    }
    case 'ceo': {
      const item = data.ceoRequests.find(c => c.id === id)
      if (!item) return null
      const escalatedBy = byPerson[item.escalatedBy]
      const project = item.projectId ? byProject[item.projectId] : undefined
      const severityColor = item.severity === 'critical' ? 'var(--color-danger)'
        : item.severity === 'warning' ? 'var(--color-warning)'
        : 'var(--color-text-muted)'
      return {
        title: item.title,
        badge: <TypeBadge label="Cần báo CEO" color={severityColor} />,
        body: (
          <DrawerBody rows={[
            ['Vấn đề', item.issue],
            ['Mức độ', item.severity],
            project ? ['Dự án', project.name] : null,
            ['Ảnh hưởng', item.impact],
            ['Hậu quả nếu chậm', item.consequence],
            ['Hành động đề xuất', item.proposedAction],
            ['Người escalate', escalatedBy?.name ?? '—'],
            ['Ngày tạo', item.createdDate.slice(5).replace('-', '/')],
          ]} futureRoute={item.futureRoute} />
        ),
      }
    }
    case 'task': {
      const item = data.tasks.find(t => t.id === id)
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
              ['Trạng thái', item.status],
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
      const item = data.deliverables.find(d => d.id === id)
      if (!item) return null
      const owner = byPerson[item.ownerId]
      const project = item.projectId ? byProject[item.projectId] : undefined
      return {
        title: item.title,
        badge: <TypeBadge label="File/Deliverable" color="var(--color-text-muted)" />,
        body: (
          <TaskBody
            rows={[
              ['Owner', owner ? `${owner.name} · ${owner.role}` : '—'],
              project ? ['Dự án', project.name] : null,
              ['Hạn nộp', formatRelativeDate(item.dueDate)],
              ['Loại', item.type],
              ['Trạng thái', item.status],
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

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------

function TypeBadge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 8px',
      borderRadius: 'var(--radius-sm)',
      border: `1px solid ${color}`,
      color,
      background: color + '14',
      flexShrink: 0,
    }}>{label}</span>
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

      {/* File section */}
      <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-4)' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 'var(--space-3)' }}>
          Tệp đính kèm
        </div>
        {workspaceId ? (
          <>
            <FileList
              workspaceId={workspaceId}
              projectId={projectId}
              taskId={taskId}
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
                onUploaded={() => setRefreshKey(k => k + 1)}
              />
            </div>
          </>
        ) : (
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
            Chưa xác định được workspace nên chưa thể tải hoặc xem file. Hãy đăng nhập lại hoặc kiểm tra quyền workspace.
          </div>
        )}
      </div>
    </div>
  )
}

type DrawerRow = [string, string] | null

function DrawerBody({ rows, futureRoute }: { rows: DrawerRow[]; futureRoute?: string }) {
  const valid = rows.filter((r): r is [string, string] => r !== null)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      {valid.map(([label, value]) => (
        <div key={label} style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 'var(--space-3)', alignItems: 'flex-start' }}>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', fontWeight: 500, paddingTop: 1 }}>
            {label}
          </span>
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text)', lineHeight: 1.5 }}>
            {value}
          </span>
        </div>
      ))}
      {futureRoute && (
        <div style={{ marginTop: 'var(--space-4)', paddingTop: 'var(--space-4)', borderTop: '1px solid var(--color-border)' }}>
          <span style={{
            fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', fontStyle: 'italic',
          }}>
            Link đầy đủ: <code style={{ fontSize: 11, background: 'var(--color-surface-2)', padding: '1px 5px', borderRadius: 3 }}>{futureRoute}</code>
          </span>
        </div>
      )}
    </div>
  )
}
