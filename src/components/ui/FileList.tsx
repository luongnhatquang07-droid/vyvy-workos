'use client'

import React from 'react'
import {
  isVersionInvalid,
  isVersionPending,
  normalizeVersionReviewStatus,
  versionReviewLabel,
  versionReviewTone,
  type VersionReviewStatus,
} from '@/lib/deliverableVersionStatus'
import { readJsonResponse } from '@/lib/api/readJsonResponse'
import { uploadFormDataWithProgress } from '@/lib/api/uploadWithProgress'
import { externalLinkDisplayName, parseExternalLinkChangeNote } from '@/lib/files/externalLinks'

const MAX_FILE_SIZE = 25 * 1024 * 1024
const ALLOWED_EXTENSIONS = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'zip', 'html', 'htm'])

interface StorageFile {
  name: string
  metadata?: { size?: number; mimetype?: string }
  url: string | null
  storagePath: string
}

interface VersionItem {
  id: string
  version_number: number
  external_url: string | null
  submitted_by: string | null
  submitted_at: string | null
  change_note: string | null
  review_status: VersionReviewStatus
  review_comment: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  storageMode: 'supabase' | 'external_url'
  attachment: {
    file_name: string | null
    mime_type: string | null
    size_bytes: number | null
    storage_path: string
    url: string | null
  } | null
}

interface DeliverableDetail {
  reviewer_id?: string | null
}

interface FileListProps {
  workspaceId?: string
  projectId?: string
  taskId?: string
  deliverableId?: string
  reviewerId?: string | null
  currentPersonId?: string | null
  requiresApproval?: boolean
  refreshKey?: number
  peopleById?: Record<string, { full_name?: string; name?: string }>
  onChanged?: () => void
}

interface ReasonDialogState {
  title: string
  description: string
  defaultReason: string
  confirmLabel: string
  onConfirm: (reason: string) => void
  hideReasonInput?: boolean
  tone?: 'danger' | 'primary'
}

function formatBytes(bytes: number | null | undefined) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function fileIcon(name: string, mime = '') {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (mime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) return 'ti-photo'
  if (['html', 'htm'].includes(ext) || mime.includes('html') || mime.includes('xhtml')) return 'ti-file-code'
  if (ext === 'pdf' || mime.includes('pdf')) return 'ti-file-type-pdf'
  if (['doc', 'docx'].includes(ext) || mime.includes('word')) return 'ti-file-type-doc'
  if (['xls', 'xlsx', 'csv'].includes(ext) || mime.includes('excel')) return 'ti-file-type-xls'
  if (['zip', 'rar', '7z'].includes(ext)) return 'ti-file-zip'
  if (mime === 'external_url') return 'ti-link'
  return 'ti-file'
}

function fileTypeLabel(name: string, mime = '') {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (mime === 'external_url') return 'Link ngoài'
  if (['html', 'htm'].includes(ext) || mime.includes('html') || mime.includes('xhtml')) return 'HTML'
  if (mime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) return 'Ảnh'
  if (ext === 'pdf' || mime.includes('pdf')) return 'PDF'
  if (['doc', 'docx'].includes(ext) || mime.includes('word')) return 'Word'
  if (['xls', 'xlsx', 'csv'].includes(ext) || mime.includes('excel')) return 'Excel/CSV'
  if (['zip', 'rar', '7z'].includes(ext)) return 'Nén'
  return ext ? ext.toUpperCase() : 'File'
}

function validateReplacementFile(file: File) {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (!ALLOWED_EXTENSIONS.has(extension)) return 'Chỉ hỗ trợ PDF, Word, Excel/CSV, ảnh, ZIP và HTML.'
  if (file.size <= 0) return 'File đang rỗng, chưa thể tải lên.'
  if (file.size > MAX_FILE_SIZE) return 'File vượt quá giới hạn 25MB.'
  return ''
}

export function FileList({
  workspaceId,
  projectId,
  taskId,
  deliverableId,
  reviewerId,
  currentPersonId,
  requiresApproval = Boolean(deliverableId),
  refreshKey,
  peopleById = {},
  onChanged,
}: FileListProps) {
  const [files, setFiles] = React.useState<StorageFile[]>([])
  const [versions, setVersions] = React.useState<VersionItem[]>([])
  const [detailDeliverable, setDetailDeliverable] = React.useState<DeliverableDetail | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [deletingId, setDeletingId] = React.useState<string | null>(null)
  const [menuOpenId, setMenuOpenId] = React.useState<string | null>(null)
  const [replacingId, setReplacingId] = React.useState<string | null>(null)
  const [replaceProgress, setReplaceProgress] = React.useState<number | null>(null)
  const [replaceDraft, setReplaceDraft] = React.useState<{ versionId: string; reason: string } | null>(null)
  const [reasonDialog, setReasonDialog] = React.useState<ReasonDialogState | null>(null)
  const [reasonInput, setReasonInput] = React.useState('')
  const [notice, setNotice] = React.useState('')
  const [error, setError] = React.useState('')
  const replaceInputRef = React.useRef<HTMLInputElement>(null)
  const effectiveReviewerId = reviewerId ?? detailDeliverable?.reviewer_id ?? null
  const loadAbortRef = React.useRef<AbortController | null>(null)
  const loadInFlightRef = React.useRef<{ key: string; promise: Promise<void> } | null>(null)

  const loadFiles = React.useCallback(async () => {
    if (!workspaceId) {
      setFiles([])
      setVersions([])
      setError('Chưa xác định được workspace.')
      setLoading(false)
      return
    }

    // Same request (same params) already in flight - StrictMode's double-effect
    // invocation and refreshKey-triggered reloads both funnel through here, so
    // dedupe instead of firing a second identical fetch.
    const requestKey = deliverableId
      ? `deliverable:${workspaceId}:${deliverableId}`
      : `list:${workspaceId}:${projectId ?? ''}:${taskId ?? ''}`
    if (loadInFlightRef.current?.key === requestKey) return loadInFlightRef.current.promise

    loadAbortRef.current?.abort()
    const controller = new AbortController()
    loadAbortRef.current = controller
    setLoading(true)
    setError('')

    const run = (async () => {
      try {
        if (deliverableId) {
          const params = new URLSearchParams({ workspaceId, deliverableId })
          const response = await fetch(`/api/deliverables?${params}`, { signal: controller.signal })
          const payload = await readJsonResponse<{ deliverable?: DeliverableDetail; versions?: VersionItem[]; error?: string }>(response, 'Không tải được lịch sử version.')
          if (!response.ok) throw new Error(payload.error ?? 'Không tải được lịch sử version.')
          setDetailDeliverable(payload.deliverable ?? null)
          setVersions(payload.versions ?? [])
          setFiles([])
          return
        }

        const params = new URLSearchParams({ workspaceId })
        if (projectId) params.set('projectId', projectId)
        if (taskId) params.set('taskId', taskId)

        const response = await fetch(`/api/upload?${params}`, { signal: controller.signal })
        const payload = await readJsonResponse<{ files?: StorageFile[]; error?: string }>(response, 'Không tải được danh sách file.')
        if (!response.ok) throw new Error(payload.error ?? 'Không tải được danh sách file.')
        setDetailDeliverable(null)
        setFiles(payload.files ?? [])
        setVersions([])
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setFiles([])
        setVersions([])
        setError(err instanceof Error ? err.message : 'Không tải được danh sách file.')
      } finally {
        if (loadInFlightRef.current?.key === requestKey) loadInFlightRef.current = null
        if (loadAbortRef.current === controller) {
          loadAbortRef.current = null
          setLoading(false)
        }
      }
    })()

    loadInFlightRef.current = { key: requestKey, promise: run }
    return run
  }, [deliverableId, projectId, taskId, workspaceId])

  React.useEffect(() => {
    queueMicrotask(() => {
      void loadFiles()
    })
    return () => {
      loadAbortRef.current?.abort()
    }
  }, [loadFiles, refreshKey])

  function openReasonDialog(nextDialog: ReasonDialogState) {
    setError('')
    setReasonInput(nextDialog.defaultReason)
    setReasonDialog(nextDialog)
    setMenuOpenId(null)
  }

  function closeReasonDialog() {
    setReasonDialog(null)
    setReasonInput('')
  }

  function confirmReasonDialog() {
    if (!reasonDialog) return
    const reason = reasonDialog.hideReasonInput ? reasonDialog.defaultReason.trim() : reasonInput.trim()
    if (!reason) {
      setError('Vui lòng nhập lý do trước khi xác nhận.')
      return
    }
    const onConfirm = reasonDialog.onConfirm
    closeReasonDialog()
    onConfirm(reason)
  }

  async function runVersionLifecycleAction(
    versionId: string,
    action: 'deleteVersion' | 'markVersionMistake' | 'supersedeVersion',
    reason: string,
    successMessage?: string,
  ) {
    if (!workspaceId || !deliverableId) return
    setDeletingId(versionId)
    setMenuOpenId(null)
    setError('')
    setNotice('')
    try {
      const response = await fetch('/api/deliverables', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, deliverableId, versionId, action, reason }),
      })
      const payload = await readJsonResponse<{ error?: string }>(response, 'Không xử lý được yêu cầu.')
      if (!response.ok || payload.error) throw new Error(payload.error ?? 'Không xử lý được version.')
      await loadFiles()
      setNotice(successMessage ?? 'Đã cập nhật trạng thái version.')
      onChanged?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không xử lý được version.')
    } finally {
      setDeletingId(null)
    }
  }

  async function runReviewAction(versionId: string, action: 'approve' | 'requestRevision' | 'reject', reviewComment?: string) {
    if (!workspaceId || !deliverableId) return
    setDeletingId(versionId)
    setMenuOpenId(null)
    setError('')
    setNotice('')
    try {
      const response = await fetch('/api/deliverables', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, deliverableId, versionId, action, reviewComment: reviewComment ?? '' }),
      })
      const payload = await readJsonResponse<{ error?: string }>(response, 'Không xử lý được yêu cầu.')
      if (!response.ok || payload.error) throw new Error(payload.error ?? 'Không cập nhật được trạng thái duyệt.')
      await loadFiles()
      setNotice('Đã cập nhật trạng thái duyệt.')
      onChanged?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không cập nhật được trạng thái duyệt.')
    } finally {
      setDeletingId(null)
    }
  }

  async function approveVersion(versionId: string) {
    await runReviewAction(versionId, 'approve', 'Đã xác nhận thủ công.')
  }

  function requestVersionRevision(versionId: string) {
    openReasonDialog({
      title: 'Yêu cầu sửa version',
      description: 'Ghi lý do để người nộp biết cần chỉnh gì.',
      defaultReason: 'File sai nội dung',
      confirmLabel: 'Yêu cầu sửa',
      onConfirm: (reason) => void runReviewAction(versionId, 'requestRevision', reason),
    })
  }

  function rejectVersion(versionId: string) {
    openReasonDialog({
      title: 'Từ chối / không đạt',
      description: 'Version này sẽ không được tính là file hợp lệ.',
      defaultReason: 'File không đạt yêu cầu',
      confirmLabel: 'Từ chối',
      onConfirm: (reason) => void runReviewAction(versionId, 'reject', reason),
    })
  }

  function deleteVersion(version: VersionItem, activeVersionCount: number) {
    const status = normalizeVersionReviewStatus(version.review_status)
    const warnings = [
      activeVersionCount <= 1 ? 'Đây là version cuối cùng.' : '',
      isVersionPending(status) ? 'Version đang chờ duyệt.' : '',
    ].filter(Boolean)
    openReasonDialog({
      title: 'Xóa version này?',
      description: [
        `Version ${version.version_number} sẽ được đánh dấu đã xóa. Bạn có thể dùng version khác hoặc upload version mới.`,
        ...warnings,
      ].join(' '),
      defaultReason: 'Xóa version upload nhầm từ menu tài liệu.',
      confirmLabel: 'Xóa',
      hideReasonInput: true,
      tone: 'danger',
      onConfirm: (reason) => void runVersionLifecycleAction(version.id, 'deleteVersion', reason, `Đã xóa Version ${version.version_number}`),
    })
  }

  function getDeleteVersionState(version: VersionItem, activeVersionCount: number) {
    const status = normalizeVersionReviewStatus(version.review_status)
    if (isVersionInvalid(status)) {
      return { disabled: true, tooltip: 'Version này đã được xử lý trước đó.' }
    }
    if (status === 'APPROVED') {
      return { disabled: true, tooltip: 'Version đã duyệt không thể xóa.' }
    }
    const isOwner = Boolean(currentPersonId && version.submitted_by === currentPersonId)
    const isReviewer = Boolean(currentPersonId && effectiveReviewerId === currentPersonId)
    if (!isOwner && !isReviewer) {
      return { disabled: true, tooltip: 'Chỉ owner hoặc người duyệt có thể xóa.' }
    }
    const warnings = [
      activeVersionCount <= 1 ? 'Đây là version cuối cùng.' : '',
      isVersionPending(status) ? 'Version đang chờ duyệt.' : '',
    ].filter(Boolean).join(' ')
    return { disabled: false, tooltip: warnings || 'Xóa version upload nhầm.' }
  }

  function markVersionMistake(versionId: string) {
    openReasonDialog({
      title: 'Đánh dấu up nhầm',
      description: 'File up nhầm sẽ không mở completion gate. Hãy nộp lại file đúng sau đó.',
      defaultReason: 'Up nhầm file',
      confirmLabel: 'Đánh dấu up nhầm',
      onConfirm: (reason) => void runVersionLifecycleAction(versionId, 'markVersionMistake', reason),
    })
  }

  function supersedeVersion(versionId: string) {
    openReasonDialog({
      title: 'Đánh dấu đã thay thế',
      description: 'Version cũ vẫn còn lịch sử nhưng không còn là bản hiện tại.',
      defaultReason: 'Đã thay bằng version mới',
      confirmLabel: 'Đánh dấu thay thế',
      onConfirm: (reason) => void runVersionLifecycleAction(versionId, 'supersedeVersion', reason),
    })
  }

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      setNotice('Đã copy link file.')
    } catch {
      setError('Không copy được link. Hãy mở file rồi copy thủ công.')
    }
    setMenuOpenId(null)
  }

  function startReplacement(version: VersionItem) {
    const status = normalizeVersionReviewStatus(version.review_status)
    openReasonDialog({
      title: status === 'APPROVED' ? 'Tạo version thay thế' : 'Thay file cho version này',
      description: 'File mới sẽ tạo version mới, không ghi đè version cũ.',
      defaultReason: status === 'APPROVED' ? 'Tạo version thay thế' : 'Thay file sai',
      confirmLabel: 'Chọn file mới',
      onConfirm: (reason) => {
        setReplaceDraft({ versionId: version.id, reason })
        queueMicrotask(() => replaceInputRef.current?.click())
      },
    })
  }

  async function uploadReplacement(file: File) {
    if (!workspaceId || !deliverableId || !replaceDraft) return
    const validationError = validateReplacementFile(file)
    if (validationError) {
      setError(validationError)
      return
    }

    setReplacingId(replaceDraft.versionId)
    setReplaceProgress(0)
    setError('')
    setNotice('')

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('workspaceId', workspaceId)
      if (projectId) formData.append('projectId', projectId)
      if (taskId) formData.append('taskId', taskId)
      formData.append('deliverableId', deliverableId)
      formData.append('supersedesVersionId', replaceDraft.versionId)
      formData.append('replaceReason', replaceDraft.reason)
      formData.append('changeNote', replaceDraft.reason)
      if (effectiveReviewerId) formData.append('approverId', effectiveReviewerId)
      if (requiresApproval) formData.append('requiresApproval', 'true')

      const payload = await uploadFormDataWithProgress<{ error?: string; versionNumber?: number }>('/api/upload', formData, {
        onProgress: (progress) => setReplaceProgress(progress),
      })

      await loadFiles()
      setNotice(payload.versionNumber ? `Đã tạo Version ${payload.versionNumber} thay thế.` : 'Đã tạo version thay thế.')
      onChanged?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thay file được.')
    } finally {
      setReplacingId(null)
      setReplaceProgress(null)
      setReplaceDraft(null)
      if (replaceInputRef.current) replaceInputRef.current.value = ''
    }
  }

  if (loading) {
    return <div style={mutedText}>Đang tải danh sách file...</div>
  }

  if (error) {
    return (
      <div style={errorText}>
        {error}
        <button type="button" onClick={() => void loadFiles()} style={retryButtonStyle}>Thử lại</button>
      </div>
    )
  }

  if (deliverableId) {
    if (!versions.length) return <div style={mutedText}>Chưa có version nào. Hãy nộp file hoặc gắn link.</div>

    const activeVersionCount = versions.filter((item) => !isVersionInvalid(normalizeVersionReviewStatus(item.review_status))).length

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {reasonDialog ? (
          <div style={reasonDialogStyle} role="dialog" aria-modal="false" aria-label={reasonDialog.title}>
            <div style={reasonDialogTitleStyle}>{reasonDialog.title}</div>
            <div style={reasonDialogDescStyle}>{reasonDialog.description}</div>
            <input
              value={reasonInput}
              onChange={(event) => setReasonInput(event.target.value)}
              placeholder="Nhập lý do..."
              style={reasonInputStyle}
              hidden={reasonDialog.hideReasonInput}
            />
            <div style={reasonDialogActionStyle}>
              <button type="button" onClick={closeReasonDialog} style={secondaryButtonStyle}>Hủy</button>
              <button type="button" onClick={confirmReasonDialog} style={reasonDialog.tone === 'danger' ? dangerConfirmButtonStyle : primaryButtonStyle}>{reasonDialog.confirmLabel}</button>
            </div>
          </div>
        ) : null}
        <input
          ref={replaceInputRef}
          type="file"
          hidden
          accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg,.jpeg,.gif,.webp,.zip,.html,.htm"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void uploadReplacement(file)
          }}
        />
        {replaceProgress !== null ? (
          <div style={progressWrapStyle}>
            <div style={progressMetaStyle}>
              <span>{replaceProgress >= 100 ? 'Đang xử lý file...' : `Đang tải lên ${replaceProgress}%...`}</span>
              <strong>{replaceProgress}%</strong>
            </div>
            <div style={progressTrackStyle}>
              <div style={progressBarStyle(replaceProgress)} />
            </div>
          </div>
        ) : null}
        {notice ? <div style={noticeText}>{notice}</div> : null}
        {versions.map((version) => {
          const isExternalLink = Boolean(version.external_url)
          const fileName = version.external_url
            ? externalLinkDisplayName(version.external_url, version.change_note, `Version ${version.version_number}`)
            : version.attachment?.file_name ?? `Version ${version.version_number}`
          const mime = isExternalLink ? 'external_url' : version.attachment?.mime_type ?? ''
          const url = version.external_url ?? version.attachment?.url ?? null
          const linkNote = isExternalLink ? parseExternalLinkChangeNote(version.change_note).note : version.change_note
          const status = normalizeVersionReviewStatus(version.review_status)
          const tone = versionReviewTone(status)
          const submitter = version.submitted_by ? peopleById[version.submitted_by] : null
          const reviewer = effectiveReviewerId ? peopleById[effectiveReviewerId] : null
          const confirmer = version.reviewed_by ? peopleById[version.reviewed_by] : null
          const invalid = isVersionInvalid(status)
          const approved = status === 'APPROVED'
          const needsRevision = status === 'REVISION_REQUESTED' || status === 'REJECTED'
          const menuOpen = menuOpenId === version.id
          const busy = deletingId === version.id || replacingId === version.id
          const deleteState = getDeleteVersionState(version, activeVersionCount)

          return (
            <div key={version.id} style={versionRowStyle(invalid)}>
              <div style={versionHeaderStyle}>
                <i className={`ti ${fileIcon(fileName, mime)}`} style={fileIconStyle} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={fileNameStyle}>
                    Version {version.version_number} — {fileName}
                  </div>
                  <div style={fileMetaStyle}>
                    {fileTypeLabel(fileName, mime)} ·{' '}
                    {version.submitted_at ? `Nộp lúc ${new Date(version.submitted_at).toLocaleString('vi-VN')}` : 'Chưa có thời gian nộp'}
                    {submitter ? ` · bởi ${submitter.full_name ?? submitter.name}` : ''}
                    {reviewer ? ` · Người xác nhận: ${reviewer.full_name ?? reviewer.name}` : ''}
                    {confirmer ? ` · Người xác nhận: ${confirmer.full_name ?? confirmer.name}` : ''}
                    {version.reviewed_at ? ` · Xác nhận lúc ${new Date(version.reviewed_at).toLocaleString('vi-VN')}` : ''}
                    {version.attachment?.size_bytes ? ` · ${formatBytes(version.attachment.size_bytes)}` : ''}
                  </div>
                  {linkNote ? <div style={noteTextStyle}>{linkNote}</div> : null}
                  {version.review_comment ? <div style={reviewCommentStyle}>{version.review_comment}</div> : null}
                </div>
                <span style={{ ...badgeStyle, color: tone.color, background: tone.bg }}>{versionReviewLabel(status)}</span>
                <div style={menuWrapStyle}>
                  <button
                    type="button"
                    onClick={() => setMenuOpenId(menuOpen ? null : version.id)}
                    disabled={busy}
                    aria-label="Mở menu xử lý version"
                    title="Xử lý version"
                    style={menuButtonStyle}
                  >
                    {busy ? <i className="ti ti-loader-2" style={loaderStyle} /> : <i className="ti ti-dots" />}
                  </button>
                  {menuOpen ? (
                    <div style={menuPanelStyle}>
                      {url ? (
                        <>
                          <a href={url} target="_blank" rel="noopener noreferrer" style={menuItemStyle}>
                            <i className={`ti ${isExternalLink ? 'ti-external-link' : 'ti-eye'}`} />
                            {isExternalLink ? 'Mở link' : 'Mở file'}
                          </a>
                          {!isExternalLink ? (
                            <a href={url} download style={menuItemStyle}>
                            <i className="ti ti-download" />
                            Tải xuống
                          </a>
                          ) : null}
                          <button type="button" onClick={() => void copyLink(url)} style={menuItemStyle}>
                            <i className="ti ti-link" />
                            Copy link
                          </button>
                        </>
                      ) : null}
                      {!invalid && approved ? (
                        <>
                          <button type="button" onClick={() => void requestVersionRevision(version.id)} style={menuItemStyle}>
                            <i className="ti ti-edit" />
                            Yêu cầu sửa
                          </button>
                          <button type="button" onClick={() => void rejectVersion(version.id)} style={menuItemStyle}>
                            <i className="ti ti-circle-x" />
                            Đánh dấu từ chối / không đạt
                          </button>
                          <button type="button" onClick={() => startReplacement(version)} style={menuItemStyle}>
                            <i className="ti ti-upload" />
                            Tạo version thay thế
                          </button>
                          <button type="button" onClick={() => void supersedeVersion(version.id)} style={menuItemStyle}>
                            <i className="ti ti-replace" />
                            Đánh dấu đã thay thế
                          </button>
                          <button type="button" disabled title={deleteState.tooltip} style={disabledDangerMenuItemStyle}>
                            <i className="ti ti-trash" />
                            Xóa version
                          </button>
                        </>
                      ) : null}
                      {!invalid && !approved ? (
                        <>
                          <button type="button" onClick={() => void approveVersion(version.id)} style={menuItemStyle}>
                            <i className="ti ti-circle-check" />
                            Đánh dấu đã duyệt
                          </button>
                          {!needsRevision ? (
                            <>
                              <button type="button" onClick={() => void requestVersionRevision(version.id)} style={menuItemStyle}>
                                <i className="ti ti-edit" />
                                Yêu cầu sửa
                              </button>
                              <button type="button" onClick={() => void rejectVersion(version.id)} style={menuItemStyle}>
                                <i className="ti ti-circle-x" />
                                Đánh dấu từ chối / không đạt
                              </button>
                            </>
                          ) : null}
                          <button type="button" onClick={() => startReplacement(version)} style={menuItemStyle}>
                            <i className="ti ti-upload" />
                            Thay file
                          </button>
                          <button type="button" onClick={() => void markVersionMistake(version.id)} style={menuItemStyle}>
                            <i className="ti ti-alert-circle" />
                            Đánh dấu up nhầm
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteState.disabled ? undefined : void deleteVersion(version, activeVersionCount)}
                            disabled={deleteState.disabled}
                            title={deleteState.tooltip}
                            style={deleteState.disabled ? disabledDangerMenuItemStyle : dangerMenuItemStyle}
                          >
                            <i className="ti ti-trash" />
                            Xóa version
                          </button>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  if (!files.length) return <div style={mutedText}>Chưa có file nào.</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {files.map((file) => (
        <div key={file.storagePath} style={fileRowStyle}>
          <i className={`ti ${fileIcon(file.name, file.metadata?.mimetype)}`} style={fileIconStyle} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={fileNameStyle}>{file.name.replace(/^\d+_/, '')}</div>
            <div style={fileMetaStyle}>
              {fileTypeLabel(file.name, file.metadata?.mimetype)}
              {file.metadata?.size ? ` · ${formatBytes(file.metadata.size)}` : ''}
            </div>
          </div>
          {file.url ? (
            <a href={file.url} target="_blank" rel="noopener noreferrer" style={actionLinkStyle}>
              <i className="ti ti-download" />
              Tải
            </a>
          ) : null}
        </div>
      ))}
    </div>
  )
}

const mutedText: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--color-text-muted)',
  padding: '8px 0',
}

const errorText: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
  fontSize: 12,
  color: 'var(--color-danger)',
  padding: '8px 0',
}

const noticeText: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--color-success)',
  background: 'var(--color-success-bg)',
  border: '1px solid rgba(56, 142, 60, 0.22)',
  borderRadius: 8,
  padding: '7px 9px',
}

const progressWrapStyle: React.CSSProperties = {
  padding: '8px 10px',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--color-border)',
  background: 'var(--color-surface-2)',
}

const progressMetaStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  fontSize: 12,
  color: 'var(--color-text-muted)',
  fontWeight: 700,
}

const progressTrackStyle: React.CSSProperties = {
  marginTop: 7,
  height: 7,
  borderRadius: 999,
  overflow: 'hidden',
  background: 'var(--color-border)',
}

const progressBarStyle = (progress: number): React.CSSProperties => ({
  width: `${Math.max(0, Math.min(100, progress))}%`,
  height: '100%',
  borderRadius: 999,
  background: 'var(--color-lime)',
  transition: 'width 0.18s ease',
})

const reasonDialogStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  padding: 12,
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--color-surface-2)',
  boxShadow: '0 14px 34px rgba(0,0,0,.22)',
}

const reasonDialogTitleStyle: React.CSSProperties = {
  color: 'var(--color-text)',
  fontSize: 13,
  fontWeight: 850,
}

const reasonDialogDescStyle: React.CSSProperties = {
  color: 'var(--color-text-muted)',
  fontSize: 12,
  lineHeight: 1.45,
}

const reasonInputStyle: React.CSSProperties = {
  width: '100%',
  minHeight: 36,
  borderRadius: 9,
  border: '1px solid var(--color-border)',
  background: 'var(--color-surface)',
  color: 'var(--color-text)',
  padding: '8px 10px',
  fontSize: 12,
  outline: 'none',
}

const reasonDialogActionStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 8,
}

const secondaryButtonStyle: React.CSSProperties = {
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  background: 'var(--color-surface)',
  color: 'var(--color-text-muted)',
  padding: '7px 10px',
  fontSize: 12,
  fontWeight: 800,
}

const primaryButtonStyle: React.CSSProperties = {
  border: '1px solid rgba(218,223,33,.32)',
  borderRadius: 8,
  background: 'var(--color-lime)',
  color: 'var(--color-charcoal)',
  padding: '7px 10px',
  fontSize: 12,
  fontWeight: 850,
}

const retryButtonStyle: React.CSSProperties = {
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  background: 'var(--color-surface)',
  color: 'var(--color-text)',
  padding: '5px 8px',
  fontSize: 11,
  fontWeight: 700,
}

const fileRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '8px 12px',
  background: 'var(--color-surface-2)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-md)',
}

const versionRowStyle = (invalid: boolean): React.CSSProperties => ({
  padding: 12,
  background: 'var(--color-surface-2)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-md)',
  opacity: invalid ? 0.58 : 1,
})

const versionHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 10,
}

const fileIconStyle: React.CSSProperties = {
  fontSize: 17,
  color: 'var(--color-text-muted)',
  flexShrink: 0,
  marginTop: 1,
}

const fileNameStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  color: 'var(--color-text)',
}

const fileMetaStyle: React.CSSProperties = {
  marginTop: 3,
  fontSize: 11,
  color: 'var(--color-text-muted)',
  lineHeight: 1.45,
}

const noteTextStyle: React.CSSProperties = {
  marginTop: 6,
  fontSize: 12,
  color: 'var(--color-text)',
  lineHeight: 1.45,
}

const reviewCommentStyle: React.CSSProperties = {
  marginTop: 6,
  fontSize: 12,
  color: 'var(--color-danger)',
  background: 'rgba(184,64,64,0.08)',
  borderRadius: 8,
  padding: '6px 8px',
}

const badgeStyle: React.CSSProperties = {
  flexShrink: 0,
  borderRadius: 'var(--radius-full)',
  padding: '4px 8px',
  fontSize: 11,
  fontWeight: 800,
}

const actionLinkStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--color-text-muted)',
  padding: '5px 8px',
  border: '1px solid var(--color-border)',
  borderRadius: 7,
  textDecoration: 'none',
  flexShrink: 0,
}

const menuWrapStyle: React.CSSProperties = {
  position: 'relative',
  flexShrink: 0,
}

const menuButtonStyle: React.CSSProperties = {
  width: 30,
  height: 30,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  color: 'var(--color-text-muted)',
  background: 'var(--color-surface)',
}

const menuPanelStyle: React.CSSProperties = {
  position: 'absolute',
  top: 34,
  right: 0,
  zIndex: 20,
  minWidth: 190,
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  padding: 6,
  border: '1px solid var(--color-border)',
  borderRadius: 10,
  background: 'var(--color-surface)',
  boxShadow: '0 18px 42px rgba(0,0,0,.28)',
}

const menuItemStyle: React.CSSProperties = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '8px 9px',
  borderRadius: 7,
  border: 0,
  background: 'transparent',
  color: 'var(--color-text)',
  textDecoration: 'none',
  fontSize: 12,
  fontWeight: 750,
  textAlign: 'left',
}

const dangerMenuItemStyle: React.CSSProperties = {
  ...menuItemStyle,
  color: 'var(--color-danger)',
}

const disabledDangerMenuItemStyle: React.CSSProperties = {
  ...dangerMenuItemStyle,
  opacity: 0.45,
  cursor: 'not-allowed',
}

const dangerConfirmButtonStyle: React.CSSProperties = {
  ...primaryButtonStyle,
  border: '1px solid rgba(184,64,64,.38)',
  background: 'var(--color-danger)',
  color: '#fff',
}

const loaderStyle: React.CSSProperties = {
  animation: 'spin 0.8s linear infinite',
}
