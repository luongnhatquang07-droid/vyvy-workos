'use client'

import React from 'react'

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
  review_status: 'NOT_REQUESTED' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVISION_REQUESTED' | 'CANCELLED'
  review_comment: string | null
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

interface FileListProps {
  workspaceId?: string
  projectId?: string
  taskId?: string
  deliverableId?: string
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
  if (ext === 'pdf' || mime.includes('pdf')) return 'ti-file-type-pdf'
  if (['doc', 'docx'].includes(ext) || mime.includes('word')) return 'ti-file-type-doc'
  if (['xls', 'xlsx', 'csv'].includes(ext) || mime.includes('excel')) return 'ti-file-type-xls'
  if (['zip', 'rar', '7z'].includes(ext)) return 'ti-file-zip'
  if (mime === 'external_url') return 'ti-link'
  return 'ti-file'
}

function reviewLabel(status: VersionItem['review_status']) {
  if (status === 'APPROVED') return 'Đã duyệt'
  if (status === 'REVISION_REQUESTED') return 'Yêu cầu sửa'
  if (status === 'REJECTED') return 'Từ chối'
  if (status === 'CANCELLED') return 'Đã hủy'
  if (status === 'NOT_REQUESTED') return 'Chưa yêu cầu'
  return 'Chờ review'
}

function reviewTone(status: VersionItem['review_status']) {
  if (status === 'APPROVED') return { color: 'var(--color-success)', bg: 'var(--color-success-bg)' }
  if (status === 'REVISION_REQUESTED' || status === 'REJECTED') return { color: 'var(--color-danger)', bg: 'var(--color-danger-bg)' }
  return { color: 'var(--color-warning)', bg: 'var(--color-warning-bg)' }
}

export function FileList({
  workspaceId,
  projectId,
  taskId,
  deliverableId,
  refreshKey,
  peopleById = {},
  onChanged,
}: FileListProps) {
  const [files, setFiles] = React.useState<StorageFile[]>([])
  const [versions, setVersions] = React.useState<VersionItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [deletingId, setDeletingId] = React.useState<string | null>(null)
  const [error, setError] = React.useState('')

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
        const payload = (await response.json()) as { versions?: VersionItem[]; error?: string }
        if (!response.ok) throw new Error(payload.error ?? 'Không tải được lịch sử version.')
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

  async function deleteVersion(versionId: string) {
    if (!workspaceId || !deliverableId) return
    setDeletingId(versionId)
    setError('')
    try {
      const response = await fetch('/api/deliverables', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, deliverableId, versionId, action: 'deleteVersion' }),
      })
      const payload = (await response.json()) as { error?: string }
      if (!response.ok || payload.error) throw new Error(payload.error ?? 'Không xóa được version.')
      await loadFiles()
      onChanged?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không xóa được version.')
    } finally {
      setDeletingId(null)
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
        {versions.map((version) => {
          const fileName = version.external_url ?? version.attachment?.file_name ?? `Version ${version.version_number}`
          const mime = version.external_url ? 'external_url' : version.attachment?.mime_type ?? ''
          const url = version.external_url ?? version.attachment?.url ?? null
          const tone = reviewTone(version.review_status)
          const submitter = version.submitted_by ? peopleById[version.submitted_by] : null
          const canDelete = version.review_status !== 'APPROVED'

          return (
            <div key={version.id} style={versionRowStyle}>
              <div style={versionHeaderStyle}>
                <i className={`ti ${fileIcon(fileName, mime)}`} style={fileIconStyle} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={fileNameStyle}>
                    Version {version.version_number} — {fileName}
                  </div>
                  <div style={fileMetaStyle}>
                    {version.submitted_at ? `Nộp lúc ${new Date(version.submitted_at).toLocaleString('vi-VN')}` : 'Chưa có thời gian nộp'}
                    {submitter ? ` · bởi ${submitter.full_name ?? submitter.name}` : ''}
                    {version.attachment?.size_bytes ? ` · ${formatBytes(version.attachment.size_bytes)}` : ''}
                  </div>
                  {version.change_note ? <div style={noteTextStyle}>{version.change_note}</div> : null}
                  {version.review_comment ? <div style={reviewCommentStyle}>{version.review_comment}</div> : null}
                </div>
                <span style={{ ...badgeStyle, color: tone.color, background: tone.bg }}>{reviewLabel(version.review_status)}</span>
              </div>

              <div style={versionActionsStyle}>
                {url ? (
                  <a href={url} target="_blank" rel="noopener noreferrer" style={actionLinkStyle}>
                    <i className="ti ti-download" />
                    Xem / tải
                  </a>
                ) : null}
                {canDelete ? (
                  <button
                    type="button"
                    onClick={() => void deleteVersion(version.id)}
                    disabled={deletingId === version.id}
                    style={dangerButtonStyle}
                  >
                    {deletingId === version.id ? 'Đang xóa...' : 'Xóa version'}
                  </button>
                ) : null}
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
            {file.metadata?.size ? <div style={fileMetaStyle}>{formatBytes(file.metadata.size)}</div> : null}
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

const versionRowStyle: React.CSSProperties = {
  padding: 12,
  background: 'var(--color-surface-2)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-md)',
}

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

const versionActionsStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 8,
  marginTop: 10,
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

const dangerButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--color-danger)',
  padding: '5px 8px',
  border: '1px solid rgba(184,64,64,0.24)',
  borderRadius: 7,
  background: 'var(--color-danger-bg)',
}
