import React from 'react'

interface EmptyStateProps {
  icon?: string
  title: string
  description?: string
  action?: React.ReactNode
}

export function EmptyState({ icon = '○', title, description, action }: EmptyStateProps) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: 'var(--space-16) var(--space-8)',
      gap: 'var(--space-4)',
      textAlign: 'center',
    }}>
      <span style={{ fontSize: 40, opacity: 0.3, lineHeight: 1 }}>{icon}</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <h3 style={{ fontSize: 'var(--text-base)', fontFamily: 'var(--font-sans)', fontWeight: 600, color: 'var(--color-text)' }}>{title}</h3>
        {description && <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', lineHeight: 'var(--leading-normal)' }}>{description}</p>}
      </div>
      {action}
    </div>
  )
}

interface ErrorStateProps {
  title?: string
  description?: string
  action?: React.ReactNode
}

export function ErrorState({ title = 'Đã xảy ra lỗi', description, action }: ErrorStateProps) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: 'var(--space-16) var(--space-8)',
      gap: 'var(--space-4)',
      textAlign: 'center',
    }}>
      <span style={{ fontSize: 40, color: 'var(--color-danger)', lineHeight: 1 }}>⚠</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <h3 style={{ fontSize: 'var(--text-base)', fontFamily: 'var(--font-sans)', fontWeight: 600 }}>{title}</h3>
        {description && <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>{description}</p>}
      </div>
      {action}
    </div>
  )
}
