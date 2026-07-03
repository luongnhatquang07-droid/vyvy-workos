import React from 'react'
import { HtmlFilePreviewClient } from './preview-client'

export default function HtmlFilePreviewPage() {
  return (
    <React.Suspense fallback={<PreviewShell message="Đang mở preview HTML..." />}>
      <HtmlFilePreviewClient />
    </React.Suspense>
  )
}

function PreviewShell({ message }: { message: string }) {
  return (
    <main style={{
      minHeight: '100vh',
      display: 'grid',
      placeItems: 'center',
      background: '#080A0D',
      color: '#F3F4F1',
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      <div style={{
        border: '1px solid rgba(255,255,255,.12)',
        borderRadius: 16,
        padding: 24,
        background: '#0D1015',
        boxShadow: '0 24px 80px rgba(0,0,0,.35)',
      }}>
        {message}
      </div>
    </main>
  )
}
