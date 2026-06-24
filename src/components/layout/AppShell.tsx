'use client'
import React from 'react'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { CommandPalette } from '@/components/ui/CommandPalette'

const STORAGE_KEY = 'vyvy_sidebar_collapsed'
const OVERLAY_BREAKPOINT = 1100

function getInitialCollapsed() {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(STORAGE_KEY) === 'true'
}

function getInitialOverlayMode() {
  if (typeof window === 'undefined') return false
  return window.innerWidth < OVERLAY_BREAKPOINT
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [desktopCollapsed, setDesktopCollapsed] = React.useState(getInitialCollapsed)
  const [overlayOpen, setOverlayOpen] = React.useState(false)
  const [isOverlayMode, setIsOverlayMode] = React.useState(getInitialOverlayMode)
  const [cmdOpen, setCmdOpen] = React.useState(false)
  const [cmdKey, setCmdKey] = React.useState(0)

  // Resize listener — callbacks, not synchronous setState in effect body
  React.useEffect(() => {
    const checkMode = () => {
      const overlay = window.innerWidth < OVERLAY_BREAKPOINT
      setIsOverlayMode(overlay)
      if (!overlay) setOverlayOpen(false)
    }
    window.addEventListener('resize', checkMode)
    return () => window.removeEventListener('resize', checkMode)
  }, [])

  // Global Ctrl+K / Cmd+K
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setCmdKey(k => k + 1)
        setCmdOpen(o => !o)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  const handleDesktopCollapse = (v: boolean) => {
    setDesktopCollapsed(v)
    localStorage.setItem(STORAGE_KEY, String(v))
  }

  const handleTopbarToggle = () => {
    if (isOverlayMode) {
      setOverlayOpen(o => !o)
    } else {
      handleDesktopCollapse(!desktopCollapsed)
    }
  }

  const openCmd = () => {
    setCmdKey(k => k + 1)
    setCmdOpen(true)
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--color-bg)', position: 'relative' }}>
      <Sidebar
        isOverlayMode={isOverlayMode}
        overlayOpen={overlayOpen}
        onOverlayClose={() => setOverlayOpen(false)}
        desktopCollapsed={desktopCollapsed}
        onDesktopCollapse={handleDesktopCollapse}
      />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        <Topbar onToggleSidebar={handleTopbarToggle} onOpenCommandPalette={openCmd} />
        <main id="main-content" style={{ flex: 1, padding: 'var(--space-6)', overflowY: 'auto' }}>
          {children}
        </main>
      </div>
      <CommandPalette key={cmdKey} open={cmdOpen} onClose={() => setCmdOpen(false)} />
    </div>
  )
}
