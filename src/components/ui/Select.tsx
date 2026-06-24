'use client'
import React from 'react'

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  options: { value: string; label: string }[]
}

export function Select({ label, error, options, id, ...props }: SelectProps) {
  const uid = React.useId()
  const selId = id ?? uid
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
      {label && <label htmlFor={selId} style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>{label}</label>}
      <select
        id={selId}
        style={{
          padding: '8px 12px',
          border: `1.5px solid ${error ? 'var(--color-danger)' : 'var(--color-border-strong)'}`,
          borderRadius: 'var(--radius-md)',
          background: 'var(--color-surface)',
          fontSize: 'var(--text-sm)', color: 'var(--color-text)',
          outline: 'none', cursor: 'pointer', appearance: 'none',
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath d='M2 4l4 4 4-4' stroke='%23191919' fill='none' stroke-width='1.5'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center', paddingRight: 32,
        }}
        {...props}
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {error && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-danger)' }}>{error}</span>}
    </div>
  )
}
