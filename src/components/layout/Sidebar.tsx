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
      {/* Logo — height matches topbar */}
      <div style={{
        height: 'var(--topbar-height)',
        padding: collapsed ? '0 12px' : '0 var(--space-5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'space-between',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        flexShrink: 0,
      }}>
        {collapsed ? (
          /* Compact VV monogram — clicking expands sidebar */
          <button
            onClick={() => onDesktopCollapse(false)}
            aria-label="Mở rộng sidebar"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            <div style={{
              width: 34, height: 34,
              borderRadius: 'var(--radius-md)',
              background: 'rgba(218,223,33,0.10)',
              border: '1px solid rgba(218,223,33,0.22)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{
                fontSize: 13, fontWeight: 800, color: 'var(--color-lime)',
                fontFamily: 'var(--font-serif)', letterSpacing: '0.04em', lineHeight: 1,
              }}>VV</span>
            </div>
          </button>
        ) : (
          <>
            <div style={{ lineHeight: 1.2 }}>
              <div style={{
                fontSize: 15, fontWeight: 800, color: '#ffffff',
                fontFamily: 'var(--font-serif)', letterSpacing: '0.07em',
              }}>VYVY.</div>
              <div style={{
                fontSize: 9, fontWeight: 700, color: 'var(--color-lime)',
                fontFamily: 'var(--font-mono)', letterSpacing: '0.24em',
                marginTop: 2,
              }}>WORKOS</div>
            </div>
            {!isOverlayMode && (
              <button
                onClick={() => onDesktopCollapse(true)}
                aria-label="Thu gọn sidebar"
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'rgba(255,255,255,0.28)', fontSize: 14, padding: '4px 6px',
                  borderRadius: 'var(--radius-sm)', lineHeight: 1,
                  transition: 'color var(--motion-fast) var(--ease-out), background var(--motion-fast) var(--ease-out)',
                }}
                onMouseEnter={e => {
                  const el = e.currentTarget as HTMLElement
                  el.style.color = '#fff'
                  el.style.background = 'rgba(255,255,255,0.08)'
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget as HTMLElement
                  el.style.color = 'rgba(255,255,255,0.28)'
                  el.style.background = 'none'
                }}
              >⟨</button>
            )}
            {isOverlayMode && (
              <button
                onClick={onOverlayClose}
                aria-label="Đóng menu"
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'rgba(255,255,255,0.45)', fontSize: 16, padding: '4px 6px',
                  borderRadius: 'var(--radius-sm)', lineHeight: 1, marginLeft: 'auto',
                }}
              >✕</button>
            )}
          </>
        )}
      </div>

      {/* Nav */}
      <nav aria-label="Menu chính" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: 'var(--space-2) 0' }}>
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
                padding: collapsed ? '11px 0' : '9px var(--space-5)',
                justifyContent: collapsed ? 'center' : 'flex-start',
                color: isActive ? 'var(--color-lime)' : 'var(--color-sidebar-text)',
                background: isActive ? 'rgba(218,223,33,0.08)' : 'transparent',
                borderLeft: collapsed ? 'none' : (isActive ? '2px solid var(--color-lime)' : '2px solid transparent'),
                fontSize: 'var(--text-sm)',
                fontWeight: isActive ? 600 : 400,
                textDecoration: 'none',
                transition: 'background var(--motion-fast) var(--ease-out), color var(--motion-fast) var(--ease-out)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                position: 'relative',
              }}
              onMouseEnter={e => {
                if (!isActive) {
                  const el = e.currentTarget as HTMLElement
                  el.style.background = 'rgba(255,255,255,0.06)'
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
              <span style={{ fontSize: 15, flexShrink: 0, lineHeight: 1, opacity: isActive ? 1 : 0.72 }} aria-hidden="true">{item.icon}</span>
              {!collapsed && <span>{item.label}</span>}
            </Link>
          )

          return collapsed
            ? <Tooltip key={item.key} content={item.label} placement="right">{link}</Tooltip>
            : link
        })}
      </nav>

      {/* Footer user card */}
      <div style={{
        borderTop: '1px solid rgba(255,255,255,0.06)',
        padding: collapsed ? 'var(--space-3) 0' : 'var(--space-4) var(--space-5)',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'flex-start',
        gap: 'var(--space-3)',
      }}>
        {collapsed ? (
          <Tooltip content="Quang · Project Coordinator" placement="right">
            <div style={{ cursor: 'default' }}>
              <Avatar name="Nhat Quang" size={34} />
            </div>
          </Tooltip>
        ) : (
          <>
            <Avatar name="Nhat Quang" size={32} />
            <div style={{ overflow: 'hidden', flex: 1 }}>
              <div style={{
                fontSize: 'var(--text-sm)', fontWeight: 600, color: '#fff',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>Quang</div>
              <div style={{
                fontSize: 'var(--text-xs)', color: 'rgba(255,255,255,0.38)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>Project Coordinator · CEO Office</div>
            </div>
          </>
        )}
      </div>
    </div>
  )

  // Overlay mode
  if (isOverlayMode) {
    return (
      <>
        <div
          aria-hidden="true"
          onClick={onOverlayClose}
          style={{
            position: 'fixed', inset: 0,
            zIndex: 'calc(var(--z-sidebar) - 1)' as unknown as number,
            background: 'rgba(10,10,10,0.52)',
            backdropFilter: 'blur(2px)',
            opacity: overlayOpen ? 1 : 0,
            pointerEvents: overlayOpen ? 'auto' : 'none',
            transition: 'opacity var(--motion-base) var(--ease-out)',
          }}
        />
        <nav
          aria-label="Sidebar navigation"
          style={{
            position: 'fixed', top: 0, left: 0, bottom: 0,
            zIndex: 'var(--z-sidebar)' as unknown as number,
            width: 'var(--sidebar-width)',
            transform: overlayOpen ? 'translateX(0)' : 'translateX(-100%)',
            transition: 'transform var(--motion-slow) var(--ease-out)',
            boxShadow: overlayOpen ? '6px 0 32px rgba(0,0,0,0.4)' : 'none',
          }}
        >
          {sidebarContent}
        </nav>
      </>
    )
  }

  // Desktop mode
  return (
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
  )
}
