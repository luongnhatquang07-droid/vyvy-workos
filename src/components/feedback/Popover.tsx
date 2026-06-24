'use client'
import React from 'react'

interface PopoverProps {
  trigger: React.ReactNode
  content: React.ReactNode
  placement?: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right'
}

const placements: Record<string, React.CSSProperties> = {
  'bottom-left':  { top: 'calc(100% + 6px)', left: 0 },
  'bottom-right': { top: 'calc(100% + 6px)', right: 0 },
  'top-left':     { bottom: 'calc(100% + 6px)', left: 0 },
  'top-right':    { bottom: 'calc(100% + 6px)', right: 0 },
}

export function Popover({ trigger, content, placement = 'bottom-left' }: PopoverProps) {
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
          zIndex: 'var(--z-dropdown)' as unknown as number,
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-lg)',
          padding: 'var(--space-4)',
          minWidth: 240,
          ...placements[placement],
        }}>
          {content}
        </div>
      )}
    </div>
  )
}
