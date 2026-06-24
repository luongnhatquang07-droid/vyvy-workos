import React from 'react'

interface LoadingSpinnerProps {
  size?: number
  color?: string
  label?: string
}

export function LoadingSpinner({ size = 32, color = 'var(--color-charcoal)', label }: LoadingSpinnerProps) {
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-3)' }}>
      <span style={{
        display: 'inline-block',
        width: size,
        height: size,
        border: `2px solid var(--color-border)`,
        borderTopColor: color,
        borderRadius: '50%',
        animation: 'spin 0.7s linear infinite',
      }} />
      {label && <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>{label}</span>}
    </span>
  )
}
