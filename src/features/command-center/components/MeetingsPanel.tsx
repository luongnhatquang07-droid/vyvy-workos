'use client'
import React from 'react'
import type { Meeting, Person, DrawerState } from '../types'
import { PanelShell, EmptyRow } from './FollowUpPanel'
import { useToast } from '@/components/feedback/Toast'

const STATUS_META: Record<string, { label: string; color: string; desc: string }> = {
  no_minutes:      { label: 'Chưa có biên bản', color: 'var(--color-danger)',  desc: 'Cần nhập biên bản' },
  draft_pending:   { label: 'Draft chờ nhập',   color: 'var(--color-warning)', desc: 'Có draft chưa import vào task' },
  minutes_no_tasks:{ label: 'Chưa ra đầu việc', color: 'var(--color-warning)', desc: 'Biên bản có nhưng chưa tạo task' },
  follow_up_needed:{ label: 'Cần follow-up',    color: '#6B8A99',              desc: 'Việc theo sau họp còn treo' },
  done:            { label: 'Đã xong',           color: 'var(--color-text-muted)', desc: '' },
}

interface MeetingsPanelProps {
  meetings: Meeting[]
  people: Person[]
  onOpenDrawer: (s: DrawerState) => void
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function MeetingsPanel({ meetings, people, onOpenDrawer }: MeetingsPanelProps) {
  const { toast } = useToast()
  const needsAction = meetings.filter(m => m.status !== 'done')

  return (
    <PanelShell title="Họp cần xử lý" count={needsAction.length} accentColor="var(--color-warning)">
      {needsAction.length === 0 ? (
        <EmptyRow text="Tất cả cuộc họp đã được xử lý." />
      ) : (
        needsAction.map((m, i) => {
          const meta = STATUS_META[m.status] ?? STATUS_META.follow_up_needed
          const isToday = m.date === '2026-06-24'
          return (
            <div
              key={m.id}
              style={{
                padding: 'var(--space-3) var(--space-4)',
                borderBottom: i < needsAction.length - 1 ? '1px solid var(--color-border)' : 'none',
                cursor: 'pointer',
              }}
              onClick={() => onOpenDrawer({ open: true, type: 'meeting', id: m.id })}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)', marginBottom: 4 }}>
                {isToday && (
                  <span style={{
                    fontSize: 10, fontWeight: 700, color: '#fff', background: 'var(--color-charcoal)',
                    borderRadius: 'var(--radius-sm)', padding: '1px 5px', flexShrink: 0, marginTop: 1,
                  }}>HÔM NAY</span>
                )}
                <span style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--color-text)', lineHeight: 1.4 }}>
                  {m.title}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: meta.color }}>{meta.label}</span>
                <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                  {m.date.slice(5).replace('-', '/')} {m.time}
                </span>
                {m.status === 'draft_pending' && (
                  <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                    {m.taskDraftCount} draft
                  </span>
                )}
                <button
                  onClick={e => {
                    e.stopPropagation()
                    toast(m.status === 'draft_pending'
                      ? 'Import đầu việc từ draft sẽ có ở module Task Inbox.'
                      : 'Nhập biên bản sẽ khả dụng ở module Meetings.', 'info')
                  }}
                  style={{
                    marginLeft: 'auto', fontSize: 11, padding: '3px 8px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-surface-2)', color: 'var(--color-text)',
                    cursor: 'pointer',
                  }}
                >
                  {m.status === 'draft_pending' ? 'Nhập draft' : 'Xem chi tiết'}
                </button>
              </div>
            </div>
          )
        })
      )}
    </PanelShell>
  )
}
