'use client'

import React from 'react'
import { DataErrorState } from '@/components/ui/DataErrorState'
import { FileUpload } from '@/components/ui/FileUpload'
import { PageHead } from '@/components/ui/PageHead'
import { getVietnamDateKey } from '@/features/command-center/utils'
import { useCommandData } from '@/hooks/useCommandData'

const statusMap = {
  NOT_SUBMITTED: { label: 'Chưa nộp', color: 'var(--color-danger)', bg: 'var(--color-danger-bg)' },
  SUBMITTED: { label: 'Đã nộp', color: 'var(--color-waiting)', bg: 'var(--color-waiting-bg)' },
  REVIEWING: { label: 'Đang xem', color: 'var(--color-warning)', bg: 'var(--color-warning-bg)' },
  APPROVED: { label: 'Đã duyệt', color: 'var(--color-success)', bg: 'var(--color-success-bg)' },
  REJECTED: { label: 'Bị trả lại', color: 'var(--color-danger)', bg: 'var(--color-danger-bg)' },
  OVERDUE: { label: 'Quá hạn', color: 'var(--color-danger)', bg: 'var(--color-danger-bg)' },
} as const

export default function DeliverablesPage() {
  const { data, loading, error } = useCommandData()
  const [openId, setOpenId] = React.useState<string | null>(null)

  const deliverables = data?.deliverables ?? []
  const people = Object.fromEntries((data?.people ?? []).map((person) => [person.id, person]))
  const tasks = Object.fromEntries((data?.tasks ?? []).map((task) => [task.id, task]))
  const projects = Object.fromEntries((data?.projects ?? []).map((project) => [project.id, project]))
  const today = getVietnamDateKey()
  const workspaceId = data?.workspaceId

  const lateCount = deliverables.filter(
    (item) => item.due_date && item.due_date < today && item.status === 'NOT_SUBMITTED',
  ).length
  const submittedCount = deliverables.filter((item) => item.status === 'SUBMITTED').length
  const approvedCount = deliverables.filter((item) => item.status === 'APPROVED').length

  return (
    <div style={pageStyle}>
      <PageHead
        icon="ti-files"
        title="Tài liệu & bàn giao"
        desc="Theo dõi đầu ra cần nộp, nơi tải file lên và trạng thái duyệt."
      />

      {error ? <DataErrorState message={error} /> : null}

      <div style={summaryGrid}>
        <MetricCard icon="ti-alert-circle" label="Đang trễ hạn" value={lateCount} tone="danger" />
        <MetricCard icon="ti-upload" label="Đã nộp chờ xem" value={submittedCount} tone="warning" />
        <MetricCard icon="ti-rosette-check" label="Đã duyệt" value={approvedCount} tone="success" />
        <MetricCard icon="ti-stack-2" label="Tổng mục bàn giao" value={deliverables.length} tone="neutral" />
      </div>

      <section style={panelStyle}>
        <div style={panelHead}>
          <div>
            <div style={eyebrow}>Danh sách bàn giao</div>
            <div style={panelTitle}>Toàn bộ file và báo cáo</div>
          </div>
        </div>

        {loading ? (
          <div style={emptyState}>Đang tải danh sách bàn giao...</div>
        ) : error ? (
          <div style={errorState}>{error}</div>
        ) : deliverables.length === 0 ? (
          <div style={emptyState}>Chưa có hạng mục bàn giao nào.</div>
        ) : (
          <div style={listStyle}>
            {deliverables.map((item, index) => {
              const isLate = item.due_date && item.due_date < today && item.status === 'NOT_SUBMITTED'
              const statusKey = isLate ? 'OVERDUE' : item.status
              const status =
                statusMap[statusKey as keyof typeof statusMap] ?? statusMap.NOT_SUBMITTED
              const owner = item.submitter_id ? people[item.submitter_id] : null
              const task = item.task_id ? tasks[item.task_id] : null
              const project = item.project_id ? projects[item.project_id] : null
              const isOpen = openId === item.id

              return (
                <div
                  key={item.id}
                  style={{
                    ...rowWrap,
                    borderBottom:
                      index < deliverables.length - 1 ? '1px solid var(--color-border)' : undefined,
                  }}
                >
                  <div style={rowHeader(status.color)}>
                    <div style={fileIcon}>
                      <i className="ti ti-file-text" />
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={itemTitle}>{item.name}</div>
                      <div style={itemMeta}>
                        <span>{owner?.full_name ?? 'Chưa có người nộp'}</span>
                        <span>{project?.name ?? 'Chưa gắn dự án'}</span>
                        <span>{task?.title ?? 'Chưa gắn task'}</span>
                        <span>
                          {item.due_date
                            ? new Date(item.due_date).toLocaleDateString('vi-VN')
                            : 'Chưa có hạn'}
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ ...badgeBase, color: status.color, background: status.bg }}>
                        {status.label}
                      </span>
                      <button
                        onClick={() => setOpenId(isOpen ? null : item.id)}
                        style={uploadButton(isOpen)}
                      >
                        {isOpen ? 'Thu gọn' : 'Tải file'}
                      </button>
                    </div>
                  </div>

                  {isOpen ? (
                    <div style={uploadWrap}>
                      {workspaceId ? (
                        <FileUpload
                          workspaceId={workspaceId}
                          projectId={item.project_id ?? undefined}
                          taskId={item.task_id ?? undefined}
                          deliverableId={item.id}
                          compact
                          label={`Nộp file cho: ${item.name}`}
                          onUploaded={() => setOpenId(null)}
                        />
                      ) : (
                        <div style={errorState}>Chưa xác định được workspace nên chưa thể nộp file.</div>
                      )}
                    </div>
                  ) : null}
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
  tone: 'danger' | 'warning' | 'success' | 'neutral'
}) {
  const color =
    tone === 'danger'
      ? 'var(--color-danger)'
      : tone === 'warning'
        ? 'var(--color-warning)'
        : tone === 'success'
          ? 'var(--color-success)'
          : 'var(--color-text)'
  const bg =
    tone === 'danger'
      ? 'var(--color-danger-bg)'
      : tone === 'warning'
        ? 'var(--color-warning-bg)'
        : tone === 'success'
          ? 'var(--color-success-bg)'
          : 'var(--color-surface-2)'

  return (
    <div style={metricCard}>
      <div style={{ ...metricIcon, background: bg, color }}>
        <i className={`ti ${icon}`} />
      </div>
      <div>
        <div style={metricValue}>{value}</div>
        <div style={metricLabel}>{label}</div>
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

const rowWrap: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
}

const rowHeader = (accent: string): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  padding: '16px 20px',
  borderLeft: `3px solid ${accent}`,
})

const fileIcon: React.CSSProperties = {
  width: 42,
  height: 42,
  borderRadius: 'var(--radius-md)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'var(--color-surface-2)',
  border: '1px solid var(--color-border)',
  color: 'var(--color-text-muted)',
  fontSize: 18,
  flexShrink: 0,
}

const itemTitle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  color: 'var(--color-text)',
}

const itemMeta: React.CSSProperties = {
  display: 'flex',
  gap: 10,
  flexWrap: 'wrap',
  marginTop: 6,
  fontSize: 11,
  color: 'var(--color-text-muted)',
}

const badgeBase: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '4px 10px',
  borderRadius: 'var(--radius-full)',
  fontSize: 11,
  fontWeight: 700,
}

const uploadButton = (open: boolean): React.CSSProperties => ({
  padding: '8px 12px',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--color-border)',
  background: open ? 'var(--color-surface-2)' : 'var(--color-surface)',
  color: 'var(--color-text)',
  fontSize: 12,
  fontWeight: 600,
})

const uploadWrap: React.CSSProperties = {
  padding: '0 20px 18px',
  background: 'var(--color-surface-2)',
}

const emptyState: React.CSSProperties = {
  padding: '38px 24px',
  textAlign: 'center',
  color: 'var(--color-text-muted)',
  fontSize: 13,
}

const errorState: React.CSSProperties = {
  padding: '24px',
  color: 'var(--color-danger)',
  background: 'var(--color-danger-bg)',
  borderTop: '1px solid rgba(184,64,64,0.18)',
  fontSize: 13,
  lineHeight: 1.5,
}
