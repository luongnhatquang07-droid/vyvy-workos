'use client'
import React from 'react'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'

const STORAGE_KEY = 'vyvy_sidebar_collapsed'

export function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = React.useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem(STORAGE_KEY) === 'true'
  })

  const handleCollapse = (v: boolean) => {
    setCollapsed(v)
    localStorage.setItem(STORAGE_KEY, String(v))
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--color-bg)' }}>
      <Sidebar collapsed={collapsed} onCollapse={handleCollapse} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        <Topbar onToggleSidebar={() => handleCollapse(!collapsed)} />
        <main style={{ flex: 1, padding: 'var(--space-6)', overflowY: 'auto' }}>
          {children}
        </main>
      </div>
    </div>
  )
}
