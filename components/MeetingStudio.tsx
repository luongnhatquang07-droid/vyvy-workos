'use client'

import React, { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Emp = { id: string; full_name: string; role?: string | null }
type Proj = { id: string; name: string }
type AiTask = { title: string; owner?: string | null; deadline?: string | null; note?: string | null }

type Row = {
  title: string
  ownerId: string
  deadline: string
  approverId: string
  note: string
}

type Props = {
  employees: Emp[]
  currentEmployee: { id: string; full_name?: string | null } | null
  onCreated?: () => void
}

export default function MeetingStudio({ employees, currentEmployee, onCreated }: Props) {
  const [summary, setSummary] = useState('')
  const [transcript, setTranscript] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [err, setErr] = useState('')
  const [keyPoints, setKeyPoints] = useState<string[]>([])
  const [rows, setRows] = useState<Row[]>([])
  const [projects, setProjects] = useState<Proj[]>([])
  const [projectId, setProjectId] = useState('')
  const [newProjectName, setNewProjectName] = useState('')
  const [creating, setCreating] = useState(false)
  const [analyzed, setAnalyzed] = useState(false)

  const approvers = employees.filter((e) => ['coo', 'ceo'].includes((e.role || '').toLowerCase()))
  const approverList = approvers.length ? approvers : employees

  useEffect(() => {
    supabase.from('projects').select('id, name').order('name').then(({ data }) => setProjects((data as Proj[]) ?? []))
  }, [])

  function matchEmp(name?: string | null): string {
    if (!name) return ''
    const n = name.trim().toLowerCase()
    return employees.find((e) => (e.full_name || '').toLowerCase() === n)?.id || ''
  }

  async function readFile(file: File | undefined, into: (v: string) => void) {
    if (!file) return
    if (/\.(txt|md|csv)$/i.test(file.name)) into(await file.text())
    else into((await file.text()).slice(0, 120000)) // fallback: đọc thô
  }

  async function analyze() {
    if (!summary.trim() && !transcript.trim()) { setErr('Dán/đưa nội dung tóm tắt hoặc bản ghi trước.'); return }
    setErr(''); setAnalyzing(true)
    try {
      const res = await fetch('/api/analyze-meeting', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ summary, transcript }),
      })
      const data = await res.json()
      if (!data.ok) { setErr(data.error || 'Phân tích lỗi.'); setAnalyzing(false); return }
      const r = data.result || {}
      setKeyPoints(Array.isArray(r.keyPoints) ? r.keyPoints : [])
      const tasks: AiTask[] = Array.isArray(r.tasks) ? r.tasks : []
      setRows(tasks.map((t) => ({
        title: t.title || '',
        ownerId: matchEmp(t.owner),
        deadline: t.deadline && t.deadline !== 'null' ? String(t.deadline) : '',
        approverId: approverList[0]?.id || '',
        note: [t.note, t.owner && !matchEmp(t.owner) ? `Đề xuất: ${t.owner}` : ''].filter(Boolean).join(' · '),
      })))
      setNewProjectName((cur) => cur || r?.project?.name || '')
      setAnalyzed(true)
    } catch {
      setErr('Không gọi được phân tích AI.')
    }
    setAnalyzing(false)
  }

  function patchRow(i: number, p: Partial<Row>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...p } : r)))
  }

  async function createAndSend() {
    if (rows.length === 0) return
    setCreating(true)
    let pid = projectId
    if (!pid) {
      const { data } = await supabase.from('projects').insert({
        name: (newProjectName || 'Dự án từ biên bản').trim(),
        status: 'in_progress', priority: 'medium', progress_percent: 0, issue_status: 'normal',
      }).select('id').maybeSingle()
      pid = (data as { id: string } | null)?.id || ''
    }
    for (const r of rows) {
      if (!r.title.trim()) continue
      const hasDeadline = Boolean(r.deadline)
      const { data: t } = await supabase.from('tasks').insert({
        title: r.title.trim(),
        description: r.note || null,
        parent_task_id: null,
        task_level: 'workstream',
        status: 'not_started',
        priority: 'medium',
        progress_percent: 0,
        due_date: null,
        assignee_id: r.ownerId || null,
        head_id: r.ownerId || null,
        head_ids: r.ownerId ? [r.ownerId] : [],
        project_id: pid || null,
        issue_status: 'normal',
        approval_status: 'not_submitted',
        proposed_deadline: r.deadline || null,
        deadline_approval_status: hasDeadline ? 'cho_duyet' : 'draft',
        deadline_submitter_id: currentEmployee?.id || null,
        deadline_approver_id: hasDeadline ? r.approverId || null : null,
        deadline_round: hasDeadline ? 1 : 0,
      }).select('id').maybeSingle()
      const taskId = (t as { id: string } | null)?.id
      if (taskId && hasDeadline) {
        await supabase.from('task_deadline_approval_log').insert({
          task_id: taskId, round: 1, submitter_id: currentEmployee?.id || null,
          proposed_deadline: r.deadline, approver_id: r.approverId || null, decision: 'submit',
        })
      }
    }
    setCreating(false)
    setRows([]); setKeyPoints([]); setAnalyzed(false); setSummary(''); setTranscript('')
    onCreated?.()
  }

  const inputCls = 'w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-2 py-1.5 text-sm outline-none focus:border-[var(--accent)]'

  return (
    <div className="flex flex-col gap-5">
      {/* Input Notex */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="font-extrabold">① Bảng tóm tắt (Notex AI)</p>
            <label className="cursor-pointer text-xs font-bold text-[var(--accent-hover)]">
              Tải file<input type="file" className="hidden" onChange={(e) => readFile(e.target.files?.[0], setSummary)} />
            </label>
          </div>
          <textarea className="min-h-32 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input)] p-3 text-sm outline-none" placeholder="Dán bảng tóm tắt cuộc họp Notex tạo..." value={summary} onChange={(e) => setSummary(e.target.value)} />
        </div>
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="font-extrabold">② Bản ghi (ai nói gì)</p>
            <label className="cursor-pointer text-xs font-bold text-[var(--accent-hover)]">
              Tải file<input type="file" className="hidden" onChange={(e) => readFile(e.target.files?.[0], setTranscript)} />
            </label>
          </div>
          <textarea className="min-h-32 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-input)] p-3 text-sm outline-none" placeholder="Dán bản ghi/transcript Notex..." value={transcript} onChange={(e) => setTranscript(e.target.value)} />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button type="button" onClick={analyze} disabled={analyzing}
          className="h-11 rounded-xl bg-[var(--accent)] px-6 text-sm font-extrabold text-[var(--on-accent)] disabled:opacity-40 hover:bg-[var(--accent-hover)]">
          {analyzing ? 'Đang phân tích...' : '✨ Phân tích & bóc đầu việc'}
        </button>
        {err && <span className="text-sm font-semibold text-[var(--danger)]">{err}</span>}
      </div>

      {/* Ý chính */}
      {analyzed && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <p className="mb-2 font-extrabold">Ý chính cần lưu ý</p>
          {keyPoints.length === 0 ? <p className="text-sm text-[var(--text-secondary)]">—</p> : (
            <ul className="list-disc space-y-1 pl-5 text-sm text-[var(--text-secondary)]">
              {keyPoints.map((k, i) => <li key={i}>{k}</li>)}
            </ul>
          )}
        </div>
      )}

      {/* Bảng đầu việc + deadline + duyệt */}
      {analyzed && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <p className="mb-3 font-extrabold">Đầu việc — nhập deadline & gửi duyệt</p>
          <div className="space-y-2">
            <div className="hidden grid-cols-[1.6fr_1fr_140px_1fr] gap-2 px-1 text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)] lg:grid">
              <span>Công việc được giao</span><span>Người phụ trách</span><span>Deadline</span><span>Gửi duyệt tới</span>
            </div>
            {rows.map((r, i) => (
              <div key={i} className="grid grid-cols-1 gap-2 rounded-xl bg-[var(--bg-surface)] p-2 lg:grid-cols-[1.6fr_1fr_140px_1fr]">
                <input className={inputCls} value={r.title} onChange={(e) => patchRow(i, { title: e.target.value })} />
                <select className={inputCls} value={r.ownerId} onChange={(e) => patchRow(i, { ownerId: e.target.value })}>
                  <option value="">— Chọn người —</option>
                  {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
                </select>
                <input type="date" className={inputCls} value={r.deadline} onChange={(e) => patchRow(i, { deadline: e.target.value })} />
                <select className={inputCls} value={r.approverId} onChange={(e) => patchRow(i, { approverId: e.target.value })}>
                  <option value="">— Cấp duyệt —</option>
                  {approverList.map((e) => <option key={e.id} value={e.id}>{e.full_name}{e.role ? ` (${e.role})` : ''}</option>)}
                </select>
                {r.note && <p className="text-xs text-[var(--text-muted)] lg:col-span-4">{r.note}</p>}
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <select className="h-10 rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-3 text-sm" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">+ Tạo dự án mới</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {!projectId && (
              <input className="h-10 flex-1 rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-3 text-sm" placeholder="Tên dự án mới" value={newProjectName} onChange={(e) => setNewProjectName(e.target.value)} />
            )}
            <button type="button" onClick={createAndSend} disabled={creating || rows.length === 0}
              className="h-10 rounded-xl bg-[var(--accent)] px-5 text-sm font-extrabold text-[var(--on-accent)] disabled:opacity-40 hover:bg-[var(--accent-hover)]">
              {creating ? 'Đang tạo...' : `Tạo & gửi duyệt (${rows.length})`}
            </button>
          </div>
          <p className="mt-2 text-xs text-[var(--text-muted)]">Dòng nào có Deadline sẽ được gửi cấp trên đã chọn để duyệt; dòng chưa có Deadline tạo ở trạng thái chờ người nhận tự nhập.</p>
        </div>
      )}
    </div>
  )
}
