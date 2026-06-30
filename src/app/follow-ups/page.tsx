'use client'

import React from 'react'
import { DataErrorState } from '@/components/ui/DataErrorState'
import { PageHead } from '@/components/ui/PageHead'
import { useCommandData } from '@/hooks/useCommandData'

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

export default function FollowUpsPage() {
  const { data, loading, error } = useCommandData()

  const reminders = [...(data?.reminders ?? [])].sort(
    (a, b) => (b.reminder_level ?? 0) - (a.reminder_level ?? 0),
  )
  const people = Object.fromEntries((data?.people ?? []).map((person) => [person.id, person]))
  const tasks = Object.fromEntries((data?.tasks ?? []).map((task) => [task.id, task]))
  const deliverables = Object.fromEntries((data?.deliverables ?? []).map((item) => [item.id, item]))

  const lateEscalation = reminders.filter(
    (reminder) =>
      reminder.reminder_level >= 2 &&
      ['NO_RESPONSE', 'WAITING_RESPONSE'].includes(reminder.response_status),
  )
  const promised = reminders.filter((reminder) => reminder.response_status === 'PROMISED_DELIVERY')
  const submitted = reminders.filter((reminder) => reminder.response_status === 'FILE_SUBMITTED')
  const pending = reminders.filter((reminder) =>
    ['NOT_REMINDERED', 'REMINDERED', 'WAITING_RESPONSE'].includes(reminder.response_status),
  )

  return (
    <div style={pageStyle}>
      <PageHead
        icon="ti-bell-ringing"
        title="Nhắc việc & theo dõi"
        desc="Quản lý người đang nợ báo cáo, file bàn giao và các lượt follow-up."
      />

      {error ? <DataErrorState message={error} /> : null}

      <div style={summaryGrid}>
        <SummaryCard icon="ti-alert-triangle" label="Cần leo thang" value={lateEscalation.length} tone="danger" highlight />
        <SummaryCard icon="ti-hourglass" label="Đang chờ phản hồi" value={pending.length} tone="warning" />
        <SummaryCard icon="ti-clock-check" label="Đã hứa nộp" value={promised.length} tone="success" />
        <SummaryCard icon="ti-file-check" label="Đã nộp file" value={submitted.length} tone="neutral" />
      </div>

      <div style={layoutGrid}>
        <section style={panelStyle} data-vyvy-card="true">
          <div style={tableHead}>
            <div style={headLabel}>Danh sách đang theo</div>
            <div style={headCount}>{reminders.length} mục</div>
          </div>

          <div style={tableHeaderRow}>
            <span>Người</span>
            <span>Đang nợ</span>
            <span>Số lần nhắc</span>
            <span>Trạng thái</span>
            <span>Lần gần nhất</span>
          </div>

          {loading ? (
            <div style={emptyState}>Đang tải danh sách follow-up...</div>
          ) : reminders.length === 0 ? (
            <div style={emptyState}>Hiện chưa có mục nào cần theo dõi.</div>
          ) : (
            reminders.map((reminder, index) => {
              const person = reminder.person_id ? people[reminder.person_id] : null
              const task = reminder.task_id ? tasks[reminder.task_id] : null
              const deliverable = reminder.deliverable_id ? deliverables[reminder.deliverable_id] : null
              const status =
                RESPONSE_MAP[reminder.response_status as keyof typeof RESPONSE_MAP] ??
                RESPONSE_MAP.NOT_REMINDERED
              const lastReminder = reminder.last_reminded_at
                ? new Date(reminder.last_reminded_at).toLocaleDateString('vi-VN')
                : 'Chưa nhắc'

              return (
                <div
                  key={reminder.id}
                  data-vyvy-row="true"
                  data-vyvy-alert={reminder.reminder_level >= 2 && ['NO_RESPONSE', 'WAITING_RESPONSE'].includes(reminder.response_status) ? 'true' : undefined}
                  style={{
                    ...tableRow,
                    borderBottom:
                      index < reminders.length - 1 ? '1px solid var(--color-border)' : undefined,
                    borderLeft:
                      reminder.reminder_level >= 2 &&
                      ['NO_RESPONSE', 'WAITING_RESPONSE'].includes(reminder.response_status)
                        ? '3px solid var(--color-danger)'
                        : '3px solid transparent',
                  }}
                >
                  <div>
                    <div style={rowTitle}>{person?.full_name ?? 'Chưa xác định'}</div>
                    <div style={rowMeta}>{person?.job_title ?? 'Chưa có chức danh'}</div>
                  </div>
                  <div>
                    <div style={rowTitle}>{deliverable?.name ?? task?.title ?? 'Chưa rõ hạng mục'}</div>
                    <div style={rowMeta}>
                      {deliverable ? 'Bàn giao / file' : 'Task / báo cáo'}
                    </div>
                  </div>
                  <div style={centerCell}>
                    <span style={countBubble(reminder.reminder_level >= 2)}>{reminder.reminder_level}x</span>
                  </div>
                  <div>
                    <span style={{ ...badgeBase, color: status.color, background: status.bg }}>
                      {status.label}
                    </span>
                  </div>
                  <div style={rowMeta}>{lastReminder}</div>
                </div>
              )
            })
          )}
        </section>

        <aside style={sideColumn}>
          <section style={panelStyle} data-vyvy-card="true">
            <div style={asideHead}>
              <div style={headLabel}>Ưu tiên ngay</div>
            </div>
            <div style={stackStyle}>
              {lateEscalation.length === 0 ? (
                <div style={emptySmall}>Chưa có ai cần leo thang.</div>
              ) : (
                lateEscalation.slice(0, 5).map((reminder) => {
                  const person = reminder.person_id ? people[reminder.person_id] : null
                  const task = reminder.task_id ? tasks[reminder.task_id] : null
                  const deliverable = reminder.deliverable_id ? deliverables[reminder.deliverable_id] : null

                  return (
                    <div key={reminder.id} style={priorityItem}>
                      <div style={priorityTitle}>{person?.full_name ?? 'Chưa rõ người'}</div>
                      <div style={priorityMeta}>
                        {deliverable?.name ?? task?.title ?? 'Chưa rõ hạng mục'}
                      </div>
                      <div style={priorityFoot}>
                        <span style={{ ...badgeBase, background: 'var(--color-danger-bg)', color: 'var(--color-danger)' }}>
                          {reminder.reminder_level} lần chưa phản hồi
                        </span>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </section>

          <section style={panelStyle} data-vyvy-card="true">
            <div style={asideHead}>
              <div style={headLabel}>Mẫu tin nhắc</div>
            </div>
            <div style={messageBox}>
              <div style={templateTitle}>Tin nhắc nhẹ</div>
              <p style={templateText}>
                Chào anh/chị, em nhắc lại phần việc đang chờ nộp. Mình giúp em cập nhật trước cuối ngày để team chốt tiến độ nhé.
              </p>
            </div>
            <div style={{ ...messageBox, marginTop: 12 }}>
              <div style={templateTitle}>Tin nhắc escalated</div>
              <p style={templateText}>
                Em cần cập nhật gấp vì hạng mục này đã nhắc nhiều lần và đang ảnh hưởng tiến độ chung. Mình phản hồi giúp em thời điểm chốt mới.
              </p>
            </div>
          </section>
        </aside>
      </div>
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
    <div
      style={summaryCard}
      data-vyvy-card="true"
      data-vyvy-alert={highlight && value > 0 ? 'true' : undefined}
    >
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

const pageStyle: React.CSSProperties = {
  padding: 'var(--space-6)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-5)',
}

const summaryGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
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
  gridTemplateColumns: 'minmax(0, 1.4fr) minmax(320px, 0.72fr)',
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

const headCount: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--color-text-muted)',
}

const tableHeaderRow: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1.1fr 110px 140px 120px',
  gap: 12,
  padding: '10px 20px',
  background: 'var(--color-surface-2)',
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--color-text-muted)',
}

const tableRow: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1.1fr 110px 140px 120px',
  gap: 12,
  alignItems: 'center',
  padding: '14px 20px',
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

const priorityItem: React.CSSProperties = {
  padding: 12,
  borderRadius: 'var(--radius-lg)',
  border: '1px solid var(--color-border)',
  background: 'var(--color-surface-2)',
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

const priorityFoot: React.CSSProperties = {
  marginTop: 10,
}

const messageBox: React.CSSProperties = {
  margin: 14,
  padding: 14,
  borderRadius: 'var(--radius-lg)',
  background: 'var(--color-surface-2)',
  border: '1px solid var(--color-border)',
}

const templateTitle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: 'var(--color-text)',
}

const templateText: React.CSSProperties = {
  marginTop: 6,
  fontSize: 12,
  color: 'var(--color-text-muted)',
  lineHeight: 1.55,
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
