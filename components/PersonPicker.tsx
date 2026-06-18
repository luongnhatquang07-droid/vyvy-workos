'use client'

import React, { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'

// Chọn 1 người (vd: người phụ trách). Portal-based để không bị cắt bởi overflow/stacking context.
type Emp = { id: string; full_name: string }
type Props = {
  value: string | null
  employees: Emp[]
  onSave: (id: string | null) => void
  placeholder?: string
}

export default function PersonPicker({ value, employees, onSave, placeholder = 'Chưa gán' }: Props) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState({ top: 0, left: 0, minWidth: 0, openUp: false })
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const current = employees.find((e) => e.id === value)
  const label = current?.full_name || placeholder

  function openMenu(e: React.MouseEvent) {
    e.stopPropagation()
    if (!btnRef.current) return
    const rect = btnRef.current.getBoundingClientRect()
    const dropH = Math.min(employees.length * 36 + 48, 280)
    const spaceBelow = window.innerHeight - rect.bottom
    const openUp = spaceBelow < dropH + 8 && rect.top > dropH + 8
    setCoords({
      top: openUp ? rect.top - dropH - 4 : rect.bottom + 4,
      left: rect.left,
      minWidth: Math.max(rect.width, 224),
      openUp,
    })
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    // Chỉ đóng khi scroll xảy ra NGOÀI dropdown (không đóng khi lăn chuột trong list)
    const onScroll = (e: Event) => {
      if (menuRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const onResize = () => setOpen(false)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="relative inline-block text-left">
      <button
        ref={btnRef}
        type="button"
        onClick={openMenu}
        className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-2 py-1 text-xs font-semibold text-[var(--text-primary)] hover:border-[var(--border-strong)] transition-colors"
      >
        <span className="max-w-[150px] truncate">{label}</span>
        <span className="text-[var(--text-muted)]">▾</span>
      </button>

      {open && typeof document !== 'undefined' && createPortal(
        <>
          {/* Backdrop — captures outside clicks */}
          <div
            className="fixed inset-0 z-[9998]"
            onClick={(e) => { e.stopPropagation(); setOpen(false) }}
          />
          {/* Dropdown menu — floats above everything via portal */}
          <div
            ref={menuRef}
            style={{ top: coords.top, left: coords.left, minWidth: coords.minWidth }}
            className="fixed z-[9999] max-h-[280px] w-56 overflow-y-auto rounded-xl border border-[var(--border-soft,#E6E0D5)] bg-[var(--bg-card,#FFFDFC)] p-1 shadow-[0_8px_32px_-4px_rgba(0,0,0,0.18),0_2px_8px_-2px_rgba(0,0,0,0.08)]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Clear selection */}
            <button
              type="button"
              onClick={() => { onSave(null); setOpen(false) }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-[var(--text-muted)] hover:bg-[var(--bg-surface)] transition-colors"
            >
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-[var(--border-strong)] text-[10px]" />
              <span className="italic">{placeholder}</span>
            </button>

            {employees.length === 0 && (
              <p className="px-3 py-2 text-xs text-[var(--text-muted)]">Chưa có nhân viên</p>
            )}

            {employees.map((emp) => {
              const selected = emp.id === value
              return (
                <button
                  key={emp.id}
                  type="button"
                  onClick={() => { onSave(emp.id); setOpen(false) }}
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs transition-colors ${
                    selected
                      ? 'bg-[var(--accent,#C8DB5B)]/15 font-semibold text-[var(--text-primary)]'
                      : 'text-[var(--text-primary)] hover:bg-[var(--bg-surface)]'
                  }`}
                >
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px] ${
                      selected
                        ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--on-accent,#1a1a1a)]'
                        : 'border-[var(--border-strong)]'
                    }`}
                  >
                    {selected ? '✓' : ''}
                  </span>
                  <span className="truncate">{emp.full_name}</span>
                </button>
              )
            })}
          </div>
        </>,
        document.body
      )}
    </div>
  )
}
