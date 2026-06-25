'use client'
import React from 'react'
import type { PriorityItem, DrawerState } from '../types'
import { useToast } from '@/components/feedback/Toast'
import { formatRelativeDate } from '../utils'

const KIND_LABEL: Record<string, string> = {
  MEETING:        'Họp',
  IMPORT:         'Nhập việc',
  APPROVE:        'Duyệt',
  REMIND:         'Nhắc',
  COLLECT_FILE:   'Thu file',
  COLLECT_REPORT: 'Thu BC',
}

const URGENCY_LABEL: Record<string, string> = {
  CRITICAL: 'Khẩn cấp',
  HIGH:     'Cao',
  MEDIUM:   'Trung bình',
  LOW:      'Thấp',
}

interface PriorityListProps {
  items: PriorityItem[]
  onOpenDrawer: (s: DrawerState) => void
}

export function PriorityList({ items, onOpenDrawer }: PriorityListProps) {
  const { toast } = useToast()
  const [dismissed, setDismissed] = React.useState<Set<string>>(new Set())

  const visible = items.filter(i => !dismissed.has(i.id))

  if (visible.length === 0) {
    return (
      <section aria-label="Việc ưu tiên hôm nay">
        <div style={{
          background: 'var(--color-surface)', borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--color-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          minHeight: 120, padding: 'var(--space-8)',
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text)', marginBottom: 4 }}>
              Không có việc cần xử lý
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
              Thay đổi bộ lọc để xem danh sách khác
            </div>
          </div>
        </div>
      </section>
    )
  }

  const drawerTypeForItem = (item: PriorityItem): DrawerState['type'] => {
    if (item.kind === 'APPROVE') return 'approval'
    if (item.kind === 'IMPORT' || item.kind === 'MEETING') return 'meeting'
    if (item.kind === 'COLLECT_FILE' || item.kind === 'COLLECT_REPORT') return 'deliverable'
    return 'task'
  }

  return (
    <section aria-label="Việc ưu tiên hôm nay">
      <div style={{
        background: 'var(--color-surface)', borderRadius: 'var(--radius-xl)',
        border: '1px solid var(--color-border)',
        boxShadow: 'var(--shadow-sm)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: 'var(--space-4) var(--space-5)',
          borderBottom: '1px solid var(--color-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 19, height: 19, borderRadius: 6,
              background: 'var(--color-surface-2)', color: 'var(--color-text-muted)',
              fontSize: 11, fontWeight: 700, marginRight: 4,
            }}>1</span>
            <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 'var(--text-base)', fontWeight: 700, margin: 0 }}>
              Việc ưu tiên hôm nay
            </h2>
            <span style={{
              background: 'var(--color-danger)', color: '#fff',
              fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)',
              borderRadius: 'var(--radius-full)', padding: '1px 7px', lineHeight: '18px',
            }}>{visible.length}</span>
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
            Sắp theo mức ưu tiên
          </div>
        </div>

        {/* Rows */}
        <div>
          {visible.map((item, idx) => (
            <PriorityRow
              key={item.id}
              item={item}
              isLast={idx === visible.length - 1}
              onOpenDrawer={() => onOpenDrawer({ open: true, type: drawerTypeForItem(item), id: item.sourceId })}
              onDismiss={() => {
                setDismissed(prev => new Set([...prev, item.id]))
                toast('Đã đánh dấu đã xem.', 'success')
              }}
              onRemind={() => toast('Đã ghi nhận nhắc việc — tính năng gửi nhắc sẽ có ở giai đoạn sau.', 'info')}
            />
          ))}
        </div>
      </div>
    </section>
  )
}

interface RowProps {
  item: PriorityItem
  isLast: boolean
  onOpenDrawer: () => void
  onDismiss: () => void
  onRemind: () => void
}

function PriorityRow({ item, isLast, onOpenDrawer, onDismiss, onRemind }: RowProps) {
  const [hovered, setHovered] = React.useState(false)

  const statusColor = item.statusVariant === 'danger' ? 'var(--color-danger)'
    : item.statusVariant === 'warning' ? 'var(--color-warning)'
    : item.statusVariant === 'waiting' ? 'var(--color-waiting)'
    : 'var(--color-text-muted)'

  const urgencyDot = item.urgency === 'CRITICAL' ? '#B84040'
    : item.urgency === 'HIGH' ? '#C47B2B'
    : '#8C8278'

  const isCollect = item.kind === 'COLLECT_FILE' || item.kind === 'COLLECT_REPORT' || item.kind === 'REMIND'

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 'var(--space-4)',
        padding: 'var(--space-3) var(--space-5)',
        borderBottom: isLast ? 'none' : '1px solid var(--color-border)',
        background: hovered ? 'var(--color-surface-2)' : 'transparent',
        transition: 'background var(--motion-fast) var(--ease-out)',
        cursor: 'pointer',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onOpenDrawer}
    >
      {/* Urgency dot */}
      <span
        title={URGENCY_LABEL[item.urgency]}
        style={{
          width: 8, height: 8, borderRadius: '50%',
          background: urgencyDot, flexShrink: 0,
        }}
      />

      {/* Status chip */}
      <span style={{
        fontSize: 11, fontWeight: 600, color: statusColor,
        background: item.statusVariant === 'danger' ? 'rgba(184,64,64,0.10)'
          : item.statusVariant === 'warning' ? 'rgba(196,123,43,0.10)'
          : item.statusVariant === 'waiting' ? 'rgba(107,138,153,0.10)'
          : 'var(--color-surface-2)',
        border: `1px solid ${statusColor}`,
        borderRadius: 'var(--radius-sm)',
        padding: '1px 7px',
        whiteSpace: 'nowrap' as const, flexShrink: 0,
        minWidth: 72, textAlign: 'center' as const,
      }}>
        {item.statusLabel}
      </span>

      {/* Kind chip */}
      <span style={{
        fontSize: 10, color: 'var(--color-text-muted)', background: 'var(--color-surface-2)',
        border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
        padding: '1px 6px', whiteSpace: 'nowrap' as const, flexShrink: 0,
      }}>
        {KIND_LABEL[item.kind] ?? item.kind}
      </span>

      {/* Title + subtitle */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--color-text)',
          whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {item.title}
        </div>
        {(item.projectName || item.personName) && (
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: 1 }}>
            {[item.projectName, item.personName].filter(Boolean).join(' · ')}
          </div>
        )}
      </div>

      {/* Deadline */}
      {item.deadline && (
        <span style={{
          fontSize: 'var(--text-xs)', color: statusColor,
          fontWeight: item.statusVariant === 'danger' ? 600 : 400,
          whiteSpace: 'nowrap' as const, flexShrink: 0,
        }}>
          {formatRelativeDate(item.deadline)}
        </span>
      )}

      {/* Next action */}
      <span style={{
        fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)',
        whiteSpace: 'nowrap' as const, flexShrink: 0,
        display: hovered ? 'none' : 'block',
      }}>
        → {item.nextAction}
      </span>

      {/* Quick actions on hover */}
      {hovered && (
        <div
          style={{ display: 'flex', gap: 'var(--space-2)', flexShrink: 0 }}
          onClick={e => e.stopPropagation()}
        >
          <QuickBtn label="Xem" onClick={onOpenDrawer} />
          <QuickBtn label="Đã xem" onClick={onDismiss} muted />
          {isCollect && (
            <QuickBtn label="Nhắc" onClick={onRemind} accent />
          )}
        </div>
      )}
    </div>
  )
}

function QuickBtn({ label, onClick, muted, accent }: {
  label: string; onClick: () => void; muted?: boolean; accent?: boolean
}) {
  return (
    <button
      onClick={onClick}
      style={{
        fontSize: 11, fontWeight: 500, padding: '4px 10px',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--color-border)',
        background: accent ? 'var(--color-lime)' : 'var(--color-surface)',
        color: muted ? 'var(--color-text-muted)' : accent ? 'var(--color-charcoal)' : 'var(--color-text)',
        cursor: 'pointer', whiteSpace: 'nowrap' as const,
        transition: 'filter var(--motion-fast) var(--ease-out)',
      }}
      onMouseEnter={e => (e.currentTarget as HTMLElement).style.filter = 'brightness(0.93)'}
      onMouseLeave={e => (e.currentTarget as HTMLElement).style.filter = 'none'}
    >
      {label}
    </button>
  )
}
