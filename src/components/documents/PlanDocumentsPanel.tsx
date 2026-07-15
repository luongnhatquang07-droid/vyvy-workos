'use client'

import React from 'react'

import { readJsonResponse } from '@/lib/api/readJsonResponse'
import { useToast } from '@/components/feedback/Toast'
import { uploadFormDataWithProgress } from '@/lib/api/uploadWithProgress'
import { normalizeExternalSubmissionUrl } from '@/lib/files/externalLinks'
import type {
  PlanDocumentDto,
  PlanTargetType,
  PlanTreeResponse,
  PlanVersionDto,
} from '@/lib/documents/types'
import { useProjectPlanDocuments } from '@/components/documents/ProjectPlanProvider'

type ComposerTab = 'FILE' | 'LINK'

export function PlanDocumentsPanel({
  targetType,
  targetId,
  readOnly = false,
  compact = false,
  title = 'Kế hoạch',
  defaultExpanded = false,
}: {
  targetType: PlanTargetType
  targetId: string
  readOnly?: boolean
  compact?: boolean
  title?: string
  defaultExpanded?: boolean
}) {
  const { data, loading, error, schemaReady, refresh } = useProjectPlanDocuments()
  const { toast } = useToast()
  const [expanded, setExpanded] = React.useState(defaultExpanded)
  const [composerOpen, setComposerOpen] = React.useState(false)
  const [tab, setTab] = React.useState<ComposerTab>('FILE')
  const [titleValue, setTitleValue] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [changeNote, setChangeNote] = React.useState('')
  const [externalUrl, setExternalUrl] = React.useState('')
  const [documentId, setDocumentId] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)
  const [progress, setProgress] = React.useState<number | null>(null)
  const fileInputRef = React.useRef<HTMLInputElement | null>(null)

  const target = targetType === 'PROJECT'
    ? { canManage: data?.canManageProjectPlan ?? false, documents: data?.projectPlans ?? [] }
    : data?.workstreams[targetId] ?? { canManage: false, documents: [] }
  const canManage = !readOnly && target.canManage
  const documents = target.documents

  function resetComposer() {
    setComposerOpen(false)
    setTab('FILE')
    setTitleValue('')
    setDescription('')
    setChangeNote('')
    setExternalUrl('')
    setDocumentId(null)
    setProgress(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function startNewVersion(document: PlanDocumentDto) {
    setExpanded(true)
    setComposerOpen(true)
    setDocumentId(document.id)
    setTitleValue(document.title)
    setDescription(document.description ?? '')
    setChangeNote('')
  }

  async function submitFile(file: File | null) {
    if (!file || !data) return
    const documentTitle = titleValue.trim() || file.name
    const form = new FormData()
    form.set('file', file)
    form.set('projectId', data.projectId)
    form.set('targetType', targetType)
    form.set('targetId', targetId)
    form.set('title', documentTitle)
    if (documentId) form.set('documentId', documentId)
    if (description.trim()) form.set('description', description.trim())
    if (changeNote.trim()) form.set('changeNote', changeNote.trim())

    setSubmitting(true)
    setProgress(0)
    try {
      await uploadFormDataWithProgress<{ ok: boolean; error?: string }>(
        '/api/documents/upload',
        form,
        { onProgress: setProgress },
      )
      await refresh()
      toast(documentId ? 'Đã thêm version kế hoạch mới.' : 'Đã thêm file kế hoạch.', 'success')
      resetComposer()
      setExpanded(true)
    } catch (uploadError) {
      toast(uploadError instanceof Error ? uploadError.message : 'Không upload được file kế hoạch.', 'error')
    } finally {
      setSubmitting(false)
      setProgress(null)
    }
  }

  async function submitLink() {
    if (!data) return
    const documentTitle = titleValue.trim()
    if (!documentTitle) {
      toast('Vui lòng nhập tên tài liệu.', 'warning')
      return
    }

    let normalizedUrl = ''
    try {
      normalizedUrl = normalizeExternalSubmissionUrl(externalUrl)
    } catch (urlError) {
      toast(urlError instanceof Error ? urlError.message : 'Link không hợp lệ.', 'warning')
      return
    }

    setSubmitting(true)
    try {
      const response = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: data.projectId,
          targetType,
          targetId,
          documentId,
          title: documentTitle,
          description: description.trim() || null,
          changeNote: changeNote.trim() || null,
          externalUrl: normalizedUrl,
        }),
      })
      const payload = await readJsonResponse<PlanTreeResponse>(response, 'Không lưu được link kế hoạch.')
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'Không lưu được link kế hoạch.')
      await refresh()
      toast(documentId ? 'Đã thêm version kế hoạch mới.' : 'Đã thêm link kế hoạch.', 'success')
      resetComposer()
      setExpanded(true)
    } catch (linkError) {
      toast(linkError instanceof Error ? linkError.message : 'Không lưu được link kế hoạch.', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  if (!schemaReady) {
    return (
      <section style={{ ...panelStyle, padding: compact ? 10 : 14 }}>
        <strong style={panelTitleStyle}>Kế hoạch</strong>
        <p style={emptyTextStyle}>Chưa thể dùng Plan cho tới khi migration Document System được duyệt và chạy.</p>
      </section>
    )
  }

  return (
    <section style={{ ...panelStyle, padding: compact ? 10 : 14 }}>
      <button type="button" style={panelHeaderButtonStyle} onClick={() => setExpanded((value) => !value)}>
        <span style={titleRowStyle}>
          <span style={planIconStyle}><i className="ti ti-clipboard-text" /></span>
          <span>
            <strong style={panelTitleStyle}>{title}</strong>
            <small style={panelSubtitleStyle}>
              {loading ? 'Đang tải...' : `${documents.length} tài liệu · ${countAssets(documents, 'FILE')} file · ${countAssets(documents, 'LINK')} link`}
            </small>
          </span>
        </span>
        <i className={`ti ti-chevron-${expanded ? 'up' : 'down'}`} aria-hidden="true" />
      </button>

      {expanded ? (
        <div style={panelBodyStyle}>
          {error ? <div style={errorNoticeStyle}>{error}</div> : null}
          {!loading && !error && documents.length === 0 ? (
            <div style={emptyStateStyle}>Chưa có kế hoạch.</div>
          ) : null}

          {documents.map((document) => (
            <PlanDocumentCard
              key={document.id}
              document={document}
              canManage={canManage}
              onNewVersion={() => startNewVersion(document)}
            />
          ))}

          {canManage ? (
            composerOpen ? (
              <div style={composerStyle}>
                <div style={composerHeadingStyle}>
                  <strong>{documentId ? 'Thêm version kế hoạch' : 'Thêm tài liệu kế hoạch'}</strong>
                  <button type="button" style={iconButtonStyle} onClick={resetComposer} aria-label="Đóng">
                    <i className="ti ti-x" />
                  </button>
                </div>
                <div style={segmentedStyle}>
                  <button type="button" style={segmentStyle(tab === 'FILE')} onClick={() => setTab('FILE')}>
                    <i className="ti ti-file-upload" /> File
                  </button>
                  <button type="button" style={segmentStyle(tab === 'LINK')} onClick={() => setTab('LINK')}>
                    <i className="ti ti-link" /> Link
                  </button>
                </div>
                <label style={fieldStyle}>
                  <span>Tên tài liệu</span>
                  <input
                    value={titleValue}
                    onChange={(event) => setTitleValue(event.currentTarget.value)}
                    placeholder={tab === 'FILE' ? 'Để trống để dùng tên file' : 'Ví dụ: Marketing Plan tháng 7'}
                    style={inputStyle}
                    disabled={submitting || Boolean(documentId)}
                  />
                </label>
                {tab === 'LINK' ? (
                  <label style={fieldStyle}>
                    <span>Đường link</span>
                    <input
                      value={externalUrl}
                      onChange={(event) => setExternalUrl(event.currentTarget.value)}
                      placeholder="https://docs.google.com/..."
                      style={inputStyle}
                      disabled={submitting}
                    />
                  </label>
                ) : null}
                <label style={fieldStyle}>
                  <span>Ghi chú version</span>
                  <textarea
                    value={changeNote}
                    onChange={(event) => setChangeNote(event.currentTarget.value)}
                    placeholder="Nội dung mới hoặc thay đổi trong version này"
                    style={{ ...inputStyle, minHeight: 62, resize: 'vertical' }}
                    disabled={submitting}
                  />
                </label>
                {progress !== null ? (
                  <div style={progressWrapStyle}>
                    <div style={progressTrackStyle}><div style={{ ...progressFillStyle, width: `${progress}%` }} /></div>
                    <span>{progress < 100 ? `Đang tải lên ${progress}%` : 'Đang xử lý...'}</span>
                  </div>
                ) : null}
                <div style={composerActionsStyle}>
                  <button type="button" style={secondaryButtonStyle} onClick={resetComposer} disabled={submitting}>Hủy</button>
                  {tab === 'FILE' ? (
                    <>
                      <input
                        ref={fileInputRef}
                        type="file"
                        style={{ display: 'none' }}
                        onChange={(event) => void submitFile(event.currentTarget.files?.[0] ?? null)}
                      />
                      <button
                        type="button"
                        style={primaryButtonStyle}
                        onClick={() => fileInputRef.current?.click()}
                        disabled={submitting}
                      >
                        <i className="ti ti-upload" /> {submitting ? 'Đang lưu...' : 'Chọn file và lưu'}
                      </button>
                    </>
                  ) : (
                    <button type="button" style={primaryButtonStyle} onClick={() => void submitLink()} disabled={submitting}>
                      <i className="ti ti-link-plus" /> {submitting ? 'Đang lưu...' : 'Lưu link'}
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <button type="button" style={addButtonStyle} onClick={() => setComposerOpen(true)}>
                <i className="ti ti-plus" /> Thêm file/link kế hoạch
              </button>
            )
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

function PlanDocumentCard({
  document,
  canManage,
  onNewVersion,
}: {
  document: PlanDocumentDto
  canManage: boolean
  onNewVersion: () => void
}) {
  const latest = document.latestVersion
  return (
    <article style={documentCardStyle}>
      <div style={documentHeaderStyle}>
        <div style={{ minWidth: 0 }}>
          <strong style={documentNameStyle}>{document.title}</strong>
          <div style={documentMetaStyle}>
            Version {latest.versionNumber} · {formatDateTime(latest.createdAt)}
            {latest.submittedByName ? ` · ${latest.submittedByName}` : ''}
          </div>
        </div>
        {canManage ? (
          <button type="button" style={versionButtonStyle} onClick={onNewVersion} title="Thêm version mới">
            <i className="ti ti-versions" /> Version mới
          </button>
        ) : null}
      </div>
      {latest.changeNote ? <p style={changeNoteStyle}>{latest.changeNote}</p> : null}
      <VersionAssets version={latest} />
      {document.versions.length > 1 ? (
        <details style={historyStyle}>
          <summary style={historySummaryStyle}>Lịch sử {document.versions.length} version</summary>
          <div style={historyListStyle}>
            {document.versions.slice(1).map((version) => (
              <div key={version.id} style={historyVersionStyle}>
                <strong>Version {version.versionNumber}</strong>
                <span>{formatDateTime(version.createdAt)}</span>
                <VersionAssets version={version} />
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </article>
  )
}

function VersionAssets({ version }: { version: PlanVersionDto }) {
  return (
    <div style={assetListStyle}>
      {version.assets.map((asset) => (
        <a
          key={asset.id}
          href={asset.openUrl ?? '#'}
          target="_blank"
          rel="noopener noreferrer"
          style={assetLinkStyle(Boolean(asset.openUrl))}
          onClick={(event) => {
            if (!asset.openUrl) event.preventDefault()
          }}
        >
          <i className={`ti ${asset.type === 'LINK' ? 'ti-link' : 'ti-file'}`} />
          <span>{asset.title}</span>
          <i className="ti ti-external-link" />
        </a>
      ))}
    </div>
  )
}

function countAssets(documents: PlanDocumentDto[], type: 'FILE' | 'LINK') {
  return documents.reduce(
    (total, document) => total + document.latestVersion.assets.filter((asset) => asset.type === type).length,
    0,
  )
}

function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Không rõ thời gian'
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(date)
}

const panelStyle: React.CSSProperties = {
  border: '1px solid color-mix(in srgb, #3b82f6 35%, var(--color-border))',
  background: 'color-mix(in srgb, #3b82f6 6%, var(--color-surface))',
  borderRadius: 8,
}
const panelHeaderButtonStyle: React.CSSProperties = {
  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
  border: 0, background: 'transparent', color: 'var(--color-text)', padding: 0, cursor: 'pointer', textAlign: 'left',
}
const titleRowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }
const planIconStyle: React.CSSProperties = {
  width: 30, height: 30, display: 'grid', placeItems: 'center', flexShrink: 0,
  color: '#60a5fa', background: 'color-mix(in srgb, #3b82f6 15%, transparent)', borderRadius: 6,
}
const panelTitleStyle: React.CSSProperties = { display: 'block', fontSize: 14, color: 'var(--color-text)' }
const panelSubtitleStyle: React.CSSProperties = { display: 'block', marginTop: 2, color: 'var(--color-text-muted)', fontSize: 11 }
const panelBodyStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }
const emptyTextStyle: React.CSSProperties = { margin: '6px 0 0', fontSize: 12, color: 'var(--color-text-muted)' }
const emptyStateStyle: React.CSSProperties = {
  padding: 12, border: '1px dashed var(--color-border)', borderRadius: 6, color: 'var(--color-text-muted)', fontSize: 12,
}
const errorNoticeStyle: React.CSSProperties = {
  padding: '8px 10px', borderRadius: 6, color: '#fca5a5', background: 'rgba(239,68,68,.1)', fontSize: 12,
}
const documentCardStyle: React.CSSProperties = {
  padding: 10, border: '1px solid var(--color-border)', borderRadius: 6, background: 'var(--color-surface)', minWidth: 0,
}
const documentHeaderStyle: React.CSSProperties = { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }
const documentNameStyle: React.CSSProperties = { display: 'block', fontSize: 13, color: 'var(--color-text)', overflowWrap: 'anywhere' }
const documentMetaStyle: React.CSSProperties = { marginTop: 3, fontSize: 10, color: 'var(--color-text-muted)' }
const versionButtonStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0, border: '1px solid var(--color-border)', borderRadius: 5,
  padding: '5px 7px', background: 'var(--color-surface-2)', color: 'var(--color-text)', fontSize: 11, cursor: 'pointer',
}
const changeNoteStyle: React.CSSProperties = { margin: '7px 0', fontSize: 11, color: 'var(--color-text-muted)' }
const assetListStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 5, marginTop: 7 }
const assetLinkStyle = (enabled: boolean): React.CSSProperties => ({
  display: 'grid', gridTemplateColumns: '16px minmax(0, 1fr) 16px', alignItems: 'center', gap: 7,
  padding: '7px 8px', border: '1px solid var(--color-border)', borderRadius: 5,
  color: enabled ? 'var(--color-text)' : 'var(--color-text-muted)', textDecoration: 'none', fontSize: 11,
  pointerEvents: enabled ? 'auto' : 'none', overflow: 'hidden',
})
const historyStyle: React.CSSProperties = { marginTop: 8, borderTop: '1px solid var(--color-border)', paddingTop: 7 }
const historySummaryStyle: React.CSSProperties = { cursor: 'pointer', color: 'var(--color-text-muted)', fontSize: 11 }
const historyListStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 7, marginTop: 7 }
const historyVersionStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 2, padding: 7, background: 'var(--color-surface-2)', borderRadius: 5,
  fontSize: 10, color: 'var(--color-text-muted)',
}
const addButtonStyle: React.CSSProperties = {
  minHeight: 34, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  border: '1px solid color-mix(in srgb, #3b82f6 50%, var(--color-border))', borderRadius: 6,
  background: 'color-mix(in srgb, #3b82f6 12%, var(--color-surface))', color: '#60a5fa', fontWeight: 700, cursor: 'pointer',
}
const composerStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 9, padding: 10, border: '1px solid var(--color-border)',
  borderRadius: 6, background: 'var(--color-surface)',
}
const composerHeadingStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 13 }
const iconButtonStyle: React.CSSProperties = {
  width: 28, height: 28, display: 'grid', placeItems: 'center', border: '1px solid var(--color-border)', borderRadius: 5,
  background: 'var(--color-surface-2)', color: 'var(--color-text)', cursor: 'pointer',
}
const segmentedStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, padding: 3, background: 'var(--color-surface-2)', borderRadius: 6 }
const segmentStyle = (active: boolean): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 30,
  border: active ? '1px solid color-mix(in srgb, #3b82f6 55%, var(--color-border))' : '1px solid transparent',
  borderRadius: 4, background: active ? 'var(--color-surface)' : 'transparent', color: active ? '#60a5fa' : 'var(--color-text-muted)',
  fontWeight: active ? 700 : 500, cursor: 'pointer',
})
const fieldStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 11, color: 'var(--color-text-muted)' }
const inputStyle: React.CSSProperties = {
  width: '100%', minHeight: 34, border: '1px solid var(--color-border)', borderRadius: 5,
  background: 'var(--color-bg)', color: 'var(--color-text)', padding: '7px 9px', font: 'inherit', boxSizing: 'border-box',
}
const progressWrapStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 8, alignItems: 'center', fontSize: 10, color: 'var(--color-text-muted)' }
const progressTrackStyle: React.CSSProperties = { height: 5, borderRadius: 3, overflow: 'hidden', background: 'var(--color-surface-2)' }
const progressFillStyle: React.CSSProperties = { height: '100%', background: '#3b82f6', transition: 'width .15s ease' }
const composerActionsStyle: React.CSSProperties = { display: 'flex', justifyContent: 'flex-end', gap: 7, flexWrap: 'wrap' }
const secondaryButtonStyle: React.CSSProperties = {
  minHeight: 32, padding: '0 11px', border: '1px solid var(--color-border)', borderRadius: 5,
  background: 'var(--color-surface-2)', color: 'var(--color-text)', cursor: 'pointer',
}
const primaryButtonStyle: React.CSSProperties = {
  minHeight: 32, padding: '0 11px', display: 'inline-flex', alignItems: 'center', gap: 6,
  border: '1px solid #3b82f6', borderRadius: 5, background: '#2563eb', color: '#fff', fontWeight: 700, cursor: 'pointer',
}
