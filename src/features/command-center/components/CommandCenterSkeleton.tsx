import React from 'react'
import { Skeleton } from '@/components/data-display/Skeleton'

export function CommandCenterSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 'var(--space-3)' }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} style={{
            background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--color-border)', padding: 'var(--space-4)',
          }}>
            <Skeleton height={24} width={40} style={{ marginBottom: 'var(--space-2)' }} />
            <Skeleton height={12} width="70%" />
          </div>
        ))}
      </div>

      {/* Filter chips */}
      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} height={30} width={90} borderRadius="var(--radius-full)" />
        ))}
      </div>

      {/* Priority list */}
      <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--color-border)', overflow: 'hidden' }}>
        <div style={{ padding: 'var(--space-4) var(--space-5)', borderBottom: '1px solid var(--color-border)' }}>
          <Skeleton height={16} width={200} />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} style={{ padding: 'var(--space-4) var(--space-5)', borderBottom: '1px solid var(--color-border)', display: 'flex', gap: 'var(--space-4)', alignItems: 'center' }}>
            <Skeleton height={12} width={60} borderRadius="var(--radius-full)" />
            <div style={{ flex: 1 }}>
              <Skeleton height={13} width="65%" style={{ marginBottom: 6 }} />
              <Skeleton height={11} width="40%" />
            </div>
            <Skeleton height={11} width={80} />
            <Skeleton height={28} width={90} borderRadius="var(--radius-md)" />
          </div>
        ))}
      </div>

      {/* Bottom grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{
            background: 'var(--color-surface)', borderRadius: 'var(--radius-xl)',
            border: '1px solid var(--color-border)', padding: 'var(--space-5)',
          }}>
            <Skeleton height={14} width={160} style={{ marginBottom: 'var(--space-4)' }} />
            {Array.from({ length: 3 }).map((_, j) => (
              <Skeleton key={j} height={12} width="90%" style={{ marginBottom: 'var(--space-3)' }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
