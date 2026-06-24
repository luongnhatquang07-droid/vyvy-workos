'use client'
import React from 'react'
import { useRouter } from 'next/navigation'
import { NAV_ITEMS } from '@/config/navigation'
import { useFocusTrap } from '@/lib/focusTrap'

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const router = useRouter()
  // query and activeIndex reset naturally because AppShell passes key={cmdKey}
  // which remounts this component fresh on each open
  const [query, setQuery] = React.useState('')
  const [activeIndex, setActiveIndex] = React.useState(0)
  const containerRef = React.useRef<HTMLDivElement>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  useFocusTrap(open, containerRef)

  const filtered = NAV_ITEMS.filter(item =>
    item.label.toLowerCase().includes(query.toLowerCase())
  )

  // Keyboard navigation
  React.useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex(i => Math.min(i + 1, filtered.length - 1))
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex(i => Math.max(i - 1, 0))
      }
      if (e.key === 'Enter' && filtered[activeIndex]) {
        router.push(filtered[activeIndex].href)
        onClose()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, filtered, activeIndex, onClose, router])

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0,
        zIndex: 'var(--z-modal)' as unknown as number,
        background: 'rgba(25,25,25,0.45)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '12vh',
        backdropFilter: 'blur(3px)',
      }}
    >
      <div
        ref={containerRef}
        style={{
          background: 'var(--color-surface)',
          borderRadius: 'var(--radius-xl)',
          boxShadow: 'var(--shadow-xl)',
          width: '100%', maxWidth: 560,
          margin: '0 var(--space-4)',
          overflow: 'hidden',
          animation: 'modal-in var(--motion-base) var(--ease-out)',
        }}
      >
        {/* Search */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
          padding: 'var(--space-4) var(--space-5)',
          borderBottom: '1px solid var(--color-border)',
        }}>
          <span aria-hidden="true" style={{ color: 'var(--color-text-muted)', fontSize: 16, flexShrink: 0 }}>⌕</span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setActiveIndex(0) }}
            placeholder="Điều hướng tới…"
            aria-label="Tìm kiếm điều hướng"
            autoFocus
            style={{
              flex: 1, border: 'none', outline: 'none',
              fontSize: 'var(--text-md)', color: 'var(--color-text)',
              background: 'transparent',
            }}
          />
          <kbd aria-label="Nhấn Escape để đóng" style={{
            fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)',
            background: 'var(--color-surface-2)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)',
            padding: '2px 6px', fontFamily: 'var(--font-mono)', flexShrink: 0,
          }}>Esc</kbd>
        </div>

        {/* Results */}
        <ul role="listbox" aria-label="Danh sách điều hướng" style={{ maxHeight: 360, overflowY: 'auto', listStyle: 'none', padding: 0 }}>
          {filtered.length === 0 ? (
            <li style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
              Không tìm thấy kết quả.
            </li>
          ) : (
            filtered.map((item, i) => (
              <li key={item.key} role="option" aria-selected={i === activeIndex}>
                <button
                  onClick={() => { router.push(item.href); onClose() }}
                  onMouseEnter={() => setActiveIndex(i)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
                    width: '100%', padding: '10px var(--space-5)',
                    background: i === activeIndex ? 'var(--color-surface-2)' : 'transparent',
                    border: 'none', cursor: 'pointer', textAlign: 'left',
                    fontSize: 'var(--text-sm)', color: 'var(--color-text)',
                    borderLeft: i === activeIndex ? '2px solid var(--color-lime)' : '2px solid transparent',
                    transition: 'background var(--motion-fast) var(--ease-out)',
                  }}
                >
                  <span aria-hidden="true" style={{ fontSize: 14, color: 'var(--color-text-muted)', flexShrink: 0 }}>{item.icon}</span>
                  <span style={{ flex: 1, fontWeight: i === activeIndex ? 500 : 400 }}>{item.label}</span>
                  {i === activeIndex && (
                    <kbd aria-hidden="true" style={{
                      fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)',
                      background: 'var(--color-border)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '1px 5px', fontFamily: 'var(--font-mono)',
                    }}>↵</kbd>
                  )}
                </button>
              </li>
            ))
          )}
        </ul>

        {/* Footer */}
        <div style={{
          padding: 'var(--space-3) var(--space-5)',
          borderTop: '1px solid var(--color-border)',
          fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)',
          display: 'flex', gap: 'var(--space-4)', alignItems: 'center',
          fontStyle: 'italic',
        }}>
          Tìm kiếm dữ liệu nghiệp vụ sẽ được triển khai ở giai đoạn sau.
          <span aria-hidden="true" style={{ marginLeft: 'auto', display: 'flex', gap: 'var(--space-3)', fontStyle: 'normal' }}>
            <span>↑↓ điều hướng</span>
            <span>↵ mở</span>
          </span>
        </div>
      </div>
    </div>
  )
}
