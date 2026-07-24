'use client'

import React from 'react'
import { Button } from '@/components/ui/Button'
import { Drawer } from '@/components/feedback/Drawer'
import { ConfirmDialog } from '@/components/feedback/Modal'
import { OverlayPortal } from '@/components/feedback/OverlayPortal'
import { Input } from '@/components/ui/Input'
import type { TaskStatus } from '@/lib/tasks/taskStatusService'
import type { TimelineTask } from '@/features/timeline/types'
import {
  validateTimelineSchedule,
  willUseUnassignedCompletionBypass,
} from '@/features/timeline/timelineUtils'
import {
  buildTimelineUnassignedCompletionMessage,
  getStatusColor,
  getStatusLabel,
  TIMELINE_STATUS_OPTIONS,
} from './timelinePresentation'
import styles from './timeline.module.css'

export interface TimelineTaskDraft {
  startDate: string | null
  dueDate: string | null
  status: TaskStatus
}

interface TaskEditPanelProps {
  task: TimelineTask
  saving: boolean
  onClose: () => void
  onSave: (task: TimelineTask, draft: TimelineTaskDraft) => Promise<void>
}

export function TaskEditPanel({
  task,
  saving,
  onClose,
  onSave,
}: TaskEditPanelProps) {
  const [startDate, setStartDate] = React.useState(task.startDate ?? '')
  const [dueDate, setDueDate] = React.useState(task.dueDate ?? '')
  const [status, setStatus] = React.useState<TaskStatus>(task.status)
  const [error, setError] = React.useState<string | null>(null)
  const [confirmBypassOpen, setConfirmBypassOpen] = React.useState(false)

  async function handleSave() {
    const normalizedStartDate = startDate || null
    const normalizedDueDate = dueDate || null
    const validation = validateTimelineSchedule(normalizedStartDate, normalizedDueDate)
    if (!validation.valid) {
      setError(scheduleValidationMessage(validation.reason))
      return
    }

    setError(null)
    const draft = {
      startDate: normalizedStartDate,
      dueDate: normalizedDueDate,
      status,
    }
    if (willUseUnassignedCompletionBypass({
      currentStatus: task.status,
      nextStatus: status,
      ownerId: task.ownerId,
      dueDate: draft.dueDate,
    })) {
      setConfirmBypassOpen(true)
      return
    }
    await commitSave(draft)
  }

  async function commitSave(draft: TimelineTaskDraft) {
    try {
      await onSave(task, draft)
      onClose()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Không thể lưu đầu việc. Vui lòng thử lại.')
    }
  }

  const footer = (
    <>
      <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
        Hủy
      </Button>
      <Button type="button" variant="primary" onClick={() => void handleSave()} loading={saving} disabled={!task.canEdit}>
        Lưu thay đổi
      </Button>
    </>
  )

  const completionUsesBypass = willUseUnassignedCompletionBypass({
    currentStatus: task.status,
    nextStatus: status,
    ownerId: task.ownerId,
    dueDate: dueDate || null,
  })

  return (
    <>
      <Drawer
        open
        onClose={onClose}
        title="Lên lịch đầu việc"
        width={500}
        footer={footer}
      >
      <div className={styles.panelFields}>
        <div>
          <div style={{ color: 'var(--txt)', fontSize: 15, fontWeight: 700, lineHeight: 1.45 }}>
            {task.title}
          </div>
          <div style={{ display: 'flex', gap: 7, marginTop: 8, flexWrap: 'wrap' }}>
            <span className={styles.phaseBadge}>{task.ownerName}</span>
            <span className={styles.phaseBadge}>{task.workstreamName}</span>
            <span
              className={styles.phaseBadge}
              style={{ color: getStatusColor(task.status), borderColor: `${getStatusColor(task.status)}55` }}
            >
              {getStatusLabel(task.status)}
            </span>
          </div>
        </div>

        {!task.canEdit ? (
          <div className={styles.panelError}>
            Bạn chỉ có quyền xem đầu việc này. Việc thay đổi ngày và trạng thái đã bị khóa.
          </div>
        ) : null}

        <div className={styles.panelGrid}>
          <Input
            type="date"
            label="Ngày bắt đầu"
            value={startDate}
            disabled={saving || !task.canEdit}
            onChange={(event) => setStartDate(event.target.value)}
          />
          <Input
            type="date"
            label="Hạn hoàn thành"
            value={dueDate}
            disabled={saving || !task.canEdit}
            onChange={(event) => setDueDate(event.target.value)}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-end' }}>
          <label className={styles.filterField}>
            <span className={styles.filterLabel}>Trạng thái</span>
            <select
              className={styles.select}
              value={status}
              disabled={saving || !task.canEdit}
              onChange={(event) => setStatus(event.target.value as TaskStatus)}
            >
              {TIMELINE_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={saving || !task.canEdit || (!startDate && !dueDate)}
            onClick={() => {
              setStartDate('')
              setDueDate('')
              setError(null)
            }}
          >
            <i className="ti ti-calendar-off" aria-hidden="true" />
            Bỏ lịch
          </Button>
        </div>

        {status === 'COMPLETED' && task.status !== 'COMPLETED' ? (
          <div className={styles.panelSection}>
            <div className={styles.panelDescription}>
              {completionUsesBypass
                ? 'Task Chưa giao việc sẽ dùng luồng hoàn thành có xác nhận: bỏ qua yêu cầu file/báo cáo và bước bắt buộc, đồng thời ghi audit trail.'
                : 'Khi hoàn thành, hệ thống vẫn kiểm tra đầy đủ file bàn giao và các bước bắt buộc theo quality gate hiện có.'}
            </div>
          </div>
        ) : null}

        {task.description ? (
          <section className={styles.panelSection}>
            <div className={styles.panelSectionTitle}>Ghi chú</div>
            <div className={styles.panelDescription}>{task.description}</div>
          </section>
        ) : null}

        {task.steps.length > 0 ? (
          <section className={styles.panelSection}>
            <div className={styles.panelSectionTitle}>Các bước thực hiện</div>
            <ul className={styles.stepList}>
              {task.steps.map((step) => (
                <li key={step.id} className={styles.stepItem}>
                  <span
                    className={styles.stepState}
                    style={{ '--step-color': getStatusColor(step.status) } as React.CSSProperties}
                  />
                  <span style={step.status === 'COMPLETED' ? { opacity: 0.55, textDecoration: 'line-through' } : undefined}>
                    {step.title}
                  </span>
                  <span style={{ marginLeft: 'auto', color: 'var(--txt-3)', fontSize: 10 }}>
                    {getStatusLabel(step.status)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {error ? <div className={styles.panelError} role="alert">{error}</div> : null}
        </div>
      </Drawer>

      <OverlayPortal isOpen={confirmBypassOpen}>
        <ConfirmDialog
          open={confirmBypassOpen}
          onClose={() => setConfirmBypassOpen(false)}
          onConfirm={() => {
            void commitSave({
              startDate: startDate || null,
              dueDate: dueDate || null,
              status,
            })
          }}
          title="Đánh dấu hoàn thành (bỏ qua yêu cầu)?"
          message={buildTimelineUnassignedCompletionMessage(task, dueDate || null)}
          confirmLabel="Đánh dấu hoàn thành"
          cancelLabel="Hủy"
        />
      </OverlayPortal>
    </>
  )
}

function scheduleValidationMessage(
  reason: Exclude<ReturnType<typeof validateTimelineSchedule>, { valid: true }>['reason'],
) {
  if (reason === 'PARTIAL_SCHEDULE') return 'Hãy nhập cả ngày bắt đầu và hạn hoàn thành, hoặc để trống cả hai.'
  if (reason === 'INVALID_RANGE') return 'Hạn hoàn thành không được sớm hơn ngày bắt đầu.'
  return 'Ngày đã nhập không hợp lệ.'
}
