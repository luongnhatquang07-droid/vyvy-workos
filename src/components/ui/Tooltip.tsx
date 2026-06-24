'use client'
import React from 'react'

interface TooltipProps {
  content: string
  children: React.ReactNode
  placement?: 'top' | 'right' | 'bottom' | 'left'
}

const placements: Record<string, React.CSSProperties> = {
  top:    { bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: 6 },
  bottom: { top: '100%',   left: '50%', transform: 'translateX(-50%)', marginTop: 6 },
  left:   { right: '100%', top: '50%',  transform: 'translateY(-50%)', marginRight: 6 },
  right:  { left: '100%',  top: '50%',  transform: 'translateY(-50%)', marginLeft: 6 },
}

export function Tooltip({ content, children, placement = 'top' }: TooltipProps) {
  const [visible, setVisible] = React.useState(false)

  return (
    <span
      style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      {visible && (
        <span style={{
          position: 'absolute',
          zIndex: 'var(--z-tooltip)' as unknown as number,
          background: 'var(--color-charcoal)',
          color: '#fff',
          padding: '4px 8px',
          borderRadius: 'var(--radius-sm)',
          fontSize: 'var(--text-xs)',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          ...placements[placement],
        }}>
          {content}
        </span>
      )}
    </span>
  )
}
