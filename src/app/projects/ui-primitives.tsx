'use client'

import React from 'react'
import { ConfirmDialog } from '@/components/feedback/Modal'
import { readJsonResponse } from '@/lib/api/readJsonResponse'
import { normalizeVersionReviewStatus, type VersionReviewStatus } from '@/lib/deliverableVersionStatus'
import type { CommandCenterPersonRow } from '@/lib/database.types'
import { getDeadlineSignal, isUnassignedSubtask } from './helpers'
import {
  dangerBtnStyle,
  emptyInline,
  evidenceFileActionStyle,
  evidenceFileDeleteItemStyle,
  evidenceFileErrorStyle,
  evidenceFileMenuButtonStyle,
  evidenceFileMenuItemStyle,
  evidenceFileMenuPanelStyle,
  evidenceFileMenuWrapStyle,
  evidenceFileMetaStyle,
  evidenceFileNameStyle,
  evidenceFileNoticeStyle,
  evidenceFileRowShellStyle,
  evidenceFileStackStyle,
  evidenceFileUnavailableStyle,
  fileRowButtonStyle,
  fileRowStyle,
  ghostBtnStyle,
  primaryBtnStyle,
  progressBadgeStyle,
  stepEvidenceFilesHeaderStyle,
  stepEvidenceFilesStyle,
  stepEvidenceToggleStyle,
} from './styles'
import type { AttachmentItem, BadgeTone, SubtaskItem, VersionDeleteResult } from './types'

interface DeliverableOpenLinkVersion {
  id: string
  external_url: string | null
  attachment_id?: string | null
  attachment: {
    url: string | null
    file_name: string | null
    mime_type: string | null
  } | null
}

const STEP_FILE_PREVIEW_LIMIT = 2

export function ProgressBadge({ value, label }: { value: number; label?: string }) {
  const zero = value === 0
  const text = zero && label ? `0% · ${label}` : `${value}%`
  return <span style={progressBadgeStyle} title={label ? `Tiến độ ${value}% · ${label}` : `Tiến độ ${value}%`}>{text}</span>
}

export function SubtaskSignalBadges({ subtask, compact = false }: { subtask: SubtaskItem; compact?: boolean }) {
  const deadline = getDeadlineSignal(subtask)
  const showDeadline = deadline.kind !== 'normal'
  const unassigned = isUnassignedSubtask(subtask)
  const urgentUnassigned = unassigned && (deadline.kind === 'overdue' || deadline.kind === 'today')

  if (!showDeadline && !unassigned) return null

  return (
    <div style={signalBadgeRowStyle(compact)}>
      {showDeadline ? (
        <span title={deadline.hint} style={alertBadgeStyle(deadline.tone)}>
          {deadline.label}
        </span>
      ) : null}
      {unassigned ? (
        <span style={alertBadgeStyle(urgentUnassigned ? 'danger' : 'warning')}>
          Chưa gắn người
        </span>
      ) : null}
    </div>
  )
}

function signalBadgeRowStyle(compact: boolean): React.CSSProperties {
  return {
    display: 'flex',
    gap: 6,
    flexWrap: 'wrap',
    marginTop: compact ? 0 : 8,
  }
}

function alertBadgeStyle(tone: BadgeTone): React.CSSProperties {
  const danger = tone === 'danger'
  const warning = tone === 'warning'
  const success = tone === 'success'
  return {
    display: 'inline-flex',
    alignItems: 'center',
    minHeight: 22,
    padding: '0 8px',
    borderRadius: 999,
    border: `1px solid ${danger ? 'rgba(184,64,64,.42)' : warning ? 'rgba(184,139,62,.42)' : success ? 'rgba(96,145,92,.36)' : 'var(--line)'}`,
    background: danger ? 'rgba(184,64,64,.16)' : warning ? 'rgba(184,139,62,.14)' : success ? 'rgba(96,145,92,.14)' : 'var(--surface-3)',
    color: danger ? 'var(--color-danger)' : warning ? 'var(--color-warning)' : success ? 'var(--color-success)' : 'var(--txt-3)',
    fontSize: 11,
    fontWeight: 800,
    whiteSpace: 'nowrap',
  }
}

export function EvidenceFileList({
  files,
  people,
  workspaceId,
  emptyText,
  allowVersionDelete = false,
  onVersionDeleted,
}: {
  files: AttachmentItem[]
  people: Record<string, CommandCenterPersonRow>
  workspaceId?: string
  emptyText: string
  allowVersionDelete?: boolean
  onVersionDeleted?: (file: AttachmentItem, result: VersionDeleteResult) => void
}) {
  const [resolvingIds, setResolvingIds] = React.useState<Record<string, boolean>>({})
  const [resolvedUrls, setResolvedUrls] = React.useState<Record<string, string>>({})
  const [openErrors, setOpenErrors] = React.useState<Record<string, string>>({})
  const [menuOpenId, setMenuOpenId] = React.useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<AttachmentItem | null>(null)
  const [deletingId, setDeletingId] = React.useState<string | null>(null)
  const [hiddenIds, setHiddenIds] = React.useState<Record<string, boolean>>({})
  const [notice, setNotice] = React.useState('')

  async function getResolvedFileUrl(file: AttachmentItem) {
    const existing = resolvedUrls[file.id] ?? file.url
    if (existing) return existing
    if (!workspaceId) return null
    const url = await resolveDeliverableVersionOpenUrl(workspaceId, file)
    if (url) setResolvedUrls((current) => ({ ...current, [file.id]: url }))
    return url
  }

  async function openResolvedFile(file: AttachmentItem) {
    const pendingTab = window.open('about:blank', '_blank')
    if (pendingTab) pendingTab.opener = null
    setResolvingIds((current) => ({ ...current, [file.id]: true }))
    setOpenErrors((current) => ({ ...current, [file.id]: '' }))
    setMenuOpenId(null)
    try {
      const url = await getResolvedFileUrl(file)
      if (!url) throw new Error('Bàn giao này chưa có file/link đính kèm.')
      if (pendingTab) pendingTab.location.replace(url)
      else window.open(url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      pendingTab?.close()
      setOpenErrors((current) => ({
        ...current,
        [file.id]: err instanceof Error ? err.message : 'Không mở được file/link.',
      }))
    } finally {
      setResolvingIds((current) => ({ ...current, [file.id]: false }))
    }
  }

  async function copyExternalLink(file: AttachmentItem) {
    setOpenErrors((current) => ({ ...current, [file.id]: '' }))
    setMenuOpenId(null)
    try {
      const url = await getResolvedFileUrl(file)
      if (!url) throw new Error('Link này chưa có URL để copy.')
      await navigator.clipboard.writeText(url)
      setNotice(`Đã copy link: ${file.name}`)
    } catch (err) {
      setOpenErrors((current) => ({
        ...current,
        [file.id]: err instanceof Error ? err.message : 'Không copy được link.',
      }))
    }
  }

  async function deleteEvidenceVersion(file: AttachmentItem) {
    if (!workspaceId || !file.deliverableId || !file.versionId) return
    setDeletingId(file.id)
    setNotice('')
    setOpenErrors((current) => ({ ...current, [file.id]: '' }))
    try {
      const response = await fetch('/api/deliverables', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          deliverableId: file.deliverableId,
          versionId: file.versionId,
          action: 'deleteVersion',
          reason: 'Xóa tài liệu upload nhầm từ Step Document Management.',
        }),
      })
      const payload = await readJsonResponse<VersionDeleteResult & { error?: string }>(response, 'Không xóa được tài liệu.')
      if (!response.ok || payload.error) throw new Error(payload.error ?? 'Không xóa được tài liệu.')

      setHiddenIds((current) => ({ ...current, [file.id]: true }))
      setMenuOpenId(null)
      setNotice(`Đã xóa ${file.name}${file.versionNumber ? ` · Version ${file.versionNumber}` : ''}`)
      onVersionDeleted?.(file, payload)
    } catch (err) {
      setOpenErrors((current) => ({
        ...current,
        [file.id]: err instanceof Error ? err.message : 'Không xóa được tài liệu.',
      }))
    } finally {
      setDeletingId(null)
    }
  }

  const visibleFiles = files.filter((file) => !hiddenIds[file.id])
  if (!visibleFiles.length) {
    return (
      <div>
        {notice ? <div style={evidenceFileNoticeStyle}>{notice}</div> : null}
        <div style={emptyInline}>{emptyText}</div>
      </div>
    )
  }

  return (
    <>
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) void deleteEvidenceVersion(deleteTarget)
        }}
        title="Xóa tài liệu?"
        message={deleteTarget
          ? `Bạn có chắc muốn xóa tài liệu "${deleteTarget.name}"${deleteTarget.versionNumber ? `, Version ${deleteTarget.versionNumber}` : ''}? Hành động này chỉ áp dụng với tài liệu chưa được duyệt, không xóa lịch sử và không Hard Delete.`
          : ''}
        confirmLabel="Xóa"
        danger
      />
      {notice ? <div style={evidenceFileNoticeStyle}>{notice}</div> : null}
      <div style={evidenceFileStackStyle}>
        {visibleFiles.map((file) => {
          const submitter = file.submittedBy ? people[file.submittedBy] : null
          const meta = [
            file.status ? getEvidenceFileStatusLabel(file.status) : null,
            file.versionNumber ? `Version ${file.versionNumber}` : null,
            file.mimeType ? getEvidenceFileTypeLabel(file.name, file.mimeType) : null,
            file.submittedAt ? `Nộp lúc ${formatDateTime(file.submittedAt)}` : null,
            submitter ? `bởi ${submitter.full_name}` : null,
          ].filter(Boolean).join(' · ')

          const isExternalLink = file.mimeType === 'external_url'
          const actionLabel = isExternalLink ? 'Mở link' : 'Mở file'
          const resolvedUrl = resolvedUrls[file.id] ?? file.url
          const canResolveOnDemand = Boolean(!resolvedUrl && workspaceId && file.deliverableId && (file.versionId || file.attachmentId))
          const canOpen = Boolean(resolvedUrl || canResolveOnDemand)
          const isResolving = Boolean(resolvingIds[file.id])
          const isDeleting = deletingId === file.id
          const openError = openErrors[file.id]
          const menuOpen = menuOpenId === file.id
          const approved = normalizeVersionReviewStatus(file.status) === 'APPROVED'
          const hasVersionTarget = Boolean(workspaceId && file.deliverableId && file.versionId)
          const deleteDisabled = approved || !hasVersionTarget || isDeleting
          const deleteTooltip = approved
            ? 'Version đã duyệt không thể xóa.'
            : !hasVersionTarget
              ? 'Tài liệu này chưa có version hợp lệ để xóa.'
              : 'Xóa tài liệu upload nhầm.'
          const content = (
            <>
              <i className={`ti ${isExternalLink ? 'ti-link' : 'ti-paperclip'}`} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={evidenceFileNameStyle}>{file.name}</div>
                {meta ? <div style={evidenceFileMetaStyle}>{meta}</div> : null}
                {openError ? <div style={evidenceFileErrorStyle}>{openError}</div> : null}
              </div>
              {canOpen ? (
                <span style={evidenceFileActionStyle}>{isResolving ? 'Đang mở...' : actionLabel} <i className="ti ti-external-link" /></span>
              ) : (
                <span style={evidenceFileUnavailableStyle}>Không có file/link đính kèm</span>
              )}
            </>
          )

          const openControl = resolvedUrl ? (
            <a href={resolvedUrl} target="_blank" rel="noopener noreferrer" style={{ ...fileRowStyle, flex: 1, minWidth: 0 }}>
              {content}
            </a>
          ) : canResolveOnDemand ? (
            <button type="button" onClick={() => void openResolvedFile(file)} disabled={isResolving} style={{ ...fileRowButtonStyle(isResolving), flex: 1, minWidth: 0 }}>
              {content}
            </button>
          ) : (
            <div style={{ ...fileRowStyle, flex: 1, minWidth: 0 }}>{content}</div>
          )

          return (
            <div key={file.id} style={evidenceFileRowShellStyle}>
              {openControl}
              {allowVersionDelete ? (
                <div style={evidenceFileMenuWrapStyle}>
                  <button
                    type="button"
                    onClick={() => setMenuOpenId(menuOpen ? null : file.id)}
                    aria-label={`Mở menu tài liệu ${file.name}`}
                    aria-expanded={menuOpen}
                    disabled={isDeleting}
                    style={evidenceFileMenuButtonStyle}
                  >
                    {isDeleting ? <i className="ti ti-loader-2" /> : <i className="ti ti-dots" />}
                  </button>
                  {menuOpen ? (
                    <div style={evidenceFileMenuPanelStyle}>
                      <button type="button" onClick={() => void openResolvedFile(file)} disabled={!canOpen || isResolving} style={evidenceFileMenuItemStyle(!canOpen || isResolving)}>
                        <i className={`ti ${isExternalLink ? 'ti-external-link' : 'ti-eye'}`} /> {actionLabel}
                      </button>
                      {isExternalLink ? (
                        <button type="button" onClick={() => void copyExternalLink(file)} disabled={!canOpen} style={evidenceFileMenuItemStyle(!canOpen)}>
                          <i className="ti ti-copy" /> Copy Link
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpenId(null)
                          if (!deleteDisabled) setDeleteTarget(file)
                        }}
                        disabled={deleteDisabled}
                        title={deleteTooltip}
                        style={evidenceFileDeleteItemStyle(deleteDisabled)}
                      >
                        <i className="ti ti-trash" /> Xóa tài liệu
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </>
  )
}

async function resolveDeliverableVersionOpenUrl(workspaceId: string, file: AttachmentItem) {
  if (file.url) return file.url
  if (!file.deliverableId) return null

  const params = new URLSearchParams({ workspaceId, deliverableId: file.deliverableId })
  const response = await fetch(`/api/deliverables?${params.toString()}`)
  const payload = await readJsonResponse<{ versions?: DeliverableOpenLinkVersion[]; error?: string }>(response, 'Không lấy được link bàn giao.')
  if (!response.ok || payload.error) throw new Error(payload.error ?? 'Không lấy được link bàn giao.')

  const versions = payload.versions ?? []
  const version = versions.find((item) => file.versionId && item.id === file.versionId)
    ?? versions.find((item) => file.attachmentId && item.attachment_id === file.attachmentId)
    ?? versions.find((item) => item.id === file.id)
    ?? versions.find((item) => item.external_url || item.attachment?.url)

  return version?.external_url ?? version?.attachment?.url ?? null
}

function getEvidenceFileStatusLabel(status: VersionReviewStatus) {
  if (status === 'APPROVED') return 'Đã duyệt'
  if (status === 'PENDING' || status === 'PENDING_REVIEW' || status === 'NOT_REQUESTED') return 'Chờ duyệt'
  if (status === 'REVISION_REQUESTED') return 'Cần sửa'
  if (status === 'REJECTED') return 'Từ chối'
  if (status === 'CANCELLED') return 'Đã hủy'
  if (status === 'UPLOADED_BY_MISTAKE') return 'Up nhầm'
  if (status === 'SUPERSEDED') return 'Đã thay thế'
  return status
}

function getEvidenceFileTypeLabel(name: string, mime = '') {
  if (mime === 'external_url') return 'Link'
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (['html', 'htm'].includes(ext) || mime.includes('html')) return 'HTML'
  if (mime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return 'Ảnh'
  if (ext === 'pdf' || mime.includes('pdf')) return 'PDF'
  if (['doc', 'docx'].includes(ext) || mime.includes('word')) return 'Word'
  if (['xls', 'xlsx', 'csv'].includes(ext) || mime.includes('excel')) return 'Excel/CSV'
  if (['zip', 'rar', '7z'].includes(ext)) return 'Nén'
  return ext ? ext.toUpperCase() : 'File'
}

function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('vi-VN')
}

export function StepEvidenceFiles({
  files,
  people,
  workspaceId,
  emptyText,
  allowVersionDelete = false,
  onVersionDeleted,
}: {
  files: AttachmentItem[]
  people: Record<string, CommandCenterPersonRow>
  workspaceId?: string
  emptyText: string
  allowVersionDelete?: boolean
  onVersionDeleted?: (file: AttachmentItem, result: VersionDeleteResult) => void
}) {
  const [expanded, setExpanded] = React.useState(false)
  const visibleFiles = expanded ? files : files.slice(0, STEP_FILE_PREVIEW_LIMIT)

  return (
    <div style={stepEvidenceFilesStyle}>
      <div style={stepEvidenceFilesHeaderStyle}>
        <span><i className="ti ti-package" /> Kết quả bước</span>
        <span>{files.length} tài liệu</span>
      </div>
      <EvidenceFileList
        files={visibleFiles}
        people={people}
        workspaceId={workspaceId}
        emptyText={emptyText}
        allowVersionDelete={allowVersionDelete}
        onVersionDeleted={onVersionDeleted}
      />
      {files.length > STEP_FILE_PREVIEW_LIMIT ? (
        <button type="button" onClick={() => setExpanded((current) => !current)} aria-expanded={expanded} style={stepEvidenceToggleStyle}>
          {expanded ? 'Thu gọn' : `Xem tất cả ${files.length} tài liệu`}
        </button>
      ) : null}
    </div>
  )
}

export function GhostButton({
  children,
  icon,
  onClick,
}: {
  children: React.ReactNode
  icon: string
  onClick?: () => void
}) {
  return (
    <button onClick={onClick} style={ghostBtnStyle}>
      <i className={`ti ${icon}`} />
      {children}
    </button>
  )
}

export function DangerButton({
  children,
  icon,
  onClick,
}: {
  children: React.ReactNode
  icon: string
  onClick?: () => void
}) {
  return (
    <button onClick={onClick} style={dangerBtnStyle}>
      <i className={`ti ${icon}`} />
      {children}
    </button>
  )
}

export function PrimaryButton({
  children,
  icon,
  onClick,
  disabled,
}: {
  children: React.ReactNode
  icon: string
  onClick?: () => void
  disabled?: boolean
}) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ ...primaryBtnStyle, opacity: disabled ? 0.45 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}>
      <i className={`ti ${icon}`} />
      {children}
    </button>
  )
}
