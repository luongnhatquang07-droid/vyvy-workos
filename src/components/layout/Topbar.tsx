'use client'
import React from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { useToast } from '@/components/feedback/Toast'

interface TopbarProps {
  onToggleSidebar: () => void
  onOpenCommandPalette: () => void
}

export function Topbar({ onToggleSidebar, onOpenCommandPalette }: TopbarProps) {
  const { toast } = useToast()
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
        aria-label="Mở/đóng sidebar"
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--color-text-muted)', lineHeight: 1,
          width: 34, height: 34,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: 'var(--radius-md)',
          transition: 'color var(--motion-fast) var(--ease-out), background var(--motion-fast) var(--ease-out)',
          flexShrink: 0,
        }}
        onMouseEnter={e => {
          const el = e.currentTarget as HTMLElement
          el.style.color = 'var(--color-text)'
          el.style.background = 'var(--color-surface-2)'
        }}
        onMouseLeave={e => {
          const el = e.currentTarget as HTMLElement
          el.style.color = 'var(--color-text-muted)'
          el.style.background = 'none'
        }}
      >
        <svg width="16" height="12" viewBox="0 0 16 12" fill="none" aria-hidden="true">
          <rect y="0"  width="16" height="1.5" rx="0.75" fill="currentColor"/>
          <rect y="5"  width="11" height="1.5" rx="0.75" fill="currentColor"/>
          <rect y="10" width="16" height="1.5" rx="0.75" fill="currentColor"/>
        </svg>
      </button>

      {/* Search / Command palette trigger */}
      <button
        onClick={onOpenCommandPalette}
        aria-label="Mở command palette (Ctrl K)"
        style={{
          flex: 1,
          maxWidth: 480,
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          background: 'var(--color-surface-2)',
          border: '1.5px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          padding: '0 14px',
          height: 36,
          cursor: 'pointer',
          transition: 'border-color var(--motion-fast) var(--ease-out), box-shadow var(--motion-fast) var(--ease-out)',
          textAlign: 'left',
        }}
        onMouseEnter={e => {
          const el = e.currentTarget as HTMLElement
          el.style.borderColor = 'rgba(25,25,25,0.35)'
          el.style.boxShadow = '0 1px 4px rgba(25,25,25,0.07)'
        }}
        onMouseLeave={e => {
          const el = e.currentTarget as HTMLElement
          el.style.borderColor = 'var(--color-border)'
          el.style.boxShadow = 'none'
        }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" style={{ flexShrink: 0, opacity: 0.4 }}>
          <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M10 10l2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', flex: 1 }}>Tìm kiếm…</span>
        <kbd aria-hidden="true" style={{
          fontSize: 11, color: 'var(--color-text-muted)',
          background: 'rgba(25,25,25,0.06)',
          border: '1px solid var(--color-border)',
          padding: '2px 7px',
          borderRadius: 'var(--radius-sm)',
          fontFamily: 'var(--font-mono)',
          flexShrink: 0, lineHeight: '18px',
        }}>⌘K</kbd>
      </button>

      <div style={{ flex: 1 }} />

      {/* Quick create */}
      <button
        onClick={handleNotImpl}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: 'var(--color-lime)',
          color: 'var(--color-charcoal)',
          border: 'none',
          borderRadius: 'var(--radius-md)',
          padding: '0 16px',
          height: 34,
          fontSize: 'var(--text-sm)',
          fontWeight: 650,
          cursor: 'pointer',
          flexShrink: 0,
          letterSpacing: '0.01em',
          transition: 'filter var(--motion-fast) var(--ease-out)',
        }}
        onMouseEnter={e => (e.currentTarget as HTMLElement).style.filter = 'brightness(0.91)'}
        onMouseLeave={e => (e.currentTarget as HTMLElement).style.filter = 'none'}
      >
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
          <path d="M5.5 1v9M1 5.5h9" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
        </svg>
        Tạo nhanh
      </button>

      {/* Notifications */}
      <button
        onClick={handleNotImpl}
        aria-label="Thông báo"
        style={{
          position: 'relative',
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--color-text-muted)',
          width: 34, height: 34,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: 'var(--radius-md)',
          transition: 'color var(--motion-fast) var(--ease-out), background var(--motion-fast) var(--ease-out)',
          flexShrink: 0,
        }}
        onMouseEnter={e => {
          const el = e.currentTarget as HTMLElement
          el.style.color = 'var(--color-text)'
          el.style.background = 'var(--color-surface-2)'
        }}
        onMouseLeave={e => {
          const el = e.currentTarget as HTMLElement
          el.style.color = 'var(--color-text-muted)'
          el.style.background = 'none'
        }}
      >
        <svg width="17" height="17" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <path d="M9 2a5 5 0 0 0-5 5v2.5L2.5 12h13L14 9.5V7a5 5 0 0 0-5-5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
          <path d="M7 12.5c0 1.1.9 2 2 2s2-.9 2-2" stroke="currentColor" strokeWidth="1.4"/>
        </svg>
        <span
          aria-label="Có thông báo mới"
          style={{
            position: 'absolute', top: 7, right: 7,
            width: 6, height: 6, borderRadius: '50%',
            background: 'var(--color-danger)',
            border: '1.5px solid var(--color-surface)',
          }}
        />
      </button>

      {/* Avatar */}
      <button
        onClick={handleNotImpl}
        aria-label="Tài khoản của tôi"
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          padding: 0, borderRadius: '50%', flexShrink: 0,
          transition: 'opacity var(--motion-fast) var(--ease-out)',
        }}
        onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = '0.8'}
        onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = '1'}
      >
        <Avatar name="Nhat Quang" size={30} />
      </button>
    </header>
  )
}
