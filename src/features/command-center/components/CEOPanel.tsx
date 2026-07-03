'use client'

import React from 'react'
import type { CEODecisionRequest, DrawerState, Project } from '../types'
import { EmptyRow, PanelShell } from './FollowUpPanel'

interface CEOPanelProps {
  requests: CEODecisionRequest[]
  projects: Project[]
  onOpenDrawer: (state: DrawerState) => void
}

const SEVERITY_META: Record<string, { label: string; color: string; bg: string }> = {
  critical: { label: 'Khẩn cấp', color: '#A03030', bg: 'rgba(184,64,64,0.08)' },
  warning: { label: 'Cần chú ý', color: '#A8621A', bg: 'rgba(196,123,43,0.08)' },
  info: { label: 'Thông tin', color: 'var(--color-text-muted)', bg: 'var(--color-surface-2)' },
}

export function CEOPanel({ requests, projects, onOpenDrawer }: CEOPanelProps) {
  const byProject = Object.fromEntries(projects.map((project) => [project.id, project]))
  const active = requests.filter(() => true)

  return (
    <PanelShell title="Cần báo CEO" count={active.length} accentColor="var(--color-danger)">
      {active.length === 0 ? (
        <EmptyRow text="Không có mục nào cần đưa lên CEO." />
      ) : (
        active.map((request, index) => {
          const meta = SEVERITY_META[request.severity] ?? SEVERITY_META.info
          const project = request.projectId ? byProject[request.projectId] : undefined

          return (
            <div
              key={request.id}
              style={{
                padding: 'var(--space-3) var(--space-4)',
                borderBottom: index < active.length - 1 ? '1px solid var(--color-border)' : 'none',
                cursor: 'pointer',
              }}
              data-vyvy-row="true"
              data-vyvy-alert={request.severity === 'critical' ? 'true' : undefined}
              onClick={() => onOpenDrawer({ open: true, type: 'ceo', id: request.id })}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)', marginBottom: 4 }}>
                <span style={{
                  fontSize: 10,
                  fontWeight: 700,
                  background: meta.bg,
                  color: meta.color,
                  borderRadius: 'var(--radius-sm)',
                  padding: '1px 6px',
                  flexShrink: 0,
                  marginTop: 1,
                }}>
                  {meta.label}
                </span>
                <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text)', lineHeight: 1.4 }}>
                  {request.title}
                </span>
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginBottom: 6, lineHeight: 1.4 }}>
                {request.issue}
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
                {project ? (
                  <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{project.name}</span>
                ) : null}
                <button
                  onClick={(event) => {
                    event.stopPropagation()
                    onOpenDrawer({ open: true, type: 'ceo', id: request.id })
                  }}
                  data-vyvy-radar="true"
                  style={reportButtonStyle}
                >
                  Mở
                </button>
              </div>
            </div>
          )
        })
      )}
    </PanelShell>
  )
}

const reportButtonStyle: React.CSSProperties = {
  marginLeft: 'auto',
  fontSize: 11,
  padding: '3px 8px',
  borderRadius: 'var(--radius-sm)',
  cursor: 'pointer',
  border: '1px solid var(--color-danger)',
  background: 'rgba(184,64,64,0.07)',
  color: 'var(--color-danger)',
  fontWeight: 600,
}
