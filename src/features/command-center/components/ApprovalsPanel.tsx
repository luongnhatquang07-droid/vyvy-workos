'use client'
import React from 'react'
import type { Approval, Person, DrawerState } from '../types'
import { PanelShell, EmptyRow } from './FollowUpPanel'
import { formatRelativeDate } from '../utils'

interface ApprovalsPanelProps {
  approvals: Approval[]
  people: Person[]
  onOpenDrawer: (s: DrawerState) => void
}

export function ApprovalsPanel({ approvals, people, onOpenDrawer }: ApprovalsPanelProps) {
  const byPerson = Object.fromEntries(people.map(p => [p.id, p]))
  const pending = approvals.filter(a => a.status !== 'approved' && a.status !== 'rejected')

  return (
    <PanelShell title="Chờ phê duyệt" count={pending.length} accentColor="var(--color-warning)">
      {pending.length === 0 ? (
        <EmptyRow text="Không có yêu cầu nào đang chờ duyệt." />
      ) : (
        pending.map((a, i) => {
          const approver = byPerson[a.approverId]
          const isOverdue = a.status === 'overdue'
          const isUrgent = a.daysWaiting >= 3
          const accentColor = isOverdue ? 'var(--color-danger)' : isUrgent ? 'var(--color-warning)' : 'var(--color-text-muted)'

          return (
            <div
              key={a.id}
              style={{
                padding: 'var(--space-3) var(--space-4)',
                borderBottom: i < pending.length - 1 ? '1px solid var(--color-border)' : 'none',
                cursor: 'pointer',
              }}
              onClick={() => onOpenDrawer({ open: true, type: 'approval', id: a.id })}
            >
              <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--color-text)', marginBottom: 4, lineHeight: 1.4 }}>
                {a.title}
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: accentColor }}>
                  {isOverdue ? 'Trễ hạn duyệt' : `Chờ ${a.daysWaiting} ngày`}
                </span>
                <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                  Người duyệt: {approver?.name}
                </span>
                <span style={{ fontSize: 11, color: accentColor }}>
                  Hạn: {formatRelativeDate(a.deadline)}
                </span>
              </div>
            </div>
          )
        })
      )}
    </PanelShell>
  )
}
