'use client'
import React from 'react'

type InputBaseProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'prefix'>
interface InputProps extends InputBaseProps {
  label?: string
  error?: string
  helpText?: string
  prefix?: React.ReactNode
  suffix?: React.ReactNode
}

export function Input({ label, error, helpText, prefix, suffix, id, style, ...props }: InputProps) {
  const uid = React.useId()
  const inputId = id ?? uid
  const [focused, setFocused] = React.useState(false)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
      {label && (
        <label htmlFor={inputId} style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--color-text)' }}>
          {label}
        </label>
      )}
      <div style={{
        display: 'flex', alignItems: 'center',
        background: 'var(--color-surface)',
        border: `1.5px solid ${error ? 'var(--color-danger)' : focused ? 'var(--color-charcoal)' : 'var(--color-border-strong)'}`,
        borderRadius: 'var(--radius-md)',
        transition: `border-color var(--motion-fast) var(--ease-out)`,
        overflow: 'hidden',
      }}>
        {prefix && <span style={{ padding: '0 var(--space-3)', color: 'var(--color-muted)', flexShrink: 0 }}>{prefix}</span>}
        <input
          id={inputId}
          onFocus={e => { setFocused(true); props.onFocus?.(e) }}
          onBlur={e => { setFocused(false); props.onBlur?.(e) }}
          style={{
            flex: 1, padding: '8px 12px', border: 'none', outline: 'none',
            background: 'transparent', fontSize: 'var(--text-sm)', color: 'var(--color-text)',
            minWidth: 0, ...style,
          }}
          {...props}
        />
        {suffix && <span style={{ padding: '0 var(--space-3)', color: 'var(--color-muted)', flexShrink: 0 }}>{suffix}</span>}
      </div>
      {error && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-danger)' }}>{error}</span>}
      {helpText && !error && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>{helpText}</span>}
    </div>
  )
}

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
  helpText?: string
}

export function Textarea({ label, error, helpText, id, ...props }: TextareaProps) {
  const uid = React.useId()
  const taId = id ?? uid
  const [focused, setFocused] = React.useState(false)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
      {label && <label htmlFor={taId} style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>{label}</label>}
      <textarea
        id={taId}
        onFocus={e => { setFocused(true); props.onFocus?.(e) }}
        onBlur={e => { setFocused(false); props.onBlur?.(e) }}
        style={{
          padding: '8px 12px',
          border: `1.5px solid ${error ? 'var(--color-danger)' : focused ? 'var(--color-charcoal)' : 'var(--color-border-strong)'}`,
          borderRadius: 'var(--radius-md)',
          background: 'var(--color-surface)',
          fontSize: 'var(--text-sm)', color: 'var(--color-text)',
          resize: 'vertical', outline: 'none',
          transition: `border-color var(--motion-fast) var(--ease-out)`,
          minHeight: 88,
        }}
        {...props}
      />
      {error && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-danger)' }}>{error}</span>}
      {helpText && !error && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>{helpText}</span>}
    </div>
  )
}
