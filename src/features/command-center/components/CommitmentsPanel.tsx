'use client'
import React from 'react'
import { useRouter } from 'next/navigation'
import type { Meeting } from '../types'

interface CommitmentsPanelProps {
  meetings: Meeting[]
}

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  no_minutes:       { label: 'Chưa ra đầu việc', color: 'var(--color-danger)', bg: 'var(--color-danger-bg)' },
  minutes_no_tasks: { label: 'Chưa ra đầu việc', color: 'var(--color-danger)', bg: 'var(--color-danger-bg)' },
  draft_pending:    { label: 'Chưa nhập', color: 'var(--color-warning)', bg: 'var(--color-warning-bg)' },
  follow_up_needed: { label: 'Chờ chốt owner', color: 'var(--color-waiting)', bg: 'var(--color-waiting-bg)' },
  done:             { label: 'Đã xong', color: 'var(--color-success)', bg: 'var(--color-success-bg)' },
}

const TODAY = '2026-06-25'

export function CommitmentsPanel({ meetings }: CommitmentsPanelProps) {
  const router = useRouter()
  const relevant = meetings.filter(m => m.status !== 'done')

  return (
    <div style={{
      position: 'relative',
      background: 'var(--color-surface)', borderRadius: 'var(--radius-xl)',
      border: '1px solid var(--color-border)', overflow: 'hidden',
    }}
    data-vyvy-card="true"
    >
      <div style={{
        padding: 'var(--space-3) var(--space-4)',
        borderBottom: '1px solid var(--color-border)',
        display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
      }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 19, height: 19, borderRadius: 6,
          background: 'var(--color-surface-2)', color: 'var(--color-text-muted)',
          fontSize: 11, fontWeight: 700, marginRight: 4,
        }}>3</span>
        <h3 style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--text-sm)', fontWeight: 700, margin: 0, flex: 1 }}>
          Cam kết sau họp → đã thành đầu việc chưa?
        </h3>
      </div>
      {relevant.length === 0 ? (
        <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 'var(--text-xs)', fontStyle: 'italic' }}>
          Tất cả cuộc họp đã được xử lý.
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-xs)' }}>
          <thead>
            <tr>
              {['Cuộc họp', 'Quyết định', 'Đầu việc', 'Trạng thái'].map(h => (
                <th key={h} style={{
                  textAlign: 'left', fontSize: 10, textTransform: 'uppercase',
                  letterSpacing: '0.06em', color: 'var(--color-text-muted)', fontWeight: 600,
                  padding: '8px 12px', borderBottom: '1px solid var(--color-border)',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {relevant.map((m, i) => {
              const meta = STATUS_META[m.status] ?? STATUS_META.follow_up_needed
              const isToday = m.date === TODAY
              return (
                <tr
                  key={m.id}
                  onClick={() => router.push('/meetings')}
                  style={{ borderBottom: i < relevant.length - 1 ? '1px solid var(--color-border)' : 'none', cursor: 'pointer' }}
                  data-vyvy-row="true"
                  data-vyvy-alert={m.status === 'no_minutes' || m.status === 'minutes_no_tasks' ? 'true' : undefined}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-2)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                >
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--color-text)' }}>{m.title}</div>
                    <div style={{ fontSize: 10, color: 'var(--color-text-muted)', marginTop: 1 }}>{isToday ? 'Hôm nay' : m.date.slice(5).replace('-', '/')}</div>
                  </td>
                  <td style={{ padding: '10px 12px', color: 'var(--color-text-muted)' }}>{m.decisionCount} quyết định</td>
                  <td style={{ padding: '10px 12px', color: 'var(--color-text-muted)' }}>{m.importedTaskCount} / {m.taskDraftCount}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{
                      fontSize: 10, fontWeight: 600, padding: '2px 7px',
                      borderRadius: 'var(--radius-sm)', background: meta.bg, color: meta.color,
                    }}>{meta.label}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
