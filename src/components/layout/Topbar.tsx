'use client'

import React from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Avatar } from '@/components/ui/Avatar'
import { useToast } from '@/components/feedback/Toast'
import { NAV_ITEMS } from '@/config/navigation'
import { useCommandData } from '@/hooks/useCommandData'
import { createClient } from '@/lib/supabase/client'

interface TopbarProps {
  onToggleSidebar: () => void
  onOpenCommandPalette: () => void
}

type NotificationTone = 'danger' | 'warning' | 'info'

export function Topbar({ onToggleSidebar, onOpenCommandPalette }: TopbarProps) {
  const { toast } = useToast()
  const router = useRouter()
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [quickOpen, setQuickOpen] = React.useState(false)
  const [notifyOpen, setNotifyOpen] = React.useState(false)
  const [theme, setTheme] = React.useState<'light' | 'dark'>('light')
  const { data } = useCommandData()

  const pageTitle =
    NAV_ITEMS.find((item) => pathname === item.href || pathname.startsWith(item.href + '/'))?.label ??
    'VyVy WorkOS'

  const peopleById = React.useMemo(
    () => Object.fromEntries((data?.people ?? []).map((person) => [person.id, person])),
    [data?.people],
  )
  const projectsById = React.useMemo(
    () => Object.fromEntries((data?.projects ?? []).map((project) => [project.id, project])),
    [data?.projects],
  )

  const quickActions = React.useMemo(
    () => [
      {
        key: 'meeting',
        label: 'Cuộc họp',
        desc: 'Mở lịch họp và biên bản',
        href: '/meetings',
        icon: 'ti-microphone-2',
      },
      {
        key: 'task',
        label: 'Đầu việc',
        desc: 'Đi tới inbox đầu việc để tạo và nhập việc',
        href: '/task-inbox',
        icon: 'ti-list-check',
      },
      {
        key: 'follow-up',
        label: 'Nhắc việc',
        desc: 'Mở danh sách cần dí và theo dõi',
        href: '/follow-ups',
        icon: 'ti-bell-ringing',
      },
      {
        key: 'approval',
        label: 'Phê duyệt',
        desc: 'Mở hàng chờ duyệt hiện tại',
        href: '/approvals',
        icon: 'ti-stamp',
      },
    ],
    [],
  )

  const notifications = React.useMemo(() => {
    const reminderItems = (data?.reminders ?? [])
      .filter((item) => item.response_status !== 'CLOSED')
      .slice(0, 4)
      .map((item) => {
        const person = item.person_id ? peopleById[item.person_id] : null
        return {
          id: `reminder-${item.id}`,
          title: person?.full_name ?? 'Có mục cần nhắc việc',
          desc: `Cần follow-up mức ${item.reminder_level}`,
          href: '/follow-ups',
          icon: 'ti-bell-ringing',
          tone: item.reminder_level >= 2 ? 'danger' : 'warning' as NotificationTone,
        }
      })

    const approvalItems = (data?.approvals ?? [])
      .filter((item) => item.status === 'PENDING')
      .slice(0, 3)
      .map((item) => {
        const project = item.project_id ? projectsById[item.project_id] : null
        return {
          id: `approval-${item.id}`,
          title: 'Có mục đang chờ duyệt',
          desc: project?.name ?? 'Kiểm tra danh sách phê duyệt',
          href: '/approvals',
          icon: 'ti-stamp',
          tone: 'info' as NotificationTone,
        }
      })

    const ceoItems = (data?.ceoRequests ?? []).slice(0, 2).map((item) => ({
      id: `ceo-${item.id}`,
      title: item.title,
      desc: 'Mục cần tổng hợp lên CEO',
      href: '/ceo-reports',
      icon: 'ti-presentation-analytics',
      tone: item.status === 'critical' ? 'danger' : 'info' as NotificationTone,
    }))

    return [...reminderItems, ...approvalItems, ...ceoItems].slice(0, 7)
  }, [data?.approvals, data?.ceoRequests, data?.reminders, peopleById, projectsById])

  React.useEffect(() => {
    function syncThemeFromClient() {
      const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
      setTheme(current)
    }

    syncThemeFromClient()

    function handleThemeEvent(event: Event) {
      const nextTheme = (event as CustomEvent<'light' | 'dark'>).detail
      if (nextTheme === 'light' || nextTheme === 'dark') setTheme(nextTheme)
    }

    window.addEventListener('vyvy-theme-change', handleThemeEvent)
    return () => window.removeEventListener('vyvy-theme-change', handleThemeEvent)
  }, [])

  function applyTheme(nextTheme: 'light' | 'dark') {
    const root = document.documentElement
    if (nextTheme === 'dark') {
      root.setAttribute('data-theme', 'dark')
      root.style.colorScheme = 'dark'
    } else {
      root.removeAttribute('data-theme')
      root.style.colorScheme = 'light'
    }
    localStorage.setItem('vyvy-theme', nextTheme)
    setTheme(nextTheme)
    window.dispatchEvent(new CustomEvent('vyvy-theme-change', { detail: nextTheme }))
  }

  function toggleTheme() {
    const nextTheme = theme === 'dark' ? 'light' : 'dark'
    applyTheme(nextTheme)
    toast(nextTheme === 'dark' ? 'Đã bật chế độ tối.' : 'Đã bật chế độ sáng.', 'success')
  }

  function closeFloaters() {
    setQuickOpen(false)
    setNotifyOpen(false)
    setMenuOpen(false)
  }

  function navigateTo(href: string) {
    closeFloaters()
    router.push(href)
  }

  async function handleSignOut() {
    closeFloaters()
    const sb = createClient()
    await sb.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <header style={headerStyle}>
      {(quickOpen || notifyOpen || menuOpen) ? (
        <div onClick={closeFloaters} style={{ position: 'fixed', inset: 0, zIndex: 49 }} />
      ) : null}

      <IconButton ariaLabel="Mở đóng sidebar" icon="ti-menu-2" onClick={onToggleSidebar} />

      <div style={titleStyle}>{pageTitle}</div>

      <button onClick={onOpenCommandPalette} aria-label="Mở tìm kiếm nhanh" style={searchButtonStyle}>
        <i className="ti ti-search" />
        <span style={{ flex: 1 }}>Tìm task, dự án, người, file...</span>
        <span style={kbdStyle}>Ctrl K</span>
      </button>

      <div style={{ flex: 1 }} />

      <span style={roleBadgeStyle}>Coordinator</span>

      <IconButton
        ariaLabel={theme === 'dark' ? 'Bật chế độ sáng' : 'Bật chế độ tối'}
        icon={theme === 'dark' ? 'ti-sun' : 'ti-moon'}
        onClick={toggleTheme}
        pressed={theme === 'dark'}
      />

      <div style={floatingWrapStyle}>
        <button
          onClick={() => {
            setQuickOpen((value) => !value)
            setNotifyOpen(false)
            setMenuOpen(false)
          }}
          style={primaryButtonStyle}
          data-vyvy-magnetic="true"
        >
          <i className="ti ti-plus" />
          Tạo nhanh
        </button>

        {quickOpen ? (
          <div style={panelMenuStyle}>
            <div style={panelMenuHeadStyle}>Tạo hoặc mở nhanh</div>
            {quickActions.map((action) => (
              <button key={action.key} onClick={() => navigateTo(action.href)} style={panelMenuItemStyle}>
                <span style={panelMenuIconStyle}>
                  <i className={`ti ${action.icon}`} />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={panelMenuTitleStyle}>{action.label}</span>
                  <span style={panelMenuDescStyle}>{action.desc}</span>
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div style={floatingWrapStyle}>
        <button
          onClick={() => {
            setNotifyOpen((value) => !value)
            setQuickOpen(false)
            setMenuOpen(false)
          }}
          aria-label="Thông báo"
          style={bellButtonStyle}
        >
          <i className="ti ti-bell" />
          {notifications.length > 0 ? <span data-vyvy-live-dot="true" style={unreadDotStyle} /> : null}
        </button>

        {notifyOpen ? (
          <div style={{ ...panelMenuStyle, width: 340 }}>
            <div style={panelMenuHeadRowStyle}>
              <div style={{ ...panelMenuHeadStyle, borderBottom: 'none', paddingBottom: 12 }}>Thông báo nhanh</div>
              <span style={notifyCountStyle}>{notifications.length}</span>
            </div>
            {notifications.length === 0 ? (
              <div style={panelEmptyStyle}>Hiện chưa có mục nào cần xử lý ngay.</div>
            ) : (
              notifications.map((item) => (
                <button key={item.id} onClick={() => navigateTo(item.href)} style={panelMenuItemStyle}>
                  <span style={panelMenuToneIconStyle(item.tone)}>
                    <i className={`ti ${item.icon}`} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={panelMenuTitleStyle}>{item.title}</span>
                    <span style={panelMenuDescStyle}>{item.desc}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        ) : null}
      </div>

      <div style={floatingWrapStyle}>
        <button
          onClick={() => {
            setMenuOpen((value) => !value)
            setQuickOpen(false)
            setNotifyOpen(false)
          }}
          aria-label="Tài khoản của tôi"
          style={{ padding: 0, borderRadius: '50%', background: 'transparent' }}
        >
          <Avatar name="Nhật Quang" size={32} />
        </button>

        {menuOpen ? (
          <div style={menuStyle}>
            <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid var(--line)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--txt)' }}>Nhật Quang</div>
              <div style={{ fontSize: 11, color: 'var(--txt-3)', marginTop: 1 }}>ADMIN</div>
            </div>
            <button onClick={handleSignOut} style={signOutStyle}>
              <i className="ti ti-logout" />
              Đăng xuất
            </button>
          </div>
        ) : null}
      </div>
    </header>
  )
}

function IconButton({
  ariaLabel,
  icon,
  onClick,
  pressed,
}: {
  ariaLabel: string
  icon: string
  onClick: () => void
  pressed?: boolean
}) {
  return (
    <button onClick={onClick} aria-label={ariaLabel} aria-pressed={pressed} title={ariaLabel} style={iconButtonStyle}>
      <i className={`ti ${icon}`} />
    </button>
  )
}

const headerStyle: React.CSSProperties = {
  height: 'var(--topbar-height)',
  borderBottom: '1px solid var(--glass-stroke)',
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  padding: '0 24px',
  background: 'linear-gradient(180deg, rgba(255,255,255,0.09), rgba(255,255,255,0.02)), var(--glass-fill)',
  backdropFilter: 'blur(18px) saturate(140%)',
  boxShadow: '0 10px 34px rgba(0,0,0,0.10)',
  position: 'sticky',
  top: 0,
  zIndex: 110,
  flexShrink: 0,
}

const iconButtonStyle: React.CSSProperties = {
  width: 38,
  height: 38,
  borderRadius: 10,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--txt-2)',
  border: '1px solid var(--glass-stroke)',
  fontSize: 18,
  background: 'linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.01))',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
  flexShrink: 0,
}

const titleStyle: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 17,
  fontWeight: 700,
  color: 'var(--txt)',
  textShadow: '0 1px 18px rgba(255,255,255,0.06)',
  flexShrink: 0,
}

const searchButtonStyle: React.CSSProperties = {
  marginLeft: 18,
  flex: 1,
  maxWidth: 440,
  display: 'flex',
  alignItems: 'center',
  gap: 9,
  background: 'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02)), var(--glass-fill)',
  border: '1px solid var(--glass-stroke)',
  borderRadius: 12,
  padding: '8px 12px',
  color: 'var(--txt-3)',
  fontSize: 13,
  textAlign: 'left',
  backdropFilter: 'blur(14px) saturate(130%)',
  boxShadow: '0 12px 28px rgba(0,0,0,0.10)',
}

const kbdStyle: React.CSSProperties = {
  marginLeft: 'auto',
  fontSize: 11,
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 5,
  padding: '1px 6px',
  color: 'var(--txt-3)',
  fontFamily: 'var(--font-mono)',
}

const roleBadgeStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.04em',
  color: 'var(--txt-3)',
  background: 'linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.01))',
  border: '1px solid var(--glass-stroke)',
  borderRadius: 'var(--radius-full)',
  padding: '3px 10px',
  whiteSpace: 'nowrap',
  flexShrink: 0,
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
}

const primaryButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 7,
  padding: '8px 14px',
  borderRadius: 12,
  fontSize: 13,
  fontWeight: 700,
  background: 'linear-gradient(180deg, #eef25c 0%, #d7df21 58%, #c5cb1b 100%)',
  color: 'var(--color-lime-ink)',
  flexShrink: 0,
  boxShadow: '0 16px 34px rgba(218,223,33,0.22), inset 0 1px 0 rgba(255,255,255,0.24)',
}

const floatingWrapStyle: React.CSSProperties = {
  position: 'relative',
  flexShrink: 0,
  zIndex: 50,
}

const bellButtonStyle: React.CSSProperties = {
  ...iconButtonStyle,
  position: 'relative',
}

const unreadDotStyle: React.CSSProperties = {
  position: 'absolute',
  top: 8,
  right: 9,
  width: 7,
  height: 7,
  borderRadius: '50%',
  background: 'var(--color-lime)',
  border: '2px solid var(--color-bg)',
}

const panelMenuStyle: React.CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 10px)',
  right: 0,
  width: 320,
  background: 'linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03)), var(--glass-fill)',
  border: '1px solid var(--glass-stroke)',
  borderRadius: 16,
  boxShadow: '0 22px 50px rgba(0,0,0,0.24)',
  backdropFilter: 'blur(16px) saturate(140%)',
  overflow: 'hidden',
}

const panelMenuHeadStyle: React.CSSProperties = {
  padding: '12px 14px 10px',
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--txt-3)',
  borderBottom: '1px solid var(--glass-stroke)',
}

const panelMenuHeadRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
  borderBottom: '1px solid var(--glass-stroke)',
}

const notifyCountStyle: React.CSSProperties = {
  marginRight: 14,
  minWidth: 22,
  height: 22,
  borderRadius: '999px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 8px',
  fontSize: 11,
  fontWeight: 700,
  background: 'rgba(218,223,33,0.18)',
  color: 'var(--color-lime)',
}

const panelMenuItemStyle: React.CSSProperties = {
  width: '100%',
  display: 'flex',
  alignItems: 'flex-start',
  gap: 10,
  padding: '12px 14px',
  textAlign: 'left',
  color: 'var(--txt)',
  background: 'transparent',
  borderBottom: '1px solid rgba(255,255,255,0.05)',
}

const panelMenuIconStyle: React.CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: 10,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(255,255,255,0.06)',
  color: 'var(--txt-2)',
  flexShrink: 0,
}

function panelMenuToneIconStyle(tone: NotificationTone): React.CSSProperties {
  return {
    ...panelMenuIconStyle,
    background:
      tone === 'danger'
        ? 'rgba(184,64,64,0.15)'
        : tone === 'warning'
          ? 'rgba(196,123,43,0.15)'
          : 'rgba(90,120,189,0.18)',
    color:
      tone === 'danger'
        ? 'var(--color-danger)'
        : tone === 'warning'
          ? 'var(--color-warning)'
          : 'var(--color-waiting)',
  }
}

const panelMenuTitleStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 700,
  color: 'var(--txt)',
  lineHeight: 1.35,
}

const panelMenuDescStyle: React.CSSProperties = {
  display: 'block',
  marginTop: 2,
  fontSize: 12,
  color: 'var(--txt-3)',
  lineHeight: 1.45,
}

const panelEmptyStyle: React.CSSProperties = {
  padding: '16px 14px',
  color: 'var(--txt-3)',
  fontSize: 12,
}

const menuStyle: React.CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 8px)',
  right: 0,
  background: 'linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02)), var(--glass-fill)',
  border: '1px solid var(--glass-stroke)',
  borderRadius: 12,
  minWidth: 168,
  overflow: 'hidden',
  boxShadow: 'var(--shadow-premium)',
  backdropFilter: 'blur(18px) saturate(140%)',
}

const signOutStyle: React.CSSProperties = {
  width: '100%',
  textAlign: 'left',
  padding: '9px 14px',
  fontSize: 13,
  color: 'var(--color-danger)',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
}
