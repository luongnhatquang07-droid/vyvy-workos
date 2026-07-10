'use client'
import React from 'react'
import type { FilterView } from '../types'

const FILTERS: { value: FilterView; label: string }[] = [
  { value: 'all',              label: 'Tất cả' },
  { value: 'today',            label: 'Hôm nay + quá hạn' },
  { value: 'next_24h',         label: '24 giờ tới' },
  { value: 'overdue',          label: 'Quá hạn' },
  { value: 'waiting',          label: 'Chờ phản hồi' },
  { value: 'pending_approval', label: 'Chờ duyệt' },
  { value: 'ceo_report',       label: 'Cần báo CEO' },
]

interface FilterChipsProps {
  value: FilterView
  onChange: (v: FilterView) => void
}

export function FilterChips({ value, onChange }: FilterChipsProps) {
  return (
    <div role="group" aria-label="Bộ lọc" style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
      {FILTERS.map(f => {
        const active = f.value === value
        return (
          <button
            key={f.value}
            onClick={() => onChange(f.value)}
            aria-pressed={active}
            style={{
              display: 'inline-flex', alignItems: 'center',
              padding: '5px 14px',
              borderRadius: 'var(--radius-full)',
              fontSize: 'var(--text-sm)',
              fontWeight: active ? 600 : 400,
              cursor: 'pointer',
              border: active ? '1.5px solid var(--color-charcoal)' : '1.5px solid var(--color-border)',
              background: active ? 'var(--color-charcoal)' : 'var(--color-surface)',
              color: active ? '#fff' : 'var(--color-text-muted)',
              transition: 'all var(--motion-fast) var(--ease-out)',
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={e => {
              if (!active) {
                const el = e.currentTarget as HTMLElement
                el.style.borderColor = 'var(--color-charcoal)'
                el.style.color = 'var(--color-text)'
              }
            }}
            onMouseLeave={e => {
              if (!active) {
                const el = e.currentTarget as HTMLElement
                el.style.borderColor = 'var(--color-border)'
                el.style.color = 'var(--color-text-muted)'
              }
            }}
          >
            {f.label}
          </button>
        )
      })}
    </div>
  )
}
