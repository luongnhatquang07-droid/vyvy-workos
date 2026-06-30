'use client'

import React from 'react'

interface DataErrorStateProps {
  message: string
}

export function DataErrorState({ message }: DataErrorStateProps) {
  return (
    <section style={wrapStyle} role="alert">
      <div style={iconStyle}>!</div>
      <div>
        <div style={titleStyle}>Không tải được dữ liệu</div>
        <div style={descStyle}>{message}</div>
      </div>
      <button type="button" onClick={() => window.location.reload()} style={buttonStyle}>
        Tải lại
      </button>
    </section>
  )
}

const wrapStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-3)',
  padding: '18px 20px',
  borderRadius: 'var(--radius-lg)',
  border: '1px solid rgba(184,64,64,0.22)',
  background: 'var(--color-danger-bg)',
  color: 'var(--color-text)',
}

const iconStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 'var(--radius-full)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'var(--color-danger)',
  color: '#fff',
  fontSize: 16,
  fontWeight: 800,
  flexShrink: 0,
}

const titleStyle: React.CSSProperties = {
  fontSize: 'var(--text-sm)',
  fontWeight: 800,
}

const descStyle: React.CSSProperties = {
  marginTop: 3,
  fontSize: 'var(--text-xs)',
  color: 'var(--color-text-muted)',
  lineHeight: 1.5,
}

const buttonStyle: React.CSSProperties = {
  marginLeft: 'auto',
  border: '1px solid rgba(184,64,64,0.25)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--color-surface)',
  color: 'var(--color-text)',
  padding: '7px 12px',
  fontSize: 'var(--text-xs)',
  fontWeight: 700,
  cursor: 'pointer',
  flexShrink: 0,
}
