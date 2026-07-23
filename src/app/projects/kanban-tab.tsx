'use client'

import React from 'react'
import { createPortal } from 'react-dom'
import { ConfirmDialog } from '@/components/feedback/Modal'
import { OverlayPortal } from '@/components/feedback/OverlayPortal'
import type { CommandCenterPersonRow } from '@/lib/database.types'
import {
  STATUS_META,
  TASK_STATUS_OPTIONS,
  TASK_STATUS_ORDER,
  formatDeadlineLabel,
  getDeadlineSignal,
  getSubtaskProgress,
  isUnassignedSubtask,
  matchesProjectWorkFilter,
  sortSubtasksForOperations,
  toFullDate,
} from './helpers'
import {
  inlineMetaStyle,
  mutedMetaStyle,
  progressBadgeStyle,
  progressFill,
  progressTrack,
  subtaskInlineItem,
} from './styles'
import { SubtaskSignalBadges } from './ui-primitives'
import type { ProjectFilters, ProjectWorkspace, SubtaskItem, TaskStatus } from './types'

const KANBAN_COLUMNS: TaskStatus[] = ['UNASSIGNED', ...TASK_STATUS_ORDER]
const KANBAN_STATUS_OPTIONS = [
  { value: 'UNASSIGNED' as const, ...STATUS_META.UNASSIGNED },
  ...TASK_STATUS_OPTIONS,
]
const CORE_KANBAN_COLUMNS: TaskStatus[] = ['UNASSIGNED', 'NOT_STARTED', 'IN_PROGRESS', 'COMPLETED']

export function KanbanTab({
  project,
  people,
  filters,
  selectedSubtaskId,
  onSelectSubtask,
  onChangeStatus,
  renderSubtaskDetail,
}: {
  project: ProjectWorkspace
  people: Record<string, CommandCenterPersonRow>
  filters: ProjectFilters
  selectedSubtaskId: string | null
  onSelectSubtask: (id: string) => void
  onChangeStatus: (subtask: SubtaskItem, nextStatus: TaskStatus) => Promise<boolean>
  renderSubtaskDetail: (subtask: SubtaskItem) => React.ReactNode
}) {
  const [draggingSubtaskId, setDraggingSubtaskId] = React.useState<string | null>(null)
  const [mouseDragSubtaskId, setMouseDragSubtaskId] = React.useState<string | null>(null)
  const [mouseDragSourceStatus, setMouseDragSourceStatus] = React.useState<TaskStatus | null>(null)
  const [dragOverStatus, setDragOverStatus] = React.useState<TaskStatus | null>(null)
  const [showAllColumns, setShowAllColumns] = React.useState(false)
  const [pendingUnassignedCompletion, setPendingUnassignedCompletion] = React.useState<SubtaskItem | null>(null)
  const subtasks = project.workstreams.flatMap((workstream) =>
    workstream.subtasks
      .filter((subtask) => matchesProjectWorkFilter(subtask, filters, { project, workstream }))
      .map((subtask) => ({ ...subtask, workstreamTitle: workstream.title })),
  )
  const activeDragSubtaskId = draggingSubtaskId ?? mouseDragSubtaskId
  const columnItems = KANBAN_COLUMNS.reduce((map, status) => {
    map[status] = sortSubtasksForOperations(subtasks.filter((subtask) => subtask.status === status))
    return map
  }, {} as Record<TaskStatus, Array<SubtaskItem & { workstreamTitle: string }>>)
  const visibleColumns = KANBAN_COLUMNS.filter((status) =>
    showAllColumns || CORE_KANBAN_COLUMNS.includes(status) || columnItems[status].length > 0,
  )
  const hiddenEmptyCount = KANBAN_COLUMNS.length - visibleColumns.length
  const selectedKanbanSubtask = selectedSubtaskId
    ? subtasks.find((subtask) => subtask.id === selectedSubtaskId) ?? null
    : null

  async function handleDrop(event: React.DragEvent<HTMLElement>, status: TaskStatus) {
    event.preventDefault()
    const subtaskId = event.dataTransfer.getData('text/plain') || draggingSubtaskId
    setDraggingSubtaskId(null)
    setMouseDragSubtaskId(null)
    setMouseDragSourceStatus(null)
    setDragOverStatus(null)
    const subtask = subtasks.find((item) => item.id === subtaskId)
    if (!subtask || subtask.status === status) return
    await requestStatusChange(subtask, status)
  }

  function beginMouseDrag(event: React.MouseEvent<HTMLElement>, subtask: SubtaskItem) {
    if (event.button !== 0) return
    setMouseDragSubtaskId(subtask.id)
    setMouseDragSourceStatus(subtask.status)
  }

  async function handleMouseDrop(status: TaskStatus) {
    if (!mouseDragSubtaskId) return
    const subtask = subtasks.find((item) => item.id === mouseDragSubtaskId)
    const sourceStatus = mouseDragSourceStatus
    setMouseDragSubtaskId(null)
    setMouseDragSourceStatus(null)
    setDragOverStatus(null)
    if (!subtask || sourceStatus === status || subtask.status === status) return
    await requestStatusChange(subtask, status)
  }

  async function requestStatusChange(subtask: SubtaskItem, nextStatus: TaskStatus) {
    if (subtask.status === 'UNASSIGNED' && nextStatus === 'COMPLETED') {
      setPendingUnassignedCompletion(subtask)
      return false
    }
    return onChangeStatus(subtask, nextStatus)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={kanbanControlBar}>
        <div style={kanbanHintStyle}>
          Kéo thả card để đổi trạng thái, hoặc bấm Chuyển trạng thái.
          {!showAllColumns && hiddenEmptyCount > 0 ? <span> Đang ẩn {hiddenEmptyCount} cột trống.</span> : null}
        </div>
        <div style={kanbanToggleGroup}>
          <button type="button" onClick={() => setShowAllColumns(false)} style={kanbanToggleButtonStyle(!showAllColumns)}>
            Ẩn cột trống
          </button>
          <button type="button" onClick={() => setShowAllColumns(true)} style={kanbanToggleButtonStyle(showAllColumns)}>
            Hiện tất cả trạng thái
          </button>
        </div>
      </div>
      <div style={kanbanGridStyle(visibleColumns.length, showAllColumns)}>
      {visibleColumns.map((status) => {
        const items = columnItems[status]
        return (
          <section
            key={status}
            data-kanban-status={status}
            style={{
              ...kanbanColumn,
              ...(status === 'UNASSIGNED' ? kanbanUnassignedColumn : {}),
              ...(dragOverStatus === status ? kanbanColumnDropActive : {}),
            }}
            onDragOver={(event) => {
              event.preventDefault()
              event.dataTransfer.dropEffect = 'move'
              setDragOverStatus(status)
            }}
            onMouseEnter={() => {
              if (mouseDragSubtaskId) setDragOverStatus(status)
            }}
            onDragLeave={() => setDragOverStatus((current) => (current === status ? null : current))}
            onDrop={(event) => void handleDrop(event, status)}
            onMouseUp={() => void handleMouseDrop(status)}
          >
            <div style={kanbanHead}>
              <span style={kanbanHeadLabel}>
                {status === 'UNASSIGNED' ? <i className="ti ti-inbox" aria-hidden="true" /> : null}
                {STATUS_META[status].label}
              </span>
              <span style={progressBadgeStyle}>{items.length}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 80 }}>
              {!items.length ? <div style={kanbanEmptyState}>Không có việc phù hợp</div> : null}
              {items.map((subtask) => (
                <div key={subtask.id} style={subtaskInlineItem}>
                <div
                  data-kanban-card={subtask.id}
                  draggable
                  role="button"
                  tabIndex={0}
                  aria-label={`Mở ${subtask.title}`}
                  onClick={() => onSelectSubtask(subtask.id)}
                  onMouseDown={(event) => beginMouseDrag(event, subtask)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') onSelectSubtask(subtask.id)
                  }}
                  onDragStart={(event) => {
                    setDraggingSubtaskId(subtask.id)
                    event.dataTransfer.effectAllowed = 'move'
                    event.dataTransfer.setData('text/plain', subtask.id)
                  }}
                  onDragEnd={() => {
                    setDraggingSubtaskId(null)
                    setMouseDragSubtaskId(null)
                    setMouseDragSourceStatus(null)
                    setDragOverStatus(null)
                  }}
                  style={kanbanCard(selectedSubtaskId === subtask.id, activeDragSubtaskId === subtask.id, subtask)}
                >
                  <div style={mutedMetaStyle}>{subtask.workstreamTitle}</div>
                  <div style={kanbanTitle}>{subtask.title}</div>
                  <SubtaskSignalBadges subtask={subtask} compact />
                  <div style={progressTrack}><span data-vyvy-bar="true" style={{ ...progressFill, width: `${getSubtaskProgress(subtask)}%` }} /></div>
                  <div style={inlineMetaStyle}>
                    <span>{people[subtask.ownerId ?? '']?.full_name ?? 'Chưa gắn người'}</span>
                    <span title={subtask.dueDate ? toFullDate(subtask.dueDate) : undefined}>{formatDeadlineLabel(subtask.dueDate, subtask.status)}</span>
                  </div>
                  <select
                    aria-label="Chuyển trạng thái"
                    value={subtask.status}
                    onClick={(event) => event.stopPropagation()}
                    onMouseDown={(event) => event.stopPropagation()}
                    onChange={(event) => {
                      event.stopPropagation()
                      void requestStatusChange(subtask, event.target.value as TaskStatus)
                    }}
                    style={kanbanStatusSelect}
                  >
                    {KANBAN_STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onMouseDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation()
                      onSelectSubtask(subtask.id)
                    }}
                    style={kanbanOpenDetailButton(selectedSubtaskId === subtask.id)}
                  >
                    {selectedSubtaskId === subtask.id ? 'Đang mở chi tiết' : 'Mở chi tiết'}
                  </button>
                </div>
                </div>
              ))}
            </div>
          </section>
        )
      })}
      </div>
      {selectedKanbanSubtask && typeof document !== 'undefined' ? createPortal((
        <aside aria-label="Kanban task detail" style={kanbanDetailDrawer}>
          <div style={kanbanDetailDrawerHeader}>
            <div style={kanbanDetailDrawerTitle}>{'Chi tiết đầu việc con'}</div>
            <button
              type="button"
              onClick={() => onSelectSubtask(selectedKanbanSubtask.id)}
              style={kanbanDetailDrawerClose}
            >
              {'Đóng'}
            </button>
          </div>
          {renderSubtaskDetail(selectedKanbanSubtask)}
        </aside>
      ), document.body) : null}
      <OverlayPortal isOpen={Boolean(pendingUnassignedCompletion)}>
        <ConfirmDialog
          open={Boolean(pendingUnassignedCompletion)}
          onClose={() => setPendingUnassignedCompletion(null)}
          onConfirm={() => {
            if (pendingUnassignedCompletion) {
              void onChangeStatus(pendingUnassignedCompletion, 'COMPLETED')
            }
          }}
          title="Đánh dấu hoàn thành (bỏ qua yêu cầu)?"
          message={pendingUnassignedCompletion
            ? buildUnassignedCompletionMessage(pendingUnassignedCompletion)
            : ''}
          confirmLabel="Đánh dấu hoàn thành"
          cancelLabel="Hủy"
        />
      </OverlayPortal>
    </div>
  )
}

function buildUnassignedCompletionMessage(subtask: SubtaskItem) {
  const missingOwner = !subtask.ownerId
  const missingDueDate = !subtask.dueDate || subtask.missingDueDate
  const missing = missingOwner && missingDueDate
    ? 'người phụ trách và deadline'
    : missingOwner
      ? 'người phụ trách'
      : 'deadline'
  return `Đầu việc ${subtask.title} chưa có ${missing}. Sẽ BỎ QUA yêu cầu file/báo cáo và các bước bắt buộc. Chỉ dùng cho việc vặt không cần bàn giao. Hành động này được ghi lại trong audit trail.`
}

function kanbanCard(active: boolean, dragging = false, subtask?: SubtaskItem): React.CSSProperties {
  const deadline = subtask ? getDeadlineSignal(subtask).kind : 'normal'
  const urgent = deadline === 'overdue' || deadline === 'today'
  const unassigned = subtask ? isUnassignedSubtask(subtask) : false
  const alert = urgent && unassigned
  const isUnassignedStatus = subtask?.status === 'UNASSIGNED'
  return {
    width: '100%',
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    padding: 14,
    borderRadius: 14,
    border: `1px solid ${active ? 'rgba(218,223,33,.45)' : isUnassignedStatus ? 'var(--line)' : alert ? 'rgba(184,64,64,.42)' : urgent ? 'rgba(184,139,62,.42)' : 'var(--line)'}`,
    background: isUnassignedStatus ? 'var(--surface-2)' : active ? 'rgba(218,223,33,.06)' : alert ? 'rgba(184,64,64,.12)' : urgent ? 'rgba(184,139,62,.10)' : 'var(--surface-2)',
    textAlign: 'left',
    cursor: dragging ? 'grabbing' : 'grab',
    opacity: dragging ? 0.62 : 1,
    boxShadow: dragging ? '0 18px 36px rgba(0,0,0,.28)' : 'none',
    overflow: 'hidden',
    wordBreak: 'normal',
    overflowWrap: 'normal',
    transition: 'border-color .16s ease, background .16s ease, opacity .16s ease, box-shadow .16s ease',
  }
}

function kanbanGridStyle(columnCount: number, showAllColumns: boolean): React.CSSProperties {
  return {
    display: 'grid',
    gridTemplateColumns: showAllColumns
      ? `repeat(${Math.max(columnCount, 1)}, minmax(240px, 1fr))`
      : `repeat(${Math.max(columnCount, 1)}, minmax(260px, 1fr))`,
    gap: 14,
    overflowX: 'auto',
    maxWidth: '100%',
    paddingBottom: 8,
  }
}

const kanbanControlBar: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 12,
  alignItems: 'center',
  flexWrap: 'wrap',
}

const kanbanToggleGroup: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  flexWrap: 'wrap',
}

function kanbanToggleButtonStyle(active: boolean): React.CSSProperties {
  return {
    minHeight: 34,
    padding: '0 12px',
    borderRadius: 999,
    border: `1px solid ${active ? 'rgba(218,223,33,.5)' : 'var(--line)'}`,
    background: active ? 'rgba(218,223,33,.12)' : 'var(--surface-2)',
    color: active ? 'var(--txt)' : 'var(--txt-3)',
    fontSize: 12,
    fontWeight: 800,
    cursor: 'pointer',
  }
}

const kanbanColumn: React.CSSProperties = {
  padding: 14,
  borderRadius: 16,
  background: 'var(--surface)',
  border: '1px solid var(--line)',
  minWidth: 0,
}

const kanbanUnassignedColumn: React.CSSProperties = {
  border: '1px dashed var(--color-border-strong)',
}

const kanbanColumnDropActive: React.CSSProperties = {
  borderColor: 'rgba(218,223,33,.5)',
  background: 'rgba(218,223,33,.06)',
  boxShadow: 'inset 0 0 0 1px rgba(218,223,33,.18)',
}

const kanbanHintStyle: React.CSSProperties = {
  padding: '9px 12px',
  borderRadius: 12,
  background: 'var(--surface-2)',
  border: '1px solid var(--line)',
  color: 'var(--txt-3)',
  fontSize: 12,
  fontWeight: 600,
}

const kanbanHead: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 8,
  alignItems: 'center',
  marginBottom: 12,
  fontSize: 14,
  fontWeight: 700,
  color: 'var(--txt)',
}

const kanbanHeadLabel: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 7,
}

const kanbanTitle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  color: 'var(--txt)',
  lineHeight: 1.35,
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
  wordBreak: 'normal',
  overflowWrap: 'break-word',
}

const kanbanStatusSelect: React.CSSProperties = {
  width: '100%',
  minHeight: 34,
  borderRadius: 10,
  border: '1px solid var(--line)',
  background: 'var(--surface)',
  color: 'var(--txt)',
  padding: '0 10px',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
}

function kanbanOpenDetailButton(active: boolean): React.CSSProperties {
  return {
    width: '100%',
    minHeight: 34,
    borderRadius: 10,
    border: `1px solid ${active ? 'rgba(218,223,33,.5)' : 'var(--line)'}`,
    background: active ? 'rgba(218,223,33,.14)' : 'var(--surface)',
    color: active ? 'var(--txt)' : 'var(--txt-2)',
    fontSize: 12,
    fontWeight: 800,
    cursor: 'pointer',
  }
}

const kanbanDetailDrawer: React.CSSProperties = {
  position: 'fixed',
  top: 76,
  right: 18,
  zIndex: 90,
  width: 'min(560px, calc(100vw - 32px))',
  maxHeight: 'calc(100vh - 96px)',
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  padding: 12,
  borderRadius: 18,
  border: '1px solid var(--line)',
  background: 'var(--surface)',
  boxShadow: '0 24px 80px rgba(0,0,0,.34)',
}

const kanbanDetailDrawerHeader: React.CSSProperties = {
  position: 'sticky',
  top: 0,
  zIndex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  padding: '10px 10px 12px',
  margin: '-12px -12px 0',
  borderBottom: '1px solid var(--line)',
  borderRadius: '18px 18px 0 0',
  background: 'var(--surface)',
}

const kanbanDetailDrawerTitle: React.CSSProperties = {
  minWidth: 0,
  color: 'var(--txt)',
  fontSize: 14,
  fontWeight: 900,
}

const kanbanDetailDrawerClose: React.CSSProperties = {
  minWidth: 72,
  minHeight: 34,
  borderRadius: 10,
  border: '1px solid var(--line)',
  background: 'var(--surface-2)',
  color: 'var(--txt)',
  fontSize: 12,
  fontWeight: 800,
  cursor: 'pointer',
}

const kanbanEmptyState: React.CSSProperties = {
  minHeight: 54,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 12,
  border: '1px dashed var(--line)',
  color: 'var(--txt-3)',
  fontSize: 12,
  fontWeight: 700,
  background: 'rgba(255,255,255,.02)',
}
