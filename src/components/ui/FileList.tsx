'use client'

import React from 'react'
import {
  isVersionInvalid,
  normalizeVersionReviewStatus,
  versionReviewLabel,
  versionReviewTone,
  type VersionReviewStatus,
} from '@/lib/deliverableVersionStatus'

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
  requiresApproval?: boolean
  refreshKey?: number
  peopleById?: Record<string, { full_name?: string; name?: string }>
  onChanged?: () => void
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
  const [replaceDraft, setReplaceDraft] = React.useState<{ versionId: string; reason: string } | null>(null)
  const [notice, setNotice] = React.useState('')
  const [error, setError] = React.useState('')
  const replaceInputRef = React.useRef<HTMLInputElement>(null)
  const effectiveReviewerId = reviewerId ?? detailDeliverable?.reviewer_id ?? null

  const loadFiles = React.useCallback(async () => {
    setLoading(true)
    setError('')

    if (!workspaceId) {
      setFiles([])
      setVersions([])
      setError('Chưa xác định được workspace.')
      setLoading(false)
      return
    }

    try {
      if (deliverableId) {
        const params = new URLSearchParams({ workspaceId, deliverableId })
        const response = await fetch(`/api/deliverables?${params}`)
        const payload = (await response.json()) as { deliverable?: DeliverableDetail; versions?: VersionItem[]; error?: string }
        if (!response.ok) throw new Error(payload.error ?? 'Không tải được lịch sử version.')
        setDetailDeliverable(payload.deliverable ?? null)
        setVersions(payload.versions ?? [])
        setFiles([])
        return
      }

      const params = new URLSearchParams({ workspaceId })
      if (projectId) params.set('projectId', projectId)
      if (taskId) params.set('taskId', taskId)

      const response = await fetch(`/api/upload?${params}`)
      const payload = (await response.json()) as { files?: StorageFile[]; error?: string }
      if (!response.ok) throw new Error(payload.error ?? 'Không tải được danh sách file.')
      setDetailDeliverable(null)
      setFiles(payload.files ?? [])
      setVersions([])
    } catch (err) {
      setFiles([])
      setVersions([])
      setError(err instanceof Error ? err.message : 'Không tải được danh sách file.')
    } finally {
      setLoading(false)
    }
  }, [deliverableId, projectId, taskId, workspaceId])

  React.useEffect(() => {
    queueMicrotask(() => {
      void loadFiles()
    })
  }, [loadFiles, refreshKey])

  function askVersionReason(actionLabel: string) {
    const fallbackReason = 'Up nhầm file'
    try {
      return window.prompt(
      `${actionLabel}\n\nChọn/nhập lý do: Up nhầm file, File sai nội dung, File trùng, Khác`,
      'Up nhầm file',
      )?.trim() ?? ''
    } catch {
      return fallbackReason
    }
  }

  async function runVersionLifecycleAction(
    versionId: string,
    action: 'deleteVersion' | 'markVersionMistake' | 'supersedeVersion',
    reason: string,
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
      const payload = (await response.json()) as { error?: string }
      if (!response.ok || payload.error) throw new Error(payload.error ?? 'Không xử lý được version.')
      await loadFiles()
      setNotice('Đã cập nhật trạng thái version.')
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
      const payload = (await response.json()) as { error?: string }
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

  async function requestVersionRevision(versionId: string) {
    const reason = askVersionReason('Yêu cầu sửa version')
    if (!reason) return
    await runReviewAction(versionId, 'requestRevision', reason)
  }

  async function rejectVersion(versionId: string) {
    const reason = askVersionReason('Đánh dấu từ chối / không đạt')
    if (!reason) return
    await runReviewAction(versionId, 'reject', reason)
  }

  async function deleteVersion(versionId: string) {
    const reason = askVersionReason('Xóa/hủy version chưa duyệt')
    if (!reason) return
    await runVersionLifecycleAction(versionId, 'deleteVersion', reason)
  }

  async function markVersionMistake(versionId: string) {
    const reason = askVersionReason('Đánh dấu version up nhầm')
    if (!reason) return
    await runVersionLifecycleAction(versionId, 'markVersionMistake', reason)
  }

  async function supersedeVersion(versionId: string) {
    const reason = askVersionReason('Đánh dấu version cũ đã bị thay thế')
    if (!reason) return
    await runVersionLifecycleAction(versionId, 'supersedeVersion', reason)
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
    const reason = askVersionReason(status === 'APPROVED' ? 'Tạo version thay thế' : 'Thay file cho version này')
    if (!reason) return
    setReplaceDraft({ versionId: version.id, reason })
    setMenuOpenId(null)
    queueMicrotask(() => replaceInputRef.current?.click())
  }

  async function uploadReplacement(file: File) {
    if (!workspaceId || !deliverableId || !replaceDraft) return
    const validationError = validateReplacementFile(file)
    if (validationError) {
      setError(validationError)
      return
    }

    setReplacingId(replaceDraft.versionId)
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

      const response = await fetch('/api/upload', { method: 'POST', body: formData })
      const payload = (await response.json()) as { error?: string; versionNumber?: number }
      if (!response.ok || payload.error) throw new Error(payload.error ?? 'Không thay file được.')

      await loadFiles()
      setNotice(payload.versionNumber ? `Đã tạo Version ${payload.versionNumber} thay thế.` : 'Đã tạo version thay thế.')
      onChanged?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thay file được.')
    } finally {
      setReplacingId(null)
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

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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
        {notice ? <div style={noticeText}>{notice}</div> : null}
        {versions.map((version) => {
          const fileName = version.external_url ?? version.attachment?.file_name ?? `Version ${version.version_number}`
          const mime = version.external_url ? 'external_url' : version.attachment?.mime_type ?? ''
          const url = version.external_url ?? version.attachment?.url ?? null
          const viewUrl = !version.external_url && isHtmlFile(fileName, mime)
            ? htmlPreviewUrl({ workspaceId, storagePath: version.attachment?.storage_path, fileName })
            : url
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
                  {version.change_note ? <div style={noteTextStyle}>{version.change_note}</div> : null}
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
                          <a href={viewUrl ?? url} target="_blank" rel="noopener noreferrer" style={menuItemStyle}>
                            <i className="ti ti-eye" />
                            Xem file
                          </a>
                          <a href={url} download style={menuItemStyle}>
                            <i className="ti ti-download" />
                            Tải xuống
                          </a>
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
                          <button type="button" onClick={() => void deleteVersion(version.id)} style={dangerMenuItemStyle}>
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

const loaderStyle: React.CSSProperties = {
  animation: 'spin 0.8s linear infinite',
}
