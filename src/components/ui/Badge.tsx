import React from 'react'
import type { BadgeVariant } from '@/types'

const styles: Record<BadgeVariant, React.CSSProperties> = {
  default: { background: 'var(--color-surface-2)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' },
  success: { background: '#EBF5EE', color: 'var(--color-success)' },
  warning: { background: '#FDF0E0', color: 'var(--color-warning)' },
  danger:  { background: '#FAEAEA', color: 'var(--color-danger)' },
  waiting: { background: '#EAF0F4', color: 'var(--color-waiting)' },
  lime:    { background: 'var(--color-lime)', color: 'var(--color-charcoal)' },
}

interface BadgeProps {
  variant?: BadgeVariant
  children: React.ReactNode
  style?: React.CSSProperties
}

export function Badge({ variant = 'default', children, style }: BadgeProps) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '2px 8px',
      borderRadius: 'var(--radius-full)',
      fontSize: 'var(--text-xs)',
      fontWeight: 'var(--weight-semibold)' as unknown as number,
      fontFamily: 'var(--font-sans)',
      lineHeight: '1.6',
      whiteSpace: 'nowrap',
      ...styles[variant],
      ...style,
    }}>
      {children}
    </span>
  )
}
