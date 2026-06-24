'use client'
import React from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/feedback/Toast'

interface TopbarProps {
  onToggleSidebar: () => void
}

export function Topbar({ onToggleSidebar }: TopbarProps) {
  const { toast } = useToast()
  const [searchFocused, setSearchFocused] = React.useState(false)

  const handleNotImpl = () => toast('Chức năng này sẽ được triển khai ở giai đoạn sau.', 'info')

  return (
    <header style={{
      height: 'var(--topbar-height)',
      background: 'var(--color-surface)',
      borderBottom: '1px solid var(--color-border)',
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-3)',
      padding: '0 var(--space-5)',
      position: 'sticky',
      top: 0,
      zIndex: 'var(--z-topbar)' as unknown as number,
      flexShrink: 0,
    }}>
      {/* Sidebar toggle */}
      <button
        onClick={onToggleSidebar}
        title="Mở/đóng sidebar"
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--color-text-muted)', fontSize: 18, lineHeight: 1,
          padding: 6, borderRadius: 'var(--radius-sm)',
          transition: `color var(--motion-fast) var(--ease-out), background var(--motion-fast) var(--ease-out)`,
          flexShrink: 0,
        }}
        onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.color = 'var(--color-text)'; el.style.background = 'var(--color-surface-2)' }}
        onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.color = 'var(--color-text-muted)'; el.style.background = 'none' }}
      >☰</button>

      {/* Search */}
      <div
        onClick={handleNotImpl}
        style={{
          flex: 1,
          maxWidth: 420,
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          background: searchFocused ? 'var(--color-surface)' : 'var(--color-surface-2)',
          border: `1.5px solid ${searchFocused ? 'var(--color-charcoal)' : 'var(--color-border)'}`,
          borderRadius: 'var(--radius-md)',
          padding: '6px 12px',
          cursor: 'text',
          transition: `border-color var(--motion-fast) var(--ease-out), background var(--motion-fast) var(--ease-out)`,
        }}
        onMouseEnter={() => setSearchFocused(true)}
        onMouseLeave={() => setSearchFocused(false)}
      >
        <span style={{ color: 'var(--color-text-muted)', fontSize: 13, flexShrink: 0 }}>⌕</span>
        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', flex: 1 }}>Tìm kiếm…</span>
        <span style={{
          fontSize: 'var(--text-xs)',
          color: 'var(--color-text-muted)',
          background: 'var(--color-border)',
          padding: '1px 6px',
          borderRadius: 'var(--radius-sm)',
          fontFamily: 'var(--font-mono)',
          flexShrink: 0,
        }}>Ctrl K</span>
      </div>

      <div style={{ flex: 1 }} />

      {/* Quick create */}
      <Button variant="primary" size="sm" onClick={handleNotImpl}
        style={{ flexShrink: 0 }}
      >
        + Tạo nhanh
      </Button>

      {/* Notifications */}
      <button
        onClick={handleNotImpl}
        style={{
          position: 'relative',
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--color-text-muted)', fontSize: 18, lineHeight: 1,
          padding: 6, borderRadius: 'var(--radius-sm)',
          transition: `color var(--motion-fast) var(--ease-out), background var(--motion-fast) var(--ease-out)`,
          flexShrink: 0,
        }}
        onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.color = 'var(--color-text)'; el.style.background = 'var(--color-surface-2)' }}
        onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.color = 'var(--color-text-muted)'; el.style.background = 'none' }}
      >
        🔔
        <span style={{
          position: 'absolute', top: 4, right: 4,
          width: 7, height: 7, borderRadius: '50%',
          background: 'var(--color-danger)',
          border: '1.5px solid var(--color-surface)',
        }} />
      </button>

      {/* Avatar */}
      <button onClick={handleNotImpl} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, borderRadius: '50%', flexShrink: 0 }}>
        <Avatar name="Nhat Quang" size={30} />
      </button>
    </header>
  )
}
