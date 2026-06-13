'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Row = { id: string; title: string | null; raw_content: string | null; summary: string | null; created_at: string | null }

export default function MeetingHistory() {
  const [rows, setRows] = useState<Row[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('meeting_minutes')
      .select('id, title, raw_content, summary, created_at')
      .order('created_at', { ascending: false })
      .limit(100)
    setRows((data as Row[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  function recapText(r: Row): string {
    if (r.raw_content && r.raw_content.trim()) return r.raw_content
    if (r.summary) {
      try { return JSON.stringify(JSON.parse(r.summary), null, 2) } catch { return r.summary }
    }
    return '(trống)'
  }

  return (
    <div className="rounded-2xl bg-[var(--bg-surface)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="font-extrabold">Lịch sử biên bản đã lưu</p>
        <button type="button" onClick={() => void load()} className="rounded-lg border border-[var(--border)] px-3 py-1 text-xs font-bold">Tải lại</button>
      </div>
      {loading ? (
        <div className="skeleton h-16 rounded-lg" />
      ) : rows.length === 0 ? (
        <p className="text-sm text-[var(--text-secondary)]">Chưa có biên bản nào được lưu. Bấm “Lưu biên bản” để lưu lại recap cuộc họp.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
              <button
                type="button"
                onClick={() => setOpenId(openId === r.id ? null : r.id)}
                className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-[var(--bg-surface)]"
              >
                <span className="truncate text-sm font-semibold text-[var(--text-primary)]">{r.title || 'Biên bản họp'}</span>
                <span className="shrink-0 text-xs text-[var(--text-muted)]">{r.created_at ? r.created_at.slice(0, 10) : ''}</span>
              </button>
              {openId === r.id && (
                <pre className="max-h-80 overflow-auto whitespace-pre-wrap border-t border-[var(--border)] px-4 py-3 text-xs leading-6 text-[var(--text-secondary)]">{recapText(r)}</pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
