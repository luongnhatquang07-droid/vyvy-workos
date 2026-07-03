'use client'

import React from 'react'
import { DataErrorState } from '@/components/ui/DataErrorState'
import { PageHead } from '@/components/ui/PageHead'
import { getVietnamDateKey } from '@/features/command-center/utils'
import { useCommandData } from '@/hooks/useCommandData'
import type {
  CommandCenterApprovalRow,
  CommandCenterAttachmentRow,
  CommandCenterDeliverableRow,
  CommandCenterDeliverableVersionRow,
  CommandCenterPersonRow,
  CommandCenterTaskRow,
} from '@/lib/database.types'

type ReviewAction = 'approve' | 'requestRevision' | 'reject'

interface ReviewDialogState {
  approval: CommandCenterApprovalRow
  action: Exclude<ReviewAction, 'approve'>
}

interface VersionDetail {
  id: string
  version_number: number
  external_url: string | null
  attachment: {
    file_name: string | null
    mime_type: string | null
    storage_path: string
    url: string | null
  } | null
}

export default function ApprovalsPage() {
  const { data, loading, error, refresh } = useCommandData()
  const workspaceId = data?.workspaceId ?? ''
  const approvals: CommandCenterApprovalRow[] = data?.approvals ?? []
  const people = React.useMemo(
    () => Object.fromEntries(((data?.people ?? []) as CommandCenterPersonRow[]).map((person) => [person.id, person])),
    [data?.people],
  )
  const tasks = React.useMemo(
    () => Object.fromEntries(((data?.tasks ?? []) as CommandCenterTaskRow[]).map((task) => [task.id, task])),
    [data?.tasks],
  )
  const deliverables = React.useMemo(
    () => Object.fromEntries(((data?.deliverables ?? []) as CommandCenterDeliverableRow[]).map((item) => [item.id, item])),
    [data?.deliverables],
  )
  const attachments = React.useMemo(
    () => Object.fromEntries(((data?.attachments ?? []) as CommandCenterAttachmentRow[]).map((item) => [item.id, item])),
    [data?.attachments],
  )
  const versionsByDeliverable = React.useMemo(() => {
    const grouped: Record<string, CommandCenterDeliverableVersionRow[]> = {}
    for (const version of data?.deliverableVersions ?? []) {
      if (!grouped[version.deliverable_id]) grouped[version.deliverable_id] = []
      grouped[version.deliverable_id].push(version)
    }
    for (const versions of Object.values(grouped)) {
      versions.sort((a, b) => b.version_number - a.version_number)
    }
    return grouped
  }, [data?.deliverableVersions])

  const today = getVietnamDateKey()
  const [nowTs] = React.useState(() => Date.now())
  const [busyKey, setBusyKey] = React.useState('')
  const [notice, setNotice] = React.useState('')
  const [actionError, setActionError] = React.useState('')
  const [dialog, setDialog] = React.useState<ReviewDialogState | null>(null)
  const [reason, setReason] = React.useState('')

  const overdue = approvals.filter((item) => isPendingApproval(item) && item.due_at && item.due_at < today)
  const pending = approvals.filter((item) => isPendingApproval(item) && (!item.due_at || item.due_at >= today))
  const done = approvals.filter((item) => !isPendingApproval(item))

  function getApprovalContext(approval: CommandCenterApprovalRow) {
    const task = approval.task_id ? tasks[approval.task_id] : null
    const deliverable = approval.deliverable_id ? deliverables[approval.deliverable_id] : null
    const versions = approval.deliverable_id ? versionsByDeliverable[approval.deliverable_id] ?? [] : []
    const latestVersion = versions[0] ?? null
    const attachment = latestVersion?.attachment_id ? attachments[latestVersion.attachment_id] : null
    const projectId = approval.project_id ?? task?.project_id ?? deliverable?.project_id ?? null
    const workstreamId = task?.workstream_id ?? null

    return {
      task,
      deliverable,
      latestVersion,
      attachment,
      projectId,
      workstreamId,
      title: task?.title ?? deliverable?.name ?? 'Yêu cầu phê duyệt',
      fileName: attachment?.file_name ?? deliverable?.name ?? 'File/báo cáo',
    }
  }

  function getTitle(approval: CommandCenterApprovalRow) {
    return getApprovalContext(approval).title
  }

  async function runReviewAction(approval: CommandCenterApprovalRow, action: ReviewAction, reviewComment = '') {
    const context = getApprovalContext(approval)
    if (!workspaceId || !approval.deliverable_id) {
      setActionError('Thiếu thông tin bàn giao nên chưa thể cập nhật trạng thái.')
      return
    }

    setBusyKey(`${approval.id}:${action}`)
    setActionError('')
    setNotice('')
    try {
      const response = await fetch('/api/deliverables', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          deliverableId: approval.deliverable_id,
          versionId: context.latestVersion?.id,
          action,
          reviewComment: reviewComment || defaultReviewComment(action),
        }),
      })
      const payload = (await response.json()) as { error?: string }
      if (!response.ok || payload.error) {
        throw new Error(payload.error ?? 'Không cập nhật được trạng thái phê duyệt.')
      }
      setNotice(action === 'approve' ? 'Đã đánh dấu file/báo cáo là đã duyệt.' : 'Đã cập nhật trạng thái file/báo cáo.')
      setDialog(null)
      setReason('')
      await refresh({ silent: true })
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Không cập nhật được trạng thái phê duyệt.')
    } finally {
      setBusyKey('')
    }
  }

  function openReviewDialog(approval: CommandCenterApprovalRow, action: Exclude<ReviewAction, 'approve'>) {
    setDialog({ approval, action })
    setReason(action === 'requestRevision' ? 'Cần bổ sung/chỉnh lại file hoặc báo cáo.' : 'File/báo cáo chưa đạt yêu cầu.')
    setActionError('')
    setNotice('')
  }

  async function confirmDialogAction() {
    if (!dialog) return
    await runReviewAction(dialog.approval, dialog.action, reason.trim())
  }

  async function resolveFileUrl(approval: CommandCenterApprovalRow) {
    const context = getApprovalContext(approval)
    if (!workspaceId || !approval.deliverable_id) return null

    const params = new URLSearchParams({ workspaceId, deliverableId: approval.deliverable_id })
    const response = await fetch(`/api/deliverables?${params}`)
    const payload = (await response.json()) as { versions?: VersionDetail[]; error?: string }
    if (!response.ok || payload.error) throw new Error(payload.error ?? 'Không lấy được link file.')

    const version = context.latestVersion?.id
      ? payload.versions?.find((item) => item.id === context.latestVersion?.id) ?? payload.versions?.[0]
      : payload.versions?.[0]
    if (!version) return null
    if (version.external_url) return version.external_url

    const fileName = version.attachment?.file_name ?? context.fileName
    if (isHtmlFile(fileName, version.attachment?.mime_type ?? '')) {
      return htmlPreviewUrl({
        workspaceId,
        storagePath: version.attachment?.storage_path,
        fileName,
      })
    }
    return version.attachment?.url ?? null
  }

  async function openFile(approval: CommandCenterApprovalRow) {
    setActionError('')
    try {
      const url = await resolveFileUrl(approval)
      if (!url) throw new Error('File/báo cáo này chưa có link để mở.')
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Không mở được file.')
    }
  }

  async function copyFileLink(approval: CommandCenterApprovalRow) {
    setActionError('')
    try {
      const url = await resolveFileUrl(approval)
      if (!url) throw new Error('File/báo cáo này chưa có link để copy.')
      await navigator.clipboard.writeText(new URL(url, window.location.origin).toString())
      setNotice('Đã copy link file.')
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Không copy được link file.')
    }
  }

  function openTask(approval: CommandCenterApprovalRow) {
    const context = getApprovalContext(approval)
    const params = new URLSearchParams()
    if (context.projectId) params.set('projectId', context.projectId)
    if (approval.task_id) params.set('taskId', approval.task_id)
    if (context.workstreamId) params.set('workstreamId', context.workstreamId)
    params.set('tab', 'overview')
    window.location.href = `/projects?${params.toString()}`
  }

  return (
    <div style={pageStyle}>
      <PageHead
        icon="ti-checkup-list"
        title="Phê duyệt"
        desc="Danh sách file/báo cáo đang chờ Quang xác nhận thủ công."
        actions={<GhostButton icon="ti-filter">Lọc</GhostButton>}
      />

      {error ? <DataErrorState message={error} /> : null}
      {notice ? <div style={noticeStyle}>{notice}</div> : null}
      {actionError ? <div style={errorStyle}>{actionError}</div> : null}

      <div style={panelGrid}>
        <StatusPanel
          title="Quá hạn duyệt"
          icon="ti-alarm"
          accent="var(--color-danger)"
          items={overdue}
          getTitle={getTitle}
          busyKey={busyKey}
          onOpenTask={openTask}
          onApprove={(approval) => void runReviewAction(approval, 'approve')}
          onRevision={(approval) => openReviewDialog(approval, 'requestRevision')}
        />
        <StatusPanel
          title="Chờ duyệt"
          icon="ti-hourglass"
          accent="var(--color-warning)"
          items={pending}
          getTitle={getTitle}
          busyKey={busyKey}
          onOpenTask={openTask}
          onApprove={(approval) => void runReviewAction(approval, 'approve')}
          onRevision={(approval) => openReviewDialog(approval, 'requestRevision')}
        />
        <StatusPanel
          title="Đã xử lý"
          icon="ti-circle-check"
          accent="var(--color-success)"
          items={done}
          getTitle={getTitle}
          busyKey={busyKey}
          onOpenTask={openTask}
          onApprove={(approval) => void runReviewAction(approval, 'approve')}
          onRevision={(approval) => openReviewDialog(approval, 'requestRevision')}
        />
      </div>

      <section style={sectionCard} data-vyvy-card="true">
        <table style={tableStyle}>
          <thead>
            <tr>
              <Th>Yêu cầu</Th>
              <Th>Người gửi</Th>
              <Th>Người xác nhận</Th>
              <Th>Chờ</Th>
              <Th>Hạn</Th>
              <Th>Trạng thái</Th>
              <Th>Thao tác</Th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <Td colSpan={7}>Đang tải...</Td>
              </tr>
            ) : approvals.length === 0 ? (
              <tr>
                <Td colSpan={7}>Không có yêu cầu phê duyệt nào.</Td>
              </tr>
            ) : (
              approvals.map((approval) => {
                const requester = approval.requested_by ? people[approval.requested_by] : null
                const approver = approval.approver_id ? people[approval.approver_id] : null
                const daysWait = approval.requested_at
                  ? Math.max(0, Math.round((nowTs - new Date(approval.requested_at).getTime()) / 86400000))
                  : 0
                const state = resolveApprovalState(approval, today)
                const context = getApprovalContext(approval)
                const reviewer = context.latestVersion?.reviewed_by ? people[context.latestVersion.reviewed_by] : null

                return (
                  <tr key={approval.id}>
                    <Td>
                      <div style={requestCellStyle}>
                        <strong>{context.title}</strong>
                        <span>{context.deliverable?.name ?? context.fileName}</span>
                      </div>
                    </Td>
                    <Td>{requester?.full_name ?? '-'}</Td>
                    <Td>
                      <div style={requestCellStyle}>
                        <span>{reviewer?.full_name ?? approver?.full_name ?? 'Quang/Admin'}</span>
                        {context.latestVersion?.reviewed_at ? <small>{new Date(context.latestVersion.reviewed_at).toLocaleString('vi-VN')}</small> : null}
                      </div>
                    </Td>
                    <Td>{daysWait} ngày</Td>
                    <Td>{approval.due_at ? toShortDate(approval.due_at) : '-'}</Td>
                    <Td>
                      <span style={{ ...pillStyle, background: state.bg, color: state.color }}>{state.label}</span>
                    </Td>
                    <Td>
                      <ApprovalActions
                        approval={approval}
                        busyKey={busyKey}
                        onOpenFile={() => void openFile(approval)}
                        onOpenTask={() => openTask(approval)}
                        onCopyLink={() => void copyFileLink(approval)}
                        onApprove={() => void runReviewAction(approval, 'approve')}
                        onRevision={() => openReviewDialog(approval, 'requestRevision')}
                        onReject={() => openReviewDialog(approval, 'reject')}
                      />
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
          Nếu file/báo cáo bị yêu cầu sửa lại, completion gate của đầu việc liên quan vẫn khóa cho tới khi Quang đánh dấu đã duyệt lại.
        </div>
      </div>

      {dialog ? (
        <div style={modalBackdropStyle} role="dialog" aria-modal="true">
          <div style={modalStyle}>
            <div>
              <div style={modalEyebrowStyle}>{dialog.action === 'reject' ? 'Từ chối / Không đạt' : 'Yêu cầu sửa'}</div>
              <h2 style={modalTitleStyle}>{dialog.action === 'reject' ? 'Đánh dấu file/báo cáo không đạt' : 'Yêu cầu sửa file/báo cáo'}</h2>
              <p style={modalTextStyle}>{getTitle(dialog.approval)}</p>
            </div>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Nhập lý do để sau này nhìn lại biết cần sửa gì..."
              style={textareaStyle}
            />
            <div style={modalActionRowStyle}>
              <button type="button" onClick={() => setDialog(null)} style={secondaryButtonStyle}>
                Hủy
              </button>
              <button type="button" onClick={() => void confirmDialogAction()} disabled={Boolean(busyKey)} style={dangerButtonStyle}>
                Xác nhận
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function StatusPanel({
  title,
  icon,
  accent,
  items,
  getTitle,
  busyKey,
  onOpenTask,
  onApprove,
  onRevision,
}: {
  title: string
  icon: string
  accent: string
  items: CommandCenterApprovalRow[]
  getTitle: (item: CommandCenterApprovalRow) => string
  busyKey: string
  onOpenTask: (item: CommandCenterApprovalRow) => void
  onApprove: (item: CommandCenterApprovalRow) => void
  onRevision: (item: CommandCenterApprovalRow) => void
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
          items.slice(0, 4).map((item) => {
            const pending = isPendingApproval(item)
            return (
              <div key={item.id} style={miniRowStyle} data-vyvy-row="true">
                <button type="button" onClick={() => onOpenTask(item)} style={miniTitleButtonStyle}>
                  {getTitle(item)}
                </button>
                <div style={{ fontSize: 11.5, color: 'var(--txt-3)' }}>
                  {item.due_at ? `Hạn ${toShortDate(item.due_at)}` : 'Chưa có hạn'}
                </div>
                <div style={miniActionRowStyle}>
                  <button type="button" onClick={() => onOpenTask(item)} style={miniButtonStyle}>Mở</button>
                  {pending ? (
                    <>
                      <button type="button" onClick={() => onApprove(item)} disabled={busyKey === `${item.id}:approve`} style={miniPrimaryButtonStyle}>
                        Đã duyệt
                      </button>
                      <button type="button" onClick={() => onRevision(item)} style={miniButtonStyle}>
                        Yêu cầu sửa
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
            )
          })
        )}
      </div>
    </section>
  )
}

function ApprovalActions({
  approval,
  busyKey,
  onOpenFile,
  onOpenTask,
  onCopyLink,
  onApprove,
  onRevision,
  onReject,
}: {
  approval: CommandCenterApprovalRow
  busyKey: string
  onOpenFile: () => void
  onOpenTask: () => void
  onCopyLink: () => void
  onApprove: () => void
  onRevision: () => void
  onReject: () => void
}) {
  const canApprove = canManualApprove(approval)
  return (
    <div style={actionWrapStyle}>
      <button type="button" onClick={onOpenFile} style={secondaryButtonStyle}>
        Mở file
      </button>
      <button type="button" onClick={onOpenTask} style={secondaryButtonStyle}>
        Mở đầu việc
      </button>
      {canApprove ? (
        <button type="button" onClick={onApprove} disabled={busyKey === `${approval.id}:approve`} style={primaryButtonStyle}>
          Đã duyệt
        </button>
      ) : null}
      {approval.status !== 'REVISION_REQUESTED' ? (
        <button type="button" onClick={onRevision} disabled={Boolean(busyKey)} style={warningButtonStyle}>
          Yêu cầu sửa
        </button>
      ) : null}
      {approval.status !== 'REJECTED' ? (
        <button type="button" onClick={onReject} disabled={Boolean(busyKey)} style={dangerGhostButtonStyle}>
          Từ chối
        </button>
      ) : null}
      <button type="button" onClick={onCopyLink} style={iconButtonStyle} title="Copy link">
        <i className="ti ti-link" />
      </button>
    </div>
  )
}

function resolveApprovalState(approval: CommandCenterApprovalRow, today: string) {
  if (approval.status === 'APPROVED') {
    return { label: 'Đã duyệt', bg: 'var(--color-success-bg)', color: 'var(--color-success)' }
  }
  if (approval.status === 'REVISION_REQUESTED') {
    return { label: 'Yêu cầu sửa', bg: 'var(--color-danger-bg)', color: 'var(--color-danger)' }
  }
  if (approval.status === 'REJECTED') {
    return { label: 'Từ chối', bg: 'var(--color-danger-bg)', color: 'var(--color-danger)' }
  }
  if (approval.due_at && approval.due_at < today) {
    return { label: 'Quá hạn', bg: 'var(--color-danger-bg)', color: 'var(--color-danger)' }
  }
  return { label: 'Chờ duyệt', bg: 'var(--color-warning-bg)', color: 'var(--color-warning)' }
}

function isPendingApproval(approval: CommandCenterApprovalRow) {
  return approval.status === 'NOT_REQUESTED' || approval.status === 'PENDING' || approval.status === 'PENDING_REVIEW'
}

function canManualApprove(approval: CommandCenterApprovalRow) {
  return !['APPROVED', 'CANCELLED', 'UPLOADED_BY_MISTAKE', 'SUPERSEDED'].includes(approval.status)
}

function defaultReviewComment(action: ReviewAction) {
  if (action === 'approve') return 'Đã xác nhận thủ công.'
  if (action === 'reject') return 'File/báo cáo chưa đạt yêu cầu.'
  return 'Cần chỉnh sửa/bổ sung file hoặc báo cáo.'
}

function isHtmlFile(name: string, mime = '') {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return ['html', 'htm'].includes(ext) || mime.includes('html') || mime.includes('xhtml')
}

function htmlPreviewUrl({
  workspaceId,
  storagePath,
  fileName,
}: {
  workspaceId?: string
  storagePath?: string | null
  fileName: string
}) {
  if (!workspaceId || !storagePath) return null
  const params = new URLSearchParams({ workspaceId, path: storagePath, name: fileName })
  return `/file-preview/html?${params.toString()}`
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
  overflowX: 'auto',
  overflowY: 'hidden',
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

const miniTitleButtonStyle: React.CSSProperties = {
  border: 0,
  background: 'transparent',
  padding: 0,
  margin: 0,
  color: 'var(--txt)',
  fontSize: 12.5,
  fontWeight: 800,
  textAlign: 'left',
  cursor: 'pointer',
}

const miniActionRowStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
  marginTop: 8,
}

const miniButtonStyle: React.CSSProperties = {
  border: '1px solid var(--line)',
  background: 'var(--surface-2)',
  color: 'var(--txt-2)',
  borderRadius: 8,
  padding: '5px 8px',
  fontSize: 11,
  fontWeight: 800,
  cursor: 'pointer',
}

const miniPrimaryButtonStyle: React.CSSProperties = {
  ...miniButtonStyle,
  background: 'var(--brand-lime-soft)',
  color: 'var(--brand-lime)',
  borderColor: 'var(--brand-lime-border)',
}

const emptyStyle: React.CSSProperties = {
  color: 'var(--txt-3)',
  fontSize: 12,
  padding: '10px 0',
}

const tableStyle: React.CSSProperties = {
  width: '100%',
  minWidth: 980,
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

const requestCellStyle: React.CSSProperties = {
  display: 'grid',
  gap: 4,
}

const pillStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  fontSize: 11,
  fontWeight: 700,
  padding: '2px 9px',
  borderRadius: 20,
  whiteSpace: 'nowrap',
}

const actionWrapStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 7,
  alignItems: 'center',
}

const baseButtonStyle: React.CSSProperties = {
  borderRadius: 9,
  padding: '7px 10px',
  fontSize: 12,
  fontWeight: 800,
  cursor: 'pointer',
  border: '1px solid var(--line)',
  whiteSpace: 'nowrap',
}

const secondaryButtonStyle: React.CSSProperties = {
  ...baseButtonStyle,
  background: 'var(--surface-2)',
  color: 'var(--txt)',
}

const primaryButtonStyle: React.CSSProperties = {
  ...baseButtonStyle,
  background: 'var(--brand-lime)',
  borderColor: 'var(--brand-lime)',
  color: '#111',
}

const warningButtonStyle: React.CSSProperties = {
  ...baseButtonStyle,
  background: 'var(--color-warning-bg)',
  borderColor: 'rgba(245, 158, 11, .35)',
  color: 'var(--color-warning)',
}

const dangerGhostButtonStyle: React.CSSProperties = {
  ...baseButtonStyle,
  background: 'var(--danger-soft)',
  borderColor: 'rgba(239, 68, 68, .3)',
  color: 'var(--danger-text)',
}

const dangerButtonStyle: React.CSSProperties = {
  ...dangerGhostButtonStyle,
  background: 'var(--color-danger)',
  color: '#fff',
}

const iconButtonStyle: React.CSSProperties = {
  ...secondaryButtonStyle,
  width: 34,
  padding: '7px 0',
  display: 'inline-grid',
  placeItems: 'center',
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

const noticeStyle: React.CSSProperties = {
  border: '1px solid var(--brand-lime-border)',
  background: 'var(--brand-lime-soft)',
  color: 'var(--brand-lime)',
  borderRadius: 10,
  padding: '10px 12px',
  fontSize: 13,
  fontWeight: 800,
}

const errorStyle: React.CSSProperties = {
  border: '1px solid rgba(239, 68, 68, .28)',
  background: 'var(--danger-soft)',
  color: 'var(--danger-text)',
  borderRadius: 10,
  padding: '10px 12px',
  fontSize: 13,
  fontWeight: 800,
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

const modalBackdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 80,
  display: 'grid',
  placeItems: 'center',
  padding: 18,
  background: 'rgba(0,0,0,.58)',
  backdropFilter: 'blur(10px)',
}

const modalStyle: React.CSSProperties = {
  width: 'min(520px, 100%)',
  background: 'var(--surface)',
  border: '1px solid var(--line-2)',
  borderRadius: 16,
  padding: 18,
  boxShadow: '0 28px 90px rgba(0,0,0,.45)',
  display: 'grid',
  gap: 14,
}

const modalEyebrowStyle: React.CSSProperties = {
  color: 'var(--brand-lime)',
  fontSize: 11,
  letterSpacing: 1.2,
  textTransform: 'uppercase',
  fontWeight: 900,
}

const modalTitleStyle: React.CSSProperties = {
  margin: '4px 0 0',
  fontSize: 18,
}

const modalTextStyle: React.CSSProperties = {
  margin: '6px 0 0',
  color: 'var(--txt-3)',
  fontSize: 13,
}

const textareaStyle: React.CSSProperties = {
  width: '100%',
  minHeight: 116,
  border: '1px solid var(--line-2)',
  borderRadius: 12,
  background: 'var(--surface-2)',
  color: 'var(--txt)',
  padding: 12,
  resize: 'vertical',
}

const modalActionRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 10,
}
