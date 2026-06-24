'use client'
import React from 'react'

function getReducedMotion() {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function useReducedMotion() {
  const [reduced, setReduced] = React.useState(getReducedMotion)
  React.useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return reduced
}

interface SkeletonProps {
  width?: number | string
  height?: number | string
  borderRadius?: string
  style?: React.CSSProperties
}

export function Skeleton({ width = '100%', height = 16, borderRadius = 'var(--radius-sm)', style }: SkeletonProps) {
  const reduced = useReducedMotion()
  return (
    <span style={{
      display: 'block', width, height, borderRadius,
      background: reduced
        ? 'var(--color-border)'
        : 'linear-gradient(90deg, var(--color-border) 25%, var(--color-surface-2) 50%, var(--color-border) 75%)',
      backgroundSize: '400px 100%',
      animation: reduced ? 'none' : 'shimmer 1.4s ease-in-out infinite',
      ...style,
    }} />
  )
}

export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} width={i === lines - 1 ? '60%' : '100%'} height={14} />
      ))}
    </div>
  )
}
