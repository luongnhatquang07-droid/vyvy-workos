'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import type { ChaseItem, Person } from '../types'
import { formatRelativeDate } from '../utils'
import { PanelShell, EmptyRow } from './FollowUpPanel'
import { HoverPreviewCard } from './HoverPreviewCard'

interface ChasePanelProps {
  items: ChaseItem[]
  people: Person[]
}

const AVATAR_COLORS = ['#B84040', '#6B8A99', '#C47B2B', '#4A8C5C', '#8C8278']
const RESPONSE_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  NO_RESPONSE: { label: 'Chưa phản hồi', color: 'var(--color-text-muted)', bg: 'var(--color-surface-2)' },
  PROMISED: { label: 'Đã hứa', color: 'var(--color-success)', bg: 'var(--color-success-bg)' },
  WAITING_RESPONSE: { label: 'Chờ phản hồi', color: 'var(--color-waiting)', bg: 'var(--color-waiting-bg)' },
  SENT: { label: 'Đã nhắc', color: 'var(--color-warning)', bg: 'var(--color-warning-bg)' },
}

export function ChasePanel({ items, people }: ChasePanelProps) {
  const router = useRouter()
  const byPerson = Object.fromEntries(people.map((person) => [person.id, person]))

  return (
    <PanelShell title="Cần dí hôm nay" count={items.length} accentColor="var(--color-danger)">
      {items.length === 0 ? (
        <EmptyRow text="Không có ai cần dí hôm nay." />
      ) : (
        <>
          <div style={{ padding: '4px 8px' }}>
            {items.map((item, index) => (
              <ChaseRow
                key={`${item.personId}-${item.owedItem}-${item.deadline ?? 'no-deadline'}-${index}`}
                item={item}
                person={byPerson[item.personId]}
                avatarBg={AVATAR_COLORS[index % AVATAR_COLORS.length]}
                onOpen={() => router.push('/follow-ups')}
              />
            ))}
          </div>
          <div style={{ padding: '6px 12px 12px' }}>
            <button
              onClick={() => router.push('/follow-ups')}
              data-vyvy-radar="true"
              style={batchButtonStyle}
            >
              ✉ Soạn nhắc hàng loạt
            </button>
          </div>
        </>
      )}
    </PanelShell>
  )
}

function ChaseRow({
  item,
  person,
  avatarBg,
  onOpen,
}: {
  item: ChaseItem
  person?: Person
  avatarBg: string
  onOpen: () => void
}) {
  const [hovered, setHovered] = React.useState(false)
  const [previewOpen, setPreviewOpen] = React.useState(false)
  const previewTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const response = RESPONSE_LABEL[item.response] ?? RESPONSE_LABEL.NO_RESPONSE

  function openHoverState() {
    setHovered(true)
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current)
    previewTimerRef.current = setTimeout(() => setPreviewOpen(true), 300)
  }

  function closeHoverState() {
    setHovered(false)
    setPreviewOpen(false)
    if (previewTimerRef.current) {
      clearTimeout(previewTimerRef.current)
      previewTimerRef.current = null
    }
  }

  React.useEffect(() => {
    return () => {
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current)
    }
  }, [])

  return (
    <div
      style={{
        ...rowStyle,
        background: hovered ? 'var(--color-surface-2)' : 'transparent',
      }}
      data-vyvy-row="true"
      data-vyvy-alert={item.remindCount >= 2 ? 'true' : undefined}
      onClick={onOpen}
      onMouseEnter={openHoverState}
      onMouseLeave={closeHoverState}
    >
      <div style={{ ...avatarStyle, background: avatarBg }}>{person?.avatarInitials ?? '?'}</div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={titleStyle}>
          {person?.name ?? 'Chưa gắn người'}
          <span style={owedItemStyle}> · {item.owedItem}</span>
        </div>
        <div style={metaRowStyle}>
          {item.remindCount >= 2 ? (
            <span style={{ ...miniBadgeStyle, background: 'var(--color-danger-bg)', color: 'var(--color-danger)' }}>
              Đã nhắc {item.remindCount} lần
            </span>
          ) : null}
          {item.suggestEscalate ? (
            <span style={{ ...miniBadgeStyle, background: 'var(--color-waiting-bg)', color: 'var(--color-waiting)' }}>
              ↗ Nên escalate
            </span>
          ) : null}
          {!item.suggestEscalate && item.remindCount > 0 ? (
            <span style={{ ...miniBadgeStyle, background: response.bg, color: response.color }}>
              {response.label}
            </span>
          ) : null}
        </div>
      </div>

      <span style={urgencyDotStyle(item.remindCount >= 2)} />

      {previewOpen ? (
        <HoverPreviewCard
          title={item.owedItem}
          ownerName={person?.name}
          deadlineLabel={item.deadline ? formatRelativeDate(item.deadline) : 'Chưa có deadline'}
          statusLabel={response.label}
          progressLabel="Theo tiến độ liên quan"
          evidenceLabel={item.deliverableType ? `Thiếu ${item.deliverableType}` : 'Cần kiểm tra phản hồi'}
          timingLabel={item.suggestEscalate ? 'Cần nhắc nhiều cấp' : item.deadline ? formatRelativeDate(item.deadline) : undefined}
          description={`Đã nhắc ${item.remindCount} lần. ${item.suggestEscalate ? 'Nên escalate nếu tiếp tục không phản hồi.' : 'Theo dõi phản hồi trong hôm nay.'}`}
        />
      ) : null}
    </div>
  )
}

const rowStyle: React.CSSProperties = {
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-3)',
  padding: '8px 9px',
  borderRadius: 'var(--radius-md)',
  cursor: 'pointer',
  transition: 'background var(--motion-fast) var(--ease-out)',
}

const avatarStyle: React.CSSProperties = {
  width: 30,
  height: 30,
  borderRadius: '50%',
  flexShrink: 0,
  color: '#fff',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 11,
  fontWeight: 700,
}

const titleStyle: React.CSSProperties = {
  fontSize: 'var(--text-sm)',
  fontWeight: 600,
  color: 'var(--color-text)',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

const owedItemStyle: React.CSSProperties = {
  color: 'var(--color-text-muted)',
  fontWeight: 400,
}

const metaRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 6,
  marginTop: 2,
  flexWrap: 'wrap',
  alignItems: 'center',
}

const miniBadgeStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  padding: '1px 6px',
  borderRadius: 'var(--radius-sm)',
}

const urgencyDotStyle = (danger: boolean): React.CSSProperties => ({
  width: 8,
  height: 8,
  borderRadius: '50%',
  flexShrink: 0,
  background: danger ? 'var(--color-danger)' : 'var(--color-warning)',
})

const batchButtonStyle: React.CSSProperties = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  padding: '8px 14px',
  borderRadius: 'var(--radius-md)',
  background: 'var(--color-lime)',
  color: 'var(--color-charcoal)',
  fontSize: 'var(--text-sm)',
  fontWeight: 600,
  border: 'none',
  cursor: 'pointer',
}
