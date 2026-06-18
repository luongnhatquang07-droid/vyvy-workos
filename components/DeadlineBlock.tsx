'use client'

// ─── Deadline committed + luồng Xin gia hạn (mức đầu việc) ──────────────────
// Deadline đã chốt (họp / cấp trên giao) dùng luôn — KHÔNG cần duyệt ban đầu.
// Owner làm không kịp → Xin gia hạn (có lý do) → người duyệt Duyệt/Từ chối →
// cập nhật due_date, lưu lịch sử (task_deadline_extensions), gửi notification.
// Toàn bộ đọc/ghi bọc try/catch để an toàn khi DB chưa migrate.

import React, { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Emp = { id: string; full_name: string; role?: string | null; department_id?: string | null }

type TaskLike = {
  id: string
  due_date?: string | null
  assignee_id?: string | null
  head_id?: string | null
  department_id?: string | null
  priority?: string | null
  task_level?: string | null
  deadline_status?: string | null
  deadline_source?: string | null
  original_deadline?: string | null
  requested_deadline?: string | null
  deadline_change_count?: number | null
  deadline_reason?: string | null
  deadline_submitter_id?: string | null
  deadline_approver_id?: string | null
}

type ExtRow = {
  id: string
  round: number | null
  requested_by: string | null
  old_deadline: string | null
  new_deadline: string | null
  reason: string | null
  blocker: string | null
  impact: string | null
  plan_next: string | null
  need_help: string | null
  decision: string | null
  decided_by: string | null
  decided_at: string | null
  created_at: string | null
}

type Props = {
  task: TaskLike
  currentUser: { id: string; role?: string | null; department_id?: string | null }
  employees: Emp[]
  deadlineStatus: string        // từ getDeadlineStatus(task) ở parent
  statusLabel: string           // nhãn VN
  sourceLabel?: string          // nhãn nguồn VN
  canManage: boolean            // canEditDeadlineDirect(currentUser, task)
  needsEscalation?: boolean
  soloMode?: boolean            // SOLO_PILOT_MODE: cho phép admin tự test cả 2 vai
  onChanged?: () => void
}

const TONE: Record<string, string> = {
  overdue: 'bg-[var(--danger-soft)] text-[var(--danger)] border-[var(--danger)]/20',
  extension_rejected: 'bg-[var(--danger-soft)] text-[var(--danger)] border-[var(--danger)]/20',
  extension_requested: 'bg-[var(--warning-soft)] text-[var(--warning)] border-[var(--warning)]/20',
  due_today: 'bg-[var(--warning-soft)] text-[var(--warning)] border-[var(--warning)]/20',
  due_soon: 'bg-[var(--warning-soft)] text-[var(--warning)] border-[var(--warning)]/20',
  extension_approved: 'bg-[var(--success-soft)] text-[var(--success)] border-[var(--success)]/20',
  committed: 'bg-[var(--success-soft)] text-[var(--success)] border-[var(--success)]/20',
  no_deadline: 'bg-[var(--bg-surface)] text-[var(--text-muted)] border-[var(--border)]',
}

export default function DeadlineBlock({
  task, currentUser, employees, deadlineStatus, statusLabel, sourceLabel,
  canManage, needsEscalation, soloMode, onChanged,
}: Props) {
  const [log, setLog] = useState<ExtRow[]>([])
  const [busy, setBusy] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [showEdit, setShowEdit] = useState(false)

  // Form xin gia hạn
  const [newDate, setNewDate] = useState('')
  const [reason, setReason] = useState('')
  const [blocker, setBlocker] = useState('')
  const [impact, setImpact] = useState('')
  const [planNext, setPlanNext] = useState('')
  const [needHelp, setNeedHelp] = useState('')
  const [fileUrl, setFileUrl] = useState('')
  // Form sửa trực tiếp (manager)
  const [editDate, setEditDate] = useState(task.due_date || '')
  const [rejectNote, setRejectNote] = useState('')

  const empName = useCallback(
    (id: string | null | undefined) => (id ? employees.find((e) => e.id === id)?.full_name ?? '—' : '—'),
    [employees],
  )

  const loadLog = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('task_deadline_extensions')
        .select('*')
        .eq('task_id', task.id)
        .order('created_at', { ascending: false })
      setLog((data as ExtRow[]) ?? [])
    } catch { /* bảng chưa migrate */ }
  }, [task.id])

  useEffect(() => { void loadLog() }, [loadLog])

  const isOwner = currentUser.id === task.assignee_id
  const isRequested = deadlineStatus === 'extension_requested'
  const changeCount = task.deadline_change_count || 0

  // Người duyệt mặc định: người giao việc (head) → trưởng phòng của task.
  function resolveApprover(): string | null {
    if (task.head_id && task.head_id !== task.assignee_id) return task.head_id
    const deptHead = employees.find(
      (e) => (e.role || '').toLowerCase() === 'department_head' && e.department_id && e.department_id === task.department_id,
    )
    if (deptHead && deptHead.id !== task.assignee_id) return deptHead.id
    // fallback: COO/CEO/admin bất kỳ
    const mgr = employees.find((e) => ['coo', 'ceo', 'admin'].includes((e.role || '').toLowerCase()))
    return mgr?.id ?? null
  }

  async function notify(recipientId: string | null, title: string, body: string) {
    if (!recipientId) return
    try {
      await supabase.from('notifications').insert({
        recipient_id: recipientId, actor_id: currentUser.id, type: 'info',
        title, body, task_id: task.id,
      })
    } catch { /* notifications chưa migrate */ }
  }

  async function submitExtension() {
    if (!newDate || !reason.trim()) return
    setBusy(true)
    const approver = resolveApprover()
    const round = changeCount + 1
    try {
      await supabase.from('tasks').update({
        deadline_status: 'extension_requested',
        requested_deadline: newDate,
        deadline_submitter_id: currentUser.id,
        deadline_approver_id: approver,
        deadline_reason: reason.trim(),
      }).eq('id', task.id)
      await supabase.from('task_deadline_extensions').insert({
        task_id: task.id, round, requested_by: currentUser.id,
        old_deadline: task.due_date ?? null, new_deadline: newDate,
        reason: reason.trim(), blocker: blocker.trim() || null, impact: impact.trim() || null,
        plan_next: planNext.trim() || null, need_help: needHelp.trim() || null,
        file_url: fileUrl.trim() || null, decision: 'requested',
      })
      await notify(approver, '⏳ Yêu cầu gia hạn deadline', `${empName(currentUser.id)} xin gia hạn tới ${newDate}. Lý do: ${reason.trim()}`)
    } catch (e) { console.error('submitExtension', e) }
    setBusy(false); setShowForm(false)
    setNewDate(''); setReason(''); setBlocker(''); setImpact(''); setPlanNext(''); setNeedHelp(''); setFileUrl('')
    await loadLog(); onChanged?.()
  }

  async function approve() {
    setBusy(true)
    const newDl = task.requested_deadline
    try {
      await supabase.from('tasks').update({
        due_date: newDl,
        deadline_status: 'extension_approved',
        deadline_change_count: changeCount + 1,
        requested_deadline: null,
        deadline_decided_by: currentUser.id,
        deadline_decided_at: new Date().toISOString(),
      }).eq('id', task.id)
      const latest = log.find((r) => r.decision === 'requested')
      if (latest) await supabase.from('task_deadline_extensions').update({ decision: 'approved', decided_by: currentUser.id, decided_at: new Date().toISOString() }).eq('id', latest.id)
      await notify(task.deadline_submitter_id ?? task.assignee_id ?? null, 'Gia hạn được duyệt', `Deadline mới: ${newDl}`)
    } catch (e) { console.error('approve', e) }
    setBusy(false); await loadLog(); onChanged?.()
  }

  async function reject() {
    if (!rejectNote.trim()) return
    setBusy(true)
    try {
      await supabase.from('tasks').update({
        deadline_status: 'extension_rejected',
        requested_deadline: null,
        deadline_reason: rejectNote.trim(),
        deadline_decided_by: currentUser.id,
        deadline_decided_at: new Date().toISOString(),
      }).eq('id', task.id)
      const latest = log.find((r) => r.decision === 'requested')
      if (latest) await supabase.from('task_deadline_extensions').update({ decision: 'rejected', decided_by: currentUser.id, decided_at: new Date().toISOString() }).eq('id', latest.id)
      await notify(task.deadline_submitter_id ?? task.assignee_id ?? null, 'Gia hạn bị từ chối', `Lý do: ${rejectNote.trim()}. Deadline giữ nguyên ${task.due_date ?? ''}`)
    } catch (e) { console.error('reject', e) }
    setRejectNote(''); setBusy(false); await loadLog(); onChanged?.()
  }

  async function saveEdit() {
    if (!editDate) return
    setBusy(true)
    try {
      await supabase.from('tasks').update({
        due_date: editDate,
        deadline_status: 'committed',
        deadline_source: 'manual',
        original_deadline: task.original_deadline || editDate,
        deadline_locked: true,
        requested_deadline: null,
        deadline_decided_by: currentUser.id,
        deadline_decided_at: new Date().toISOString(),
      }).eq('id', task.id)
      await supabase.from('task_deadline_extensions').insert({
        task_id: task.id, round: changeCount + 1, requested_by: currentUser.id,
        old_deadline: task.due_date ?? null, new_deadline: editDate,
        reason: 'Cấp trên sửa deadline trực tiếp', decision: 'approved',
        decided_by: currentUser.id, decided_at: new Date().toISOString(),
      })
      await notify(task.assignee_id ?? null, 'Deadline được cập nhật', `Deadline mới: ${editDate}`)
    } catch (e) { console.error('saveEdit', e) }
    setBusy(false); setShowEdit(false); onChanged?.()
  }

  const tone = TONE[deadlineStatus] || TONE.committed
  const inputCls = 'vyvy-input h-9 w-full px-3 text-xs outline-none'
  const taCls = 'vyvy-input w-full px-3 py-2 text-xs outline-none'

  return (
    <div className="flex flex-col gap-3">
      {/* Tóm tắt */}
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${tone}`}>{statusLabel}</span>
        {changeCount > 0 && (
          <span className="rounded-full border border-[var(--border)] bg-[var(--bg-card)] px-2 py-1 text-[10px] font-semibold text-[var(--text-muted)]">
            Đã gia hạn {changeCount} lần
          </span>
        )}
        {task.deadline_source && (
          <span className="rounded-full border border-[var(--border)] bg-[var(--bg-card)] px-2 py-1 text-[10px] font-semibold text-[var(--text-muted)]">Nguồn: {sourceLabel || task.deadline_source}</span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2">
          <p className="vyvy-label">Deadline hiện tại</p>
          <p className="mt-0.5 font-bold text-[var(--text-primary)]">{task.due_date || 'Chưa có'}</p>
        </div>
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2">
          <p className="vyvy-label">Deadline gốc</p>
          <p className="mt-0.5 font-bold text-[var(--text-primary)]">{task.original_deadline || task.due_date || '—'}</p>
        </div>
      </div>

      {isRequested && task.requested_deadline && (
        <div className="rounded-[var(--radius)] border border-[var(--warning)]/30 bg-[var(--warning-soft)] px-3 py-2 text-xs text-[var(--warning)]">
          Đang xin gia hạn tới <b>{task.requested_deadline}</b>
          {task.deadline_reason && <> · {task.deadline_reason}</>}
        </div>
      )}

      {needsEscalation && (
        <div className="rounded-[var(--radius)] border border-[var(--warning)]/25 bg-[var(--warning-soft)] px-3 py-2 text-[11px] font-semibold text-[var(--warning)]">
          Nên cân nhắc chuyển COO/CEO duyệt (gia hạn nhiều lần / ưu tiên cao / ảnh hưởng milestone).
        </div>
      )}

      {/* ── SOLO PILOT warning ── */}
      {soloMode && isOwner && canManage && (
        <p className="rounded-[var(--radius)] border border-[var(--lime)]/30 bg-[var(--lime)]/8 px-3 py-1.5 text-[11px] font-semibold text-[var(--olive)]">
          ⚡ Solo Pilot: bạn đang tự test luồng xin gia hạn/duyệt.
        </p>
      )}

      {/* ── OWNER: xin gia hạn ── */}
      {isOwner && (!canManage || soloMode) && !isRequested && (
        showForm ? (
          <div className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-card)] p-3">
            <p className="vyvy-label">Extension request</p>
            <p className="text-xs font-bold text-[var(--text-primary)]">Xin gia hạn deadline</p>
            <label className="vyvy-label">Deadline mới đề xuất</label>
            <input type="date" className={inputCls} value={newDate} onChange={(e) => setNewDate(e.target.value)} />
            <textarea className={taCls} rows={2} placeholder="Lý do xin gia hạn *" value={reason} onChange={(e) => setReason(e.target.value)} />
            <textarea className={taCls} rows={2} placeholder="Vướng mắc hiện tại" value={blocker} onChange={(e) => setBlocker(e.target.value)} />
            <input className={inputCls} placeholder="Mức ảnh hưởng nếu trễ" value={impact} onChange={(e) => setImpact(e.target.value)} />
            <textarea className={taCls} rows={2} placeholder="Kế hoạch xử lý tiếp theo" value={planNext} onChange={(e) => setPlanNext(e.target.value)} />
            <input className={inputCls} placeholder="Cần hỗ trợ từ ai" value={needHelp} onChange={(e) => setNeedHelp(e.target.value)} />
            <input className={inputCls} placeholder="File/link (nếu có)" value={fileUrl} onChange={(e) => setFileUrl(e.target.value)} />
            <div className="flex gap-2">
              <button disabled={busy || !newDate || !reason.trim()} onClick={submitExtension}
                className="vyvy-button-primary flex-1 disabled:opacity-40">Gửi yêu cầu</button>
              <button disabled={busy} onClick={() => setShowForm(false)}
                className="vyvy-button-secondary">Hủy</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setShowForm(true)}
            className="vyvy-button-secondary w-full text-[var(--olive)]">
            Xin gia hạn deadline
          </button>
        )
      )}

      {isOwner && (!canManage || soloMode) && isRequested && !soloMode && (
        <p className="text-[11px] italic text-[var(--text-muted)]">Đã gửi yêu cầu gia hạn, đang chờ duyệt.</p>
      )}

      {/* ── MANAGER: duyệt / từ chối / sửa ── */}
      {canManage && (
        <div className="flex flex-col gap-2">
          {isRequested && (
            <div className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-[var(--warning)]/25 bg-[var(--warning-soft)] p-3">
              <p className="text-xs text-[var(--text-secondary)]">
                {empName(task.deadline_submitter_id)} xin gia hạn tới <b className="text-[var(--text-primary)]">{task.requested_deadline}</b>
              </p>
              <input className={inputCls} placeholder="Lý do (khi từ chối)" value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} />
              <div className="flex gap-2">
                <button disabled={busy} onClick={approve}
                  className="vyvy-button-primary flex-1 disabled:opacity-40">Duyệt gia hạn</button>
                <button disabled={busy || !rejectNote.trim()} onClick={reject}
                  className="vyvy-button-danger flex-1 disabled:opacity-40">Từ chối</button>
              </div>
            </div>
          )}
          {showEdit ? (
            <div className="flex items-center gap-2">
              <input type="date" className={inputCls} value={editDate} onChange={(e) => setEditDate(e.target.value)} />
              <button disabled={busy || !editDate} onClick={saveEdit}
                className="vyvy-button-primary shrink-0 disabled:opacity-40">Lưu</button>
              <button disabled={busy} onClick={() => setShowEdit(false)}
                className="vyvy-button-secondary shrink-0">Hủy</button>
            </div>
          ) : (
            <button onClick={() => { setEditDate(task.due_date || ''); setShowEdit(true) }}
              className="vyvy-button-ghost w-full border-[var(--border)]">
              Sửa deadline trực tiếp
            </button>
          )}
        </div>
      )}

      {/* Lịch sử gia hạn */}
      {log.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="vyvy-label">Lịch sử gia hạn</p>
          {log.map((r) => (
            <div key={r.id} className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-[11px] text-[var(--text-secondary)]">
              <div className="flex flex-wrap items-center gap-1">
                <span className="font-mono text-[var(--text-muted)]">#{r.round ?? '?'}</span>
                <span>{empName(r.requested_by)} xin {r.old_deadline || '—'} → <b>{r.new_deadline || '—'}</b></span>
                {r.decision === 'approved' && <span className="font-bold text-[var(--success)]">· đã duyệt{r.decided_by ? ` (${empName(r.decided_by)})` : ''}</span>}
                {r.decision === 'rejected' && <span className="font-bold text-[var(--danger)]">· từ chối{r.decided_by ? ` (${empName(r.decided_by)})` : ''}</span>}
                {r.decision === 'requested' && <span className="font-bold text-[var(--warning)]">· chờ duyệt</span>}
              </div>
              {r.reason && <p className="mt-1 text-[var(--text-muted)]">{r.reason}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
