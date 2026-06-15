'use client'

import React, { useState } from 'react'

// Chọn 1 người (vd: người phụ trách). Bấm nút bung popover, chọn 1, hoặc bỏ chọn.
type Emp = { id: string; full_name: string }
type Props = {
  value: string | null
  employees: Emp[]
  onSave: (id: string | null) => void
  placeholder?: string
}

export default function PersonPicker({ value, employees, onSave, placeholder = 'Chưa gán' }: Props) {
  const [open, setOpen] = useState(false)
  const current = employees.find((e) => e.id === value)
  const label = current?.full_name || placeholder

  return (
    <div className="relative inline-block text-left">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }}
        className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-2 py-1 text-xs font-semibold text-[var(--text-primary)] hover:border-[var(--border-strong)]"
      >
        <span className="max-w-[150px] truncate">{label}</span>
        <span className="text-[var(--text-muted)]">▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setOpen(false) }} />
          <div
            className="absolute left-0 z-50 mt-1 max-h-60 w-56 overflow-auto rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-1 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => { onSave(null); setOpen(false) }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-[var(--text-muted)] hover:bg-[var(--bg-surface)]"
            >
              {placeholder}
            </button>
            {employees.length === 0 && <p className="px-2 py-1 text-xs text-[var(--text-muted)]">Chưa có nhân viên</p>}
            {employees.map((emp) => {
              const on = emp.id === value
              return (
                <button
                  key={emp.id}
                  type="button"
                  onClick={() => { onSave(emp.id); setOpen(false) }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-[var(--bg-surface)]"
                >
                  <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px] ${on ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--on-accent)]' : 'border-[var(--border-strong)]'}`}>
                    {on ? '✓' : ''}
                  </span>
                  <span className="truncate text-[var(--text-primary)]">{emp.full_name}</span>
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
