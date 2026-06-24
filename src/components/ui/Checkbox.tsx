'use client'
import React from 'react'

interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
}

export function Checkbox({ label, id, style, ...props }: CheckboxProps) {
  const uid = React.useId()
  const cbId = id ?? uid
  return (
    <label htmlFor={cbId} style={{
      display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)',
      cursor: props.disabled ? 'not-allowed' : 'pointer',
      fontSize: 'var(--text-sm)', userSelect: 'none',
    }}>
      <input type="checkbox" id={cbId}
        style={{ accentColor: 'var(--color-charcoal)', width: 16, height: 16, cursor: 'inherit', ...style }}
        {...props}
      />
      {label}
    </label>
  )
}

interface RadioProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
}

export function Radio({ label, id, ...props }: RadioProps) {
  const uid = React.useId()
  const rId = id ?? uid
  return (
    <label htmlFor={rId} style={{
      display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)',
      cursor: props.disabled ? 'not-allowed' : 'pointer',
      fontSize: 'var(--text-sm)', userSelect: 'none',
    }}>
      <input type="radio" id={rId}
        style={{ accentColor: 'var(--color-charcoal)', width: 16, height: 16, cursor: 'inherit' }}
        {...props}
      />
      {label}
    </label>
  )
}
