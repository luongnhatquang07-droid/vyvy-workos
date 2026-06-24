import React from 'react'

interface FieldProps {
  label?: string
  required?: boolean
  error?: string
  helpText?: string
  children: React.ReactNode
  htmlFor?: string
}

export function Field({ label, required, error, helpText, children, htmlFor }: FieldProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
      {label && (
        <label htmlFor={htmlFor} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', fontSize: 'var(--text-sm)', fontWeight: 500 }}>
          {label}
          {required && <span style={{ color: 'var(--color-danger)', fontSize: 'var(--text-sm)' }}>*</span>}
        </label>
      )}
      {children}
      {error && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-danger)' }}>{error}</span>}
      {helpText && !error && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>{helpText}</span>}
    </div>
  )
}
