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
              width: 40, height: 40,
              borderRadius: 'var(--radius-lg)',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              boxShadow: 'var(--shadow-sm)',
              fontSize: 18,
              flexShrink: 0,
            }}>{icon}</span>
          )}
          <div>
            <h1 style={{
              fontFamily: 'var(--font-serif)',
              fontSize: 'var(--text-xl)',
              fontWeight: 700,
              color: 'var(--color-text)',
              margin: 0,
              letterSpacing: '-0.01em',
              lineHeight: 'var(--leading-tight)',
            }}>{title}</h1>
            {description && (
              <p style={{
                fontSize: 'var(--text-sm)',
                color: 'var(--color-text-muted)',
                marginTop: 3,
                lineHeight: 'var(--leading-normal)',
                fontWeight: 400,
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
      minHeight: 340,
      borderRadius: 'var(--radius-xl)',
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      boxShadow: 'var(--shadow-sm)',
    }}>
      <div style={{ textAlign: 'center', padding: 'var(--space-10)', maxWidth: 360 }}>
        {/* Icon */}
        <div style={{
          width: 48, height: 48,
          borderRadius: 'var(--radius-lg)',
          background: 'var(--color-surface-2)',
          border: '1px solid var(--color-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto var(--space-5)',
        }}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <rect x="3" y="3" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4" strokeOpacity="0.4"/>
            <rect x="11" y="3" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4" strokeOpacity="0.4"/>
            <rect x="3" y="11" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4" strokeOpacity="0.4"/>
            <rect x="11" y="11" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4" strokeOpacity="0.4"/>
          </svg>
        </div>

        {/* Title */}
        <p style={{
          fontSize: 'var(--text-base)',
          fontWeight: 600,
          color: 'var(--color-text)',
          margin: '0 0 var(--space-2)',
          fontFamily: 'var(--font-serif)',
        }}>Đang chuẩn bị triển khai</p>

        {/* Description */}
        <p style={{
          fontSize: 'var(--text-sm)',
          color: 'var(--color-text-muted)',
          margin: 0,
          lineHeight: 'var(--leading-normal)',
        }}>
          Module này sẽ được tích hợp đầy đủ trong giai đoạn tiếp theo.
        </p>

        {/* Hint */}
        <p style={{
          fontSize: 'var(--text-xs)',
          color: 'var(--color-text-muted)',
          margin: 'var(--space-4) 0 0',
          opacity: 0.65,
          fontStyle: 'italic',
        }}>
          Shell và design system đã sẵn sàng.
        </p>
      </div>
    </div>
  )
}
