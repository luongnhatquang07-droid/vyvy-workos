'use client'

import React from 'react'

const MAX_FILE_SIZE = 25 * 1024 * 1024
const ALLOWED_EXTENSIONS = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'zip'])

export interface UploadedFile {
  attachmentId?: string
  fileName: string
  fileSize: number
  mimeType: string
  url: string | null
  storagePath?: string
  versionId?: string | null
  versionNumber?: number | null
  storageMode: 'supabase' | 'external_url'
}

interface UploadResponse extends Partial<UploadedFile> {
  error?: string
}

interface LinkResponse {
  ok?: boolean
  error?: string
  versionId?: string
  versionNumber?: number
}

interface FileUploadProps {
  workspaceId?: string
  projectId?: string
  taskId?: string
  deliverableId?: string
  onUploaded?: (file: UploadedFile) => void
  label?: string
  compact?: boolean
  allowLink?: boolean
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
  if (mime === 'external_url') return 'ti-link'
  return 'ti-file'
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Lỗi upload'
}

function validateFile(file: File) {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (!ALLOWED_EXTENSIONS.has(extension)) return 'Chỉ hỗ trợ PDF, Word, Excel/CSV, ảnh và ZIP.'
  if (file.size <= 0) return 'File đang rỗng, chưa thể tải lên.'
  if (file.size > MAX_FILE_SIZE) return 'File vượt quá giới hạn 25MB.'
  return ''
}

export function FileUpload({
  workspaceId,
  projectId,
  taskId,
  deliverableId,
  onUploaded,
  label,
  compact = false,
  allowLink = true,
}: FileUploadProps) {
  const [dragging, setDragging] = React.useState(false)
  const [uploading, setUploading] = React.useState(false)
  const [mode, setMode] = React.useState<'file' | 'link'>('file')
  const [uploads, setUploads] = React.useState<UploadedFile[]>([])
  const [error, setError] = React.useState('')
  const [changeNote, setChangeNote] = React.useState<string>('')
  const [externalUrl, setExternalUrl] = React.useState<string>('')
  const [lastStatus, setLastStatus] = React.useState('')
  const inputRef = React.useRef<HTMLInputElement>(null)

  async function uploadFile(file: File) {
    if (!workspaceId) {
      setError('Chưa xác định được workspace nên chưa thể tải file.')
      return
    }

    const validationError = validateFile(file)
    if (validationError) {
      setError(validationError)
      return
    }

    setUploading(true)
    setLastStatus('Đang tải file...')
    setError('')

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('workspaceId', workspaceId)
      if (projectId) formData.append('projectId', projectId)
      if (taskId) formData.append('taskId', taskId)
      if (deliverableId) formData.append('deliverableId', deliverableId)
      if (changeNote.trim()) formData.append('changeNote', changeNote.trim())

      const response = await fetch('/api/upload', { method: 'POST', body: formData })
      const payload = (await response.json()) as UploadResponse
      if (!response.ok || payload.error) throw new Error(payload.error ?? 'Upload thất bại')

      if (!payload.fileName || !payload.fileSize || !payload.mimeType || !payload.storagePath) {
        throw new Error('Phản hồi upload thiếu dữ liệu')
      }

      const uploaded: UploadedFile = {
        attachmentId: payload.attachmentId,
        fileName: payload.fileName,
        fileSize: payload.fileSize,
        mimeType: payload.mimeType,
        url: payload.url ?? null,
        storagePath: payload.storagePath,
        versionId: payload.versionId ?? null,
        versionNumber: payload.versionNumber ?? null,
        storageMode: 'supabase',
      }

      setUploads((current) => [uploaded, ...current])
      setLastStatus(uploaded.versionNumber ? `Đã lưu Version ${uploaded.versionNumber}` : 'Đã lưu file')
      setChangeNote('')
      onUploaded?.(uploaded)
    } catch (err) {
      setLastStatus('')
      setError(errorMessage(err))
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function submitLink() {
    if (!workspaceId || !deliverableId) {
      setError('Cần có workspace và deliverable trước khi gắn link.')
      return
    }
    if (!/^https?:\/\/\S+/i.test(externalUrl.trim())) {
      setError('Link phải bắt đầu bằng http:// hoặc https://.')
      return
    }

    setUploading(true)
    setLastStatus('Đang lưu link...')
    setError('')

    try {
      const response = await fetch('/api/deliverables', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          deliverableId,
          action: 'submitLink',
          externalUrl: externalUrl.trim(),
          changeNote: changeNote.trim(),
        }),
      })
      const payload = (await response.json()) as LinkResponse
      if (!response.ok || payload.error) throw new Error(payload.error ?? 'Không lưu được link')

      const uploaded: UploadedFile = {
        fileName: externalUrl.trim(),
        fileSize: 0,
        mimeType: 'external_url',
        url: externalUrl.trim(),
        versionId: payload.versionId ?? null,
        versionNumber: payload.versionNumber ?? null,
        storageMode: 'external_url',
      }
      setUploads((current) => [uploaded, ...current])
      setLastStatus(payload.versionNumber ? `Đã lưu Version ${payload.versionNumber}` : 'Đã lưu link')
      setExternalUrl('')
      setChangeNote('')
      onUploaded?.(uploaded)
    } catch (err) {
      setLastStatus('')
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
      {allowLink && deliverableId ? (
        <div style={modeSwitchStyle}>
          <button type="button" onClick={() => setMode('file')} style={modeButtonStyle(mode === 'file')}>File</button>
          <button type="button" onClick={() => setMode('link')} style={modeButtonStyle(mode === 'link')}>Link</button>
        </div>
      ) : null}

      {mode === 'file' ? (
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
          <input key="file-picker" ref={inputRef} type="file" multiple hidden onChange={(event) => handleFiles(event.target.files)} />
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
      ) : (
        <div style={linkBoxStyle}>
          <input
            key="external-url"
            value={externalUrl ?? ''}
            onChange={(event) => setExternalUrl(event.currentTarget.value ?? '')}
            placeholder="Dán link Drive/Figma/Notion/Sheet..."
            style={inputStyle}
            disabled={uploading}
          />
          <button type="button" onClick={() => void submitLink()} disabled={uploading} style={primaryButtonStyle(uploading)}>
            Lưu link
          </button>
        </div>
      )}

      <textarea
        value={changeNote ?? ''}
        onChange={(event) => setChangeNote(event.currentTarget.value ?? '')}
        placeholder="Ghi chú version: đã bổ sung gì, thay đổi gì..."
        style={noteStyle}
        disabled={uploading}
      />

      {lastStatus ? <div style={successNoticeStyle}>{lastStatus}</div> : null}
      {error ? <div style={errorStyle}>{error}</div> : null}

      {uploads.length > 0 ? (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {uploads.map((file) => (
            <div key={`${file.versionId ?? file.attachmentId ?? file.fileName}-${file.versionNumber ?? 'link'}`} style={uploadedRowStyle}>
              <i className={`ti ${fileIcon(file.mimeType)}`} style={uploadedIconStyle} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={uploadedNameStyle}>{file.fileName}</div>
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                  {file.storageMode === 'external_url' ? 'Link ngoài' : formatBytes(file.fileSize)}
                  {file.versionNumber ? ` · Version ${file.versionNumber}` : ''}
                </div>
              </div>
              <span style={successStyle}>Đã lưu</span>
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

const modeSwitchStyle: React.CSSProperties = {
  display: 'inline-flex',
  gap: 4,
  padding: 4,
  background: 'var(--color-surface-2)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-md)',
  marginBottom: 8,
}

const modeButtonStyle = (active: boolean): React.CSSProperties => ({
  border: 'none',
  borderRadius: 'calc(var(--radius-md) - 3px)',
  padding: '6px 10px',
  background: active ? 'var(--color-charcoal)' : 'transparent',
  color: active ? '#fff' : 'var(--color-text-muted)',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
})

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

const linkBoxStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr auto',
  gap: 8,
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '10px 12px',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--color-border)',
  background: 'var(--color-surface-2)',
  color: 'var(--color-text)',
}

const noteStyle: React.CSSProperties = {
  width: '100%',
  minHeight: 58,
  boxSizing: 'border-box',
  marginTop: 8,
  padding: '9px 11px',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--color-border)',
  background: 'var(--color-surface)',
  color: 'var(--color-text)',
  resize: 'vertical',
  fontFamily: 'inherit',
  fontSize: 12,
}

const primaryButtonStyle = (disabled: boolean): React.CSSProperties => ({
  padding: '9px 12px',
  borderRadius: 'var(--radius-md)',
  border: '1px solid rgba(218,223,33,0.4)',
  background: disabled ? 'var(--color-border)' : 'var(--color-lime)',
  color: disabled ? 'var(--color-text-muted)' : 'var(--color-lime-ink)',
  fontSize: 12,
  fontWeight: 800,
  cursor: disabled ? 'wait' : 'pointer',
})

const errorStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--color-danger)',
  marginTop: 6,
  padding: '6px 10px',
  background: 'rgba(184,64,64,0.08)',
  borderRadius: 6,
}

const successNoticeStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--color-success)',
  marginTop: 6,
  padding: '6px 10px',
  background: 'var(--color-success-bg)',
  borderRadius: 6,
  fontWeight: 700,
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
