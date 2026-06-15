'use client'

import React, { useState } from 'react'
import { supabase } from '@/lib/supabase'

// Khối deadline inbox — 2 chế độ:
// - Nhân viên / Trưởng BP: gửi deadline đề xuất lên sếp duyệt
// - CEO / COO / Admin (seeAll=true): inbox duyệt deadline nhân viên đã gửi lên
type Task = {
  id: string; title: string; status: string | null
  assignee_id: string | null; head_id: string | null; head_ids?: string[] | null
  deadline_approval_status?: string | null; proposed_deadline?: string | null
  deadline_approver_id?: string | null; deadline_submitter_id?: string | null
  deadline_note?: string | null
}
type Emp = { id: string; full_name: string; role?: string | null }
type Props = { tasks: Task[]; currentUserId: string; employees: Emp[]; seeAll?: boolean }

export default function MyDeadlineInbox({ tasks, currentUserId, employees, seeAll = false }: Props) {
  const [draft, setDraft] = useState<Record<string, { deadline: string; approverId: string }>>({})
  const [rejectNote, setRejectNote] = useState<Record<string, string>>({})
  const [sent, setSent] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState('')

  const nameOf = (id: string | null) => (id ? employees.find((e) => e.id === id)?.full_name || '—' : '—')

  // ── Chế độ sếp: inbox duyệt deadline ──────────────────────────────────────
  if (seeAll) {
    const pendingApproval = tasks.filter(
      (t) => t.deadline_approval_status === 'cho_duyet' && t.deadline_approver_id === currentUserId
    )
    const alreadyHandled = tasks.filter(
      (t) => t.deadline_approver_id === currentUserId && (t.deadline_approval_status === 'da_duyet' || t.deadline_approval_status === 'tra_lai')
    ).slice(0, 5)

    async function approve(t: Task) {
      setBusy(t.id)
      await supabase.from('tasks').update({
        deadline_approval_status: 'da_duyet',
        due_date: t.proposed_deadline ?? null,
        deadline_note: null,
      }).eq('id', t.id)
      await supabase.from('task_deadline_approval_log').insert({
        task_id: t.id, round: 1, submitter_id: t.deadline_submitter_id ?? null,
        proposed_deadline: t.proposed_deadline ?? null, approver_id: currentUserId, decision: 'approve',
      })
      setBusy('')
      setSent((s) => ({ ...s, [t.id]: true }))
    }

    async function reject(t: Task) {
      const note = rejectNote[t.id]?.trim()
      if (!note) return
      setBusy(t.id)
      await supabase.from('tasks').update({
        deadline_approval_status: 'tra_lai',
        deadline_note: note,
      }).eq('id', t.id)
      await supabase.from('task_deadline_approval_log').insert({
        task_id: t.id, round: 1, submitter_id: t.deadline_submitter_id ?? null,
        proposed_deadline: t.proposed_deadline ?? null, approver_id: currentUserId, decision: 'reject', note,
      })
      setRejectNote((n) => ({ ...n, [t.id]: '' }))
      setBusy('')
      setSent((s) => ({ ...s, [t.id]: true }))
    }

    const actionable = pendingApproval.filter((t) => !sent[t.id])

    if (actionable.length === 0 && alreadyHandled.length === 0) return null

    return (
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
        <p className="mb-1 font-extrabold">Inbox duyệt deadline</p>
        <p className="mb-3 text-xs text-[var(--text-secondary)]">Nhân viên đã đề xuất deadline — bạn duyệt hoặc trả lại.</p>

        {actionable.length === 0 ? (
          <p className="rounded-xl bg-[var(--bg-surface)] px-3 py-4 text-center text-sm text-[var(--text-secondary)]">Không có deadline nào đang chờ bạn duyệt.</p>
        ) : (
          <div className="space-y-3">
            {actionable.map((t) => (
              <div key={t.id} className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-sm text-[var(--text-primary)]">{t.title}</p>
                    <p className="text-xs text-[var(--text-muted)]">
                      Người giao: {nameOf(t.deadline_submitter_id ?? null)} · Đề xuất: <b className="text-[var(--text-primary)]">{t.proposed_deadline || '—'}</b>
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busy === t.id}
                      onClick={() => approve(t)}
                      className="rounded-lg bg-[var(--olive)] px-3 py-1.5 text-xs font-extrabold text-[var(--ivory)] disabled:opacity-40"
                    >
                      Duyệt
                    </button>
                  </div>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Lý do trả lại (bắt buộc)..."
                    className="h-8 flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 text-xs outline-none"
                    value={rejectNote[t.id] || ''}
                    onChange={(e) => setRejectNote((n) => ({ ...n, [t.id]: e.target.value }))}
                  />
                  <button
                    type="button"
                    disabled={busy === t.id || !rejectNote[t.id]?.trim()}
                    onClick={() => reject(t)}
                    className="rounded-lg bg-[var(--danger-soft)] px-3 text-xs font-semibold text-[var(--danger)] disabled:opacity-40"
                  >
                    Trả lại
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {alreadyHandled.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Đã xử lý gần đây</p>
            <div className="space-y-1">
              {alreadyHandled.map((t) => (
                <div key={t.id} className="flex items-center justify-between rounded-lg bg-[var(--bg-surface)] px-3 py-2 text-xs">
                  <span className="text-[var(--text-primary)]">{t.title}</span>
                  <span className={t.deadline_approval_status === 'da_duyet' ? 'font-bold text-[var(--ok)]' : 'font-bold text-[var(--warn)]'}>
                    {t.deadline_approval_status === 'da_duyet' ? 'Đã duyệt' : 'Đã trả lại'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Chế độ nhân viên / trưởng BP: gửi deadline đề xuất ────────────────────
  const approvers = employees.filter((e) => ['coo', 'ceo', 'department_head'].includes((e.role || '').toLowerCase()))
  const approverList = approvers.length ? approvers : employees

  const needsDeadline = (t: Task) =>
    t.status !== 'completed' && t.status !== 'cancelled' &&
    (!t.deadline_approval_status || t.deadline_approval_status === 'draft' || t.deadline_approval_status === 'tra_lai')
  const isMine = (t: Task) =>
    !!currentUserId && (t.assignee_id === currentUserId || t.head_id === currentUserId || (t.head_ids || []).includes(currentUserId))

  const list = tasks.filter((t) => needsDeadline(t) && isMine(t))
  const remaining = list.filter((t) => !sent[t.id])

  function set(id: string, p: Partial<{ deadline: string; approverId: string }>) {
    setDraft((d) => ({ ...d, [id]: { deadline: d[id]?.deadline || '', approverId: d[id]?.approverId || approverList[0]?.id || '', ...p } }))
  }

  async function send(t: Task) {
    const d = draft[t.id] || { deadline: t.proposed_deadline || '', approverId: approverList[0]?.id || '' }
    if (!d.deadline || !d.approverId) return
    setBusy(t.id)
    await supabase.from('tasks').update({
      proposed_deadline: d.deadline, deadline_approval_status: 'cho_duyet',
      deadline_submitter_id: currentUserId || (t.assignee_id ?? null), deadline_approver_id: d.approverId, deadline_round: 1,
    }).eq('id', t.id)
    await supabase.from('task_deadline_approval_log').insert({
      task_id: t.id, round: 1, submitter_id: currentUserId || (t.assignee_id ?? null), proposed_deadline: d.deadline, approver_id: d.approverId, decision: 'submit',
    })
    setBusy('')
    setSent((s) => ({ ...s, [t.id]: true }))
  }

  if (remaining.length === 0) return null

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
      <p className="mb-1 font-extrabold">Việc được giao — nhập deadline & gửi duyệt</p>
      <p className="mb-3 text-xs text-[var(--text-secondary)]">Nhập deadline cho việc của bạn rồi gửi cấp trên duyệt.</p>
      <div className="hidden grid-cols-[1.7fr_120px_150px_1fr_auto] gap-2 px-1 pb-1 text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)] lg:grid">
        <span>Công việc được giao</span><span>Người</span><span>Deadline</span><span>Gửi duyệt tới</span><span></span>
      </div>
      <div className="space-y-2">
        {remaining.map((t) => {
          const d = draft[t.id] || { deadline: t.proposed_deadline || '', approverId: approverList[0]?.id || '' }
          return (
            <div key={t.id} className="grid grid-cols-1 items-center gap-2 rounded-xl bg-[var(--bg-surface)] p-2 lg:grid-cols-[1.7fr_120px_150px_1fr_auto]">
              <span className="text-sm font-medium text-[var(--text-primary)]">{t.title}</span>
              <span className="truncate text-xs text-[var(--text-secondary)]">{nameOf(t.assignee_id || t.head_id)}</span>
              <input type="date" className="rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-2 py-1.5 text-sm" value={d.deadline} onChange={(e) => set(t.id, { deadline: e.target.value })} />
              <select className="rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-2 py-1.5 text-sm" value={d.approverId} onChange={(e) => set(t.id, { approverId: e.target.value })}>
                <option value="">— Cấp duyệt —</option>
                {approverList.map((e) => <option key={e.id} value={e.id}>{e.full_name}{e.role ? ` (${e.role})` : ''}</option>)}
              </select>
              <button type="button" onClick={() => send(t)} disabled={busy === t.id || !d.deadline || !d.approverId}
                className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-extrabold text-[var(--on-accent)] disabled:opacity-40 hover:bg-[var(--accent-hover)]">
                {busy === t.id ? '...' : 'Gửi duyệt'}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
