'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import type { DrawerState, Task, Workstream } from '../types'

interface UnassignedTasksPanelProps {
  tasks: Task[]
  workstreams: Workstream[]
  onOpenDrawer: (state: DrawerState) => void
}

export function UnassignedTasksPanel({
  tasks,
  workstreams,
  onOpenDrawer,
}: UnassignedTasksPanelProps) {
  const router = useRouter()
  const unassignedTasks = tasks.filter((task) => task.status === 'UNASSIGNED')
  const visibleTasks = unassignedTasks.slice(0, 5)
  const workstreamById = new Map(workstreams.map((workstream) => [workstream.id, workstream]))

  if (unassignedTasks.length === 0) return null

  return (
    <section style={panelStyle} aria-labelledby="unassigned-tasks-title" data-vyvy-card="true">
      <div style={headerStyle}>
        <div>
          <div style={eyebrowStyle}>Cần phân công</div>
          <h2 id="unassigned-tasks-title" style={titleStyle}>Việc chưa giao</h2>
        </div>
        <span style={countStyle}>{unassignedTasks.length} việc</span>
      </div>

      <div style={listStyle}>
        {visibleTasks.map((task) => {
          const workstreamName = task.workstreamId
            ? workstreamById.get(task.workstreamId)?.name
            : undefined

          return (
            <button
              type="button"
              key={task.id}
              style={rowStyle}
              onClick={() => onOpenDrawer({ open: true, type: 'task', id: task.id })}
              aria-label={`Mở chi tiết ${task.title}`}
              data-vyvy-radar="true"
            >
              <span style={taskIconStyle} aria-hidden="true">
                <i className="ti ti-user-question" />
              </span>
              <span style={taskInfoStyle}>
                <span style={taskTitleStyle}>{task.title}</span>
                <span style={workstreamStyle}>{workstreamName ?? 'Chưa thuộc đầu việc lớn'}</span>
              </span>
              <span style={missingBadgeStyle}>{getMissingAssignmentLabel(task)}</span>
              <i className="ti ti-chevron-right" style={chevronStyle} aria-hidden="true" />
            </button>
          )
        })}
      </div>

      {unassignedTasks.length > 5 ? (
        <button
          type="button"
          style={viewAllStyle}
          onClick={() => router.push('/projects?filter=unassigned')}
        >
          Xem tất cả {unassignedTasks.length} việc chưa giao
          <i className="ti ti-arrow-right" aria-hidden="true" />
        </button>
      ) : null}
    </section>
  )
}

function getMissingAssignmentLabel(task: Task) {
  const missingOwner = !task.ownerId
  const missingDeadline = !task.dueDate
  if (missingOwner && missingDeadline) return 'Thiếu owner + deadline'
  if (missingOwner) return 'Thiếu owner'
  if (missingDeadline) return 'Thiếu deadline'
  return 'Cần kiểm tra'
}

const panelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-3)',
  padding: 'var(--space-4)',
  border: '1px solid rgba(196,123,43,0.34)',
  borderRadius: 'var(--radius-lg)',
  background: 'linear-gradient(180deg, rgba(196,123,43,0.055), rgba(255,255,255,0) 45%), var(--color-surface)',
  boxShadow: 'var(--shadow-sm)',
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 'var(--space-3)',
}

const eyebrowStyle: React.CSSProperties = {
  color: 'var(--color-warning)',
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
}

const titleStyle: React.CSSProperties = {
  margin: '3px 0 0',
  color: 'var(--color-text)',
  fontFamily: 'var(--font-serif)',
  fontSize: 20,
  fontWeight: 600,
}

const countStyle: React.CSSProperties = {
  padding: '4px 9px',
  border: '1px solid rgba(196,123,43,0.35)',
  borderRadius: 'var(--radius-full)',
  color: 'var(--color-warning)',
  background: 'var(--color-warning-bg)',
  fontSize: 11,
  fontWeight: 800,
}

const listStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-3)',
  width: '100%',
  minWidth: 0,
  padding: '10px 11px',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-md)',
  color: 'var(--color-text)',
  background: 'var(--color-surface-2)',
  textAlign: 'left',
  cursor: 'pointer',
}

const taskIconStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 30,
  height: 30,
  flexShrink: 0,
  borderRadius: 8,
  color: 'var(--color-warning)',
  background: 'var(--color-warning-bg)',
}

const taskInfoStyle: React.CSSProperties = {
  display: 'flex',
  flex: 1,
  minWidth: 0,
  flexDirection: 'column',
  gap: 3,
}

const taskTitleStyle: React.CSSProperties = {
  overflow: 'hidden',
  color: 'var(--color-text)',
  fontSize: 'var(--text-sm)',
  fontWeight: 700,
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const workstreamStyle: React.CSSProperties = {
  overflow: 'hidden',
  color: 'var(--color-text-muted)',
  fontSize: 11,
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const missingBadgeStyle: React.CSSProperties = {
  flexShrink: 0,
  padding: '3px 7px',
  border: '1px solid rgba(196,123,43,0.28)',
  borderRadius: 'var(--radius-full)',
  color: 'var(--color-warning)',
  background: 'var(--color-warning-bg)',
  fontSize: 10,
  fontWeight: 700,
}

const chevronStyle: React.CSSProperties = {
  flexShrink: 0,
  color: 'var(--color-text-muted)',
  fontSize: 15,
}

const viewAllStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  alignSelf: 'flex-start',
  gap: 6,
  padding: 0,
  border: 0,
  color: 'var(--color-warning)',
  background: 'transparent',
  fontSize: 'var(--text-xs)',
  fontWeight: 800,
  cursor: 'pointer',
}
