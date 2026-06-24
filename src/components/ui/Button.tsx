'use client'
import React from 'react'
import type { ButtonVariant, ButtonSize } from '@/types'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  fullWidth?: boolean
}

const variantStyles: Record<ButtonVariant, React.CSSProperties & Record<string, unknown>> = {
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
    border: `1.5px solid var(--color-danger)`,
  },
}

const sizeStyles: Record<ButtonSize, React.CSSProperties> = {
  sm: { padding: '5px 12px', fontSize: 'var(--text-sm)', borderRadius: 'var(--radius-sm)' },
  md: { padding: '8px 18px', fontSize: 'var(--text-sm)', borderRadius: 'var(--radius-md)' },
  lg: { padding: '11px 24px', fontSize: 'var(--text-base)', borderRadius: 'var(--radius-md)' },
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

  const hoverStyle: React.CSSProperties = hovered && !isDisabled
    ? variant === 'primary'
      ? { filter: 'brightness(0.92)' }
      : variant === 'ghost'
      ? { background: 'var(--color-surface-2)' }
      : { background: 'var(--color-surface-2)' }
    : {}

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
        fontWeight: 'var(--weight-medium)' as unknown as number,
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        opacity: isDisabled ? 0.5 : 1,
        transition: `all var(--motion-fast) var(--ease-out)`,
        width: fullWidth ? '100%' : undefined,
        whiteSpace: 'nowrap',
        userSelect: 'none',
        ...variantStyles[variant],
        ...sizeStyles[size],
        ...hoverStyle,
        ...style,
      }}
    >
      {loading && <Spinner size={14} />}
      {children}
    </button>
  )
}

function Spinner({ size }: { size: number }) {
  return (
    <span style={{
      display: 'inline-block',
      width: size,
      height: size,
      border: '2px solid currentColor',
      borderTopColor: 'transparent',
      borderRadius: '50%',
      animation: 'spin 0.7s linear infinite',
    }} />
  )
}
