'use client'
import React from 'react'
import { useFocusTrap } from '@/lib/focusTrap'

interface DrawerProps {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  width?: number
  footer?: React.ReactNode
}

export function Drawer({ open, onClose, title, children, width = 440, footer }: DrawerProps) {
  const panelRef = React.useRef<HTMLDivElement>(null)
  useFocusTrap(open, panelRef)

  React.useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  return (
    <>
      {/* Overlay */}
      <div
        aria-hidden="true"
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          zIndex: 'calc(var(--z-modal) - 1)' as unknown as number,
          background: 'rgba(25,25,25,0.3)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity var(--motion-base) var(--ease-out)',
          backdropFilter: 'blur(1px)',
        }}
      />
      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title ?? 'Drawer'}
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0,
          zIndex: 'var(--z-modal)' as unknown as number,
          width, maxWidth: '90vw',
          background: 'var(--color-surface)',
          boxShadow: 'var(--shadow-xl)',
          display: 'flex', flexDirection: 'column',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform var(--motion-slow) var(--ease-out)',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: 'var(--space-5) var(--space-6)',
          borderBottom: '1px solid var(--color-border)', flexShrink: 0,
        }}>
          {title && <h3 style={{ fontSize: 'var(--text-lg)', fontFamily: 'var(--font-serif)', fontWeight: 700, margin: 0 }}>{title}</h3>}
          <button
            onClick={onClose}
            aria-label="Đóng"
            style={{
              marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--color-text-muted)', fontSize: 18, padding: 4,
              borderRadius: 'var(--radius-sm)',
            }}
          >✕</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-6)' }}>
          {children}
        </div>
        {footer && (
          <div style={{
            padding: 'var(--space-4) var(--space-6)',
            borderTop: '1px solid var(--color-border)',
            display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', flexShrink: 0,
          }}>
            {footer}
          </div>
        )}
      </div>
    </>
  )
}
