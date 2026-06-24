'use client'
import React from 'react'

interface SwitchProps {
  checked?: boolean
  onChange?: (checked: boolean) => void
  disabled?: boolean
  label?: string
}

export function Switch({ checked = false, onChange, disabled, label }: SwitchProps) {
  const toggle = () => { if (!disabled) onChange?.(!checked) }

  return (
    <label style={{
      display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)',
      cursor: disabled ? 'not-allowed' : 'pointer', userSelect: 'none',
      fontSize: 'var(--text-sm)',
    }}>
      <span
        role="switch"
        aria-checked={checked}
        tabIndex={disabled ? -1 : 0}
        onClick={toggle}
        onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle() } }}
        style={{
          display: 'inline-flex', alignItems: 'center',
          width: 40, height: 22, borderRadius: 'var(--radius-full)',
          background: checked ? 'var(--color-charcoal)' : 'var(--color-border-strong)',
          transition: `background var(--motion-base) var(--ease-out)`,
          padding: 2,
          opacity: disabled ? 0.4 : 1,
        }}
      >
        <span style={{
          width: 18, height: 18, borderRadius: '50%', background: '#fff',
          transition: `transform var(--motion-base) var(--ease-out)`,
          transform: checked ? 'translateX(18px)' : 'translateX(0)',
          boxShadow: 'var(--shadow-sm)',
        }} />
      </span>
      {label}
    </label>
  )
}
