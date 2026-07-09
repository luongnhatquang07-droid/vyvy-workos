'use client'

import type { CSSProperties } from 'react'

export default function ProjectsError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <main style={pageStyle}>
      <section style={cardStyle}>
        <div style={iconStyle}>
          <i className="ti ti-alert-triangle" />
        </div>
        <div>
          <p style={eyebrowStyle}>Projects</p>
          <h1 style={titleStyle}>Không thể tải trang dự án</h1>
          <p style={copyStyle}>
            Một phần dữ liệu dự án đang không đọc được. Hãy thử tải lại trang; nếu lỗi vẫn còn,
            gửi lại thời điểm thao tác để kiểm tra log.
          </p>
          {error?.digest ? <p style={digestStyle}>Mã lỗi: {error.digest}</p> : null}
        </div>
        <div style={actionsStyle}>
          <button type="button" onClick={reset} style={primaryButtonStyle}>
            Tải lại dữ liệu
          </button>
          <a href="/projects" style={secondaryButtonStyle}>
            Về danh sách dự án
          </a>
        </div>
      </section>
    </main>
  )
}

const pageStyle: CSSProperties = {
  minHeight: '100vh',
  display: 'grid',
  placeItems: 'center',
  padding: 24,
  background: 'var(--color-bg)',
  color: 'var(--color-text)',
}

const cardStyle: CSSProperties = {
  width: 'min(560px, 100%)',
  display: 'grid',
  gap: 18,
  padding: 28,
  borderRadius: 16,
  border: '1px solid var(--color-border)',
  background: 'var(--color-surface)',
  boxShadow: 'var(--shadow-lg)',
}

const iconStyle: CSSProperties = {
  width: 44,
  height: 44,
  display: 'grid',
  placeItems: 'center',
  borderRadius: 12,
  color: 'var(--color-danger)',
  background: 'rgba(184, 64, 64, 0.12)',
  fontSize: 24,
}

const eyebrowStyle: CSSProperties = {
  margin: 0,
  color: 'var(--color-text-muted)',
  fontSize: 12,
  fontWeight: 800,
  textTransform: 'uppercase',
}

const titleStyle: CSSProperties = {
  margin: '4px 0 0',
  fontSize: 24,
  lineHeight: 1.2,
}

const copyStyle: CSSProperties = {
  margin: '10px 0 0',
  color: 'var(--color-text-muted)',
  lineHeight: 1.6,
}

const digestStyle: CSSProperties = {
  margin: '10px 0 0',
  color: 'var(--color-text-subtle)',
  fontSize: 12,
  fontFamily: 'var(--font-mono)',
}

const actionsStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 10,
}

const primaryButtonStyle: CSSProperties = {
  border: '1px solid var(--color-primary)',
  borderRadius: 10,
  padding: '10px 14px',
  background: 'var(--color-primary)',
  color: 'var(--color-on-primary)',
  fontWeight: 800,
  cursor: 'pointer',
}

const secondaryButtonStyle: CSSProperties = {
  border: '1px solid var(--color-border)',
  borderRadius: 10,
  padding: '10px 14px',
  color: 'var(--color-text)',
  textDecoration: 'none',
  fontWeight: 800,
  background: 'var(--color-surface-2)',
}
