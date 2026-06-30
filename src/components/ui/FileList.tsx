'use client'

import React from 'react'

interface StorageFile {
  name: string
  metadata?: { size?: number; mimetype?: string }
  url: string | null
  storagePath: string
}

interface FileListProps {
  workspaceId?: string
  projectId?: string
  taskId?: string
  refreshKey?: number
}

function formatBytes(bytes: number) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function fileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) return 'ti-photo'
  if (ext === 'pdf') return 'ti-file-type-pdf'
  if (['doc', 'docx'].includes(ext)) return 'ti-file-type-doc'
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'ti-file-type-xls'
  if (['zip', 'rar', '7z'].includes(ext)) return 'ti-file-zip'
  return 'ti-file'
}

export function FileList({
  workspaceId,
  projectId,
  taskId,
  refreshKey,
}: FileListProps) {
  const [files, setFiles] = React.useState<StorageFile[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')

  React.useEffect(() => {
    let cancelled = false

    async function loadFiles() {
      setLoading(true)
      setError('')

      if (!workspaceId) {
        setFiles([])
        setError('Chưa xác định được workspace.')
        setLoading(false)
        return
      }

      const params = new URLSearchParams({ workspaceId })
      if (projectId) params.set('projectId', projectId)
      if (taskId) params.set('taskId', taskId)

      try {
        const response = await fetch(`/api/upload?${params}`)
        const payload = (await response.json()) as { files?: StorageFile[]; error?: string }
        if (!response.ok) throw new Error(payload.error ?? 'Không tải được danh sách file.')
        if (!cancelled) setFiles(payload.files ?? [])
      } catch (err) {
        if (!cancelled) {
          setFiles([])
          setError(err instanceof Error ? err.message : 'Không tải được danh sách file.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadFiles()

    return () => {
      cancelled = true
    }
  }, [workspaceId, projectId, taskId, refreshKey])

  if (loading) {
    return (
      <div style={{ fontSize: 12, color: 'var(--color-text-muted)', padding: '8px 0' }}>
        Đang tải danh sách file...
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ fontSize: 12, color: 'var(--color-danger)', padding: '8px 0' }}>
        {error}
      </div>
    )
  }

  if (!files.length) {
    return (
      <div style={{ fontSize: 12, color: 'var(--color-text-muted)', padding: '8px 0' }}>
        Chưa có file nào.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {files.map((file) => (
        <div key={file.storagePath} style={fileRowStyle}>
          <i className={`ti ${fileIcon(file.name)}`} style={fileIconStyle} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={fileNameStyle}>{file.name.replace(/^\d+_/, '')}</div>
            {file.metadata?.size ? (
              <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{formatBytes(file.metadata.size)}</div>
            ) : null}
          </div>
          {file.url ? (
            <a href={file.url} target="_blank" rel="noopener noreferrer" style={downloadStyle}>
              <i className="ti ti-download" style={{ fontSize: 12 }} />
              Tải
            </a>
          ) : null}
        </div>
      ))}
    </div>
  )
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

const fileIconStyle: React.CSSProperties = {
  fontSize: 17,
  color: 'var(--color-text-muted)',
  flexShrink: 0,
}

const fileNameStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 500,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const downloadStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--color-text-muted)',
  padding: '4px 8px',
  border: '1px solid var(--color-border)',
  borderRadius: 6,
  textDecoration: 'none',
  flexShrink: 0,
}
