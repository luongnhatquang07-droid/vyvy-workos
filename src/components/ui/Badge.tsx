import React from 'react'
import type { BadgeVariant } from '@/types'

const styles: Record<BadgeVariant, React.CSSProperties> = {
  default: {
    background: 'var(--color-surface-2)',
    color: 'rgba(25,25,25,0.6)',
    border: '1px solid var(--color-border)',
  },
  success: {
    background: '#E8F5ED',
    color: '#3A7A4A',
    border: '1px solid rgba(74,140,92,0.2)',
  },
  warning: {
    background: '#FEF0DC',
    color: '#A8621A',
    border: '1px solid rgba(196,123,43,0.2)',
  },
  danger: {
    background: '#FAEAEA',
    color: '#A03030',
    border: '1px solid rgba(184,64,64,0.2)',
  },
  waiting: {
    background: '#EAF0F5',
    color: '#4E6E7E',
    border: '1px solid rgba(107,138,153,0.2)',
  },
  lime: {
    background: 'var(--color-lime)',
    color: 'var(--color-charcoal)',
    border: '1px solid transparent',
  },
}

interface BadgeProps {
  variant?: BadgeVariant
  children: React.ReactNode
  style?: React.CSSProperties
}

export function Badge({ variant = 'default', children, style }: BadgeProps) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '3px 9px',
      borderRadius: 'var(--radius-full)',
      fontSize: 'var(--text-xs)',
      fontWeight: 600,
      fontFamily: 'var(--font-sans)',
      lineHeight: 1.5,
      whiteSpace: 'nowrap',
      letterSpacing: '0.01em',
      ...styles[variant],
      ...style,
    }}>
      {children}
    </span>
  )
}
