'use client'
import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { NAV_ITEMS } from '@/config/navigation'
import { Avatar } from '@/components/ui/Avatar'
import { Tooltip } from '@/components/ui/Tooltip'

interface SidebarProps {
  isOverlayMode: boolean
  overlayOpen: boolean
  onOverlayClose: () => void
  desktopCollapsed: boolean
  onDesktopCollapse: (v: boolean) => void
}

export function Sidebar({
  isOverlayMode,
  overlayOpen,
  onOverlayClose,
  desktopCollapsed,
  onDesktopCollapse,
}: SidebarProps) {
  const pathname = usePathname()
  const collapsed = isOverlayMode ? false : desktopCollapsed
  const visible = isOverlayMode ? overlayOpen : true

  // Escape closes overlay
  React.useEffect(() => {
    if (!isOverlayMode || !overlayOpen) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onOverlayClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOverlayMode, overlayOpen, onOverlayClose])

  const handleNavClick = () => {
    if (isOverlayMode) onOverlayClose()
  }

  const sidebarContent = (
    <div style={{
      width: collapsed ? 'var(--sidebar-collapsed-width)' : 'var(--sidebar-width)',
      background: 'var(--color-sidebar-bg)',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      transition: 'width var(--motion-slow) var(--ease-out)',
      overflow: 'hidden',
    }}>
      {/* Logo */}
      <div style={{
        padding: collapsed ? '20px 0' : '20px var(--space-5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'space-between',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        flexShrink: 0,
      }}>
        {!collapsed && (
          <div style={{ lineHeight: 1.15 }}>
            <div style={{ fontSize: 'var(--text-md)', fontWeight: 700, color: '#ffffff', fontFamily: 'var(--font-serif)', letterSpacing: '0.08em' }}>
              VYVY.
            </div>
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-lime)', fontFamily: 'var(--font-mono)', letterSpacing: '0.18em' }}>
              WORKOS
            </div>
          </div>
        )}
        {collapsed && (
          <div style={{ fontSize: 'var(--text-md)', fontWeight: 700, color: '#ffffff', fontFamily: 'var(--font-serif)' }}>V.</div>
        )}
        {!collapsed && !isOverlayMode && (
          <button
            onClick={() => onDesktopCollapse(true)}
            aria-label="Thu gọn sidebar"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'rgba(255,255,255,0.4)', fontSize: 16, padding: 4,
              borderRadius: 'var(--radius-sm)',
              transition: 'color var(--motion-fast) var(--ease-out)',
              lineHeight: 1,
            }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#fff'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.4)'}
          >⟨</button>
        )}
        {isOverlayMode && (
          <button
            onClick={onOverlayClose}
            aria-label="Đóng menu"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'rgba(255,255,255,0.5)', fontSize: 18, padding: 4,
              borderRadius: 'var(--radius-sm)', lineHeight: 1,
              marginLeft: 'auto',
            }}
          >✕</button>
        )}
      </div>

      {/* Nav */}
      <nav aria-label="Menu chính" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: 'var(--space-3) 0' }}>
        {NAV_ITEMS.map(item => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
          const link = (
            <Link
              key={item.key}
              href={item.href}
              onClick={handleNavClick}
              aria-current={isActive ? 'page' : undefined}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-3)',
                padding: collapsed ? '10px 0' : '9px var(--space-5)',
                justifyContent: collapsed ? 'center' : 'flex-start',
                color: isActive ? 'var(--color-lime)' : 'var(--color-sidebar-text)',
                background: isActive ? 'rgba(218,223,33,0.08)' : 'transparent',
                borderLeft: isActive ? '2px solid var(--color-lime)' : '2px solid transparent',
                fontSize: 'var(--text-sm)',
                fontWeight: isActive ? 600 : 400,
                textDecoration: 'none',
                transition: 'background var(--motion-fast) var(--ease-out), color var(--motion-fast) var(--ease-out)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
              }}
              onMouseEnter={e => {
                if (!isActive) {
                  const el = e.currentTarget as HTMLElement
                  el.style.background = 'var(--color-sidebar-hover)'
                  el.style.color = '#fff'
                }
              }}
              onMouseLeave={e => {
                if (!isActive) {
                  const el = e.currentTarget as HTMLElement
                  el.style.background = 'transparent'
                  el.style.color = 'var(--color-sidebar-text)'
                }
              }}
            >
              <span style={{ fontSize: 14, flexShrink: 0, lineHeight: 1 }} aria-hidden="true">{item.icon}</span>
              {!collapsed && <span>{item.label}</span>}
            </Link>
          )

          return collapsed
            ? <Tooltip key={item.key} content={item.label} placement="right">{link}</Tooltip>
            : link
        })}
      </nav>

      {/* Footer */}
      <div style={{
        borderTop: '1px solid rgba(255,255,255,0.07)',
        padding: collapsed ? 'var(--space-3) 0' : 'var(--space-4) var(--space-5)',
        flexShrink: 0,
      }}>
        {collapsed ? (
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <Tooltip content="Mở rộng sidebar" placement="right">
              <button
                onClick={() => onDesktopCollapse(false)}
                aria-label="Mở rộng sidebar"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', fontSize: 16, lineHeight: 1, padding: 4 }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#fff'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.4)'}
              >⟩</button>
            </Tooltip>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <Avatar name="Nhat Quang" size={32} />
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Quang</div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'rgba(255,255,255,0.45)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                Project Coordinator · CEO Office
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )

  // ─── Overlay mode ───────────────────────────────────────────────
  if (isOverlayMode) {
    return (
      <>
        {/* Backdrop */}
        <div
          aria-hidden="true"
          onClick={onOverlayClose}
          style={{
            position: 'fixed', inset: 0,
            zIndex: 'calc(var(--z-sidebar) - 1)' as unknown as number,
            background: 'rgba(25,25,25,0.4)',
            backdropFilter: 'blur(1px)',
            opacity: overlayOpen ? 1 : 0,
            pointerEvents: overlayOpen ? 'auto' : 'none',
            transition: 'opacity var(--motion-base) var(--ease-out)',
          }}
        />
        {/* Panel */}
        <nav
          aria-label="Sidebar navigation"
          style={{
            position: 'fixed', top: 0, left: 0, bottom: 0,
            zIndex: 'var(--z-sidebar)' as unknown as number,
            width: 'var(--sidebar-width)',
            transform: overlayOpen ? 'translateX(0)' : 'translateX(-100%)',
            transition: 'transform var(--motion-slow) var(--ease-out)',
          }}
        >
          {sidebarContent}
        </nav>
      </>
    )
  }

  // ─── Desktop mode ───────────────────────────────────────────────
  return visible ? (
    <aside
      aria-label="Sidebar navigation"
      style={{
        width: desktopCollapsed ? 'var(--sidebar-collapsed-width)' : 'var(--sidebar-width)',
        minWidth: desktopCollapsed ? 'var(--sidebar-collapsed-width)' : 'var(--sidebar-width)',
        height: '100vh',
        position: 'sticky', top: 0,
        zIndex: 'var(--z-sidebar)' as unknown as number,
        flexShrink: 0,
        transition: 'width var(--motion-slow) var(--ease-out), min-width var(--motion-slow) var(--ease-out)',
        overflow: 'hidden',
      }}
    >
      {sidebarContent}
    </aside>
  ) : null
}
