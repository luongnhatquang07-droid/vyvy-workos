'use client'
import React from 'react'
import type { ButtonVariant, ButtonSize } from '@/types'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  fullWidth?: boolean
}

const baseVariant: Record<ButtonVariant, React.CSSProperties> = {
  primary: {
    background: 'var(--color-lime)',
    color: 'var(--color-charcoal)',
    border: '1.5px solid transparent',
  },
  secondary: {
    background: 'transparent',
    color: 'var(--color-text)',
    border: '1.5px solid var(--color-border-strong)',
  },
  ghost: {
    background: 'transparent',
    color: 'var(--color-text)',
    border: '1.5px solid transparent',
  },
  danger: {
    background: 'transparent',
    color: 'var(--color-danger)',
    border: '1.5px solid var(--color-danger)',
  },
}

const hoverVariant: Record<ButtonVariant, React.CSSProperties> = {
  primary:   { filter: 'brightness(0.91)' },
  secondary: { background: 'var(--color-surface-2)', borderColor: 'var(--color-charcoal)' },
  ghost:     { background: 'var(--color-surface-2)' },
  danger:    { background: 'rgba(184,64,64,0.07)' },
}

const sizeStyles: Record<ButtonSize, React.CSSProperties> = {
  sm: { padding: '0 12px', height: 30, fontSize: 'var(--text-sm)', borderRadius: 'var(--radius-sm)' },
  md: { padding: '0 18px', height: 36, fontSize: 'var(--text-sm)', borderRadius: 'var(--radius-md)' },
  lg: { padding: '0 24px', height: 42, fontSize: 'var(--text-base)', borderRadius: 'var(--radius-md)' },
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  fullWidth = false,
  disabled,
  children,
  style,
  onMouseEnter,
  onMouseLeave,
  ...props
}: ButtonProps) {
  const [hovered, setHovered] = React.useState(false)
  const isDisabled = disabled || loading

  const appliedHover = hovered && !isDisabled ? hoverVariant[variant] : {}

  return (
    <button
      {...props}
      disabled={isDisabled}
      onMouseEnter={e => { setHovered(true); onMouseEnter?.(e) }}
      onMouseLeave={e => { setHovered(false); onMouseLeave?.(e) }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 'var(--space-2)',
        fontWeight: 550,
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        /* Loading: dimmer but still recognizable. Disabled: clearly inactive */
        opacity: loading ? 0.65 : (disabled ? 0.38 : 1),
        transition: `all var(--motion-fast) var(--ease-out)`,
        width: fullWidth ? '100%' : undefined,
        whiteSpace: 'nowrap',
        userSelect: 'none',
        letterSpacing: '0.01em',
        ...baseVariant[variant],
        ...sizeStyles[size],
        ...appliedHover,
        ...style,
      }}
    >
      {loading && <Spinner size={13} />}
      {children}
    </button>
  )
}

function Spinner({ size }: { size: number }) {
  return (
    <span style={{
      display: 'inline-block',
      width: size, height: size,
      border: '1.75px solid currentColor',
      borderTopColor: 'transparent',
      borderRadius: '50%',
      animation: 'spin 0.65s linear infinite',
      flexShrink: 0,
    }} />
  )
}
