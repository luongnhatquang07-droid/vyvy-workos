'use client'
import React from 'react'
import { Button } from '@/components/ui/Button'
import { useFocusTrap } from '@/lib/focusTrap'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  width?: number
  footer?: React.ReactNode
}

export function Modal({ open, onClose, title, children, width = 520, footer }: ModalProps) {
  const containerRef = React.useRef<HTMLDivElement>(null)
  useFocusTrap(open, containerRef)

  React.useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title ?? 'Modal'}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0,
        zIndex: 'var(--z-modal)' as unknown as number,
        background: 'rgba(25,25,25,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 'var(--space-4)',
        backdropFilter: 'blur(2px)',
      }}
    >
      <div
        ref={containerRef}
        style={{
          background: 'var(--color-surface)',
          borderRadius: 'var(--radius-xl)',
          width: '100%', maxWidth: width,
          boxShadow: 'var(--shadow-xl)',
          animation: 'modal-in var(--motion-base) var(--ease-out)',
          display: 'flex', flexDirection: 'column',
          maxHeight: 'calc(100vh - 80px)',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: 'var(--space-5) var(--space-6)',
          borderBottom: '1px solid var(--color-border)', flexShrink: 0,
        }}>
          {title && <h2 style={{ fontSize: 'var(--text-lg)', fontFamily: 'var(--font-serif)', fontWeight: 700, margin: 0 }}>{title}</h2>}
          <button
            onClick={onClose}
            aria-label="Đóng"
            style={{
              marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--color-text-muted)', fontSize: 18, lineHeight: 1, padding: 4,
              borderRadius: 'var(--radius-sm)',
              transition: 'color var(--motion-fast) var(--ease-out)',
            }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--color-text)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--color-text-muted)'}
          >✕</button>
        </div>
        <div style={{ padding: 'var(--space-6)', overflowY: 'auto', flex: 1 }}>
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
    </div>
  )
}

interface ConfirmDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
}

export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = 'Xác nhận', danger }: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onClose} title={title} width={420}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>Huỷ</Button>
          <Button variant={danger ? 'danger' : 'primary'} size="sm" onClick={() => { onConfirm(); onClose() }}>{confirmLabel}</Button>
        </>
      }
    >
      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text)', lineHeight: 'var(--leading-normal)' }}>{message}</p>
    </Modal>
  )
}
