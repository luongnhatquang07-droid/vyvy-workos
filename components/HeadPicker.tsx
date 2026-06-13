'use client'

import React, { useState } from 'react'

// Chọn nhiều Head — gọn: bấm nút bung popover, tick để chọn/bỏ.
type Emp = { id: string; full_name: string }
type Props = {
  headIds: string[]
  employees: Emp[]
  onSave: (ids: string[]) => void
}

export default function HeadPicker({ headIds, employees, onSave }: Props) {
  const [open, setOpen] = useState(false)
  const selected = headIds || []
  const names = selected
    .map((id) => employees.find((e) => e.id === id)?.full_name)
    .filter((x): x is string => Boolean(x))
  const label = names.length === 0 ? 'Chưa gắn head' : names.length <= 2 ? names.join(', ') : `${names[0]} +${names.length - 1}`

  function toggle(id: string) {
    const next = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]
    onSave(next)
  }

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
            {employees.length === 0 && <p className="px-2 py-1 text-xs text-[var(--text-muted)]">Chưa có nhân viên</p>}
            {employees.map((emp) => {
              const on = selected.includes(emp.id)
              return (
                <button
                  key={emp.id}
                  type="button"
                  onClick={() => toggle(emp.id)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-[var(--bg-surface)]"
                >
                  <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${on ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--on-accent)]' : 'border-[var(--border-strong)]'}`}>
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
