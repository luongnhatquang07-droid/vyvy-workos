'use client'
import React from 'react'
import type { PriorityItem, DrawerState } from '../types'
import { useToast } from '@/components/feedback/Toast'
import { formatRelativeDate } from '../utils'

const TYPE_LABEL: Record<string, string> = {
  task_overdue:       'Quá hạn',
  task_due_today:     'Hôm nay',
  meeting_no_tasks:   'Họp',
  deliverable_missing:'File thiếu',
  approval_urgent:    'Duyệt',
  ceo_escalation:     'CEO',
  reminder_pending:   'Chờ phản hồi',
}

const PRIORITY_LABEL: Record<string, string> = {
  critical: 'Khẩn cấp',
  high:     'Cao',
  medium:   'Trung bình',
  low:      'Thấp',
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

  const moduleTypeForDrawer = (item: PriorityItem): DrawerState['type'] => {
    if (item.type === 'reminder_pending') return 'reminder'
    if (item.type === 'meeting_no_tasks') return 'meeting'
    if (item.type === 'approval_urgent') return 'approval'
    if (item.type === 'ceo_escalation') return 'ceo'
    if (item.type === 'deliverable_missing') return 'deliverable'
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
              onOpenDrawer={() => onOpenDrawer({ open: true, type: moduleTypeForDrawer(item), id: item.sourceId })}
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
    : 'var(--color-text-muted)'

  const priorityDot = item.priority === 'critical' ? '#B84040'
    : item.priority === 'high' ? '#C47B2B'
    : '#8C8278'

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
      {/* Priority dot */}
      <span
        title={PRIORITY_LABEL[item.priority]}
        style={{
          width: 8, height: 8, borderRadius: '50%',
          background: priorityDot, flexShrink: 0,
        }}
      />

      {/* Type chip */}
      <span style={{
        fontSize: 11, fontWeight: 600, color: statusColor,
        background: item.statusVariant === 'danger' ? 'rgba(184,64,64,0.10)'
          : item.statusVariant === 'warning' ? 'rgba(196,123,43,0.10)'
          : 'var(--color-surface-2)',
        border: `1px solid ${statusColor}`,
        borderRadius: 'var(--radius-sm)',
        padding: '1px 7px',
        whiteSpace: 'nowrap', flexShrink: 0,
        minWidth: 72, textAlign: 'center',
      }}>
        {TYPE_LABEL[item.type] ?? item.type}
      </span>

      {/* Title + subtitle */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--color-text)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
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
      {item.dueDate && (
        <span style={{
          fontSize: 'var(--text-xs)', color: statusColor,
          fontWeight: item.statusVariant === 'danger' ? 600 : 400,
          whiteSpace: 'nowrap', flexShrink: 0,
        }}>
          {formatRelativeDate(item.dueDate)}
        </span>
      )}

      {/* Next action */}
      <span style={{
        fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)',
        whiteSpace: 'nowrap', flexShrink: 0,
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
          {(item.type === 'reminder_pending' || item.type === 'deliverable_missing') && (
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
        cursor: 'pointer', whiteSpace: 'nowrap',
        transition: 'filter var(--motion-fast) var(--ease-out)',
      }}
      onMouseEnter={e => (e.currentTarget as HTMLElement).style.filter = 'brightness(0.93)'}
      onMouseLeave={e => (e.currentTarget as HTMLElement).style.filter = 'none'}
    >
      {label}
    </button>
  )
}
