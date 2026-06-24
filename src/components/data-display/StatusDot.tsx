import React from 'react'
import type { StatusDotColor } from '@/types'

const dotColors: Record<StatusDotColor, string> = {
  success: 'var(--color-success)',
  warning: 'var(--color-warning)',
  danger:  'var(--color-danger)',
  waiting: 'var(--color-waiting)',
  muted:   'var(--color-muted)',
}

interface StatusDotProps {
  color?: StatusDotColor
  label?: string
  size?: number
}

export function StatusDot({ color = 'muted', label, size = 8 }: StatusDotProps) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: '50%',
        background: dotColors[color],
        flexShrink: 0,
      }} />
      {label && <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text)' }}>{label}</span>}
    </span>
  )
}
