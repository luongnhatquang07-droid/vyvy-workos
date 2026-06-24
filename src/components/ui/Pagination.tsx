'use client'
import React from 'react'

interface PaginationProps {
  page: number
  totalPages: number
  onChange: (page: number) => void
}

export function Pagination({ page, totalPages, onChange }: PaginationProps) {
  const pages = Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
    if (totalPages <= 5) return i + 1
    if (page <= 3) return i + 1
    if (page >= totalPages - 2) return totalPages - 4 + i
    return page - 2 + i
  })

  const btn = (label: string | number, active: boolean, disabled: boolean, onClick: () => void) => (
    <button key={label} onClick={onClick} disabled={disabled} style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 32, height: 32, borderRadius: 'var(--radius-sm)',
      fontSize: 'var(--text-sm)',
      background: active ? 'var(--color-charcoal)' : 'transparent',
      color: active ? '#fff' : disabled ? 'var(--color-text-muted)' : 'var(--color-text)',
      border: active ? 'none' : '1px solid var(--color-border)',
      cursor: disabled ? 'not-allowed' : 'pointer',
      fontWeight: active ? 600 : 400,
      transition: `background var(--motion-fast) var(--ease-out)`,
    }}>
      {label}
    </button>
  )

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
      {btn('‹', false, page === 1, () => onChange(page - 1))}
      {pages.map(p => btn(p, p === page, false, () => onChange(p)))}
      {btn('›', false, page === totalPages, () => onChange(page + 1))}
    </div>
  )
}
