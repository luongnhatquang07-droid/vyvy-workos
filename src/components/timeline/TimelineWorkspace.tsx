'use client'

import React from 'react'
import Link from 'next/link'
import { ConfirmDialog } from '@/components/feedback/Modal'
import { OverlayPortal } from '@/components/feedback/OverlayPortal'
import { useToast } from '@/components/feedback/Toast'
import { PageHead } from '@/components/ui/PageHead'
import type { TaskStatus } from '@/lib/tasks/taskStatusService'
import { isTaskStatus } from '@/lib/tasks/taskStatusService'
import type {
  TimelineFilters,
  TimelinePageData,
  TimelineTask,
  TimelineZoom,
} from '@/features/timeline/types'
import {
  filterTimelineTasks,
  getDropSchedule,
  getTimelineScale,
  isUnscheduled,
  willUseUnassignedCompletionBypass,
} from '@/features/timeline/timelineUtils'
import { FilterBar } from './FilterBar'
import { TaskRow } from './TaskRow'
import { TaskEditPanel, type TimelineTaskDraft } from './TaskEditPanel'
import {
  buildTimelineUnassignedCompletionMessage,
  OWNER_COLORS,
} from './timelinePresentation'
import styles from './timeline.module.css'

const INITIAL_FILTERS: TimelineFilters = {
  ownerId: 'all',
  workstreamId: 'all',
  status: 'all',
}

interface TimelineWorkspaceProps {
  initialData: TimelinePageData
}

interface WorkspaceItemPatchResponse {
  error?: string
  item?: {
    start_date?: string | null
    due_date?: string | null
    status?: unknown
  }
}

export function TimelineWorkspace({ initialData }: TimelineWorkspaceProps) {
  const { toast } = useToast()
  const [tasks, setTasks] = React.useState(initialData.tasks)
  const [filters, setFilters] = React.useState<TimelineFilters>(INITIAL_FILTERS)
  const [zoom, setZoom] = React.useState<TimelineZoom>('week')
  const [selectedTaskId, setSelectedTaskId] = React.useState<string | null>(null)
  const [pendingUnassignedCompletion, setPendingUnassignedCompletion] =
    React.useState<TimelineTask | null>(null)
  const [savingIds, setSavingIds] = React.useState<Set<string>>(() => new Set())

  const selectedTask = selectedTaskId
    ? tasks.find((task) => task.id === selectedTaskId) ?? null
    : null
  const filteredTasks = React.useMemo(
    () => filterTimelineTasks(tasks, filters),
    [filters, tasks],
  )
  const scale = React.useMemo(
    () => getTimelineScale(filteredTasks, zoom),
    [filteredTasks, zoom],
  )
  const groupedTasks = React.useMemo(
    () => groupTasksByOwner(filteredTasks, initialData),
    [filteredTasks, initialData],
  )

  const unscheduledCount = tasks.filter(isUnscheduled).length
  const inProgressCount = tasks.filter((task) => task.status === 'IN_PROGRESS').length
  const completedCount = tasks.filter((task) => task.status === 'COMPLETED').length

  function setSaving(taskId: string, saving: boolean) {
    setSavingIds((current) => {
      const next = new Set(current)
      if (saving) next.add(taskId)
      else next.delete(taskId)
      return next
    })
  }

  function mergeTaskFromResponse(
    taskId: string,
    requestedPatch: Partial<Pick<TimelineTask, 'startDate' | 'dueDate' | 'status'>>,
    response: WorkspaceItemPatchResponse,
  ) {
    setTasks((current) => current.map((task) => {
      if (task.id !== taskId) return task
      const status = isTaskStatus(response.item?.status)
        ? response.item.status
        : hasOwn(requestedPatch, 'status')
          ? requestedPatch.status ?? task.status
          : task.status
      return {
        ...task,
        startDate: response.item && 'start_date' in response.item
          ? response.item.start_date ?? null
          : hasOwn(requestedPatch, 'startDate')
            ? requestedPatch.startDate ?? null
            : task.startDate,
        dueDate: response.item && 'due_date' in response.item
          ? response.item.due_date ?? null
          : hasOwn(requestedPatch, 'dueDate')
            ? requestedPatch.dueDate ?? null
            : task.dueDate,
        status,
      }
    }))
  }

  async function patchTask(
    taskId: string,
    patch: Record<string, unknown>,
    requestedPatch: Partial<Pick<TimelineTask, 'startDate' | 'dueDate' | 'status'>>,
  ) {
    const response = await fetch('/api/workspace-items', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'task', id: taskId, patch }),
    })
    const payload = await response.json().catch(() => null) as WorkspaceItemPatchResponse | null
    if (!response.ok) {
      throw new Error(payload?.error || 'Không thể cập nhật đầu việc. Vui lòng thử lại.')
    }
    const safePayload = payload ?? {}
    mergeTaskFromResponse(taskId, requestedPatch, safePayload)
    return safePayload
  }

  async function commitTaskStatus(task: TimelineTask, status: TaskStatus) {
    if (!task.canEdit || savingIds.has(task.id) || task.status === status) return
    setSaving(task.id, true)
    try {
      await patchTask(task.id, { status }, { status })
      toast(`Đã chuyển “${task.title}” sang trạng thái mới.`, 'success')
    } catch (error) {
      toast(errorMessage(error), 'error', 6000)
    } finally {
      setSaving(task.id, false)
    }
  }

  function requestTaskStatus(task: TimelineTask, status: TaskStatus) {
    if (willUseUnassignedCompletionBypass({
      currentStatus: task.status,
      nextStatus: status,
      ownerId: task.ownerId,
      dueDate: task.dueDate,
    })) {
      setPendingUnassignedCompletion(task)
      return
    }
    void commitTaskStatus(task, status)
  }

  async function dropTaskOnDate(taskId: string, targetDate: string) {
    const task = tasks.find((candidate) => candidate.id === taskId)
    if (!task || !task.canEdit || savingIds.has(task.id)) return
    if (!isUnscheduled(task)) {
      toast('Đầu việc đã có lịch. Bấm vào thanh thời gian để chỉnh ngày.', 'info')
      return
    }

    const schedule = getDropSchedule(task, targetDate, zoom)
    setSaving(task.id, true)
    try {
      await patchTask(
        task.id,
        { startDate: schedule.startDate, dueDate: schedule.dueDate },
        schedule,
      )
      toast(`Đã lên lịch “${task.title}” vào ${formatCompactDate(targetDate)}.`, 'success')
    } catch (error) {
      toast(errorMessage(error), 'error', 6000)
    } finally {
      setSaving(task.id, false)
    }
  }

  async function saveTaskDraft(task: TimelineTask, draft: TimelineTaskDraft) {
    if (!task.canEdit || savingIds.has(task.id)) return
    setSaving(task.id, true)
    let datesSaved = false
    try {
      const datesChanged = draft.startDate !== task.startDate || draft.dueDate !== task.dueDate
      if (datesChanged) {
        await patchTask(
          task.id,
          { startDate: draft.startDate, dueDate: draft.dueDate },
          { startDate: draft.startDate, dueDate: draft.dueDate },
        )
        datesSaved = true
      }

      // Status is intentionally a separate request. In particular COMPLETED
      // must go through the existing completion RPC/quality gate instead of
      // being hidden inside a broader date patch.
      if (draft.status !== task.status) {
        await patchTask(task.id, { status: draft.status }, { status: draft.status })
      }
      toast(`Đã lưu lịch cho “${task.title}”.`, 'success')
    } catch (error) {
      if (datesSaved) {
        throw new Error(`Ngày đã được lưu, nhưng trạng thái chưa cập nhật. ${errorMessage(error)}`)
      }
      throw error
    } finally {
      setSaving(task.id, false)
    }
  }

  const tableStyle = {
    '--timeline-width': `${scale.timelineWidth}px`,
    '--column-count': String(scale.columns.length),
    '--cell-width': `${scale.cellWidth}px`,
  } as React.CSSProperties

  return (
    <div className={styles.page}>
      <PageHead
        icon="ti-timeline-event"
        title={initialData.projectName}
        desc="Gán ngày và theo dõi tiến độ các đầu việc chuyển đổi số theo người phụ trách."
        actions={(
          <Link
            className={styles.headerLink}
            href={`/projects?projectId=${encodeURIComponent(initialData.projectId)}`}
          >
            <i className="ti ti-folders" aria-hidden="true" />
            Mở dự án
          </Link>
        )}
      />

      <div className={styles.summaryGrid}>
        <SummaryCard icon="ti-list-check" label="Tổng đầu việc" value={tasks.length} color="#64748B" />
        <SummaryCard icon="ti-calendar-off" label="Chưa lên lịch" value={unscheduledCount} color="#D97706" />
        <SummaryCard icon="ti-progress" label="Đang thực hiện" value={inProgressCount} color="#2563EB" />
        <SummaryCard icon="ti-circle-check" label="Hoàn thành" value={completedCount} color="#059669" />
      </div>

      <FilterBar
        filters={filters}
        owners={initialData.owners}
        workstreams={initialData.workstreams}
        zoom={zoom}
        onFiltersChange={setFilters}
        onZoomChange={setZoom}
      />

      <section className={styles.timelineCard} aria-label="Timeline chuyển đổi số">
        <div className={styles.timelineIntro}>
          <div>
            <div className={styles.timelineTitle}>Lịch thực hiện theo người phụ trách</div>
            <div className={styles.timelineHint}>
              Kéo đầu việc từ “Chưa lên lịch” vào một mốc thời gian, hoặc bấm vào đầu việc để nhập khoảng ngày chính xác.
            </div>
          </div>
          <div className={styles.legend} aria-label="Chú giải màu">
            {initialData.owners.map((owner) => (
              <span key={owner.id} className={styles.legendItem}>
                <span
                  className={styles.legendDot}
                  style={{ '--legend-color': OWNER_COLORS[owner.colorKey] } as React.CSSProperties}
                />
                {shortOwnerName(owner.name)}
              </span>
            ))}
          </div>
        </div>

        {filteredTasks.length === 0 ? (
          <TimelineEmpty filtered={tasks.length > 0} />
        ) : (
          <div className={styles.scroller}>
            <div className={styles.table} style={tableStyle}>
              <div className={styles.headerRow}>
                <div className={styles.headerTask}>Đầu việc</div>
                <div className={styles.headerUnscheduled}>Chưa lên lịch</div>
                <div
                  className={styles.scaleHeader}
                  style={tableStyle}
                >
                  {scale.columns.map((column) => (
                    <div key={column.key} className={styles.scaleCell} title={`${column.startDate} → ${column.endDate}`}>
                      {column.label}
                    </div>
                  ))}
                </div>
              </div>

              {groupedTasks.map((group) => (
                <React.Fragment key={group.owner.id}>
                  <div
                    className={styles.ownerHeader}
                    style={{ '--owner-color': OWNER_COLORS[group.owner.colorKey] } as React.CSSProperties}
                  >
                    <span className={styles.ownerDot} aria-hidden="true" />
                    <span className={styles.ownerName}>{group.owner.name}</span>
                    <span className={styles.ownerCount}>{group.tasks.length} đầu việc</span>
                  </div>
                  {group.tasks.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      scale={scale}
                      ownerColor={OWNER_COLORS[group.owner.colorKey]}
                      saving={savingIds.has(task.id)}
                      onOpenTask={(nextTask) => setSelectedTaskId(nextTask.id)}
                      onDropTask={(taskId, targetDate) => void dropTaskOnDate(taskId, targetDate)}
                      onStatusChange={requestTaskStatus}
                    />
                  ))}
                </React.Fragment>
              ))}
            </div>
          </div>
        )}
      </section>

      <span role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden' }}>
        {savingIds.size > 0 ? `Đang lưu ${savingIds.size} đầu việc.` : ''}
      </span>

      <OverlayPortal isOpen={Boolean(selectedTask)}>
        {selectedTask ? (
          <TaskEditPanel
            key={selectedTask.id}
            task={selectedTask}
            saving={savingIds.has(selectedTask.id)}
            onClose={() => setSelectedTaskId(null)}
            onSave={saveTaskDraft}
          />
        ) : null}
      </OverlayPortal>

      <OverlayPortal isOpen={Boolean(pendingUnassignedCompletion)}>
        <ConfirmDialog
          open={Boolean(pendingUnassignedCompletion)}
          onClose={() => setPendingUnassignedCompletion(null)}
          onConfirm={() => {
            if (pendingUnassignedCompletion) {
              void commitTaskStatus(pendingUnassignedCompletion, 'COMPLETED')
            }
          }}
          title="Đánh dấu hoàn thành (bỏ qua yêu cầu)?"
          message={pendingUnassignedCompletion
            ? buildTimelineUnassignedCompletionMessage(pendingUnassignedCompletion)
            : ''}
          confirmLabel="Đánh dấu hoàn thành"
          cancelLabel="Hủy"
        />
      </OverlayPortal>
    </div>
  )
}

function SummaryCard({
  icon,
  label,
  value,
  color,
}: {
  icon: string
  label: string
  value: number
  color: string
}) {
  return (
    <div className={styles.summaryCard}>
      <span
        className={styles.summaryIcon}
        style={{ '--summary-color': color } as React.CSSProperties}
        aria-hidden="true"
      >
        <i className={`ti ${icon}`} />
      </span>
      <div>
        <div className={styles.summaryValue}>{value}</div>
        <div className={styles.summaryLabel}>{label}</div>
      </div>
    </div>
  )
}

function TimelineEmpty({ filtered }: { filtered: boolean }) {
  return (
    <div className={styles.empty}>
      <div>
        <div className={styles.emptyIcon}><i className="ti ti-calendar-search" /></div>
        <div className={styles.emptyTitle}>
          {filtered ? 'Không có đầu việc phù hợp' : 'Timeline chưa có đầu việc'}
        </div>
        <div className={styles.emptyText}>
          {filtered
            ? 'Hãy đổi người phụ trách, hạng mục hoặc trạng thái trong bộ lọc.'
            : 'Chạy seed Timeline chuyển đổi số để tạo project, hai hạng mục và danh sách đầu việc ban đầu.'}
        </div>
      </div>
    </div>
  )
}

function groupTasksByOwner(tasks: TimelineTask[], data: TimelinePageData) {
  return data.owners
    .map((owner) => ({
      owner,
      tasks: tasks.filter((task) => task.ownerId === owner.id),
    }))
    .filter((group) => group.tasks.length > 0)
}

function shortOwnerName(value: string) {
  if (value.includes('Team')) return 'Team'
  const parts = value.trim().split(/\s+/)
  return parts.at(-1) ?? value
}

function formatCompactDate(dateKey: string) {
  return `${dateKey.slice(8, 10)}/${dateKey.slice(5, 7)}`
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Không thể cập nhật đầu việc. Vui lòng thử lại.'
}

function hasOwn<T extends object>(value: T, key: PropertyKey) {
  return Object.prototype.hasOwnProperty.call(value, key)
}
