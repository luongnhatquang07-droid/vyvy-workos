'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button, Badge, Select, Input } from '@/components/ui'

// ─── Luồng duyệt thương lượng deadline (mức đầu việc) ──────────────────────────
// Người dưới đề xuất deadline + tự chọn người duyệt → người duyệt Duyệt (chốt due_date)
// hoặc Không duyệt + nhập lý do → trả về nhập lại. Duyệt thủ công hoàn toàn.

type Emp = { id: string; full_name: string; role?: string | null }

type LogRow = {
  id: string
  round: number
  submitter_id: string | null
  proposed_deadline: string | null
  approver_id: string | null
  decision: string | null
  note: string | null
  created_at: string | null
}

type TaskDeadline = {
  deadline_approval_status: string | null
  proposed_deadline: string | null
  due_date: string | null
  deadline_submitter_id: string | null
  deadline_approver_id: string | null
  deadline_note: string | null
  deadline_round: number | null
}

type Props = {
  taskId: string
  taskLevel?: string | null
  currentUser: { id: string; role?: string | null }
  employees: Emp[]
  onChanged?: () => void
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Chưa gửi duyệt',
  cho_duyet: 'Chờ duyệt',
  tra_lai: 'Bị trả lại',
  da_duyet: 'Đã chốt',
}

export default function DeadlineApproval({ taskId, taskLevel, currentUser, employees, onChanged }: Props) {
  const [data, setData] = useState<TaskDeadline | null>(null)
  const [log, setLog] = useState<LogRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const [pickedDeadline, setPickedDeadline] = useState('')
  const [pickedApprover, setPickedApprover] = useState('')
  const [rejectNote, setRejectNote] = useState('')

  const empName = useCallback(
    (id: string | null) => (id ? employees.find((e) => e.id === id)?.full_name ?? '—' : '—'),
    [employees],
  )

  const load = useCallback(async () => {
    setLoading(true)
    const { data: t } = await supabase
      .from('tasks')
      .select(
        'deadline_approval_status, proposed_deadline, due_date, deadline_submitter_id, deadline_approver_id, deadline_note, deadline_round',
      )
      .eq('id', taskId)
      .single()
    const { data: rows } = await supabase
      .from('task_deadline_approval_log')
      .select('*')
      .eq('task_id', taskId)
      .order('created_at', { ascending: true })
    setData((t as TaskDeadline) ?? null)
    setLog((rows as LogRow[]) ?? [])
    if (t) {
      setPickedDeadline((t as TaskDeadline).proposed_deadline ?? '')
      setPickedApprover((t as TaskDeadline).deadline_approver_id ?? '')
    }
    setLoading(false)
  }, [taskId])

  useEffect(() => {
    void load()
  }, [load])

  // Ứng viên người duyệt: workstream → COO/CEO; subtask → trưởng bộ phận.
  const approverRoles = taskLevel === 'workstream' ? ['coo', 'ceo'] : ['department_head']
  let candidates = employees.filter((e) => approverRoles.includes((e.role ?? '').toLowerCase()))
  if (candidates.length === 0) candidates = employees // fallback nếu chưa gán role

  const status = data?.deadline_approval_status ?? 'draft'
  const round = data?.deadline_round ?? 0
  const isApprover = !!data?.deadline_approver_id && data.deadline_approver_id === currentUser.id
  const canSubmit = status === 'draft' || status === 'tra_lai'
  const isManager = ['coo', 'ceo', 'admin'].includes((currentUser.role ?? '').toLowerCase())

  async function submitForApproval() {
    if (!pickedDeadline || !pickedApprover) return
    setBusy(true)
    const nextRound = round + 1
    await supabase
      .from('tasks')
      .update({
        deadline_approval_status: 'cho_duyet',
        proposed_deadline: pickedDeadline,
        deadline_submitter_id: currentUser.id,
        deadline_approver_id: pickedApprover,
        deadline_round: nextRound,
        deadline_note: null,
      })
      .eq('id', taskId)
    await supabase.from('task_deadline_approval_log').insert({
      task_id: taskId,
      round: nextRound,
      submitter_id: currentUser.id,
      proposed_deadline: pickedDeadline,
      approver_id: pickedApprover,
      decision: 'submit',
    })
    setBusy(false)
    await load()
    onChanged?.()
  }

  async function approve() {
    setBusy(true)
    await supabase
      .from('tasks')
      .update({
        deadline_approval_status: 'da_duyet',
        due_date: data?.proposed_deadline ?? null,
        deadline_note: null,
      })
      .eq('id', taskId)
    await supabase.from('task_deadline_approval_log').insert({
      task_id: taskId,
      round,
      submitter_id: data?.deadline_submitter_id ?? null,
      proposed_deadline: data?.proposed_deadline ?? null,
      approver_id: currentUser.id,
      decision: 'approve',
    })
    setBusy(false)
    await load()
    onChanged?.()
  }

  async function reject() {
    if (!rejectNote.trim()) return
    setBusy(true)
    await supabase
      .from('tasks')
      .update({ deadline_approval_status: 'tra_lai', deadline_note: rejectNote.trim() })
      .eq('id', taskId)
    await supabase.from('task_deadline_approval_log').insert({
      task_id: taskId,
      round,
      submitter_id: data?.deadline_submitter_id ?? null,
      proposed_deadline: data?.proposed_deadline ?? null,
      approver_id: currentUser.id,
      decision: 'reject',
      note: rejectNote.trim(),
    })
    setRejectNote('')
    setBusy(false)
    await load()
    onChanged?.()
  }

  if (loading) return <div className="skeleton h-24 rounded-[var(--radius)]" />

  const tone =
    status === 'da_duyet' ? 'success' : status === 'tra_lai' ? 'danger' : status === 'cho_duyet' ? 'warning' : 'neutral'

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Badge tone={tone}>{STATUS_LABEL[status] ?? status}</Badge>
        {status === 'da_duyet' && data?.due_date && (
          <span className="text-xs text-[var(--text-secondary)]">Deadline chốt: {data.due_date}</span>
        )}
        {status === 'cho_duyet' && (
          <span className="text-xs text-[var(--text-secondary)]">
            Đang chờ {empName(data?.deadline_approver_id ?? null)} duyệt · hạn đề xuất {data?.proposed_deadline ?? '—'}
          </span>
        )}
      </div>

      {status === 'tra_lai' && data?.deadline_note && (
        <div className="rounded-[var(--radius)] border border-[var(--danger)]/30 bg-[var(--danger-soft)] px-3 py-2 text-xs text-[var(--danger)]">
          Lý do trả lại: {data.deadline_note}
        </div>
      )}

      {/* Manager (CEO/COO/Admin): chốt deadline trực tiếp */}
      {isManager && status !== 'da_duyet' && (
        <div className="flex flex-col gap-3 rounded-[var(--radius)] border border-[var(--border)] p-3">
          <Input
            label="Chốt deadline"
            type="date"
            value={pickedDeadline}
            onChange={(e) => setPickedDeadline(e.target.value)}
          />
          <Button onClick={async () => {
            if (!pickedDeadline) return
            setBusy(true)
            await supabase.from('tasks').update({
              due_date: pickedDeadline,
              deadline_approval_status: 'da_duyet',
              proposed_deadline: pickedDeadline,
              deadline_approver_id: currentUser.id,
              deadline_submitter_id: currentUser.id,
              deadline_round: (round || 0) + 1,
            }).eq('id', taskId)
            await supabase.from('task_deadline_approval_log').insert({
              task_id: taskId,
              round: (round || 0) + 1,
              submitter_id: currentUser.id,
              proposed_deadline: pickedDeadline,
              approver_id: currentUser.id,
              decision: 'approve',
              note: 'Chốt trực tiếp',
            })
            setBusy(false)
            await load()
            onChanged?.()
          }} loading={busy} disabled={!pickedDeadline}>
            Chốt deadline
          </Button>
        </div>
      )}

      {/* Nhân viên / trưởng phòng: gửi lên sếp duyệt */}
      {!isManager && canSubmit && (
        <div className="flex flex-col gap-3 rounded-[var(--radius)] border border-[var(--border)] p-3">
          <Input
            label="Deadline đề xuất"
            type="date"
            value={pickedDeadline}
            onChange={(e) => setPickedDeadline(e.target.value)}
          />
          <Select label="Gửi duyệt tới" value={pickedApprover} onChange={(e) => setPickedApprover(e.target.value)}>
            <option value="">— Chọn người duyệt —</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name}
                {c.role ? ` (${c.role})` : ''}
              </option>
            ))}
          </Select>
          <Button onClick={submitForApproval} loading={busy} disabled={!pickedDeadline || !pickedApprover}>
            Gửi duyệt
          </Button>
        </div>
      )}

      {/* Người duyệt: Duyệt / Không duyệt + lý do */}
      {status === 'cho_duyet' && isApprover && (
        <div className="flex flex-col gap-3 rounded-[var(--radius)] border border-[var(--border)] p-3">
          <p className="text-xs text-[var(--text-secondary)]">
            Hạn đề xuất: <b className="text-[var(--text-primary)]">{data?.proposed_deadline ?? '—'}</b>
          </p>
          <Input
            label="Lý do (khi không duyệt)"
            placeholder="VD: không chấp nhận deadline này…"
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
          />
          <div className="flex gap-2">
            <Button onClick={approve} loading={busy}>
              Duyệt
            </Button>
            <Button variant="danger" onClick={reject} loading={busy} disabled={!rejectNote.trim()}>
              Không duyệt
            </Button>
          </div>
        </div>
      )}

      {/* Lịch sử thương lượng */}
      {log.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-secondary)]">
            Lịch sử thương lượng
          </p>
          {log.map((r) => (
            <div key={r.id} className="flex items-start gap-2 text-xs text-[var(--text-secondary)]">
              <span className="font-mono text-[var(--text-muted)]">#{r.round}</span>
              <span>
                {r.decision === 'submit' && (
                  <>
                    {empName(r.submitter_id)} gửi duyệt (hạn {r.proposed_deadline ?? '—'}) → {empName(r.approver_id)}
                  </>
                )}
                {r.decision === 'approve' && <>{empName(r.approver_id)} đã duyệt ✓</>}
                {r.decision === 'reject' && (
                  <>
                    {empName(r.approver_id)} trả lại: {r.note ?? ''}
                  </>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
