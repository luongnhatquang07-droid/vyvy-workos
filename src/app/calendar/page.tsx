'use client'

import React from 'react'
import { DataErrorState } from '@/components/ui/DataErrorState'
import { PageHead } from '@/components/ui/PageHead'
import { getVietnamDateKey } from '@/features/command-center/utils'
import { useCommandData } from '@/hooks/useCommandData'

const WEEKDAYS_VI = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']
const MONTHS_VI = [
  'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
  'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12',
]

type ViewMode = 'day' | 'week' | 'month' | 'gantt'
type Category = 'meeting' | 'deadline' | 'step' | 'deliverable' | 'approval' | 'followup' | 'report'

interface CalEvent {
  id: string
  dateKey: string // YYYY-MM-DD
  label: string
  category: Category
  time?: string
}

const CATEGORY_META: Record<Category, { label: string; color: string; bg: string; prefix?: string }> = {
  meeting:  { label: 'Họp',              color: 'var(--color-waiting)', bg: 'var(--color-waiting-bg)' },
  deadline: { label: 'Deadline',         color: 'var(--color-danger)',  bg: 'var(--color-danger-bg)',  prefix: '⏰ ' },
  step:     { label: 'Bước',             color: 'var(--color-olive)',   bg: 'rgba(45,51,26,0.12)' },
  deliverable: { label: 'Bàn giao',      color: '#6B8A99',              bg: 'rgba(107,138,153,0.16)' },
  approval: { label: 'Milestone/Duyệt',  color: '#8B7BB8',              bg: 'rgba(139,123,184,0.16)',  prefix: '◆ ' },
  followup: { label: 'Nhắc việc',        color: 'var(--color-warning)', bg: 'var(--color-warning-bg)' },
  report:   { label: 'Báo cáo',          color: 'var(--color-warning)', bg: 'var(--color-warning-bg)' },
}

function toKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function timeOf(value: string) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return undefined
  const hh = d.getHours()
  const mm = d.getMinutes()
  if (hh === 0 && mm === 0) return undefined
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

export default function CalendarPage() {
  const { data, loading, error } = useCommandData()
  const [viewDate, setViewDate] = React.useState(() => new Date())
  const [mode, setMode] = React.useState<ViewMode>('month')

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const todayKey = getVietnamDateKey()

  const events = React.useMemo<CalEvent[]>(() => {
    const out: CalEvent[] = []
    for (const m of data?.meetings ?? []) {
      if (!m.start_at) continue
      out.push({ id: `m-${m.id}`, dateKey: toKey(new Date(m.start_at)), label: m.title, category: 'meeting', time: timeOf(m.start_at) })
    }
    for (const t of data?.tasks ?? []) {
      if (!t.due_date) continue
      out.push({ id: `t-${t.id}`, dateKey: t.due_date.slice(0, 10), label: t.title, category: 'deadline' })
    }
    for (const s of data?.taskSteps ?? []) {
      if (!s.due_date) continue
      out.push({ id: `s-${s.id}`, dateKey: s.due_date.slice(0, 10), label: s.title, category: 'step' })
    }
    for (const d of data?.deliverables ?? []) {
      if (!d.due_date) continue
      out.push({ id: `d-${d.id}`, dateKey: d.due_date.slice(0, 10), label: d.name, category: 'deliverable' })
    }
    for (const a of data?.approvals ?? []) {
      if (!a.due_at) continue
      out.push({ id: `a-${a.id}`, dateKey: a.due_at.slice(0, 10), label: 'Duyệt mục chờ xử lý', category: 'approval' })
    }
    for (const r of data?.reminders ?? []) {
      if (!r.next_follow_up_at) continue
      out.push({ id: `r-${r.id}`, dateKey: r.next_follow_up_at.slice(0, 10), label: 'Follow-up nhắc việc', category: 'followup', time: timeOf(r.next_follow_up_at) })
    }
    for (const c of data?.ceoRequests ?? []) {
      if (!c.decision_due_at) continue
      out.push({ id: `c-${c.id}`, dateKey: c.decision_due_at.slice(0, 10), label: c.title, category: 'report' })
    }
    return out.sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.label.localeCompare(b.label))
  }, [data?.meetings, data?.tasks, data?.taskSteps, data?.deliverables, data?.approvals, data?.reminders, data?.ceoRequests])

  const eventsByKey = React.useMemo(() => {
    const map: Record<string, CalEvent[]> = {}
    for (const e of events) (map[e.dateKey] ??= []).push(e)
    return map
  }, [events])

  function shift(delta: number) {
    if (mode === 'day') setViewDate(new Date(year, month, viewDate.getDate() + delta))
    else if (mode === 'week') setViewDate(new Date(year, month, viewDate.getDate() + delta * 7))
    else setViewDate(new Date(year, month + delta, 1))
  }

  const headerLabel =
    mode === 'day'
      ? viewDate.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
      : `${MONTHS_VI[month]}, ${year}`

  return (
    <div style={pageStyle}>
      <PageHead
        icon="ti-calendar-month"
        title="Lịch"
        desc="Lịch hợp nhất: họp, deadline, milestone, follow-up, báo cáo, phê duyệt · Asia/Ho_Chi_Minh."
      />

      {error ? <DataErrorState message={error} /> : null}

      <section style={shellStyle} data-vyvy-card="true">
        <div style={toolbarStyle}>
          <div style={navGroup}>
            <button onClick={() => shift(-1)} aria-label="Trước" style={navArrow} data-vyvy-radar="true">
              <i className="ti ti-chevron-left" />
            </button>
            <button onClick={() => setViewDate(new Date())} style={navLabelButton} title="Về hôm nay">
              {headerLabel}
            </button>
            <button onClick={() => shift(1)} aria-label="Sau" style={navArrow} data-vyvy-radar="true">
              <i className="ti ti-chevron-right" />
            </button>
          </div>

          <div style={toggleGroup}>
            {([
              ['day', 'Ngày'],
              ['week', 'Tuần'],
              ['month', 'Tháng'],
              ['gantt', 'Gantt'],
            ] as Array<[ViewMode, string]>).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setMode(value)}
                style={toggleChip(mode === value)}
              >
                {value === 'gantt' ? <i className="ti ti-timeline-event" style={{ marginRight: 5 }} /> : null}
                {label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div style={emptyState}>Đang tải lịch...</div>
        ) : mode === 'month' ? (
          <MonthView year={year} month={month} todayKey={todayKey} eventsByKey={eventsByKey} />
        ) : mode === 'week' ? (
          <WeekView viewDate={viewDate} todayKey={todayKey} eventsByKey={eventsByKey} />
        ) : mode === 'day' ? (
          <DayView viewDate={viewDate} eventsByKey={eventsByKey} />
        ) : (
          <GanttView year={year} month={month} events={events} todayKey={todayKey} />
        )}

        <div style={legendBar}>
          {(Object.keys(CATEGORY_META) as Category[]).map((cat) => (
            <span key={cat} style={legendItem}>
              <span style={{ ...legendDot, background: CATEGORY_META[cat].color }} />
              {CATEGORY_META[cat].label}
            </span>
          ))}
          <span style={{ ...legendItem, marginLeft: 'auto', color: 'var(--color-text-muted)' }}>
            Timezone: Asia/Ho_Chi_Minh
          </span>
        </div>
      </section>
    </div>
  )
}

function EventPill({ event }: { event: CalEvent }) {
  const meta = CATEGORY_META[event.category]
  return (
    <div style={{ ...eventPill, background: meta.bg, color: meta.color }} title={event.label}>
      {event.time ? <span style={{ fontWeight: 700, marginRight: 4 }}>{event.time}</span> : null}
      {meta.prefix ?? ''}{event.label}
    </div>
  )
}

function MonthView({
  year, month, todayKey, eventsByKey,
}: { year: number; month: number; todayKey: string; eventsByKey: Record<string, CalEvent[]> }) {
  const first = new Date(year, month, 1)
  const leading = (first.getDay() + 6) % 7 // Monday-first
  const gridStart = new Date(year, month, 1 - leading)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const totalCells = Math.ceil((leading + daysInMonth) / 7) * 7

  const cells = Array.from({ length: totalCells }, (_, i) => {
    const d = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i)
    return { date: d, key: toKey(d), inMonth: d.getMonth() === month }
  })

  return (
    <div style={{ padding: 14 }}>
      <div style={weekHeaderGrid}>
        {WEEKDAYS_VI.map((d, i) => (
          <div key={d} style={{ ...weekHeadCell, ...(i >= 5 ? { color: 'var(--color-text-muted)', opacity: 0.7 } : {}) }}>
            {d}
          </div>
        ))}
      </div>
      <div style={monthGrid}>
        {cells.map(({ date, key, inMonth }) => {
          const isToday = key === todayKey
          const dayEvents = eventsByKey[key] ?? []
          return (
            <div key={key} style={monthCell(isToday, inMonth)} data-vyvy-row="true">
              <div style={cellNum(isToday)}>
                {date.getDate()}{isToday ? ' · Hôm nay' : ''}
              </div>
              {dayEvents.slice(0, 3).map((e) => <EventPill key={e.id} event={e} />)}
              {dayEvents.length > 3 ? (
                <div style={moreLabel}>+{dayEvents.length - 3} nữa</div>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function WeekView({
  viewDate, todayKey, eventsByKey,
}: { viewDate: Date; todayKey: string; eventsByKey: Record<string, CalEvent[]> }) {
  const leading = (viewDate.getDay() + 6) % 7
  const weekStart = new Date(viewDate.getFullYear(), viewDate.getMonth(), viewDate.getDate() - leading)
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i)
    return { date: d, key: toKey(d) }
  })

  return (
    <div style={{ padding: 14 }}>
      <div style={weekHeaderGrid}>
        {days.map(({ date }, i) => (
          <div key={i} style={{ ...weekHeadCell, ...(i >= 5 ? { color: 'var(--color-text-muted)', opacity: 0.7 } : {}) }}>
            {WEEKDAYS_VI[i]} · {date.getDate()}
          </div>
        ))}
      </div>
      <div style={{ ...monthGrid, gridAutoRows: 'minmax(260px, auto)' }}>
        {days.map(({ key }) => {
          const isToday = key === todayKey
          const dayEvents = eventsByKey[key] ?? []
          return (
            <div key={key} style={monthCell(isToday, true)} data-vyvy-row="true">
              {dayEvents.map((e) => <EventPill key={e.id} event={e} />)}
              {dayEvents.length === 0 ? <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>—</span> : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DayView({ viewDate, eventsByKey }: { viewDate: Date; eventsByKey: Record<string, CalEvent[]> }) {
  const key = toKey(viewDate)
  const dayEvents = eventsByKey[key] ?? []
  return (
    <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {dayEvents.length === 0 ? (
        <div style={emptyState}>Không có mục nào trong ngày này.</div>
      ) : (
        dayEvents.map((e) => (
          <div key={e.id} style={dayRow} data-vyvy-row="true">
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)', width: 52, flexShrink: 0 }}>
              {e.time ?? 'Cả ngày'}
            </span>
            <EventPill event={e} />
          </div>
        ))
      )}
    </div>
  )
}

function GanttView({
  year, month, events, todayKey,
}: { year: number; month: number; events: CalEvent[]; todayKey: string }) {
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const monthEvents = events.filter((e) => {
    const [y, m] = e.dateKey.split('-').map(Number)
    return y === year && m === month + 1
  })
  const todayDay = todayKey.startsWith(`${year}-${String(month + 1).padStart(2, '0')}`)
    ? Number(todayKey.slice(8, 10))
    : null

  return (
    <div style={{ padding: 14, overflowX: 'auto' }}>
      <div style={{ minWidth: 760, position: 'relative' }}>
        {todayDay ? (
          <div style={{ ...ganttToday, left: `calc(180px + ${((todayDay - 0.5) / daysInMonth) * 100}% * ${(760 - 180) / 760})` }} />
        ) : null}
        {monthEvents.length === 0 ? (
          <div style={emptyState}>Không có mốc nào trong tháng.</div>
        ) : (
          monthEvents.map((e) => {
            const day = Number(e.dateKey.slice(8, 10))
            const meta = CATEGORY_META[e.category]
            return (
              <div key={e.id} style={ganttRow} data-vyvy-row="true">
                <div style={ganttLabel}>{meta.prefix ?? ''}{e.label}</div>
                <div style={ganttTrack}>
                  <div
                    style={{
                      ...ganttBar,
                      background: meta.color,
                      left: `${((day - 1) / daysInMonth) * 100}%`,
                    }}
                    title={`${meta.label} · ${e.dateKey}`}
                  >
                    {day}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

const pageStyle: React.CSSProperties = {
  padding: 'var(--space-6)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-5)',
}

const shellStyle: React.CSSProperties = {
  position: 'relative',
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-xl)',
  boxShadow: 'var(--shadow-sm)',
  overflow: 'hidden',
}

const toolbarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--space-3)',
  padding: '14px 18px',
  borderBottom: '1px solid var(--color-border)',
  flexWrap: 'wrap',
}

const navGroup: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
}

const navArrow: React.CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--color-border)',
  background: 'var(--color-surface)',
  color: 'var(--color-text)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 16,
}

const navLabelButton: React.CSSProperties = {
  fontFamily: 'var(--font-serif)',
  fontSize: 18,
  fontWeight: 600,
  color: 'var(--color-text)',
  padding: '6px 12px',
  borderRadius: 'var(--radius-md)',
  border: '1px solid transparent',
  background: 'transparent',
  cursor: 'pointer',
  minWidth: 150,
  textAlign: 'center',
}

const toggleGroup: React.CSSProperties = {
  display: 'flex',
  gap: 6,
  background: 'var(--color-surface-2)',
  padding: 4,
  borderRadius: 'var(--radius-full)',
}

const toggleChip = (active: boolean): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  fontSize: 13,
  fontWeight: 600,
  padding: '6px 14px',
  borderRadius: 'var(--radius-full)',
  border: 'none',
  cursor: 'pointer',
  background: active ? 'var(--color-lime)' : 'transparent',
  color: active ? 'var(--color-charcoal)' : 'var(--color-text-muted)',
})

const weekHeaderGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
  gap: 8,
  marginBottom: 8,
}

const weekHeadCell: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--color-text-muted)',
  padding: '4px 6px',
}

const monthGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
  gap: 8,
}

const monthCell = (isToday: boolean, inMonth: boolean): React.CSSProperties => ({
  background: isToday ? 'rgba(218,223,33,0.06)' : 'var(--color-surface)',
  border: `1px solid ${isToday ? 'var(--color-lime)' : 'var(--color-border)'}`,
  borderRadius: 9,
  minHeight: 96,
  padding: 8,
  opacity: inMonth ? 1 : 0.4,
  display: 'flex',
  flexDirection: 'column',
  gap: 3,
  cursor: 'default',
})

const cellNum = (isToday: boolean): React.CSSProperties => ({
  fontSize: 12,
  fontWeight: 700,
  marginBottom: 2,
  color: isToday ? 'var(--color-lime-d)' : 'var(--color-text)',
})

const eventPill: React.CSSProperties = {
  fontSize: 10.5,
  fontWeight: 600,
  padding: '2px 6px',
  borderRadius: 5,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

const moreLabel: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  color: 'var(--color-text-muted)',
  padding: '2px 6px',
  borderRadius: 5,
  background: 'var(--color-surface-2)',
}

const dayRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '8px 10px',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--color-border)',
}

const ganttRow: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '180px 1fr',
  alignItems: 'center',
  borderBottom: '1px solid var(--color-border)',
  minHeight: 40,
}

const ganttLabel: React.CSSProperties = {
  fontSize: 12.5,
  color: 'var(--color-text)',
  padding: '0 12px',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

const ganttTrack: React.CSSProperties = {
  position: 'relative',
  height: 40,
  borderLeft: '1px solid var(--color-border)',
}

const ganttBar: React.CSSProperties = {
  position: 'absolute',
  top: 11,
  height: 18,
  minWidth: 22,
  borderRadius: 6,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 6px',
  fontSize: 10.5,
  fontWeight: 700,
  color: '#fff',
  boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
}

const ganttToday: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  bottom: 0,
  width: 2,
  background: 'var(--color-lime)',
  zIndex: 3,
}

const legendBar: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 16,
  flexWrap: 'wrap',
  padding: '12px 18px',
  borderTop: '1px solid var(--color-border)',
  fontSize: 12,
  color: 'var(--color-text-muted)',
}

const legendItem: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
}

const legendDot: React.CSSProperties = {
  width: 9,
  height: 9,
  borderRadius: 'var(--radius-full)',
}

const emptyState: React.CSSProperties = {
  padding: '48px 24px',
  textAlign: 'center',
  color: 'var(--color-text-muted)',
  fontSize: 13,
}
