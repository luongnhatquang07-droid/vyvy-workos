'use client'
import React from 'react'
import type { CEODecisionRequest, Project, DrawerState } from '../types'
import { PanelShell, EmptyRow } from './FollowUpPanel'
import { useToast } from '@/components/feedback/Toast'

interface CEOPanelProps {
  requests: CEODecisionRequest[]
  projects: Project[]
  onOpenDrawer: (s: DrawerState) => void
}

const SEVERITY_META: Record<string, { label: string; color: string; bg: string }> = {
  critical: { label: 'Khẩn cấp', color: '#A03030', bg: 'rgba(184,64,64,0.08)' },
  warning:  { label: 'Cần chú ý', color: '#A8621A', bg: 'rgba(196,123,43,0.08)' },
  info:     { label: 'Thông tin', color: 'var(--color-text-muted)', bg: 'var(--color-surface-2)' },
}

export function CEOPanel({ requests, projects, onOpenDrawer }: CEOPanelProps) {
  const { toast } = useToast()
  const byProject = Object.fromEntries(projects.map(p => [p.id, p]))
  const active = requests.filter(() => true) // show all

  return (
    <PanelShell title="Cần báo CEO" count={active.length} accentColor="var(--color-danger)">
      {active.length === 0 ? (
        <EmptyRow text="Không có mục nào cần escalate lên CEO." />
      ) : (
        active.map((c, i) => {
          const meta = SEVERITY_META[c.severity] ?? SEVERITY_META.info
          const project = c.projectId ? byProject[c.projectId] : undefined

          return (
            <div
              key={c.id}
              style={{
                padding: 'var(--space-3) var(--space-4)',
                borderBottom: i < active.length - 1 ? '1px solid var(--color-border)' : 'none',
                cursor: 'pointer',
              }}
              onClick={() => onOpenDrawer({ open: true, type: 'ceo', id: c.id })}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)', marginBottom: 4 }}>
                <span style={{
                  fontSize: 10, fontWeight: 700,
                  background: meta.bg, color: meta.color,
                  borderRadius: 'var(--radius-sm)', padding: '1px 6px', flexShrink: 0, marginTop: 1,
                }}>{meta.label}</span>
                <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text)', lineHeight: 1.4 }}>
                  {c.title}
                </span>
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginBottom: 6, lineHeight: 1.4 }}>
                {c.issue}
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
                {project && (
                  <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{project.name}</span>
                )}
                <button
                  onClick={e => {
                    e.stopPropagation()
                    toast('Tạo báo cáo CEO sẽ khả dụng ở module CEO Reports.', 'info')
                  }}
                  style={{
                    marginLeft: 'auto', fontSize: 11, padding: '3px 8px',
                    borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                    border: '1px solid var(--color-danger)',
                    background: 'rgba(184,64,64,0.07)', color: 'var(--color-danger)',
                    fontWeight: 600,
                  }}
                >Báo CEO</button>
              </div>
            </div>
          )
        })
      )}
    </PanelShell>
  )
}
