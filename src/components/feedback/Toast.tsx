'use client'
import React from 'react'
import type { ToastMessage, ToastVariant } from '@/types'
import { generateId } from '@/lib/utils'

const icons: Record<ToastVariant, string> = {
  info: 'ℹ',
  success: '✓',
  warning: '⚠',
  error: '✕',
}
const colors: Record<ToastVariant, string> = {
  info: 'var(--color-waiting)',
  success: 'var(--color-success)',
  warning: 'var(--color-warning)',
  error: 'var(--color-danger)',
}

interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant, duration?: number) => void
}

const ToastContext = React.createContext<ToastContextValue>({ toast: () => {} })

export function useToast() {
  return React.useContext(ToastContext)
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastMessage[]>([])

  const toast = React.useCallback((message: string, variant: ToastVariant = 'info', duration = 4000) => {
    const id = generateId()
    setToasts(prev => [...prev, { id, message, variant, duration }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration)
  }, [])

  const dismiss = (id: string) => setToasts(prev => prev.filter(t => t.id !== id))

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div style={{
        position: 'fixed',
        bottom: 'var(--space-6)',
        right: 'var(--space-6)',
        zIndex: 'var(--z-toast)' as unknown as number,
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
        maxWidth: 360,
      }}>
        {toasts.map(t => (
          <div key={t.id} style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 'var(--space-3)',
            background: 'var(--color-charcoal)',
            color: '#fff',
            padding: '12px 16px',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-xl)',
            animation: `toast-in var(--motion-base) var(--ease-out)`,
            borderLeft: `3px solid ${colors[t.variant ?? 'info']}`,
          }}>
            <span style={{ color: colors[t.variant ?? 'info'], flexShrink: 0, marginTop: 1 }}>{icons[t.variant ?? 'info']}</span>
            <span style={{ fontSize: 'var(--text-sm)', flex: 1, lineHeight: 1.5 }}>{t.message}</span>
            <button onClick={() => dismiss(t.id)} style={{
              background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)',
              cursor: 'pointer', fontSize: 14, lineHeight: 1, flexShrink: 0, padding: 0,
            }}>✕</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
