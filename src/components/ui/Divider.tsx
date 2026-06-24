import React from 'react'

interface DividerProps {
  label?: string
  style?: React.CSSProperties
}

export function Divider({ label, style }: DividerProps) {
  if (label) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', ...style }}>
        <span style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>{label}</span>
        <span style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
      </div>
    )
  }
  return <hr style={{ border: 'none', borderTop: '1px solid var(--color-border)', margin: 0, ...style }} />
}
