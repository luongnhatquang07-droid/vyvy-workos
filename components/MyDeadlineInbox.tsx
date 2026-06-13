'use client'

import React, { useState } from 'react'
import { supabase } from '@/lib/supabase'

// Khối "Việc được giao": nhập deadline -> gửi cấp trên duyệt.
// seeAll = true (admin/COO/CEO): hiện TẤT CẢ việc cần nhập deadline (kèm tên người) + luôn hiển thị để kiểm tra.
type Task = {
  id: string; title: string; status: string | null
  assignee_id: string | null; head_id: string | null; head_ids?: string[] | null
  deadline_approval_status?: string | null; proposed_deadline?: string | null
}
type Emp = { id: string; full_name: string; role?: string | null }
type Props = { tasks: Task[]; currentUserId: string; employees: Emp[]; seeAll?: boolean }

export default function MyDeadlineInbox({ tasks, currentUserId, employees, seeAll = false }: Props) {
  const [draft, setDraft] = useState<Record<string, { deadline: string; approverId: string }>>({})
  const [sent, setSent] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState('')

  const approvers = employees.filter((e) => ['coo', 'ceo', 'department_head'].includes((e.role || '').toLowerCase()))
  const approverList = approvers.length ? approvers : employees
  const nameOf = (id: string | null) => (id ? employees.find((e) => e.id === id)?.full_name || '—' : '—')

  const needsDeadline = (t: Task) =>
    t.status !== 'completed' && t.status !== 'cancelled' &&
    (!t.deadline_approval_status || t.deadline_approval_status === 'draft' || t.deadline_approval_status === 'tra_lai')
  const isMine = (t: Task) =>
    !!currentUserId && (t.assignee_id === currentUserId || t.head_id === currentUserId || (t.head_ids || []).includes(currentUserId))

  const list = tasks.filter((t) => needsDeadline(t) && (seeAll || isMine(t)))
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
    setBusy(''); setSent((s) => ({ ...s, [t.id]: true }))
  }

  // Người thường không có việc -> ẩn. Admin/COO/CEO luôn hiện (để kiểm tra).
  if (!seeAll && remaining.length === 0) return null

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
      <p className="mb-1 font-extrabold">Việc được giao — nhập deadline & gửi duyệt{seeAll ? ' (toàn bộ)' : ''}</p>
      <p className="mb-3 text-xs text-[var(--text-secondary)]">
        {seeAll ? 'Bạn là quản lý nên thấy tất cả việc cần nhập deadline.' : 'Nhập deadline cho việc của bạn rồi gửi cấp trên duyệt.'}
      </p>
      {remaining.length === 0 ? (
        <p className="rounded-xl bg-[var(--bg-surface)] px-3 py-4 text-center text-sm text-[var(--text-secondary)]">
          Hiện chưa có việc nào cần nhập deadline. (Khối này sẽ liệt kê việc khi có đầu việc ở trạng thái chờ nhập deadline.)
        </p>
      ) : (
        <>
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
        </>
      )}
    </div>
  )
}
