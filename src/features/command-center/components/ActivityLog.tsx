'use client'
import React from 'react'
import type { ActivityLogEntry } from '../types'

interface ActivityLogProps {
  entries: ActivityLogEntry[]
}

const DOT_COLORS: Record<string, string> = {
  green:  'var(--color-success)',
  blue:   'var(--color-waiting)',
  violet: '#6B8A99',
  amber:  'var(--color-warning)',
  gray:   'var(--color-text-muted)',
  red:    'var(--color-danger)',
}

export function ActivityLog({ entries }: ActivityLogProps) {
  return (
    <div style={{
      background: 'var(--color-surface)', borderRadius: 'var(--radius-xl)',
      border: '1px solid var(--color-border)', overflow: 'hidden',
    }}>
      <div style={{
        padding: 'var(--space-3) var(--space-5)',
        borderBottom: '1px solid var(--color-border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 19, height: 19, borderRadius: 6,
            background: 'var(--color-surface-2)', color: 'var(--color-text-muted)',
            fontSize: 11, fontWeight: 700, marginRight: 4,
          }}>{entries.length}</span>
          <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--text-sm)', fontWeight: 700, margin: 0 }}>
            Nhật ký theo dõi
          </h2>
          <span style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>
            Chỉ hiển thị nhắc việc, phản hồi và cam kết đang còn hiệu lực.
          </span>
        </div>
        <span style={{
          fontSize: 10, color: 'var(--color-text-muted)', background: 'var(--color-surface-2)',
          border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '1px 7px',
        }}>Hôm nay</span>
      </div>

      <div style={{ padding: '4px 20px' }}>
        {entries.length === 0 ? (
          <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 'var(--text-xs)', fontStyle: 'italic' }}>
            Chưa có nhật ký theo dõi đang hiệu lực.
          </div>
        ) : entries.map((entry, i) => (
          <div key={entry.id} style={{
            display: 'flex', gap: 11, padding: '9px 0',
            alignItems: 'flex-start',
            borderBottom: i < entries.length - 1 ? '1px solid var(--color-border)' : 'none',
            fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', lineHeight: 1.5,
          }}>
            <span style={{
              width: 9, height: 9, borderRadius: '50%', flexShrink: 0,
              background: DOT_COLORS[entry.dotColor] ?? 'var(--color-text-muted)',
              marginTop: 5,
            }} />
            <div>
              <span style={{ color: 'var(--color-text-muted)', fontSize: 10, marginRight: 4 }}>{entry.time}</span>
              {entry.text}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
