'use client'

import React, { useEffect, useRef } from 'react'

// ─── Button ──────────────────────────────────────────────────────────────────

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md' | 'lg'

const btnBase = 'inline-flex items-center justify-center gap-2 font-bold rounded-[var(--radius)] transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:outline-offset-2 select-none'

const btnVariants: Record<ButtonVariant, string> = {
  primary:   'bg-[var(--accent)] text-[var(--on-accent)] hover:bg-[var(--accent-hover)] shadow-[0_4px_20px_-6px_rgba(218,223,33,0.4)] hover:shadow-[0_4px_28px_-4px_rgba(218,223,33,0.55)]',
  secondary: 'bg-transparent border border-[var(--border-strong)] text-[var(--text-primary)] hover:border-[var(--accent)] hover:text-[var(--accent)]',
  ghost:     'bg-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]',
  danger:    'bg-[var(--danger-soft)] text-[var(--danger)] hover:bg-[var(--danger)] hover:text-[var(--bg-base)] border border-[var(--danger)]/30',
}

const btnSizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-sm',
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  className = '',
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
}) {
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={`${btnBase} ${btnVariants[variant]} ${btnSizes[size]} ${className}`}
    >
      {loading && (
        <svg className="animate-spin h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
        </svg>
      )}
      {children}
    </button>
  )
}

// ─── Card ─────────────────────────────────────────────────────────────────────

export function Card({ children, className = '', hover = false }: {
  children: React.ReactNode
  className?: string
  hover?: boolean
}) {
  return (
    <div className={`bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--radius-lg)] ${hover ? 'card-hover cursor-pointer' : ''} ${className}`}>
      {children}
    </div>
  )
}

// ─── Badge / StatusPill ───────────────────────────────────────────────────────

type BadgeTone = 'success' | 'warning' | 'danger' | 'info' | 'accent' | 'neutral'

const badgeTones: Record<BadgeTone, string> = {
  success: 'bg-[var(--success-soft)] text-[var(--success)]',
  warning: 'bg-[var(--warning-soft)] text-[var(--warning)]',
  danger:  'bg-[var(--danger-soft)] text-[var(--danger)]',
  info:    'bg-[var(--info-soft)] text-[var(--info)]',
  accent:  'bg-[var(--accent-soft)] text-[var(--accent)]',
  neutral: 'bg-[var(--bg-card-hover)] text-[var(--text-secondary)]',
}

export function Badge({ tone = 'neutral', children, className = '' }: {
  tone?: BadgeTone
  children: React.ReactNode
  className?: string
}) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${badgeTones[tone]} ${className}`}>
      {children}
    </span>
  )
}

// ─── Input ────────────────────────────────────────────────────────────────────

export function Input({ label, helper, error, className = '', ...props }: React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string
  helper?: string
  error?: string
}) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-xs font-semibold text-[var(--text-secondary)]">{label}</label>}
      <input
        {...props}
        className={`h-11 w-full rounded-[var(--radius)] border ${error ? 'border-[var(--danger)]' : 'border-[var(--border)]'} bg-[var(--bg-input)] px-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent)] transition-colors ${className}`}
      />
      {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
      {helper && !error && <p className="text-xs text-[var(--text-muted)]">{helper}</p>}
    </div>
  )
}

// ─── Select ───────────────────────────────────────────────────────────────────

export function Select({ label, error, className = '', children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string
  error?: string
}) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-xs font-semibold text-[var(--text-secondary)]">{label}</label>}
      <select
        {...props}
        className={`h-11 w-full rounded-[var(--radius)] border ${error ? 'border-[var(--danger)]' : 'border-[var(--border)]'} bg-[var(--bg-input)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)] transition-colors ${className}`}
      >
        {children}
      </select>
      {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
    </div>
  )
}

// ─── Modal ────────────────────────────────────────────────────────────────────

export function Modal({ open, onClose, title, children, className = '' }: {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  className?: string
}) {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[9990] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className={`w-full max-w-md rounded-[var(--radius-lg)] bg-[var(--bg-card)] border border-[var(--border)] shadow-[0_24px_64px_-16px_rgba(0,0,0,0.8)] ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
            <h3 className="text-base font-bold text-[var(--text-primary)]">{title}</h3>
            <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>
        )}
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}

// ─── Drawer ───────────────────────────────────────────────────────────────────

export function Drawer({ open, onClose, title, children, width = 'max-w-md' }: {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  width?: string
}) {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  return (
    <>
      {open && <div className="fixed inset-0 z-[9980] bg-black/50 backdrop-blur-sm" onClick={onClose} />}
      <div className={`fixed inset-y-0 right-0 z-[9981] flex flex-col w-full ${width} bg-[var(--bg-surface)] border-l border-[var(--border)] shadow-[−24px_0_64px_-16px_rgba(0,0,0,0.6)] transition-transform duration-300 ${open ? 'translate-x-0' : 'translate-x-full'}`}>
        {title && (
          <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4 shrink-0">
            <h3 className="text-base font-bold text-[var(--text-primary)]">{title}</h3>
            <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto p-6">{children}</div>
      </div>
    </>
  )
}

// ─── EmptyState ───────────────────────────────────────────────────────────────

export function EmptyState({ icon, title, description, action }: {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      {icon && <div className="text-[var(--text-muted)] opacity-50">{icon}</div>}
      <div>
        <p className="text-sm font-semibold text-[var(--text-secondary)]">{title}</p>
        {description && <p className="mt-1 text-xs text-[var(--text-muted)]">{description}</p>}
      </div>
      {action}
    </div>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} />
}

export function SkeletonCard() {
  return (
    <Card className="p-5 space-y-3">
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-4/5" />
      <div className="flex gap-2 pt-1">
        <Skeleton className="h-6 w-16 rounded-full" />
        <Skeleton className="h-6 w-20 rounded-full" />
      </div>
    </Card>
  )
}

export function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 px-4 py-3 border-b border-[var(--border)]">
      <Skeleton className="h-8 w-8 rounded-full shrink-0" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-3.5 w-1/3" />
        <Skeleton className="h-3 w-1/2" />
      </div>
      <Skeleton className="h-6 w-16 rounded-full" />
    </div>
  )
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

const avatarColors = [
  'bg-[#2D4A2A] text-[#4ADE80]',
  'bg-[#1A2D4A] text-[#60A5FA]',
  'bg-[#4A2A1A] text-[#FBBF24]',
  'bg-[#3A1A4A] text-[#C084FC]',
  'bg-[#1A4A3A] text-[#34D399]',
  'bg-[#4A3A1A] text-[#FCA5A5]',
]

export function Avatar({ name, size = 'md', src }: { name: string; size?: 'sm' | 'md' | 'lg'; src?: string }) {
  const idx = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % avatarColors.length
  const sizeClass = size === 'sm' ? 'h-7 w-7 text-xs' : size === 'lg' ? 'h-10 w-10 text-base' : 'h-8 w-8 text-sm'
  const initials = name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()

  if (src) {
    return <img src={src} alt={name} className={`${sizeClass} rounded-full object-cover`} />
  }

  return (
    <div className={`${sizeClass} rounded-full flex items-center justify-center font-bold shrink-0 ${avatarColors[idx]}`}>
      {initials}
    </div>
  )
}

// ─── ProgressBar ─────────────────────────────────────────────────────────────

export function ProgressBar({ value, showLabel = false, className = '' }: {
  value: number
  showLabel?: boolean
  className?: string
}) {
  const pct = Math.max(0, Math.min(100, value))
  const color = pct >= 80 ? 'var(--success)' : pct >= 40 ? 'var(--accent)' : 'var(--warning)'

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="flex-1 h-1.5 rounded-full bg-[var(--border)] overflow-hidden">
        <div
          className="h-full rounded-full progress-bar-fill"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      {showLabel && <span className="text-xs font-semibold text-[var(--text-muted)] w-8 text-right">{pct}%</span>}
    </div>
  )
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

export function Tabs({ tabs, active, onChange }: {
  tabs: Array<{ key: string; label: string; count?: number }>
  active: string
  onChange: (key: string) => void
}) {
  return (
    <div className="flex gap-1 border-b border-[var(--border)] overflow-x-auto">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onChange(tab.key)}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap -mb-px ${
            active === tab.key
              ? 'border-[var(--accent)] text-[var(--accent)]'
              : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
          }`}
        >
          {tab.label}
          {tab.count !== undefined && (
            <span className={`rounded-full px-1.5 py-0.5 text-xs font-bold ${active === tab.key ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'bg-[var(--bg-card-hover)] text-[var(--text-muted)]'}`}>
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

// ─── Tooltip ─────────────────────────────────────────────────────────────────

export function Tooltip({ content, children }: { content: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  return (
    <div ref={ref} className="group relative inline-flex">
      {children}
      <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 opacity-0 group-hover:opacity-100 transition-opacity duration-150 whitespace-nowrap">
        <div className="rounded-[var(--radius-sm)] bg-[var(--bg-surface)] border border-[var(--border)] px-2.5 py-1.5 text-xs text-[var(--text-secondary)] shadow-lg">
          {content}
        </div>
      </div>
    </div>
  )
}

// ─── FilterChip ──────────────────────────────────────────────────────────────

export function FilterChip({ label, active, count, onClick, onRemove }: {
  label: string
  active?: boolean
  count?: number
  onClick?: () => void
  onRemove?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
        active
          ? 'bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)]/30'
          : 'bg-[var(--bg-card)] text-[var(--text-secondary)] border border-[var(--border)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]'
      }`}
    >
      {label}
      {count !== undefined && <span className="opacity-70">({count})</span>}
      {active && onRemove && (
        <span
          onClick={(e) => { e.stopPropagation(); onRemove() }}
          className="ml-0.5 hover:text-[var(--danger)] transition-colors"
        >
          ✕
        </span>
      )}
    </button>
  )
}
