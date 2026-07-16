'use client'

import React from 'react'
import { createPortal } from 'react-dom'
import { getVietnamDateKey } from '@/features/command-center/utils'
import {
  STATUS_META,
  dayDiff,
  getSubtaskProgress,
  getSubtaskProgressText,
  getWorkstreamProgress,
  hasActiveProjectFilters,
  isOverdue,
  matchesProjectWorkFilter,
  progressStatus,
  shiftDate,
  sortSubtasksForOperations,
  toFullDate,
  toShortDate,
} from './helpers'
import { emptyInline, ghostBtnStyle, mutedMetaStyle, sectionTitle } from './styles'
import type {
  DragDraft,
  ProjectFilters,
  ProjectWorkspace,
  SubtaskItem,
  TaskStatus,
  WorkstreamItem,
} from './types'
type GanttLevel = 'project' | 'workstream' | 'subtask' | 'step'

interface GanttBarItem {
  id: string
  level: 'workstream' | 'subtask'
  title: string
  subtitle: string
  projectId: string
  workstreamId: string
  subtaskId?: string
  startDate: string
  dueDate: string
  status: TaskStatus
  progress: number
  missingStartDate?: boolean
  missingDueDate?: boolean
  noMilestone?: boolean
}

interface GanttWorkstreamGroup {
  id: string
  workstream: WorkstreamItem
  subtasks: SubtaskItem[]
  item: GanttBarItem
  overdueCount: number
  pendingCount: number
  missingDateCount: number
  isCompleted: boolean
}

interface GanttTooltipState {
  x: number
  y: number
  title: string
  lines: string[]
}

function GanttTimelineTab({
  project,
  filters,
  onOpenSubtask,
  onShift,
}: {
  project: ProjectWorkspace
  filters: ProjectFilters
  onOpenSubtask: (subtaskId: string) => void
  onShift: (
    level: DragDraft['level'],
    projectId: string,
    workstreamId: string | undefined,
    subtaskId: string | undefined,
    stepId: string | undefined,
    oldDate: string,
    delta: number,
  ) => void
}) {
  const today = getVietnamDateKey()
  const groups = React.useMemo(() => buildGanttWorkstreamGroups(project, filters), [project, filters])
  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(() => readGanttExpanded(project.id))
  const [tooltip, setTooltip] = React.useState<GanttTooltipState | null>(null)
  const totalSubtasks = React.useMemo(
    () => project.workstreams.reduce((sum, workstream) => sum + workstream.subtasks.length, 0),
    [project.workstreams],
  )
  const visibleSubtasks = groups.reduce((sum, group) => sum + group.subtasks.length, 0)
  const renderedSubtasks = groups.reduce((sum, group) => sum + (expandedIds.has(group.id) ? group.subtasks.length : 0), 0)
  const collapsedGroups = groups.filter((group) => !expandedIds.has(group.id)).length
  const dateValues = groups.flatMap((group) => [
    group.item.startDate,
    group.item.dueDate,
    ...group.subtasks.flatMap((subtask) => [getGanttSafeStartDate(subtask), getGanttSafeDueDate(subtask)]),
  ])
  const minStart = minDate([today, ...dateValues])
  const maxEnd = maxDate([today, ...dateValues])
  const timelineStart = shiftDate(minStart, -2)
  const timelineEnd = shiftDate(maxEnd, 3)
  const totalDays = Math.max(dayDiff(timelineStart, timelineEnd) + 1, 1)
  const dayWidth = totalDays > 90 ? 26 : totalDays > 45 ? 34 : 44
  const timelineWidth = totalDays * dayWidth
  const tickStep = totalDays > 70 ? 7 : 1
  const ticks = Array.from({ length: Math.ceil(totalDays / tickStep) }, (_, index) => shiftDate(timelineStart, index * tickStep))
  const todayLeft = dayDiff(timelineStart, today) * dayWidth

  const persistExpanded = React.useCallback((next: Set<string>) => {
    setExpandedIds(next)
    writeGanttExpanded(project.id, next)
  }, [project.id])

  const toggleGroup = React.useCallback((groupId: string) => {
    const next = new Set(expandedIds)
    if (next.has(groupId)) next.delete(groupId)
    else next.add(groupId)
    persistExpanded(next)
  }, [expandedIds, persistExpanded])

  const expandAll = React.useCallback(() => {
    persistExpanded(new Set(groups.map((group) => group.id)))
  }, [groups, persistExpanded])

  const collapseAll = React.useCallback(() => {
    persistExpanded(new Set())
  }, [persistExpanded])

  return (
    <section style={ganttShell}>
      <div style={ganttToolbar}>
        <div>
          <div style={sectionTitle}>Timeline / Gantt</div>
          <div style={mutedMetaStyle}>Mặc định gộp theo đầu việc lớn. Mở từng nhóm để xem đầu việc con; chỉ đầu việc con mới kéo deadline và nhập lý do.</div>
          <div style={ganttCountLine}>
            Hiển thị {visibleSubtasks}/{totalSubtasks} đầu việc con trong phạm vi hiện tại · đang render {renderedSubtasks} đầu việc con · {collapsedGroups} nhóm đang thu gọn.
            {hasActiveProjectFilters(filters) ? ` Bộ lọc đang bật: ${getGanttFilterSummary(filters)}.` : ' Không có bộ lọc bổ sung.'}
          </div>
        </div>
        <div style={ganttActionGroup}>
          <button type="button" onClick={expandAll} style={ghostBtnStyle}>Mở rộng tất cả</button>
          <button type="button" onClick={collapseAll} style={ghostBtnStyle}>Thu gọn tất cả</button>
        </div>
      </div>

      <div style={ganttLegend}>
        <span><span style={legendDot('#E24B4A')} /> Hôm nay</span>
        <span><span style={legendDot('#6B7280')} /> Rollup đầu việc lớn</span>
        <span><span style={legendDot('#378ADD')} /> Đang làm</span>
        <span><span style={legendDot('#EF9F27')} /> Chờ duyệt / cần sửa</span>
        <span><span style={legendDot('#1D9E75')} /> Hoàn thành</span>
        <span><span style={legendDot('#E24B4A')} /> Quá hạn / bị chặn</span>
      </div>

      <div style={ganttScroll}>
        <div style={{ ...ganttGrid, gridTemplateColumns: `340px ${timelineWidth}px` }}>
          <div style={ganttCornerCell}>Hạng mục</div>
          <div style={{ ...ganttHeaderCell, width: timelineWidth }}>
            {ticks.map((tick) => (
              <span key={tick} style={{ ...ganttTick, left: dayDiff(timelineStart, tick) * dayWidth, width: tickStep * dayWidth }}>
                {formatGanttTick(tick, tickStep)}
              </span>
            ))}
            {todayLeft >= 0 && todayLeft <= timelineWidth ? <span style={{ ...ganttTodayLine, left: todayLeft }} /> : null}
            {todayLeft >= 0 && todayLeft <= timelineWidth ? <span style={{ ...ganttTodayLabel, left: todayLeft }}>Hôm nay</span> : null}
          </div>

          {groups.length === 0 ? (
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={emptyInline}>Không có đầu việc con phù hợp với bộ lọc hiện tại.</div>
            </div>
          ) : groups.map((group) => {
            const isExpanded = expandedIds.has(group.id)
            const workstreamLeft = Math.max(0, dayDiff(timelineStart, group.item.startDate) * dayWidth)
            const workstreamWidth = Math.max(dayWidth, (dayDiff(group.item.startDate, group.item.dueDate) + 1) * dayWidth)
            return (
              <React.Fragment key={group.id}>
                <button
                  type="button"
                  aria-expanded={isExpanded}
                  onClick={() => toggleGroup(group.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      toggleGroup(group.id)
                    }
                  }}
                  style={ganttLabelCell(0, group.isCompleted)}
                >
                  <span style={ganttChevron(isExpanded)}>›</span>
                  <span style={ganttLevelBadge('workstream')}>{ganttLevelLabel('workstream')}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={ganttItemTitle}>{group.item.title}</span>
                    <span style={mutedMetaStyle}>{group.item.subtitle}</span>
                    <span style={ganttBadgeRow}>
                      {group.overdueCount ? <span style={ganttOverdueBadge}>{group.overdueCount} quá hạn</span> : null}
                      {group.pendingCount ? <span style={ganttPendingBadge}>{group.pendingCount} chờ duyệt</span> : null}
                      {group.missingDateCount ? <span style={ganttMissingBadge}>{group.missingDateCount} thiếu ngày</span> : null}
                      {group.item.noMilestone ? <span style={ganttMissingBadge}>chưa có mốc</span> : null}
                    </span>
                  </span>
                </button>
                <div style={{ ...ganttTrack, width: timelineWidth }}>
                  {todayLeft >= 0 && todayLeft <= timelineWidth ? <span style={{ ...ganttTodayLine, left: todayLeft }} /> : null}
                  <TimelineBar
                    item={group.item}
                    left={workstreamLeft}
                    width={workstreamWidth}
                    dayWidth={dayWidth}
                    draggable={false}
                    muted={group.isCompleted}
                    onSelect={() => toggleGroup(group.id)}
                    onTooltipChange={setTooltip}
                  />
                </div>

                {isExpanded ? group.subtasks.map((subtask) => {
                  const item = buildGanttSubtaskItem(project.id, group.workstream.id, subtask)
                  const left = Math.max(0, dayDiff(timelineStart, item.startDate) * dayWidth)
                  const width = Math.max(dayWidth, (dayDiff(item.startDate, item.dueDate) + 1) * dayWidth)
                  return (
                    <React.Fragment key={item.id}>
                      <button type="button" onClick={() => onOpenSubtask(subtask.id)} style={ganttLabelCell(1)}>
                        <span style={ganttLevelBadge('subtask')}>{ganttLevelLabel('subtask')}</span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={ganttItemTitle}>{item.title}</span>
                          <span style={mutedMetaStyle}>{item.subtitle}</span>
                          {isOverdue(item.dueDate, item.status) ? <span style={ganttOverdueBadge}>Quá hạn</span> : null}
                        </span>
                      </button>
                      <div style={{ ...ganttTrack, width: timelineWidth }}>
                        {todayLeft >= 0 && todayLeft <= timelineWidth ? <span style={{ ...ganttTodayLine, left: todayLeft }} /> : null}
                        <TimelineBar
                          item={item}
                          left={left}
                          width={width}
                          dayWidth={dayWidth}
                          draggable={!item.missingDueDate}
                          onSelect={() => onOpenSubtask(subtask.id)}
                          onShift={(delta) => onShift('subtask', project.id, group.workstream.id, subtask.id, undefined, item.dueDate, delta)}
                          onTooltipChange={setTooltip}
                        />
                      </div>
                    </React.Fragment>
                  )
                }) : null}
              </React.Fragment>
            )
          })}
        </div>
      </div>

      {tooltip && typeof document !== 'undefined'
        ? createPortal(
          <div style={{ ...ganttTooltip, left: tooltip.x, top: tooltip.y }}>
            <strong>{tooltip.title}</strong>
            {tooltip.lines.map((line) => <span key={line}>{line}</span>)}
          </div>,
          document.body,
        )
        : null}
    </section>
  )
}

export function GanttTab({
  project,
  filters,
  onOpenSubtask,
  onShift,
}: {
  project: ProjectWorkspace
  filters: ProjectFilters
  onOpenSubtask: (subtaskId: string) => void
  onShift: (
    level: DragDraft['level'],
    projectId: string,
    workstreamId: string | undefined,
    subtaskId: string | undefined,
    stepId: string | undefined,
    oldDate: string,
    delta: number,
  ) => void
}) {
  return <GanttTimelineTab project={project} filters={filters} onOpenSubtask={onOpenSubtask} onShift={onShift} />
}

function TimelineBar({
  item,
  left,
  width,
  dayWidth,
  draggable,
  muted = false,
  onSelect,
  onShift,
  onTooltipChange,
}: {
  item: GanttBarItem
  left: number
  width: number
  dayWidth: number
  draggable: boolean
  muted?: boolean
  onSelect: () => void
  onShift?: (delta: number) => void
  onTooltipChange: (tooltip: GanttTooltipState | null) => void
}) {
  const dragStart = React.useRef<number | null>(null)
  const deltaRef = React.useRef(0)
  const tone = ganttBarTone(item)
  const tooltip = React.useMemo(() => ({
    title: item.title,
    lines: [
      STATUS_META[item.status].label,
      item.missingStartDate ? 'Chưa nhập ngày bắt đầu' : `Bắt đầu: ${toFullDate(item.startDate)}`,
      item.missingDueDate ? 'Chưa nhập deadline' : `Deadline: ${toFullDate(item.dueDate)}`,
      `Tiến độ: ${item.progress}%`,
      getGanttUrgencyLabel(item),
    ],
  }), [item])

  return (
    <button
      type="button"
      title={`${item.title} · ${STATUS_META[item.status].label}`}
      onPointerDown={(event) => {
        if (!draggable) return
        dragStart.current = event.clientX
        deltaRef.current = 0
        ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
      }}
      onPointerMove={(event) => {
        onTooltipChange({ x: event.clientX + 14, y: event.clientY + 14, ...tooltip })
        if (dragStart.current === null) return
        deltaRef.current = Math.round((event.clientX - dragStart.current) / dayWidth)
        ;(event.currentTarget as HTMLElement).style.transform = `translateX(${deltaRef.current * dayWidth}px)`
      }}
      onPointerEnter={(event) => onTooltipChange({ x: event.clientX + 14, y: event.clientY + 14, ...tooltip })}
      onPointerLeave={() => onTooltipChange(null)}
      onPointerUp={(event) => {
        ;(event.currentTarget as HTMLElement).style.transform = 'translateX(0)'
        if (dragStart.current !== null && deltaRef.current !== 0 && onShift) onShift(deltaRef.current)
        else onSelect()
        dragStart.current = null
        deltaRef.current = 0
        if ((event.currentTarget as HTMLElement).hasPointerCapture(event.pointerId)) {
          ;(event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId)
        }
      }}
      style={{
        ...ganttBarButton,
        left,
        width,
        background: tone.bg,
        borderColor: tone.border,
        color: tone.color,
        cursor: draggable ? 'grab' : 'pointer',
        opacity: muted ? 0.72 : 1,
      }}
    >
      <span style={{ ...ganttBarFill, width: `${Math.min(item.progress, 100)}%`, background: tone.fill }} />
      <span style={ganttBarText}>{item.level === 'workstream' ? `${item.progress}%` : item.title}</span>
    </button>
  )
}

function buildGanttWorkstreamGroups(project: ProjectWorkspace, filters: ProjectFilters): GanttWorkstreamGroup[] {
  return project.workstreams.flatMap((workstream) => {
    const subtasks = sortSubtasksForOperations(workstream.subtasks)
      .filter((subtask) => matchesProjectWorkFilter(subtask, filters, { project, workstream }))
    if (!subtasks.length) return []

    const progress = getWorkstreamProgress({ ...workstream, subtasks })
    const childDates = subtasks.flatMap((subtask) => [
      subtask.missingStartDate ? '' : subtask.startDate,
      subtask.missingDueDate ? '' : subtask.dueDate,
    ]).filter(Boolean)
    const hasChildDates = childDates.length > 0
    const startDate = hasChildDates ? minDate(childDates) : getGanttSafeStartDate(workstream)
    const dueDate = hasChildDates ? maxDate(childDates) : getGanttSafeDueDate(workstream)
    const status = progressStatus(progress, dueDate, workstream.status)
    const item: GanttBarItem = {
      id: `workstream-${workstream.id}`,
      level: 'workstream',
      title: workstream.title,
      subtitle: `${subtasks.length} đầu việc con · ${progress}%`,
      projectId: project.id,
      workstreamId: workstream.id,
      startDate,
      dueDate,
      status,
      progress,
      noMilestone: !hasChildDates && (!workstream.dueDate || workstream.dueDate === getVietnamDateKey()),
    }

    return [{
      id: workstream.id,
      workstream,
      subtasks,
      item,
      overdueCount: subtasks.filter((subtask) => isOverdue(subtask.dueDate, subtask.status)).length,
      pendingCount: subtasks.filter((subtask) => subtask.status === 'PENDING_APPROVAL' || subtask.status === 'REVISION_REQUIRED').length,
      missingDateCount: subtasks.filter((subtask) => subtask.missingStartDate || subtask.missingDueDate).length,
      isCompleted: progress >= 100,
    }]
  })
}

function buildGanttSubtaskItem(projectId: string, workstreamId: string, subtask: SubtaskItem): GanttBarItem {
  const progress = getSubtaskProgress(subtask)
  return {
    id: `subtask-${subtask.id}`,
    level: 'subtask',
    title: subtask.title,
    subtitle: `${STATUS_META[subtask.status].label} · ${getSubtaskProgressText(subtask)}`,
    projectId,
    workstreamId,
    subtaskId: subtask.id,
    startDate: getGanttSafeStartDate(subtask),
    dueDate: getGanttSafeDueDate(subtask),
    status: subtask.status,
    progress,
    missingStartDate: subtask.missingStartDate,
    missingDueDate: subtask.missingDueDate,
  }
}

function getGanttSafeStartDate(item: Pick<WorkstreamItem | SubtaskItem, 'startDate' | 'dueDate'>) {
  return item.startDate || item.dueDate || getVietnamDateKey()
}

function getGanttSafeDueDate(item: Pick<WorkstreamItem | SubtaskItem, 'startDate' | 'dueDate'>) {
  return item.dueDate || item.startDate || getVietnamDateKey()
}

function readGanttExpanded(projectId: string) {
  if (typeof window === 'undefined') return new Set<string>()
  try {
    const raw = window.localStorage.getItem(`gantt.expanded.${projectId}`)
    if (!raw) return new Set<string>()
    const value = JSON.parse(raw)
    return new Set(Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [])
  } catch {
    return new Set<string>()
  }
}

function writeGanttExpanded(projectId: string, expandedIds: Set<string>) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(`gantt.expanded.${projectId}`, JSON.stringify(Array.from(expandedIds)))
}

function getGanttFilterSummary(filters: ProjectFilters) {
  const parts: string[] = []
  if (filters.quick !== 'all') parts.push('chưa gắn người')
  if (filters.status !== 'all') parts.push(filters.status === 'overdue' ? 'quá hạn' : STATUS_META[filters.status].label)
  if (filters.deadline !== 'all') parts.push(`deadline ${filters.deadline}`)
  if (filters.assigneeId !== 'all') parts.push('người thực hiện')
  if (filters.search.trim()) parts.push(`từ khóa "${filters.search.trim()}"`)
  return parts.join(', ') || 'không'
}

function minDate(values: string[]) {
  return values.reduce((min, value) => (value < min ? value : min), values[0] ?? getVietnamDateKey())
}

function maxDate(values: string[]) {
  return values.reduce((max, value) => (value > max ? value : max), values[0] ?? getVietnamDateKey())
}

function formatGanttTick(value: string, tickStep: number) {
  if (tickStep === 1) return toShortDate(value)
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return `${date.getUTCDate()}/${date.getUTCMonth() + 1}`
}

function ganttLevelLabel(level: GanttLevel) {
  if (level === 'project') return 'Dự án'
  if (level === 'workstream') return 'Đầu việc lớn'
  if (level === 'subtask') return 'Đầu việc con'
  return 'Bước'
}

function ganttBarTone(item: GanttBarItem) {
  if (item.level === 'workstream') {
    return { bg: 'rgba(107,114,128,.18)', fill: 'rgba(107,114,128,.62)', border: 'rgba(107,114,128,.42)', color: 'var(--txt)' }
  }
  if (isOverdue(item.dueDate, item.status) || item.status === 'BLOCKED') {
    return { bg: 'rgba(226,75,74,.18)', fill: 'rgba(226,75,74,.68)', border: 'rgba(226,75,74,.52)', color: 'var(--txt)' }
  }
  if (item.status === 'NOT_STARTED') return { bg: 'rgba(107,114,128,.16)', fill: 'rgba(107,114,128,.58)', border: 'rgba(107,114,128,.42)', color: 'var(--txt)' }
  if (item.status === 'IN_PROGRESS') return { bg: 'rgba(55,138,221,.16)', fill: 'rgba(55,138,221,.68)', border: 'rgba(55,138,221,.46)', color: 'var(--txt)' }
  if (item.status === 'WAITING') return { bg: 'rgba(239,159,39,.16)', fill: 'rgba(239,159,39,.66)', border: 'rgba(239,159,39,.44)', color: 'var(--txt)' }
  if (item.status === 'PENDING_APPROVAL') return { bg: 'rgba(239,159,39,.16)', fill: 'rgba(239,159,39,.66)', border: 'rgba(239,159,39,.44)', color: 'var(--txt)' }
  if (item.status === 'REVISION_REQUIRED') return { bg: 'rgba(239,159,39,.16)', fill: 'rgba(239,159,39,.68)', border: 'rgba(239,159,39,.44)', color: 'var(--txt)' }
  if (item.status === 'COMPLETED') return { bg: 'rgba(29,158,117,.17)', fill: 'rgba(29,158,117,.68)', border: 'rgba(29,158,117,.42)', color: 'var(--txt)' }
  return { bg: 'rgba(47,52,63,.2)', fill: 'rgba(75,85,99,.62)', border: 'rgba(75,85,99,.42)', color: 'var(--txt)' }
}

function getGanttUrgencyLabel(item: GanttBarItem) {
  if (item.missingDueDate) return 'Thiếu deadline'
  if (item.status === 'COMPLETED') return 'Đã hoàn thành'
  if (item.status === 'CANCELLED') return 'Đã hủy'
  const days = dayDiff(getVietnamDateKey(), item.dueDate)
  if (days < 0) return `Trễ ${Math.abs(days)} ngày`
  if (days === 0) return 'Đến hạn hôm nay'
  return `Còn ${days} ngày`
}

function legendDot(color: string): React.CSSProperties {
  return {
    width: 10,
    height: 10,
    display: 'inline-block',
    borderRadius: 999,
    background: color,
    marginRight: 6,
  }
}

const ganttShell: React.CSSProperties = {
  padding: 16,
  borderRadius: 16,
  background: 'var(--surface)',
  border: '1px solid var(--line)',
}

const ganttLegend: React.CSSProperties = {
  display: 'flex',
  gap: 18,
  alignItems: 'center',
  fontSize: 12,
  color: 'var(--txt-3)',
  marginBottom: 16,
}

const ganttTrack: React.CSSProperties = {
  position: 'relative',
  height: 34,
  borderRadius: 999,
  background: 'linear-gradient(90deg, rgba(255,255,255,0.03) 0 1px, transparent 1px 34px)',
  border: '1px solid var(--line)',
  overflow: 'hidden',
}

const ganttToolbar: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 12,
  alignItems: 'flex-start',
  marginBottom: 14,
  flexWrap: 'wrap',
}

const ganttCountLine: React.CSSProperties = {
  marginTop: 6,
  maxWidth: 880,
  color: 'var(--txt-2)',
  fontSize: 12,
  lineHeight: 1.55,
}

const ganttActionGroup: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  flexWrap: 'wrap',
  justifyContent: 'flex-end',
}

const ganttScroll: React.CSSProperties = {
  overflowX: 'auto',
  borderRadius: 14,
  border: '1px solid var(--line)',
  background: 'var(--surface-2)',
}

const ganttGrid: React.CSSProperties = {
  display: 'grid',
  minWidth: '100%',
}

const ganttCornerCell: React.CSSProperties = {
  position: 'sticky',
  left: 0,
  zIndex: 4,
  padding: '12px 14px',
  minHeight: 48,
  background: 'var(--surface)',
  borderRight: '1px solid var(--line)',
  borderBottom: '1px solid var(--line)',
  color: 'var(--txt-3)',
  fontSize: 12,
  fontWeight: 800,
  textTransform: 'uppercase',
}

const ganttHeaderCell: React.CSSProperties = {
  position: 'sticky',
  top: 0,
  zIndex: 3,
  minHeight: 48,
  borderBottom: '1px solid var(--line)',
  background: 'var(--surface)',
}

const ganttTick: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  bottom: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderLeft: '1px solid var(--line)',
  color: 'var(--txt-3)',
  fontSize: 11,
  whiteSpace: 'nowrap',
}

const ganttTodayLine: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  bottom: 0,
  width: 2,
  background: '#E24B4A',
  zIndex: 3,
  boxShadow: '0 0 0 1px rgba(226,75,74,.18)',
}

const ganttTodayLabel: React.CSSProperties = {
  position: 'absolute',
  top: 4,
  transform: 'translateX(-50%)',
  zIndex: 4,
  padding: '2px 7px',
  borderRadius: 999,
  background: 'rgba(218,223,33,.16)',
  border: '1px solid rgba(218,223,33,.45)',
  color: 'var(--txt)',
  fontSize: 10,
  fontWeight: 800,
  whiteSpace: 'nowrap',
}

const ganttLabelCell = (indent: number, muted = false): React.CSSProperties => ({
  position: 'sticky',
  left: 0,
  zIndex: 2,
  display: 'flex',
  gap: 10,
  alignItems: 'center',
  minHeight: 52,
  padding: `9px 12px 9px ${12 + indent * 18}px`,
  border: 'none',
  borderRight: '1px solid var(--line)',
  borderBottom: '1px solid var(--line)',
  background: 'var(--surface)',
  color: 'var(--txt)',
  textAlign: 'left',
  opacity: muted ? 0.7 : 1,
})

const ganttChevron = (expanded: boolean): React.CSSProperties => ({
  flex: '0 0 auto',
  width: 20,
  height: 20,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 999,
  border: '1px solid var(--line)',
  background: 'var(--surface-2)',
  color: 'var(--txt-2)',
  fontSize: 16,
  fontWeight: 900,
  transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
  transition: 'transform 120ms ease',
})

const ganttLevelBadge = (level: GanttLevel): React.CSSProperties => ({
  flex: '0 0 auto',
  padding: '4px 7px',
  borderRadius: 999,
  background: level === 'project' ? 'rgba(218,223,33,.12)' : level === 'workstream' ? 'rgba(157,184,199,.14)' : 'var(--surface-3)',
  color: level === 'project' ? 'var(--color-lime)' : 'var(--txt-3)',
  fontSize: 10,
  fontWeight: 800,
})

const ganttItemTitle: React.CSSProperties = {
  display: 'block',
  color: 'var(--txt)',
  fontSize: 13,
  fontWeight: 800,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const ganttOverdueBadge: React.CSSProperties = {
  display: 'inline-flex',
  width: 'fit-content',
  padding: '2px 7px',
  borderRadius: 999,
  background: 'rgba(184,64,64,.15)',
  border: '1px solid rgba(184,64,64,.38)',
  color: 'var(--color-danger)',
  fontSize: 10,
  fontWeight: 800,
}

const ganttBadgeRow: React.CSSProperties = {
  display: 'flex',
  gap: 6,
  flexWrap: 'wrap',
  marginTop: 5,
}

const ganttPendingBadge: React.CSSProperties = {
  display: 'inline-flex',
  width: 'fit-content',
  padding: '2px 7px',
  borderRadius: 999,
  background: 'rgba(239,159,39,.15)',
  border: '1px solid rgba(239,159,39,.38)',
  color: 'var(--color-warning)',
  fontSize: 10,
  fontWeight: 800,
}

const ganttMissingBadge: React.CSSProperties = {
  display: 'inline-flex',
  width: 'fit-content',
  padding: '2px 7px',
  borderRadius: 999,
  background: 'var(--surface-3)',
  border: '1px solid var(--line)',
  color: 'var(--txt-3)',
  fontSize: 10,
  fontWeight: 800,
}

const ganttBarButton: React.CSSProperties = {
  position: 'absolute',
  top: 11,
  height: 28,
  borderRadius: 999,
  border: '1px solid transparent',
  cursor: 'grab',
  overflow: 'hidden',
  transition: 'transform 120ms ease, filter 120ms ease',
  textAlign: 'left',
}

const ganttBarFill: React.CSSProperties = {
  position: 'absolute',
  inset: '0 auto 0 0',
  borderRadius: 999,
}

const ganttBarText: React.CSSProperties = {
  position: 'relative',
  zIndex: 1,
  display: 'block',
  padding: '6px 10px',
  fontSize: 11.5,
  fontWeight: 800,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const ganttTooltip: React.CSSProperties = {
  position: 'fixed',
  zIndex: 9999,
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  maxWidth: 280,
  padding: '10px 12px',
  borderRadius: 12,
  border: '1px solid var(--line)',
  background: 'var(--surface)',
  color: 'var(--txt)',
  boxShadow: '0 16px 42px rgba(0,0,0,.28)',
  fontSize: 12,
  pointerEvents: 'none',
}
