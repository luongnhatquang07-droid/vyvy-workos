'use client'
import React from 'react'

interface DropdownItem {
  key: string
  label: string
  icon?: string
  danger?: boolean
  disabled?: boolean
  onClick?: () => void
}

interface DropdownProps {
  trigger: React.ReactNode
  items: DropdownItem[]
  placement?: 'bottom-left' | 'bottom-right'
}

export function Dropdown({ trigger, items, placement = 'bottom-left' }: DropdownProps) {
  const [open, setOpen] = React.useState(false)
  const ref = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <div onClick={() => setOpen(o => !o)} style={{ cursor: 'pointer' }}>{trigger}</div>
      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 4px)',
          ...(placement === 'bottom-right' ? { right: 0 } : { left: 0 }),
          zIndex: 'var(--z-dropdown)' as unknown as number,
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-lg)',
          minWidth: 180,
          padding: 'var(--space-1)',
          display: 'flex',
          flexDirection: 'column',
        }}>
          {items.map(item => (
            <button
              key={item.key}
              disabled={item.disabled}
              onClick={() => { item.onClick?.(); setOpen(false) }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
                padding: '7px 12px',
                fontSize: 'var(--text-sm)',
                color: item.danger ? 'var(--color-danger)' : item.disabled ? 'var(--color-text-muted)' : 'var(--color-text)',
                background: 'none',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                cursor: item.disabled ? 'not-allowed' : 'pointer',
                textAlign: 'left',
                transition: `background var(--motion-fast) var(--ease-out)`,
              }}
              onMouseEnter={e => { if (!item.disabled) (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-2)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none' }}
            >
              {item.icon && <span>{item.icon}</span>}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
