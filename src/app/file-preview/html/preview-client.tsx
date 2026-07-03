'use client'

import React from 'react'
import { useSearchParams } from 'next/navigation'

interface PreviewPayload {
  html?: string
  fileName?: string
  error?: string
}

export function HtmlFilePreviewClient() {
  const searchParams = useSearchParams()
  const workspaceId = searchParams.get('workspaceId') ?? ''
  const path = searchParams.get('path') ?? ''
  const displayName = searchParams.get('name') ?? path.split('/').pop() ?? 'HTML preview'
  const [payload, setPayload] = React.useState<PreviewPayload>({})
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    let cancelled = false

    async function loadPreview() {
      setLoading(true)
      setPayload({})

      if (!workspaceId || !path) {
        setPayload({ error: 'Thiếu thông tin file HTML cần preview.' })
        setLoading(false)
        return
      }

      try {
        const params = new URLSearchParams({ workspaceId, path })
        const response = await fetch(`/api/file-preview/html?${params}`)
        const data = (await response.json()) as PreviewPayload
        if (!response.ok || data.error) throw new Error(data.error ?? 'Không mở được preview HTML.')
        if (!cancelled) setPayload(data)
      } catch (err) {
        if (!cancelled) {
          setPayload({ error: err instanceof Error ? err.message : 'Không mở được preview HTML.' })
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadPreview()
    return () => {
      cancelled = true
    }
  }, [path, workspaceId])

  const title = payload.fileName ?? displayName

  return (
    <main style={pageStyle}>
      <header style={headerStyle}>
        <div>
          <div style={eyebrowStyle}>HTML preview an toàn</div>
          <h1 style={titleStyle}>{title}</h1>
          <p style={subtitleStyle}>File được hiển thị trong iframe sandbox. Script trong file không được thực thi.</p>
        </div>
        <button type="button" onClick={() => window.close()} style={closeButtonStyle}>
          Đóng tab
        </button>
      </header>

      <section style={previewFrameWrapStyle}>
        {loading ? (
          <div style={stateStyle}>Đang tải preview...</div>
        ) : payload.error ? (
          <div style={errorStyle}>{payload.error}</div>
        ) : (
          <iframe
            title={title}
            srcDoc={payload.html}
            sandbox=""
            referrerPolicy="no-referrer"
            style={iframeStyle}
          />
        )}
      </section>
    </main>
  )
}

const pageStyle: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
  padding: 18,
  background: '#080A0D',
  color: '#F3F4F1',
  fontFamily: 'Inter, system-ui, sans-serif',
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 16,
  padding: '16px 18px',
  border: '1px solid rgba(255,255,255,.1)',
  borderRadius: 18,
  background: '#0D1015',
  boxShadow: '0 24px 80px rgba(0,0,0,.28)',
}

const eyebrowStyle: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: 1.4,
  textTransform: 'uppercase',
  color: '#DADF21',
  fontWeight: 800,
}

const titleStyle: React.CSSProperties = {
  margin: '4px 0 0',
  fontSize: 20,
  lineHeight: 1.2,
}

const subtitleStyle: React.CSSProperties = {
  margin: '6px 0 0',
  color: '#9CA3AF',
  fontSize: 13,
}

const closeButtonStyle: React.CSSProperties = {
  border: '1px solid rgba(255,255,255,.14)',
  borderRadius: 12,
  background: '#12161D',
  color: '#F3F4F1',
  padding: '10px 14px',
  fontWeight: 800,
  cursor: 'pointer',
}

const previewFrameWrapStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  border: '1px solid rgba(255,255,255,.1)',
  borderRadius: 18,
  overflow: 'hidden',
  background: '#fff',
}

const iframeStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  minHeight: 'calc(100vh - 140px)',
  border: 0,
  background: '#fff',
}

const stateStyle: React.CSSProperties = {
  display: 'grid',
  placeItems: 'center',
  minHeight: 'calc(100vh - 140px)',
  color: '#1F2937',
}

const errorStyle: React.CSSProperties = {
  ...stateStyle,
  color: '#B91C1C',
  background: '#FEF2F2',
  padding: 24,
}
