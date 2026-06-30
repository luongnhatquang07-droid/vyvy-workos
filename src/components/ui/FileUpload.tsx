'use client'

import React from 'react'

interface UploadedFile {
  attachmentId: string
  fileName: string
  fileSize: number
  mimeType: string
  url: string | null
  storagePath: string
}

interface UploadResponse extends Partial<UploadedFile> {
  error?: string
}

interface FileUploadProps {
  workspaceId?: string
  projectId?: string
  taskId?: string
  deliverableId?: string
  onUploaded?: (file: UploadedFile) => void
  label?: string
  compact?: boolean
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function fileIcon(mime: string) {
  if (mime.startsWith('image/')) return 'ti-photo'
  if (mime.includes('pdf')) return 'ti-file-type-pdf'
  if (mime.includes('word') || mime.includes('doc')) return 'ti-file-type-doc'
  if (mime.includes('excel') || mime.includes('sheet') || mime.includes('xls')) return 'ti-file-type-xls'
  if (mime.includes('zip') || mime.includes('rar')) return 'ti-file-zip'
  return 'ti-file'
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Lỗi upload'
}

export function FileUpload({
  workspaceId,
  projectId,
  taskId,
  deliverableId,
  onUploaded,
  label,
  compact = false,
}: FileUploadProps) {
  const [dragging, setDragging] = React.useState(false)
  const [uploading, setUploading] = React.useState(false)
  const [uploads, setUploads] = React.useState<UploadedFile[]>([])
  const [error, setError] = React.useState('')
  const inputRef = React.useRef<HTMLInputElement>(null)

  async function uploadFile(file: File) {
    if (!workspaceId) {
      setError('Chưa xác định được workspace nên chưa thể tải file.')
      return
    }

    setUploading(true)
    setError('')

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('workspaceId', workspaceId)
      if (projectId) formData.append('projectId', projectId)
      if (taskId) formData.append('taskId', taskId)
      if (deliverableId) formData.append('deliverableId', deliverableId)

      const response = await fetch('/api/upload', { method: 'POST', body: formData })
      const payload = (await response.json()) as UploadResponse
      if (!response.ok || payload.error) throw new Error(payload.error ?? 'Upload thất bại')

      if (!payload.attachmentId || !payload.fileName || !payload.fileSize || !payload.mimeType || !payload.storagePath) {
        throw new Error('Phản hồi upload thiếu dữ liệu')
      }

      const uploaded: UploadedFile = {
        attachmentId: payload.attachmentId,
        fileName: payload.fileName,
        fileSize: payload.fileSize,
        mimeType: payload.mimeType,
        url: payload.url ?? null,
        storagePath: payload.storagePath,
      }

      setUploads((current) => [uploaded, ...current])
      onUploaded?.(uploaded)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setUploading(false)
    }
  }

  function handleFiles(files: FileList | null) {
    if (!files?.length) return
    Array.from(files).forEach((file) => void uploadFile(file))
  }

  function onDrop(event: React.DragEvent) {
    event.preventDefault()
    setDragging(false)
    handleFiles(event.dataTransfer.files)
  }

  return (
    <div>
      <div
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => workspaceId && !uploading && inputRef.current?.click()}
        style={dropZoneStyle(dragging, uploading || !workspaceId, compact)}
      >
        <input ref={inputRef} type="file" multiple hidden onChange={(event) => handleFiles(event.target.files)} />
        {uploading ? (
          <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
            <i className="ti ti-loader-2" style={loaderStyle} />
            Đang tải lên...
          </div>
        ) : (
          <div>
            <i className="ti ti-cloud-upload" style={cloudStyle(compact)} />
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)' }}>
              {workspaceId ? label ?? 'Kéo thả file hoặc bấm để chọn' : 'Chưa xác định workspace'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 3 }}>
              {workspaceId ? 'PDF, Word, Excel, ảnh, ZIP. Tối đa 25 MB/file' : 'Hãy đăng nhập lại hoặc kiểm tra quyền workspace.'}
            </div>
          </div>
        )}
      </div>

      {error ? <div style={errorStyle}>{error}</div> : null}

      {uploads.length > 0 ? (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {uploads.map((file) => (
            <div key={file.attachmentId} style={uploadedRowStyle}>
              <i className={`ti ${fileIcon(file.mimeType)}`} style={uploadedIconStyle} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={uploadedNameStyle}>{file.fileName}</div>
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{formatBytes(file.fileSize)}</div>
              </div>
              <span style={successStyle}>Đã tải lên</span>
              {file.url ? (
                <a href={file.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} onClick={(event) => event.stopPropagation()}>
                  <i className="ti ti-external-link" style={{ fontSize: 14 }} />
                </a>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

const dropZoneStyle = (dragging: boolean, uploading: boolean, compact: boolean): React.CSSProperties => ({
  border: `2px dashed ${dragging ? 'var(--color-lime-d)' : 'var(--color-border)'}`,
  borderRadius: 'var(--radius-lg)',
  padding: compact ? '14px 16px' : '22px 20px',
  background: dragging ? 'rgba(218,223,33,0.05)' : 'var(--color-surface-2)',
  cursor: uploading ? 'wait' : 'pointer',
  textAlign: 'center',
  transition: 'border-color 0.15s, background 0.15s',
})

const loaderStyle: React.CSSProperties = {
  fontSize: 18,
  display: 'block',
  marginBottom: 6,
  animation: 'spin 1s linear infinite',
}

const cloudStyle = (compact: boolean): React.CSSProperties => ({
  fontSize: compact ? 20 : 28,
  color: 'var(--color-text-muted)',
  display: 'block',
  marginBottom: 6,
})

const errorStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--color-danger)',
  marginTop: 6,
  padding: '6px 10px',
  background: 'rgba(184,64,64,0.08)',
  borderRadius: 6,
}

const uploadedRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '8px 12px',
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-md)',
}

const uploadedIconStyle: React.CSSProperties = {
  fontSize: 18,
  color: 'var(--color-text-muted)',
  flexShrink: 0,
}

const uploadedNameStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 500,
  color: 'var(--color-text)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const successStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--color-success)',
  fontWeight: 700,
  flexShrink: 0,
}
