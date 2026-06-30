'use client'

import React from 'react'
import { DataErrorState } from '@/components/ui/DataErrorState'
import { PageHead } from '@/components/ui/PageHead'
import { useCommandData } from '@/hooks/useCommandData'
import type {
  CommandCenterMeetingRow,
  CommandCenterMeetingTaskDraftRow,
} from '@/lib/database.types'

const STATUS_CFG: Record<string, { label: string; color: string; bg: string; grip: string }> = {
  no_minutes: { label: 'Chưa có biên bản', color: 'var(--color-danger)', bg: 'var(--color-danger-bg)', grip: 'var(--color-danger)' },
  minutes_no_tasks: { label: 'Chưa ra task', color: 'var(--color-warning)', bg: 'var(--color-warning-bg)', grip: 'var(--color-warning)' },
  draft_pending: { label: 'Task nháp', color: 'var(--color-warning)', bg: 'var(--color-warning-bg)', grip: 'var(--color-warning)' },
  follow_up_needed: { label: 'Cần follow-up', color: 'var(--color-waiting)', bg: 'var(--color-waiting-bg)', grip: 'var(--color-waiting)' },
  done: { label: 'Đã xong', color: 'var(--color-success)', bg: 'var(--color-success-bg)', grip: 'var(--color-success)' },
  draft: { label: 'Bản nháp', color: 'var(--color-warning)', bg: 'var(--color-warning-bg)', grip: 'var(--color-warning)' },
  published: { label: 'Đã xuất bản', color: 'var(--color-success)', bg: 'var(--color-success-bg)', grip: 'var(--color-success)' },
  scheduled: { label: 'Đã lên lịch', color: 'var(--color-waiting)', bg: 'var(--color-waiting-bg)', grip: 'var(--color-waiting)' },
}

export default function MeetingsPage() {
  const { data, loading, error } = useCommandData()
  const meetings: CommandCenterMeetingRow[] = data?.meetings ?? []
  const drafts: CommandCenterMeetingTaskDraftRow[] = data?.taskDrafts ?? []
  const [selectedId, setSelectedId] = React.useState<string | null>(null)

  const activeMeetingId = selectedId ?? meetings[0]?.id ?? null
  const selectedMeeting = meetings.find((meeting) => meeting.id === activeMeetingId) ?? null
  const selectedDrafts = drafts.filter((draft) => draft.meeting_id === activeMeetingId)

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const todayMeetings = meetings.filter((meeting) => isSameDay(meeting.start_at, today))
  const todayIds = new Set(todayMeetings.map((meeting) => meeting.id))
  const missingMinutes = meetings.filter(
    (meeting) => !todayIds.has(meeting.id) && (!meeting.status || meeting.status === 'no_minutes'),
  )
  const missingMinutesIds = new Set(missingMinutes.map((meeting) => meeting.id))
  const draftPending = meetings.filter((meeting) => {
    if (todayIds.has(meeting.id) || missingMinutesIds.has(meeting.id)) return false
    return drafts.some((draft) => draft.meeting_id === meeting.id && draft.import_status !== 'imported')
  })
  const draftPendingIds = new Set(draftPending.map((meeting) => meeting.id))
  const completed = meetings.filter(
    (meeting) =>
      !todayIds.has(meeting.id) &&
      !missingMinutesIds.has(meeting.id) &&
      !draftPendingIds.has(meeting.id),
  )

  return (
    <div style={pageStyle}>
      <PageHead
        icon="ti-microphone-2"
        title="Họp & biên bản"
        desc="Từ chuẩn bị họp, ghi recap, ra đầu việc tới follow-up sau họp."
        actions={
          <>
            <GhostButton icon="ti-filter">Lọc</GhostButton>
            <PrimaryButton icon="ti-plus">Cuộc họp</PrimaryButton>
          </>
        }
      />

      {error ? <DataErrorState message={error} /> : null}

      {loading ? (
        <section style={loadingCard}>Đang tải...</section>
      ) : (
        <div style={layoutGrid}>
          <section style={panelStyle} data-vyvy-card="true">
            <div style={panelHeaderStyle}>
              <span>Cuộc họp</span>
              <span style={tagStyle}>{meetings.length}</span>
            </div>
            <div style={listPane}>
              <MeetingGroup title="Hôm nay" items={todayMeetings} activeId={activeMeetingId} onSelect={setSelectedId} />
              <MeetingGroup title="Chưa có biên bản" items={missingMinutes} activeId={activeMeetingId} onSelect={setSelectedId} />
              <MeetingGroup title="Chưa import đầu việc" items={draftPending} activeId={activeMeetingId} onSelect={setSelectedId} />
              <MeetingGroup title="Đã xử lý" items={completed} activeId={activeMeetingId} onSelect={setSelectedId} />
              {meetings.length === 0 && <div style={emptyStyle}>Chưa có cuộc họp nào.</div>}
            </div>
          </section>

          <section style={panelStyle}>
            {selectedMeeting ? (
              <>
                <div style={{ ...panelHeaderStyle, justifyContent: 'space-between' }}>
                  <span>{selectedMeeting.title}</span>
                  <span style={statusPill(selectedMeeting.status ?? 'no_minutes').style}>
                    {statusPill(selectedMeeting.status ?? 'no_minutes').label}
                  </span>
                </div>

                <div style={detailBody}>
                  <div style={noteStyle}>
                    <i className="ti ti-sparkles" style={{ color: 'var(--color-warning)', fontSize: 16, marginTop: 1 }} />
                    <div>
                      Biên bản từ transcript chỉ là bản nháp. Cần xem lại quyết định, owner và deadline trước khi import thành đầu việc.
                    </div>
                  </div>

                  <div style={metaGrid}>
                    <MetaCard icon="ti-calendar" label="Thời gian" value={formatMeetingTime(selectedMeeting.start_at)} />
                    <MetaCard icon="ti-file-text" label="Task nháp" value={`${selectedDrafts.length} mục`} />
                    <MetaCard icon="ti-briefcase" label="Dự án" value={selectedMeeting.project_id ? 'Đã gắn' : 'Chưa gắn'} />
                  </div>

                  <div>
                    <div style={subTitleStyle}>Quyết định và recap</div>
                    <div style={mutedBoxStyle}>
                      Chưa có recap chính thức. Sau khi họp, ghi quyết định đã chốt, người phụ trách, deadline và việc cần follow-up.
                    </div>
                  </div>

                  <div>
                    <div style={subTitleStyle}>Lịch sử họp & file</div>
                    <div style={fileGrid}>
                      <FileSlot icon="ti-file-upload" title="File họp" desc="Biên bản, recording, tài liệu trình bày." />
                      <FileSlot icon="ti-link" title="Link liên quan" desc="Drive, Notex, dashboard hoặc báo cáo." />
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div style={emptyStyle}>Chọn một cuộc họp để xem chi tiết.</div>
            )}
          </section>

          <div style={sideColumn}>
            <section style={panelStyle}>
              <div style={panelHeaderStyle}>
                <i className="ti ti-list-check" />
                Checklist sau họp
              </div>
              <div style={checklistStyle}>
                {['Chốt recap', 'Ra đầu việc', 'Gắn owner', 'Gắn deadline', 'Gửi follow-up'].map((item) => (
                  <div key={item} style={checkItemStyle}>
                    <span style={checkboxFake} />
                    {item}
                  </div>
                ))}
              </div>
            </section>

            <section style={{ ...panelStyle, flex: 1 }}>
              <div style={panelHeaderStyle}>
                <i className="ti ti-list-check" />
                Đầu việc nháp
                <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--txt-3)' }}>{selectedDrafts.length}</span>
              </div>
              <div style={{ padding: 8 }}>
                {selectedDrafts.length === 0 ? (
                  <div style={emptyStyle}>Chưa có đầu việc nháp.</div>
                ) : (
                  selectedDrafts.map((draft, index) => (
                    <div key={draft.id} style={draftRowStyle}>
                      <div style={{ width: 3, height: 32, borderRadius: 2, background: 'var(--color-warning)', flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--txt)' }}>Draft #{index + 1}</div>
                        <div style={{ fontSize: 11, color: 'var(--txt-3)' }}>{draft.import_status ?? 'pending'}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
              {selectedDrafts.length > 0 && (
                <div style={{ padding: '8px 12px', borderTop: '1px solid var(--line)' }}>
                  <PrimaryButton icon="ti-download">Import vào hệ thống</PrimaryButton>
                </div>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  )
}

function MeetingGroup({
  title,
  items,
  activeId,
  onSelect,
}: {
  title: string
  items: CommandCenterMeetingRow[]
  activeId: string | null
  onSelect: (value: string) => void
}) {
  if (items.length === 0) return null

  return (
    <div>
      <div style={groupTitleStyle}>{title}</div>
      {items.map((meeting) => {
        const status = statusPill(meeting.status ?? 'no_minutes')
        return (
          <button
            key={meeting.id}
            data-vyvy-row="true"
            onClick={() => onSelect(meeting.id)}
            style={{
              ...meetingRowStyle,
              border: activeId === meeting.id ? '1px solid var(--line-3)' : '1px solid transparent',
              background: activeId === meeting.id ? 'var(--surface-2)' : 'transparent',
            }}
          >
            <div style={{ width: 3, height: 30, borderRadius: 3, background: status.grip, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={meetingTitleStyle}>{meeting.title}</div>
              <div style={meetingTimeStyle}>{formatMeetingTime(meeting.start_at)}</div>
            </div>
            <span style={status.style}>{status.label}</span>
          </button>
        )
      })}
    </div>
  )
}

function statusPill(status: string) {
  const config = STATUS_CFG[status] ?? STATUS_CFG.no_minutes
  return {
    ...config,
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      fontSize: 11,
      fontWeight: 700,
      padding: '2px 9px',
      borderRadius: 20,
      background: config.bg,
      color: config.color,
      flexShrink: 0,
    } satisfies React.CSSProperties,
  }
}

function isSameDay(input: string | null, compare: Date) {
  if (!input) return false
  const date = new Date(input)
  date.setHours(0, 0, 0, 0)
  return date.getTime() === compare.getTime()
}

function formatMeetingTime(value: string | null) {
  if (!value) return 'Chưa có lịch'
  return new Date(value).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function MetaCard({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div style={metaCardStyle}>
      <i className={`ti ${icon}`} style={{ color: 'var(--color-olive)' }} />
      <div>
        <div style={metaLabelStyle}>{label}</div>
        <div style={metaValueStyle}>{value}</div>
      </div>
    </div>
  )
}

function FileSlot({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div style={fileSlotStyle}>
      <i className={`ti ${icon}`} style={{ fontSize: 18, color: 'var(--color-olive)' }} />
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--txt)' }}>{title}</div>
        <div style={{ fontSize: 11.5, color: 'var(--txt-3)', marginTop: 3 }}>{desc}</div>
      </div>
    </div>
  )
}

function GhostButton({ children, icon }: { children: React.ReactNode; icon: string }) {
  return (
    <button style={ghostBtnStyle}>
      <i className={`ti ${icon}`} />
      {children}
    </button>
  )
}

function PrimaryButton({ children, icon }: { children: React.ReactNode; icon: string }) {
  return (
    <button style={primaryBtnStyle}>
      <i className={`ti ${icon}`} />
      {children}
    </button>
  )
}

const pageStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 18,
}

const layoutGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '280px minmax(0, 1fr) 300px',
  gap: 16,
  minHeight: 'calc(100vh - 180px)',
}

const panelStyle: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--line)',
  borderRadius: 12,
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
}

const panelHeaderStyle: React.CSSProperties = {
  padding: '13px 15px',
  borderBottom: '1px solid var(--line)',
  fontSize: 13,
  fontWeight: 700,
  display: 'flex',
  alignItems: 'center',
  gap: 8,
}

const listPane: React.CSSProperties = {
  padding: 8,
  overflowY: 'auto',
}

const loadingCard: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--line)',
  borderRadius: 12,
  padding: 20,
  color: 'var(--txt-3)',
}

const tagStyle: React.CSSProperties = {
  marginLeft: 'auto',
  fontSize: 11,
  color: 'var(--txt-2)',
  background: 'var(--surface-2)',
  border: '1px solid var(--line)',
  padding: '2px 8px',
  borderRadius: 999,
}

const detailBody: React.CSSProperties = {
  padding: 18,
  display: 'flex',
  flexDirection: 'column',
  gap: 18,
}

const noteStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--txt-2)',
  background: 'var(--surface-2)',
  border: '1px solid var(--line)',
  borderRadius: 9,
  padding: '11px 13px',
  display: 'flex',
  gap: 9,
  alignItems: 'flex-start',
}

const metaGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: 10,
}

const metaCardStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: 12,
  border: '1px solid var(--line)',
  borderRadius: 10,
  background: 'var(--surface-2)',
}

const metaLabelStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--txt-3)',
}

const metaValueStyle: React.CSSProperties = {
  marginTop: 2,
  fontSize: 13,
  fontWeight: 700,
  color: 'var(--txt)',
}

const mutedBoxStyle: React.CSSProperties = {
  border: '1px solid var(--line)',
  background: 'var(--surface-2)',
  borderRadius: 10,
  padding: '14px 16px',
  color: 'var(--txt-3)',
  fontSize: 13,
}

const subTitleStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--txt-3)',
  marginBottom: 8,
}

const fileGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 10,
}

const fileSlotStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 10,
  padding: 12,
  border: '1px solid var(--line)',
  borderRadius: 10,
  background: 'var(--surface-2)',
}

const sideColumn: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
}

const checklistStyle: React.CSSProperties = {
  padding: 14,
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
}

const checkItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  color: 'var(--txt-2)',
  fontSize: 13,
}

const checkboxFake: React.CSSProperties = {
  width: 16,
  height: 16,
  borderRadius: 4,
  border: '1.5px solid var(--line-3)',
  flexShrink: 0,
}

const emptyStyle: React.CSSProperties = {
  textAlign: 'center',
  color: 'var(--txt-3)',
  fontSize: 12.5,
  padding: '26px 16px',
}

const draftRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '7px 8px',
  borderRadius: 8,
}

const groupTitleStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--txt-3)',
  padding: '10px 8px 4px',
}

const meetingRowStyle: React.CSSProperties = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '11px 13px',
  borderRadius: 10,
  cursor: 'pointer',
  textAlign: 'left',
}

const meetingTitleStyle: React.CSSProperties = {
  fontSize: 13.5,
  fontWeight: 700,
  color: 'var(--txt)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const meetingTimeStyle: React.CSSProperties = {
  fontSize: 11.5,
  color: 'var(--txt-3)',
  marginTop: 2,
}

const ghostBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 7,
  padding: '8px 14px',
  borderRadius: 10,
  fontSize: 13,
  fontWeight: 600,
  border: '1px solid var(--line-2)',
  color: 'var(--txt)',
  background: 'transparent',
}

const primaryBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 7,
  padding: '8px 14px',
  borderRadius: 10,
  fontSize: 13,
  fontWeight: 700,
  color: 'var(--lime-ink)',
  background: 'var(--lime)',
}
