'use client'

import React from 'react'
import { DataErrorState } from '@/components/ui/DataErrorState'
import { PageHead } from '@/components/ui/PageHead'
import { getVietnamDateKey } from '@/features/command-center/utils'
import { useCommandData } from '@/hooks/useCommandData'
import type {
  CommandCenterApprovalRow,
  CommandCenterDeliverableRow,
  CommandCenterPersonRow,
  CommandCenterTaskRow,
} from '@/lib/database.types'

export default function ApprovalsPage() {
  const { data, loading, error } = useCommandData()
  const approvals: CommandCenterApprovalRow[] = data?.approvals ?? []
  const people = Object.fromEntries(
    ((data?.people ?? []) as CommandCenterPersonRow[]).map((person) => [person.id, person]),
  )
  const tasks = Object.fromEntries(
    ((data?.tasks ?? []) as CommandCenterTaskRow[]).map((task) => [task.id, task]),
  )
  const deliverables = Object.fromEntries(
    ((data?.deliverables ?? []) as CommandCenterDeliverableRow[]).map((deliverable) => [deliverable.id, deliverable]),
  )

  const today = getVietnamDateKey()
  const [nowTs] = React.useState(() => Date.now())

  const overdue = approvals.filter((item) => item.status === 'PENDING' && item.due_at && item.due_at < today)
  const pending = approvals.filter((item) => item.status === 'PENDING' && (!item.due_at || item.due_at >= today))
  const done = approvals.filter((item) => item.status !== 'PENDING')

  function getTitle(approval: CommandCenterApprovalRow) {
    const task = approval.task_id ? tasks[approval.task_id] : null
    const deliverable = approval.deliverable_id ? deliverables[approval.deliverable_id] : null
    return task?.title ?? deliverable?.name ?? 'Yêu cầu phê duyệt'
  }

  return (
    <div style={pageStyle}>
      <PageHead
        icon="ti-checkup-list"
        title="Phê duyệt"
        desc="Cụm việc chờ duyệt, quá hạn, đã xử lý và tình trạng bàn giao."
        actions={<GhostButton icon="ti-filter">Lọc</GhostButton>}
      />

      {error ? <DataErrorState message={error} /> : null}

      <div style={panelGrid}>
        <StatusPanel title="Quá hạn duyệt" icon="ti-alarm" accent="var(--color-danger)" items={overdue} getTitle={getTitle} />
        <StatusPanel title="Chờ duyệt" icon="ti-hourglass" accent="var(--color-warning)" items={pending} getTitle={getTitle} />
        <StatusPanel title="Đã xử lý" icon="ti-circle-check" accent="var(--color-success)" items={done} getTitle={getTitle} />
      </div>

      <section style={sectionCard} data-vyvy-card="true">
        <table style={tableStyle}>
          <thead>
            <tr>
              <Th>Yêu cầu</Th>
              <Th>Người gửi</Th>
              <Th>Người duyệt</Th>
              <Th>Chờ</Th>
              <Th>Hạn</Th>
              <Th>Trạng thái</Th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <Td colSpan={6}>Đang tải...</Td>
              </tr>
            ) : approvals.length === 0 ? (
              <tr>
                <Td colSpan={6}>Không có yêu cầu phê duyệt nào.</Td>
              </tr>
            ) : (
              approvals.map((approval) => {
                const requester = approval.requested_by ? people[approval.requested_by] : null
                const approver = approval.approver_id ? people[approval.approver_id] : null
                const daysWait = approval.requested_at
                  ? Math.max(0, Math.round((nowTs - new Date(approval.requested_at).getTime()) / 86400000))
                  : 0
                const state = resolveApprovalState(approval, today)

                return (
                  <tr key={approval.id}>
                    <Td>{getTitle(approval)}</Td>
                    <Td>{requester?.full_name ?? '-'}</Td>
                    <Td>{approver?.full_name ?? '-'}</Td>
                    <Td>{daysWait} ngày</Td>
                    <Td>{approval.due_at ? toShortDate(approval.due_at) : '-'}</Td>
                    <Td>
                      <span style={{ ...pillStyle, background: state.bg, color: state.color }}>{state.label}</span>
                    </Td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </section>

      <div style={noteStyle}>
        <i className="ti ti-versions" style={{ color: 'var(--color-warning)', fontSize: 16, marginTop: 1 }} />
        <div>
          Nếu deliverable bị yêu cầu sửa lại, completion gate của task liên quan vẫn khóa cho tới khi được duyệt lại.
        </div>
      </div>
    </div>
  )
}

function StatusPanel({
  title,
  icon,
  accent,
  items,
  getTitle,
}: {
  title: string
  icon: string
  accent: string
  items: CommandCenterApprovalRow[]
  getTitle: (item: CommandCenterApprovalRow) => string
}) {
  return (
    <section style={panelStyle} data-vyvy-card="true">
      <div style={{ ...panelHeaderStyle, borderLeft: `3px solid ${accent}` }}>
        <i className={`ti ${icon}`} style={{ color: accent }} />
        <span>{title}</span>
        <span style={countBadge}>{items.length}</span>
      </div>
      <div style={{ padding: 12 }}>
        {items.length === 0 ? (
          <div style={emptyStyle}>Không có mục nào</div>
        ) : (
          items.slice(0, 4).map((item) => (
            <div key={item.id} style={miniRowStyle} data-vyvy-row="true">
              <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--txt)' }}>{getTitle(item)}</div>
              <div style={{ fontSize: 11.5, color: 'var(--txt-3)' }}>
                {item.due_at ? `Hạn ${toShortDate(item.due_at)}` : 'Chưa có hạn'}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  )
}

function resolveApprovalState(approval: CommandCenterApprovalRow, today: string) {
  if (approval.status === 'APPROVED') {
    return { label: 'Đã duyệt', bg: 'var(--color-success-bg)', color: 'var(--color-success)' }
  }
  if (approval.status === 'REJECTED') {
    return { label: 'Từ chối', bg: 'var(--color-danger-bg)', color: 'var(--color-danger)' }
  }
  if (approval.due_at && approval.due_at < today) {
    return { label: 'Quá hạn', bg: 'var(--color-danger-bg)', color: 'var(--color-danger)' }
  }
  return { label: 'Chờ duyệt', bg: 'var(--color-warning-bg)', color: 'var(--color-warning)' }
}

function GhostButton({ children, icon }: { children: React.ReactNode; icon: string }) {
  return (
    <button style={ghostBtnStyle}>
      <i className={`ti ${icon}`} />
      {children}
    </button>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return <th style={thStyle}>{children}</th>
}

function Td({ children, colSpan }: { children: React.ReactNode; colSpan?: number }) {
  return <td colSpan={colSpan} style={tdStyle}>{children}</td>
}

function toShortDate(value: string) {
  return new Date(value).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })
}

const pageStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 18,
}

const panelGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: 16,
}

const sectionCard: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--line)',
  borderRadius: 12,
  overflow: 'hidden',
}

const panelStyle: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--line)',
  borderRadius: 12,
  overflow: 'hidden',
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

const countBadge: React.CSSProperties = {
  marginLeft: 'auto',
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--txt-2)',
  background: 'var(--surface-2)',
  border: '1px solid var(--line)',
  padding: '2px 8px',
  borderRadius: 999,
}

const miniRowStyle: React.CSSProperties = {
  padding: '9px 0',
  borderBottom: '1px solid var(--line)',
}

const emptyStyle: React.CSSProperties = {
  color: 'var(--txt-3)',
  fontSize: 12,
  padding: '10px 0',
}

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 13,
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.6px',
  color: 'var(--txt-3)',
  fontWeight: 700,
  padding: '10px 12px',
  borderBottom: '1px solid var(--line)',
  background: 'var(--surface-2)',
}

const tdStyle: React.CSSProperties = {
  padding: '12px',
  borderBottom: '1px solid var(--line)',
  verticalAlign: 'middle',
  color: 'var(--txt-2)',
}

const pillStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  fontSize: 11,
  fontWeight: 700,
  padding: '2px 9px',
  borderRadius: 20,
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
