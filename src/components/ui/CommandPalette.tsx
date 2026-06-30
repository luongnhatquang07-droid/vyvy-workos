'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { NAV_ITEMS } from '@/config/navigation'
import { useCommandData } from '@/hooks/useCommandData'
import { useFocusTrap } from '@/lib/focusTrap'

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
}

interface PaletteItem {
  key: string
  title: string
  subtitle: string
  href: string
  icon: string
  group: string
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const router = useRouter()
  const { data } = useCommandData()
  const [query, setQuery] = React.useState('')
  const [activeIndex, setActiveIndex] = React.useState(0)
  const containerRef = React.useRef<HTMLDivElement>(null)

  useFocusTrap(open, containerRef)

  const projectById = React.useMemo(
    () => Object.fromEntries((data?.projects ?? []).map((project) => [project.id, project])),
    [data?.projects],
  )

  const items = React.useMemo<PaletteItem[]>(() => {
    const navItems: PaletteItem[] = NAV_ITEMS.map((item) => ({
      key: `nav-${item.key}`,
      title: item.label,
      subtitle: item.group ?? 'Điều hướng',
      href: item.href,
      icon: item.icon,
      group: 'Điều hướng',
    }))

    const projectItems: PaletteItem[] = (data?.projects ?? []).map((project) => ({
      key: `project-${project.id}`,
      title: project.name,
      subtitle: project.code ? `Dự án · ${project.code}` : 'Dự án',
      href: '/projects',
      icon: 'ti-folders',
      group: 'Dự án',
    }))

    const taskItems: PaletteItem[] = (data?.tasks ?? []).map((task) => ({
      key: `task-${task.id}`,
      title: task.title,
      subtitle: task.project_id && projectById[task.project_id]
        ? `Đầu việc · ${projectById[task.project_id].name}`
        : 'Đầu việc',
      href: '/task-inbox',
      icon: 'ti-list-check',
      group: 'Đầu việc',
    }))

    const meetingItems: PaletteItem[] = (data?.meetings ?? []).map((meeting) => ({
      key: `meeting-${meeting.id}`,
      title: meeting.title,
      subtitle: meeting.start_at
        ? `Cuộc họp · ${new Date(meeting.start_at).toLocaleDateString('vi-VN')}`
        : 'Cuộc họp',
      href: '/meetings',
      icon: 'ti-microphone-2',
      group: 'Cuộc họp',
    }))

    const peopleItems: PaletteItem[] = (data?.people ?? []).map((person) => ({
      key: `person-${person.id}`,
      title: person.full_name,
      subtitle: person.job_title ? `Nhân sự · ${person.job_title}` : 'Nhân sự',
      href: '/team-workload',
      icon: 'ti-users-group',
      group: 'Nhân sự',
    }))

    const reminderItems: PaletteItem[] = (data?.reminders ?? [])
      .filter((reminder) => reminder.response_status !== 'CLOSED')
      .map((reminder) => ({
        key: `reminder-${reminder.id}`,
        title: `Nhắc việc mức ${reminder.reminder_level}`,
        subtitle: 'Theo dõi & nhắc việc',
        href: '/follow-ups',
        icon: 'ti-bell-ringing',
        group: 'Nhắc việc',
      }))

    return [...navItems, ...projectItems, ...taskItems, ...meetingItems, ...peopleItems, ...reminderItems]
  }, [data?.meetings, data?.people, data?.projects, data?.reminders, data?.tasks, projectById])

  const normalizedQuery = query.trim().toLowerCase()
  const filtered = React.useMemo(() => {
    if (!normalizedQuery) return items
    return items.filter((item) =>
      `${item.title} ${item.subtitle} ${item.group}`.toLowerCase().includes(normalizedQuery),
    )
  }, [items, normalizedQuery])

  React.useEffect(() => {
    if (!open) return

    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((value) => Math.min(value + 1, filtered.length - 1))
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((value) => Math.max(value - 1, 0))
      }
      if (e.key === 'Enter' && filtered[activeIndex]) {
        router.push(filtered[activeIndex].href)
        onClose()
      }
    }

    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [activeIndex, filtered, onClose, open, router])

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      style={overlayStyle}
    >
      <div ref={containerRef} style={panelStyle}>
        <div style={searchRowStyle}>
          <span aria-hidden="true" style={{ color: 'var(--color-text-muted)', fontSize: 16, flexShrink: 0 }}>
            ⌕
          </span>
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActiveIndex(0)
            }}
            placeholder="Tìm dự án, đầu việc, cuộc họp, người phụ trách..."
            aria-label="Tìm kiếm nhanh"
            autoFocus
            style={inputStyle}
          />
          <kbd aria-label="Nhấn Escape để đóng" style={kbdStyle}>
            Esc
          </kbd>
        </div>

        <ul role="listbox" aria-label="Kết quả tìm kiếm" style={listStyle}>
          {filtered.length === 0 ? (
            <li style={emptyStyle}>Không tìm thấy kết quả phù hợp.</li>
          ) : (
            filtered.map((item, index) => (
              <li key={item.key} role="option" aria-selected={index === activeIndex}>
                <button
                  onClick={() => {
                    router.push(item.href)
                    onClose()
                  }}
                  onMouseEnter={() => setActiveIndex(index)}
                  style={{
                    ...resultButtonStyle,
                    background: index === activeIndex ? 'var(--color-surface-2)' : 'transparent',
                    borderLeft: index === activeIndex ? '2px solid var(--color-lime)' : '2px solid transparent',
                  }}
                >
                  <span style={resultIconStyle}>
                    <i className={`ti ${item.icon}`} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={resultTitleStyle}>{item.title}</span>
                    <span style={resultSubtitleStyle}>{item.subtitle}</span>
                  </span>
                  <span style={groupBadgeStyle}>{item.group}</span>
                </button>
              </li>
            ))
          )}
        </ul>

        <div style={footerStyle}>
          <span>{filtered.length} kết quả</span>
          <span aria-hidden="true" style={{ marginLeft: 'auto', display: 'flex', gap: 'var(--space-3)' }}>
            <span>↑↓ di chuyển</span>
            <span>↵ mở</span>
          </span>
        </div>
      </div>
    </div>
  )
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 'var(--z-modal)' as unknown as number,
  background: 'rgba(25,25,25,0.45)',
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'center',
  paddingTop: '12vh',
  backdropFilter: 'blur(3px)',
}

const panelStyle: React.CSSProperties = {
  background: 'var(--color-surface)',
  borderRadius: 'var(--radius-xl)',
  boxShadow: 'var(--shadow-xl)',
  width: '100%',
  maxWidth: 620,
  margin: '0 var(--space-4)',
  overflow: 'hidden',
  animation: 'modal-in var(--motion-base) var(--ease-out)',
  border: '1px solid var(--color-border)',
}

const searchRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-3)',
  padding: 'var(--space-4) var(--space-5)',
  borderBottom: '1px solid var(--color-border)',
}

const inputStyle: React.CSSProperties = {
  flex: 1,
  border: 'none',
  outline: 'none',
  fontSize: 'var(--text-md)',
  color: 'var(--color-text)',
  background: 'transparent',
}

const kbdStyle: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  color: 'var(--color-text-muted)',
  background: 'var(--color-surface-2)',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)',
  padding: '2px 6px',
  fontFamily: 'var(--font-mono)',
  flexShrink: 0,
}

const listStyle: React.CSSProperties = {
  maxHeight: 420,
  overflowY: 'auto',
  listStyle: 'none',
  padding: 0,
}

const emptyStyle: React.CSSProperties = {
  padding: 'var(--space-8)',
  textAlign: 'center',
  color: 'var(--color-text-muted)',
  fontSize: 'var(--text-sm)',
}

const resultButtonStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-3)',
  width: '100%',
  padding: '11px var(--space-5)',
  border: 'none',
  cursor: 'pointer',
  textAlign: 'left',
  fontSize: 'var(--text-sm)',
  color: 'var(--color-text)',
  transition: 'background var(--motion-fast) var(--ease-out)',
}

const resultIconStyle: React.CSSProperties = {
  width: 30,
  height: 30,
  borderRadius: 10,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'var(--color-surface-2)',
  color: 'var(--color-text-muted)',
  flexShrink: 0,
}

const resultTitleStyle: React.CSSProperties = {
  display: 'block',
  fontWeight: 600,
  color: 'var(--color-text)',
  lineHeight: 1.35,
}

const resultSubtitleStyle: React.CSSProperties = {
  display: 'block',
  marginTop: 2,
  fontSize: 'var(--text-xs)',
  color: 'var(--color-text-muted)',
}

const groupBadgeStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--color-text-muted)',
  background: 'var(--color-surface-2)',
  borderRadius: '999px',
  padding: '4px 8px',
  flexShrink: 0,
}

const footerStyle: React.CSSProperties = {
  padding: 'var(--space-3) var(--space-5)',
  borderTop: '1px solid var(--color-border)',
  fontSize: 'var(--text-xs)',
  color: 'var(--color-text-muted)',
  display: 'flex',
  gap: 'var(--space-4)',
  alignItems: 'center',
}
