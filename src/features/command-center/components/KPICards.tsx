'use client'
import React from 'react'
import type { KPIData, FilterView } from '../types'

interface KPICardProps {
  value: number
  label: string
  description: string
  accent?: 'danger' | 'warning' | 'default' | 'lime'
  filterTarget?: FilterView
  onFilter?: (v: FilterView) => void
}

function KPICard({ value, label, description, accent = 'default', filterTarget, onFilter }: KPICardProps) {
  const accentColor = {
    danger:  'var(--color-danger)',
    warning: 'var(--color-warning)',
    lime:    'var(--color-lime)',
    default: 'var(--color-text-muted)',
  }[accent]

  const clickable = !!onFilter && !!filterTarget && value > 0

  return (
    <div
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-label={clickable ? `Xem ${label}` : undefined}
      onClick={() => clickable && onFilter!(filterTarget!)}
      onKeyDown={e => { if (clickable && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onFilter!(filterTarget!) } }}
      style={{
        background: 'var(--color-surface)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--color-border)',
        padding: 'var(--space-4)',
        cursor: clickable ? 'pointer' : 'default',
        transition: 'box-shadow var(--motion-fast) var(--ease-out), border-color var(--motion-fast) var(--ease-out)',
        boxShadow: 'var(--shadow-sm)',
      }}
      onMouseEnter={e => {
        if (clickable) {
          const el = e.currentTarget as HTMLElement
          el.style.boxShadow = 'var(--shadow-md)'
          el.style.borderColor = 'rgba(25,25,25,0.22)'
        }
      }}
      onMouseLeave={e => {
        if (clickable) {
          const el = e.currentTarget as HTMLElement
          el.style.boxShadow = 'var(--shadow-sm)'
          el.style.borderColor = 'var(--color-border)'
        }
      }}
    >
      <div style={{
        fontSize: 26,
        fontWeight: 700,
        lineHeight: 1,
        color: value > 0 ? accentColor : 'var(--color-text-muted)',
        fontFamily: 'var(--font-mono)',
        marginBottom: 'var(--space-2)',
      }}>
        {value}
      </div>
      <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text)', marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', lineHeight: 1.4 }}>
        {description}
      </div>
      {clickable && (
        <div style={{ marginTop: 'var(--space-3)', fontSize: 'var(--text-xs)', color: accentColor, fontWeight: 500 }}>
          Xem chi tiết →
        </div>
      )}
    </div>
  )
}

interface KPICardsProps {
  kpi: KPIData
  onFilter: (v: FilterView) => void
}

export function KPICards({ kpi, onFilter }: KPICardsProps) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(6, 1fr)',
      gap: 'var(--space-3)',
    }}>
      <KPICard
        value={kpi.meetingsToday}
        label="Họp hôm nay"
        description="Cuộc họp cần xử lý hôm nay"
        accent="default"
        filterTarget="today"
        onFilter={onFilter}
      />
      <KPICard
        value={kpi.unimportedDrafts}
        label="Draft chưa nhập"
        description="Đầu việc từ họp chưa import"
        accent="warning"
        filterTarget="today"
        onFilter={onFilter}
      />
      <KPICard
        value={kpi.pendingDeliverable}
        label="Nợ file/báo cáo"
        description="Người đang thiếu đầu ra"
        accent="warning"
        filterTarget="waiting"
        onFilter={onFilter}
      />
      <KPICard
        value={kpi.overdueItems}
        label="Quá hạn"
        description="Việc/file đã trễ deadline"
        accent="danger"
        filterTarget="overdue"
        onFilter={onFilter}
      />
      <KPICard
        value={kpi.pendingApprovals}
        label="Chờ duyệt"
        description="Yêu cầu đang chờ phê duyệt"
        accent="warning"
        filterTarget="pending_approval"
        onFilter={onFilter}
      />
      <KPICard
        value={kpi.ceoItems}
        label="Cần báo CEO"
        description="Vấn đề cần escalate lên CEO"
        accent="danger"
        filterTarget="ceo_report"
        onFilter={onFilter}
      />
    </div>
  )
}
