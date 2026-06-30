'use client'

import React from 'react'
import { DataErrorState } from '@/components/ui/DataErrorState'
import { PageHead } from '@/components/ui/PageHead'
import { useCommandData } from '@/hooks/useCommandData'

const severityMap = {
  critical: {
    label: 'Khẩn cấp',
    color: 'var(--color-danger)',
    bg: 'var(--color-danger-bg)',
    icon: 'ti-alert-octagon',
  },
  warning: {
    label: 'Cần theo dõi',
    color: 'var(--color-warning)',
    bg: 'var(--color-warning-bg)',
    icon: 'ti-alert-triangle',
  },
  info: {
    label: 'Thông tin',
    color: 'var(--color-waiting)',
    bg: 'var(--color-waiting-bg)',
    icon: 'ti-info-circle',
  },
} as const

export default function CeoReportsPage() {
  const { data, loading, error } = useCommandData()
  const [expandedId, setExpandedId] = React.useState<string | null>(null)

  const requests = data?.ceoRequests ?? []
  const projects = Object.fromEntries((data?.projects ?? []).map((project) => [project.id, project]))
  const approvals = data?.approvals ?? []

  const normalizedRequests = requests.map((item) => {
    const severity =
      item.status === 'critical' || item.status === 'warning' || item.status === 'info'
        ? item.status
        : item.delay_impact
          ? 'warning'
          : 'info'

    return {
      ...item,
      severity,
    }
  })

  const criticalCount = normalizedRequests.filter((item) => item.severity === 'critical').length
  const warningCount = normalizedRequests.filter((item) => item.severity === 'warning').length
  const pendingApproval = approvals.filter((approval) => approval.status === 'PENDING').length

  return (
    <div style={pageStyle}>
      <PageHead
        icon="ti-presentation-analytics"
        title="Báo cáo CEO"
        desc="Tập hợp các vấn đề cần xin quyết định, chốt hướng hoặc báo cáo rủi ro."
      />

      {error ? <DataErrorState message={error} /> : null}

      <div style={summaryGrid}>
        <TopMetric icon="ti-flame" label="Mục khẩn cấp" value={criticalCount} tone="danger" />
        <TopMetric icon="ti-alert-triangle" label="Mục cần theo dõi" value={warningCount} tone="warning" />
        <TopMetric icon="ti-checklist" label="Yêu cầu CEO hiện có" value={normalizedRequests.length} tone="olive" />
        <TopMetric icon="ti-stamp" label="Phê duyệt đang chờ" value={pendingApproval} tone="neutral" />
      </div>

      <section style={panelStyle}>
        <div style={panelHead}>
          <div>
            <div style={eyebrow}>Danh sách gửi lên</div>
            <div style={panelTitle}>Các vấn đề cần tổng hợp</div>
          </div>
        </div>

        {loading ? (
          <div style={emptyState}>Đang tải danh sách báo cáo...</div>
        ) : normalizedRequests.length === 0 ? (
          <div style={emptyState}>Hiện chưa có mục nào cần trình CEO.</div>
        ) : (
          <div style={stackStyle}>
            {normalizedRequests.map((item) => {
              const severity = severityMap[item.severity as keyof typeof severityMap] ?? severityMap.info
              const isOpen = expandedId === item.id
              const project = item.project_id ? projects[item.project_id] : null

              return (
                <div key={item.id} style={requestCard}>
                  <button
                    onClick={() => setExpandedId(isOpen ? null : item.id)}
                    style={requestButton}
                  >
                    <div style={{ ...iconChip, background: severity.bg, color: severity.color }}>
                      <i className={`ti ${severity.icon}`} />
                    </div>

                    <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                      <div style={requestTitle}>{item.title}</div>
                      <div style={requestMeta}>
                        <span>{project?.name ?? 'Chưa gắn dự án'}</span>
                        <span>
                          {item.created_at
                            ? new Date(item.created_at).toLocaleDateString('vi-VN')
                            : 'Chưa có ngày'}
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ ...statusBadge, color: severity.color, background: severity.bg }}>
                        {severity.label}
                      </span>
                      <i
                        className={`ti ${isOpen ? 'ti-chevron-up' : 'ti-chevron-down'}`}
                        style={{ fontSize: 14, color: 'var(--color-text-muted)' }}
                      />
                    </div>
                  </button>

                  {isOpen ? (
                    <div style={detailWrap}>
                      <InfoBlock
                        label="Bối cảnh"
                        text={item.context ?? 'Chưa có mô tả bối cảnh.'}
                      />
                      <InfoBlock
                        label="Ảnh hưởng nếu trễ"
                        text={item.delay_impact ?? 'Chưa ghi nhận ảnh hưởng cụ thể.'}
                      />
                      <InfoBlock
                        label="Đề xuất hành động"
                        text={item.recommendation ?? 'Chưa có đề xuất.'}
                      />
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

function TopMetric({
  icon,
  label,
  value,
  tone,
}: {
  icon: string
  label: string
  value: number
  tone: 'danger' | 'warning' | 'olive' | 'neutral'
}) {
  const color =
    tone === 'danger'
      ? 'var(--color-danger)'
      : tone === 'warning'
        ? 'var(--color-warning)'
        : tone === 'olive'
          ? 'var(--color-olive)'
          : 'var(--color-text)'

  const bg =
    tone === 'danger'
      ? 'var(--color-danger-bg)'
      : tone === 'warning'
        ? 'var(--color-warning-bg)'
        : tone === 'olive'
          ? 'rgba(45, 51, 26, 0.08)'
          : 'var(--color-surface-2)'

  return (
    <div style={metricCard}>
      <div style={{ ...iconChip, background: bg, color }}>
        <i className={`ti ${icon}`} />
      </div>
      <div>
        <div style={metricValue}>{value}</div>
        <div style={metricLabel}>{label}</div>
      </div>
    </div>
  )
}

function InfoBlock({ label, text }: { label: string; text: string }) {
  return (
    <div style={infoBlock}>
      <div style={infoLabel}>{label}</div>
      <div style={infoText}>{text}</div>
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

const iconChip: React.CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 'var(--radius-md)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 18,
  flexShrink: 0,
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

const stackStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  padding: 14,
}

const requestCard: React.CSSProperties = {
  borderRadius: 'var(--radius-lg)',
  border: '1px solid var(--color-border)',
  background: 'var(--color-surface-2)',
  overflow: 'hidden',
}

const requestButton: React.CSSProperties = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  padding: 14,
  background: 'transparent',
  border: 'none',
  textAlign: 'left',
}

const requestTitle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  color: 'var(--color-text)',
}

const requestMeta: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 10,
  marginTop: 6,
  fontSize: 11,
  color: 'var(--color-text-muted)',
}

const statusBadge: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '4px 10px',
  borderRadius: 'var(--radius-full)',
  fontSize: 11,
  fontWeight: 700,
}

const detailWrap: React.CSSProperties = {
  padding: '0 14px 14px',
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: 12,
}

const infoBlock: React.CSSProperties = {
  padding: 14,
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--color-border)',
  background: 'var(--color-surface)',
}

const infoLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--color-text-muted)',
}

const infoText: React.CSSProperties = {
  marginTop: 8,
  fontSize: 12,
  lineHeight: 1.55,
  color: 'var(--color-text)',
}

const emptyState: React.CSSProperties = {
  padding: '38px 24px',
  textAlign: 'center',
  color: 'var(--color-text-muted)',
  fontSize: 13,
}
