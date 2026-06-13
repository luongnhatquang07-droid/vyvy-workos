'use client'

import React from 'react'

// ─── Trợ lý COO sống trong app ─────────────────────────────────────────────────
// Vào là thấy tóm tắt + việc nên làm trước + việc chờ duyệt + dự án rủi ro + quá tải.
// Tính hoàn toàn từ dữ liệu sẵn có (không cần LLM) → chạy ngay.

type ATask = {
  id: string
  title: string
  status: string | null
  due_date: string | null
  assignee_id: string | null
  head_id: string | null
  priority?: string | null
  project_id?: string | null
  deadline_approval_status?: string | null
  head_ids?: string[] | null
  deadline_approver_id?: string | null
}

type AProject = { id: string; name: string; rate?: number; health?: { level: string; label: string } }
type APerson = { employee: { id: string; full_name: string }; total: number; done: number; overdue: number; doing: number; pending: number }
type AEmp = { id: string; full_name: string }

type Props = {
  tasks: ATask[]
  projectCards: AProject[]
  peopleReports: APerson[]
  employees: AEmp[]
  currentEmployee: { id: string; full_name?: string | null; role?: string | null } | null
  onDailyReport?: () => void
  onFollowUpReport?: () => void
  onPeopleReport?: () => void
}

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function prank(p?: string | null): number {
  return p === 'high' ? 0 : p === 'medium' ? 1 : 2
}

export default function CooAssistantPanel(props: Props) {
  const me = props.currentEmployee
  const today = todayStr()
  const active = (t: ATask) => t.status !== 'completed' && t.status !== 'cancelled'
  const nameOf = (id: string | null) => props.employees.find((e) => e.id === id)?.full_name ?? '—'

  const mine = props.tasks.filter(
    (t) => active(t) && me && (t.assignee_id === me.id || t.head_id === me.id || (t.head_ids || []).includes(me.id)),
  )
  const myOverdue = mine.filter((t) => t.due_date && t.due_date.slice(0, 10) < today)
  const myDueToday = mine.filter((t) => t.due_date && t.due_date.slice(0, 10) === today)

  // Nên làm trước: trễ lâu nhất trước → việc hôm nay ưu tiên cao
  const ordered = [
    ...[...myOverdue].sort((a, b) => (a.due_date || '').localeCompare(b.due_date || '')),
    ...[...myDueToday].sort((a, b) => prank(a.priority) - prank(b.priority)),
  ].slice(0, 5)

  const waitingMyApproval = props.tasks.filter(
    (t) => active(t) && t.deadline_approval_status === 'cho_duyet' && me && t.deadline_approver_id === me.id,
  )

  const riskyProjects = props.projectCards.filter((p) => p.health && p.health.level !== 'normal')

  const overloaded = props.peopleReports
    .map((r) => ({ name: r.employee.full_name, load: (r.doing || 0) + (r.pending || 0) + (r.overdue || 0) }))
    .filter((r) => r.load > 5)
    .sort((a, b) => b.load - a.load)
    .slice(0, 5)

  const firstName = (me?.full_name || '').split(' ').slice(-1)[0] || 'bạn'

  return (
    <div className="flex flex-col gap-4">
      {/* Lời chào + tóm tắt */}
      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-card)] p-5">
        <p className="text-sm text-[var(--text-secondary)]">Chào {firstName}, đây là tình hình của bạn hôm nay:</p>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { k: 'Việc của tôi', v: mine.length },
            { k: 'Đến hạn hôm nay', v: myDueToday.length },
            { k: 'Đang trễ', v: myOverdue.length },
            { k: 'Chờ tôi duyệt', v: waitingMyApproval.length },
          ].map((m) => (
            <div key={m.k} className="rounded-[var(--radius)] bg-[var(--bg-surface)] px-3 py-2">
              <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">{m.k}</div>
              <div className="text-2xl font-extrabold text-[var(--text-primary)]">{m.v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Nên làm trước */}
      <Section title="Nên làm trước">
        {ordered.length === 0 ? (
          <Empty text="Không có việc gấp. Tốt!" />
        ) : (
          ordered.map((t, i) => (
            <Row key={t.id}>
              <span className="font-mono text-xs text-[var(--text-secondary)]">{i + 1}</span>
              <span className="flex-1 text-[var(--text-primary)]">{t.title}</span>
              <span className={`text-xs ${t.due_date && t.due_date.slice(0, 10) < today ? 'text-[var(--crit)]' : 'text-[var(--text-secondary)]'}`}>
                {t.due_date ? (t.due_date.slice(0, 10) < today ? `trễ · ${t.due_date.slice(0, 10)}` : 'hôm nay') : ''}
              </span>
            </Row>
          ))
        )}
      </Section>

      {/* Chờ tôi duyệt */}
      {waitingMyApproval.length > 0 && (
        <Section title="Đang chờ bạn duyệt deadline">
          {waitingMyApproval.slice(0, 6).map((t) => (
            <Row key={t.id}>
              <span className="flex-1 text-[var(--text-primary)]">{t.title}</span>
              <span className="text-xs text-[var(--text-secondary)]">gửi bởi {nameOf(t.assignee_id || t.head_id)}</span>
            </Row>
          ))}
        </Section>
      )}

      {/* Dự án rủi ro */}
      {riskyProjects.length > 0 && (
        <Section title="Dự án cần chú ý">
          {riskyProjects.slice(0, 6).map((p) => (
            <Row key={p.id}>
              <span className="flex-1 text-[var(--text-primary)]">{p.name}</span>
              <span className={`text-xs ${p.health?.level === 'problem' ? 'text-[var(--crit)]' : 'text-[var(--warn)]'}`}>
                {p.health?.label}{typeof p.rate === 'number' ? ` · ${p.rate}%` : ''}
              </span>
            </Row>
          ))}
        </Section>
      )}

      {/* Quá tải */}
      {overloaded.length > 0 && (
        <Section title="Cảnh báo quá tải (>5 việc đang mở)">
          {overloaded.map((r) => (
            <Row key={r.name}>
              <span className="flex-1 text-[var(--text-primary)]">{r.name}</span>
              <span className="text-xs text-[var(--warn)]">{r.load} việc</span>
            </Row>
          ))}
        </Section>
      )}

      {/* Nút nhanh */}
      <div className="flex flex-wrap gap-2 pt-1">
        {props.onDailyReport && <Quick onClick={props.onDailyReport} label="Báo cáo hôm nay" />}
        {props.onFollowUpReport && <Quick onClick={props.onFollowUpReport} label="Việc cần hối thúc" />}
        {props.onPeopleReport && <Quick onClick={props.onPeopleReport} label="Báo cáo theo người" />}
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-card)] p-4">
      <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">{title}</p>
      <div className="flex flex-col">{children}</div>
    </div>
  )
}
function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-3 border-t border-[var(--border)] py-2 text-sm first:border-t-0">{children}</div>
}
function Empty({ text }: { text: string }) {
  return <p className="py-2 text-sm text-[var(--text-secondary)]">{text}</p>
}
function Quick({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-[var(--border)] bg-[var(--bg-card)] px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
    >
      {label}
    </button>
  )
}
