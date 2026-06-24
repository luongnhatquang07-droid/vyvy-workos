'use client'
import React from 'react'

interface ProgressBarProps {
  value: number
  max?: number
  label?: string
  color?: string
  height?: number
  showValue?: boolean
}

export function ProgressBar({ value, max = 100, label, color = 'var(--color-charcoal)', height = 6, showValue }: ProgressBarProps) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
      {(label || showValue) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
          {label && <span>{label}</span>}
          {showValue && <span>{Math.round(pct)}%</span>}
        </div>
      )}
      <div style={{
        width: '100%', height, borderRadius: 'var(--radius-full)',
        background: 'var(--color-border)', overflow: 'hidden',
      }}>
        <div style={{
          height: '100%', borderRadius: 'var(--radius-full)',
          background: color,
          width: `${pct}%`,
          transition: `width var(--motion-slow) var(--ease-out)`,
          animation: 'progress-fill var(--motion-slow) var(--ease-out)',
        }} />
      </div>
    </div>
  )
}

interface CircularProgressProps {
  value: number
  max?: number
  size?: number
  strokeWidth?: number
  color?: string
  label?: string
}

export function CircularProgress({ value, max = 100, size = 48, strokeWidth = 4, color = 'var(--color-charcoal)', label }: CircularProgressProps) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const pct = Math.min(100, Math.max(0, (value / max) * 100))
  const offset = circumference - (pct / 100) * circumference

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-1)' }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="var(--color-border)" strokeWidth={strokeWidth} />
        <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke={color} strokeWidth={strokeWidth}
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: `stroke-dashoffset var(--motion-slow) var(--ease-out)` }}
        />
      </svg>
      {label && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>{label}</span>}
    </div>
  )
}
