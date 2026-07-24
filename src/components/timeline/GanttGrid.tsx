'use client'

import React from 'react'
import type { TimelineScale, TimelineTask } from '@/features/timeline/types'
import { formatDisplayDate } from './timelinePresentation'
import styles from './timeline.module.css'

const TIMELINE_DRAG_TYPE = 'application/x-vyvy-timeline-task'

interface GanttGridProps {
  task: TimelineTask
  scale: TimelineScale
  ownerColor: string
  disabled: boolean
  onDropTask: (taskId: string, targetDate: string) => void
  onOpenTask: (task: TimelineTask) => void
}

export function GanttGrid({
  task,
  scale,
  ownerColor,
  disabled,
  onDropTask,
  onOpenTask,
}: GanttGridProps) {
  const [dropActive, setDropActive] = React.useState(false)
  const startIndex = task.startDate
    ? scale.columns.findIndex((column) => task.startDate! >= column.startDate && task.startDate! <= column.endDate)
    : -1
  const endIndex = task.dueDate
    ? scale.columns.findIndex((column) => task.dueDate! >= column.startDate && task.dueDate! <= column.endDate)
    : -1
  const span = startIndex >= 0 && endIndex >= startIndex ? endIndex - startIndex + 1 : 0

  function handleDragOver(event: React.DragEvent<HTMLDivElement>) {
    if (disabled || !hasTimelineTask(event.dataTransfer)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setDropActive(true)
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    setDropActive(false)
    if (disabled) return
    const taskId = readDraggedTaskId(event.dataTransfer)
    if (!taskId) return
    event.preventDefault()

    const bounds = event.currentTarget.getBoundingClientRect()
    const relativeX = Math.max(0, Math.min(bounds.width - 1, event.clientX - bounds.left))
    const columnIndex = Math.min(
      scale.columns.length - 1,
      Math.floor(relativeX / scale.cellWidth),
    )
    const target = scale.columns[columnIndex]
    if (target) onDropTask(taskId, target.startDate)
  }

  const gridStyle = {
    '--column-count': String(scale.columns.length),
    '--cell-width': `${scale.cellWidth}px`,
    '--timeline-width': `${scale.timelineWidth}px`,
    '--today-index': String(scale.todayColumnIndex ?? -1),
    '--owner-color': ownerColor,
  } as React.CSSProperties

  return (
    <div
      className={`${styles.scheduleGrid} ${dropActive ? styles.scheduleGridDropActive : ''}`}
      style={gridStyle}
      aria-label={`Lịch của ${task.title}`}
      onDragEnter={handleDragOver}
      onDragOver={handleDragOver}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropActive(false)
      }}
      onDrop={handleDrop}
    >
      {scale.todayColumnIndex !== null ? <span className={styles.todayColumn} aria-hidden="true" /> : null}
      {span > 0 ? (
        <button
          type="button"
          className={`${styles.taskBar} ${task.status === 'COMPLETED' ? styles.taskBarCompleted : ''}`}
          style={{
            '--bar-start': String(startIndex),
            '--bar-span': String(span),
            '--owner-color': ownerColor,
          } as React.CSSProperties}
          title={`${task.title} · ${formatDisplayDate(task.startDate)} → ${formatDisplayDate(task.dueDate)}`}
          onClick={() => onOpenTask(task)}
        >
          {task.title}
        </button>
      ) : null}
    </div>
  )
}

export function writeDraggedTask(dataTransfer: DataTransfer, taskId: string) {
  dataTransfer.effectAllowed = 'move'
  dataTransfer.setData(TIMELINE_DRAG_TYPE, taskId)
  dataTransfer.setData('text/plain', taskId)
}

function readDraggedTaskId(dataTransfer: DataTransfer) {
  return dataTransfer.getData(TIMELINE_DRAG_TYPE)
}

function hasTimelineTask(dataTransfer: DataTransfer) {
  return dataTransfer.types.includes(TIMELINE_DRAG_TYPE)
}
