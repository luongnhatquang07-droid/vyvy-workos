'use client'

import React from 'react'
import { DataErrorState } from '@/components/ui/DataErrorState'
import { PageHead } from '@/components/ui/PageHead'
import { getVietnamDateKey } from '@/features/command-center/utils'
import { useCommandData } from '@/hooks/useCommandData'

type MemberLoad = {
  id: string
  fullName: string
  role: string
  active: number
  blocked: number
  overdue: number
  completed: number
}

export default function TeamWorkloadPage() {
  const { data, loading, error } = useCommandData()

  const people = data?.people ?? []
  const tasks = data?.tasks ?? []
  const today = getVietnamDateKey()

  const workload: MemberLoad[] = people
    .map((person) => {
      const mine = tasks.filter((task) => task.owner_id === person.id)
      const active = mine.filter((task) =>
        ['NOT_STARTED', 'IN_PROGRESS', 'WAITING', 'PENDING_APPROVAL', 'REVISION_REQUIRED'].includes(
          task.status,
        ),
      ).length
      const blocked = mine.filter((task) => task.status === 'BLOCKED').length
      const completed = mine.filter((task) => task.status === 'COMPLETED').length
      const overdue = mine.filter(
        (task) =>
          task.due_date &&
          task.due_date < today &&
          task.status !== 'COMPLETED' &&
          task.status !== 'CANCELLED',
      ).length

      return {
        id: person.id,
        fullName: person.full_name,
        role: person.job_title ?? 'Chưa có vai trò',
        active,
        blocked,
        overdue,
        completed,
      }
    })
    .sort((a, b) => b.active + b.overdue - (a.active + a.overdue))

  const maxLoad = Math.max(...workload.map((item) => item.active + item.overdue), 1)
  const activeTotal = workload.reduce((sum, item) => sum + item.active, 0)
  const blockedTotal = workload.reduce((sum, item) => sum + item.blocked, 0)
  const overdueTotal = workload.reduce((sum, item) => sum + item.overdue, 0)
  const completedTotal = workload.reduce((sum, item) => sum + item.completed, 0)

  return (
    <div style={pageStyle}>
      <PageHead
        icon="ti-users-group"
        title="Tải việc theo người"
        desc="Xem ai đang ôm nhiều việc, ai đang nghẽn và chỗ nào cần san tải."
      />

      {error ? <DataErrorState message={error} /> : null}

      <div style={summaryGrid}>
        <MetricCard icon="ti-users" label="Nhân sự có dữ liệu" value={workload.length} tone="neutral" />
        <MetricCard icon="ti-briefcase" label="Việc đang mở" value={activeTotal} tone="olive" />
        <MetricCard icon="ti-alert-circle" label="Việc bị chặn" value={blockedTotal} tone="danger" />
        <MetricCard icon="ti-calendar-x" label="Việc trễ hạn" value={overdueTotal} tone="warning" />
        <MetricCard icon="ti-checks" label="Đã hoàn thành" value={completedTotal} tone="success" />
      </div>

      <section style={panelStyle}>
        <div style={panelHead}>
          <div>
            <div style={eyebrow}>Bảng phân bổ</div>
            <div style={panelTitle}>Toàn đội</div>
          </div>
        </div>

        {loading ? (
          <div style={emptyState}>Đang tải phân bổ công việc...</div>
        ) : workload.length === 0 ? (
          <div style={emptyState}>Chưa có nhân sự hoặc chưa gắn owner cho task nào.</div>
        ) : (
          <div style={listStyle}>
            {workload.map((member, index) => {
              const totalOpen = member.active + member.overdue
              const percent = Math.max(8, Math.round((totalOpen / maxLoad) * 100))

              return (
                <div
                  key={member.id}
                  style={{
                    ...memberRow,
                    borderBottom:
                      index < workload.length - 1 ? '1px solid var(--color-border)' : undefined,
                  }}
                >
                  <div style={avatarStyle}>
                    {member.fullName
                      .split(' ')
                      .map((part) => part[0])
                      .join('')
                      .slice(0, 2)
                      .toUpperCase()}
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <div style={nameStyle}>{member.fullName}</div>
                    <div style={roleStyle}>{member.role}</div>
                  </div>

                  <div style={barWrap}>
                    <div style={barTrack}>
                      <div
                        style={{
                          ...barFill,
                          width: `${percent}%`,
                          background:
                            member.overdue > 0
                              ? 'var(--color-danger)'
                              : member.active > 0
                                ? 'var(--color-olive)'
                                : 'var(--color-border-strong)',
                        }}
                      />
                    </div>
                  </div>

                  <div style={statsWrap}>
                    <MiniStat value={member.active} label="Đang làm" tone="olive" />
                    <MiniStat value={member.overdue} label="Trễ" tone="warning" />
                    <MiniStat value={member.blocked} label="Chặn" tone="danger" />
                    <MiniStat value={member.completed} label="Xong" tone="success" />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

function MetricCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: string
  label: string
  value: number
  tone: 'neutral' | 'olive' | 'danger' | 'warning' | 'success'
}) {
  const color =
    tone === 'danger'
      ? 'var(--color-danger)'
      : tone === 'warning'
        ? 'var(--color-warning)'
        : tone === 'success'
          ? 'var(--color-success)'
          : tone === 'olive'
            ? 'var(--color-olive)'
            : 'var(--color-text)'

  const bg =
    tone === 'danger'
      ? 'var(--color-danger-bg)'
      : tone === 'warning'
        ? 'var(--color-warning-bg)'
        : tone === 'success'
          ? 'var(--color-success-bg)'
          : tone === 'olive'
            ? 'rgba(45, 51, 26, 0.08)'
            : 'var(--color-surface-2)'

  return (
    <div style={metricCard}>
      <div style={{ ...metricIcon, color, background: bg }}>
        <i className={`ti ${icon}`} />
      </div>
      <div>
        <div style={metricValue}>{value}</div>
        <div style={metricLabel}>{label}</div>
      </div>
    </div>
  )
}

function MiniStat({
  value,
  label,
  tone,
}: {
  value: number
  label: string
  tone: 'olive' | 'warning' | 'danger' | 'success'
}) {
  const color =
    tone === 'danger'
      ? 'var(--color-danger)'
      : tone === 'warning'
        ? 'var(--color-warning)'
        : tone === 'success'
          ? 'var(--color-success)'
          : 'var(--color-olive)'

  return (
    <div style={miniStat}>
      <div style={{ ...miniValue, color }}>{value}</div>
      <div style={miniLabel}>{label}</div>
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
  gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
  gap: 'var(--space-3)',
}

const metricCard: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '16px 18px',
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-lg)',
  boxShadow: 'var(--shadow-sm)',
}

const metricIcon: React.CSSProperties = {
  width: 38,
  height: 38,
  borderRadius: 'var(--radius-md)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 18,
}

const metricValue: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 24,
  lineHeight: 1,
  fontWeight: 700,
  color: 'var(--color-text)',
}

const metricLabel: React.CSSProperties = {
  marginTop: 4,
  fontSize: 12,
  color: 'var(--color-text-muted)',
}

const panelStyle: React.CSSProperties = {
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-xl)',
  boxShadow: 'var(--shadow-sm)',
  overflow: 'hidden',
}

const panelHead: React.CSSProperties = {
  padding: '18px 20px 14px',
  borderBottom: '1px solid var(--color-border)',
}

const eyebrow: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--color-text-muted)',
  fontWeight: 700,
}

const panelTitle: React.CSSProperties = {
  marginTop: 4,
  fontSize: 18,
  fontWeight: 700,
  color: 'var(--color-text)',
}

const listStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
}

const memberRow: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '48px minmax(180px, 0.8fr) minmax(160px, 1fr) 320px',
  gap: 16,
  alignItems: 'center',
  padding: '16px 20px',
}

const avatarStyle: React.CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 'var(--radius-full)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: 'var(--font-display)',
  fontSize: 13,
  fontWeight: 700,
  color: 'var(--color-text)',
  background: 'var(--color-surface-2)',
  border: '1px solid var(--color-border)',
}

const nameStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: 'var(--color-text)',
}

const roleStyle: React.CSSProperties = {
  marginTop: 4,
  fontSize: 11,
  color: 'var(--color-text-muted)',
}

const barWrap: React.CSSProperties = {
  minWidth: 0,
}

const barTrack: React.CSSProperties = {
  height: 8,
  borderRadius: 'var(--radius-full)',
  background: 'var(--color-surface-2)',
  overflow: 'hidden',
}

const barFill: React.CSSProperties = {
  height: '100%',
  borderRadius: 'var(--radius-full)',
}

const statsWrap: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
  gap: 10,
}

const miniStat: React.CSSProperties = {
  textAlign: 'center',
}

const miniValue: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 18,
  lineHeight: 1,
  fontWeight: 700,
}

const miniLabel: React.CSSProperties = {
  marginTop: 4,
  fontSize: 10,
  color: 'var(--color-text-muted)',
}

const emptyState: React.CSSProperties = {
  padding: '38px 24px',
  textAlign: 'center',
  color: 'var(--color-text-muted)',
  fontSize: 13,
}
