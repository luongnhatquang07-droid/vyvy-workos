'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import type { ChaseItem, Person } from '../types'
import { formatRelativeDate, getVietnamDateKey } from '../utils'
import { PanelShell, EmptyRow } from './FollowUpPanel'
import { HoverPreviewCard } from './HoverPreviewCard'

interface ChasePanelProps {
  items: ChaseItem[]
  people: Person[]
}

type ChaseFilter = 'today' | 'upcoming' | 'no_deadline' | 'all'

interface ChaseGroup {
  personId: string
  person?: Person
  items: ChaseItem[]
  overdueCount: number
  todayCount: number
  missingFileCount: number
  maxRemindCount: number
  hasEscalation: boolean
}

const AVATAR_COLORS = ['#B84040', '#6B8A99', '#C47B2B', '#4A8C5C', '#8C8278']
const RESPONSE_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  NO_RESPONSE: { label: 'Chưa phản hồi', color: 'var(--color-text-muted)', bg: 'var(--color-surface-2)' },
  PROMISED: { label: 'Đã hứa', color: 'var(--color-success)', bg: 'var(--color-success-bg)' },
  WAITING_RESPONSE: { label: 'Chờ phản hồi', color: 'var(--color-waiting)', bg: 'var(--color-waiting-bg)' },
  SENT: { label: 'Đã nhắc', color: 'var(--color-warning)', bg: 'var(--color-warning-bg)' },
  NOT_REMINDED: { label: 'Chưa nhắc', color: 'var(--color-text-muted)', bg: 'var(--color-surface-2)' },
  SEEN: { label: 'Đã xem', color: 'var(--color-text-muted)', bg: 'var(--color-surface-2)' },
  ESCALATED: { label: 'Đã escalate', color: 'var(--color-waiting)', bg: 'var(--color-waiting-bg)' },
}

export function ChasePanel({ items, people }: ChasePanelProps) {
  const router = useRouter()
  const today = getVietnamDateKey()
  const [activeFilter, setActiveFilter] = React.useState<ChaseFilter>('today')
  const [expandedPeople, setExpandedPeople] = React.useState<Set<string>>(() => new Set())
  const byPerson = React.useMemo<Record<string, Person>>(
    () => Object.fromEntries(people.map((person) => [person.id, person])),
    [people],
  )
  const counts = React.useMemo(
    () => ({
      today: items.filter((item) => isDueTodayOrOverdue(item, today)).length,
      upcoming: items.filter((item) => isUpcoming(item, today)).length,
      no_deadline: items.filter(isNoDeadline).length,
      all: items.length,
    }),
    [items, today],
  )
  const filteredItems = React.useMemo(() => {
    if (activeFilter === 'today') return items.filter((item) => isDueTodayOrOverdue(item, today))
    if (activeFilter === 'upcoming') return items.filter((item) => isUpcoming(item, today))
    if (activeFilter === 'no_deadline') return items.filter(isNoDeadline)
    return items
  }, [activeFilter, items, today])
  const groups = React.useMemo(() => groupChaseItems(filteredItems, byPerson, today), [byPerson, filteredItems, today])

  function togglePerson(personId: string) {
    setExpandedPeople((current) => {
      const next = new Set(current)
      if (next.has(personId)) next.delete(personId)
      else next.add(personId)
      return next
    })
  }

  return (
    <PanelShell title={chasePanelTitle(activeFilter)} count={counts[activeFilter]} accentColor="var(--color-danger)">
      {items.length === 0 ? (
        <EmptyRow text="Không có ai cần dí hôm nay." />
      ) : (
        <>
          <div style={filterBarStyle} aria-label="Lọc việc cần dí">
            <FilterChip active={activeFilter === 'today'} label="Hôm nay + quá hạn" count={counts.today} onClick={() => setActiveFilter('today')} />
            <FilterChip active={activeFilter === 'upcoming'} label="Sắp tới 7 ngày" count={counts.upcoming} onClick={() => setActiveFilter('upcoming')} />
            <FilterChip active={activeFilter === 'no_deadline'} label="Chưa có deadline" count={counts.no_deadline} onClick={() => setActiveFilter('no_deadline')} />
            <FilterChip active={activeFilter === 'all'} label="Tất cả" count={counts.all} onClick={() => setActiveFilter('all')} />
          </div>
          {groups.length === 0 ? (
            <EmptyRow text={emptyTextForFilter(activeFilter)} />
          ) : (
            <div style={{ padding: '4px 8px 2px' }}>
              <div style={groupSummaryStyle}>
                {groups.length} người · {filteredItems.length} việc
              </div>
              {groups.map((group, index) => {
                const isExpanded = expandedPeople.has(group.personId)
                return (
                  <div key={group.personId} style={groupCardStyle} data-vyvy-chase-group="true">
                    <button type="button" style={groupHeaderStyle} onClick={() => togglePerson(group.personId)}>
                      <div style={{ ...avatarStyle, background: AVATAR_COLORS[index % AVATAR_COLORS.length] }}>
                        {group.person?.avatarInitials ?? '?'}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={groupTitleStyle}>
                          <span>{group.person?.name ?? 'Chưa gắn người'}</span>
                          <span style={groupCountStyle}>{group.items.length} việc</span>
                        </div>
                        <div style={metaRowStyle}>
                          {group.overdueCount > 0 ? (
                            <span style={{ ...miniBadgeStyle, background: 'var(--color-danger-bg)', color: 'var(--color-danger)' }}>
                              {group.overdueCount} quá hạn
                            </span>
                          ) : null}
                          {group.todayCount > 0 ? (
                            <span style={{ ...miniBadgeStyle, background: 'var(--color-warning-bg)', color: 'var(--color-warning)' }}>
                              {group.todayCount} hôm nay
                            </span>
                          ) : null}
                          {group.missingFileCount > 0 ? (
                            <span style={{ ...miniBadgeStyle, background: 'var(--color-surface-3)', color: 'var(--color-text-soft)' }}>
                              {group.missingFileCount} thiếu file
                            </span>
                          ) : null}
                          {group.hasEscalation ? (
                            <span style={{ ...miniBadgeStyle, background: 'var(--color-waiting-bg)', color: 'var(--color-waiting)' }}>
                              cần escalate
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <span style={chevronStyle}>{isExpanded ? '▾' : '▸'}</span>
                    </button>
                    {isExpanded ? (
                      <div style={groupItemsStyle}>
                        {group.items.map((item, itemIndex) => (
                          <ChaseRow
                            key={`${item.personId}-${item.owedItem}-${item.deadline ?? 'no-deadline'}-${itemIndex}`}
                            item={item}
                            person={group.person}
                            nested
                            avatarBg={AVATAR_COLORS[index % AVATAR_COLORS.length]}
                            onOpen={() => router.push('/follow-ups')}
                          />
                        ))}
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          )}
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
  nested = false,
  onOpen,
}: {
  item: ChaseItem
  person?: Person
  avatarBg: string
  nested?: boolean
  onOpen: () => void
}) {
  const [hovered, setHovered] = React.useState(false)
  const [previewOpen, setPreviewOpen] = React.useState(false)
  const [previewAnchor, setPreviewAnchor] = React.useState<HTMLElement | null>(null)
  const previewTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const response = RESPONSE_LABEL[item.response] ?? RESPONSE_LABEL.NO_RESPONSE

  function openHoverState(event: React.MouseEvent<HTMLDivElement> | React.PointerEvent<HTMLDivElement> | React.FocusEvent<HTMLDivElement>) {
    setHovered(true)
    setPreviewAnchor(event.currentTarget)
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current)
    previewTimerRef.current = setTimeout(() => setPreviewOpen(true), 300)
  }

  function closeHoverState() {
    setHovered(false)
    setPreviewOpen(false)
    setPreviewAnchor(null)
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
        paddingLeft: nested ? 10 : rowStyle.padding,
        background: hovered ? 'var(--color-surface-2)' : 'transparent',
      }}
      data-vyvy-row="true"
      data-vyvy-alert={item.remindCount >= 2 ? 'true' : undefined}
      tabIndex={0}
      onClick={onOpen}
      onMouseEnter={openHoverState}
      onMouseMove={openHoverState}
      onMouseLeave={closeHoverState}
      onPointerEnter={openHoverState}
      onPointerMove={openHoverState}
      onPointerLeave={closeHoverState}
      onFocus={openHoverState}
      onBlur={closeHoverState}
    >
      {nested ? <span style={nestedDotStyle(item.remindCount >= 2)} /> : <div style={{ ...avatarStyle, background: avatarBg }}>{person?.avatarInitials ?? '?'}</div>}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={titleStyle}>
          {nested ? item.owedItem : person?.name ?? 'Chưa gắn người'}
          {!nested ? <span style={owedItemStyle}> · {item.owedItem}</span> : null}
        </div>
        <div style={metaRowStyle}>
          {item.deadline ? (
            <span style={{ ...miniBadgeStyle, background: deadlineBadgeBg(item), color: deadlineBadgeColor(item) }}>
              {formatRelativeDate(item.deadline)}
            </span>
          ) : null}
          {item.deliverableType ? (
            <span style={{ ...miniBadgeStyle, background: 'var(--color-surface-3)', color: 'var(--color-text-soft)' }}>
              Thiếu {item.deliverableType}
            </span>
          ) : null}
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

      <div style={rowActionStyle}>
        <button
          type="button"
          style={smallActionButtonStyle}
          onClick={(event) => {
            event.stopPropagation()
            onOpen()
          }}
        >
          Xem
        </button>
        <button
          type="button"
          style={{ ...smallActionButtonStyle, background: 'var(--color-lime)', color: 'var(--color-charcoal)' }}
          onClick={(event) => {
            event.stopPropagation()
            onOpen()
          }}
        >
          Nhắc ngay
        </button>
      </div>

      {previewOpen ? (
        <HoverPreviewCard
          anchorElement={previewAnchor}
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

function isDueTodayOrOverdue(item: ChaseItem, today: string): boolean {
  return Boolean(item.deadline && item.deadline <= today)
}

function isUpcoming(item: ChaseItem, today: string): boolean {
  return Boolean(item.deadline && item.deadline > today && item.deadline <= addDaysToDateKey(today, 7))
}

function isNoDeadline(item: ChaseItem): boolean {
  return !item.deadline
}

function groupChaseItems(items: ChaseItem[], byPerson: Record<string, Person>, today: string): ChaseGroup[] {
  const groups = new Map<string, ChaseGroup>()
  items.forEach((item) => {
    const group = groups.get(item.personId) ?? {
      personId: item.personId,
      person: byPerson[item.personId],
      items: [],
      overdueCount: 0,
      todayCount: 0,
      missingFileCount: 0,
      maxRemindCount: 0,
      hasEscalation: false,
    }
    group.items.push(item)
    if (item.deadline && item.deadline < today) group.overdueCount += 1
    if (item.deadline === today) group.todayCount += 1
    if (item.deliverableType) group.missingFileCount += 1
    group.maxRemindCount = Math.max(group.maxRemindCount, item.remindCount)
    group.hasEscalation = group.hasEscalation || item.suggestEscalate
    groups.set(item.personId, group)
  })

  return Array.from(groups.values()).sort((a, b) => {
    if (b.overdueCount !== a.overdueCount) return b.overdueCount - a.overdueCount
    if (b.todayCount !== a.todayCount) return b.todayCount - a.todayCount
    if (b.hasEscalation !== a.hasEscalation) return Number(b.hasEscalation) - Number(a.hasEscalation)
    if (b.items.length !== a.items.length) return b.items.length - a.items.length
    return (a.person?.name ?? '').localeCompare(b.person?.name ?? '', 'vi')
  })
}

function chasePanelTitle(filter: ChaseFilter): string {
  if (filter === 'today') return 'Cần dí hôm nay + quá hạn'
  if (filter === 'upcoming') return 'Cần dí sắp tới 7 ngày'
  if (filter === 'no_deadline') return 'Chưa có deadline'
  return 'Tất cả follow-up đang mở'
}

function emptyTextForFilter(filter: ChaseFilter): string {
  if (filter === 'upcoming') return 'Chưa có việc cần dí trong 7 ngày tới.'
  if (filter === 'no_deadline') return 'Không có mục nào thiếu deadline.'
  if (filter === 'today') return 'Không có mục nào tới hạn hoặc quá hạn cần dí.'
  return 'Không có việc cần dí trong nhóm này.'
}

function addDaysToDateKey(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00`)
  date.setDate(date.getDate() + days)
  return getVietnamDateKey(date)
}

function deadlineBadgeBg(item: ChaseItem): string {
  if (!item.deadline) return 'var(--color-surface-2)'
  const today = getVietnamDateKey()
  if (item.deadline < today) return 'var(--color-danger-bg)'
  if (item.deadline === today) return 'var(--color-warning-bg)'
  return 'var(--color-surface-2)'
}

function deadlineBadgeColor(item: ChaseItem): string {
  if (!item.deadline) return 'var(--color-text-muted)'
  const today = getVietnamDateKey()
  if (item.deadline < today) return 'var(--color-danger)'
  if (item.deadline === today) return 'var(--color-warning)'
  return 'var(--color-text-muted)'
}

function FilterChip({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean
  label: string
  count: number
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...filterChipStyle,
        borderColor: active ? 'var(--color-lime)' : 'var(--color-border)',
        background: active ? 'rgba(218, 223, 33, 0.12)' : 'var(--color-surface-2)',
        color: active ? 'var(--color-text)' : 'var(--color-text-muted)',
      }}
    >
      {label}
      <span style={filterCountStyle}>{count}</span>
    </button>
  )
}

const filterBarStyle: React.CSSProperties = {
  display: 'flex',
  gap: 6,
  padding: '10px 10px 4px',
  overflowX: 'auto',
}

const filterChipStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  border: '1px solid var(--color-border)',
  borderRadius: '999px',
  padding: '5px 8px',
  fontSize: 11,
  fontWeight: 700,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

const filterCountStyle: React.CSSProperties = {
  minWidth: 18,
  height: 18,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '999px',
  background: 'rgba(255,255,255,0.08)',
  color: 'inherit',
  fontSize: 10,
}

const groupSummaryStyle: React.CSSProperties = {
  padding: '2px 4px 8px',
  fontSize: 11,
  color: 'var(--color-text-muted)',
}

const groupCardStyle: React.CSSProperties = {
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-md)',
  background: 'rgba(255,255,255,0.02)',
  marginBottom: 8,
  overflow: 'visible',
}

const groupHeaderStyle: React.CSSProperties = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-3)',
  padding: '9px 10px',
  border: 'none',
  background: 'transparent',
  color: 'inherit',
  textAlign: 'left',
  cursor: 'pointer',
}

const groupTitleStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  minWidth: 0,
  fontSize: 'var(--text-sm)',
  fontWeight: 700,
  color: 'var(--color-text)',
}

const groupCountStyle: React.CSSProperties = {
  flexShrink: 0,
  fontSize: 11,
  color: 'var(--color-text-muted)',
  fontWeight: 600,
}

const chevronStyle: React.CSSProperties = {
  color: 'var(--color-text-muted)',
  fontSize: 13,
  width: 16,
  textAlign: 'center',
}

const groupItemsStyle: React.CSSProperties = {
  padding: '0 6px 7px 38px',
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

const nestedDotStyle = (danger: boolean): React.CSSProperties => ({
  width: 8,
  height: 8,
  borderRadius: '50%',
  flexShrink: 0,
  background: danger ? 'var(--color-danger)' : 'var(--color-warning)',
})

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

const rowActionStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  flexShrink: 0,
}

const smallActionButtonStyle: React.CSSProperties = {
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--color-surface-2)',
  color: 'var(--color-text-soft)',
  fontSize: 10,
  fontWeight: 700,
  padding: '4px 7px',
  cursor: 'pointer',
}

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
