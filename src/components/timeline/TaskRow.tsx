'use client'

import type { TaskStatus } from '@/lib/tasks/taskStatusService'
import type { TimelineScale, TimelineTask } from '@/features/timeline/types'
import { isUnscheduled, toggleTimelineCompletion } from '@/features/timeline/timelineUtils'
import { GanttGrid, writeDraggedTask } from './GanttGrid'
import {
  formatDisplayDate,
  getStatusLabel,
  TIMELINE_STATUS_OPTIONS,
} from './timelinePresentation'
import styles from './timeline.module.css'

interface TaskRowProps {
  task: TimelineTask
  scale: TimelineScale
  ownerColor: string
  saving: boolean
  onOpenTask: (task: TimelineTask) => void
  onDropTask: (taskId: string, targetDate: string) => void
  onStatusChange: (task: TimelineTask, status: TaskStatus) => void
}

export function TaskRow({
  task,
  scale,
  ownerColor,
  saving,
  onOpenTask,
  onDropTask,
  onStatusChange,
}: TaskRowProps) {
  const unscheduled = isUnscheduled(task)
  const disabled = saving || !task.canEdit
  const completed = task.status === 'COMPLETED'

  return (
    <div
      className={styles.taskRow}
      style={{
        '--timeline-width': `${scale.timelineWidth}px`,
        '--owner-color': ownerColor,
      } as React.CSSProperties}
      data-timeline-task-id={task.id}
    >
      <div className={styles.taskInfo}>
        <input
          className={styles.taskCheckbox}
          type="checkbox"
          checked={completed}
          disabled={disabled}
          aria-label={completed ? `Mở lại ${task.title}` : `Đánh dấu hoàn thành ${task.title}`}
          onChange={() => onStatusChange(task, toggleTimelineCompletion(task.status))}
        />
        <div className={styles.taskText}>
          <button
            type="button"
            className={`${styles.taskTitleButton} ${completed ? styles.taskTitleCompleted : ''}`}
            onClick={() => onOpenTask(task)}
          >
            {task.title}
          </button>
          <div className={styles.taskMeta}>
            <span className={styles.phaseBadge}>{task.workstreamName}</span>
            {task.steps.length > 0 ? (
              <span className={styles.stepBadge}>
                <i className="ti ti-list-check" aria-hidden="true" />
                {task.steps.length} bước
              </span>
            ) : null}
            {saving ? <span className={styles.savingBadge}>Đang lưu…</span> : null}
            {!task.canEdit ? (
              <span className={styles.stepBadge} title="Bạn chỉ có quyền xem">
                <i className="ti ti-lock" aria-hidden="true" />
              </span>
            ) : null}
          </div>
        </div>
        <select
          className={styles.rowStatus}
          value={task.status}
          disabled={disabled}
          aria-label={`Trạng thái ${task.title}`}
          title={getStatusLabel(task.status)}
          onChange={(event) => onStatusChange(task, event.target.value as TaskStatus)}
        >
          {TIMELINE_STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>

      <div className={styles.unscheduledCell}>
        {unscheduled ? (
          <button
            type="button"
            draggable={!disabled}
            className={styles.unscheduledPill}
            disabled={disabled}
            onDragStart={(event) => writeDraggedTask(event.dataTransfer, task.id)}
            onClick={() => onOpenTask(task)}
            title={task.canEdit ? 'Kéo vào một mốc thời gian hoặc bấm để chọn ngày' : 'Bạn chỉ có quyền xem'}
          >
            <i className="ti ti-calendar-plus" aria-hidden="true" />
            Chưa lên lịch
          </button>
        ) : (
          <button
            type="button"
            className={styles.taskTitleButton}
            onClick={() => onOpenTask(task)}
            title="Bấm để chỉnh ngày"
          >
            <span className={styles.scheduledDates}>
              {formatDisplayDate(task.startDate)}
              <br />
              → {formatDisplayDate(task.dueDate)}
            </span>
          </button>
        )}
      </div>

      <GanttGrid
        task={task}
        scale={scale}
        ownerColor={ownerColor}
        disabled={disabled}
        onDropTask={onDropTask}
        onOpenTask={onOpenTask}
      />
    </div>
  )
}
