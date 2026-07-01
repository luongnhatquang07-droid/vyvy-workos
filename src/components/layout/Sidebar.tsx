'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Avatar } from '@/components/ui/Avatar'
import { Tooltip } from '@/components/ui/Tooltip'
import { NAV_ITEMS } from '@/config/navigation'
import { useCommandData } from '@/hooks/useCommandData'
import {
  EMPTY_SIDEBAR_COUNTS,
  getSidebarCounts,
  type SidebarCounts,
} from '@/lib/data/queries/sidebarCounts'

interface SidebarProps {
  isOverlayMode: boolean
  overlayOpen: boolean
  onOverlayClose: () => void
  desktopCollapsed: boolean
  onDesktopCollapse: (value: boolean) => void
}

function useSidebarCounts(): SidebarCounts {
  const { data } = useCommandData()
  return React.useMemo(() => (data ? getSidebarCounts(data) : EMPTY_SIDEBAR_COUNTS), [data])
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
  const badgeCounts = useSidebarCounts()

  React.useEffect(() => {
    if (!isOverlayMode || !overlayOpen) return
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOverlayClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOverlayMode, overlayOpen, onOverlayClose])

  const groups = React.useMemo(() => {
    const nextGroups: Array<{ label: string; items: typeof NAV_ITEMS }> = []
    NAV_ITEMS.forEach((item) => {
      const label = item.group ?? ''
      let group = nextGroups.find((entry) => entry.label === label)
      if (!group) {
        group = { label, items: [] }
        nextGroups.push(group)
      }
      group.items.push(item)
    })
    return nextGroups
  }, [])

  function handleNavClick() {
    if (isOverlayMode) onOverlayClose()
  }

  const sidebarContent = (
    <div style={sidebarFrameStyle(collapsed)}>
      <div style={brandSectionStyle(collapsed)}>
        <div style={brandRowStyle(collapsed)}>
          <div style={logoStyle}>v</div>
          {!collapsed ? (
            <>
              <div style={{ flex: 1 }}>
                <div style={brandTitleStyle}>WorkOS</div>
                <div style={brandSubStyle}>CEO Office · v2</div>
              </div>
              {!isOverlayMode ? (
                <button
                  type="button"
                  onClick={() => onDesktopCollapse(true)}
                  aria-label="Thu gọn sidebar"
                  style={collapseButtonStyle}
                >
                  ‹
                </button>
              ) : null}
            </>
          ) : null}
        </div>

        {!collapsed ? (
          <button type="button" style={quickSearchStyle}>
            <i className="ti ti-search" />
            <span style={{ flex: 1 }}>Tìm nhanh...</span>
            <span style={kbdStyle}>Ctrl K</span>
          </button>
        ) : null}
      </div>

      <nav aria-label="Menu chính" style={navStyle}>
        {groups.map((group) => (
          <div key={group.label} style={{ marginTop: 6 }}>
            {!collapsed && group.label ? <div style={groupTitleStyle}>{group.label}</div> : null}

            {group.items.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
              const dynamicCount = badgeCounts[item.key as keyof SidebarCounts] ?? 0
              const badge = item.badge && dynamicCount > 0 ? badgeStyleFor(item.badge.variant) : null
              const link = (
                <Link
                  key={item.key}
                  href={item.href}
                  onClick={handleNavClick}
                  aria-current={isActive ? 'page' : undefined}
                  data-vyvy-nav-item="true"
                  style={navLinkStyle(collapsed, isActive)}
                >
                  {isActive && !collapsed ? <span data-vyvy-active-rail="true" style={activeRailStyle} /> : null}
                  <i className={`ti ${item.icon}`} style={navIconStyle(isActive)} />
                  {!collapsed ? <span style={{ flex: 1 }}>{item.label}</span> : null}
                  {!collapsed && badge ? <span style={{ ...badgeBaseStyle, ...badge }}>{dynamicCount}</span> : null}
                </Link>
              )

              return collapsed ? (
                <Tooltip key={item.key} content={item.label} placement="right">
                  {link}
                </Tooltip>
              ) : (
                link
              )
            })}
          </div>
        ))}
      </nav>

      <div style={userSectionStyle(collapsed)}>
        {collapsed ? (
          <Tooltip content="Quang · CEO Office" placement="right">
            <div>
              <Avatar name="Nhật Quang" size={32} />
            </div>
          </Tooltip>
        ) : (
          <>
            <Avatar name="Nhật Quang" size={32} />
            <div style={{ overflow: 'hidden', flex: 1 }}>
              <div style={userNameStyle}>Quang</div>
              <div style={userRoleStyle}>Project Coordinator · CEO Office</div>
            </div>
          </>
        )}
      </div>
    </div>
  )

  if (isOverlayMode) {
    return (
      <>
        <div aria-hidden="true" onClick={onOverlayClose} style={overlayStyle(overlayOpen)} />
        <nav aria-label="Sidebar navigation" style={overlayNavStyle(overlayOpen)}>
          {sidebarContent}
        </nav>
      </>
    )
  }

  return (
    <aside aria-label="Sidebar navigation" style={asideStyle(desktopCollapsed)}>
      {sidebarContent}
    </aside>
  )
}

function badgeStyleFor(variant?: string): React.CSSProperties {
  if (variant === 'hot') return { background: 'var(--danger-soft)', color: 'var(--danger-text)' }
  if (variant === 'lime') return { background: 'var(--brand-lime-soft)', color: 'var(--brand-lime)' }
  return { background: 'rgba(255,255,255,.07)', color: 'var(--app-text-soft)' }
}

const sidebarFrameStyle = (collapsed: boolean): React.CSSProperties => ({
  width: collapsed ? 'var(--sidebar-collapsed-width)' : 'var(--sidebar-width)',
  background:
    'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0) 18%), linear-gradient(135deg, rgba(218,223,33,0.07), rgba(218,223,33,0) 32%), linear-gradient(180deg, var(--app-surface-2), var(--app-bg))',
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  transition: 'width var(--motion-slow) var(--ease-out)',
  overflow: 'hidden',
  borderRight: '1px solid var(--app-border)',
  boxShadow: 'inset -1px 0 0 rgba(255,255,255,0.035), 18px 0 48px rgba(0,0,0,0.28)',
})

const brandSectionStyle = (collapsed: boolean): React.CSSProperties => ({
  padding: collapsed ? '20px 12px 14px' : '18px 14px 14px',
  borderBottom: '1px solid var(--app-border)',
})

const brandRowStyle = (collapsed: boolean): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: 11,
  padding: collapsed ? '0' : '4px 8px 18px',
  justifyContent: collapsed ? 'center' : 'flex-start',
})

const logoStyle: React.CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: '50%',
  background: 'radial-gradient(circle at 30% 30%, rgba(218,223,33,0.22), rgba(218,223,33,0) 42%), var(--app-surface-3)',
  border: '1px solid var(--app-border-strong)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--app-text)',
  fontWeight: 600,
  fontFamily: 'var(--font-display)',
  fontSize: 18,
  lineHeight: 1,
  flexShrink: 0,
  boxShadow: '0 12px 28px rgba(0,0,0,0.36), 0 0 0 1px rgba(218,223,33,0.08), inset 0 1px 0 rgba(255,255,255,0.10)',
}

const brandTitleStyle: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontWeight: 600,
  fontSize: 16,
  letterSpacing: '0.2px',
  color: 'var(--app-text)',
}

const brandSubStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--app-text-muted)',
  marginTop: -2,
}

const collapseButtonStyle: React.CSSProperties = {
  color: 'var(--app-text-muted)',
  fontSize: 16,
  padding: '4px 6px',
  borderRadius: 'var(--radius-sm)',
  lineHeight: 1,
}

const quickSearchStyle: React.CSSProperties = {
  margin: '0 0 6px',
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  gap: 9,
  background: 'linear-gradient(180deg, rgba(255,255,255,0.07), rgba(255,255,255,0.025)), var(--app-surface-2)',
  border: '1px solid var(--app-border-strong)',
  borderRadius: 12,
  padding: '8px 12px',
  color: 'var(--app-text-muted)',
  fontSize: 13,
  textAlign: 'left',
  boxShadow: '0 10px 24px rgba(0,0,0,0.16), inset 0 1px 0 rgba(255,255,255,0.05)',
  backdropFilter: 'blur(12px)',
}

const kbdStyle: React.CSSProperties = {
  fontSize: 11,
  background: 'rgba(255,255,255,0.07)',
  border: '1px solid var(--app-border-strong)',
  borderRadius: 5,
  padding: '1px 6px',
  color: 'var(--app-text-muted)',
  fontFamily: 'var(--font-mono)',
}

const navStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  overflowX: 'hidden',
  padding: '6px 0',
}

const groupTitleStyle: React.CSSProperties = {
  fontSize: 10.5,
  textTransform: 'uppercase',
  letterSpacing: '0.9px',
  color: 'rgba(156,163,175,0.72)',
  padding: '14px 10px 6px',
  fontWeight: 600,
}

const navLinkStyle = (collapsed: boolean, isActive: boolean): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: 11,
  padding: collapsed ? '10px 0' : '8px 10px',
  margin: collapsed ? '0' : '0 4px',
  justifyContent: collapsed ? 'center' : 'flex-start',
  color: isActive ? 'var(--brand-lime)' : 'var(--app-text-soft)',
  background: isActive ? 'linear-gradient(90deg, var(--brand-lime-soft), rgba(218,223,33,0.045)), var(--app-surface-3)' : 'transparent',
  borderRadius: 9,
  fontSize: 13.5,
  fontWeight: isActive ? 600 : 500,
  textDecoration: 'none',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  position: 'relative',
  transition: 'background var(--motion-fast) var(--ease-out), color var(--motion-fast) var(--ease-out)',
  boxShadow: isActive ? '0 14px 28px rgba(0,0,0,0.22), 0 0 0 1px var(--brand-lime-border), inset 0 1px 0 rgba(255,255,255,0.05)' : 'none',
})

const activeRailStyle: React.CSSProperties = {
  position: 'absolute',
  left: -4,
  top: 8,
  bottom: 8,
  width: 3,
  borderRadius: '0 3px 3px 0',
  background: 'var(--brand-lime)',
}

const navIconStyle = (isActive: boolean): React.CSSProperties => ({
  fontSize: 18,
  width: 20,
  textAlign: 'center',
  flexShrink: 0,
  color: isActive ? 'var(--brand-lime)' : 'var(--app-text-muted)',
  lineHeight: 1,
})

const badgeBaseStyle: React.CSSProperties = {
  marginLeft: 'auto',
  fontSize: 11,
  fontWeight: 600,
  padding: '1px 7px',
  borderRadius: 20,
  flexShrink: 0,
}

const userSectionStyle = (collapsed: boolean): React.CSSProperties => ({
  marginTop: 'auto',
  padding: collapsed ? '14px 0' : '14px',
  borderTop: '1px solid var(--app-border)',
  background: 'linear-gradient(180deg, rgba(255,255,255,0.045), rgba(255,255,255,0.015)), var(--app-surface)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: collapsed ? 'center' : 'flex-start',
  gap: 10,
})

const userNameStyle: React.CSSProperties = {
  fontSize: 'var(--text-sm)',
  fontWeight: 600,
  color: 'var(--app-text)',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

const userRoleStyle: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  color: 'var(--app-text-muted)',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

const overlayStyle = (open: boolean): React.CSSProperties => ({
  position: 'fixed',
  inset: 0,
  zIndex: 99,
  background: 'rgba(10,10,10,0.52)',
  backdropFilter: 'blur(2px)',
  opacity: open ? 1 : 0,
  pointerEvents: open ? 'auto' : 'none',
  transition: 'opacity var(--motion-base) var(--ease-out)',
})

const overlayNavStyle = (open: boolean): React.CSSProperties => ({
  position: 'fixed',
  top: 0,
  left: 0,
  bottom: 0,
  zIndex: 100,
  width: 'var(--sidebar-width)',
  transform: open ? 'translateX(0)' : 'translateX(-100%)',
  transition: 'transform var(--motion-slow) var(--ease-out)',
  boxShadow: open ? '6px 0 32px rgba(0,0,0,0.4)' : 'none',
})

const asideStyle = (collapsed: boolean): React.CSSProperties => ({
  width: collapsed ? 'var(--sidebar-collapsed-width)' : 'var(--sidebar-width)',
  minWidth: collapsed ? 'var(--sidebar-collapsed-width)' : 'var(--sidebar-width)',
  height: '100vh',
  position: 'sticky',
  top: 0,
  zIndex: 100,
  flexShrink: 0,
  transition: 'width var(--motion-slow) var(--ease-out), min-width var(--motion-slow) var(--ease-out)',
  overflow: 'hidden',
})
