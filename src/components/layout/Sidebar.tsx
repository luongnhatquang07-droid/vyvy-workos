'use client'
import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { NAV_ITEMS } from '@/config/navigation'
import { Avatar } from '@/components/ui/Avatar'
import { Tooltip } from '@/components/ui/Tooltip'

interface SidebarProps {
  collapsed: boolean
  onCollapse: (v: boolean) => void
}

export function Sidebar({ collapsed, onCollapse }: SidebarProps) {
  const pathname = usePathname()

  return (
    <aside style={{
      width: collapsed ? 'var(--sidebar-collapsed-width)' : 'var(--sidebar-width)',
      minWidth: collapsed ? 'var(--sidebar-collapsed-width)' : 'var(--sidebar-width)',
      background: 'var(--color-sidebar-bg)',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      transition: `width var(--motion-slow) var(--ease-out), min-width var(--motion-slow) var(--ease-out)`,
      overflow: 'hidden',
      position: 'sticky',
      top: 0,
      zIndex: 'var(--z-sidebar)' as unknown as number,
      flexShrink: 0,
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
            <div style={{
              fontSize: 'var(--text-md)',
              fontWeight: 700,
              color: '#ffffff',
              fontFamily: 'var(--font-serif)',
              letterSpacing: '0.08em',
            }}>VYVY.</div>
            <div style={{
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
              color: 'var(--color-lime)',
              fontFamily: 'var(--font-mono)',
              letterSpacing: '0.18em',
            }}>WORKOS</div>
          </div>
        )}
        {collapsed && (
          <div style={{ fontSize: 'var(--text-md)', fontWeight: 700, color: '#ffffff', fontFamily: 'var(--font-serif)' }}>V.</div>
        )}
        {!collapsed && (
          <button
            onClick={() => onCollapse(true)}
            title="Thu gọn sidebar"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'rgba(255,255,255,0.4)', fontSize: 16, padding: 4,
              borderRadius: 'var(--radius-sm)',
              transition: `color var(--motion-fast) var(--ease-out)`,
              lineHeight: 1,
            }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#fff'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.4)'}
          >⟨</button>
        )}
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: 'var(--space-3) 0' }}>
        {NAV_ITEMS.map(item => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
          const navBtn = (
            <Link
              href={item.href}
              key={item.key}
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
                transition: `background var(--motion-fast) var(--ease-out), color var(--motion-fast) var(--ease-out)`,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                position: 'relative',
              }}
              onMouseEnter={e => {
                if (!isActive) {
                  (e.currentTarget as HTMLElement).style.background = 'var(--color-sidebar-hover)'
                  ;(e.currentTarget as HTMLElement).style.color = '#fff'
                }
              }}
              onMouseLeave={e => {
                if (!isActive) {
                  (e.currentTarget as HTMLElement).style.background = 'transparent'
                  ;(e.currentTarget as HTMLElement).style.color = 'var(--color-sidebar-text)'
                }
              }}
            >
              <span style={{ fontSize: 14, flexShrink: 0, lineHeight: 1 }}>{item.icon}</span>
              {!collapsed && <span>{item.label}</span>}
            </Link>
          )
          return collapsed
            ? <Tooltip key={item.key} content={item.label} placement="right">{navBtn}</Tooltip>
            : navBtn
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
            <Tooltip content="Bung sidebar" placement="right">
              <button
                onClick={() => onCollapse(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', fontSize: 16, lineHeight: 1 }}
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
              <div style={{ fontSize: 'var(--text-xs)', color: 'rgba(255,255,255,0.45)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Project Coordinator · CEO Office</div>
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}
