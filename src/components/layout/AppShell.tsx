'use client'
import React from 'react'
import { usePathname } from 'next/navigation'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { AppEffects } from './AppEffects'
import { CommandPalette } from '@/components/ui/CommandPalette'
import { CommandDataProvider } from '@/hooks/useCommandData'

const STORAGE_KEY = 'vyvy_sidebar_collapsed'
const OVERLAY_BREAKPOINT = 1100

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  const [desktopCollapsed, setDesktopCollapsed] = React.useState(false)
  const [overlayOpen, setOverlayOpen] = React.useState(false)
  const [isOverlayMode, setIsOverlayMode] = React.useState(false)
  const [cmdOpen, setCmdOpen] = React.useState(false)
  const [cmdKey, setCmdKey] = React.useState(0)

  // Sync client state on mount — setState called via named fn (not directly) per react-hooks/set-state-in-effect
  React.useEffect(() => {
    function syncFromClient() {
      setDesktopCollapsed(localStorage.getItem(STORAGE_KEY) === 'true')
      setIsOverlayMode(window.innerWidth < OVERLAY_BREAKPOINT)
    }
    syncFromClient()
  }, [])

  // Resize listener
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

  if (pathname === '/login') return <>{children}</>

  return (
    <CommandDataProvider>
      <div className="vyvy-app-root" style={{ display: 'flex', minHeight: '100vh', background: 'var(--color-bg)', position: 'relative' }}>
        <AppEffects />
        <div key={pathname} className="vyvy-nav-progress" />
        <Sidebar
          isOverlayMode={isOverlayMode}
          overlayOpen={overlayOpen}
          onOverlayClose={() => setOverlayOpen(false)}
          desktopCollapsed={desktopCollapsed}
          onDesktopCollapse={handleDesktopCollapse}
        />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden', position: 'relative', zIndex: 1 }}>
          <Topbar onToggleSidebar={handleTopbarToggle} onOpenCommandPalette={openCmd} />
          <main id="main-content" className="vyvy-main" style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>
            <div key={pathname} className="vyvy-route-view">
              {children}
            </div>
          </main>
        </div>
        <CommandPalette key={cmdKey} open={cmdOpen} onClose={() => setCmdOpen(false)} />
      </div>
    </CommandDataProvider>
  )
}
