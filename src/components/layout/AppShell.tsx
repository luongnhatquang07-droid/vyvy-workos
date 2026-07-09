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
const PRODUCTION_SUPABASE_REF = 'tgmnkqcxucxpnhhsggug'
const COMMAND_DATA_ROUTES = [
  '/command-center',
  '/projects',
  '/approvals',
  '/deliverables',
  '/file-library',
  '/follow-ups',
  '/calendar',
  '/ceo-reports',
  '/meetings',
  '/task-inbox',
  '/team-workload',
]

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

  const commandDataEnabled = COMMAND_DATA_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`))

  return (
    <CommandDataProvider enabled={commandDataEnabled}>
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
          <LocalQaBanner />
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

function LocalQaBanner() {
  const [host, setHost] = React.useState('')

  React.useEffect(() => {
    function syncHost() {
      setHost(window.location.hostname)
    }
    syncHost()
  }, [])

  if (!host || !isLocalHost(host)) return null

  const supabaseRef = getPublicSupabaseRef()
  const isProductionRef = supabaseRef === PRODUCTION_SUPABASE_REF
  const message = isProductionRef
    ? 'LOCAL đang trỏ PRODUCTION DB — chỉ được đọc, không thao tác dữ liệu thật.'
    : 'LOCAL QA / STAGING — có thể test an toàn.'

  return (
    <div
      role="status"
      style={{
        borderBottom: isProductionRef ? '1px solid rgba(248, 113, 113, 0.4)' : '1px solid rgba(218, 223, 33, 0.28)',
        background: isProductionRef ? 'rgba(127, 29, 29, 0.48)' : 'rgba(34, 48, 25, 0.72)',
        color: isProductionRef ? '#FECACA' : '#E8F28D',
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: 0,
        padding: '8px 24px',
      }}
    >
      {message}
    </div>
  )
}

function getPublicSupabaseRef() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  return url.match(/^https:\/\/([^.]+)\.supabase\.co/i)?.[1] ?? ''
}

function isLocalHost(host: string) {
  return host === 'localhost' || host === '127.0.0.1' || host === '::1'
}
