'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/feedback/Toast'
import type { DrawerState, PriorityItem } from '../types'
import { formatRelativeDate } from '../utils'

const KIND_LABEL: Record<string, string> = {
  MEETING: 'Họp',
  IMPORT: 'Nhập việc',
  APPROVE: 'Duyệt',
  REMIND: 'Nhắc',
  COLLECT_FILE: 'Thu file',
  COLLECT_REPORT: 'Thu báo cáo',
}

const KIND_ICON: Record<string, string> = {
  MEETING: 'ti-microphone-2',
  IMPORT: 'ti-file-import',
  APPROVE: 'ti-stamp',
  REMIND: 'ti-bell-ringing',
  COLLECT_FILE: 'ti-file-alert',
  COLLECT_REPORT: 'ti-file-text',
}

const URGENCY_LABEL: Record<string, string> = {
  CRITICAL: 'Khẩn cấp',
  HIGH: 'Cao',
  MEDIUM: 'Trung bình',
  LOW: 'Thấp',
}

interface PriorityListProps {
  items: PriorityItem[]
  onOpenDrawer: (state: DrawerState) => void
}

export function PriorityList({ items, onOpenDrawer }: PriorityListProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [dismissed, setDismissed] = React.useState<Set<string>>(new Set())
  const visible = items.filter((item) => !dismissed.has(item.id))

  function drawerTypeForItem(item: PriorityItem): DrawerState['type'] {
    if (item.id.startsWith('approval-')) return 'approval'
    if (item.id.startsWith('meeting-')) return 'meeting'
    if (item.id.startsWith('ceo-')) return 'ceo'
    return 'task'
  }

  if (visible.length === 0) {
    return (
      <section aria-label="Việc ưu tiên hôm nay">
        <div style={emptyCardStyle}>
          <div style={{ textAlign: 'center' }}>
            <div style={emptyTitleStyle}>Không có việc nào trong bộ lọc này</div>
            <div style={emptyDescStyle}>Thay đổi bộ lọc để xem danh sách khác</div>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section aria-label="Việc ưu tiên hôm nay">
      <div style={shellStyle} data-vyvy-card="true">
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <span style={stepBadgeStyle}>1</span>
            <h2 style={titleStyle}>Việc ưu tiên hôm nay</h2>
            <span style={countBadgeStyle}>{visible.length}</span>
          </div>
          <div style={sortTextStyle}>Sắp theo mức ưu tiên</div>
        </div>

        <div>
          {visible.map((item) => (
            <PriorityRow
              key={item.id}
              item={item}
              onOpenDrawer={() => onOpenDrawer({ open: true, type: drawerTypeForItem(item), id: item.sourceId })}
              onDismiss={() => {
                setDismissed((current) => new Set([...current, item.id]))
                toast('Đã đánh dấu đã xem.', 'success')
              }}
              onRemind={() => router.push('/follow-ups')}
            />
          ))}
        </div>
      </div>
    </section>
  )
}

interface RowProps {
  item: PriorityItem
  onOpenDrawer: () => void
  onDismiss: () => void
  onRemind: () => void
}

function PriorityRow({ item, onOpenDrawer, onDismiss, onRemind }: RowProps) {
  const [hovered, setHovered] = React.useState(false)
  const statusColor =
    item.statusVariant === 'danger'
      ? 'var(--color-danger)'
      : item.statusVariant === 'warning'
        ? 'var(--color-warning)'
        : item.statusVariant === 'waiting'
          ? 'var(--color-waiting)'
          : 'var(--color-text-muted)'
  const urgencyDot =
    item.urgency === 'CRITICAL'
      ? '#B84040'
      : item.urgency === 'HIGH'
        ? '#C47B2B'
        : '#8C8278'
  const isCollect = item.kind === 'COLLECT_FILE' || item.kind === 'COLLECT_REPORT' || item.kind === 'REMIND'

  return (
    <div
      data-vyvy-row="true"
      data-vyvy-alert={item.urgency === 'CRITICAL' ? 'true' : undefined}
      style={{
        ...rowStyle,
        border: `1px solid ${hovered ? 'var(--color-border)' : 'transparent'}`,
        background: hovered ? 'var(--color-surface-2)' : 'transparent',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onOpenDrawer}
    >
      <div style={{ ...gripStyle, background: urgencyDot }} title={URGENCY_LABEL[item.urgency]} />

      <span style={statusChipStyle(statusColor, item.statusVariant)}>{item.statusLabel}</span>

      <span style={kindChipStyle}>
        <i className={`ti ${KIND_ICON[item.kind] ?? 'ti-circle'}`} style={{ fontSize: 11 }} aria-hidden="true" />
        {KIND_LABEL[item.kind] ?? item.kind}
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={rowTitleStyle}>{item.title}</div>
        {(item.projectName || item.personName) ? (
          <div style={rowMetaStyle}>{[item.projectName, item.personName].filter(Boolean).join(' · ')}</div>
        ) : null}
      </div>

      {item.deadline ? (
        <span style={{ ...deadlineStyle, color: statusColor }}>{formatRelativeDate(item.deadline)}</span>
      ) : null}

      <span style={{ ...nextActionStyle, display: hovered ? 'none' : 'block' }}>
        → {item.nextAction}
      </span>

      {hovered ? (
        <div style={quickActionsStyle} onClick={(event) => event.stopPropagation()}>
          <QuickBtn label="Xem" onClick={onOpenDrawer} />
          <QuickBtn label="Đã xem" onClick={onDismiss} muted />
          {isCollect ? <QuickBtn label="Nhắc" onClick={onRemind} accent /> : null}
        </div>
      ) : null}
    </div>
  )
}

function QuickBtn({
  label,
  onClick,
  muted,
  accent,
}: {
  label: string
  onClick: () => void
  muted?: boolean
  accent?: boolean
}) {
  return (
    <button
      onClick={onClick}
      data-vyvy-radar={accent ? 'true' : undefined}
      data-vyvy-confetti={muted ? 'true' : undefined}
      style={{
        ...quickButtonStyle,
        background: accent ? 'var(--color-lime)' : 'var(--color-surface)',
        color: muted ? 'var(--color-text-muted)' : accent ? 'var(--color-charcoal)' : 'var(--color-text)',
      }}
    >
      {label}
    </button>
  )
}

const emptyCardStyle: React.CSSProperties = {
  background: 'var(--color-surface)',
  borderRadius: 'var(--radius-xl)',
  border: '1px solid var(--color-border)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 120,
  padding: 'var(--space-8)',
}

const emptyTitleStyle: React.CSSProperties = {
  fontSize: 'var(--text-sm)',
  fontWeight: 700,
  color: 'var(--color-text)',
  marginBottom: 4,
}

const emptyDescStyle: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  color: 'var(--color-text-muted)',
}

const shellStyle: React.CSSProperties = {
  position: 'relative',
  background: 'linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0) 24%), var(--color-surface)',
  borderRadius: 'var(--radius-xl)',
  border: '1px solid var(--color-border)',
  boxShadow: '0 10px 28px rgba(0,0,0,0.16)',
  overflow: 'hidden',
}

const headerStyle: React.CSSProperties = {
  padding: 'var(--space-4) var(--space-5)',
  borderBottom: '1px solid var(--color-border)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
}

const stepBadgeStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 19,
  height: 19,
  borderRadius: 6,
  background: 'var(--color-surface-2)',
  color: 'var(--color-text-muted)',
  fontSize: 11,
  fontWeight: 700,
  marginRight: 4,
}

const titleStyle: React.CSSProperties = {
  fontFamily: 'var(--font-serif)',
  fontSize: 'var(--text-base)',
  fontWeight: 700,
  margin: 0,
}

const countBadgeStyle: React.CSSProperties = {
  background: 'var(--color-danger)',
  color: '#fff',
  fontSize: 11,
  fontWeight: 700,
  fontFamily: 'var(--font-mono)',
  borderRadius: 'var(--radius-full)',
  padding: '1px 7px',
  lineHeight: '18px',
}

const sortTextStyle: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  color: 'var(--color-text-muted)',
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '11px 13px',
  borderRadius: 10,
  transition: 'background var(--motion-fast) var(--ease-out)',
  cursor: 'pointer',
  margin: '0 4px 2px',
}

const gripStyle: React.CSSProperties = {
  width: 3,
  height: 30,
  borderRadius: 3,
  flexShrink: 0,
}

const statusChipStyle = (statusColor: string, variant: PriorityItem['statusVariant']): React.CSSProperties => ({
  fontSize: 11,
  fontWeight: 700,
  color: statusColor,
  background:
    variant === 'danger'
      ? 'rgba(184,64,64,0.10)'
      : variant === 'warning'
        ? 'rgba(196,123,43,0.10)'
        : variant === 'waiting'
          ? 'rgba(107,138,153,0.10)'
          : 'var(--color-surface-2)',
  border: `1px solid ${statusColor}`,
  borderRadius: 'var(--radius-sm)',
  padding: '1px 7px',
  whiteSpace: 'nowrap',
  flexShrink: 0,
  minWidth: 72,
  textAlign: 'center',
})

const kindChipStyle: React.CSSProperties = {
  fontSize: 10,
  color: 'var(--color-text-muted)',
  background: 'var(--color-surface-2)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)',
  padding: '2px 7px',
  whiteSpace: 'nowrap',
  flexShrink: 0,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
}

const rowTitleStyle: React.CSSProperties = {
  fontSize: 'var(--text-sm)',
  fontWeight: 500,
  color: 'var(--color-text)',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

const rowMetaStyle: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  color: 'var(--color-text-muted)',
  marginTop: 1,
}

const deadlineStyle: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  fontWeight: 600,
  whiteSpace: 'nowrap',
  flexShrink: 0,
}

const nextActionStyle: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  color: 'var(--color-text-muted)',
  whiteSpace: 'nowrap',
  flexShrink: 0,
}

const quickActionsStyle: React.CSSProperties = {
  display: 'flex',
  gap: 'var(--space-2)',
  flexShrink: 0,
}

const quickButtonStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  padding: '4px 10px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--color-border)',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}
