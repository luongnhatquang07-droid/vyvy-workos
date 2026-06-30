import React from 'react'

interface PageHeadProps {
  icon: string
  title: string
  desc: string
  actions?: React.ReactNode
}

export function PageHead({ icon, title, desc, actions }: PageHeadProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 13, marginBottom: 18 }}>
      <div style={{
        width: 42, height: 42, borderRadius: 'var(--radius-md)',
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
        color: 'var(--olive)',
      }}>
        <i className={`ti ${icon}`} style={{ fontSize: 20 }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h1
          data-vyvy-type="true"
          suppressHydrationWarning
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 26, fontWeight: 500,
            margin: 0, lineHeight: 1.2,
            letterSpacing: '-0.01em',
            color: 'var(--txt)',
          }}
        >{title}</h1>
        <p style={{
          color: 'var(--txt-3)',
          fontSize: 12.5, margin: 0, marginTop: 3,
        }}>{desc}</p>
      </div>
      {actions && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {actions}
        </div>
      )}
    </div>
  )
}
