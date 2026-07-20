'use client'

import React from 'react'
import { OverlayPortal } from '@/components/feedback/OverlayPortal'
import { DataErrorState } from '@/components/ui/DataErrorState'
import { PageHead } from '@/components/ui/PageHead'
import { useCommandData } from '@/hooks/useCommandData'
import type {
  CommandCenterDeliverableRow,
  CommandCenterPersonRow,
  CommandCenterProjectRow,
  CommandCenterReminderRow,
  CommandCenterTaskRow,
} from '@/lib/database.types'

const RESPONSE_MAP = {
  NOT_REMINDERED: { label: 'Chưa nhắc', color: 'var(--color-text-muted)', bg: 'var(--color-surface-2)' },
  REMINDERED: { label: 'Đã nhắc', color: 'var(--color-waiting)', bg: 'var(--color-waiting-bg)' },
  VIEWED: { label: 'Đã xem', color: 'var(--color-waiting)', bg: 'var(--color-waiting-bg)' },
  WAITING_RESPONSE: { label: 'Chờ phản hồi', color: 'var(--color-warning)', bg: 'var(--color-warning-bg)' },
  PROMISED_DELIVERY: { label: 'Đã hứa nộp', color: 'var(--color-success)', bg: 'var(--color-success-bg)' },
  DEADLINE_EXTENSION_REQUESTED: { label: 'Xin gia hạn', color: 'var(--color-warning)', bg: 'var(--color-warning-bg)' },
  FILE_SUBMITTED: { label: 'Đã nộp file', color: 'var(--color-success)', bg: 'var(--color-success-bg)' },
  NO_RESPONSE: { label: 'Không phản hồi', color: 'var(--color-danger)', bg: 'var(--color-danger-bg)' },
  ESCALATED: { label: 'Đã leo thang', color: 'var(--color-danger)', bg: 'var(--color-danger-bg)' },
  CLOSED: { label: 'Đã đóng', color: 'var(--color-text-muted)', bg: 'var(--color-surface-2)' },
} as const

type FollowUpItem = {
  id: string
  reminderId: string | null
  deliverableId: string | null
  taskId: string | null
  personId: string | null
  personName: string
  personRole: string
  messengerUrl: string | null
  zaloUrl: string | null
  itemTitle: string
  itemType: 'file' | 'task'
  projectName: string
  deadline: string
  statusLabel: string
  responseStatus: keyof typeof RESPONSE_MAP
  reminderLevel: number
  sentCount: number
  lastRemindedAt: string | null
  nextFollowUpAt: string | null
  isDueNow: boolean
  isOverdue: boolean
}

type FollowUpPersonGroup = {
  personId: string
  personName: string
  items: FollowUpItem[]
}

type ComposerState = {
  items: FollowUpItem[]
  mode: 'single' | 'bulk'
  message: string
  nextOption: NextOption
  customNext: string
}

type NextOption = '2h' | 'afternoon' | 'tomorrow_morning' | '24h' | 'custom'
type FollowUpView = 'today' | 'overdue' | 'upcoming' | 'no_deadline' | 'waiting' | 'all'

type ReminderLog = {
  id: string
  reminder_id: string
  sent_by: string | null
  channel: string | null
  message_content: string | null
  sent_at: string | null
  confirmed_sent: boolean | null
  result: string | null
  follow_up_at: string | null
}

export default function FollowUpsPage() {
  const { data, loading, error, refresh } = useCommandData()
  const [composer, setComposer] = React.useState<ComposerState | null>(null)
  const [logs, setLogs] = React.useState<ReminderLog[]>([])
  const [toast, setToast] = React.useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [activeView, setActiveView] = React.useState<FollowUpView>('today')
  const [groupOpenOverrides, setGroupOpenOverrides] = React.useState<Record<string, boolean>>({})

  const people = React.useMemo(() => toMap(data?.people ?? []), [data?.people])
  const tasks = React.useMemo(() => toMap(data?.tasks ?? []), [data?.tasks])
  const projects = React.useMemo(() => toMap(data?.projects ?? []), [data?.projects])
  const deliverables = React.useMemo(() => toMap(data?.deliverables ?? []), [data?.deliverables])
  const reminderItems = React.useMemo(
    () => (data?.reminders ?? []).map((reminder) => toReminderItem(reminder, people, tasks, projects, deliverables)).filter(Boolean) as FollowUpItem[],
    [data?.reminders, deliverables, people, projects, tasks],
  )

  const reminderDeliverableIds = React.useMemo(
    () => new Set(reminderItems.map((item) => item.deliverableId).filter(Boolean)),
    [reminderItems],
  )

  const missingFileItems = React.useMemo(
    () =>
      (data?.deliverables ?? [])
        .filter((item) => item.is_required && !['SUBMITTED', 'APPROVED'].includes(item.status) && !reminderDeliverableIds.has(item.id))
        .map((deliverable) => toMissingFileItem(deliverable, people, tasks, projects))
        .filter(Boolean) as FollowUpItem[],
    [data?.deliverables, people, projects, reminderDeliverableIds, tasks],
  )

  const allItems = React.useMemo(() => [...reminderItems, ...missingFileItems], [missingFileItems, reminderItems])
  const activeItems = React.useMemo(
    () => allItems.filter((item) => !['FILE_SUBMITTED', 'CLOSED'].includes(item.responseStatus)),
    [allItems],
  )
  const dueNow = React.useMemo(
    () => activeItems.filter(isTodayFollowUp),
    [activeItems],
  )
  const overdueItems = React.useMemo(
    () => activeItems.filter(isOverdueFollowUp),
    [activeItems],
  )
  const upcoming = React.useMemo(
    () => activeItems.filter(isUpcomingFollowUp),
    [activeItems],
  )
  const noDeadlineItems = React.useMemo(
    () => activeItems.filter(isNoDeadlineFollowUp),
    [activeItems],
  )
  const waitingItems = React.useMemo(
    () => activeItems.filter((item) => item.sentCount > 0 || ['REMINDERED', 'WAITING_RESPONSE', 'PROMISED_DELIVERY', 'NO_RESPONSE'].includes(item.responseStatus)),
    [activeItems],
  )
  const visibleItems = React.useMemo(
    () => {
      if (activeView === 'today') return dueNow
      if (activeView === 'overdue') return overdueItems
      if (activeView === 'upcoming') return upcoming
      if (activeView === 'no_deadline') return noDeadlineItems
      if (activeView === 'waiting') return waitingItems
      return activeItems
    },
    [activeItems, activeView, dueNow, noDeadlineItems, overdueItems, upcoming, waitingItems],
  )
  const lateEscalation = React.useMemo(
    () => activeItems.filter((item) => item.sentCount >= 2 || (item.isOverdue && item.sentCount >= 1) || item.responseStatus === 'NO_RESPONSE'),
    [activeItems],
  )
  const pending = React.useMemo(
    () => activeItems.filter((item) => ['NOT_REMINDERED', 'REMINDERED', 'WAITING_RESPONSE'].includes(item.responseStatus)),
    [activeItems],
  )
  const dueGroups = React.useMemo(() => groupItemsByPerson(dueNow), [dueNow])
  const groupedVisibleItems = React.useMemo(() => groupItemsByPerson(visibleItems), [visibleItems])

  React.useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 2800)
    return () => window.clearTimeout(timer)
  }, [toast])

  async function openComposer(items: FollowUpItem[], mode: 'single' | 'bulk' = 'single') {
    const next = {
      items,
      mode,
      message: buildMessage(items),
      nextOption: '24h' as NextOption,
      customNext: '',
    }
    setComposer(next)
    setLogs([])
    await loadLogs(items)
  }

  async function loadLogs(items: FollowUpItem[]) {
    const reminderIds = items.map((item) => item.reminderId).filter(Boolean) as string[]
    if (!reminderIds.length) return
    try {
      const response = await fetch(`/api/follow-ups?reminderIds=${encodeURIComponent(reminderIds.join(','))}`, { cache: 'no-store' })
      const payload = (await response.json()) as { logs?: ReminderLog[]; error?: string }
      if (!response.ok || payload.error) throw new Error(payload.error ?? 'Không đọc được lịch sử nhắc.')
      setLogs(payload.logs ?? [])
    } catch (err) {
      setToast({ tone: 'error', text: err instanceof Error ? err.message : 'Không đọc được lịch sử nhắc.' })
    }
  }

  async function copyMessage() {
    if (!composer) return
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(composer.message)
      } else if (!fallbackCopyText(composer.message)) {
        throw new Error('Clipboard unavailable')
      }
      setToast({ tone: 'ok', text: 'Đã copy tin nhắn' })
    } catch {
      if (fallbackCopyText(composer.message)) {
        setToast({ tone: 'ok', text: 'Đã copy tin nhắn' })
      } else {
        setToast({ tone: 'error', text: 'Không copy được tin nhắn. Hãy copy thủ công trong khung soạn.' })
      }
    }
  }

  function openContact(channel: 'messenger' | 'zalo') {
    if (!composer) return
    const first = composer.items[0]
    const url = channel === 'messenger' ? first.messengerUrl : first.zaloUrl
    if (!url) {
      setToast({ tone: 'error', text: channel === 'messenger' ? 'Chưa có link Messenger' : 'Chưa có số/link Zalo' })
      return
    }
    window.open(url, '_blank', 'noopener,noreferrer')
    setToast({ tone: 'info', text: channel === 'messenger' ? 'Đã mở Messenger, chưa tính là đã gửi' : 'Đã mở Zalo, chưa tính là đã gửi' })
  }

  async function runAction(action: 'markSent' | 'schedule' | 'escalate') {
    if (!composer) return
    if (action === 'markSent' && !composer.message.trim()) {
      setToast({ tone: 'error', text: 'Tin nhắn đang trống.' })
      return
    }
    const missingPerson = composer.items.find((item) => !item.personId)
    if (missingPerson) {
      setToast({ tone: 'error', text: 'Item này chưa có người nhận nhắc.' })
      return
    }

    setSaving(true)
    try {
      const response = await fetch('/api/follow-ups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          items: composer.items.map((item) => ({
            reminderId: item.reminderId,
            deliverableId: item.deliverableId,
            taskId: item.taskId,
            personId: item.personId,
          })),
          message: composer.message,
          channel: 'manual',
          nextFollowUpAt: resolveNextFollowUpAt(composer.nextOption, composer.customNext),
        }),
      })
      const payload = (await response.json()) as { ok?: boolean; error?: string }
      if (!response.ok || payload.error) throw new Error(payload.error ?? 'Không lưu được follow-up.')

      await refresh()
      if (action === 'markSent') setToast({ tone: 'ok', text: 'Đã lưu lịch sử nhắc' })
      if (action === 'schedule') setToast({ tone: 'ok', text: 'Đã hẹn nhắc lại' })
      if (action === 'escalate') setToast({ tone: 'ok', text: 'Đã đánh dấu cần escalate' })
      await loadLogs(composer.items)
      if (action === 'markSent') setComposer(null)
    } catch (err) {
      setToast({ tone: 'error', text: err instanceof Error ? err.message : 'Không lưu được follow-up.' })
    } finally {
      setSaving(false)
    }
  }

  function isGroupExpanded(group: FollowUpPersonGroup) {
    const fallback = activeView !== 'all' || group.items.some((item) => item.isOverdue || isTodayFollowUp(item))
    return groupOpenOverrides[group.personId] ?? fallback
  }

  function toggleGroup(group: FollowUpPersonGroup) {
    setGroupOpenOverrides((current) => ({
      ...current,
      [group.personId]: !isGroupExpanded(group),
    }))
  }

  return (
    <div style={pageStyle}>
      <PageHead
        icon="ti-bell-ringing"
        title="Nhắc việc & theo dõi"
        desc="Soạn tin nhắc, copy qua Messenger/Zalo, rồi xác nhận đã gửi để lưu lịch sử và lịch follow-up tiếp theo."
      />

      {error ? <DataErrorState message={error} /> : null}
      {toast ? <div style={toastStyle(toast.tone)}>{toast.text}</div> : null}

      <div style={summaryGrid}>
        <SummaryCard icon="ti-calendar-check" label="Hôm nay + quá hạn" value={dueNow.length} tone="warning" />
        <SummaryCard icon="ti-alert-triangle" label="Quá hạn phản hồi" value={overdueItems.length} tone="danger" highlight />
        <SummaryCard icon="ti-calendar-plus" label="Sắp tới 7 ngày" value={upcoming.length} tone="neutral" />
        <SummaryCard icon="ti-calendar-question" label="Chưa có deadline" value={noDeadlineItems.length} tone="neutral" />
        <SummaryCard icon="ti-hourglass" label="Đang chờ phản hồi" value={pending.length} tone="warning" />
      </div>

      <div style={layoutGrid}>
        <section style={panelStyle} data-vyvy-card="true">
          <div style={tableHead}>
            <div>
              <div style={headLabel}>Danh sách đang theo</div>
              <div style={headMeta}>Bấm vào một dòng để soạn tin nhắc.</div>
            </div>
            <div style={headCount}>{visibleItems.length} mục</div>
          </div>

          <div style={followUpTabsStyle}>
            <button type="button" style={followUpTabStyle(activeView === 'today')} onClick={() => setActiveView('today')}>Hôm nay + quá hạn ({dueNow.length})</button>
            <button type="button" style={followUpTabStyle(activeView === 'overdue')} onClick={() => setActiveView('overdue')}>Quá hạn phản hồi ({overdueItems.length})</button>
            <button type="button" style={followUpTabStyle(activeView === 'upcoming')} onClick={() => setActiveView('upcoming')}>Sắp tới 7 ngày ({upcoming.length})</button>
            <button type="button" style={followUpTabStyle(activeView === 'no_deadline')} onClick={() => setActiveView('no_deadline')}>Chưa có deadline ({noDeadlineItems.length})</button>
            <button type="button" style={followUpTabStyle(activeView === 'waiting')} onClick={() => setActiveView('waiting')}>Đã nhắc / đang chờ ({waitingItems.length})</button>
            <button type="button" style={followUpTabStyle(activeView === 'all')} onClick={() => setActiveView('all')}>Tất cả ({activeItems.length})</button>
          </div>

          <div style={tableHeaderRow}>
            <span>Người</span>
            <span>Đang nợ</span>
            <span>Số lần</span>
            <span>Trạng thái</span>
            <span>Nhắc tiếp</span>
          </div>

          {loading ? (
            <div style={emptyState}>Đang tải danh sách follow-up...</div>
          ) : visibleItems.length === 0 ? (
            <div style={emptyState}>Hiện chưa có mục nào cần theo dõi.</div>
          ) : (
            groupedVisibleItems.map((group) => (
              <FollowUpGroup
                key={group.personId}
                group={group}
                expanded={isGroupExpanded(group)}
                onToggle={() => toggleGroup(group)}
                onOpenGroup={() => void openComposer(group.items, group.items.length > 1 ? 'bulk' : 'single')}
                onOpenItem={(item) => void openComposer([item])}
              />
            ))
          )}
        </section>

        <aside style={sideColumn}>
          <section style={panelStyle} data-vyvy-card="true">
            <div style={asideHead}>
              <div style={headLabel}>Cần dí hôm nay</div>
              <div style={headMeta}>Đã gom theo từng người để tránh gửi lẫn tin.</div>
            </div>
            <div style={stackStyle}>
              {dueGroups.length === 0 ? (
                <div style={emptySmall}>Không có mục nào tới lịch dí ngay.</div>
              ) : (
                dueGroups.map((group) => (
                  <button key={group.personId} style={groupButtonStyle} onClick={() => void openComposer(group.items, group.items.length > 1 ? 'bulk' : 'single')}>
                    <span style={priorityTitle}>{group.personName}</span>
                    <span style={priorityMeta}>{group.items.length} mục cần nhắc · {group.items[0]?.projectName || 'Chưa rõ dự án'}</span>
                    <span style={groupFootStyle}>Soạn tin nhóm theo người</span>
                  </button>
                ))
              )}
            </div>
          </section>

          <section style={panelStyle} data-vyvy-card="true">
            <div style={asideHead}>
              <div style={headLabel}>Ưu tiên ngay</div>
            </div>
            <div style={stackStyle}>
              {lateEscalation.length === 0 ? (
                <div style={emptySmall}>Chưa có ai cần leo thang.</div>
              ) : (
                lateEscalation.slice(0, 5).map((item) => (
                  <button key={item.id} style={priorityItemButton} onClick={() => void openComposer([item])}>
                    <span style={priorityTitle}>{item.personName}</span>
                    <span style={priorityMeta}>{item.itemTitle}</span>
                    <span style={{ ...badgeBase, background: 'var(--color-danger-bg)', color: 'var(--color-danger)', marginTop: 8 }}>
                      {escalationLabel(item)}
                    </span>
                  </button>
                ))
              )}
            </div>
          </section>

          <section style={panelStyle} data-vyvy-card="true">
            <div style={asideHead}>
              <div style={headLabel}>File cần dí</div>
            </div>
            <div style={stackStyle}>
              {missingFileItems.length === 0 ? (
                <div style={emptySmall}>Không còn deliverable bắt buộc nào chưa nộp.</div>
              ) : (
                missingFileItems.slice(0, 6).map((item) => (
                  <button key={item.id} style={priorityItemButton} onClick={() => void openComposer([item])}>
                    <span style={priorityTitle}>{item.personName}</span>
                    <span style={priorityMeta}>{item.itemTitle}</span>
                    <span style={{ ...badgeBase, background: item.isOverdue ? 'var(--color-danger-bg)' : 'var(--color-warning-bg)', color: item.isOverdue ? 'var(--color-danger)' : 'var(--color-warning)', marginTop: 8 }}>
                      {item.isOverdue ? 'Quá hạn' : 'Chưa nộp'}
                    </span>
                  </button>
                ))
              )}
            </div>
          </section>
        </aside>
      </div>

      {composer ? (
        <OverlayPortal isOpen={Boolean(composer)}>
          <ReminderComposerDrawer
          composer={composer}
          logs={logs}
          saving={saving}
          onClose={() => setComposer(null)}
          onMessageChange={(message) => setComposer((current) => current ? { ...current, message } : current)}
          onNextChange={(nextOption, customNext) => setComposer((current) => current ? { ...current, nextOption, customNext: customNext ?? current.customNext } : current)}
          onCopy={() => void copyMessage()}
          onOpenMessenger={() => openContact('messenger')}
          onOpenZalo={() => openContact('zalo')}
          onSent={() => void runAction('markSent')}
          onNotSent={() => {
            setToast({ tone: 'info', text: 'Chưa gửi, app không lưu lịch sử nhắc.' })
            setComposer(null)
          }}
          onSchedule={() => void runAction('schedule')}
            onEscalate={() => void runAction('escalate')}
          />
        </OverlayPortal>
      ) : null}
    </div>
  )
}

function FollowUpGroup({
  group,
  expanded,
  onToggle,
  onOpenGroup,
  onOpenItem,
}: {
  group: FollowUpPersonGroup
  expanded: boolean
  onToggle: () => void
  onOpenGroup: () => void
  onOpenItem: (item: FollowUpItem) => void
}) {
  const todayCount = group.items.filter(isTodayFollowUp).length
  const upcomingCount = group.items.length - todayCount
  const overdueCount = group.items.filter((item) => item.isOverdue).length
  const role = group.items.find((item) => item.personRole)?.personRole ?? 'Chưa có chức danh'

  return (
    <div style={groupPanelStyle}>
      <div style={groupHeaderStyle}>
        <button type="button" onClick={onToggle} style={groupToggleStyle} aria-expanded={expanded}>
          <i className={`ti ${expanded ? 'ti-chevron-down' : 'ti-chevron-right'}`} />
          <span>
            <strong>{group.personName}</strong>
            <small>{role}</small>
          </span>
        </button>
        <div style={groupStatsStyle}>
          <span style={groupStatPillStyle('warning')}>Hôm nay {todayCount}</span>
          <span style={groupStatPillStyle('neutral')}>Sắp tới {upcomingCount}</span>
          <span style={groupStatPillStyle(overdueCount > 0 ? 'danger' : 'neutral')}>Quá hạn {overdueCount}</span>
          <button type="button" onClick={onOpenGroup} style={groupComposeButtonStyle}>Soạn nhóm</button>
        </div>
      </div>
      {expanded ? (
        <div>
          {group.items.map((item, index) => (
            <FollowUpRow
              key={item.id}
              item={item}
              index={index}
              total={group.items.length}
              onOpen={() => onOpenItem(item)}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function FollowUpRow({ item, index, total, onOpen }: { item: FollowUpItem; index: number; total: number; onOpen: () => void }) {
  const status = RESPONSE_MAP[item.responseStatus] ?? RESPONSE_MAP.NOT_REMINDERED
  return (
    <button
      type="button"
      onClick={onOpen}
      data-vyvy-row="true"
      data-vyvy-alert={item.sentCount >= 2 || item.isOverdue ? 'true' : undefined}
      style={{
        ...tableRow,
        borderBottom: index < total - 1 ? '1px solid var(--color-border)' : undefined,
        borderLeft: item.sentCount >= 2 || item.isOverdue ? '3px solid var(--color-danger)' : '3px solid transparent',
      }}
    >
      <div>
        <div style={rowTitle}>{item.personName}</div>
        <div style={rowMeta}>{item.personRole || 'Chưa có chức danh'}</div>
      </div>
      <div>
        <div style={rowTitle}>{item.itemTitle}</div>
        <div style={rowMeta}>{item.projectName} · {item.itemType === 'file' ? 'Bàn giao / file' : 'Task / báo cáo'}</div>
      </div>
      <div style={centerCell}>
        <span style={countBubble(item.sentCount >= 2)}>{item.sentCount}x</span>
      </div>
      <div>
        <span style={{ ...badgeBase, color: status.color, background: status.bg }}>{status.label}</span>
      </div>
      <div style={rowMeta}>{item.nextFollowUpAt ? formatDateTime(item.nextFollowUpAt) : 'Cần nhắc'}</div>
    </button>
  )
}

function ReminderComposerDrawer({
  composer,
  logs,
  saving,
  onClose,
  onMessageChange,
  onNextChange,
  onCopy,
  onOpenMessenger,
  onOpenZalo,
  onSent,
  onNotSent,
  onSchedule,
  onEscalate,
}: {
  composer: ComposerState
  logs: ReminderLog[]
  saving: boolean
  onClose: () => void
  onMessageChange: (message: string) => void
  onNextChange: (option: NextOption, customNext?: string) => void
  onCopy: () => void
  onOpenMessenger: () => void
  onOpenZalo: () => void
  onSent: () => void
  onNotSent: () => void
  onSchedule: () => void
  onEscalate: () => void
}) {
  const first = composer.items[0]
  const maxCount = Math.max(...composer.items.map((item) => item.sentCount), 0)
  const deadlines = Array.from(new Set(composer.items.map((item) => item.deadline).filter(Boolean)))
  const projects = Array.from(new Set(composer.items.map((item) => item.projectName).filter(Boolean)))
  const statuses = Array.from(new Set(composer.items.map((item) => item.statusLabel).filter(Boolean)))

  return (
    <div style={drawerBackdrop} role="dialog" aria-modal="true">
      <aside style={drawerStyle}>
        <div style={drawerHeader}>
          <div>
            <div style={eyebrow}>Soạn nhắc việc</div>
            <div style={drawerTitle}>{first?.personName ?? 'Chưa rõ người nhận'}</div>
            <div style={drawerMeta}>{composer.mode === 'bulk' ? `${composer.items.length} mục được gom đúng theo một người` : first?.itemTitle}</div>
          </div>
          <button type="button" onClick={onClose} style={iconButtonStyle} aria-label="Đóng">
            <i className="ti ti-x" />
          </button>
        </div>

        <div style={drawerBody}>
          <div style={infoGrid}>
            <InfoBlock label="Người cần nhắc" value={first?.personName ?? 'Chưa xác định'} />
            <InfoBlock label="Dự án" value={projects.join(', ') || 'Chưa rõ'} />
            <InfoBlock label="Deadline" value={deadlines.map(formatDateOnly).join(', ') || 'Chưa có'} />
            <InfoBlock label="Trạng thái" value={statuses.join(', ') || 'Chưa rõ'} />
            <InfoBlock label="Số lần đã nhắc" value={`${maxCount} lần`} />
            <InfoBlock label="Escalation" value={maxCount >= 2 ? 'Cần escalate' : maxCount === 1 ? 'Theo dõi tiếp' : 'Nhắc lần đầu'} />
          </div>

          <div style={owedBox}>
            <div style={boxTitle}>Việc đang nợ</div>
            {composer.items.map((item) => (
              <div key={item.id} style={owedItemStyle}>
                <span>{item.itemTitle}</span>
                <small>{item.deadline ? `Deadline ${formatDateOnly(item.deadline)}` : 'Chưa có deadline'} · {item.statusLabel}</small>
              </div>
            ))}
          </div>

          {!first?.messengerUrl && !first?.zaloUrl ? (
            <div style={contactWarning}>Chưa có link liên hệ, hãy copy tin nhắn thủ công.</div>
          ) : null}

          <label style={fieldLabel}>
            Mẫu tin nhắn tự soạn, có thể sửa trước khi copy
            <textarea value={composer.message} onChange={(event) => onMessageChange(event.target.value)} style={messageTextarea} />
          </label>

          <div style={nextGrid}>
            <label style={fieldLabel}>
              Hẹn nhắc lại
              <select value={composer.nextOption} onChange={(event) => onNextChange(event.target.value as NextOption)} style={selectStyle}>
                <option value="2h">2 giờ nữa</option>
                <option value="afternoon">Chiều nay</option>
                <option value="tomorrow_morning">Sáng mai</option>
                <option value="24h">24 giờ nữa</option>
                <option value="custom">Chọn ngày/giờ khác</option>
              </select>
            </label>
            {composer.nextOption === 'custom' ? (
              <label style={fieldLabel}>
                Ngày/giờ tùy chọn
                <input type="datetime-local" value={composer.customNext} onChange={(event) => onNextChange('custom', event.target.value)} style={selectStyle} />
              </label>
            ) : (
              <div style={nextPreviewStyle}>Sẽ nhắc lại: {formatDateTime(resolveNextFollowUpAt(composer.nextOption, composer.customNext))}</div>
            )}
          </div>

          <div style={buttonGrid}>
            <button type="button" style={secondaryButton} onClick={onCopy}>
              <i className="ti ti-copy" /> Copy tin nhắn
            </button>
            <button type="button" style={secondaryButton} onClick={onOpenMessenger}>
              <i className="ti ti-brand-messenger" /> Mở Messenger
            </button>
            <button type="button" style={secondaryButton} onClick={onOpenZalo}>
              <i className="ti ti-message-circle" /> Mở Zalo
            </button>
            <button type="button" style={secondaryButton} onClick={onSchedule} disabled={saving}>
              <i className="ti ti-calendar-plus" /> Hẹn nhắc lại
            </button>
            <button type="button" style={secondaryDangerButton} onClick={onEscalate} disabled={saving}>
              <i className="ti ti-arrow-up-right" /> Escalate
            </button>
          </div>

          <div style={drawerFooter}>
            <button type="button" style={secondaryButton} onClick={onNotSent} disabled={saving}>
              Chưa gửi
            </button>
            <button type="button" style={primaryButton} onClick={onSent} disabled={saving}>
              <i className={`ti ${saving ? 'ti-loader-2' : 'ti-check'}`} />
              Đã gửi
            </button>
          </div>

          <div style={historyBox}>
            <div style={boxTitle}>Lịch sử nhắc</div>
            {logs.length === 0 ? (
              <div style={emptySmall}>Chưa có lịch sử nhắc đã gửi.</div>
            ) : (
              logs.map((log) => (
                <div key={log.id} style={logItemStyle}>
                  <div style={rowTitle}>{log.confirmed_sent ? 'Đã gửi' : 'Chưa xác nhận gửi'} · {log.channel ?? 'manual'}</div>
                  <div style={rowMeta}>{log.sent_at ? formatDateTime(log.sent_at) : ''} · Nhắc lại {log.follow_up_at ? formatDateTime(log.follow_up_at) : 'chưa hẹn'}</div>
                  <div style={logMessageStyle}>{log.message_content}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </aside>
    </div>
  )
}

function SummaryCard({
  icon,
  label,
  value,
  tone,
  highlight,
}: {
  icon: string
  label: string
  value: number
  tone: 'danger' | 'warning' | 'success' | 'neutral'
  highlight?: boolean
}) {
  const color =
    tone === 'danger'
      ? 'var(--color-danger)'
      : tone === 'warning'
        ? 'var(--color-warning)'
        : tone === 'success'
          ? 'var(--color-success)'
          : 'var(--color-olive)'
  const bg =
    tone === 'danger'
      ? 'var(--color-danger-bg)'
      : tone === 'warning'
        ? 'var(--color-warning-bg)'
        : tone === 'success'
          ? 'var(--color-success-bg)'
          : 'rgba(45, 51, 26, 0.08)'

  return (
    <div style={summaryCard} data-vyvy-card="true" data-vyvy-alert={highlight && value > 0 ? 'true' : undefined}>
      <div style={{ ...summaryIcon, background: bg, color }}>
        <i className={`ti ${icon}`} />
      </div>
      <div>
        <div style={summaryValue}>{value}</div>
        <div style={summaryLabel}>{label}</div>
      </div>
    </div>
  )
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div style={infoBlockStyle}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function toReminderItem(
  reminder: CommandCenterReminderRow,
  people: Record<string, CommandCenterPersonRow>,
  tasks: Record<string, CommandCenterTaskRow>,
  projects: Record<string, CommandCenterProjectRow>,
  deliverables: Record<string, CommandCenterDeliverableRow>,
): FollowUpItem | null {
  const person = reminder.person_id ? people[reminder.person_id] : null
  const task = reminder.task_id ? tasks[reminder.task_id] : null
  const deliverable = reminder.deliverable_id ? deliverables[reminder.deliverable_id] : null
  const project = getProjectForItem(deliverable, task, projects)
  const responseStatus = (reminder.response_status ?? 'NOT_REMINDERED') as keyof typeof RESPONSE_MAP
  const status = RESPONSE_MAP[responseStatus] ?? RESPONSE_MAP.NOT_REMINDERED
  const deadline = deliverable?.due_date ?? task?.due_date ?? ''
  const sentCount = reminder.last_reminded_at ? reminder.reminder_level ?? 0 : 0

  return {
    id: `reminder-${reminder.id}`,
    reminderId: reminder.id,
    deliverableId: reminder.deliverable_id,
    taskId: reminder.task_id,
    personId: reminder.person_id,
    personName: person?.full_name ?? 'Chưa xác định',
    personRole: person?.job_title ?? '',
    messengerUrl: person?.messenger_url ?? null,
    zaloUrl: makeZaloUrl(person?.phone ?? null),
    itemTitle: deliverable?.name ?? task?.title ?? 'Chưa rõ hạng mục',
    itemType: deliverable ? 'file' : 'task',
    projectName: project?.name ?? 'Chưa rõ dự án',
    deadline,
    statusLabel: status.label,
    responseStatus,
    reminderLevel: reminder.reminder_level ?? 0,
    sentCount,
    lastRemindedAt: reminder.last_reminded_at,
    nextFollowUpAt: reminder.next_follow_up_at,
    isDueNow: isTodayFollowUpSchedule(reminder.next_follow_up_at, deadline, responseStatus),
    isOverdue: Boolean(deadline && deadline < todayKey()),
  }
}

function toMissingFileItem(
  deliverable: CommandCenterDeliverableRow,
  people: Record<string, CommandCenterPersonRow>,
  tasks: Record<string, CommandCenterTaskRow>,
  projects: Record<string, CommandCenterProjectRow>,
): FollowUpItem | null {
  const person = deliverable.submitter_id ? people[deliverable.submitter_id] : null
  const task = deliverable.task_id ? tasks[deliverable.task_id] : null
  const project = getProjectForItem(deliverable, task, projects)
  return {
    id: `deliverable-${deliverable.id}`,
    reminderId: null,
    deliverableId: deliverable.id,
    taskId: deliverable.task_id,
    personId: deliverable.submitter_id,
    personName: person?.full_name ?? 'Chưa gắn người nộp',
    personRole: person?.job_title ?? '',
    messengerUrl: person?.messenger_url ?? null,
    zaloUrl: makeZaloUrl(person?.phone ?? null),
    itemTitle: deliverable.name,
    itemType: 'file',
    projectName: project?.name ?? 'Chưa rõ dự án',
    deadline: deliverable.due_date ?? task?.due_date ?? '',
    statusLabel: deliverable.status === 'REVISION_REQUIRED' ? 'Yêu cầu sửa' : 'Chưa nộp',
    responseStatus: 'NOT_REMINDERED',
    reminderLevel: 0,
    sentCount: 0,
    lastRemindedAt: null,
    nextFollowUpAt: null,
    isDueNow: isTodayFollowUpSchedule(null, deliverable.due_date ?? task?.due_date ?? '', 'NOT_REMINDERED'),
    isOverdue: Boolean((deliverable.due_date ?? task?.due_date) && (deliverable.due_date ?? task?.due_date)! < todayKey()),
  }
}

function getProjectForItem(
  deliverable: CommandCenterDeliverableRow | null,
  task: CommandCenterTaskRow | null,
  projects: Record<string, CommandCenterProjectRow>,
) {
  const projectId = deliverable?.project_id ?? task?.project_id ?? null
  return projectId ? projects[projectId] : null
}

function groupItemsByPerson(items: FollowUpItem[]): FollowUpPersonGroup[] {
  const byPerson = new Map<string, FollowUpPersonGroup>()
  for (const item of items) {
    const key = item.personId ?? `unknown-${item.id}`
    const current = byPerson.get(key) ?? { personId: key, personName: item.personName, items: [] }
    current.items.push(item)
    byPerson.set(key, current)
  }
  return Array.from(byPerson.values()).sort((a, b) => b.items.length - a.items.length || a.personName.localeCompare(b.personName, 'vi'))
}

function isTodayFollowUp(item: FollowUpItem) {
  return item.isDueNow && !['FILE_SUBMITTED', 'CLOSED'].includes(item.responseStatus)
}

function isOverdueFollowUp(item: FollowUpItem) {
  const dateKey = followUpDateKey(item)
  return Boolean(dateKey && dateKey < todayKey() && !['FILE_SUBMITTED', 'CLOSED'].includes(item.responseStatus))
}

function isUpcomingFollowUp(item: FollowUpItem) {
  const dateKey = followUpDateKey(item)
  if (!dateKey || ['FILE_SUBMITTED', 'CLOSED'].includes(item.responseStatus)) return false
  const today = todayKey()
  return dateKey > today && dateKey <= addDaysToDateKey(today, 7)
}

function isNoDeadlineFollowUp(item: FollowUpItem) {
  return !followUpDateKey(item) && !['FILE_SUBMITTED', 'CLOSED'].includes(item.responseStatus)
}

function isTodayFollowUpSchedule(
  nextFollowUpAt: string | null,
  deadline: string,
  responseStatus: keyof typeof RESPONSE_MAP,
) {
  if (responseStatus === 'FILE_SUBMITTED' || responseStatus === 'CLOSED') return false
  const today = todayKey()
  if (nextFollowUpAt) {
    const followUpDate = new Date(nextFollowUpAt)
    if (!Number.isNaN(followUpDate.getTime())) return todayKey(followUpDate) <= today
  }
  return Boolean(deadline && deadline <= today)
}

function followUpDateKey(item: FollowUpItem) {
  if (item.nextFollowUpAt) {
    const followUpDate = new Date(item.nextFollowUpAt)
    if (!Number.isNaN(followUpDate.getTime())) return todayKey(followUpDate)
  }
  return item.deadline || null
}

function addDaysToDateKey(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00`)
  date.setDate(date.getDate() + days)
  return todayKey(date)
}

function buildMessage(items: FollowUpItem[]) {
  const first = items[0]
  if (!first) return ''
  const name = first.personName === 'Chưa xác định' || first.personName === 'Chưa gắn người nộp' ? 'anh/chị' : first.personName

  if (items.length > 1) {
    const lines = items.map((item, index) => {
      const deadline = item.deadline ? ` · Deadline: ${formatDateOnly(item.deadline)}` : ''
      return `${index + 1}. ${item.itemTitle}${deadline}`
    })
    return [
      `${name} ơi, em gom các mục đang cần anh/chị cập nhật để em chốt tiến độ dự án:`,
      '',
      ...lines,
      '',
      'Nhờ anh/chị gửi file/link hoặc phản hồi trạng thái giúp em trong hôm nay nhé.',
    ].join('\n')
  }

  const escalationIntro = first.sentCount >= 2
    ? `${name} ơi, em nhắc thêm lần ${first.sentCount + 1} vì mục này đang ảnh hưởng tiến độ chung.`
    : `${name} ơi, phần “${first.itemTitle}” đang cần nộp file/báo cáo để em cập nhật tiến độ dự án.`

  return [
    escalationIntro,
    '',
    `Dự án: ${first.projectName}`,
    `Deadline: ${first.deadline ? formatDateOnly(first.deadline) : 'Chưa có'}`,
    `Trạng thái: ${first.statusLabel}`,
    `Đã nhắc: ${first.sentCount} lần`,
    '',
    first.sentCount >= 2
      ? 'Nhờ anh/chị phản hồi giúp em thời điểm chốt hoặc gửi lại file/link ngay khi có thể.'
      : 'Nhờ anh/chị gửi lại file hoặc link giúp em trong hôm nay nhé.',
  ].join('\n')
}

function resolveNextFollowUpAt(option: NextOption, customValue: string) {
  if (option === 'custom') {
    const custom = new Date(customValue)
    return Number.isNaN(custom.getTime()) ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() : custom.toISOString()
  }
  const now = new Date()
  if (option === '2h') return new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString()
  if (option === '24h') return new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString()
  if (option === 'afternoon') {
    const afternoon = new Date(now)
    afternoon.setHours(15, 0, 0, 0)
    if (afternoon.getTime() <= now.getTime()) afternoon.setDate(afternoon.getDate() + 1)
    return afternoon.toISOString()
  }
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(9, 0, 0, 0)
  return tomorrow.toISOString()
}

function escalationLabel(item: FollowUpItem) {
  if (item.responseStatus === 'ESCALATED') return 'Đã escalate'
  if (item.sentCount >= 3) return 'Escalation level 3'
  if (item.sentCount >= 2) return 'Escalation level 2'
  if (item.isOverdue) return 'Quá hạn cần xử lý'
  return 'Theo dõi'
}

function makeZaloUrl(phone: string | null) {
  const digits = phone?.replace(/\D/g, '') ?? ''
  return digits ? `https://zalo.me/${digits}` : null
}

function fallbackCopyText(text: string) {
  if (typeof document === 'undefined') return false
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  textarea.style.top = '0'
  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()
  let copied = false
  try {
    copied = document.execCommand('copy')
  } catch {
    copied = false
  } finally {
    textarea.remove()
  }
  return copied
}

function toMap<T extends { id: string }>(items: T[]): Record<string, T> {
  return Object.fromEntries(items.map((item) => [item.id, item]))
}

function todayKey(date = new Date()) {
  const now = date
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function formatDateOnly(value: string) {
  const date = new Date(value.includes('T') ? value : `${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

const pageStyle: React.CSSProperties = {
  padding: 'var(--space-6)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-5)',
}

const toastStyle = (tone: 'ok' | 'error' | 'info'): React.CSSProperties => ({
  position: 'fixed',
  top: 18,
  right: 18,
  zIndex: 80,
  padding: '10px 14px',
  borderRadius: 'var(--radius-lg)',
  border: '1px solid var(--color-border-strong)',
  background: tone === 'error' ? 'var(--color-danger-bg)' : tone === 'ok' ? 'var(--color-success-bg)' : 'var(--color-surface)',
  color: tone === 'error' ? 'var(--color-danger)' : tone === 'ok' ? 'var(--color-success)' : 'var(--color-text)',
  fontSize: 13,
  fontWeight: 700,
  boxShadow: 'var(--shadow-md)',
})

const summaryGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
  gap: 'var(--space-3)',
}

const summaryCard: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '16px 18px',
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-lg)',
  boxShadow: 'var(--shadow-sm)',
}

const summaryIcon: React.CSSProperties = {
  width: 38,
  height: 38,
  borderRadius: 'var(--radius-md)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 18,
}

const summaryValue: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 24,
  lineHeight: 1,
  fontWeight: 700,
  color: 'var(--color-text)',
}

const summaryLabel: React.CSSProperties = {
  marginTop: 4,
  fontSize: 12,
  color: 'var(--color-text-muted)',
}

const layoutGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1.42fr) minmax(320px, 0.72fr)',
  gap: 'var(--space-4)',
  alignItems: 'start',
}

const sideColumn: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
}

const panelStyle: React.CSSProperties = {
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-xl)',
  boxShadow: 'var(--shadow-sm)',
  overflow: 'hidden',
}

const tableHead: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--space-3)',
  padding: '18px 20px 14px',
  borderBottom: '1px solid var(--color-border)',
}

const asideHead: React.CSSProperties = {
  padding: '18px 20px 14px',
  borderBottom: '1px solid var(--color-border)',
}

const headLabel: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  color: 'var(--color-text)',
}

const headMeta: React.CSSProperties = {
  marginTop: 4,
  fontSize: 12,
  color: 'var(--color-text-muted)',
}

const headCount: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--color-text-muted)',
}

const followUpTabsStyle: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  padding: '0 20px 14px',
  borderBottom: '1px solid var(--color-border)',
}

const followUpTabStyle = (active: boolean): React.CSSProperties => ({
  border: `1px solid ${active ? 'var(--brand-lime-border)' : 'var(--color-border)'}`,
  borderRadius: '999px',
  background: active ? 'var(--brand-lime-soft)' : 'var(--color-surface-2)',
  color: active ? 'var(--color-text)' : 'var(--color-text-muted)',
  padding: '7px 12px',
  fontSize: 12,
  fontWeight: 800,
  cursor: 'pointer',
})

const tableHeaderRow: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1.15fr 96px 138px 130px',
  gap: 12,
  padding: '10px 20px',
  background: 'var(--color-surface-2)',
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--color-text-muted)',
}

const groupPanelStyle: React.CSSProperties = {
  borderTop: '1px solid var(--color-border)',
  background: 'var(--color-surface)',
}

const groupHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  padding: '12px 20px',
  background: 'linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0)), var(--color-surface-2)',
}

const groupToggleStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 10,
  minWidth: 0,
  border: 0,
  background: 'transparent',
  color: 'var(--color-text)',
  cursor: 'pointer',
  textAlign: 'left',
}

const groupStatsStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flexWrap: 'wrap',
  justifyContent: 'flex-end',
}

const groupStatPillStyle = (tone: 'warning' | 'danger' | 'neutral'): React.CSSProperties => ({
  padding: '4px 8px',
  borderRadius: '999px',
  background: tone === 'danger' ? 'var(--color-danger-bg)' : tone === 'warning' ? 'var(--color-warning-bg)' : 'var(--color-surface)',
  color: tone === 'danger' ? 'var(--color-danger)' : tone === 'warning' ? 'var(--color-warning)' : 'var(--color-text-muted)',
  fontSize: 11,
  fontWeight: 800,
})

const groupComposeButtonStyle: React.CSSProperties = {
  border: '1px solid var(--brand-lime-border)',
  borderRadius: '999px',
  background: 'var(--brand-lime-soft)',
  color: 'var(--color-text)',
  padding: '5px 10px',
  fontSize: 11,
  fontWeight: 800,
  cursor: 'pointer',
}

const tableRow: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1.15fr 96px 138px 130px',
  gap: 12,
  alignItems: 'center',
  padding: '14px 20px',
  width: '100%',
  textAlign: 'left',
  background: 'transparent',
  color: 'inherit',
  border: 0,
  cursor: 'pointer',
}

const rowTitle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: 'var(--color-text)',
}

const rowMeta: React.CSSProperties = {
  marginTop: 4,
  fontSize: 11,
  color: 'var(--color-text-muted)',
  lineHeight: 1.45,
}

const centerCell: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
}

const countBubble = (isHot: boolean): React.CSSProperties => ({
  minWidth: 42,
  padding: '4px 10px',
  borderRadius: 'var(--radius-full)',
  textAlign: 'center',
  fontSize: 11,
  fontWeight: 700,
  color: isHot ? 'var(--color-danger)' : 'var(--color-text)',
  background: isHot ? 'var(--color-danger-bg)' : 'var(--color-surface-2)',
})

const badgeBase: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '4px 10px',
  borderRadius: 'var(--radius-full)',
  fontSize: 11,
  fontWeight: 700,
}

const stackStyle: React.CSSProperties = {
  padding: 14,
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
}

const groupButtonStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  padding: 12,
  borderRadius: 'var(--radius-lg)',
  border: '1px solid var(--color-border)',
  background: 'var(--color-surface-2)',
  color: 'inherit',
  cursor: 'pointer',
  textAlign: 'left',
}

const groupFootStyle: React.CSSProperties = {
  marginTop: 9,
  color: 'var(--color-warning)',
  fontSize: 11,
  fontWeight: 700,
}

const priorityItemButton: React.CSSProperties = {
  ...groupButtonStyle,
}

const priorityTitle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: 'var(--color-text)',
}

const priorityMeta: React.CSSProperties = {
  marginTop: 4,
  fontSize: 11,
  color: 'var(--color-text-muted)',
  lineHeight: 1.45,
}

const emptyState: React.CSSProperties = {
  padding: '38px 24px',
  textAlign: 'center',
  color: 'var(--color-text-muted)',
  fontSize: 13,
}

const emptySmall: React.CSSProperties = {
  padding: '10px 4px',
  textAlign: 'center',
  color: 'var(--color-text-muted)',
  fontSize: 12,
}

const drawerBackdrop: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 70,
  background: 'rgba(0, 0, 0, 0.54)',
  display: 'flex',
  justifyContent: 'flex-end',
}

const drawerStyle: React.CSSProperties = {
  width: 'min(560px, 100vw)',
  height: '100vh',
  background: 'var(--color-surface)',
  borderLeft: '1px solid var(--color-border-strong)',
  boxShadow: 'var(--shadow-lg)',
  overflow: 'auto',
}

const drawerHeader: React.CSSProperties = {
  position: 'sticky',
  top: 0,
  zIndex: 2,
  display: 'flex',
  justifyContent: 'space-between',
  gap: 12,
  padding: '18px 20px',
  borderBottom: '1px solid var(--color-border)',
  background: 'var(--color-surface)',
}

const drawerBody: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
  padding: 18,
}

const eyebrow: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  textTransform: 'uppercase',
  color: 'var(--color-text-muted)',
}

const drawerTitle: React.CSSProperties = {
  marginTop: 4,
  fontSize: 21,
  fontWeight: 800,
  color: 'var(--color-text)',
}

const drawerMeta: React.CSSProperties = {
  marginTop: 4,
  fontSize: 12,
  color: 'var(--color-text-muted)',
}

const iconButtonStyle: React.CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--color-border)',
  color: 'var(--color-text)',
  background: 'var(--color-surface-2)',
}

const infoGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 10,
}

const infoBlockStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 5,
  padding: 11,
  borderRadius: 'var(--radius-lg)',
  border: '1px solid var(--color-border)',
  background: 'var(--color-surface-2)',
  fontSize: 12,
  color: 'var(--color-text-muted)',
}

const owedBox: React.CSSProperties = {
  padding: 13,
  borderRadius: 'var(--radius-lg)',
  border: '1px solid var(--color-border)',
  background: 'var(--color-surface-2)',
}

const boxTitle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 800,
  color: 'var(--color-text)',
  marginBottom: 8,
}

const owedItemStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  padding: '9px 0',
  borderTop: '1px solid var(--color-border)',
  color: 'var(--color-text)',
  fontSize: 13,
}

const contactWarning: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 'var(--radius-lg)',
  background: 'var(--color-warning-bg)',
  color: 'var(--color-warning)',
  fontSize: 12,
  fontWeight: 700,
}

const fieldLabel: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 7,
  fontSize: 12,
  fontWeight: 700,
  color: 'var(--color-text)',
}

const messageTextarea: React.CSSProperties = {
  minHeight: 190,
  resize: 'vertical',
  borderRadius: 'var(--radius-lg)',
  border: '1px solid var(--color-border-strong)',
  background: 'var(--color-surface-2)',
  color: 'var(--color-text)',
  padding: 12,
  lineHeight: 1.55,
}

const nextGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
  gap: 10,
  alignItems: 'end',
}

const selectStyle: React.CSSProperties = {
  width: '100%',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--color-border)',
  background: 'var(--color-surface-2)',
  color: 'var(--color-text)',
  padding: '10px 11px',
}

const nextPreviewStyle: React.CSSProperties = {
  padding: '10px 11px',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--color-border)',
  background: 'var(--color-surface-2)',
  color: 'var(--color-text-muted)',
  fontSize: 12,
}

const buttonGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 9,
}

const secondaryButton: React.CSSProperties = {
  display: 'inline-flex',
  justifyContent: 'center',
  alignItems: 'center',
  gap: 7,
  padding: '10px 12px',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--color-border)',
  background: 'var(--color-surface-2)',
  color: 'var(--color-text)',
  fontSize: 13,
  fontWeight: 700,
}

const secondaryDangerButton: React.CSSProperties = {
  ...secondaryButton,
  color: 'var(--color-danger)',
  background: 'var(--color-danger-bg)',
}

const drawerFooter: React.CSSProperties = {
  display: 'flex',
  gap: 10,
  justifyContent: 'flex-end',
  paddingTop: 2,
}

const primaryButton: React.CSSProperties = {
  ...secondaryButton,
  background: 'var(--lime)',
  color: 'var(--lime-ink)',
  border: '1px solid transparent',
}

const historyBox: React.CSSProperties = {
  paddingTop: 2,
}

const logItemStyle: React.CSSProperties = {
  padding: 11,
  borderRadius: 'var(--radius-lg)',
  border: '1px solid var(--color-border)',
  background: 'var(--color-surface-2)',
  marginTop: 8,
}

const logMessageStyle: React.CSSProperties = {
  marginTop: 8,
  whiteSpace: 'pre-wrap',
  fontSize: 12,
  lineHeight: 1.5,
  color: 'var(--color-text)',
}
