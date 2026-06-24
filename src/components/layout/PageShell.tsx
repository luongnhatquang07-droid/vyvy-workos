import React from 'react'

interface PageShellProps {
  title: string
  description?: string
  icon?: string
  actions?: React.ReactNode
  children?: React.ReactNode
}

export function PageShell({ title, description, icon, actions, children }: PageShellProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Page header */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        gap: 'var(--space-4)', flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
          {icon && (
            <span style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 44, height: 44, borderRadius: 'var(--radius-md)',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              fontSize: 20,
              flexShrink: 0,
            }}>{icon}</span>
          )}
          <div>
            <h1 style={{
              fontFamily: 'var(--font-serif)',
              fontSize: 'var(--text-2xl)',
              fontWeight: 700,
              color: 'var(--color-text)',
              margin: 0,
            }}>{title}</h1>
            {description && (
              <p style={{
                fontSize: 'var(--text-sm)',
                color: 'var(--color-text-muted)',
                marginTop: 'var(--space-1)',
                lineHeight: 'var(--leading-normal)',
              }}>{description}</p>
            )}
          </div>
        </div>
        {actions && <div style={{ display: 'flex', gap: 'var(--space-2)', flexShrink: 0 }}>{actions}</div>}
      </div>

      {/* Content */}
      {children ?? <PlaceholderContent />}
    </div>
  )
}

function PlaceholderContent() {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 320,
      border: '1.5px dashed var(--color-border-strong)',
      borderRadius: 'var(--radius-xl)',
      background: 'var(--color-surface)',
    }}>
      <div style={{ textAlign: 'center', padding: 'var(--space-8)' }}>
        <div style={{ fontSize: 'var(--text-3xl)', opacity: 0.15, marginBottom: 'var(--space-4)' }}>◌</div>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
          Chức năng sẽ được triển khai ở giai đoạn sau.
        </p>
      </div>
    </div>
  )
}
