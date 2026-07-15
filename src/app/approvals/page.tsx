'use client'

import React from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { DataErrorState } from '@/components/ui/DataErrorState'
import { PageHead } from '@/components/ui/PageHead'
import { getVietnamDateKey } from '@/features/command-center/utils'
import { useCommandData } from '@/hooks/useCommandData'
import { isOpenApprovalStatus } from '@/lib/approvalQueue'
import type {
  CommandCenterApprovalRow,
  CommandCenterAttachmentRow,
  CommandCenterDeliverableRow,
  CommandCenterDeliverableVersionRow,
  CommandCenterPersonRow,
  CommandCenterProjectRow,
  CommandCenterTaskStepRow,
  CommandCenterTaskRow,
  CommandCenterWorkstreamRow,
} from '@/lib/database.types'
import { isVersionInvalid, normalizeVersionReviewStatus } from '@/lib/deliverableVersionStatus'

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

interface ApprovalDisplayInfo {
  title: string
  fileName: string
  submitter: PersonDisplay
  requiredReviewer: ReviewerDisplay
  processedBy: PersonDisplay
  processedAt: string | null
  dueSummary: string
  missingReviewer: boolean
  delegatedProcessed: boolean
}

interface PersonDisplay {
  person: CommandCenterPersonRow | null
  name: string
  meta: string
}

interface ReviewerDisplay extends PersonDisplay {
  source: string
  sourceLabel: string
  isFallback: boolean
}

export default function ApprovalsPage() {
  const { data, loading, error, refresh } = useCommandData()
  const workspaceId = data?.workspaceId ?? ''
  const currentUser = data?.currentUser ?? null
  const approvals: CommandCenterApprovalRow[] = data?.approvals ?? []
  const people = React.useMemo(
    () => Object.fromEntries(((data?.people ?? []) as CommandCenterPersonRow[]).map((person) => [person.id, person])),
    [data?.people],
  )
  const projects = React.useMemo(
    () => Object.fromEntries(((data?.projects ?? []) as CommandCenterProjectRow[]).map((project) => [project.id, project])),
    [data?.projects],
  )
  const workstreams = React.useMemo(
    () => Object.fromEntries(((data?.workstreams ?? []) as CommandCenterWorkstreamRow[]).map((workstream) => [workstream.id, workstream])),
    [data?.workstreams],
  )
  const tasks = React.useMemo(
    () => Object.fromEntries(((data?.tasks ?? []) as CommandCenterTaskRow[]).map((task) => [task.id, task])),
    [data?.tasks],
  )
  const taskSteps = React.useMemo(
    () => Object.fromEntries(((data?.taskSteps ?? []) as CommandCenterTaskStepRow[]).map((step) => [step.id, step])),
    [data?.taskSteps],
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
  const [busyKey, setBusyKey] = React.useState('')
  const [notice, setNotice] = React.useState('')
  const [actionError, setActionError] = React.useState('')
  const [dialog, setDialog] = React.useState<ReviewDialogState | null>(null)
  const [reason, setReason] = React.useState('')
  const [reviewerFilter, setReviewerFilter] = React.useState('all')

  const filteredApprovals = approvals.filter((item) => matchesReviewerFilter(getApprovalDisplayInfo(item), reviewerFilter, currentUser?.personId ?? null))
  const overdue = filteredApprovals.filter((item) => isPendingApproval(item) && item.due_at && item.due_at < today)
  const pending = filteredApprovals.filter((item) => isPendingApproval(item) && (!item.due_at || item.due_at >= today))
  const done = filteredApprovals.filter((item) => !isPendingApproval(item))
  const reviewerFilterOptions = buildReviewerFilterOptions(approvals.map(getApprovalDisplayInfo), currentUser?.personId ?? null)

  function getApprovalContext(approval: CommandCenterApprovalRow) {
    const deliverable = approval.deliverable_id ? deliverables[approval.deliverable_id] : null
    const step = approval.step_id
      ? taskSteps[approval.step_id]
      : deliverable?.step_id
        ? taskSteps[deliverable.step_id]
        : null
    const task = approval.task_id
      ? tasks[approval.task_id]
      : deliverable?.task_id
        ? tasks[deliverable.task_id]
        : step?.task_id
          ? tasks[step.task_id]
          : null
    const versions = approval.deliverable_id ? versionsByDeliverable[approval.deliverable_id] ?? [] : []
    const latestVersion = getLatestRelevantApprovalVersion(versions)
    const attachment = latestVersion?.attachment_id ? attachments[latestVersion.attachment_id] : null
    const projectId = approval.project_id ?? task?.project_id ?? deliverable?.project_id ?? null
    const project = projectId ? projects[projectId] : null
    const workstreamId = task?.workstream_id ?? null
    const workstream = workstreamId ? workstreams[workstreamId] : null

    return {
      task,
      step,
      deliverable,
      latestVersion,
      attachment,
      projectId,
      project,
      workstreamId,
      workstream,
      title: task?.title ?? deliverable?.name ?? 'Yêu cầu phê duyệt',
      fileName: attachment?.file_name ?? deliverable?.name ?? 'File/báo cáo',
    }
  }

  function getApprovalDisplayInfo(approval: CommandCenterApprovalRow): ApprovalDisplayInfo {
    const context = getApprovalContext(approval)
    const submitterId = context.latestVersion?.submitted_by ?? context.deliverable?.submitter_id ?? approval.requested_by
    const submitter = getPersonDisplay(submitterId ? people[submitterId] : null, 'Chưa rõ người nộp')
    const requiredReviewer = resolveRequiredReviewer(approval)
    const processedPersonId = context.latestVersion?.reviewed_by ?? (!isPendingApproval(approval) ? approval.approver_id : null)
    const processedBy = getPersonDisplay(processedPersonId ? people[processedPersonId] : null, isPendingApproval(approval) ? 'Chưa xử lý' : 'Chưa rõ người xử lý')
    const delegatedProcessed = Boolean(
      !isPendingApproval(approval) &&
      processedBy.person?.id &&
      requiredReviewer.person?.id &&
      processedBy.person.id !== requiredReviewer.person.id,
    )

    return {
      title: context.title,
      fileName: context.fileName,
      submitter,
      requiredReviewer,
      processedBy,
      processedAt: context.latestVersion?.reviewed_at ?? null,
      dueSummary: formatDueSummary(approval, today),
      missingReviewer: !requiredReviewer.person,
      delegatedProcessed,
    }
  }

  function resolveRequiredReviewer(approval: CommandCenterApprovalRow): ReviewerDisplay {
    const context = getApprovalContext(approval)
    const candidates: Array<{ id: string | null | undefined; source: string; sourceLabel: string; isFallback?: boolean }> = [
      { id: approval.approver_id, source: 'approval', sourceLabel: 'Gán trên yêu cầu duyệt' },
      { id: context.deliverable?.reviewer_id, source: 'deliverable', sourceLabel: 'Gán trên bàn giao' },
      { id: context.step?.reviewer_id, source: 'step', sourceLabel: 'Kế thừa từ bước', isFallback: true },
      { id: context.task?.reviewer_id, source: 'task', sourceLabel: 'Kế thừa từ đầu việc con', isFallback: true },
      { id: context.workstream?.reviewer_id, source: 'workstream', sourceLabel: 'Kế thừa từ đầu việc lớn', isFallback: true },
      { id: context.project?.reviewer_id, source: 'project', sourceLabel: 'Kế thừa từ dự án', isFallback: true },
    ]

    for (const candidate of candidates) {
      if (!candidate.id) continue
      const person = people[candidate.id]
      if (person) {
        return {
          ...getPersonDisplay(person, 'Chưa rõ người duyệt'),
          source: candidate.source,
          sourceLabel: candidate.sourceLabel,
          isFallback: Boolean(candidate.isFallback),
        }
      }
    }

    return {
      person: null,
      name: 'Chưa gắn người duyệt',
      meta: 'Cần gắn người duyệt rõ ràng',
      source: 'missing',
      sourceLabel: 'Thiếu người duyệt',
      isFallback: false,
    }
  }

  function getTitle(approval: CommandCenterApprovalRow) {
    return getApprovalContext(approval).title
  }

  function isDelegatedApproval(approval: CommandCenterApprovalRow) {
    const assignedApproverId = getApprovalDisplayInfo(approval).requiredReviewer.person?.id
    return Boolean(
      isPendingApproval(approval) &&
      currentUser?.canApproveOnBehalf &&
      assignedApproverId &&
      currentUser.personId &&
      assignedApproverId !== currentUser.personId,
    )
  }

  async function runReviewAction(approval: CommandCenterApprovalRow, action: ReviewAction, reviewComment = '') {
    const context = getApprovalContext(approval)
    if (!workspaceId || !approval.deliverable_id) {
      setActionError('Thiếu thông tin bàn giao nên chưa thể cập nhật trạng thái.')
      return
    }
    if (!isPendingApproval(approval)) {
      setActionError('Bàn giao đã được xử lý. Không thể thao tác lại.')
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
    if (!isPendingApproval(approval)) {
      setActionError('Bàn giao đã được xử lý. Không thể thao tác lại.')
      return
    }
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
    if (context.latestVersion?.external_url) return context.latestVersion.external_url
    if (context.attachment?.workspace_id && context.attachment.storage_path) {
      const params = new URLSearchParams({
        workspaceId: context.attachment.workspace_id,
        path: context.attachment.storage_path,
      })
      return `/api/files/open?${params.toString()}`
    }
    if (!workspaceId || !approval.deliverable_id) return null

    const params = new URLSearchParams({ workspaceId, deliverableId: approval.deliverable_id })
    const response = await fetch(`/api/deliverables?${params}`)
    const payload = (await response.json()) as { versions?: VersionDetail[]; error?: string }
    if (!response.ok || payload.error) throw new Error(payload.error ?? 'Không lấy được link file.')

    const version = context.latestVersion?.id
      ? payload.versions?.find((item) => item.id === context.latestVersion?.id) ?? payload.versions?.[0]
      : payload.versions?.[0]
    return version?.external_url ?? version?.attachment?.url ?? null
  }

  async function openFile(approval: CommandCenterApprovalRow) {
    const pendingTab = window.open('about:blank', '_blank')
    if (pendingTab) pendingTab.opener = null
    setActionError('')
    try {
      const url = await resolveFileUrl(approval)
      if (!url) throw new Error('File/báo cáo này chưa có link để mở.')
      if (pendingTab) pendingTab.location.replace(url)
      else window.open(url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      pendingTab?.close()
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

  async function copyApprovalReminder(approval: CommandCenterApprovalRow) {
    setActionError('')
    const info = getApprovalDisplayInfo(approval)
    const message = info.requiredReviewer.person
      ? `Anh/chị ${info.requiredReviewer.name} ơi, có bàn giao "${info.title}" của ${info.submitter.name} đang chờ anh/chị duyệt. ${info.dueSummary}. Hiện trạng: ${resolveApprovalState(approval, today).label}. Anh/chị kiểm tra và phản hồi giúp Quang nhé.`
      : `Đầu việc/bàn giao "${info.title}" hiện chưa có người duyệt. Quang cần gắn người duyệt để hệ thống theo dõi đúng.`

    try {
      await copyTextToClipboard(message)
      setNotice('Đã copy tin nhắn nhắc duyệt.')
    } catch {
      setActionError('Không copy được tin nhắn nhắc duyệt. Hãy copy thủ công sau khi mở lại trang.')
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

      <section style={filterCardStyle} data-vyvy-card="true">
        <label style={filterLabelStyle} htmlFor="approval-reviewer-filter">Người phải duyệt</label>
        <select
          id="approval-reviewer-filter"
          value={reviewerFilter}
          onChange={(event) => setReviewerFilter(event.target.value)}
          style={filterSelectStyle}
        >
          {reviewerFilterOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <span style={filterHelpStyle}>
          Đang hiển thị {filteredApprovals.length}/{approvals.length} yêu cầu theo người duyệt.
        </span>
      </section>

      <div style={panelGrid}>
        <StatusPanel
          title="Quá hạn duyệt"
          icon="ti-alarm"
          accent="var(--color-danger)"
          items={overdue}
          getDisplayInfo={getApprovalDisplayInfo}
          busyKey={busyKey}
          onOpenTask={openTask}
          onApprove={(approval) => void runReviewAction(approval, 'approve')}
          onRevision={(approval) => openReviewDialog(approval, 'requestRevision')}
          onCopyReminder={(approval) => void copyApprovalReminder(approval)}
          isDelegatedApproval={isDelegatedApproval}
        />
        <StatusPanel
          title="Chờ duyệt"
          icon="ti-hourglass"
          accent="var(--color-warning)"
          items={pending}
          getDisplayInfo={getApprovalDisplayInfo}
          busyKey={busyKey}
          onOpenTask={openTask}
          onApprove={(approval) => void runReviewAction(approval, 'approve')}
          onRevision={(approval) => openReviewDialog(approval, 'requestRevision')}
          onCopyReminder={(approval) => void copyApprovalReminder(approval)}
          isDelegatedApproval={isDelegatedApproval}
        />
        <StatusPanel
          title="Đã xử lý"
          icon="ti-circle-check"
          accent="var(--color-success)"
          items={done}
          getDisplayInfo={getApprovalDisplayInfo}
          busyKey={busyKey}
          onOpenTask={openTask}
          onApprove={(approval) => void runReviewAction(approval, 'approve')}
          onRevision={(approval) => openReviewDialog(approval, 'requestRevision')}
          onCopyReminder={(approval) => void copyApprovalReminder(approval)}
          isDelegatedApproval={isDelegatedApproval}
        />
      </div>

      <section style={sectionCard} data-vyvy-card="true">
        <table style={tableStyle}>
          <thead>
            <tr>
              <Th>Yêu cầu</Th>
              <Th>Người nộp</Th>
              <Th>Người phải duyệt</Th>
              <Th>Người đã xử lý</Th>
              <Th>Hạn duyệt</Th>
              <Th>Trạng thái</Th>
              <Th>Thao tác</Th>
            </tr>
          </thead>
          <ApprovalTableBody loading={loading} items={filteredApprovals}>
            {(approval, rowProps) => {
                const state = resolveApprovalState(approval, today)
                const context = getApprovalContext(approval)
                const delegated = isDelegatedApproval(approval)
                const info = getApprovalDisplayInfo(approval)

                return (
                  <tr key={approval.id} {...rowProps}>
                    <Td>
                      <div style={requestCellStyle}>
                        <strong>{context.title}</strong>
                        <span>{context.deliverable?.name ?? context.fileName}</span>
                      </div>
                    </Td>
                    <Td>
                      <div style={requestCellStyle}>
                        <strong>{info.submitter.name}</strong>
                        {info.submitter.meta ? <small>{info.submitter.meta}</small> : null}
                      </div>
                    </Td>
                    <Td>
                      <ReviewerBlock info={info.requiredReviewer} missing={info.missingReviewer} />
                    </Td>
                    <Td>
                      <div style={requestCellStyle}>
                        <span>{info.processedBy.name}</span>
                        {info.delegatedProcessed && info.requiredReviewer.person ? (
                          <small style={delegatedTextStyle}>Duyệt thay cho {info.requiredReviewer.name}</small>
                        ) : null}
                        {info.processedAt ? <small>{new Date(info.processedAt).toLocaleString('vi-VN')}</small> : null}
                      </div>
                    </Td>
                    <Td>{info.dueSummary}</Td>
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
                        onCopyReminder={() => void copyApprovalReminder(approval)}
                        onApprove={() => void runReviewAction(approval, 'approve')}
                        onRevision={() => openReviewDialog(approval, 'requestRevision')}
                        onReject={() => openReviewDialog(approval, 'reject')}
                        delegated={delegated}
                      />
                    </Td>
                  </tr>
                )
              }}
          </ApprovalTableBody>
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

const VIRTUALIZE_APPROVALS_AFTER = 50

type ApprovalTableRowProps = React.HTMLAttributes<HTMLTableRowElement> & {
  ref?: React.Ref<HTMLTableRowElement>
  'data-index'?: number
}

function ApprovalTableBody({
  loading,
  items,
  children,
}: {
  loading: boolean
  items: CommandCenterApprovalRow[]
  children: (item: CommandCenterApprovalRow, rowProps: ApprovalTableRowProps) => React.ReactNode
}) {
  'use no memo'
  const shouldVirtualize = !loading && items.length > VIRTUALIZE_APPROVALS_AFTER
  const bodyRef = React.useRef<HTMLTableSectionElement>(null)
  const [scrollMargin, setScrollMargin] = React.useState(0)
  const virtualizer = useVirtualizer<HTMLDivElement, HTMLTableRowElement>({
    count: shouldVirtualize ? items.length : 0,
    getScrollElement: () => (
      typeof document === 'undefined' ? null : document.getElementById('main-content') as HTMLDivElement | null
    ),
    estimateSize: () => 148,
    overscan: 6,
    scrollMargin,
    enabled: shouldVirtualize,
    getItemKey: (index) => items[index]?.id ?? index,
  })

  React.useLayoutEffect(() => {
    if (!shouldVirtualize) return

    const bodyElement = bodyRef.current
    const scrollElement = document.getElementById('main-content')
    if (!bodyElement || !scrollElement) return

    const updateScrollMargin = () => {
      const bodyRect = bodyElement.getBoundingClientRect()
      const scrollRect = scrollElement.getBoundingClientRect()
      const nextMargin = bodyRect.top - scrollRect.top + scrollElement.scrollTop
      setScrollMargin((current) => Math.abs(current - nextMargin) > 0.5 ? nextMargin : current)
    }

    updateScrollMargin()
    const resizeObserver = new ResizeObserver(updateScrollMargin)
    resizeObserver.observe(scrollElement)
    if (bodyElement.parentElement) resizeObserver.observe(bodyElement.parentElement)
    window.addEventListener('resize', updateScrollMargin)

    return () => {
      resizeObserver.disconnect()
      window.removeEventListener('resize', updateScrollMargin)
    }
  }, [items.length, shouldVirtualize])

  if (loading) {
    return (
      <tbody>
        <tr><Td colSpan={7}>Đang tải...</Td></tr>
      </tbody>
    )
  }

  if (items.length === 0) {
    return (
      <tbody>
        <tr><Td colSpan={7}>Không có yêu cầu phê duyệt nào.</Td></tr>
      </tbody>
    )
  }

  if (!shouldVirtualize) {
    return <tbody>{items.map((item) => children(item, {}))}</tbody>
  }

  const virtualRows = virtualizer.getVirtualItems()
  const firstRow = virtualRows[0]
  const lastRow = virtualRows[virtualRows.length - 1]
  const topSpacer = firstRow ? Math.max(0, firstRow.start - scrollMargin) : 0
  const bottomSpacer = lastRow
    ? Math.max(0, virtualizer.getTotalSize() - (lastRow.end - scrollMargin))
    : 0

  return (
    <tbody ref={bodyRef}>
      {topSpacer > 0 ? (
        <tr aria-hidden="true"><td colSpan={7} style={{ height: topSpacer, padding: 0, border: 0, lineHeight: 0 }} /></tr>
      ) : null}
      {virtualRows.map((virtualRow) => {
        const item = items[virtualRow.index]
        if (!item) return null
        return children(item, { ref: virtualizer.measureElement, 'data-index': virtualRow.index })
      })}
      {bottomSpacer > 0 ? (
        <tr aria-hidden="true"><td colSpan={7} style={{ height: bottomSpacer, padding: 0, border: 0, lineHeight: 0 }} /></tr>
      ) : null}
    </tbody>
  )
}

function StatusPanel({
  title,
  icon,
  accent,
  items,
  getDisplayInfo,
  busyKey,
  onOpenTask,
  onApprove,
  onRevision,
  onCopyReminder,
  isDelegatedApproval,
}: {
  title: string
  icon: string
  accent: string
  items: CommandCenterApprovalRow[]
  getDisplayInfo: (item: CommandCenterApprovalRow) => ApprovalDisplayInfo
  busyKey: string
  onOpenTask: (item: CommandCenterApprovalRow) => void
  onApprove: (item: CommandCenterApprovalRow) => void
  onRevision: (item: CommandCenterApprovalRow) => void
  onCopyReminder: (item: CommandCenterApprovalRow) => void
  isDelegatedApproval: (item: CommandCenterApprovalRow) => boolean
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
            const delegated = isDelegatedApproval(item)
            const info = getDisplayInfo(item)
            return (
              <div key={item.id} style={miniRowStyle} data-vyvy-row="true">
                <button type="button" onClick={() => onOpenTask(item)} style={miniTitleButtonStyle}>
                  {info.title}
                </button>
                <div style={miniMetaStackStyle}>
                  <span>{info.dueSummary}</span>
                  <span>Người nộp: <strong>{info.submitter.name}</strong></span>
                  <span>
                    Người phải duyệt: <strong>{info.requiredReviewer.name}</strong>
                    {info.requiredReviewer.isFallback ? <em> · {info.requiredReviewer.sourceLabel}</em> : null}
                  </span>
                  {info.requiredReviewer.meta ? <span>{info.requiredReviewer.meta}</span> : null}
                  {info.missingReviewer ? <span style={missingReviewerBadgeStyle}>Thiếu người duyệt</span> : null}
                  {!pending ? (
                    <span>
                      Người đã xử lý: <strong>{info.processedBy.name}</strong>
                      {info.delegatedProcessed && info.requiredReviewer.person ? <em> · duyệt thay cho {info.requiredReviewer.name}</em> : null}
                    </span>
                  ) : null}
                  {info.processedAt ? <span>Đã xử lý: {new Date(info.processedAt).toLocaleString('vi-VN')}</span> : null}
                </div>
                <div style={miniActionRowStyle}>
                  <button type="button" onClick={() => onOpenTask(item)} style={miniButtonStyle}>Mở</button>
                  {pending ? (
                    <>
                      <button type="button" onClick={() => onApprove(item)} disabled={busyKey === `${item.id}:approve`} style={miniPrimaryButtonStyle}>
                        Đã duyệt
                      </button>
                      {delegated ? <span style={delegatedBadgeStyle}>Duyệt thay</span> : null}
                      <button type="button" onClick={() => onRevision(item)} style={miniButtonStyle}>
                        Yêu cầu sửa
                      </button>
                      <button type="button" onClick={() => onCopyReminder(item)} style={miniButtonStyle}>
                        Copy nhắc duyệt
                      </button>
                    </>
                  ) : (
                    <span style={processedOnlyTextStyle}>Đã xử lý · chỉ xem lịch sử</span>
                  )}
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
  onCopyReminder,
  onApprove,
  onRevision,
  onReject,
  delegated,
}: {
  approval: CommandCenterApprovalRow
  busyKey: string
  onOpenFile: () => void
  onOpenTask: () => void
  onCopyLink: () => void
  onCopyReminder: () => void
  onApprove: () => void
  onRevision: () => void
  onReject: () => void
  delegated: boolean
}) {
  const canAct = isPendingApproval(approval)
  const canApprove = canAct && canManualApprove(approval)
  return (
    <div style={actionWrapStyle}>
      <button type="button" onClick={onOpenFile} style={secondaryButtonStyle}>
        Mở file
      </button>
      <button type="button" onClick={onOpenTask} style={secondaryButtonStyle}>
        Mở đầu việc
      </button>
      {canApprove ? (
        <>
          {delegated ? <span style={delegatedBadgeStyle}>Duyệt thay</span> : null}
          <button type="button" onClick={onApprove} disabled={busyKey === `${approval.id}:approve`} style={primaryButtonStyle}>
            Đã duyệt
          </button>
        </>
      ) : null}
      {canAct ? (
        <>
          <button type="button" onClick={onCopyReminder} disabled={Boolean(busyKey)} style={secondaryButtonStyle}>
            Copy nhắc duyệt
          </button>
          <button type="button" onClick={onRevision} disabled={Boolean(busyKey)} style={warningButtonStyle}>
            Yêu cầu sửa
          </button>
          <button type="button" onClick={onReject} disabled={Boolean(busyKey)} style={dangerGhostButtonStyle}>
            Từ chối
          </button>
        </>
      ) : (
        <button type="button" onClick={onOpenTask} title="Mở đầu việc để xem lịch sử liên quan" style={secondaryButtonStyle}>
          Xem lịch sử
        </button>
      )}
      <button type="button" onClick={onCopyLink} style={iconButtonStyle} title="Copy link">
        <i className="ti ti-link" />
      </button>
    </div>
  )
}

function ReviewerBlock({ info, missing }: { info: ReviewerDisplay; missing: boolean }) {
  return (
    <div style={requestCellStyle}>
      <strong>{info.name}</strong>
      {info.meta ? <small>{info.meta}</small> : null}
      {info.isFallback ? <small style={fallbackTextStyle}>{info.sourceLabel}</small> : null}
      {missing ? <span style={missingReviewerBadgeStyle}>Thiếu người duyệt</span> : null}
    </div>
  )
}

function getPersonDisplay(person: CommandCenterPersonRow | null | undefined, fallbackName: string): PersonDisplay {
  if (!person) return { person: null, name: fallbackName, meta: '' }
  const departmentName = getDepartmentName(person)
  return {
    person,
    name: person.full_name || fallbackName,
    meta: [person.job_title, departmentName].filter(Boolean).join(' · '),
  }
}

function getDepartmentName(person: CommandCenterPersonRow | null | undefined) {
  const department = person?.department
  if (Array.isArray(department)) return department[0]?.name ?? ''
  return department?.name ?? ''
}

function matchesReviewerFilter(info: ApprovalDisplayInfo, filter: string, currentPersonId: string | null) {
  if (filter === 'all') return true
  if (filter === 'me') return Boolean(currentPersonId && info.requiredReviewer.person?.id === currentPersonId)
  if (filter === 'missing') return info.missingReviewer
  return info.requiredReviewer.person?.id === filter
}

function buildReviewerFilterOptions(infos: ApprovalDisplayInfo[], currentPersonId: string | null) {
  const counts = new Map<string, { label: string; count: number }>()
  let missingCount = 0

  for (const info of infos) {
    const person = info.requiredReviewer.person
    if (!person) {
      missingCount += 1
      continue
    }
    const current = counts.get(person.id)
    counts.set(person.id, {
      label: info.requiredReviewer.name,
      count: (current?.count ?? 0) + 1,
    })
  }

  const options = [{ value: 'all', label: `Tất cả người duyệt (${infos.length})` }]
  if (currentPersonId) {
    const current = counts.get(currentPersonId)
    options.push({ value: 'me', label: `Tôi phải duyệt (${current?.count ?? 0})` })
  }
  Array.from(counts.entries())
    .sort((a, b) => a[1].label.localeCompare(b[1].label, 'vi'))
    .forEach(([value, item]) => options.push({ value, label: `${item.label} (${item.count})` }))
  if (missingCount > 0) options.push({ value: 'missing', label: `Thiếu người duyệt (${missingCount})` })
  return options
}

function formatDueSummary(approval: CommandCenterApprovalRow, today: string) {
  if (!approval.due_at) return 'Chưa có hạn duyệt'
  const dueKey = toDateKey(approval.due_at)
  const diffDays = diffDateKeys(dueKey, today)
  if (diffDays < 0) return `Hạn: ${toShortDate(approval.due_at)} · Quá hạn ${Math.abs(diffDays)} ngày`
  if (diffDays === 0) return `Hạn: ${toShortDate(approval.due_at)} · Đến hạn hôm nay`
  return `Hạn: ${toShortDate(approval.due_at)} · Còn ${diffDays} ngày`
}

function toDateKey(value: string) {
  return value.slice(0, 10)
}

function diffDateKeys(fromDateKey: string, toDateKeyValue: string) {
  const from = new Date(`${fromDateKey}T00:00:00`).getTime()
  const to = new Date(`${toDateKeyValue}T00:00:00`).getTime()
  return Math.round((from - to) / 86400000)
}

async function copyTextToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', 'true')
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  document.body.appendChild(textarea)
  textarea.select()
  const ok = document.execCommand('copy')
  document.body.removeChild(textarea)
  if (!ok) throw new Error('copy failed')
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
  return isOpenApprovalStatus(approval.status)
}

function getLatestRelevantApprovalVersion(versions: CommandCenterDeliverableVersionRow[]) {
  return versions.find((version) => !isVersionInvalid(normalizeVersionReviewStatus(version.review_status))) ?? versions[0] ?? null
}

function canManualApprove(approval: CommandCenterApprovalRow) {
  return isPendingApproval(approval)
}

function defaultReviewComment(action: ReviewAction) {
  if (action === 'approve') return 'Đã xác nhận thủ công.'
  if (action === 'reject') return 'File/báo cáo chưa đạt yêu cầu.'
  return 'Cần chỉnh sửa/bổ sung file hoặc báo cáo.'
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

const filterCardStyle: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--line)',
  borderRadius: 12,
  padding: 12,
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 10,
}

const filterLabelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  color: 'var(--txt)',
}

const filterSelectStyle: React.CSSProperties = {
  minWidth: 240,
  border: '1px solid var(--line-2)',
  borderRadius: 10,
  background: 'var(--surface-2)',
  color: 'var(--txt)',
  padding: '8px 10px',
  fontWeight: 800,
}

const filterHelpStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--txt-3)',
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

const miniMetaStackStyle: React.CSSProperties = {
  display: 'grid',
  gap: 4,
  marginTop: 7,
  fontSize: 11.5,
  color: 'var(--txt-3)',
  lineHeight: 1.35,
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

const delegatedBadgeStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  border: '1px solid rgba(59, 130, 246, .32)',
  background: 'rgba(59, 130, 246, .12)',
  color: '#60a5fa',
  borderRadius: 999,
  padding: '5px 9px',
  fontSize: 11,
  fontWeight: 900,
  whiteSpace: 'nowrap',
}

const delegatedTextStyle: React.CSSProperties = {
  color: '#60a5fa',
  fontSize: 11.5,
  fontWeight: 800,
}

const fallbackTextStyle: React.CSSProperties = {
  color: 'var(--color-warning)',
  fontSize: 11.5,
  fontWeight: 800,
}

const missingReviewerBadgeStyle: React.CSSProperties = {
  display: 'inline-flex',
  width: 'fit-content',
  alignItems: 'center',
  border: '1px solid rgba(239, 68, 68, .32)',
  background: 'var(--danger-soft)',
  color: 'var(--danger-text)',
  borderRadius: 999,
  padding: '4px 8px',
  fontSize: 11,
  fontWeight: 900,
}

const processedOnlyTextStyle: React.CSSProperties = {
  color: 'var(--txt-3)',
  fontSize: 11.5,
  fontWeight: 800,
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
