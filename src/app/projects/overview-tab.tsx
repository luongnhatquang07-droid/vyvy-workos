'use client'

import React from 'react'
import { PlanDocumentsPanel } from '@/components/documents/PlanDocumentsPanel'
import type { CommandCenterPersonRow } from '@/lib/database.types'
import {
  STATUS_META,
  formatDeadlineLabel,
  getDeadlineSignal,
  getSubtaskProgress,
  getWorkstreamProgress,
  isUnassignedSubtask,
  matchesProjectWorkFilter,
  sortSubtasksForOperations,
  toFullDate,
} from './helpers'
import {
  detailMeta,
  emptyInline,
  mutedMetaStyle,
  progressFill,
  progressTrack,
  sectionTitle,
  statusChipStyle,
  subtaskInlineItem,
  subtaskTitleStyle,
  workstreamCard,
  workstreamHead,
} from './styles'
import { DangerButton, GhostButton, ProgressBadge, SubtaskSignalBadges } from './ui-primitives'
import type { ProjectFilters, ProjectWorkspace, SubtaskItem } from './types'

export function OverviewTab({
  project,
  people,
  filters,
  selectedSubtaskId,
  onSelectSubtask,
  renderSubtaskDetail,
  onOpenSubtaskComposer,
  onDeleteWorkstream,
  onEditWorkstream,
}: {
  project: ProjectWorkspace
  people: Record<string, CommandCenterPersonRow>
  filters: ProjectFilters
  selectedSubtaskId: string | null
  onSelectSubtask: (id: string) => void
  renderSubtaskDetail: (subtask: SubtaskItem) => React.ReactNode
  onOpenSubtaskComposer: (workstreamId: string) => void
  onDeleteWorkstream: (workstreamId: string) => void
  onEditWorkstream: (workstreamId: string) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {project.workstreams.map((workstream) => {
        const visibleSubtasks = sortSubtasksForOperations(workstream.subtasks).filter((subtask) => matchesProjectWorkFilter(subtask, filters, { project, workstream }))
        return (
        <section key={workstream.id} style={workstreamCard}>
          <div style={workstreamHead}>
            <div>
              <div style={sectionTitle}>{workstream.title}</div>
              <div style={detailMeta}>
                <span>{people[workstream.ownerId ?? '']?.full_name ?? 'Chưa gắn người'}</span>
                <span>{workstream.subtasks.length} đầu việc con</span>
                <span>{getWorkstreamProgress(workstream)}%</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={miniProgressWrap}>
                <div style={progressTrack}><span data-vyvy-bar="true" style={{ ...progressFill, width: `${getWorkstreamProgress(workstream)}%` }} /></div>
                <span style={mutedMetaStyle}>{getWorkstreamProgress(workstream)}%</span>
              </div>
              <GhostButton icon="ti-pencil" onClick={() => onEditWorkstream(workstream.id)}>Sửa</GhostButton>
              <DangerButton icon="ti-trash" onClick={() => onDeleteWorkstream(workstream.id)}>Xóa đầu việc lớn</DangerButton>
              <GhostButton icon="ti-plus" onClick={() => onOpenSubtaskComposer(workstream.id)}>Thêm đầu việc con</GhostButton>
            </div>
          </div>

          <PlanDocumentsPanel
            key={`workstream-plan-${workstream.id}`}
            targetType="WORKSTREAM"
            targetId={workstream.id}
            title="Plan đầu việc lớn"
          />

          {visibleSubtasks.length === 0 ? (
            <div style={emptyInline}>{workstream.subtasks.length ? 'Không có việc phù hợp với bộ lọc.' : 'Đầu việc lớn này chưa có đầu việc con.'}</div>
          ) : (
            <div style={subtaskTable}>
              {visibleSubtasks.map((subtask) => (
                <div key={subtask.id} style={subtaskInlineItem}>
                <button
                  key={subtask.id}
                  id={`project-subtask-${subtask.id}`}
                  data-vyvy-row="true"
                  onClick={() => onSelectSubtask(subtask.id)}
                  style={subtaskRowStyle(selectedSubtaskId === subtask.id, subtask)}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={subtaskTitleStyle}>{subtask.title}</div>
                    <div style={mutedMetaStyle} title={subtask.dueDate ? toFullDate(subtask.dueDate) : undefined}>
                      {people[subtask.ownerId ?? '']?.full_name ?? 'Chưa gắn người'} · deadline {formatDeadlineLabel(subtask.dueDate, subtask.status)}
                    </div>
                    <SubtaskSignalBadges subtask={subtask} />
                  </div>
                  <div style={rowRightMeta}>
                    <span style={statusChipStyle(STATUS_META[subtask.status].bg, STATUS_META[subtask.status].color)}>
                      {STATUS_META[subtask.status].label}
                    </span>
                    <ProgressBadge value={getSubtaskProgress(subtask)} label={STATUS_META[subtask.status].label} />
                  </div>
                </button>
                  {renderSubtaskDetail(subtask)}
                </div>
              ))}
            </div>
          )}
        </section>
        )
      })}
    </div>
  )
}

function subtaskRowStyle(active: boolean, subtask?: SubtaskItem): React.CSSProperties {
  const deadline = subtask ? getDeadlineSignal(subtask).kind : 'normal'
  const urgent = deadline === 'overdue' || deadline === 'today'
  const unassigned = subtask ? isUnassignedSubtask(subtask) : false
  const alert = urgent && unassigned
  return {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: '12px 14px',
    borderRadius: 12,
    border: `1px solid ${active ? 'rgba(218,223,33,.45)' : alert ? 'rgba(184,64,64,.42)' : urgent ? 'rgba(184,139,62,.42)' : 'var(--line)'}`,
    background: active ? 'rgba(218,223,33,.06)' : alert ? 'rgba(184,64,64,.12)' : urgent ? 'rgba(184,139,62,.10)' : 'var(--surface-2)',
    textAlign: 'left',
  }
}

const miniProgressWrap: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  minWidth: 180,
}

const subtaskTable: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
}

const rowRightMeta: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flexWrap: 'wrap',
  justifyContent: 'flex-end',
}
