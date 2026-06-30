'use client'
import React from 'react'
import { useRouter } from 'next/navigation'
import type { Reminder, Person, DrawerState } from '../types'
import { formatRelativeDate } from '../utils'

const RESPONSE_LABEL: Record<string, { label: string; color: string }> = {
  no_response:  { label: 'Chưa phản hồi', color: 'var(--color-danger)' },
  acknowledged: { label: 'Đã ghi nhận',   color: 'var(--color-warning)' },
  in_progress:  { label: 'Đang làm',       color: '#4A8C5C' },
  done:         { label: 'Đã xong',        color: 'var(--color-text-muted)' },
}

interface FollowUpPanelProps {
  reminders: Reminder[]
  people: Person[]
  onOpenDrawer: (s: DrawerState) => void
}

export function FollowUpPanel({ reminders, people, onOpenDrawer }: FollowUpPanelProps) {
  const router = useRouter()
  const byPerson = Object.fromEntries(people.map(p => [p.id, p]))

  // Show only active reminders
  const active = reminders.filter(r => r.response !== 'CLOSED' && r.response !== 'FILE_SUBMITTED')

  return (
    <PanelShell
      title="Danh sách cần dí"
      count={active.length}
      accentColor="var(--color-danger)"
    >
      {active.length === 0 ? (
        <EmptyRow text="Không có ai đang nợ báo cáo hoặc file." />
      ) : (
        active.map((r, i) => {
          const person = byPerson[r.personId]
          const rs = RESPONSE_LABEL[r.response] ?? RESPONSE_LABEL.no_response
          return (
            <div
              key={r.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto',
                gap: 'var(--space-3)',
                padding: 'var(--space-3) var(--space-4)',
                borderBottom: i < active.length - 1 ? '1px solid var(--color-border)' : 'none',
                cursor: 'pointer',
              }}
              data-vyvy-row="true"
              data-vyvy-alert={r.response === 'NO_RESPONSE' ? 'true' : undefined}
              onClick={() => onOpenDrawer({ open: true, type: 'reminder', id: r.id })}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 2 }}>
                  <span style={{
                    fontSize: 11, fontWeight: 700,
                    background: '#F3F0EA', borderRadius: 'var(--radius-sm)',
                    padding: '1px 6px', color: 'var(--color-text)',
                  }}>
                    {person?.avatarInitials}
                  </span>
                  <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text)' }}>
                    {person?.name}
                  </span>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                    · {person?.role}
                  </span>
                </div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginBottom: 4, lineHeight: 1.4 }}>
                  {r.content}
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: rs.color, fontWeight: 600 }}>{rs.label}</span>
                  <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                    Nhắc {r.reminderCount} lần · Lần cuối: {r.lastReminderDate.slice(5).replace('-', '/')}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                    Hạn: {formatRelativeDate(r.dueDate)}
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end', justifyContent: 'center' }}>
                <button
                  onClick={e => { e.stopPropagation(); router.push('/follow-ups') }}
                  data-vyvy-radar="true"
                  style={{
                    fontSize: 11, padding: '4px 10px', cursor: 'pointer',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-lime)', color: 'var(--color-charcoal)',
                    fontWeight: 600,
                  }}
                >Nhắc thêm</button>
              </div>
            </div>
          )
        })
      )}
    </PanelShell>
  )
}

// ---- Shared sub-components ----

export function PanelShell({ title, count, accentColor, children }: {
  title: string; count: number; accentColor?: string; children: React.ReactNode
}) {
  return (
    <div style={{
      position: 'relative',
      background: 'var(--color-surface)',
      borderRadius: 'var(--radius-xl)',
      border: '1px solid var(--color-border)',
      boxShadow: '0 10px 28px rgba(0,0,0,0.16)',
      overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
    }}
    data-vyvy-card="true"
    >
      <div style={{
        padding: 'var(--space-3) var(--space-4)',
        borderBottom: '1px solid var(--color-border)',
        display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
        background: 'var(--color-surface)',
      }}>
        <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--text-sm)', fontWeight: 700, margin: 0, flex: 1 }}>
          {title}
        </h3>
        {count > 0 && (
          <span style={{
            background: accentColor ?? 'var(--color-text-muted)', color: '#fff',
            fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)',
            borderRadius: 'var(--radius-full)', padding: '1px 6px', lineHeight: '16px',
          }}>{count}</span>
        )}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', maxHeight: 320 }}>
        {children}
      </div>
    </div>
  )
}

export function EmptyRow({ text }: { text: string }) {
  return (
    <div style={{
      padding: 'var(--space-6) var(--space-4)',
      textAlign: 'center',
      fontSize: 'var(--text-xs)',
      color: 'var(--color-text-muted)',
      fontStyle: 'italic',
    }}>{text}</div>
  )
}
