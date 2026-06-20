'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { SOLO_PILOT_MODE } from '@/lib/config'
import { displayLoginIdentifier } from '@/lib/internal-auth'
import DeadlineBlock from '@/components/DeadlineBlock'
import CooAssistantPanel from '@/components/CooAssistantPanel'
import HeadPicker from '@/components/HeadPicker'
import PersonPicker from '@/components/PersonPicker'
import MeetingHistory from '@/components/MeetingHistory'
import MeetingStudio from '@/components/MeetingStudio'
import MyDeadlineInbox from '@/components/MyDeadlineInbox'
import {
  ListTodo,
  ChevronRight,
  Search,
  LogOut,
  AlertTriangle,
  Download,
  Clock,
  RefreshCw,
  AlertCircle,
  Shield,
  Flag,
} from 'lucide-react'

// --- Module-level toast (no prop drilling needed) ---------------------------
type ToastType = 'success' | 'error' | 'info' | 'warning'
type ToastItem = { id: string; message: string; type: ToastType }
let _showToast: ((msg: string, type?: ToastType) => void) | null = null
function toast(msg: string, type: ToastType = 'success') { _showToast?.(msg, type) }

// --- Module-level confirm dialog (thay window.confirm) ----------------------
let _confirm: ((msg: string) => Promise<boolean>) | null = null
function confirmDialog(msg: string): Promise<boolean> {
  return _confirm ? _confirm(msg) : Promise.resolve(window.confirm(msg))
}

// ─── Gửi email thông báo (fire-and-forget, không block UI) ───────────────────
import type { NotifyEmailPayload } from '@/app/api/notify-email/route'
async function sendNotifyEmail(payload: NotifyEmailPayload) {
  try {
    await fetch('/api/notify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch {
    // Email là best-effort — không throw
  }
}

// ─── Gửi Web Push notification (fire-and-forget) ─────────────────────────────
async function sendPush(employeeIds: string[], title: string, body: string, url = '/') {
  if (!employeeIds.length) return
  try {
    await fetch('/api/push-send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employeeIds, title, body, url, tag: 'workos' }),
    })
  } catch {
    // best-effort
  }
}

// ─── Gửi thông báo trong app (bảng notifications) ───────────────────────────
async function pushNotify(rows: Array<{
  recipient_id: string
  actor_id?: string | null
  type?: string
  title: string
  body?: string | null
  task_id?: string | null
  project_id?: string | null
}>) {
  const valid = rows.filter((r) => r.recipient_id)
  if (valid.length === 0) return
  try {
    const res = await fetch('/api/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(valid.map((r) => ({ type: 'info', ...r }))),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      console.error('pushNotify failed:', err)
    }
  } catch (e) {
    console.error('pushNotify error:', e)
  }
}

// ─── Đánh dấu deadline đã chốt (committed) sau khi tạo/import task ───────────
// Best-effort: nếu DB chưa migrate (chưa có cột deadline_*), update lỗi nhưng
// KHÔNG ảnh hưởng việc tạo task (insert đã xong trước đó).
async function commitDeadlineMeta(
  taskId: string,
  dueDate: string | null | undefined,
  source: 'manual' | 'import' | 'meeting' | 'project_milestone',
) {
  if (!taskId) return
  const patch = dueDate
    ? { deadline_status: 'committed', deadline_source: source, original_deadline: dueDate, deadline_locked: true }
    : { deadline_status: 'no_deadline' }
  const { error } = await supabase.from('tasks').update(patch).eq('id', taskId)
  if (error) console.warn('commitDeadlineMeta skipped (chưa migrate?):', error.message)
}

type DbMutationError = { message?: string | null; details?: string | null; hint?: string | null; code?: string | null }
type DbPayload = Record<string, unknown>

function isSchemaCacheColumnError(error: DbMutationError | null | undefined, tableName: string) {
  if (!error) return false
  const text = [error.message, error.details, error.hint, error.code].filter(Boolean).join(' ')
  return text.includes('schema cache') && text.includes(tableName) && text.includes('Could not find')
}

const TASK_STEP_MATRIX_COLUMNS = [
  'department_approver_id',
  'coo_approver_id',
  'ceo_approver_id',
  'requires_coo_approval',
  'requires_ceo_approval',
  'approval_stage',
  'department_approval_status',
  'coo_approval_status',
  'ceo_approval_status',
  'department_approval_note',
  'coo_approval_note',
  'ceo_approval_note',
  'department_approved_at',
  'coo_approved_at',
  'ceo_approved_at',
  'step_deadline_status',
  'step_proposed_deadline',
  'step_deadline_approver_id',
  'step_deadline_note',
  'step_in_progress',
  'step_deadline_submitted_at',
  'step_deadline_approved_at',
  'step_started_at',
  'supporter_ids',
  'approver_ids',
]

function toLegacyTaskStepPayload(payload: DbPayload) {
  const next = { ...payload }
  if (!next.approver_id && typeof next.department_approver_id === 'string') {
    next.approver_id = next.department_approver_id
  }
  TASK_STEP_MATRIX_COLUMNS.forEach((key) => {
    delete next[key]
  })
  return next
}

async function insertTaskStepsCompat(payload: DbPayload | DbPayload[]) {
  const result = await supabase.from('task_steps').insert(payload)
  if (!isSchemaCacheColumnError(result.error, 'task_steps')) return result

  const fallback = Array.isArray(payload)
    ? payload.map((item) => toLegacyTaskStepPayload(item))
    : toLegacyTaskStepPayload(payload)

  return supabase.from('task_steps').insert(fallback)
}

async function updateTaskStepCompat(stepId: string, patch: DbPayload) {
  const result = await supabase.from('task_steps').update(patch).eq('id', stepId)
  if (!isSchemaCacheColumnError(result.error, 'task_steps')) return result

  return supabase.from('task_steps').update(toLegacyTaskStepPayload(patch)).eq('id', stepId)
}

type Department = {
  id: string
  code: string
  name: string
}

type RolePermission = {
  id: string
  role: string
  resource: string   // 'project' | 'workstream' | 'subtask' | 'step' | 'import' | 'export' | 'admin_panel'
  action: string     // 'view' | 'create' | 'edit' | 'delete' | 'approve' | 'use'
  scope: string      // 'all' | 'own_dept' | 'assigned' | 'none'
}

type Employee = {
  id: string
  full_name: string
  email?: string | null
  position: string | null
  role?: string | null
  is_department_head?: boolean | null
  can_view_all?: boolean | null
  can_manage_users?: boolean | null
  can_manage_tasks?: boolean | null
  can_manage_department_tasks?: boolean | null
  status?: string | null
  department_id?: string | null
  auth_user_id?: string | null
}

type Project = {
  id: string
  name: string
  code: string | null
  description: string | null
  owner_id: string | null
  member_ids?: string[] | null
  watcher_ids?: string[] | null
  approver_ids?: string[] | null
  department_id: string | null
  status: string | null
  priority: string | null
  progress_percent: number | null
  issue_status?: string | null
}

type ProjectHealth = {
  level: 'empty' | 'not_started' | 'normal' | 'watch' | 'problem'
  label: string
  overdueTasks: number
  pendingTasks: number
  problemTasks: number
  slowTasks: number
  pendingSteps: number
  revisionSteps: number
  supportRequests: number
  missingReports: number
  overdueSteps: number
  missingDeadlineTasks: number
  totalWarnings: number
}

type ProjectCard = Project & {
  total: number
  done: number
  overdue: number
  problem: number
  rate: number
  health: ProjectHealth
}

type ProjectSpec = {
  id: string
  project_id: string
  title: string | null
  north_star: string | null
  objectives: string | null
  operating_model: string | null
  data_architecture: string | null
  kpis: string | null
  risks: string | null
  decisions: string | null
  governance: string | null
  notes: string | null
  raw_sections: string | null
  version: string | null
  created_at?: string | null
}

type ExecutionItem = {
  id: string
  execution_tracker_id: string
  workstream: string | null
  layer: string | null
  phase: string | null
  title: string
  owner: string | null
  status: string | null
  note: string | null
  is_critical_path: boolean
  order_index: number
}

type ExecutionTracker = {
  id: string
  project_id: string
  stage: string | null
  phases: string | null
  module_readiness: string | null
  decisions_needed: string | null
  build_needed: string | null
  top3_actions: string | null
  critical_path: string | null
  created_at?: string | null
  items?: ExecutionItem[]
}

type Task = {
  id: string
  title: string
  description: string | null
  status: string
  priority: string
  progress_percent: number | null
  due_date: string | null
  department_id: string | null
  assignee_id: string | null
  project_id: string | null
  parent_task_id: string | null
  task_level: string | null
  head_id: string | null
  head_ids: string[] | null
  co_owner_ids?: string[] | null
  supporter_ids?: string[] | null
  reviewer_ids?: string[] | null
  watcher_ids?: string[] | null
  approver_ids?: string[] | null
  issue_status: string | null
  sequential_steps?: boolean | null
  created_at?: string | null
  // ── Deadline committed + gia hạn (002_deadline_extension.sql) ──
  deadline_status?: string | null          // committed | extension_requested | extension_approved | extension_rejected | no_deadline
  deadline_source?: string | null          // meeting | manual | import | project_milestone
  original_deadline?: string | null
  requested_deadline?: string | null
  deadline_change_count?: number | null
  deadline_locked?: boolean | null
  deadline_submitter_id?: string | null
  deadline_approver_id?: string | null
  deadline_reason?: string | null
  deadline_decided_by?: string | null
  deadline_decided_at?: string | null
  // -- Meeting session link (008_task_meeting_session_link.sql) --
  meeting_session_id?: string | null
}

type TaskStep = {
  id: string
  task_id: string
  step_title: string
  step_order: number
  is_done: boolean
  owner_id: string | null
  approver_id: string | null
  due_date: string | null
  note: string | null
  approval_status: string | null
  approval_note: string | null
  submitted_at: string | null
  approved_at: string | null
  department_approver_id: string | null
  coo_approver_id: string | null
  ceo_approver_id: string | null
  requires_coo_approval: boolean | null
  requires_ceo_approval: boolean | null
  approval_stage: string | null
  department_approval_status: string | null
  coo_approval_status: string | null
  ceo_approval_status: string | null
  department_approval_note: string | null
  coo_approval_note: string | null
  ceo_approval_note: string | null
  department_approved_at: string | null
  coo_approved_at: string | null
  ceo_approved_at: string | null
  description: string | null
  report_file_url: string | null
  report_file_name: string | null
  report_link: string | null
  support_request: string | null
  step_deadline_status: string | null
  step_proposed_deadline: string | null
  step_deadline_approver_id: string | null
  step_deadline_note: string | null
  step_in_progress: boolean
  step_deadline_submitted_at: string | null
  step_deadline_approved_at: string | null
  step_started_at: string | null
  supporter_ids?: string[] | null
  approver_ids?: string[] | null
}

type TaskSupporter = {
  id: string
  task_id: string
  employee_id: string
  role_note: string | null
  employees?: {
    id: string
    full_name: string
  } | null
}

type PeopleReport = {
  employee: Employee
  total: number
  done: number
  doing: number
  pending: number
  overdue: number
  problem: number
  rate: number
  main: number
  coOwned: number
  supported: number
  approvals: number
  weighted: number
  assigned: number
  assignedDone: number
  assignedDoing: number
  assignedOverdue: number
  assignedTasks: Task[]
}

type TaskReport = {
  id: string
  task_id: string
  file_name: string
  file_url: string
  file_type: string | null
  uploaded_by: string | null
  note: string | null
  created_at: string
}

type StepComment = {
  id: string
  step_id: string
  employee_id: string | null
  comment: string
  comment_type: string
  created_at: string
  employees?: {
    full_name: string
  } | null
}

type AddStepComment = (stepId: string, content?: string, type?: string, mentionedEmployeeIds?: string[]) => void

type ViewKey = 'dashboard' | 'coo' | 'projects' | 'calendar' | 'assigned' | 'tasks' | 'meeting' | 'recurring' | 'automation' | 'assistant' | 'admin' | 'feedback' | 'import' | 'history' | 'permissions'

// Deep-link target for COO Board — từ alert/notification nhảy đúng item
type CooTarget = {
  projectId?: string | null
  workstreamId?: string | null   // ID của đầu việc lớn (task_level=workstream)
  taskId?: string | null         // ID của đầu việc con
  highlightId?: string | null    // ID cần scroll + highlight (thường = taskId || workstreamId)
}

type PrepChecklistItem = {
  id: string
  text: string
  done: boolean
  owner_id?: string | null
  note?: string | null
}

type RecurringTask = {
  id: string
  title: string
  description: string | null
  kind: string            // 'meeting' | 'report' | 'task'
  frequency: string       // 'daily' | 'weekly' | 'monthly'
  weekday: number | null  // 0=CN .. 6=T7
  month_day: number | null
  time_of_day: string     // 'HH:mm' — giờ diễn ra / hạn nộp kết quả
  assignee_id: string | null
  recipient_ids?: string[] | null
  remind_days_before: number
  remind_minutes_before: number
  is_active: boolean
  notified_early_for: string | null
  notified_near_for: string | null
  created_by: string | null
  created_at: string
  // Upgrade v2
  host_id?: string | null
  observer_ids?: string[] | null
  participant_ids?: string[] | null
  department_id?: string | null
  department_ids?: string[] | null
  objective?: string | null
  agenda?: string | null
  preparation_checklist?: PrepChecklistItem[] | null
  prep_resources?: { name: string; url: string }[] | null
  related_task_ids?: string[] | null
}

type RecurringTaskForm = {
  id: string | null
  title: string
  description: string
  recap: string
  prepFiles: string
  meetingHistory: string
  kind: string
  frequency: string
  weekday: string
  month_day: string
  time_of_day: string
  assignee_ids: string[]
  remind_days_before: string
  remind_minutes_before: string
  // v2 fields
  host_id: string
  department_ids: string[]
  participant_ids: string[]
  observer_ids: string[]
  objective: string
  agenda: string
  preparation_checklist: PrepChecklistItem[]
}

type RecurringRun = {
  id: string
  source: string
  status: string
  scanned: number | null
  notifications_sent: number | null
  detail: {
    scanned?: number
    notificationsSent?: number
    error?: string
    reminders?: Array<{ title: string; kind: string; occurrence: string }>
  } | null
  started_at: string
  finished_at: string | null
  triggered_by: string | null
}

type RecurringRunResult = {
  ok?: boolean
  source?: string
  timeZone?: string
  now?: string
  scanned?: number
  notificationsSent?: number
  error?: string
  reminders?: Array<{ title: string; kind: string; occurrence: string }>
}

type RecurringMeetingFile = {
  id: string
  recurring_task_id: string
  meeting_session_id?: string | null
  meeting_date: string | null
  title: string | null
  file_name: string
  file_url: string
  file_type: string | null
  note: string | null
  uploaded_by: string | null
  created_at: string
}

type MeetingFileDraft = {
  title: string
  fileUrl: string
  note: string
  meetingDate: string
}

type MeetingSession = {
  id: string
  schedule_id: string
  title: string | null
  occurred_at: string            // date string 'YYYY-MM-DD'
  start_time: string | null
  end_time: string | null
  status: 'planned' | 'completed' | 'skipped' | 'cancelled'
  host_id: string | null
  department_ids: string[]
  participant_ids: string[]
  recap: string | null
  minutes_url: string | null
  minutes_file_id: string | null
  decisions: { text: string; owner?: string }[]
  pending_issues: { text: string; owner?: string }[]
  action_items: { text: string; owner_id?: string; due_date?: string; done?: boolean }[]
  linked_task_ids: string[]
  prep_checklist_snapshot: PrepChecklistItem[]
  prep_resources_snapshot: { name: string; url: string }[]
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  // Reschedule fields (migration 010)
  original_occurred_at?: string | null   // original date before rescheduling
  original_start_time?: string | null    // original start time before rescheduling
  reschedule_reason?: string | null
  rescheduled_by?: string | null
}

const SESSION_STATUS_LABEL: Record<MeetingSession['status'], string> = {
  planned: 'Dự kiến',
  completed: 'Đã họp',
  skipped: 'Bỏ qua',
  cancelled: 'Huỷ',
}
const SESSION_STATUS_CLS: Record<MeetingSession['status'], string> = {
  planned: 'border-blue-200 bg-blue-50 text-blue-600',
  completed: 'border-[var(--success)]/30 bg-[var(--success-soft)] text-[var(--success)]',
  skipped: 'border-slate-200 bg-slate-50 text-slate-500',
  cancelled: 'border-[var(--danger)]/30 bg-[var(--danger-soft)] text-[var(--danger)]',
}

const WEEKDAY_LABELS = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7']
const DEFAULT_RECURRING_FORM: RecurringTaskForm = {
  id: null,
  title: '',
  description: '',
  recap: '',
  prepFiles: '',
  meetingHistory: '',
  kind: 'task',
  frequency: 'weekly',
  weekday: '1',
  month_day: '1',
  time_of_day: '09:00',
  assignee_ids: [],
  remind_days_before: '2',
  remind_minutes_before: '60',
  host_id: '',
  department_ids: [],
  participant_ids: [],
  observer_ids: [],
  objective: '',
  agenda: '',
  preparation_checklist: [],
}
const DEFAULT_MEETING_FILE_DRAFT: MeetingFileDraft = {
  title: '',
  fileUrl: '',
  note: '',
  meetingDate: '',
}

const RECAP_SECTION_LABEL = 'RECAP cuộc họp trước đó:'
const FILES_SECTION_LABEL = 'File cần chuẩn bị:'
const HISTORY_SECTION_LABEL = 'Lịch sử họp:'

const DEFAULT_PERFORMANCE_RECAP = `- Tổng hợp các quyết định đã chốt trong buổi họp Performance gần nhất.
- Rà lại action items, người phụ trách, deadline và trạng thái hoàn thành.
- Ghi rõ vấn đề còn tồn đọng, nguyên nhân và việc cần follow-up tiếp.`

const DEFAULT_PERFORMANCE_FILES = `- File recap/biên bản cuộc họp Performance trước đó.
- Báo cáo KPI/Performance tuần gần nhất.
- Bảng tiến độ mục tiêu/OKR hoặc các chỉ số vận hành liên quan.
- Danh sách action items tuần trước và trạng thái từng đầu việc.
- Các file số liệu, dashboard, bằng chứng hoặc link báo cáo cần trình trong cuộc họp.`

const DEFAULT_PERFORMANCE_HISTORY = `- Chưa có lịch sử họp.
- Sau mỗi buổi họp, ghi ngày họp, nội dung đã chốt, người phụ trách và việc cần follow-up.`

const PERFORMANCE_MEETING_ID = '7d8c552a-50a5-4ba3-86ac-2e6aa9467710'

const PERFORMANCE_MEETING_DESCRIPTION = composeMeetingDescription(
  'Họp Performance định kỳ thứ 7 hằng tuần lúc 10:00.',
  DEFAULT_PERFORMANCE_RECAP,
  DEFAULT_PERFORMANCE_FILES,
  DEFAULT_PERFORMANCE_HISTORY
)

function parseMeetingDescription(description: string | null | undefined) {
  const text = (description || '').trim()
  const labels = [RECAP_SECTION_LABEL, FILES_SECTION_LABEL, HISTORY_SECTION_LABEL]
  const positions = labels
    .map((label) => ({ label, index: text.indexOf(label) }))
    .filter((item) => item.index >= 0)
    .sort((a, b) => a.index - b.index)

  function section(label: string) {
    const currentIndex = positions.findIndex((item) => item.label === label)
    if (currentIndex < 0) return ''
    const current = positions[currentIndex]
    const next = positions[currentIndex + 1]
    const start = current.index + current.label.length
    const end = next ? next.index : text.length
    return text.slice(start, end).trim()
  }

  const note = positions[0] ? text.slice(0, positions[0].index).trim() : text

  return {
    note,
    recap: section(RECAP_SECTION_LABEL),
    prepFiles: section(FILES_SECTION_LABEL),
    meetingHistory: section(HISTORY_SECTION_LABEL),
  }
}

function composeMeetingDescription(note: string, recap: string, prepFiles: string, meetingHistory: string) {
  const cleanNote = note.trim()
  return [
    cleanNote,
    `${RECAP_SECTION_LABEL}\n${recap.trim() || '- Chưa cập nhật recap cuộc họp trước.'}`,
    `${FILES_SECTION_LABEL}\n${prepFiles.trim() || '- Chưa cập nhật file cần chuẩn bị.'}`,
    `${HISTORY_SECTION_LABEL}\n${meetingHistory.trim() || '- Chưa có lịch sử họp.'}`,
  ].filter(Boolean).join('\n\n')
}

function defaultPerformanceMeeting(assigneeId?: string | null): RecurringTask {
  return {
    id: PERFORMANCE_MEETING_ID,
    title: 'Họp Performance',
    description: PERFORMANCE_MEETING_DESCRIPTION,
    kind: 'meeting',
    frequency: 'weekly',
    weekday: 6,
    month_day: null,
    time_of_day: '10:00',
    assignee_id: assigneeId || null,
    recipient_ids: assigneeId ? [assigneeId] : [],
    remind_days_before: 2,
    remind_minutes_before: 60,
    is_active: true,
    notified_early_for: null,
    notified_near_for: null,
    created_by: null,
    created_at: '2026-06-12T00:00:00.000Z',
  }
}

function recurringRecipientIds(task: RecurringTask): string[] {
  const ids = new Set<string>()
  ;(task.recipient_ids || []).forEach((id) => { if (id) ids.add(id) })
  if (task.assignee_id) ids.add(task.assignee_id)
  return Array.from(ids)
}

// Lần diễn ra kế tiếp của một việc định kỳ (theo giờ máy thật)
function nextOccurrence(rt: RecurringTask, from = new Date()): Date {
  const [h, m] = (rt.time_of_day || '09:00').split(':').map(Number)
  const candidate = new Date(from)
  candidate.setHours(h, m, 0, 0)

  if (rt.frequency === 'daily') {
    if (candidate <= from) candidate.setDate(candidate.getDate() + 1)
    return candidate
  }
  if (rt.frequency === 'weekly') {
    const target = rt.weekday ?? 1
    let diff = (target - candidate.getDay() + 7) % 7
    if (diff === 0 && candidate <= from) diff = 7
    candidate.setDate(candidate.getDate() + diff)
    return candidate
  }
  // monthly
  const day = Math.min(rt.month_day ?? 1, 28)
  candidate.setDate(day)
  if (candidate <= from) candidate.setMonth(candidate.getMonth() + 1, day)
  return candidate
}

function formatOccurrence(d: Date): string {
  return `${WEEKDAY_LABELS[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1} · ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function occurrenceKey(rt: RecurringTask, occ: Date): string {
  return `${occ.getFullYear()}-${String(occ.getMonth() + 1).padStart(2, '0')}-${String(occ.getDate()).padStart(2, '0')}T${rt.time_of_day}`
}

function minutesUntil(occ: Date, from: Date): number {
  return Math.max(0, Math.ceil((occ.getTime() - from.getTime()) / 60_000))
}

function formatTimeLeft(occ: Date, from: Date): string {
  const totalMinutes = minutesUntil(occ, from)
  if (totalMinutes < 60) return `Còn ${totalMinutes} phút`
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours < 24) return minutes > 0 ? `Còn ${hours} giờ ${minutes} phút` : `Còn ${hours} giờ`
  const days = Math.floor(hours / 24)
  const restHours = hours % 24
  return restHours > 0 ? `Còn ${days} ngày ${restHours} giờ` : `Còn ${days} ngày`
}

function recurringKindLabel(kind: string): string {
  if (kind === 'meeting') return 'Cuộc họp'
  if (kind === 'report') return 'Báo cáo'
  return 'Đầu việc'
}

function recurringFrequencyLabel(task: RecurringTask): string {
  if (task.frequency === 'daily') return 'Hằng ngày'
  if (task.frequency === 'monthly') return `Hằng tháng, ngày ${task.month_day || 1}`
  return `Hằng tuần, ${WEEKDAY_LABELS[task.weekday ?? 1]}`
}

function recurringAlertState(task: RecurringTask, now: Date): { label: string; tone: 'red' | 'amber' | 'green' } {
  const occ = nextOccurrence(task, now)
  const mins = minutesUntil(occ, now)
  if (mins <= task.remind_minutes_before) return { label: 'Sắp tới giờ', tone: 'red' }
  if ((task.frequency === 'weekly' || task.frequency === 'monthly') && mins <= task.remind_days_before * 24 * 60) {
    return { label: 'Cần chuẩn bị', tone: 'amber' }
  }
  return { label: 'Đang theo dõi', tone: 'green' }
}

function isLocalRecurringTask(task: RecurringTask): boolean {
  return task.id.startsWith('default-') || task.id.startsWith('local-')
}

function meetingTextLines(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

type SubtaskForm = {
  title: string
  description: string
  departmentId: string
  headId: string
  headIds: string[]
  assigneeId: string
  coOwnerIds: string[]
  supporterIds: string[]
  reviewerIds: string[]
  watcherIds: string[]
  dueDate: string
  priority: string
}

type StepForm = {
  title: string
  description: string
  ownerId: string
  supporterIds: string[]
  approverId: string
  approverIds: string[]
  dueDate: string
}

// --- Structured meeting recap ------------------------------------------------
type MeetingMetric = { label: string; value: string; badge: string }
type MeetingIssue = {
  id: string
  source: string
  status: 'urgent' | 'ok' | 'hard' | 'pending'
  detail: string
}
type MeetingAssignment = {
  id: string
  personId: string
  personName: string
  tasks: string
  deadline: string
}
type MeetingRecap = {
  date: string
  platforms: string
  metrics: [MeetingMetric, MeetingMetric, MeetingMetric]
  issues: MeetingIssue[]
  focuses: [string, string]
  directions: string[]
  directionNote: string
  assignments: MeetingAssignment[]
  quote: string
  notes: string
}

const DEFAULT_MEETING_RECAP: MeetingRecap = {
  date: '',
  platforms: '',
  metrics: [
    { label: 'Chỉ số chính', value: '', badge: '' },
    { label: 'Tình trạng doanh số', value: '', badge: '' },
    { label: 'Nguyên nhân chính', value: '', badge: '' },
  ],
  issues: [],
  focuses: ['', ''],
  directions: [],
  directionNote: '',
  assignments: [],
  quote: '',
  notes: '',
}

type NotexRow = {
  id: string
  workstreamTitle: string
  subtaskTitle: string
  responsibility: string
  expectedOutput: string
  departmentId: string
  headId: string
  assigneeId: string
  coOwnerIds: string[]
  supporterIds: string[]
  reviewerIds: string[]
  dueDate: string
  priority: string
}

type AppNotification = {
  id: string
  recipient_id: string
  actor_id: string | null
  type: string
  title: string
  body: string | null
  task_id: string | null
  project_id: string | null
  is_read: boolean
  created_at: string
}

function notificationVisual(n: AppNotification) {
  const text = `${n.type || ''} ${n.title || ''} ${n.body || ''}`.toLowerCase()
  if (text.includes('gia hạn') || text.includes('deadline')) {
    return { label: 'Deadline', cls: 'bg-[var(--warning-soft)] text-[var(--warning)]', dot: 'bg-[var(--warning)]' }
  }
  if (text.includes('duyệt') || text.includes('từ chối') || text.includes('trả lại')) {
    return { label: 'Duyệt', cls: 'bg-[var(--success-soft)] text-[var(--success)]', dot: 'bg-[var(--success)]' }
  }
  if (text.includes('tag') || text.includes('@') || text.includes('comment') || text.includes('bình luận')) {
    return { label: 'Tag', cls: 'bg-[var(--accent-soft)] text-[var(--olive)]', dot: 'bg-[var(--lime)]' }
  }
  if (text.includes('trễ') || text.includes('overdue')) {
    return { label: 'Trễ hạn', cls: 'bg-[var(--danger-soft)] text-[var(--danger)]', dot: 'bg-[var(--danger)]' }
  }
  if (text.includes('giao') || text.includes('assignment')) {
    return { label: 'Giao việc', cls: 'bg-[var(--bg-surface)] text-[var(--olive)]', dot: 'bg-[var(--olive)]' }
  }
  if (n.type === 'recurring_reminder') {
    return { label: 'Định kỳ', cls: 'bg-[var(--bg-surface)] text-[var(--text-secondary)]', dot: 'bg-[var(--olive)]' }
  }
  return { label: 'Thông báo', cls: 'bg-[var(--bg-surface)] text-[var(--text-secondary)]', dot: 'bg-[var(--text-muted)]' }
}

function uniqueIds(...groups: Array<Array<string | null | undefined> | null | undefined>) {
  const ids = new Set<string>()
  groups.forEach((group) => {
    ;(group || []).forEach((id) => {
      if (id) ids.add(id)
    })
  })
  return Array.from(ids)
}

function idsWithout(ids: string[], ...blocked: Array<string | null | undefined>) {
  const blockedSet = new Set(blocked.filter(Boolean) as string[])
  return uniqueIds(ids).filter((id) => !blockedSet.has(id))
}

function taskHeadIds(task: Task) {
  return uniqueIds(task.head_ids || [], task.head_id ? [task.head_id] : [])
}

function taskCoOwnerIds(task: Task) {
  return idsWithout(task.co_owner_ids || [], task.assignee_id, ...taskHeadIds(task))
}

function taskSupporterIds(task: Task, supporterRows: TaskSupporter[] = []) {
  return idsWithout([
    ...(task.supporter_ids || []),
    ...supporterRows.map((supporter) => supporter.employee_id),
  ], task.assignee_id, ...taskHeadIds(task))
}

function taskApproverIds(task: Task) {
  return idsWithout([
    ...(task.approver_ids || []),
    ...(task.reviewer_ids || []),
    task.deadline_approver_id || '',
  ], task.assignee_id)
}

function taskWatcherIds(task: Task) {
  return idsWithout(task.watcher_ids || [], task.assignee_id, ...taskHeadIds(task))
}

function taskParticipantIds(task: Task, supporterRows: TaskSupporter[] = []) {
  return uniqueIds(
    task.assignee_id ? [task.assignee_id] : [],
    taskHeadIds(task),
    taskCoOwnerIds(task),
    taskSupporterIds(task, supporterRows),
    taskApproverIds(task),
    taskWatcherIds(task),
  )
}

function projectParticipantIds(project: Project) {
  return uniqueIds(
    project.owner_id ? [project.owner_id] : [],
    project.member_ids || [],
    project.watcher_ids || [],
    project.approver_ids || [],
  )
}

function stepApproverIds(step: TaskStep) {
  return uniqueIds(
    step.approver_ids || [],
    step.approver_id ? [step.approver_id] : [],
    step.department_approver_id ? [step.department_approver_id] : [],
    step.coo_approver_id ? [step.coo_approver_id] : [],
    step.ceo_approver_id ? [step.ceo_approver_id] : [],
  )
}

function stepParticipantIds(step: TaskStep) {
  return uniqueIds(
    step.owner_id ? [step.owner_id] : [],
    step.supporter_ids || [],
    stepApproverIds(step),
  )
}

function peopleLabel(ids: string[], employeeMap: Map<string, Employee>, empty = 'Chưa gắn', limit = 3) {
  const names = uniqueIds(ids)
    .map((id) => employeeMap.get(id)?.full_name)
    .filter((name): name is string => Boolean(name))
  if (names.length === 0) return empty
  if (names.length <= limit) return names.join(', ')
  return `${names.slice(0, limit).join(', ')} +${names.length - limit}`
}

function taskRoleForEmployee(task: Task, employeeId: string, supporterRows: TaskSupporter[] = []) {
  if (!employeeId) return ''
  if (task.assignee_id === employeeId) return 'Chính'
  if (taskCoOwnerIds(task).includes(employeeId)) return 'Đồng phụ trách'
  if (taskSupporterIds(task, supporterRows).includes(employeeId)) return 'Hỗ trợ'
  if (taskApproverIds(task).includes(employeeId) || taskHeadIds(task).includes(employeeId)) return 'Duyệt/Lead'
  if (taskWatcherIds(task).includes(employeeId)) return 'Theo dõi'
  return 'Liên quan'
}

function weightedTaskLoad(task: Task, employeeId: string, supporterRows: TaskSupporter[] = []) {
  if (task.assignee_id === employeeId) return 1
  if (taskCoOwnerIds(task).includes(employeeId)) return 0.7
  if (taskSupporterIds(task, supporterRows).includes(employeeId)) return 0.3
  return 0
}

// --- SVG Icon Library ---------------------------------------------------------
function Ico({ d, size = 16, className = '' }: { d: string | string[]; size?: number; className?: string }) {
  const paths = Array.isArray(d) ? d : [d]
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
      {paths.map((path, i) => <path key={i} d={path} />)}
    </svg>
  )
}
function IcoCircle({ d, size = 16, className = '' }: { d: string | string[]; size?: number; className?: string }) {
  const paths = Array.isArray(d) ? d : [d]
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="10" />
      {paths.map((path, i) => <path key={i} d={path} />)}
    </svg>
  )
}

// Icon paths
const IC = {
  chevronRight: 'M9 18l6-6-6-6',
  chevronDown: 'M6 9l6 6 6-6',
  check: 'M20 6L9 17l-5-5',
  x: 'M18 6 6 18M6 6l12 12',
  plus: 'M12 5v14M5 12h14',
  trash: ['M3 6h18', 'M8 6V4h8v2', 'M19 6l-1 14H6L5 6'],
  search: ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z', 'M21 21l-4.35-4.35'],
  bell: ['M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9', 'M13.73 21a2 2 0 0 1-3.46 0'],
  menu: ['M4 6h16', 'M4 12h16', 'M4 18h16'],
  warning: ['M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z', 'M12 9v4', 'M12 17h.01'],
  info: ['M12 8h.01', 'M12 12v4'],
  clipboard: ['M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2', 'M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v0a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2z'],
  checkCircle: 'M9 12l2 2 4-4',
  clock: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z', 'M12 6v6l4 2'],
  zap: 'M13 2 3 14h9l-1 8 10-12h-9l1-8z',
  alertCircle: ['M12 8v4', 'M12 16h.01'],
  paperclip: 'M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48',
  eye: ['M1 12s4-8 11-8 11 8 11 8', 'M1 12s4 8 11 8 11-8 11-8', 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z'],
  edit: ['M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7', 'M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z'],
  user: ['M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2', 'M12 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8z'],
  users: ['M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2', 'M23 21v-2a4 4 0 0 1-3-3.87', 'M16 3.13a4 4 0 0 1 0 7.75', 'M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8z'],
  folder: ['M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z'],
  arrowRight: 'M5 12h14M12 5l7 7-7 7',
  send: 'M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z',
  flag: ['M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z', 'M4 22v-7'],
  layers: ['M12 2 2 7l10 5 10-5-10-5z', 'M2 17l10 5 10-5', 'M2 12l10 5 10-5'],
  activity: 'M22 12h-4l-3 9L9 3l-3 9H2',
  download: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M7 10l5 5 5-5', 'M12 15V3'],
  upload: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M17 8l-5-5-5 5', 'M12 3v12'],
  link: ['M15 7h3a5 5 0 0 1 0 10h-3', 'M9 17H6A5 5 0 0 1 6 7h3', 'M8 12h8'],
  messageSquare: ['M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'],
  settings: ['M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z'],
  logout: ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'M16 17l5-5-5-5', 'M21 12H9'],
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  star: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
  calendar: ['M8 2v4', 'M16 2v4', 'M3 10h18', 'M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z'],
  calendarDot: ['M8 2v4', 'M16 2v4', 'M3 10h18', 'M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z', 'M12 16a1 1 0 1 0 0-2 1 1 0 0 0 0 2z'],
  chevronLeft: 'M15 18l-6-6 6-6',
  externalLink: ['M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6', 'M15 3h6v6', 'M10 14L21 3'],
  barChart2: ['M18 20V10', 'M12 20V4', 'M6 20v-6'],
  fileText: ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'M14 2v6h6', 'M16 13H8', 'M16 17H8', 'M10 9H8'],
}

export default function Home() {
  const router = useRouter()
  const [authChecked, setAuthChecked] = useState(false)
  const [currentEmployee, setCurrentEmployee] = useState<Employee | null>(null)

  // --- Toast system ----------------------------------------------------------
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const toastTimers = useRef<ReturnType<typeof setTimeout>[]>([])
  const showToast = useCallback((msg: string, type: ToastType = 'success') => {
    const id = Math.random().toString(36).slice(2)
    setToasts((prev) => [...prev.slice(-4), { id, message: msg, type }])
    const t = setTimeout(() => setToasts((prev) => prev.filter((item) => item.id !== id)), 3500)
    toastTimers.current.push(t)
  }, [])
  useEffect(() => () => { toastTimers.current.forEach(clearTimeout) }, [])
  useEffect(() => { _showToast = showToast; return () => { _showToast = null } }, [showToast])

  // --- Confirm dialog --------------------------------------------------------
  const [confirmState, setConfirmState] = useState<{ message: string; resolve: (ok: boolean) => void } | null>(null)
  useEffect(() => {
    _confirm = (message: string) => new Promise<boolean>((resolve) => setConfirmState({ message, resolve }))
    return () => { _confirm = null }
  }, [])
  const answerConfirm = useCallback((ok: boolean) => {
    setConfirmState((current) => {
      current?.resolve(ok)
      return null
    })
  }, [])

  // --- Realtime sync ---------------------------------------------------------
  const [realtimeStatus, setRealtimeStatus] = useState<'connecting' | 'live' | 'off'>('connecting')
  const fetchAllRef = useRef<((opts?: { silent?: boolean }) => void) | null>(null)

  const [view, setView] = useState<ViewKey>('coo')
  const [taskFilter, setTaskFilter] = useState('all')
  const [collapsed, setCollapsed] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  const [departments, setDepartments] = useState<Department[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [permissions, setPermissions] = useState<RolePermission[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [steps, setSteps] = useState<TaskStep[]>([])
  const [supporters, setSupporters] = useState<TaskSupporter[]>([])
  const [reports, setReports] = useState<TaskReport[]>([])
  const [comments, setComments] = useState<StepComment[]>([])
  const [projectSpecs, setProjectSpecs] = useState<ProjectSpec[]>([])
  const [executionTrackers, setExecutionTrackers] = useState<ExecutionTracker[]>([])

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  const [selectedProjectId, setSelectedProjectId] = useState('all')
  const [selectedWorkstreamId, setSelectedWorkstreamId] = useState('')
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [cooTarget, setCooTarget] = useState<CooTarget | null>(null)
  const [editingProject, setEditingProject] = useState<Project | null>(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [createTab, setCreateTab] = useState<'project' | 'workstream'>('workstream')

  const [projectName, setProjectName] = useState('')
  const [projectCode, setProjectCode] = useState('')
  const [projectDesc, setProjectDesc] = useState('')
  const [projectOwnerId, setProjectOwnerId] = useState('')
  const [projectMemberIds, setProjectMemberIds] = useState<string[]>([])
  const [projectWatcherIds, setProjectWatcherIds] = useState<string[]>([])
  const [projectApproverIds, setProjectApproverIds] = useState<string[]>([])
  const [projectDepartmentId, setProjectDepartmentId] = useState('')

  const [workTitle, setWorkTitle] = useState('')
  const [workDesc, setWorkDesc] = useState('')
  const [workProjectId, setWorkProjectId] = useState('')
  const [workDepartmentId, setWorkDepartmentId] = useState('')
  const [workHeadId, setWorkHeadId] = useState('')
  const [workHeadIds, setWorkHeadIds] = useState<string[]>([])
  const [workAssigneeId, setWorkAssigneeId] = useState('')
  const [workCoOwnerIds, setWorkCoOwnerIds] = useState<string[]>([])
  const [workSupporterIds, setWorkSupporterIds] = useState<string[]>([])
  const [workApproverIds, setWorkApproverIds] = useState<string[]>([])
  const [workDueDate, setWorkDueDate] = useState('')
  const [workPriority, setWorkPriority] = useState('medium')

  const [subtaskOpenFor, setSubtaskOpenFor] = useState('')
  const [subtaskForm, setSubtaskForm] = useState<SubtaskForm>({
    title: '',
    description: '',
    departmentId: '',
    headId: '',
    headIds: [],
    assigneeId: '',
    coOwnerIds: [],
    supporterIds: [],
    reviewerIds: [],
    watcherIds: [],
    dueDate: '',
    priority: 'medium',
  })

  const [stepOpenFor, setStepOpenFor] = useState('')
  const [stepForm, setStepForm] = useState<StepForm>({
    title: '',
    description: '',
    ownerId: '',
    supporterIds: [],
    approverId: '',
    approverIds: [],
    dueDate: '',
  })

  const [supporterDrafts, setSupporterDrafts] = useState<Record<string, string>>({})
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({})
  const [revisionDrafts, setRevisionDrafts] = useState<Record<string, string>>({})
  const [linkDrafts, setLinkDrafts] = useState<Record<string, string>>({})
  const [supportDrafts, setSupportDrafts] = useState<Record<string, string>>({})

  const [searchInput, setSearchInput] = useState('')   // immediate — controls the input
  const [searchQuery, setSearchQuery] = useState('')   // debounced — drives filtering
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  function handleSearchChange(value: string) {
    setSearchInput(value)
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    searchDebounceRef.current = setTimeout(() => setSearchQuery(value), 200)
  }
  const [searchOpen, setSearchOpen] = useState(false)
  const [inboxOpen, setInboxOpen] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Ctrl+K / Cmd+K focus tìm kiếm
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        searchInputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const [meetingTitle, setMeetingTitle] = useState('Biên bản họp vận hành')
  const [meetingRaw, setMeetingRaw] = useState('')
  const [meetingRecap, setMeetingRecap] = useState<MeetingRecap>(DEFAULT_MEETING_RECAP)
  const [notexProjectName, setNotexProjectName] = useState('')
  const [notexRows, setNotexRows] = useState<NotexRow[]>([])
  const [analyzing, setAnalyzing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [assistantOutput, setAssistantOutput] = useState('')
  const [notexScheduleId, setNotexScheduleId] = useState('')
  const [notexOccurredAt, setNotexOccurredAt] = useState('')

  useEffect(() => {
    async function checkAuth() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/login')
        return
      }

      const { data: emp, error: empError } = await supabase
        .from('employees')
        .select('*')
        .eq('auth_user_id', session.user.id)
        .maybeSingle()

      if (empError || !emp) {
        // auth_user_id không khớp — thử lookup bằng email (case-insensitive)
        const { data: empByEmail } = await supabase
          .from('employees')
          .select('*')
          .ilike('email', session.user.email || '')
          .maybeSingle()

        if (empByEmail) {
          if (empByEmail.status === 'inactive') {
            await supabase.auth.signOut()
            router.push('/login?error=inactive')
            return
          }
          // Link auth_user_id lần đầu để lần sau khớp nhanh hơn
          if (!empByEmail.auth_user_id) {
            await supabase.from('employees').update({ auth_user_id: session.user.id }).eq('id', empByEmail.id)
          }
          setCurrentEmployee(empByEmail as Employee)
          setAuthChecked(true)
          return
        }

        // Kiểm tra nếu chưa có nhân viên nào — cho phép first-run admin setup
        const { count } = await supabase.from('employees').select('id', { count: 'exact', head: true })
        if (count === 0 || count === null) {
          setCurrentEmployee({ id: '', full_name: session.user.email || 'Admin', position: null, role: 'admin', status: 'active' } as Employee)
          setAuthChecked(true)
          return
        }

        // Tài khoản không có trong danh sách nhân viên
        await supabase.auth.signOut()
        router.push('/login?error=no_employee')
        return
      }

      if (emp.status === 'inactive') {
        await supabase.auth.signOut()
        router.push('/login?error=inactive')
        return
      }

      // Link auth_user_id nếu chưa có
      if (!emp.auth_user_id) {
        await supabase.from('employees').update({ auth_user_id: session.user.id }).eq('id', emp.id)
      }

      setCurrentEmployee(emp as Employee)
      setAuthChecked(true)
    }
    checkAuth()
  }, [router])

  // REQ-05: redirect to appropriate default view based on role
  useEffect(() => {
    if (!currentEmployee) return
    const role = currentEmployee.role
    const isTopLevelRole = role === 'ceo' || role === 'coo'
    const isAdminRole = role === 'admin'
    const isEmp = role === 'employee'
    const canManage = isTopLevelRole || isAdminRole
    // Employee: redirect away from views they shouldn't access
    if (isEmp && (view === 'coo' || view === 'automation' || view === 'admin' || view === 'permissions' || view === 'dashboard' || view === 'projects')) {
      setView('assigned')
      return
    }
    // Department head / other non-managers: redirect away from strictly admin views
    if (!canManage && (view === 'coo' || view === 'automation' || view === 'admin')) {
      setView('assigned')
    }
  }, [currentEmployee]) // eslint-disable-line react-hooks/exhaustive-deps

  // Đăng ký Web Push sau khi đăng nhập thành công
  useEffect(() => {
    if (!currentEmployee?.id || typeof window === 'undefined') return
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    if (!vapidKey) return

    async function registerPush() {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
        await navigator.serviceWorker.ready

        // Kiểm tra quyền — chỉ xin nếu chưa từng cho phép
        if (Notification.permission === 'denied') return
        if (Notification.permission === 'default') {
          const perm = await Notification.requestPermission()
          if (perm !== 'granted') return
        }

        const existing = await reg.pushManager.getSubscription()
        const sub = existing || await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey!),
        })

        await fetch('/api/push-subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ employeeId: currentEmployee!.id, subscription: sub.toJSON() }),
        })
      } catch {
        // Push không khả dụng (HTTP, trình duyệt không hỗ trợ) — bỏ qua
      }
    }

    function urlBase64ToUint8Array(base64String: string) {
      const padding = '='.repeat((4 - base64String.length % 4) % 4)
      const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
      const raw = window.atob(base64)
      const output = new Uint8Array(raw.length)
      for (let i = 0; i < raw.length; ++i) output[i] = raw.charCodeAt(i)
      return output
    }

    registerPush()
  }, [currentEmployee?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function logout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const fetchPermissions = useCallback(async () => {
    const { data } = await supabase.from('role_permissions').select('*')
    if (data) setPermissions(data as RolePermission[])
  }, [])

  const fetchProjectSpecs = useCallback(async () => {
    const { data } = await supabase.from('project_specs').select('*').order('created_at', { ascending: false })
    if (data) setProjectSpecs(data as ProjectSpec[])
  }, [])

  const fetchExecutionTrackers = useCallback(async () => {
    const { data: trackers } = await supabase.from('execution_trackers').select('*').order('created_at', { ascending: false })
    if (!trackers) return
    const { data: items } = await supabase.from('execution_items').select('*').order('order_index', { ascending: true })
    const itemsByTracker = new Map<string, ExecutionItem[]>()
    for (const item of (items || [])) {
      const list = itemsByTracker.get(item.execution_tracker_id) || []
      list.push(item as ExecutionItem)
      itemsByTracker.set(item.execution_tracker_id, list)
    }
    setExecutionTrackers(trackers.map(t => ({ ...t, items: itemsByTracker.get(t.id) || [] })) as ExecutionTracker[])
  }, [])

  const fetchDepartments = useCallback(async () => {
    const { data, error } = await supabase.from('departments').select('id, code, name').order('name')
    if (error) {
      console.error(error)
      setDepartments([])
      return
    }

    const rows = (data || []) as Department[]
    setDepartments(rows)

    if (rows[0]) {
      setProjectDepartmentId((v) => v || rows[0].id)
      setWorkDepartmentId((v) => v || rows[0].id)
    }
  }, [])

  const fetchEmployees = useCallback(async () => {
    const { data, error } = await supabase.from('employees').select('id, full_name, email, position, department_id').order('full_name')
    if (error) {
      console.error(error)
      setEmployees([])
      return
    }

    const rows = (data || []) as Employee[]
    setEmployees(rows)

    if (rows[0]) {
      setProjectOwnerId((v) => v || rows[0].id)
    }
  }, [])

  const fetchProjects = useCallback(async () => {
    const { data, error } = await supabase.from('projects').select('*').order('name')
    if (error) {
      console.error(error)
      setProjects([])
      return
    }

    const rows = (data || []) as Project[]
    setProjects(rows)

    if (rows[0]) {
      setWorkProjectId((v) => v || rows[0].id)
    }
  }, [])

  const fetchTasks = useCallback(async () => {
    const { data, error } = await supabase.from('tasks').select('*').order('created_at', { ascending: false })
    if (error) {
      console.error(error)
      setTasks([])
      return
    }

    setTasks((data || []) as Task[])
  }, [])

  const fetchSteps = useCallback(async () => {
    const { data, error } = await supabase.from('task_steps').select('*').order('step_order')
    if (error) {
      console.error(error)
      setSteps([])
      return
    }

    setSteps((data || []) as TaskStep[])
  }, [])

  const fetchSupporters = useCallback(async () => {
    const { data, error } = await supabase.from('task_supporters').select('*, employees(id, full_name)')
    if (error) {
      console.error(error)
      setSupporters([])
      return
    }

    setSupporters((data || []) as TaskSupporter[])
  }, [])

  const fetchReports = useCallback(async () => {
    const { data, error } = await supabase.from('task_reports').select('*').order('created_at', { ascending: false })
    if (error) {
      console.error(error)
      setReports([])
      return
    }

    setReports((data || []) as TaskReport[])
  }, [])

  const fetchComments = useCallback(async () => {
    const { data, error } = await supabase.from('task_step_comments').select('*, employees(full_name)').order('created_at')
    if (error) {
      console.error(error)
      setComments([])
      return
    }

    setComments((data || []) as StepComment[])
  }, [])

  const fetchAll = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLoading(true)
    }
    await Promise.all([
      fetchDepartments(),
      fetchEmployees(),
      fetchProjects(),
      fetchTasks(),
      fetchSteps(),
      fetchSupporters(),
      fetchReports(),
      fetchComments(),
      fetchPermissions(),
      fetchProjectSpecs(),
      fetchExecutionTrackers(),
    ])
    if (!options?.silent) {
      setLoading(false)
    }
  }, [
    fetchComments,
    fetchDepartments,
    fetchEmployees,
    fetchPermissions,
    fetchProjects,
    fetchReports,
    fetchSteps,
    fetchSupporters,
    fetchTasks,
    fetchProjectSpecs,
    fetchExecutionTrackers,
  ])

  useEffect(() => {
    fetchAllRef.current = fetchAll
  }, [fetchAll])

  useEffect(() => {
    const loadTimer = window.setTimeout(() => { fetchAll() }, 0)
    return () => window.clearTimeout(loadTimer)
  }, [fetchAll])

  // --- Thông báo trong app ---------------------------------------------------
  const [notifications, setNotifications] = useState<AppNotification[]>([])

  const fetchNotifications = useCallback(async () => {
    if (!currentEmployee?.id) return
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('recipient_id', currentEmployee.id)
      .order('created_at', { ascending: false })
      .limit(30)
    if (error) return // bảng chưa tạo — bỏ qua êm
    setNotifications((data || []) as AppNotification[])
  }, [currentEmployee])

  useEffect(() => {
    const timer = window.setTimeout(() => { fetchNotifications() }, 0)
    return () => window.clearTimeout(timer)
  }, [fetchNotifications])

  const unreadCount = notifications.filter((n) => !n.is_read).length

  async function markNotificationsRead() {
    const unread = notifications.filter((n) => !n.is_read).map((n) => n.id)
    if (unread.length === 0) return
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
    await supabase.from('notifications').update({ is_read: true }).in('id', unread)
  }

  async function markNotificationRead(id: string) {
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n))
    await supabase.from('notifications').update({ is_read: true }).eq('id', id)
  }

  // ─── Việc định kỳ + đồng hồ thật ────────────────────────────────────────────
  const [dbSetupNeeded, setDbSetupNeeded] = useState(false)
  const [recurringTasks, setRecurringTasks] = useState<RecurringTask[]>([])
  const [recurringRuns, setRecurringRuns] = useState<RecurringRun[]>([])
  const [recurringRunResult, setRecurringRunResult] = useState<RecurringRunResult | null>(null)
  const [recurringWorkerRunning, setRecurringWorkerRunning] = useState(false)
  const [dailyDigestRunning, setDailyDigestRunning] = useState(false)
  const [dailyDigestResult, setDailyDigestResult] = useState<RecurringRunResult | null>(null)
  const [recurringForm, setRecurringForm] = useState<RecurringTaskForm>(DEFAULT_RECURRING_FORM)
  const [recurringPanelOpen, setRecurringPanelOpen] = useState(false)
  const [recurringMeetingFiles, setRecurringMeetingFiles] = useState<RecurringMeetingFile[]>([])
  const [meetingSessions, setMeetingSessions] = useState<MeetingSession[]>([])
  const [meetingFileDrafts, setMeetingFileDrafts] = useState<Record<string, MeetingFileDraft>>({})
  const [selectedMeetingTaskId, setSelectedMeetingTaskId] = useState('')
  const [uploadingMeetingFileFor, setUploadingMeetingFileFor] = useState('')
  const [now, setNow] = useState(() => new Date())

  const fetchRecurring = useCallback(async () => {
    const { data, error } = await supabase.from('recurring_tasks').select('*').order('created_at')
    if (error) {
      const msg = (error as { message?: string }).message || ''
      if (msg.includes('does not exist') || msg.includes('relation') || error.code === '42P01') {
        setDbSetupNeeded(true)
      }
      setRecurringTasks([defaultPerformanceMeeting(currentEmployee?.id)])
      return
    }
    setDbSetupNeeded(false)
    const rows = (data || []) as RecurringTask[]
    const hasPerformanceMeeting = rows.some((task) => task.title === 'Họp Performance')
    setRecurringTasks(hasPerformanceMeeting ? rows : [defaultPerformanceMeeting(currentEmployee?.id), ...rows])
  }, [currentEmployee?.id])

  const fetchRecurringRuns = useCallback(async () => {
    const { data, error } = await supabase
      .from('recurring_task_runs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(12)
    if (error) return
    setRecurringRuns((data || []) as RecurringRun[])
  }, [])

  const fetchRecurringMeetingFiles = useCallback(async () => {
    const { data, error } = await supabase
      .from('recurring_meeting_files')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) {
      setRecurringMeetingFiles([])
      return
    }
    setRecurringMeetingFiles((data || []) as RecurringMeetingFile[])
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => { fetchRecurring() }, 0)
    return () => window.clearTimeout(timer)
  }, [fetchRecurring])

  useEffect(() => {
    const timer = window.setTimeout(() => { fetchRecurringRuns() }, 0)
    return () => window.clearTimeout(timer)
  }, [fetchRecurringRuns])

  useEffect(() => {
    const timer = window.setTimeout(() => { fetchRecurringMeetingFiles() }, 0)
    return () => window.clearTimeout(timer)
  }, [fetchRecurringMeetingFiles])

  const fetchMeetingSessions = useCallback(async () => {
    const { data, error } = await supabase
      .from('meeting_sessions')
      .select('*')
      .order('occurred_at', { ascending: false })
    if (error) { setMeetingSessions([]); return }
    setMeetingSessions((data || []) as MeetingSession[])
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => { fetchMeetingSessions() }, 0)
    return () => window.clearTimeout(timer)
  }, [fetchMeetingSessions])

  // Supabase Realtime
  useEffect(() => {
    if (!authChecked) return
    const channel = supabase
      .channel('workos-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => {
        fetchAllRef.current?.({ silent: true })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_steps' }, () => {
        fetchAllRef.current?.({ silent: true })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => {
        fetchAllRef.current?.({ silent: true })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_supporters' }, () => {
        fetchAllRef.current?.({ silent: true })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => {
        fetchNotifications()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recurring_tasks' }, () => {
        fetchRecurring()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recurring_task_runs' }, () => {
        fetchRecurringRuns()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recurring_meeting_files' }, () => {
        fetchRecurringMeetingFiles()
      })
      .subscribe((status) => {
        setRealtimeStatus(status === 'SUBSCRIBED' ? 'live' : status === 'CLOSED' ? 'off' : 'connecting')
      })
    return () => { supabase.removeChannel(channel) }
  }, [authChecked, fetchNotifications, fetchRecurring, fetchRecurringRuns, fetchRecurringMeetingFiles])

  // Đồng hồ — tick mỗi 30 giây
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(t)
  }, [])

  // Fallback refresh mỗi 5 phút — bù cho trường hợp Realtime drop kết nối
  useEffect(() => {
    const t = window.setInterval(() => fetchAllRef.current?.({ silent: true }), 5 * 60_000)
    return () => window.clearInterval(t)
  }, [])

  useEffect(() => {
    const refreshWhenActive = () => fetchAllRef.current?.({ silent: true })
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') refreshWhenActive()
    }

    window.addEventListener('focus', refreshWhenActive)
    document.addEventListener('visibilitychange', refreshWhenVisible)

    return () => {
      window.removeEventListener('focus', refreshWhenActive)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [])

  // Khi vào view "Việc định kỳ" → tự đánh dấu đã đọc các thông báo recurring_reminder
  useEffect(() => {
    if (view !== 'recurring') return
    setNotifications((prev) => {
      const ids = prev.filter((n) => !n.is_read && n.type === 'recurring_reminder').map((n) => n.id)
      if (ids.length === 0) return prev
      supabase.from('notifications').update({ is_read: true }).in('id', ids)
      return prev.map((n) => (ids.includes(n.id) ? { ...n, is_read: true } : n))
    })
  }, [view])

  // Bộ nhắc: check mỗi lần đồng hồ tick — nhắc trước N ngày + nhắc trước N phút
  useEffect(() => {
    if (recurringTasks.length === 0) return

    async function claimAndNotify(rt: RecurringTask, field: 'notified_early_for' | 'notified_near_for', occKey: string, title: string, body: string) {
      const recipients = recurringRecipientIds(rt)
      if (recipients.length === 0) return
      const { data: claimed } = await supabase
        .from('recurring_tasks')
        .update({ [field]: occKey })
        .eq('id', rt.id)
        .or(`${field}.is.null,${field}.neq."${occKey}"`)
        .select('id')
      if (!claimed || claimed.length === 0) return
      await pushNotify(recipients.map((recipient_id) => ({ recipient_id, type: 'recurring_reminder', title, body })))
      fetchRecurring()
    }

    async function runChecks() {
      for (const rt of recurringTasks) {
        if (!rt.is_active || recurringRecipientIds(rt).length === 0) continue
        const occ = nextOccurrence(rt, now)
        const occKey = occurrenceKey(rt, occ)
        const msTo = occ.getTime() - now.getTime()

        if ((rt.frequency === 'weekly' || rt.frequency === 'monthly') &&
            msTo <= rt.remind_days_before * 86_400_000 &&
            msTo > rt.remind_minutes_before * 60_000 &&
            rt.notified_early_for !== occKey) {
          await claimAndNotify(rt, 'notified_early_for', occKey,
            `Sắp tới: ${rt.title}`,
            `${formatOccurrence(occ)} — còn ${Math.ceil(msTo / 86_400_000)} ngày. Chuẩn bị trước.`)
        }

        if (msTo <= rt.remind_minutes_before * 60_000 && msTo > 0 && rt.notified_near_for !== occKey) {
          await claimAndNotify(rt, 'notified_near_for', occKey,
            rt.kind === 'meeting' ? `Còn ${Math.ceil(msTo / 60_000)} phút nữa họp: ${rt.title}` : `Sắp đến hạn nộp: ${rt.title}`,
            `${formatOccurrence(occ)} (${rt.time_of_day})`)
        }
      }
    }

    void runChecks()
  }, [fetchRecurring, now, recurringTasks])

  function editRecurringTask(task: RecurringTask) {
    const meetingParts = parseMeetingDescription(task.description)
    setRecurringForm({
      id: task.id,
      title: task.title,
      description: meetingParts.note,
      recap: meetingParts.recap,
      prepFiles: meetingParts.prepFiles,
      meetingHistory: meetingParts.meetingHistory,
      kind: task.kind || 'task',
      frequency: task.frequency || 'weekly',
      weekday: String(task.weekday ?? 1),
      month_day: String(task.month_day ?? 1),
      time_of_day: task.time_of_day || '09:00',
      assignee_ids: recurringRecipientIds(task),
      remind_days_before: String(task.remind_days_before ?? 2),
      remind_minutes_before: String(task.remind_minutes_before ?? 60),
      host_id: task.host_id || '',
      department_ids: task.department_ids && task.department_ids.length > 0
        ? task.department_ids
        : task.department_id ? [task.department_id] : [],
      participant_ids: task.participant_ids || [],
      observer_ids: task.observer_ids || [],
      objective: task.objective || '',
      agenda: task.agenda || '',
      preparation_checklist: task.preparation_checklist || [],
    })
    setRecurringPanelOpen(true)
  }

  function resetRecurringForm() {
    setRecurringForm(DEFAULT_RECURRING_FORM)
  }

  function recurringTaskFromForm(id: string): RecurringTask {
    const description = recurringForm.kind === 'meeting'
      ? composeMeetingDescription(
        recurringForm.description,
        recurringForm.recap,
        recurringForm.prepFiles,
        recurringForm.meetingHistory
      )
      : recurringForm.description.trim() || null

    return {
      id,
      title: recurringForm.title.trim(),
      description,
      kind: recurringForm.kind,
      frequency: recurringForm.frequency,
      weekday: recurringForm.frequency === 'weekly' ? Number(recurringForm.weekday) : null,
      month_day: recurringForm.frequency === 'monthly' ? Math.max(1, Math.min(31, Number(recurringForm.month_day) || 1)) : null,
      time_of_day: recurringForm.time_of_day || '09:00',
      assignee_id: recurringForm.assignee_ids[0] || null,
      recipient_ids: recurringForm.assignee_ids,
      remind_days_before: Math.max(0, Number(recurringForm.remind_days_before) || 0),
      remind_minutes_before: Math.max(1, Number(recurringForm.remind_minutes_before) || 60),
      host_id: recurringForm.host_id || null,
      department_id: recurringForm.department_ids[0] || null,
      department_ids: recurringForm.department_ids,
      participant_ids: recurringForm.participant_ids,
      observer_ids: recurringForm.observer_ids,
      objective: recurringForm.objective.trim() || null,
      agenda: recurringForm.agenda.trim() || null,
      preparation_checklist: recurringForm.preparation_checklist,
      is_active: true,
      notified_early_for: null,
      notified_near_for: null,
      created_by: currentEmployee?.id || null,
      created_at: new Date().toISOString(),
    }
  }

  async function saveRecurringTask(event: React.FormEvent) {
    event.preventDefault()
    if (!recurringForm.title.trim()) {
      toast('Nhập tên việc định kỳ trước.', 'warning')
      return
    }

    const payload = {
      title: recurringForm.title.trim(),
      description: recurringForm.kind === 'meeting'
        ? composeMeetingDescription(
          recurringForm.description,
          recurringForm.recap,
          recurringForm.prepFiles,
          recurringForm.meetingHistory
        )
        : recurringForm.description.trim() || null,
      kind: recurringForm.kind,
      frequency: recurringForm.frequency,
      weekday: recurringForm.frequency === 'weekly' ? Number(recurringForm.weekday) : null,
      month_day: recurringForm.frequency === 'monthly' ? Math.max(1, Math.min(31, Number(recurringForm.month_day) || 1)) : null,
      time_of_day: recurringForm.time_of_day || '09:00',
      assignee_id: recurringForm.assignee_ids[0] || null,
      recipient_ids: recurringForm.assignee_ids.length > 0 ? recurringForm.assignee_ids : null,
      remind_days_before: Math.max(0, Number(recurringForm.remind_days_before) || 0),
      remind_minutes_before: Math.max(1, Number(recurringForm.remind_minutes_before) || 60),
      host_id: recurringForm.host_id || null,
      department_id: recurringForm.department_ids[0] || null,
      department_ids: recurringForm.department_ids.length > 0 ? recurringForm.department_ids : [],
      participant_ids: recurringForm.participant_ids.length > 0 ? recurringForm.participant_ids : [],
      observer_ids: recurringForm.observer_ids.length > 0 ? recurringForm.observer_ids : [],
      objective: recurringForm.objective.trim() || null,
      agenda: recurringForm.agenda.trim() || null,
      preparation_checklist: recurringForm.preparation_checklist.length > 0 ? recurringForm.preparation_checklist : [],
      is_active: true,
      created_by: currentEmployee?.id || null,
    }

    const isDefaultTask = recurringForm.id?.startsWith('default-')
    const request = recurringForm.id && !isDefaultTask
      ? supabase.from('recurring_tasks').update(payload).eq('id', recurringForm.id)
      : supabase.from('recurring_tasks').insert(payload)
    const { error } = await request

    if (error) {
      console.error(error)
      // Khi DB lỗi (cột chưa có, RLS chặn, v.v.) — luôn optimistic update local state
      const localId = recurringForm.id || `local-recurring-${Date.now()}`
      const localTask = recurringTaskFromForm(localId)
      setRecurringTasks((prev) => {
        const exists = prev.some((task) => task.id === localId)
        return exists ? prev.map((task) => (task.id === localId ? localTask : task)) : [localTask, ...prev]
      })
      const errorMessage = (error as { message?: string }).message || ''
      if (errorMessage.includes('does not exist') || errorMessage.includes('column') || !errorMessage) {
        toast('Đã cập nhật trên màn hình. Cần chạy SQL 011 trong Supabase để lưu vĩnh viễn.', 'warning')
      } else {
        toast(`Lưu lỗi: ${errorMessage || 'Lỗi không xác định'}. Đã cập nhật tạm trên màn hình.`, 'warning')
      }
      resetRecurringForm()
      setRecurringPanelOpen(false)
      return
    }

    toast(recurringForm.id ? 'Đã cập nhật việc định kỳ.' : 'Đã tạo việc định kỳ.')
    // Optimistic update: cập nhật local state ngay lập tức, không đợi fetchRecurring()
    if (recurringForm.id && !isDefaultTask) {
      const optimistic = recurringTaskFromForm(recurringForm.id)
      setRecurringTasks((prev) => prev.map((t) => t.id === recurringForm.id ? optimistic : t))
    }
    resetRecurringForm()
    setRecurringPanelOpen(false)
    await fetchRecurring()
  }

  async function toggleRecurringTask(task: RecurringTask) {
    const { error } = await supabase.from('recurring_tasks').update({ is_active: !task.is_active }).eq('id', task.id)
    if (error) {
      toast('Cập nhật trạng thái bị lỗi.', 'error')
      return
    }
    await fetchRecurring()
  }

  async function updateRecurringTaskPatch(taskId: string, patch: Partial<RecurringTask>) {
    // Local / default tasks — no DB row, update in-memory only
    const isLocal = taskId.startsWith('local-') || taskId.startsWith('default-')
    if (isLocal) {
      setRecurringTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, ...patch } : t))
      return
    }
    const { error } = await supabase.from('recurring_tasks').update(patch as Record<string, unknown>).eq('id', taskId)
    // Always reflect the change locally so UI stays consistent
    setRecurringTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, ...patch } : t))
    if (error) {
      const msg = error.message || ''
      if (msg.includes('preparation_checklist') || msg.includes('column') || msg.includes('does not exist')) {
        toast('Chưa có cột preparation_checklist trong DB. Chạy sql/005_recurring_tasks_upgrade.sql trong Supabase.', 'warning')
      } else if (msg.includes('department_ids')) {
        toast('Chưa có cột department_ids. Chạy sql/006_recurring_tasks_department_ids.sql trong Supabase.', 'warning')
      } else if (msg.includes('permission') || msg.includes('policy') || msg.includes('RLS')) {
        toast('Không có quyền cập nhật lịch này.', 'error')
      } else {
        toast(`Lưu lên DB lỗi: ${msg || 'unknown'}. Dữ liệu đã cập nhật trên màn hình.`, 'warning')
      }
    }
  }

  async function deleteRecurringTask(task: RecurringTask) {
    const ok = await confirmDialog(`Xóa việc định kỳ "${task.title}"?`)
    if (!ok) return
    const { error } = await supabase.from('recurring_tasks').delete().eq('id', task.id)
    if (error) {
      toast('Xóa việc định kỳ bị lỗi.', 'error')
      return
    }
    toast('Đã xóa việc định kỳ.')
    if (recurringForm.id === task.id) resetRecurringForm()
    await fetchRecurring()
  }

  function updateMeetingFileDraft(taskId: string, patch: Partial<MeetingFileDraft>) {
    setMeetingFileDrafts((current) => ({
      ...current,
      [taskId]: {
        ...DEFAULT_MEETING_FILE_DRAFT,
        ...(current[taskId] || {}),
        ...patch,
      },
    }))
  }

  async function saveRecurringMeetingLink(task: RecurringTask) {
    if (isLocalRecurringTask(task)) {
      toast('Lưu lịch định kỳ vào Supabase trước khi gắn kho file họp.', 'warning')
      return
    }

    const draft = { ...DEFAULT_MEETING_FILE_DRAFT, ...(meetingFileDrafts[task.id] || {}) }
    const fileUrl = draft.fileUrl.trim()
    if (!fileUrl) {
      toast('Dán link file họp trước.', 'warning')
      return
    }

    const { error } = await supabase.from('recurring_meeting_files').insert({
      recurring_task_id: task.id,
      meeting_date: draft.meetingDate || null,
      title: draft.title.trim() || 'Link họp',
      file_name: draft.title.trim() || fileUrl,
      file_url: fileUrl,
      file_type: 'link',
      note: draft.note.trim() || null,
      uploaded_by: currentEmployee?.id || null,
    })

    if (error) {
      console.error(error)
      toast('Kho file họp chưa sẵn sàng. Chạy SQL cập nhật Supabase trước.', 'warning')
      return
    }

    setMeetingFileDrafts((current) => ({
      ...current,
      [task.id]: { ...DEFAULT_MEETING_FILE_DRAFT, meetingDate: draft.meetingDate },
    }))
    toast('Đã lưu link vào kho file họp.')
    await fetchRecurringMeetingFiles()
  }

  async function uploadRecurringMeetingFile(task: RecurringTask, file?: File) {
    if (!file) return
    if (isLocalRecurringTask(task)) {
      toast('Lưu lịch định kỳ vào Supabase trước khi upload file họp.', 'warning')
      return
    }

    setUploadingMeetingFileFor(task.id)
    const draft = { ...DEFAULT_MEETING_FILE_DRAFT, ...(meetingFileDrafts[task.id] || {}) }

    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) {
        toast('Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.', 'error')
        setUploadingMeetingFileFor('')
        return
      }

      const form = new FormData()
      form.append('file', file)
      form.append('taskId', task.id)

      const res = await fetch('/api/upload-meeting-file', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      })
      const result = await res.json() as { ok: boolean; publicUrl?: string; error?: string }

      if (!res.ok || !result.ok) {
        toast(result.error || 'Upload file họp bị lỗi.', 'error')
        setUploadingMeetingFileFor('')
        return
      }

      const { error } = await supabase.from('recurring_meeting_files').insert({
        recurring_task_id: task.id,
        meeting_date: draft.meetingDate || null,
        title: draft.title.trim() || file.name,
        file_name: file.name,
        file_url: result.publicUrl,
        file_type: file.type || null,
        note: draft.note.trim() || 'File họp',
        uploaded_by: currentEmployee?.id || null,
      })

      if (error) {
        console.error(error)
        toast('Upload xong nhưng lưu hồ sơ file họp bị lỗi. Kiểm tra bảng recurring_meeting_files.', 'error')
        setUploadingMeetingFileFor('')
        return
      }

      setMeetingFileDrafts((current) => ({
        ...current,
        [task.id]: { ...DEFAULT_MEETING_FILE_DRAFT, meetingDate: draft.meetingDate },
      }))
      toast('Đã upload file họp.')
      await fetchRecurringMeetingFiles()
    } catch (err) {
      console.error(err)
      toast('Không upload được file họp.', 'error')
    } finally {
      setUploadingMeetingFileFor('')
    }
  }

  async function deleteRecurringMeetingFile(file: RecurringMeetingFile) {
    const ok = await confirmDialog(`Xóa file họp "${file.title || file.file_name}"?`)
    if (!ok) return

    const { error } = await supabase.from('recurring_meeting_files').delete().eq('id', file.id)
    if (error) {
      console.error(error)
      toast('Xóa file họp bị lỗi.', 'error')
      return
    }

    toast('Đã xóa khỏi kho file họp.')
    await fetchRecurringMeetingFiles()
  }

  async function runRecurringReminderWorker() {
    setRecurringWorkerRunning(true)
    setRecurringRunResult(null)

    const { data: sessionData } = await supabase.auth.getSession()
    const headers = sessionData.session?.access_token
      ? { Authorization: `Bearer ${sessionData.session.access_token}` }
      : undefined

    try {
      const response = await fetch('/api/recurring-reminders', { method: 'POST', headers })
      const result = (await response.json()) as RecurringRunResult
      setRecurringRunResult(result)

      if (!response.ok || result.ok === false) {
        toast(result.error || 'Chạy tác vụ định kỳ bị lỗi.', 'error')
        return
      }

      toast(`Đã chạy nhắc định kỳ: ${result.notificationsSent || 0} thông báo mới.`)
      await Promise.all([fetchRecurring(), fetchRecurringRuns(), fetchNotifications()])
    } catch (error) {
      console.error(error)
      toast('Không gọi được tác vụ định kỳ.', 'error')
    } finally {
      setRecurringWorkerRunning(false)
    }
  }

  async function runDailyDigest() {
    setDailyDigestRunning(true)
    setDailyDigestResult(null)
    const { data: sessionData } = await supabase.auth.getSession()
    const headers = sessionData.session?.access_token
      ? { Authorization: `Bearer ${sessionData.session.access_token}` }
      : undefined
    try {
      const response = await fetch('/api/daily-digest', { method: 'POST', headers })
      const result = (await response.json()) as RecurringRunResult & { dueTodayCount?: number; overdueCount?: number; overdueMarkedProblem?: number }
      setDailyDigestResult(result)
      if (!response.ok || result.ok === false) {
        toast(result.error || 'Daily digest lỗi.', 'error')
        return
      }
      const extra = result as { overdueMarkedProblem?: number }
      toast(`Tóm tắt buổi sáng: ${result.notificationsSent || 0} thông báo · ${extra.overdueMarkedProblem || 0} việc đánh dấu trễ.`)
      await Promise.all([fetchNotifications(), fetchAll({ silent: true })])
    } catch {
      toast('Không gọi được daily digest.', 'error')
    } finally {
      setDailyDigestRunning(false)
    }
  }

  const refreshDataSilent = useCallback(async () => {
    // Only refresh data that can change during small updates
    // Don't refetch departments, employees, projects to avoid unnecessary re-renders
    await Promise.all([
      fetchTasks(),
      fetchSteps(),
      fetchSupporters(),
      fetchReports(),
      fetchComments(),
      fetchEmployees(),
    ])
  }, [fetchComments, fetchEmployees, fetchReports, fetchSteps, fetchSupporters, fetchTasks])

  async function notifyAssignmentRecipients(
    taskId: string,
    taskTitle: string,
    projectId: string | null | undefined,
    ids: string[],
    roleLabel: string,
  ) {
    const recipients = uniqueIds(ids).filter((id) => id !== currentEmployee?.id)
    if (recipients.length === 0) return
    await pushNotify(recipients.map((recipient_id) => ({
      recipient_id,
      actor_id: currentEmployee?.id || null,
      type: 'task_assigned',
      title: `Bạn được thêm vào đầu việc (${roleLabel})`,
      body: taskTitle,
      task_id: taskId,
      project_id: projectId || null,
    })))
  }

  async function createProject() {
    if (!projectName.trim()) {
      toast('Nhập tên dự án trước.', 'warning')
      return
    }

    setSaving(true)

    const { error } = await supabase.from('projects').insert({
      name: projectName.trim(),
      code: projectCode.trim() || null,
      description: projectDesc.trim() || null,
      owner_id: projectOwnerId || null,
      member_ids: uniqueIds(projectMemberIds, projectOwnerId ? [projectOwnerId] : []),
      watcher_ids: projectWatcherIds,
      approver_ids: projectApproverIds,
      department_id: projectDepartmentId || null,
      status: 'not_started',
      priority: 'medium',
      progress_percent: 0,
      issue_status: 'normal',
    })

    setSaving(false)

    if (error) {
      console.error(error)
      toast('Tạo dự án bị lỗi.', 'error')
      return
    }

    toast('Đã tạo dự án thành công.')
    setProjectName('')
    setProjectCode('')
    setProjectDesc('')
    setProjectOwnerId('')
    setProjectMemberIds([])
    setProjectWatcherIds([])
    setProjectApproverIds([])
    await fetchAll({ silent: true })
  }

  async function createWorkstream() {
    if (!workTitle.trim()) {
      toast('Nhập tên đầu việc lớn trước.', 'warning')
      return
    }

    if (!workProjectId) {
      toast('Chọn dự án trước.', 'warning')
      return
    }

    setSaving(true)

    const newWorkId = crypto.randomUUID()
    const workLeadId = workHeadId || workHeadIds[0] || (SOLO_PILOT_MODE ? currentEmployee?.id : '') || ''
    const workOwnerId = workAssigneeId || workLeadId || null
    const { error } = await supabase.from('tasks').insert({
      id: newWorkId,
      title: workTitle.trim(),
      description: workDesc.trim() || null,
      parent_task_id: null,
      task_level: 'workstream',
      status: 'not_started',
      priority: workPriority,
      progress_percent: 0,
      due_date: workDueDate || null,
      department_id: workDepartmentId || employees.find((e) => e.id === workLeadId)?.department_id || employees.find((e) => e.id === workOwnerId)?.department_id || null,
      assignee_id: workOwnerId,
      head_id: workLeadId || null,
      head_ids: workLeadId ? [workLeadId] : null,
      co_owner_ids: idsWithout(workCoOwnerIds, workOwnerId, workLeadId),
      supporter_ids: idsWithout(workSupporterIds, workOwnerId, workLeadId),
      approver_ids: idsWithout(workApproverIds, workOwnerId),
      project_id: workProjectId || null,
      issue_status: 'normal',
      approval_status: 'not_submitted',
    })

    setSaving(false)

    if (error) {
      console.error(error)
      toast('Tạo đầu việc lớn bị lỗi.', 'error')
      return
    }

    // Deadline do cấp trên giao trực tiếp → coi như đã chốt (committed)
    await commitDeadlineMeta(newWorkId, workDueDate || null, 'manual')
    await notifyAssignmentRecipients(
      newWorkId,
      workTitle.trim(),
      workProjectId || null,
      taskParticipantIds({
        id: newWorkId,
        title: workTitle.trim(),
        description: null,
        status: 'not_started',
        priority: workPriority,
        progress_percent: 0,
        due_date: workDueDate || null,
        department_id: null,
        assignee_id: workOwnerId,
        project_id: workProjectId || null,
        parent_task_id: null,
        task_level: 'workstream',
        head_id: workLeadId || null,
        head_ids: workLeadId ? [workLeadId] : null,
        co_owner_ids: idsWithout(workCoOwnerIds, workOwnerId, workLeadId),
        supporter_ids: idsWithout(workSupporterIds, workOwnerId, workLeadId),
        approver_ids: idsWithout(workApproverIds, workOwnerId),
        issue_status: 'normal',
      }),
      'lead/đồng phụ trách',
    )

    setWorkTitle('')
    setWorkDesc('')
    setWorkDueDate('')
    setWorkHeadId('')
    setWorkHeadIds([])
    setWorkAssigneeId('')
    setWorkCoOwnerIds([])
    setWorkSupporterIds([])
    setWorkApproverIds([])
    await refreshDataSilent()
  }

  function openSubtaskForm(parent: Task) {
    setSubtaskOpenFor(parent.id)
    setSubtaskForm({
      title: '',
      description: '',
      departmentId: parent.department_id || departments[0]?.id || '',
      headId: parent.head_id || parent.assignee_id || employees[0]?.id || '',
      headIds: [],
      assigneeId: parent.assignee_id || parent.head_id || employees[0]?.id || '',
      coOwnerIds: taskCoOwnerIds(parent),
      supporterIds: taskSupporterIds(parent, supportersByTask.get(parent.id) || []),
      reviewerIds: taskApproverIds(parent),
      watcherIds: taskWatcherIds(parent),
      dueDate: parent.due_date || '',
      priority: parent.priority || 'medium',
    })
  }

  async function createSubtask(parent: Task, form: SubtaskForm) {
    if (!form.title.trim()) {
      toast('Nhập tên đầu việc con trước.', 'warning')
      return
    }

    const newSubId = crypto.randomUUID()
    const mainOwnerId = form.assigneeId || null
    const headId = (form.headIds?.[0]) || form.headId || null
    const { error } = await supabase.from('tasks').insert({
      id: newSubId,
      title: form.title.trim(),
      description: form.description.trim() || null,
      parent_task_id: parent.id,
      task_level: 'subtask',
      status: 'not_started',
      priority: form.priority,
      progress_percent: 0,
      due_date: form.dueDate || null,
      department_id: form.departmentId || employees.find((e) => e.id === headId)?.department_id || employees.find((e) => e.id === mainOwnerId)?.department_id || null,
      assignee_id: mainOwnerId,
      head_id: headId,
      head_ids: form.headIds?.length ? form.headIds : (headId ? [headId] : null),
      co_owner_ids: idsWithout(form.coOwnerIds, mainOwnerId, headId),
      supporter_ids: idsWithout(form.supporterIds, mainOwnerId, headId),
      approver_ids: idsWithout(form.reviewerIds, mainOwnerId),
      reviewer_ids: idsWithout(form.reviewerIds, mainOwnerId),
      watcher_ids: idsWithout(form.watcherIds, mainOwnerId, headId),
      project_id: parent.project_id || null,
      issue_status: 'normal',
      approval_status: 'not_submitted',
    })

    if (error) {
      console.error(error)
      toast('Tạo đầu việc con bị lỗi.', 'error')
      return
    }

    await commitDeadlineMeta(newSubId, form.dueDate || null, 'manual')
    await notifyAssignmentRecipients(
      newSubId,
      form.title.trim(),
      parent.project_id || null,
      uniqueIds([mainOwnerId || ''], form.coOwnerIds, form.supporterIds, form.reviewerIds),
      'phân công',
    )

    setSubtaskOpenFor('')
    await refreshDataSilent()
  }

  function openStepForm(task: Task) {
    const departmentApproverId = getDefaultDepartmentApprover(task.department_id, departments, employees)

    setStepOpenFor(task.id)
    setStepForm({
      title: '',
      description: '',
      ownerId: task.assignee_id || task.head_id || employees[0]?.id || '',
      supporterIds: taskSupporterIds(task, supportersByTask.get(task.id) || []),
      approverId: departmentApproverId || task.head_id || employees[0]?.id || '',
      approverIds: uniqueIds(taskApproverIds(task), departmentApproverId ? [departmentApproverId] : []),
      dueDate: task.due_date || '',
    })
  }

  async function createStep(taskId: string, form: StepForm) {
    if (!form.title.trim()) {
      toast('Nhập tên bước trước.', 'warning')
      return
    }

    const currentSteps = steps.filter((step) => step.task_id === taskId)
    const nextOrder = currentSteps.length + 1
    const task = tasks.find((item) => item.id === taskId)
    const departmentApproverId = form.approverId || getDefaultDepartmentApprover(task?.department_id || null, departments, employees)
    const cooApproverId = getCooApprover(employees)
    const ceoApproverId = getCeoApprover(employees)

    const { error } = await insertTaskStepsCompat({
      task_id: taskId,
      step_title: form.title.trim(),
      description: form.description.trim() || null,
      step_order: nextOrder,
      is_done: false,
      owner_id: form.ownerId || null,
      supporter_ids: idsWithout(form.supporterIds, form.ownerId),
      approver_id: departmentApproverId || null,
      approver_ids: uniqueIds(form.approverIds, departmentApproverId ? [departmentApproverId] : []),
      department_approver_id: departmentApproverId || null,
      coo_approver_id: cooApproverId || null,
      ceo_approver_id: ceoApproverId || null,
      requires_coo_approval: false,
      requires_ceo_approval: false,
      approval_stage: 'department',
      department_approval_status: 'not_submitted',
      coo_approval_status: 'not_required',
      ceo_approval_status: 'not_required',
      due_date: form.dueDate || null,
      approval_status: 'not_submitted',
    })

    if (error) {
      console.error(error)
      toast(`Tạo bước bị lỗi: ${error.message || error.code || 'unknown'}`, 'error')
      return
    }

    setStepOpenFor('')
    await syncTaskProgress(taskId)
    await refreshDataSilent()
  }

  // Chỉ người giao việc (head) / cấp quản lý mới được đánh dấu HOÀN THÀNH.
  // Cấp dưới (assignee) chỉ được cập nhật tiến độ + bấm "Gửi duyệt", không tự hoàn thành.
  function canCompleteTask(task: Task): boolean {
    if (!currentEmployee?.id) return false
    if (can('subtask', 'edit', { department_id: task.department_id, head_id: task.head_id })) return true
    if (task.head_id === currentEmployee.id) return true
    if (Array.isArray(task.head_ids) && task.head_ids.includes(currentEmployee.id)) return true
    if (taskApproverIds(task).includes(currentEmployee.id)) return true
    return false
  }

  async function updateTaskStatus(taskId: string, status: string) {
    const task = tasks.find((t) => t.id === taskId)
    if (status === 'completed' && task && !canCompleteTask(task)) {
      toast('Bạn không có quyền đánh dấu hoàn thành. Hãy bấm "Gửi duyệt" để cấp trên duyệt.', 'warning')
      return
    }

    const { error } = await supabase
      .from('tasks')
      .update({
        status,
        completed_date: status === 'completed' ? new Date().toISOString().slice(0, 10) : null,
      })
      .eq('id', taskId)

    if (error) {
      console.error(error)
      toast('Cập nhật trạng thái lỗi.', 'error')
      return
    }

    await refreshDataSilent()
  }

  async function updateIssueStatus(taskId: string, issueStatus: string) {
    const { error } = await supabase.from('tasks').update({ issue_status: issueStatus }).eq('id', taskId)

    if (error) {
      console.error(error)
      toast('Cập nhật tình trạng lỗi.', 'error')
      return
    }

    await refreshDataSilent()
  }

  async function updateTaskHead(taskId: string, headIds: string[]) {
    const cleanHeadIds = uniqueIds(headIds)
    const headEmp = employees.find((e) => e.id === cleanHeadIds[0])
    const deptId = headEmp?.department_id ?? null
    const patch: Record<string, unknown> = {
      head_id: cleanHeadIds[0] || null,
      head_ids: cleanHeadIds.length > 0 ? cleanHeadIds : null,
    }
    if (deptId) patch.department_id = deptId
    const result = await supabase.from('tasks').update(patch).eq('id', taskId)
    const fallback = result
    const { error } = fallback
    if (error) {
      console.error(error)
      toast('Cập nhật người giao việc lỗi.', 'error')
      return
    }
    toast('Đã cập nhật người giao việc.', 'success')
    await refreshDataSilent()
  }

  async function updateTaskRoleIds(
    taskId: string,
    field: 'co_owner_ids' | 'supporter_ids' | 'reviewer_ids' | 'watcher_ids' | 'approver_ids',
    ids: string[],
    label: string,
  ) {
    const task = tasks.find((t) => t.id === taskId)
    const blocked = task ? [task.assignee_id, ...taskHeadIds(task)] : []
    const cleanIds = idsWithout(ids, ...blocked)
    const { error } = await supabase.from('tasks').update({ [field]: cleanIds }).eq('id', taskId)
    if (error) {
      console.error(error)
      toast(`Cập nhật ${label} bị lỗi.`, 'error')
      return
    }
    if (task) await notifyAssignmentRecipients(task.id, task.title, task.project_id, cleanIds, label)
    toast(`Đã cập nhật ${label}.`, 'success')
    await refreshDataSilent()
  }

  async function updateTaskAssignee(taskId: string, assigneeId: string | null) {
    const assigneeEmp = employees.find((e) => e.id === assigneeId)
    const deptId = assigneeEmp?.department_id ?? null
    const patch: Record<string, unknown> = { assignee_id: assigneeId }
    if (deptId) patch.department_id = deptId
    const { error } = await supabase.from('tasks').update(patch).eq('id', taskId)
    if (error) {
      console.error(error)
      toast('Cập nhật người phụ trách lỗi.', 'error')
      return
    }
    // Thông báo cho người được phân công
    if (assigneeId && assigneeId !== currentEmployee?.id) {
      const t = tasks.find((x) => x.id === taskId)
      pushNotify([{
        recipient_id: assigneeId,
        actor_id: currentEmployee?.id,
        type: 'task_assigned',
        title: 'Bạn được giao phụ trách một đầu việc',
        body: t?.title || '',
        task_id: taskId,
      }])
      const assigneeEmp = employees.find((e) => e.id === assigneeId)
      if (assigneeEmp?.email && t) {
        sendNotifyEmail({ type: 'task_assigned', to: assigneeEmp.email, toName: assigneeEmp.full_name, taskTitle: t.title, actorName: currentEmployee?.full_name })
      }
      if (t) sendPush([assigneeId], '📌 Bạn được giao việc mới', t.title)
    }
    toast('Đã cập nhật người phụ trách.', 'success')
    await refreshDataSilent()
  }

  async function updateTaskDescription(taskId: string, description: string) {
    const { error } = await supabase
      .from('tasks')
      .update({ description: description.trim() || null })
      .eq('id', taskId)

    if (error) {
      console.error(error)
      toast('Lưu mô tả đầu việc bị lỗi.', 'error')
      return
    }

    toast('Đã lưu mô tả đầu việc.', 'success')
    await refreshDataSilent()
  }

  async function updateTaskSequential(taskId: string, sequential: boolean) {
    const { error } = await supabase.from('tasks').update({ sequential_steps: sequential }).eq('id', taskId)
    if (error) { console.error(error); return }
    await refreshDataSilent()
  }

  // Tự động tính % tiến độ + trạng thái đầu việc từ các bước (automation)
  async function syncTaskProgress(taskId: string) {
    const { data } = await supabase
      .from('task_steps')
      .select('id, is_done, approval_status')
      .eq('task_id', taskId)

    const rows = (data || []) as Pick<TaskStep, 'id' | 'is_done' | 'approval_status'>[]
    if (rows.length === 0) return

    const done = rows.filter((row) => row.approval_status === 'approved').length
    const percent = Math.round((done / rows.length) * 100)
    const hasActivity = rows.some((row) => row.is_done || (row.approval_status && row.approval_status !== 'not_submitted'))

    const { data: freshTask } = await supabase.from('tasks').select('id, status, parent_task_id, project_id').eq('id', taskId).maybeSingle()
    const task = freshTask as Pick<Task, 'id' | 'status' | 'parent_task_id' | 'project_id'> | null
    const patch: Record<string, unknown> = { progress_percent: percent }

    if (percent === 100) {
      patch.status = 'completed'
      patch.completed_date = new Date().toISOString().slice(0, 10)
    } else if (hasActivity && (task?.status === 'not_started' || !task?.status)) {
      patch.status = 'in_progress'
    } else if (percent < 100 && task?.status === 'completed') {
      patch.status = 'in_progress'
      patch.completed_date = null
    }

    await supabase.from('tasks').update(patch).eq('id', taskId)

    // Cascade: workstream cha tự tính % từ các đầu việc con
    if (task?.parent_task_id) {
      const { data: siblings } = await supabase
        .from('tasks')
        .select('id, progress_percent, status')
        .eq('parent_task_id', task.parent_task_id)

      const subRows = (siblings || []) as Pick<Task, 'id' | 'progress_percent' | 'status'>[]
      if (subRows.length > 0) {
        const avg = Math.round(subRows.reduce((sum, row) => sum + (row.progress_percent || 0), 0) / subRows.length)
        const allDone = subRows.every((row) => row.status === 'completed')
        await supabase.from('tasks').update({
          progress_percent: avg,
          ...(allDone ? { status: 'completed', completed_date: new Date().toISOString().slice(0, 10) } : {}),
        }).eq('id', task.parent_task_id)
      }
    }

    // Cascade: dự án tự tính % từ toàn bộ đầu việc
    if (task?.project_id) {
      const { data: projectTasks } = await supabase
        .from('tasks')
        .select('id, progress_percent')
        .eq('project_id', task.project_id)

      const projRows = (projectTasks || []) as Pick<Task, 'id' | 'progress_percent'>[]
      if (projRows.length > 0) {
        const avg = Math.round(projRows.reduce((sum, row) => sum + (row.progress_percent || 0), 0) / projRows.length)
        await supabase.from('projects').update({ progress_percent: avg }).eq('id', task.project_id)
      }
    }
  }

  async function updateStep(step: TaskStep, patch: Partial<TaskStep>) {
    const { error } = await updateTaskStepCompat(step.id, patch as DbPayload)

    if (error) {
      console.error(error)
      toast('Cập nhật bước bị lỗi.', 'error')
      return
    }

    // Ghi timestamp tự động
    if ((patch as Record<string, unknown>).step_in_progress === true && !step.step_started_at) {
      await updateTaskStepCompat(step.id, { step_started_at: new Date().toISOString() } as DbPayload)
    }

    await syncTaskProgress(step.task_id)
    await refreshDataSilent()
  }

  async function submitStep(step: TaskStep) {
    await updateStep(step, {
      approval_status: 'pending',
      approval_stage: 'department',
      department_approval_status: 'pending',
      coo_approval_status: step.requires_coo_approval ? 'not_submitted' : 'not_required',
      ceo_approval_status: step.requires_ceo_approval ? 'not_submitted' : 'not_required',
      submitted_at: new Date().toISOString(),
    } as Partial<TaskStep>)
    const approverIds = stepApproverIds(step).filter((id) => id !== currentEmployee?.id)
    if (approverIds.length > 0) {
      pushNotify(approverIds.map((recipient_id) => ({
        recipient_id,
        actor_id: currentEmployee?.id || null,
        type: 'step_submitted',
        title: 'Có bước chờ bạn duyệt',
        body: step.step_title,
        task_id: step.task_id,
      })))
      const stepTask = tasks.find((t) => t.id === step.task_id)
      approverIds.forEach((approverId) => {
        const approverEmp = employees.find((e) => e.id === approverId)
        if (approverEmp?.email) {
          sendNotifyEmail({ type: 'step_submitted', to: approverEmp.email, toName: approverEmp.full_name, taskTitle: stepTask?.title || '', stepTitle: step.step_title, actorName: currentEmployee?.full_name })
        }
      })
      sendPush(approverIds, 'Có bước chờ bạn duyệt', `${step.step_title} - ${stepTask?.title || ''}`)
    }
    toast('Đã gửi duyệt.', 'info')
  }

  function notifyStepResult(step: TaskStep, title: string, extraRecipient?: string | null, emailType?: 'step_approved' | 'step_revision', revisionNote?: string) {
    const recipients = new Set<string>()
    if (step.owner_id) recipients.add(step.owner_id)
    ;(step.supporter_ids || []).forEach((id) => recipients.add(id))
    if (extraRecipient) recipients.add(extraRecipient)
    recipients.delete(currentEmployee?.id || '')
    pushNotify(Array.from(recipients).map((recipient_id) => ({
      recipient_id,
      actor_id: currentEmployee?.id || null,
      type: 'step_update',
      title,
      body: step.step_title,
      task_id: step.task_id,
    })))
    if (emailType && step.owner_id && step.owner_id !== currentEmployee?.id) {
      const ownerEmp = employees.find((e) => e.id === step.owner_id)
      const stepTask = tasks.find((t) => t.id === step.task_id)
      if (ownerEmp?.email) {
        sendNotifyEmail({ type: emailType, to: ownerEmp.email, toName: ownerEmp.full_name, taskTitle: stepTask?.title || '', stepTitle: step.step_title, actorName: currentEmployee?.full_name, revisionNote })
      }
      const pushTitle = emailType === 'step_approved' ? '✅ Bước được duyệt' : '🔴 Bước cần làm lại'
      const pushBody = revisionNote ? `${step.step_title}: ${revisionNote.slice(0, 80)}` : step.step_title
      sendPush([step.owner_id], pushTitle, pushBody)
    }
  }

  // Ai được duyệt bước ở tầng hiện tại
  function stageApproverId(step: TaskStep): string | null {
    const stage = step.approval_stage || 'department'
    if (stage === 'coo') return step.coo_approver_id || null
    if (stage === 'ceo') return step.ceo_approver_id || null
    return step.department_approver_id || step.approver_id || step.approver_ids?.[0] || null
  }
  function canApproveStep(step: TaskStep): boolean {
    if (!currentEmployee?.id) return false
    // Named approver always wins
    const appId = stageApproverId(step)
    if (appId && appId === currentEmployee.id) return true
    if (stepApproverIds(step).includes(currentEmployee.id)) return true
    // Permission-based: check scope against task's dept
    const stepTask = tasks.find((t) => t.id === step.task_id)
    return can('step', 'approve', { department_id: stepTask?.department_id })
  }

  async function approveCurrentStage(step: TaskStep) {
    if (!canApproveStep(step)) {
      toast('Bạn không có quyền duyệt bước này — chỉ người duyệt cấp trên mới được.', 'warning')
      return
    }
    if (step.approval_status !== 'pending') {
      toast('Bước chưa được người thực hiện gửi duyệt.', 'warning')
      return
    }
    const now = new Date().toISOString()
    const stage = step.approval_stage || 'department'

    if (stage === 'department') {
      if (step.requires_coo_approval) {
        await updateStep(step, {
          department_approval_status: 'approved',
          department_approved_at: now,
          approval_stage: 'coo',
          coo_approval_status: 'pending',
          approval_status: 'pending',
          is_done: false,
        } as Partial<TaskStep>)
        notifyStepResult(step, 'Bước qua cấp phòng ban — chờ COO duyệt', step.coo_approver_id)
        toast('Đã duyệt cấp phòng ban — chuyển lên COO.', 'info')
        return
      }

      if (step.requires_ceo_approval) {
        await updateStep(step, {
          department_approval_status: 'approved',
          department_approved_at: now,
          approval_stage: 'ceo',
          ceo_approval_status: 'pending',
          approval_status: 'pending',
          is_done: false,
        } as Partial<TaskStep>)
        notifyStepResult(step, 'Bước qua cấp phòng ban — chờ CEO duyệt', step.ceo_approver_id)
        toast('Đã duyệt cấp phòng ban — chuyển lên CEO.', 'info')
        return
      }

      await updateStep(step, {
        department_approval_status: 'approved',
        department_approved_at: now,
        approval_status: 'approved',
        approval_note: 'Đã duyệt.',
        is_done: true,
        approved_at: now,
      } as Partial<TaskStep>)
      notifyStepResult(step, 'Bước của bạn đã được duyệt hoàn tất ✓', null, 'step_approved')
      toast('Đã duyệt bước hoàn tất.')
      return
    }

    if (stage === 'coo') {
      if (step.requires_ceo_approval) {
        await updateStep(step, {
          coo_approval_status: 'approved',
          coo_approved_at: now,
          approval_stage: 'ceo',
          ceo_approval_status: 'pending',
          approval_status: 'pending',
          is_done: false,
        } as Partial<TaskStep>)
        notifyStepResult(step, 'COO đã duyệt — chờ CEO duyệt', step.ceo_approver_id)
        toast('COO đã duyệt — chuyển lên CEO.', 'info')
        return
      }

      await updateStep(step, {
        coo_approval_status: 'approved',
        coo_approved_at: now,
        approval_status: 'approved',
        approval_note: 'Đã duyệt.',
        is_done: true,
        approved_at: now,
      } as Partial<TaskStep>)
      notifyStepResult(step, 'COO đã duyệt — bước của bạn hoàn tất ✓', null, 'step_approved')
      toast('COO đã duyệt — bước hoàn tất.')
      return
    }

    await updateStep(step, {
      ceo_approval_status: 'approved',
      ceo_approved_at: now,
      approval_status: 'approved',
      approval_note: 'Đã duyệt.',
      is_done: true,
      approved_at: now,
    } as Partial<TaskStep>)
    notifyStepResult(step, 'CEO đã duyệt — bước của bạn hoàn tất ✓', null, 'step_approved')
    toast('CEO đã duyệt — bước hoàn tất.')
  }

  async function requestRevision(step: TaskStep, explicitNote?: string) {
    if (!canApproveStep(step)) {
      toast('Bạn không có quyền yêu cầu làm lại — chỉ người duyệt cấp trên mới được.', 'warning')
      return
    }
    const note = (explicitNote ?? revisionDrafts[step.id])?.trim()

    if (!note) {
      toast('Nhập lý do cần làm lại trước (bắt buộc ghi rõ chỗ nào sai).', 'warning')
      return
    }

    const stage = step.approval_stage || 'department'
    const stagePatch =
      stage === 'coo'
        ? { coo_approval_status: 'revision', coo_approval_note: note }
        : stage === 'ceo'
          ? { ceo_approval_status: 'revision', ceo_approval_note: note }
          : { department_approval_status: 'revision', department_approval_note: note }

    const { error } = await updateTaskStepCompat(step.id, {
      is_done: false,
      approval_status: 'revision',
      approval_note: note,
      ...stagePatch,
    })

    if (error) {
      console.error(error)
      toast('Yêu cầu làm lại bị lỗi.', 'error')
      return
    }

    await addComment(step.id, note, 'revision')
    notifyStepResult(step, `Bước cần làm lại: ${note.slice(0, 80)}`, null, 'step_revision', note)
    setRevisionDrafts((current) => ({ ...current, [step.id]: '' }))
    toast('Đã gửi yêu cầu làm lại.', 'info')
    await syncTaskProgress(step.task_id)
    await refreshDataSilent()
  }

  async function saveStepLink(step: TaskStep, explicitLink?: string) {
    const link = explicitLink ?? linkDrafts[step.id] ?? step.report_link ?? ''
    await updateStep(step, { report_link: link } as Partial<TaskStep>)
    toast('Đã lưu link báo cáo.', 'info')
  }

  async function saveSupportRequest(step: TaskStep, explicitRequest?: string) {
    const request = explicitRequest ?? supportDrafts[step.id] ?? step.support_request ?? ''

    const { error } = await supabase.from('task_steps').update({ support_request: request }).eq('id', step.id)

    if (error) {
      console.error(error)
      toast('Lưu yêu cầu hỗ trợ bị lỗi.', 'error')
      return
    }

    if (request.trim()) {
      await addComment(step.id, request, 'support_request')
    }

    toast('Đã gửi yêu cầu hỗ trợ.', 'info')
    await refreshDataSilent()
  }

  async function addComment(stepId: string, content?: string, type = 'comment', mentionedEmployeeIds: string[] = []) {
    const text = (content || commentDrafts[stepId] || '').trim()
    if (!text) return

    const { error } = await supabase.from('task_step_comments').insert({
      step_id: stepId,
      employee_id: currentEmployee?.id || null,
      comment: text,
      comment_type: type,
    })

    if (error) {
      console.error(error)
      toast('Gửi bình luận bị lỗi.', 'error')
      return
    }

    setCommentDrafts((current) => ({ ...current, [stepId]: '' }))
    const mentionedIds = Array.from(new Set([
      ...mentionedEmployeeIds,
      ...getMentionedEmployeeIds(text, employees),
    ])).filter((id) => id && id !== currentEmployee?.id)
    const step = steps.find((item) => item.id === stepId)

    if (mentionedIds.length > 0) {
      const mentionTitle = type === 'support_request'
        ? `${currentEmployee?.full_name || 'Có người'} đã tag bạn trong yêu cầu hỗ trợ`
        : `${currentEmployee?.full_name || 'Có người'} đã tag bạn trong bình luận`
      await pushNotify(mentionedIds.map((recipient_id) => ({
        recipient_id,
        actor_id: currentEmployee?.id || null,
        type: 'comment_mention',
        title: mentionTitle,
        body: text.slice(0, 160),
        task_id: step?.task_id || null,
      })))
    }
    await fetchComments()
  }

  async function createSupporter(taskId: string) {
    const employeeId = supporterDrafts[taskId]

    if (!employeeId) {
      toast('Chọn người hỗ trợ trước.', 'warning')
      return
    }

    const { error } = await supabase.from('task_supporters').insert({
      task_id: taskId,
      employee_id: employeeId,
      role_note: 'Hỗ trợ thực hiện',
    })

    if (error) {
      console.error(error)
      toast('Người này đã là hỗ trợ hoặc thêm bị lỗi.', 'error')
      return
    }

    setSupporterDrafts((current) => ({ ...current, [taskId]: '' }))
    // BUG-08: notify the newly added supporter
    const task = tasks.find((t) => t.id === taskId)
    if (employeeId && employeeId !== currentEmployee?.id) {
      await pushNotify([{
        recipient_id: employeeId,
        actor_id: currentEmployee?.id || null,
        type: 'task_assigned',
        title: 'Bạn được thêm làm người hỗ trợ',
        body: task?.title || '',
        task_id: taskId,
      }])
    }
    await refreshDataSilent()
  }

  async function uploadStepFile(step: TaskStep, file?: File) {
    if (!file) return

    setUploading(true)

    const safeName = file.name.replace(/\s+/g, '-')
    const filePath = `${step.id}/${Date.now()}-${safeName}`

    const { error: uploadError } = await supabase.storage.from('step-reports').upload(filePath, file, {
      cacheControl: '3600',
      upsert: false,
    })

    if (uploadError) {
      console.error(uploadError)
      toast('Upload file bước bị lỗi.', 'error')
      setUploading(false)
      return
    }

    const { data } = supabase.storage.from('step-reports').getPublicUrl(filePath)

    const { error } = await supabase
      .from('task_steps')
      .update({
        report_file_url: data.publicUrl,
        report_file_name: file.name,
      })
      .eq('id', step.id)

    setUploading(false)

    if (error) {
      console.error(error)
      toast('Lưu file bước bị lỗi.', 'error')
      return
    }

    await refreshDataSilent()
  }

  async function uploadTaskFile(task: Task, file?: File) {
    if (!file) return

    setUploading(true)

    const safeName = file.name.replace(/\s+/g, '-')
    const filePath = `${task.id}/${Date.now()}-${safeName}`

    const { error: uploadError } = await supabase.storage.from('task-reports').upload(filePath, file, {
      cacheControl: '3600',
      upsert: false,
    })

    if (uploadError) {
      console.error(uploadError)
      toast('Upload file bị lỗi.', 'error')
      setUploading(false)
      return
    }

    const { data } = supabase.storage.from('task-reports').getPublicUrl(filePath)

    const { error } = await supabase.from('task_reports').insert({
      task_id: task.id,
      file_name: file.name,
      file_url: data.publicUrl,
      file_type: file.type || null,
      uploaded_by: currentEmployee?.id || null,
      note: 'File báo cáo / kết quả đầu việc',
    })

    setUploading(false)

    if (error) {
      console.error(error)
      toast('Lưu file bị lỗi.', 'error')
      return
    }

    await fetchReports()
  }

  // -- Deep-link navigation ------------------------------------------------------
  // Gọi từ alert card / notification để nhảy đúng vào item cần xử lý.
  function openCooTarget(opts: CooTarget & { task?: Task | null }) {
    const { task } = opts
    const projectId = opts.projectId ?? task?.project_id ?? null
    // workstreamId = parent của task (nếu là subtask) hoặc chính task nếu là workstream
    const workstreamId = opts.workstreamId ?? (task?.parent_task_id ? task.parent_task_id : (task?.id ?? null))
    const taskId = opts.taskId ?? (task?.parent_task_id ? task.id : null)
    const highlightId = opts.highlightId ?? task?.id ?? workstreamId

    if (projectId) setSelectedProjectId(projectId)
    setView('coo')
    setCooTarget({ projectId, workstreamId, taskId, highlightId })
    if (task) setSelectedTask(task)
  }

  async function deleteProject(project: Project) {
    if (!(await confirmDialog(`Xóa dự án "${project.name}" và toàn bộ đầu việc thuộc dự án này?`))) return

    // Lấy task IDs để xóa cascade children trước
    const { data: projectTasks } = await supabase.from('tasks').select('id').eq('project_id', project.id)
    const taskIds = (projectTasks || []).map((t) => t.id)

    if (taskIds.length > 0) {
      await supabase.from('task_step_comments').delete().in('step_id',
        (await supabase.from('task_steps').select('id').in('task_id', taskIds)).data?.map((s) => s.id) || [])
      await supabase.from('task_steps').delete().in('task_id', taskIds)
      await supabase.from('task_supporters').delete().in('task_id', taskIds)
      await supabase.from('task_reports').delete().in('task_id', taskIds)
    }

    const { error: tasksError } = await supabase.from('tasks').delete().eq('project_id', project.id)

    if (tasksError) {
      console.error(tasksError)
      toast('Xóa các đầu việc thuộc dự án bị lỗi.', 'error')
      return
    }

    const { error } = await supabase.from('projects').delete().eq('id', project.id)

    if (error) {
      console.error(error)
      toast('Xóa dự án bị lỗi.', 'error')
      return
    }

    if (selectedProjectId === project.id) {
      setSelectedProjectId('all')
    }

    if (selectedTask?.project_id === project.id) {
      setSelectedTask(null)
    }

    toast('Đã xóa dự án.')
    await fetchAll({ silent: true })
  }

  async function deleteTask(task: Task) {
    const label = isWorkstream(task) ? 'đầu việc lớn' : 'đầu việc con'
    if (!(await confirmDialog(`Xóa ${label} "${task.title}"?`))) return

    // Thu thập tất cả task IDs cần xóa (task + subtasks)
    const subtaskIds = tasks.filter((t) => t.parent_task_id === task.id).map((t) => t.id)
    const allTaskIds = [task.id, ...subtaskIds]

    // Xóa cascade: comments -> steps -> supporters -> reports -> tasks
    const { data: stepRows } = await supabase.from('task_steps').select('id').in('task_id', allTaskIds)
    const stepIds = (stepRows || []).map((s) => s.id)
    if (stepIds.length > 0) {
      await supabase.from('task_step_comments').delete().in('step_id', stepIds)
    }
    await supabase.from('task_steps').delete().in('task_id', allTaskIds)
    await supabase.from('task_supporters').delete().in('task_id', allTaskIds)
    await supabase.from('task_reports').delete().in('task_id', allTaskIds)
    if (subtaskIds.length > 0) {
      await supabase.from('tasks').delete().in('id', subtaskIds)
    }

    const { error } = await supabase.from('tasks').delete().eq('id', task.id)

    if (error) {
      console.error(error)
      toast(`Xóa ${label} bị lỗi.`, 'error')
      return
    }

    if (selectedWorkstreamId === task.id) {
      setSelectedWorkstreamId('')
    }

    if (selectedTask?.id === task.id) {
      setSelectedTask(null)
    }

    toast(`Đã xóa ${label}.`)
    await refreshDataSilent()
  }

  async function deleteStep(step: TaskStep) {
    if (!(await confirmDialog(`Xóa bước "${step.step_title}"?`))) return

    const { error } = await supabase.from('task_steps').delete().eq('id', step.id)

    if (error) {
      console.error(error)
      toast('Xóa bước bị lỗi.', 'error')
      return
    }

    await syncTaskProgress(step.task_id)
    await refreshDataSilent()
  }

  async function deleteSupporter(supporter: TaskSupporter) {
    const name = supporter.employees?.full_name || 'người hỗ trợ này'
    if (!(await confirmDialog(`Xóa ${name} khỏi danh sách hỗ trợ?`))) return

    const { error } = await supabase.from('task_supporters').delete().eq('id', supporter.id)

    if (error) {
      console.error(error)
      toast('Xóa người hỗ trợ bị lỗi.', 'error')
      return
    }

    await refreshDataSilent()
  }

  async function deleteTaskReport(report: TaskReport) {
    if (!(await confirmDialog(`Xóa file báo cáo "${report.file_name}"?`))) return

    const { error } = await supabase.from('task_reports').delete().eq('id', report.id)

    if (error) {
      console.error(error)
      toast('Xóa file báo cáo bị lỗi.', 'error')
      return
    }

    await fetchReports()
  }

  async function clearStepFile(step: TaskStep) {
    if (!(await confirmDialog(`Xóa file báo cáo của bước "${step.step_title}"?`))) return

    const { error } = await supabase
      .from('task_steps')
      .update({
        report_file_url: null,
        report_file_name: null,
      })
      .eq('id', step.id)

    if (error) {
      console.error(error)
      toast('Xóa file trong bước bị lỗi.', 'error')
      return
    }

    await refreshDataSilent()
  }

  function handleMeetingFile(file?: File) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setMeetingRaw(String(reader.result || ''))
    reader.readAsText(file)
  }

  async function analyzeMeetingWithAI() {
    if (!meetingRaw.trim()) { toast('Dán nội dung biên bản vào ô ⑨ trước.', 'warning'); return }
    setAnalyzing(true)
    try {
      const res = await fetch('/api/analyze-meeting', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: meetingRaw }) })
      const data = await res.json()
      if (!data.ok) { toast(data.error || 'Phân tích AI lỗi.', 'error'); setAnalyzing(false); return }
      const result = data.result || {}
      const rows: NotexRow[] = []
      for (const ws of (result.workstreams || [])) {
        for (const st of (ws?.subtasks || [])) {
          const owner = String(st?.owner || '').trim()
          const empIds = guessEmployeeIds(owner, employees)
          const emp = employees.find((e) => e.id === empIds[0])
          rows.push({
            id: `ai-${rows.length}-${Date.now()}`,
            workstreamTitle: ws?.title || 'Đầu việc lớn',
            subtaskTitle: st?.title || 'Đầu việc',
            responsibility: owner,
            expectedOutput: '',
            departmentId: '',
            headId: emp?.id || '',
            assigneeId: emp?.id || '',
            coOwnerIds: empIds.slice(1),
            supporterIds: [],
            reviewerIds: [],
            dueDate: st?.deadline && st.deadline !== 'null' ? String(st.deadline) : '',
            priority: 'medium',
          })
        }
      }
      setNotexRows(rows)
      setNotexProjectName((current) => current || result?.project?.name || meetingTitle || 'Dự án từ biên bản')
      toast(`AI tạo ${rows.length} đầu việc — kiểm tra rồi bấm Import.`)
    } catch {
      toast('Không gọi được phân tích AI.', 'error')
    }
    setAnalyzing(false)
  }

  function splitNotexRows() {
    // Generate rows from structured assignments
    const assignmentRows: NotexRow[] = []
    for (const asgn of meetingRecap.assignments) {
      const taskLines = asgn.tasks.split(/\n|·/).map((s) => s.trim()).filter(Boolean)
      if (taskLines.length === 0) continue
      const emp = employees.find((e) => e.id === asgn.personId)
      const ws = meetingTitle || 'Đầu việc từ biên bản'
      for (const line of taskLines) {
        assignmentRows.push({
          id: Math.random().toString(36).slice(2),
          workstreamTitle: ws,
          subtaskTitle: line,
          responsibility: asgn.personName || emp?.full_name || '',
          expectedOutput: '',
          departmentId: emp?.department_id || '',
          headId: asgn.personId,
          assigneeId: asgn.personId,
          coOwnerIds: [],
          supporterIds: [],
          reviewerIds: [],
          dueDate: asgn.deadline || '',
          priority: 'medium',
        })
      }
    }

    if (assignmentRows.length > 0) {
      setNotexRows(assignmentRows)
      setNotexProjectName((current) => current || meetingTitle || 'Dự án từ biên bản')
      return
    }

    // Fallback: parse from raw text if structured assignments empty
    const rows = parseNotexText(meetingRaw, departments, employees)
    if (rows.length === 0) {
      toast('Chưa có phân công nào để tách. Điền bảng Phân công trước.', 'warning')
      return
    }
    setNotexRows(rows)
    setNotexProjectName((current) => current || meetingTitle || 'Dự án từ biên bản')
  }

  async function importNotexRows() {
    const projectName = notexProjectName.trim()

    if (!projectName) {
      toast('Nhập tên dự án import trước.', 'warning')
      return
    }

    if (notexRows.length === 0) {
      toast('Chưa có dòng preview để import.', 'warning')
      return
    }

    setImporting(true)

    try {
      let projectId = projects.find((project) => project.name.trim().toLowerCase() === projectName.toLowerCase())?.id

      if (!projectId) {
        const firstRow = notexRows[0]
        const projectPeople = uniqueIds(
          notexRows.map((row) => row.headId),
          notexRows.map((row) => row.assigneeId),
          notexRows.flatMap((row) => row.coOwnerIds),
          notexRows.flatMap((row) => row.supporterIds),
          notexRows.flatMap((row) => row.reviewerIds),
        )
        const { data, error } = await supabase
          .from('projects')
          .insert({
            name: projectName,
            code: null,
            description: `Import từ biên bản: ${meetingTitle}`,
            owner_id: firstRow.headId || firstRow.assigneeId || employees[0]?.id || null,
            department_id: firstRow.departmentId || departments[0]?.id || null,
            status: 'not_started',
            priority: 'medium',
            progress_percent: 0,
            issue_status: 'normal',
            member_ids: projectPeople,
          })
          .select('id')
          .single()

        if (error) {
          console.error(error)
          toast('Tạo dự án từ Notex bị lỗi.', 'error')
          setImporting(false)
          return
        }

        projectId = data.id as string
      }

      const workstreamIds = new Map<string, string>()
      const allInsertedTaskIds: string[] = []  // workstream + subtask IDs để link vào session
      const approvalNotices: Array<{ recipient_id: string; title: string; body: string; task_id: string; project_id: string }> = []

      for (const row of notexRows) {
        const workstreamTitle = normalizeWorkstreamTitle(row.workstreamTitle)
        const workstreamKey = workstreamTitle.toLowerCase()
        let workstreamId = workstreamIds.get(workstreamKey)

        if (!workstreamId) {
          const { data, error } = await supabase
            .from('tasks')
            .insert({
              title: workstreamTitle,
              description: `Import từ Notex: ${meetingTitle}`,
              parent_task_id: null,
              task_level: 'workstream',
              status: 'not_started',
              priority: row.priority || 'medium',
              progress_percent: 0,
              due_date: row.dueDate || null,
              department_id: row.departmentId || null,
              assignee_id: row.assigneeId || null,
              head_id: row.headId || row.assigneeId || null,
              head_ids: row.headId ? [row.headId] : row.assigneeId ? [row.assigneeId] : null,
              co_owner_ids: idsWithout(row.coOwnerIds || [], row.assigneeId, row.headId),
              supporter_ids: idsWithout(row.supporterIds || [], row.assigneeId, row.headId),
              approver_ids: idsWithout(row.reviewerIds || [], row.assigneeId),
              project_id: projectId,
              issue_status: 'normal',
              approval_status: 'not_submitted',
            })
            .select('id')
            .single()

          if (error) {
            console.error(error)
            toast(`Tạo đầu việc lớn "${workstreamTitle}" bị lỗi.`, 'error')
            setImporting(false)
            return
          }

          workstreamId = data.id as string
          workstreamIds.set(workstreamKey, workstreamId)
          allInsertedTaskIds.push(workstreamId)
        }

        const { data: subtask, error: subtaskError } = await supabase
          .from('tasks')
          .insert({
            title: row.subtaskTitle.trim(),
            description: buildNotexDescription(row),
            parent_task_id: workstreamId,
            task_level: 'subtask',
            status: 'pending_approval',
            priority: row.priority || 'medium',
            progress_percent: 0,
            due_date: row.dueDate || null,
            department_id: row.departmentId || null,
            assignee_id: row.assigneeId || null,
            head_id: row.headId || row.assigneeId || null,
            head_ids: row.headId ? [row.headId] : row.assigneeId ? [row.assigneeId] : null,
            co_owner_ids: idsWithout(row.coOwnerIds || [], row.assigneeId, row.headId),
            supporter_ids: idsWithout(row.supporterIds || [], row.assigneeId, row.headId),
            approver_ids: idsWithout(row.reviewerIds || [], row.assigneeId),
            reviewer_ids: idsWithout(row.reviewerIds || [], row.assigneeId),
            project_id: projectId,
            issue_status: 'normal',
            approval_status: 'not_submitted',
          })
          .select('id')
          .single()

        if (subtaskError) {
          console.error(subtaskError)
          toast(`Tạo đầu việc con "${row.subtaskTitle}" bị lỗi.`, 'error')
          setImporting(false)
          return
        }

        const subtaskId = subtask.id as string
        allInsertedTaskIds.push(subtaskId)
        const departmentApproverId = getDefaultDepartmentApprover(row.departmentId || null, departments, employees)
        const cooApproverId = getCooApprover(employees)
        const ceoApproverId = getCeoApprover(employees)
        const stepRows = [
          'Làm rõ yêu cầu và chuẩn đầu ra',
          'Thực hiện và cập nhật kết quả',
          'Gửi file/link báo cáo để duyệt',
        ].map((title, index) => ({
          task_id: subtaskId,
          step_title: title,
          step_order: index + 1,
          is_done: false,
          owner_id: row.assigneeId || null,
          supporter_ids: idsWithout(uniqueIds(row.supporterIds || [], row.coOwnerIds || []), row.assigneeId),
          approver_id: departmentApproverId || null,
          approver_ids: uniqueIds(row.reviewerIds || [], departmentApproverId ? [departmentApproverId] : []),
          department_approver_id: departmentApproverId || null,
          coo_approver_id: cooApproverId || null,
          ceo_approver_id: ceoApproverId || null,
          requires_coo_approval: false,
          requires_ceo_approval: false,
          approval_stage: 'department',
          department_approval_status: 'not_submitted',
          coo_approval_status: 'not_required',
          ceo_approval_status: 'not_required',
          due_date: row.dueDate || null,
          approval_status: 'not_submitted',
        }))

        const { error: stepsError } = await insertTaskStepsCompat(stepRows)

        if (stepsError) {
          console.error(stepsError)
          toast(`Tạo bước cho "${row.subtaskTitle}" bị lỗi.`, 'error')
          setImporting(false)
          return
        }

        // Gom thông báo cho người duyệt phân công (trưởng bộ phận / head)
        const approverIds = uniqueIds(row.reviewerIds || [], row.headId ? [row.headId] : [], departmentApproverId ? [departmentApproverId] : [])
          .filter((id) => id !== currentEmployee?.id)
        approverIds.forEach((recipientId) => {
          approvalNotices.push({
            recipient_id: recipientId,
            title: 'Phân công mới chờ bạn duyệt',
            body: row.subtaskTitle.trim(),
            task_id: subtaskId,
            project_id: projectId,
          })
        })
      }

      // Gửi thông báo duyệt phân công
      await pushNotify(approvalNotices.map((n) => ({ ...n, actor_id: currentEmployee?.id || null, type: 'assignment_approval' })))

      // Nếu chọn lịch định kỳ → tạo meeting_sessions record rồi gắn meeting_session_id vào tasks
      const scheduleId = notexScheduleId.trim()
      const occurredAt = notexOccurredAt.trim() || new Date().toISOString().slice(0, 10)
      if (scheduleId) {
        try {
          const { data: sessionData } = await supabase.from('meeting_sessions').insert({
            schedule_id: scheduleId,
            title: `${meetingTitle} - ${occurredAt}`,
            occurred_at: occurredAt,
            status: 'completed',
            recap: meetingRecap?.notes || null,
            linked_task_ids: allInsertedTaskIds,  // cả workstream + subtask IDs
            decisions: [],
            pending_issues: [],
            action_items: [],
            department_ids: [],
            participant_ids: [],
            created_by: currentEmployee?.id || null,
          }).select('id').single()

          // Batch-update meeting_session_id trên tất cả tasks đã tạo
          if (sessionData?.id && allInsertedTaskIds.length > 0) {
            await supabase.from('tasks')
              .update({ meeting_session_id: sessionData.id })
              .in('id', allInsertedTaskIds)
          }
          await fetchMeetingSessions()
        } catch {
          // non-blocking — table / column chưa migrate thì bỏ qua
        }
      }

      await fetchAll({ silent: true })
      setNotexRows([])
      setView('coo')
      setSelectedProjectId(projectId)
      toast(`Import thành công — ${approvalNotices.length} việc đã gửi cấp trên duyệt phân công.${scheduleId ? ' Đã lưu lịch sử cuộc họp.' : ''}`)
    } finally {
      setImporting(false)
    }
  }

  async function saveMeeting() {
    if (!meetingTitle.trim()) {
      toast('Nhập tên biên bản họp trước.', 'warning')
      return
    }

    const structured = JSON.stringify(meetingRecap)
    const { error } = await supabase.from('meeting_minutes').insert({
      title: meetingTitle,
      raw_content: meetingRaw || structured,
      summary: structured,
    })

    if (error) {
      console.error(error)
      toast('Lưu biên bản bị lỗi.', 'error')
      return
    }

    setMeetingRaw('')
    toast('Đã lưu biên bản họp.')
  }

  async function saveAssistantReport(type: string, title: string, content: string) {
    await supabase.from('coo_assistant_reports').insert({
      report_type: type,
      title,
      content,
      created_by: currentEmployee?.id || null,
    })
  }

  function showAssistantReport(type: string, title: string, content: string) {
    setAssistantOutput(content)
    saveAssistantReport(type, title, content)
  }

  function generateDailyReport() {
    showAssistantReport('daily_report', 'Báo cáo COO hôm nay', buildDailyReport(tasks, steps, projectCards, urgentTasks))
  }

  function generateFollowUpReport() {
    showAssistantReport('follow_up_report', 'Việc cần hối thúc', buildFollowUpReport(urgentTasks, employeeMap, projectMap))
  }

  function generatePendingApprovalReport() {
    showAssistantReport(
      'pending_approval_report',
      'Việc chờ duyệt',
      buildStepReport('VIỆC CHỜ DUYỆT', getPendingApprovalSteps(steps), tasks, employeeMap, 'pending')
    )
  }

  function generateRevisionReport() {
    showAssistantReport(
      'revision_report',
      'Việc cần làm lại',
      buildStepReport('VIỆC CẦN LÀM LẠI', getRevisionSteps(steps), tasks, employeeMap, 'revision')
    )
  }

  function generateMissingReportFileReport() {
    showAssistantReport(
      'missing_report_file_report',
      'Việc thiếu file/link báo cáo',
      buildStepReport('VIỆC THIẾU FILE/LINK BÁO CÁO', getMissingReportSteps(steps), tasks, employeeMap, 'missing_report')
    )
  }

  function generatePeopleReport() {
    showAssistantReport('people_report', 'Báo cáo theo nhân sự', buildPeopleReport(peopleReports))
  }

  function generateProjectReport() {
    showAssistantReport('project_report', 'Báo cáo theo dự án', buildProjectReport(projectCards))
  }

  function getStatusLabel(status: string) {
    const map: Record<string, string> = {
      not_started: 'Chưa bắt đầu',
      in_progress: 'Đang làm',
      pending: 'Pending',
      pending_approval: 'Chờ duyệt phân công',
      completed: 'Hoàn thành',
      overdue: 'Trễ deadline',
    }

    return map[status] || status
  }

  const employeeMap = useMemo(() => new Map(employees.map((item) => [item.id, item])), [employees])
  const departmentMap = useMemo(() => new Map(departments.map((item) => [item.id, item])), [departments])
  const projectMap = useMemo(() => new Map(projects.map((item) => [item.id, item])), [projects])

  const stepsByTask = useMemo(() => {
    const map = new Map<string, TaskStep[]>()

    steps.forEach((step) => {
      const list = map.get(step.task_id) || []
      list.push(step)
      list.sort((a, b) => a.step_order - b.step_order)
      map.set(step.task_id, list)
    })

    return map
  }, [steps])

  const commentsByStep = useMemo(() => {
    const map = new Map<string, StepComment[]>()

    comments.forEach((comment) => {
      const list = map.get(comment.step_id) || []
      list.push(comment)
      map.set(comment.step_id, list)
    })

    return map
  }, [comments])

  const supportersByTask = useMemo(() => {
    const map = new Map<string, TaskSupporter[]>()

    supporters.forEach((supporter) => {
      const list = map.get(supporter.task_id) || []
      list.push(supporter)
      map.set(supporter.task_id, list)
    })

    return map
  }, [supporters])

  const reportsByTask = useMemo(() => {
    const map = new Map<string, TaskReport[]>()

    reports.forEach((report) => {
      const list = map.get(report.task_id) || []
      list.push(report)
      map.set(report.task_id, list)
    })

    return map
  }, [reports])

  const tasksByParent = useMemo(() => {
    const map = new Map<string, Task[]>()

    tasks.forEach((task) => {
      if (!task.parent_task_id) return
      const list = map.get(task.parent_task_id) || []
      list.push(task)
      map.set(task.parent_task_id, list)
    })

    return map
  }, [tasks])

  // Tất cả đầu việc lớn (không lọc theo dự án) — dùng cho cây COO Board
  const allWorkstreams = tasks.filter(isWorkstream)

  const workstreams = allWorkstreams.filter(
    (task) => selectedProjectId === 'all' || task.project_id === selectedProjectId
  )

  const selectedWorkstream = workstreams.find((task) => task.id === selectedWorkstreamId) || workstreams[0]
  const selectedSubtasks = selectedWorkstream ? tasksByParent.get(selectedWorkstream.id) || [] : []

  const projectCards = projects.map((project) => {
    const projectWorkstreams = tasks.filter(
      (task) => task.project_id === project.id && isWorkstream(task)
    )

    const projectTasks = tasks.filter((task) => task.project_id === project.id)

    return {
      ...project,
      total: projectTasks.length,
      done: projectTasks.filter((task) => task.status === 'completed').length,
      overdue: projectTasks.filter((task) => isTaskOverdue(task)).length,
      problem: projectTasks.filter((task) => isTaskProblem(task)).length,
      rate: calculateProjectProgress(projectWorkstreams, tasksByParent, stepsByTask),
      health: calculateProjectHealth(project.id, tasks, steps, stepsByTask),
    }
  })

  const peopleReports = employees.map((employee) => {
    const relatedTasks = tasks.filter((task) =>
      taskParticipantIds(task, supportersByTask.get(task.id) || []).includes(employee.id)
    )
    const mainTasks = tasks.filter((task) => task.assignee_id === employee.id)
    const coOwnedTasks = tasks.filter((task) => taskCoOwnerIds(task).includes(employee.id))
    const supportedTasks = tasks.filter((task) =>
      taskSupporterIds(task, supportersByTask.get(task.id) || []).includes(employee.id)
    )
    const approvalTasks = tasks.filter((task) => taskApproverIds(task).includes(employee.id))
    const done = relatedTasks.filter((task) => task.status === 'completed').length
    const weighted = tasks.reduce((sum, task) =>
      sum + weightedTaskLoad(task, employee.id, supportersByTask.get(task.id) || []), 0)
    const assignedTasks = tasks.filter((task) => taskHeadIds(task).includes(employee.id))

    return {
      employee,
      total: relatedTasks.length,
      done,
      doing: relatedTasks.filter((task) => task.status === 'in_progress').length,
      pending: relatedTasks.filter((task) => task.status === 'pending').length,
      overdue: relatedTasks.filter((task) => isTaskOverdue(task)).length,
      problem: relatedTasks.filter((task) => isTaskProblem(task)).length,
      rate: relatedTasks.length === 0 ? 0 : Math.round((done / relatedTasks.length) * 100),
      main: mainTasks.length,
      coOwned: coOwnedTasks.length,
      supported: supportedTasks.length,
      approvals: approvalTasks.length,
      weighted: Math.round(weighted * 10) / 10,
      assigned: assignedTasks.length,
      assignedDone: assignedTasks.filter((task) => task.status === 'completed').length,
      assignedDoing: assignedTasks.filter((task) => task.status === 'in_progress').length,
      assignedOverdue: assignedTasks.filter((task) => isTaskOverdue(task)).length,
      assignedTasks,
    }
  })

  const urgentTasks = tasks
    .filter((task) => isTaskOverdue(task) || isTaskProblem(task) || isTaskSlow(task, stepsByTask.get(task.id) || []) || isDeadlineActionNeeded(task) || (!task.due_date && task.status !== 'completed'))
    .slice(0, 20)

  const visibleTasks = useMemo(
    () => filterTasksByRole(currentEmployee, tasks, supporters, steps),
    [currentEmployee, tasks, supporters, steps]
  )

  const visibleProjects = useMemo(() => {
    if (!currentEmployee?.id) return projects
    const role = currentEmployee.role || 'employee'
    // CEO/COO/Admin thấy tất cả
    if (role === 'ceo' || role === 'coo' || role === 'admin') return projects
    if (currentEmployee.can_view_all) return projects
    // Dept head / employee: chỉ thấy project có task liên quan
    const visibleProjectIds = new Set(visibleTasks.map((t) => t.project_id).filter(Boolean))
    return projects.filter(
      (p) => visibleProjectIds.has(p.id) || projectParticipantIds(p).includes(currentEmployee.id)
    )
  }, [currentEmployee, projects, visibleTasks])

  // Cảnh báo trễ hạn tự động một lần sau khi dữ liệu tải xong
  const overdueWarnedRef = useRef(false)
  useEffect(() => {
    if (overdueWarnedRef.current || loading || !authChecked || visibleTasks.length === 0) return
    overdueWarnedRef.current = true
    const overdueCount = visibleTasks.filter((task) => isTaskOverdue(task)).length
    if (overdueCount > 0) {
      toast(`Có ${overdueCount} đầu việc đang trễ deadline — cần xử lý.`, 'warning')
    }
  }, [loading, authChecked, visibleTasks])

  // Các bước đang chờ chính user này duyệt (inbox duyệt nhanh)
  const pendingForMe = useMemo(() => {
    if (!currentEmployee?.id) return []
    return steps.filter((step) => {
      // Kết quả chờ duyệt
      if (step.approval_status !== 'pending') return false
      return stepApproverIds(step).includes(currentEmployee.id)
    })
  }, [steps, currentEmployee])

  async function approveAssignment(task: Task) {
    const { error } = await supabase.from('tasks').update({ status: 'not_started' }).eq('id', task.id)
    if (error) { toast('Duyệt phân công bị lỗi.', 'error'); return }
    const participantIds = taskParticipantIds(task, supportersByTask.get(task.id) || [])
      .filter((id) => id !== currentEmployee?.id)
    const notices = participantIds.map((recipientId) => ({
        recipient_id: recipientId,
        actor_id: currentEmployee?.id || null,
        type: 'assigned',
        title: 'Bạn được giao việc mới',
        body: task.title,
        task_id: task.id,
        project_id: task.project_id,
      }))
    await pushNotify(notices)
    toast('Đã duyệt — việc được chia xuống người làm.')
    await fetchAll({ silent: true })
  }

  async function rejectAssignment(task: Task) {
    const ok = await confirmDialog(`Trả lại việc "${task.title}"? Việc sẽ bỏ người được giao, chờ phân công lại.`)
    if (!ok) return
    const { error } = await supabase.from('tasks').update({ status: 'not_started', assignee_id: null }).eq('id', task.id)
    if (error) { toast('Trả lại bị lỗi.', 'error'); return }
    toast('Đã trả lại — việc chưa giao cho ai.')
    await fetchAll({ silent: true })
  }

  // Tìm kiếm nhanh toàn cục: dự án + đầu việc
  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (query.length < 2) return { projects: [] as Project[], tasks: [] as Task[] }
    return {
      projects: visibleProjects.filter((p) => p.name.toLowerCase().includes(query)).slice(0, 4),
      tasks: visibleTasks.filter((t) => t.title.toLowerCase().includes(query)).slice(0, 6),
    }
  }, [searchQuery, visibleProjects, visibleTasks])

  // --- Permission system ------------------------------------------------------
  const role = currentEmployee?.role || 'employee'
  const isDeptHead = role === 'department_head' || Boolean(currentEmployee?.is_department_head)
  const isTopLevel = role === 'ceo' || role === 'coo' || role === 'admin'
  // kept for legacy UI guards that haven't been migrated yet
  const canManageAll = isTopLevel

  /**
   * can(resource, action, ctx?) — check quyền từ role_permissions DB.
   * ctx cho phép check scope own_dept / assigned.
   */
  function can(
    resource: string,
    action: string,
    ctx?: { department_id?: string | null; assignee_id?: string | null; head_id?: string | null }
  ): boolean {
    // Hardcoded fallback: Admin always has full access regardless of DB state
    if (role === 'admin') return true
    // CEO/COO: full access to all operational resources, but not admin_panel (user management) by default
    if (role === 'ceo' || role === 'coo') {
      if (resource === 'admin_panel') return false
      return true
    }
    // DB-driven permissions for department_head and employee
    const perm = permissions.find(p => p.role === role && p.resource === resource && p.action === action)
    if (!perm || perm.scope === 'none') return false
    if (perm.scope === 'all') return true
    if (!ctx || !currentEmployee) return false
    if (perm.scope === 'own_dept') return !!ctx.department_id && ctx.department_id === currentEmployee.department_id
    if (perm.scope === 'assigned') return ctx.assignee_id === currentEmployee.id || ctx.head_id === currentEmployee.id
    return false
  }

  const canCreateUsers = can('admin_panel', 'use') || Boolean(currentEmployee?.can_manage_users)
  const canCreateProject = can('project', 'create')
  const canCreateWorkstream = can('workstream', 'create')

  function canCreateSubtask(task: Task): boolean {
    return can('subtask', 'create', { department_id: task.department_id, head_id: task.head_id })
  }

  const canDeleteTask = can('workstream', 'delete') || can('subtask', 'delete')

  function canCreateStep(task: Task): boolean {
    return can('step', 'create', { department_id: task.department_id, assignee_id: task.assignee_id, head_id: task.head_id })
  }

  // Phân công chờ tôi duyệt
  const assignmentsForMe = useMemo(() => {
    if (!currentEmployee?.id) return []
    return tasks.filter((t) => {
      if (t.status !== 'pending_approval') return false
      if (can('workstream', 'edit', { department_id: t.department_id })) return true
      if (t.head_id === currentEmployee.id) return true
      return false
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, currentEmployee, permissions])

  const isEmployee = role === 'employee'
  const allMenuItems: { key: ViewKey; label: string; icon: React.ReactNode; hide?: boolean }[] = [
    // Dashboard: Admin/CEO/COO thấy toàn công ty; Dept Head thấy phòng ban; Employee ẩn
    { key: 'dashboard', label: 'Thống kê', icon: <Ico d={IC.activity} size={18}/>, hide: isEmployee },
    // COO Board: chỉ CEO/COO/Admin
    { key: 'coo', label: 'COO Board', icon: <Ico d={IC.layers} size={18}/>, hide: !canManageAll },
    // Dự án: Employee không thấy (họ dùng Việc được giao)
    { key: 'projects', label: 'Dự án', icon: <Ico d={IC.folder} size={18}/>, hide: isEmployee },
    { key: 'calendar', label: 'Lịch công việc', icon: <Ico d={IC.calendar} size={18}/> },
    { key: 'assigned', label: 'Việc được giao', icon: <Ico d={IC.clock} size={18}/> },
    { key: 'tasks', label: 'Công việc', icon: <Ico d={IC.clipboard} size={18}/> },
    { key: 'meeting', label: 'Biên bản họp', icon: <Ico d={IC.messageSquare} size={18}/> },
    { key: 'recurring', label: 'Việc định kỳ', icon: <Ico d={IC.clock} size={18}/> },
    { key: 'automation', label: 'Nhắc tự động', icon: <Ico d={IC.zap} size={18}/>, hide: !canManageAll },
    { key: 'assistant', label: 'COO Assistant', icon: <Ico d={IC.zap} size={18}/>, hide: !isTopLevel },
    // Quản lý nhân sự: chỉ Admin (CEO/COO có thể xem nhưng không quản lý user)
    { key: 'admin', label: 'Quản lý nhân sự', icon: <Ico d={IC.users} size={18}/>, hide: !can('admin_panel','use') },
    { key: 'feedback', label: 'Góp ý hệ thống', icon: <Ico d={IC.messageSquare} size={18}/> },
    { key: 'import', label: 'Nhập Excel', icon: <Ico d={IC.clipboard} size={18}/>, hide: !can('import','use') },
    { key: 'history', label: 'Lịch sử & Restore', icon: <Ico d={IC.clock} size={18}/>, hide: !can('import','use') },
    // Phân quyền: chỉ Admin
    { key: 'permissions', label: 'Phân quyền', icon: <Ico d={IC.shield} size={18}/>, hide: !can('admin_panel','use') },
  ]
  const menu = allMenuItems.filter((item) => !item.hide)
  const primaryAction =
    view === 'recurring' ? {
      label: '+ Tạo định kỳ',
      title: 'Tạo việc định kỳ',
      disabled: false,
      onClick: () => {
        resetRecurringForm()
        setRecurringPanelOpen(true)
      },
    } :
    view === 'projects' && canCreateProject ? {
      label: '+ Tạo dự án',
      title: 'Tạo dự án',
      disabled: false,
      onClick: () => {
        setCreateTab('project')
        setCreateOpen(true)
      },
    } :
    (view === 'dashboard' || view === 'coo' || view === 'tasks') && canCreateWorkstream ? {
      label: '+ Tạo đầu việc',
      title: 'Tạo đầu việc lớn',
      disabled: false,
      onClick: () => {
        if (SOLO_PILOT_MODE && currentEmployee?.id) setWorkHeadIds([currentEmployee.id])
        setCreateTab('workstream')
        setCreateOpen(true)
      },
    } :
    view === 'automation' && canManageAll ? {
      label: recurringWorkerRunning ? 'Đang kiểm tra...' : 'Kiểm tra nhắc',
      title: 'Kiểm tra bộ nhắc tự động',
      disabled: recurringWorkerRunning,
      onClick: runRecurringReminderWorker,
    } :
    null

  if (!authChecked) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--bg-base)]">
        <div className="text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--bg-card)] text-2xl font-extrabold text-[var(--text-primary)] mx-auto">
            V
          </div>
          <p className="text-sm font-bold text-[var(--text-secondary)]">Đang xác thực...</p>
        </div>
      </main>
    )
  }

  return (
    <main className="vyvy-app-shell min-h-screen text-[var(--text-primary)]">
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      <aside
        className={`fixed left-0 top-0 z-50 h-screen transition-all duration-200
          vyvy-sidebar text-[rgba(241,237,228,0.85)]
          ${mobileNavOpen ? 'w-[260px]' : 'w-0 overflow-hidden'}
          md:w-[64px] md:overflow-visible ${collapsed ? 'md:w-[64px]' : 'md:w-[240px]'}`}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-center border-b border-[var(--hair-d)] p-3 md:justify-between md:p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--ivory)] font-display text-base text-[var(--olive)] shadow-[0_2px_8px_rgba(0,0,0,0.3)]">
                V
              </div>
              {!collapsed && (
                <div className="hidden md:block">
                  <h1 className="font-display text-sm tracking-wide text-[var(--ivory)]">VyVy WorkOS</h1>
                  <p className="font-spec text-[9px] text-[rgba(241,237,228,0.45)]">The Haute Couture of Care</p>
                </div>
              )}
            </div>
            <button type="button"
              onClick={() => setCollapsed(!collapsed)}
              className="hidden rounded-[var(--radius-sm)] p-1.5 text-[rgba(241,237,228,0.45)] hover:bg-[rgba(241,237,228,0.08)] hover:text-[var(--ivory)] md:block"
            >
              {collapsed ? <ChevronRight size={14}/> : <ChevronRight size={14} className="rotate-180"/>}
            </button>
          </div>

          <nav className="flex-1 space-y-0.5 p-2 md:p-3 overflow-y-auto">
            {menu.map((item) => (
              <button type="button"
                key={item.key}
                onClick={() => { setView(item.key); setMobileNavOpen(false) }}
                title={item.label}
                className={`relative flex w-full items-center gap-3 rounded-[var(--radius-sm)] px-3 py-2.5 text-sm font-medium transition-all ${
                  view === item.key
                    ? 'bg-[var(--sidebar-active)] text-[var(--lime)]'
                    : 'text-[var(--sidebar-text)] hover:bg-[rgba(255,255,255,.06)] hover:text-[var(--sidebar-text-active)]'
                }`}
              >
                <span className="shrink-0">{item.icon}</span>
                <span className={`${collapsed ? 'md:hidden' : ''} truncate font-[var(--font-label)] uppercase tracking-[0.06em] text-[11px]`}>{item.label}</span>
                {view === item.key && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-5 rounded-r bg-[var(--lime)]" />}
              </button>
            ))}
          </nav>

          <div className="border-t border-[var(--hair-d)] p-2 md:p-3 space-y-1">
            <div className="flex items-center gap-3 rounded-[var(--radius-sm)] bg-[rgba(241,237,228,0.07)] p-2 md:p-3">
              <Avatar name={currentEmployee?.full_name || '?'} />
              <div className={`min-w-0 ${collapsed ? 'md:hidden' : ''}`}>
                <p className="truncate text-sm font-semibold text-[var(--ivory)]">{currentEmployee?.full_name || 'Người dùng'}</p>
                <p className="font-spec text-[9px] text-[rgba(241,237,228,0.45)] capitalize">
                  {currentEmployee?.role === 'ceo' ? 'CEO'
                    : currentEmployee?.role === 'coo' ? 'COO'
                    : currentEmployee?.role === 'admin' ? 'Admin'
                    : currentEmployee?.role === 'department_head' ? 'Trưởng bộ phận'
                    : currentEmployee?.position || 'Nhân viên'}
                </p>
              </div>
            </div>
            <button type="button"
              onClick={() => { logout(); setMobileNavOpen(false) }}
              title="Đăng xuất"
              className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-3 py-2 text-xs font-medium text-[rgba(241,237,228,0.45)] hover:bg-[rgba(241,237,228,0.06)] hover:text-[var(--crit)] transition-colors"
            >
              <LogOut size={14} className="shrink-0"/>
              <span className={collapsed ? 'md:hidden' : ''}>Đăng xuất</span>
            </button>
          </div>
        </div>
      </aside>

      <section className={`min-h-screen min-w-0 md:ml-[64px] ${collapsed ? 'md:ml-[64px]' : 'md:ml-[240px]'}`}>
        <header className="vyvy-topbar sticky top-0 z-20 flex min-h-16 flex-wrap items-center justify-between gap-3 px-3 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="rounded-[var(--radius-sm)] p-2 text-[var(--text-secondary)] hover:bg-[var(--bg-surface)] md:hidden"
              aria-label="Mở menu"
            >
              <Ico d={IC.menu} size={20}/>
            </button>
            <div className="min-w-0">
            <h2 className="font-display text-lg sm:text-xl">
              {view === 'dashboard' && 'Thống kê vận hành'}
              {view === 'coo' && 'COO Board'}
              {view === 'projects' && 'Tổng dự án'}
              {view === 'calendar' && 'Lịch công việc'}
              {view === 'assigned' && 'Việc được giao'}
              {view === 'tasks' && 'Quản lý công việc'}
              {view === 'meeting' && 'Nhập biên bản họp'}
              {view === 'recurring' && 'Việc định kỳ'}
              {view === 'automation' && 'Nhắc tự động'}
              {view === 'assistant' && 'COO Assistant'}
              {view === 'admin' && 'Quản lý nhân sự'}
              {view === 'feedback' && 'Góp ý hệ thống'}
              {view === 'import' && 'Nhập đầu việc từ Excel'}
              {view === 'history' && 'Lịch sử & Restore'}
              {view === 'permissions' && 'Phân quyền hệ thống'}
            </h2>
            <p className="hidden text-xs text-[var(--text-secondary)] sm:block">
              Dự án → Đầu việc lớn → Đầu việc con → Bước duyệt → File báo cáo.
            </p>
            </div>
          </div>

          <div className="relative hidden min-w-0 flex-1 max-w-md lg:block">
            <input
              ref={searchInputRef}
              className="vyvy-input h-10 w-full pl-9 pr-12 text-sm outline-none"
              placeholder="Tìm dự án, đầu việc... (Ctrl+K)"
              value={searchInput}
              onChange={(event) => { handleSearchChange(event.target.value); setSearchOpen(true) }}
              onFocus={() => setSearchOpen(true)}
              onBlur={() => window.setTimeout(() => setSearchOpen(false), 150)}
            />
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
              <Ico d={IC.search} size={15}/>
            </span>

            {searchOpen && (searchResults.projects.length > 0 || searchResults.tasks.length > 0) && (
              <div className="absolute left-0 right-0 top-12 z-30 max-h-96 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-2 shadow-xl">
                {searchResults.projects.length > 0 && (
                  <>
                    <p className="px-2 py-1 text-[10px] font-extrabold uppercase tracking-wide text-[var(--text-muted)]">Dự án</p>
                    {searchResults.projects.map((project) => (
                      <button type="button"
                        key={project.id}
                        onMouseDown={() => {
                          setView('coo')
                          setSelectedProjectId(project.id)
                          setSearchQuery('')
                          setSearchOpen(false)
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm font-bold hover:bg-[var(--bg-surface)]"
                      >
                        <span className="text-[var(--text-muted)]"><Ico d={IC.folder} size={15}/></span>
                        <span className="truncate">{project.name}</span>
                      </button>
                    ))}
                  </>
                )}
                {searchResults.tasks.length > 0 && (
                  <>
                    <p className="px-2 py-1 text-[10px] font-extrabold uppercase tracking-wide text-[var(--text-muted)]">Đầu việc</p>
                    {searchResults.tasks.map((task) => (
                      <button type="button"
                        key={task.id}
                        onMouseDown={() => {
                          setSelectedTask(task)
                          setSearchQuery('')
                          setSearchOpen(false)
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-[var(--bg-surface)]"
                      >
                        <span>
                          {task.status === 'completed' ? (
                            <Ico d={IC.check} size={15} className="text-[var(--success)]"/>
                          ) : (
                            <Ico d={IC.clock} size={15} className="text-[var(--text-muted)]"/>
                          )}
                        </span>
                        <span className="min-w-0 flex-1 truncate font-bold">{task.title}</span>
                        <span className="shrink-0 text-[10px] text-[var(--text-muted)]">{task.progress_percent || 0}%</span>
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <div className="relative">
              <button type="button"
                onClick={() => setInboxOpen((v) => !v)}
                title="Thông báo & chờ duyệt"
                className="relative rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-2.5 hover:bg-[var(--bg-surface)]"
              >
                <Ico d={IC.bell} size={17}/>
                {(pendingForMe.length + assignmentsForMe.length + unreadCount) > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[10px] font-extrabold text-[var(--text-primary)]">
                    {pendingForMe.length + assignmentsForMe.length + unreadCount}
                  </span>
                )}
              </button>

              {inboxOpen && (
                <div className="vyvy-modal-panel absolute right-0 top-12 z-30 w-[min(380px,calc(100vw-1rem))] rounded-[var(--radius-lg)] p-2">
                  <div className="mb-2 flex items-center justify-between border-b border-[var(--border)] px-2 pb-2">
                    <div>
                      <p className="vyvy-label">Notification center</p>
                      <p className="text-sm font-bold text-[var(--text-primary)]">Thông báo & chờ duyệt</p>
                    </div>
                    {unreadCount > 0 && (
                      <button type="button" onClick={markNotificationsRead} className="text-[11px] font-bold text-[var(--olive)]">
                        Đánh dấu đã đọc
                      </button>
                    )}
                  </div>

                  {/* Phân công chờ duyệt */}
                  {assignmentsForMe.length > 0 && (
                    <>
                      <p className="px-2 py-1 text-[10px] font-extrabold uppercase tracking-wide text-[var(--text-muted)]">
                        Phân công chờ duyệt ({assignmentsForMe.length})
                      </p>
                      <div className="max-h-64 space-y-1 overflow-y-auto">
                        {assignmentsForMe.map((task) => (
                          <div key={task.id} className="rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] p-2">
                            <button type="button"
                              onClick={() => { setSelectedTask(task); setInboxOpen(false) }}
                              className="block w-full text-left"
                            >
                              <p className="truncate text-sm font-bold">{task.title}</p>
                              <p className="truncate text-[11px] text-[var(--text-secondary)]">
                                Giao cho: {employeeMap.get(task.assignee_id || '')?.full_name || 'Chưa có người'}
                              </p>
                            </button>
                            <div className="mt-1.5 flex gap-1.5">
                              <button type="button"
                                onClick={() => approveAssignment(task)}
                                className="rounded-lg bg-[var(--bg-card)] px-2.5 py-1 text-[11px] font-extrabold text-[var(--accent)]"
                              >
                                Duyệt & chia việc
                              </button>
                              <button type="button"
                                onClick={() => rejectAssignment(task)}
                                className="rounded-lg border border-[var(--danger)]/30 px-2.5 py-1 text-[11px] font-bold text-[var(--danger)]"
                              >
                                Trả lại
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  <p className="px-2 py-1 text-[10px] font-extrabold uppercase tracking-wide text-[var(--text-muted)]">
                    Bước chờ tôi duyệt ({pendingForMe.length})
                  </p>
                  {pendingForMe.length === 0 ? (
                    <p className="px-2 py-3 text-sm text-[var(--text-secondary)]">Không có bước nào chờ duyệt.</p>
                  ) : (
                    <div className="max-h-80 space-y-1 overflow-y-auto">
                      {pendingForMe.map((step) => {
                        const task = tasks.find((item) => item.id === step.task_id)
                        return (
                          <div key={step.id} className="rounded-lg border border-[var(--border)] p-2">
                            <p className="truncate text-sm font-bold">{step.step_title}</p>
                            <p className="truncate text-[11px] text-[var(--text-secondary)]">{task?.title || 'Đầu việc'}</p>

                            {(
                              /* ── Duyệt kết quả ── */
                              <div className="mt-1.5 flex gap-1.5">
                                <button type="button"
                                  onClick={() => approveCurrentStage(step)}
                                  className="rounded-lg bg-[var(--bg-card)] px-2.5 py-1 text-[11px] font-extrabold text-[var(--text-primary)]"
                                >
                                  Duyệt ngay
                                </button>
                                <button type="button"
                                  onClick={() => { if (task) { openCooTarget({ task }); setInboxOpen(false) } }}
                                  className="rounded-lg border border-[var(--border)] px-2.5 py-1 text-[11px] font-bold"
                                >
                                  Xem chi tiết
                                </button>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Thông báo */}
                  <p className="mt-1 border-t border-[var(--border)] px-2 pb-1 pt-2 text-[10px] font-extrabold uppercase tracking-wide text-[var(--text-muted)]">
                    Thông báo
                  </p>
                  {notifications.length === 0 ? (
                    <div className="vyvy-empty-state mx-2 my-2 px-4 py-6">
                      <div className="vyvy-empty-mark" />
                      <p className="text-sm font-bold text-[var(--text-primary)]">Chua có thông báo</p>
                      <p className="mt-1 text-xs text-[var(--text-secondary)]">Các tag, deadline và duyệt việc sẽ xuất hiện tại đây.</p>
                    </div>
                  ) : (
                    <div className="max-h-64 space-y-1 overflow-y-auto">
                      {notifications.map((n) => {
                        const relTask = n.task_id ? tasks.find((t) => t.id === n.task_id) : null
                        const visual = notificationVisual(n)
                        return (
                          <button key={n.id} type="button"
                            onClick={async () => {
                              if (!n.is_read) await markNotificationRead(n.id)
                              if (relTask) {
                                // Deep-link: nhảy đúng vào task trong COO Board
                                openCooTarget({ task: relTask })
                                setInboxOpen(false)
                              }
                              else if (n.type === 'recurring_reminder') { setView('recurring'); setInboxOpen(false) }
                              else if (n.type === 'daily_digest') { setView('tasks'); setInboxOpen(false) }
                            }}
                            className={`flex w-full gap-3 rounded-[var(--radius)] border p-2 text-left transition-colors ${n.is_read ? 'border-[var(--border)] bg-[var(--bg-card)]' : 'border-[var(--lime)]/45 bg-[var(--accent-soft)]'} hover:bg-[var(--bg-surface)]`}
                          >
                            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.is_read ? visual.dot : 'bg-[var(--lime)]'}`} />
                            <span className="min-w-0 flex-1">
                              <span className="mb-1 flex items-center gap-2">
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${visual.cls}`}>{visual.label}</span>
                                {!n.is_read && <span className="text-[10px] font-bold text-[var(--olive)]">Chưa đọc</span>}
                              </span>
                              <span className="block truncate text-sm font-bold">{n.title}</span>
                              {n.body && <span className="mt-0.5 block truncate text-[11px] text-[var(--text-secondary)]">{n.body}</span>}
                              <span className="mt-1 block text-[10px] text-[var(--text-muted)]">
                                {new Date(n.created_at).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                {n.actor_id && employeeMap.get(n.actor_id) ? ` · ${employeeMap.get(n.actor_id)?.full_name}` : ''}
                              </span>
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Đồng hồ thật — nối thời gian vào phần mềm */}
            <div className="hidden flex-col items-end leading-tight md:flex">
              <span className="font-display text-sm tabular-nums text-[var(--text-primary)]">
                {String(now.getHours()).padStart(2, '0')}:{String(now.getMinutes()).padStart(2, '0')}
              </span>
              <span className="font-spec text-[9px] text-[var(--text-secondary)]">
                {WEEKDAY_LABELS[now.getDay()]} · {now.getDate()}/{now.getMonth() + 1}/{now.getFullYear()}
              </span>
            </div>

            <div
              title={realtimeStatus === 'live' ? 'Đang đồng bộ tự động' : realtimeStatus === 'connecting' ? 'Đang kết nối...' : 'Mất kết nối realtime'}
              className={`hidden items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold sm:flex
                ${realtimeStatus === 'live' ? 'bg-[var(--success-soft)] text-[var(--success)]' :
                  realtimeStatus === 'connecting' ? 'bg-[var(--warning-soft)] text-[var(--warning)]' :
                  'bg-[var(--danger-soft)] text-[var(--danger)]'}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${realtimeStatus === 'live' ? 'animate-pulse bg-[var(--success)]' : realtimeStatus === 'connecting' ? 'bg-[var(--warning)]' : 'bg-[var(--danger)]'}`} />
              {realtimeStatus === 'live' ? 'Live' : realtimeStatus === 'connecting' ? 'Đang kết nối' : 'Offline'}
            </div>
            {SOLO_PILOT_MODE && (
              <div
                title="Chế độ test nội bộ — chỉ Quang/Admin. Tắt tại lib/config.ts"
                className="hidden items-center gap-1.5 rounded-full border border-[var(--lime)]/40 bg-[var(--lime)]/12 px-2.5 py-1 text-[11px] font-bold text-[var(--olive)] sm:flex"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--olive)] animate-pulse" />
                Solo Pilot
              </div>
            )}

            {primaryAction && (
              <button type="button"
                onClick={primaryAction.onClick}
                disabled={primaryAction.disabled}
                title={primaryAction.title}
                className="rounded-xl bg-[var(--accent)] px-3 py-2 text-sm font-extrabold text-[var(--text-primary)] shadow-sm hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-60 sm:px-4"
              >
                {primaryAction.label}
              </button>
            )}
          </div>
        </header>

        <div className="p-3 sm:p-6">
          {loading ? (
            <DashboardSkeleton />
          ) : (
            <>
              {view === 'dashboard' && isEmployee && <AccessDenied />}
              {view === 'dashboard' && !isEmployee && (
                <DashboardView
                  tasks={visibleTasks}
                  setTaskFilter={setTaskFilter}
                  steps={steps}
                  urgentTasks={urgentTasks}
                  projectCards={projectCards}
                  peopleReports={peopleReports}
                  employeeMap={employeeMap}
                  projectMap={projectMap}
                  setView={setView}
                  setSelectedProjectId={setSelectedProjectId}
                  setSelectedTask={setSelectedTask}
                  openCooTarget={openCooTarget}
                  currentEmployee={currentEmployee}
                  onRefresh={() => fetchAll({ silent: true })}
                />
              )}

              {view === 'coo' && !canManageAll && (
                <AccessDenied />
              )}

              {view === 'coo' && canManageAll && (
                <CooBoard
                  projects={visibleProjects}
                  deleteProject={canDeleteTask ? deleteProject : async () => {}}
                  workstreams={allWorkstreams}
                  selectedProjectId={selectedProjectId}
                  setSelectedProjectId={setSelectedProjectId}
                  selectedWorkstream={selectedWorkstream}
                  setSelectedWorkstreamId={setSelectedWorkstreamId}
                  openWorkstreamForm={(projectId) => {
                    setWorkProjectId(projectId)
                    if (SOLO_PILOT_MODE && currentEmployee?.id) setWorkHeadIds([currentEmployee.id])
                    setCreateTab('workstream')
                    setCreateOpen(true)
                  }}
                  selectedSubtasks={selectedSubtasks}
                  stepsByTask={stepsByTask}
                  commentsByStep={commentsByStep}
                  supportersByTask={supportersByTask}
                  reportsByTask={reportsByTask}
                  tasksByParent={tasksByParent}
                  employees={employees}
                  departments={departments}
                  employeeMap={employeeMap}
                  departmentMap={departmentMap}
                  projectMap={projectMap}
                  setSelectedTask={setSelectedTask}
                  openSubtaskForm={openSubtaskForm}
                  subtaskOpenFor={subtaskOpenFor}
                  setSubtaskOpenFor={setSubtaskOpenFor}
                  subtaskForm={subtaskForm}
                  createSubtask={createSubtask}
                  openStepForm={openStepForm}
                  stepOpenFor={stepOpenFor}
                  setStepOpenFor={setStepOpenFor}
                  stepForm={stepForm}
                  createStep={createStep}
                  updateTaskStatus={updateTaskStatus}
                  updateIssueStatus={updateIssueStatus}
                  updateTaskHead={updateTaskHead}
                  updateTaskAssignee={updateTaskAssignee}
                  updateTaskRoleIds={updateTaskRoleIds}
                  updateTaskDescription={updateTaskDescription}
                  updateStep={updateStep}
                  submitStep={submitStep}
                  approveStep={approveCurrentStage}
                  requestRevision={requestRevision}
                  canApproveStep={canApproveStep}
                  revisionDrafts={revisionDrafts}
                  setRevisionDrafts={setRevisionDrafts}
                  linkDrafts={linkDrafts}
                  setLinkDrafts={setLinkDrafts}
                  saveStepLink={saveStepLink}
                  supportDrafts={supportDrafts}
                  setSupportDrafts={setSupportDrafts}
                  saveSupportRequest={saveSupportRequest}
                  commentDrafts={commentDrafts}
                  setCommentDrafts={setCommentDrafts}
                  addComment={addComment}
                  uploadStepFile={uploadStepFile}
                  deleteTask={deleteTask}
                  deleteStep={deleteStep}
                  deleteSupporter={deleteSupporter}
                  clearStepFile={clearStepFile}
                  supporterDrafts={supporterDrafts}
                  setSupporterDrafts={setSupporterDrafts}
                  createSupporter={createSupporter}
                  getStatusLabel={getStatusLabel}
                  canCreateWorkstream={canCreateWorkstream}
                  canCreateSubtask={canCreateSubtask}
                  canCreateStep={canCreateStep}
                  canDeleteTask={canDeleteTask}
                  canEditProject={SOLO_PILOT_MODE || ['admin','ceo','coo','department_head'].includes((currentEmployee?.role||'').toLowerCase()) || visibleProjects.some(p => p.owner_id === currentEmployee?.id)}
                  onEditProject={(project) => setEditingProject(project)}
                  updateTaskSequential={updateTaskSequential}
                  uploadTaskFile={uploadTaskFile}
                  deleteTaskReport={deleteTaskReport}
                  cooTarget={cooTarget}
                  onCooTargetHandled={() => setCooTarget(null)}
                />
              )}

              {view === 'projects' && isEmployee && <AccessDenied />}
              {view === 'projects' && !isEmployee && (
                <ProjectsView
                  currentEmployee={currentEmployee}
                  projectSpecs={projectSpecs}
                  executionTrackers={executionTrackers}
                  projectCards={projectCards.filter((p) => visibleProjects.some((vp) => vp.id === p.id))}
                  tasks={visibleTasks}
                  steps={steps}
                  employeeMap={employeeMap}
                  setView={setView}
                  setSelectedProjectId={setSelectedProjectId}
                  setSelectedTask={setSelectedTask}
                  deleteProject={canDeleteTask ? deleteProject : async () => {}}
                  canDeleteProject={canDeleteTask}
                  canEditProject={SOLO_PILOT_MODE || ['admin','ceo','coo','department_head'].includes((currentEmployee?.role||'').toLowerCase()) || visibleProjects.some(p => p.owner_id === currentEmployee?.id)}
                  onEditProject={(project) => setEditingProject(project)}
                />
              )}

              {view === 'assigned' && (
                <MyWorkView
                  tasks={visibleTasks}
                  allSteps={steps}
                  stepsByTask={stepsByTask}
                  supportersByTask={supportersByTask}
                  currentEmployee={currentEmployee}
                  employeeMap={employeeMap}
                  setSelectedTask={setSelectedTask}
                  employees={Array.from(employeeMap.values())}
                  seeAll={['admin','coo','ceo'].includes(currentEmployee?.role || '')}
                />
              )}

              {view === 'tasks' && (
                <TasksView
                  tasks={visibleTasks}
                  statusFilter={taskFilter}
                  setStatusFilter={setTaskFilter}
                  employeeMap={employeeMap}
                  projectMap={projectMap}
                  setSelectedTask={setSelectedTask}
                  updateTaskStatus={updateTaskStatus}
                  getStatusLabel={getStatusLabel}
                  canComplete={canCompleteTask}
                />
              )}

              {view === 'meeting' && (
                <MeetingView
                  meetingTitle={meetingTitle}
                  setMeetingTitle={setMeetingTitle}
                  meetingRaw={meetingRaw}
                  setMeetingRaw={setMeetingRaw}
                  meetingRecap={meetingRecap}
                  setMeetingRecap={setMeetingRecap}
                  notexProjectName={notexProjectName}
                  setNotexProjectName={setNotexProjectName}
                  notexRows={notexRows}
                  setNotexRows={setNotexRows}
                  departments={departments}
                  employees={employees}
                  importing={importing}
                  handleMeetingFile={handleMeetingFile}
                  splitNotexRows={splitNotexRows}
                  analyzeMeetingWithAI={analyzeMeetingWithAI}
                  analyzing={analyzing}
                  currentEmployee={currentEmployee}
                  onMeetingCreated={() => refreshDataSilent()}
                  importNotexRows={importNotexRows}
                  saveMeeting={saveMeeting}
                  recurringTasks={recurringTasks}
                  notexScheduleId={notexScheduleId}
                  setNotexScheduleId={setNotexScheduleId}
                  notexOccurredAt={notexOccurredAt}
                  setNotexOccurredAt={setNotexOccurredAt}
                />
              )}

              {view === 'recurring' && (
                <RecurringView
                  dbSetupNeeded={dbSetupNeeded}
                  tasks={recurringTasks}
                  allTasks={visibleTasks}
                  departments={departments}
                  now={now}
                  employees={employees}
                  employeeMap={employeeMap}
                  departmentMap={departmentMap}
                  form={recurringForm}
                  setForm={setRecurringForm}
                  saveTask={saveRecurringTask}
                  editTask={editRecurringTask}
                  resetForm={resetRecurringForm}
                  toggleTask={toggleRecurringTask}
                  deleteTask={deleteRecurringTask}
                  updateTaskPatch={updateRecurringTaskPatch}
                  meetingFiles={recurringMeetingFiles}
                  meetingSessions={meetingSessions}
                  onSessionSaved={fetchMeetingSessions}
                  selectedMeetingTaskId={selectedMeetingTaskId}
                  setSelectedMeetingTaskId={setSelectedMeetingTaskId}
                  meetingFileDrafts={meetingFileDrafts}
                  updateMeetingFileDraft={updateMeetingFileDraft}
                  saveMeetingLink={saveRecurringMeetingLink}
                  uploadMeetingFile={uploadRecurringMeetingFile}
                  deleteMeetingFile={deleteRecurringMeetingFile}
                  uploadingMeetingFileFor={uploadingMeetingFileFor}
                  currentEmployeeId={currentEmployee?.id ?? null}
                />
              )}

              {view === 'automation' && !canManageAll && (
                <AccessDenied />
              )}

              {view === 'automation' && canManageAll && (
                <AutomationView
                  dbSetupNeeded={dbSetupNeeded}
                  tasks={recurringTasks}
                  runs={recurringRuns}
                  now={now}
                  result={recurringRunResult}
                  running={recurringWorkerRunning}
                  runWorker={runRecurringReminderWorker}
                  digestRunning={dailyDigestRunning}
                  digestResult={dailyDigestResult}
                  runDigest={runDailyDigest}
                />
              )}

              {view === 'assistant' && (
                <AssistantView
                  assistantOutput={assistantOutput}
                  generateDailyReport={generateDailyReport}
                  generateFollowUpReport={generateFollowUpReport}
                  generatePendingApprovalReport={generatePendingApprovalReport}
                  generateRevisionReport={generateRevisionReport}
                  generateMissingReportFileReport={generateMissingReportFileReport}
                  generatePeopleReport={generatePeopleReport}
                  generateProjectReport={generateProjectReport}
                  tasks={tasks}
                  projectCards={projectCards}
                  peopleReports={peopleReports}
                  employees={employees}
                  currentEmployee={currentEmployee}
                />
              )}

              {view === 'admin' && (can('admin_panel','use') || canManageAll) && (
                <div className="space-y-6">
                  <AdminUsersView
                    departments={departments}
                    onRefresh={fetchAll}
                    canCreateUsers={canCreateUsers}
                  />
                  <AdminDepartmentsSection
                    departments={departments}
                    onRefresh={fetchAll}
                  />
                </div>
              )}

              {view === 'feedback' && (
                <FeedbackView
                  currentEmployee={currentEmployee}
                  canManageAll={canManageAll}
                  employeeMap={employeeMap}
                />
              )}

              {view === 'import' && (canManageAll || isDeptHead) && (
                <ImportExcelView
                  employees={employees}
                  projects={projects}
                  currentEmployee={currentEmployee}
                  onDone={refreshDataSilent}
                />
              )}

              {view === 'calendar' && (
                <CalendarView
                  tasks={tasks}
                  projects={projects}
                  employees={employees}
                  employeeMap={employeeMap}
                  currentEmployee={currentEmployee}
                  onOpenTask={(task) => setSelectedTask(task)}
                  recurringTasks={recurringTasks}
                  meetingSessions={meetingSessions}
                  onOpenRecurring={() => setView('recurring')}
                />
              )}

              {view === 'history' && can('import','use') && (
                <HistoryView
                  employees={employees}
                  employeeMap={employeeMap}
                  tasks={tasks}
                  currentEmployee={currentEmployee}
                />
              )}

              {view === 'permissions' && can('admin_panel','use') && (
                <PermissionsView
                  permissions={permissions}
                  onRefresh={fetchPermissions}
                />
              )}
            </>
          )}
        </div>
      </section>

      <CreatePanel
        open={createOpen}
        setOpen={setCreateOpen}
        tab={createTab}
        setTab={setCreateTab}
        projects={projects}
        departments={departments}
        employees={employees}
        saving={saving}
        projectName={projectName}
        setProjectName={setProjectName}
        projectCode={projectCode}
        setProjectCode={setProjectCode}
        projectDesc={projectDesc}
        setProjectDesc={setProjectDesc}
        projectOwnerId={projectOwnerId}
        setProjectOwnerId={setProjectOwnerId}
        projectMemberIds={projectMemberIds}
        setProjectMemberIds={setProjectMemberIds}
        projectWatcherIds={projectWatcherIds}
        setProjectWatcherIds={setProjectWatcherIds}
        projectApproverIds={projectApproverIds}
        setProjectApproverIds={setProjectApproverIds}
        projectDepartmentId={projectDepartmentId}
        setProjectDepartmentId={setProjectDepartmentId}
        createProject={createProject}
        workTitle={workTitle}
        setWorkTitle={setWorkTitle}
        workDesc={workDesc}
        setWorkDesc={setWorkDesc}
        workProjectId={workProjectId}
        setWorkProjectId={setWorkProjectId}
        workDepartmentId={workDepartmentId}
        setWorkDepartmentId={setWorkDepartmentId}
        workHeadId={workHeadId}
        setWorkHeadId={setWorkHeadId}
        workHeadIds={workHeadIds}
        setWorkHeadIds={setWorkHeadIds}
        workAssigneeId={workAssigneeId}
        setWorkAssigneeId={setWorkAssigneeId}
        workCoOwnerIds={workCoOwnerIds}
        setWorkCoOwnerIds={setWorkCoOwnerIds}
        workSupporterIds={workSupporterIds}
        setWorkSupporterIds={setWorkSupporterIds}
        workApproverIds={workApproverIds}
        setWorkApproverIds={setWorkApproverIds}
        workDueDate={workDueDate}
        setWorkDueDate={setWorkDueDate}
        workPriority={workPriority}
        setWorkPriority={setWorkPriority}
        createWorkstream={createWorkstream}
      />

      <RecurringFormPanel
        open={recurringPanelOpen}
        setOpen={setRecurringPanelOpen}
        form={recurringForm}
        setForm={setRecurringForm}
        saveTask={saveRecurringTask}
        resetForm={resetRecurringForm}
        employees={employees}
        departments={departments}
      />

      {selectedTask && (
        <TaskDetailDrawer
          task={selectedTask}
          employeeMap={employeeMap}
          departmentMap={departmentMap}
          projectMap={projectMap}
          steps={stepsByTask.get(selectedTask.id) || []}
          reports={reportsByTask.get(selectedTask.id) || []}
          supporters={supportersByTask.get(selectedTask.id) || []}
          close={() => setSelectedTask(null)}
          uploadTaskFile={uploadTaskFile}
          deleteTaskReport={deleteTaskReport}
          uploading={uploading}
          getStatusLabel={getStatusLabel}
          currentEmployee={currentEmployee}
          employees={employees}
          refreshTask={async () => {
            const { data } = await supabase.from('tasks').select('*').eq('id', selectedTask.id).maybeSingle()
            if (data) setSelectedTask(data as Task)
            void fetchTasks()
          }}
        />
      )}

      {editingProject && (
        <ProjectEditModal
          project={editingProject}
          employees={employees}
          departments={departments}
          currentEmployee={currentEmployee}
          close={() => setEditingProject(null)}
          onSaved={async () => {
            setEditingProject(null)
            void fetchProjects()
          }}
        />
      )}

      {/* Confirm dialog */}
      {confirmState && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/40 p-4" onClick={() => answerConfirm(false)}>
          <div
            className="w-full max-w-sm rounded-2xl bg-[var(--bg-card)] p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[var(--warning-soft)] text-[var(--warning)]"><Ico d={IC.warning} size={20}/></div>
            <p className="text-sm font-bold text-[var(--text-primary)]">{confirmState.message}</p>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">Hành động này không thể hoàn tác.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button"
                onClick={() => answerConfirm(false)}
                className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2 text-sm font-bold text-[var(--text-primary)]"
              >
                Hủy
              </button>
              <button type="button"
                onClick={() => answerConfirm(true)}
                className="rounded-xl bg-[var(--bg-card)] px-4 py-2 text-sm font-extrabold text-[var(--text-primary)]"
              >
                Xóa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast notifications */}
      <div className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast-enter pointer-events-auto flex items-start gap-3 rounded-[var(--radius)] px-4 py-3 text-sm font-medium shadow-[0_4px_16px_-4px_rgba(25,25,25,0.2)]
              transition-all duration-300 max-w-[340px] border
              ${t.type === 'error' ? 'bg-[var(--danger-soft)] text-[var(--danger)] border-[var(--danger)]/30' :
                t.type === 'warning' ? 'bg-[var(--warning-soft)] text-[var(--warning)] border-[var(--warning)]/30' :
                t.type === 'info' ? 'bg-[var(--paper)] text-[var(--char)] border-[var(--hair)]' :
                'bg-[var(--olive)] text-[var(--ivory)] border-transparent'}`}
          >
            <span className="shrink-0 mt-0.5">
              {t.type === 'error' ? <Ico d={IC.x} size={15}/> : t.type === 'warning' ? <Ico d={IC.warning} size={15}/> : t.type === 'info' ? <IcoCircle d={IC.info} size={15}/> : <Ico d={IC.check} size={15}/>}
            </span>
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </main>
  )
}

function DashboardView(props: {
  tasks: Task[]
  steps: TaskStep[]
  urgentTasks: Task[]
  projectCards: ProjectCard[]
  peopleReports: PeopleReport[]
  employeeMap: Map<string, Employee>
  projectMap: Map<string, Project>
  setView: (view: ViewKey) => void
  setTaskFilter: (f: string) => void
  setSelectedProjectId: (id: string) => void
  setSelectedTask: (task: Task) => void
  openCooTarget: (opts: CooTarget & { task?: Task | null }) => void
  currentEmployee: Employee | null
  onRefresh: () => Promise<void> | void
}) {
  const { tasks, currentEmployee } = props
  const isAdmin = currentEmployee?.role === 'admin' || currentEmployee?.role === 'coo' || currentEmployee?.role === 'ceo'
  const [refreshing, setRefreshing] = useState(false)

  const total = tasks.length
  const done    = tasks.filter((t) => t.status === 'completed').length
  const overdue = tasks.filter((t) => isTaskOverdue(t)).length
  // Mutually exclusive: subtract overdue from doing/pending to avoid double-count
  const doing   = tasks.filter((t) => t.status === 'in_progress' && !isTaskOverdue(t)).length
  const pending = tasks.filter((t) => t.status === 'pending'     && !isTaskOverdue(t)).length
  const attentionProjects = props.projectCards.filter((p) => p.health.level === 'watch' || p.health.level === 'problem')
  const pendingSteps = getPendingApprovalSteps(props.steps)
  const revisionSteps = getRevisionSteps(props.steps)

  // My tasks (for employee view)
  const myTasks = currentEmployee?.id
    ? tasks.filter((t) => taskParticipantIds(t).includes(currentEmployee.id))
    : []
  const myOverdue = myTasks.filter((t) => isTaskOverdue(t))
  const myDueToday = myTasks.filter((t) => {
    if (!t.due_date) return false
    const today = new Date().toISOString().slice(0, 10)
    return t.due_date.slice(0, 10) === today
  })
  const myDoing = myTasks.filter((t) => t.status === 'in_progress')

  // Workload bar data (top 8)
  const activePeopleReports = props.peopleReports
    .filter((row) => row.employee.status !== 'inactive')
    .sort((a, b) => b.total - a.total || b.overdue - a.overdue || b.doing - a.doing)

  // Liếc 5 giây
  const today = new Date().toISOString().slice(0, 10)
  const endOfWeek = (() => {
    const d = new Date(); d.setDate(d.getDate() + (7 - d.getDay())); return d.toISOString().slice(0, 10)
  })()
  const dueThisWeek = tasks.filter((t) => t.status !== 'completed' && t.due_date && t.due_date.slice(0,10) >= today && t.due_date.slice(0,10) <= endOfWeek)
  const noDeadlineTasks = tasks.filter((t) => t.status !== 'completed' && !t.due_date)
  const openTasks = tasks.filter((t) => t.status !== 'completed')
  const extensionPending = tasks.filter((t) => t.deadline_status === 'extension_requested')

  async function refreshDashboard() {
    setRefreshing(true)
    try {
      await props.onRefresh()
      toast('Đã làm mới số liệu thống kê.')
    } finally {
      setRefreshing(false)
    }
  }

  const completionRate = total > 0 ? Math.round((done / total) * 100) : 0

  return (
    <div className="space-y-6">
      {/* -- Hero -- */}
      <div className="vyvy-card overflow-hidden">
        <div className="flex items-center justify-between gap-4 px-6 py-5">
          <div className="min-w-0">
            <p className="vyvy-label mb-1">VyVy WorkOS · Tổng quan vận hành</p>
            <h2 className="font-display text-2xl text-[var(--vyvy-char)] leading-tight">
              {overdue > 0 && <span className="text-[var(--danger)]">{overdue} đầu việc trễ — cần xử lý</span>}
              {overdue === 0 && completionRate === 100 && <span className="text-[var(--success)]">Tất cả hoàn thành ✓</span>}
              {overdue === 0 && completionRate < 100 && <span>{completionRate}% hoàn thành · <span className="text-[var(--olive)]">{total - done} còn lại</span></span>}
            </h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {total} đầu việc · {done} xong · {doing} đang làm · {pending} pending
              {overdue > 0 && <span className="ml-2 font-semibold text-[var(--danger)]">· {overdue} trễ</span>}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <div className="hidden sm:flex flex-col items-end">
              <span className="text-4xl font-extrabold tabular-nums text-[var(--olive)]">{completionRate}%</span>
              <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">Hoàn thành</span>
            </div>
            <button
              type="button"
              onClick={refreshDashboard}
              disabled={refreshing}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-[var(--border-soft)] bg-[var(--bg-surface)] px-3 text-xs font-semibold text-[var(--text-secondary)] hover:border-[var(--border-strong)] disabled:opacity-60 transition-colors"
            >
              <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
              {refreshing ? 'Đang làm mới…' : 'Làm mới'}
            </button>
          </div>
        </div>
        {total > 0 && (
          <div className="h-[3px] bg-[var(--border-soft)]">
            <div className="h-full bg-[var(--olive)] transition-all duration-700" style={{ width: `${completionRate}%` }} />
          </div>
        )}
      </div>

      {/* ── Section: Việc của tôi ── */}
      {!isAdmin && currentEmployee && (
        <div className="vyvy-section-header"><span className="vyvy-section-number">01</span><span className="vyvy-label">Việc của tôi</span></div>
      )}
      {!isAdmin && currentEmployee && (
        <div className="rounded-[var(--radius-lg)] border border-[var(--border-soft)] bg-[var(--bg-surface)] p-5">
          <div className="grid grid-cols-3 gap-3 mb-4">
            {[
              { label: 'Đang làm', value: myDoing.length, color: 'text-[var(--char)]' },
              { label: 'Đến hạn hôm nay', value: myDueToday.length, color: 'text-[var(--warning)]' },
              { label: 'Trễ hạn', value: myOverdue.length, color: 'text-[var(--danger)]' },
            ].map((s) => (
              <div key={s.label} className="rounded-[var(--radius)] bg-[var(--bg-card)] border border-[var(--border-soft)] p-3 text-center">
                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
          {[...myOverdue, ...myDueToday, ...myDoing].slice(0, 5).map((t) => (
            <button key={t.id} type="button" onClick={() => props.setSelectedTask(t)}
              className="w-full text-left flex items-center gap-3 rounded-[var(--radius)] px-3 py-2.5 hover:bg-[var(--bg-card)] transition-colors mb-1">
              <span className={`h-2 w-2 rounded-full shrink-0 ${isTaskOverdue(t) ? 'bg-[var(--danger)]' : 'bg-[var(--olive)]'}`}/>
              <span className="text-sm font-medium text-[var(--text-primary)] truncate">{t.title}</span>
              {t.due_date && <span className="text-xs text-[var(--text-muted)] ml-auto shrink-0">{t.due_date.slice(0, 10)}</span>}
            </button>
          ))}
          {myTasks.length === 0 && <p className="text-sm text-[var(--text-muted)] text-center py-2">Chưa có việc nào được giao.</p>}
        </div>
      )}

      {/* ── Section 01: Liếc 5 giây ── */}
      <div className="vyvy-section-header">
        <span className="vyvy-section-number">{!isAdmin && currentEmployee ? '02' : '01'}</span>
        <span className="vyvy-label">Liếc 5 giây — tình hình tuần này</span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {[
          {
            title: 'Phải xong tuần này',
            value: dueThisWeek.length,
            sub: dueThisWeek.filter(t => isTaskOverdue(t)).length > 0 ? `${dueThisWeek.filter(t => isTaskOverdue(t)).length} đã trễ` : 'trong tuần',
            accent: dueThisWeek.filter(t => isTaskOverdue(t)).length > 0 ? 'var(--danger)' : 'var(--status-progress)',
            onClick: () => { props.setTaskFilter('overdue'); props.setView('tasks') },
          },
          {
            title: 'Đang kẹt / quá hạn',
            value: overdue + extensionPending.length,
            sub: extensionPending.length > 0 ? `${extensionPending.length} đang xin gia hạn` : overdue > 0 ? 'cần xử lý ngay' : 'ổn',
            accent: overdue > 0 ? 'var(--danger)' : 'var(--status-neutral)',
            onClick: () => { props.setTaskFilter('overdue'); props.setView('tasks') },
          },
          {
            title: 'Chờ duyệt',
            value: pendingSteps.length,
            sub: revisionSteps.length > 0 ? `${revisionSteps.length} cần làm lại` : 'bước duyệt',
            accent: pendingSteps.length > 0 ? 'var(--status-warning)' : 'var(--status-neutral)',
            onClick: () => props.setView('tasks'),
          },
          {
            title: 'Không có deadline',
            value: noDeadlineTasks.length,
            sub: 'việc chưa chốt ngày',
            accent: noDeadlineTasks.length > 0 ? 'var(--status-warning)' : 'var(--status-neutral)',
            onClick: () => { props.setTaskFilter('all'); props.setView('tasks') },
          },
          {
            title: 'Tổng việc mở',
            value: openTasks.length,
            sub: `${total} tổng · ${done} xong`,
            accent: 'var(--brand-olive, var(--olive))',
            onClick: () => { props.setTaskFilter('all'); props.setView('tasks') },
          },
        ].map((card) => (
          <button key={card.title} type="button" onClick={card.onClick}
            className="vyvy-card p-5 text-left hover:-translate-y-0.5 transition-all cursor-pointer group relative overflow-hidden"
            style={{ '--metric-accent': card.accent } as CSSProperties}>
            <div className="absolute left-0 inset-y-0 w-[3px] rounded-r" style={{ background: card.accent }} />
            <p className="text-xs font-semibold text-[var(--text-muted)] mb-3 uppercase tracking-wide">{card.title}</p>
            <p className="text-4xl font-extrabold tabular-nums leading-none" style={{ color: card.accent }}>{card.value}</p>
            <p className="text-xs text-[var(--text-muted)] mt-2">{card.sub}</p>
          </button>
        ))}
      </div>

      {/* ── Section 02: Nội dự án / Sức khỏe ── */}
      <div className="vyvy-section-header">
        <span className="vyvy-section-number">{!isAdmin && currentEmployee ? '03' : '02'}</span>
        <span className="vyvy-label">Nội dự án · Sức khỏe</span>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        {/* Project health list */}
        <div className="vyvy-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-extrabold text-[var(--text-primary)]">Tiến độ dự án</p>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">{props.projectCards.filter(p=>p.total>0).length} dự án đang có việc</p>
            </div>
            {attentionProjects.length > 0 && (
              <span className="rounded-full bg-[var(--danger-soft)] px-3 py-1 text-xs font-bold text-[var(--danger)]">⚠ {attentionProjects.length} cần chú ý</span>
            )}
          </div>
          <div className="space-y-2">
            {props.projectCards.length === 0 ? (
              <p className="text-center text-sm text-[var(--text-muted)] py-8">Chưa có dự án nào.</p>
            ) : props.projectCards.slice(0, 8).map((project) => (
              <button type="button" key={project.id}
                onClick={() => { props.setSelectedProjectId(project.id); props.setView('coo') }}
                className="w-full flex items-center gap-4 rounded-[var(--radius)] border border-transparent px-3 py-2.5 text-left hover:border-[var(--border-soft)] hover:bg-[var(--bg-surface)] transition-all group">
                <div className="shrink-0">
                  <ProjectHealthBadge health={project.health} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1.5">
                    <p className="font-semibold text-sm text-[var(--text-primary)] truncate">{project.name}</p>
                    <span className="shrink-0 text-xs text-[var(--text-muted)]">{project.total} việc</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full bg-[var(--border-soft)] overflow-hidden">
                      <div className="h-full rounded-full transition-all"
                        style={{ width: `${isNaN(project.rate) ? 0 : project.rate}%`, background: project.health.level === 'problem' ? 'var(--danger)' : project.health.level === 'watch' ? 'var(--warning)' : 'var(--success)' }} />
                    </div>
                    <span className="text-xs font-bold tabular-nums text-[var(--text-primary)] w-8 text-right">{isNaN(project.rate) ? 0 : project.rate}%</span>
                  </div>
                </div>
                {project.overdue > 0 && (
                  <span className="shrink-0 text-xs font-bold text-[var(--danger)]">{project.overdue} trễ</span>
                )}
              </button>
            ))}
            {props.projectCards.length > 8 && (
              <button type="button" onClick={() => props.setView('coo')} className="w-full text-center text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] py-2 transition-colors">
                Xem tất cả {props.projectCards.length} dự án →
              </button>
            )}
          </div>
        </div>

        {/* Right panel: attention + urgent + pending */}
        <div className="space-y-4">
          {/* Attention banner */}
          <div className="vyvy-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle size={14} className={attentionProjects.length > 0 ? 'text-[var(--warning)]' : 'text-[var(--text-muted)]'}/>
              <p className="text-sm font-semibold text-[var(--text-secondary)]">Dự án cần chú ý</p>
              {attentionProjects.length > 0
                ? <span className="ml-auto rounded-full bg-[var(--warning-soft)] px-2.5 py-0.5 text-xs font-extrabold text-[var(--warning)]">{attentionProjects.length}</span>
                : <span className="ml-auto text-xs text-[var(--text-muted)]">✓ Ổn</span>}
            </div>
            {attentionProjects.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)] text-center py-2">Tất cả dự án đang ổn ✓</p>
            ) : attentionProjects.map((p) => (
              <button key={p.id} type="button"
                onClick={() => props.openCooTarget({ projectId: p.id })}
                className="w-full text-left flex items-center gap-2 rounded-[var(--radius)] border border-[var(--warning)]/15 bg-[var(--warning-soft)] p-2 mb-1.5 hover:border-[var(--warning)]/35 transition-colors">
                <AlertTriangle size={12} className="text-[var(--warning)] shrink-0"/>
                <span className="text-xs font-semibold text-[var(--text-primary)] truncate">{p.name}</span>
                <span className="ml-auto text-[10px] text-[var(--warning)] font-bold shrink-0">{p.health.level === 'problem' ? 'Nghiêm trọng' : 'Cần chú ý'}</span>
              </button>
            ))}
          </div>

          {/* Urgent tasks */}
          <div className="vyvy-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <Flag size={14} className="text-[var(--danger)]"/>
              <p className="text-sm font-semibold text-[var(--text-secondary)]">Việc cần hối thúc</p>
              {props.urgentTasks.length > 0 && <span className="ml-auto text-xs font-bold text-[var(--danger)]">{props.urgentTasks.length}</span>}
            </div>
            {props.urgentTasks.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)] text-center py-3">Không có việc khẩn ✓</p>
            ) : props.urgentTasks.slice(0, 4).map((t) => {
              const assignee = props.employeeMap.get(t.assignee_id || '')
              return (
                <button key={t.id} type="button"
                  onClick={() => props.openCooTarget({ task: t })}
                  className="w-full text-left flex items-start gap-2 rounded-[var(--radius)] border border-[var(--danger)]/15 bg-[var(--danger-soft)] p-2.5 mb-1.5 hover:border-[var(--danger)]/30 transition-colors">
                  <AlertCircle size={13} className="text-[var(--danger)] mt-0.5 shrink-0"/>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[var(--text-primary)] truncate">{t.title}</p>
                    <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{assignee?.full_name || 'Chưa gán'} · {getUrgentReason(t)}</p>
                  </div>
                </button>
              )
            })}
          </div>

          {/* Pending steps */}
          <div className="vyvy-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <Clock size={14} className="text-[var(--info)]"/>
              <p className="text-sm font-semibold text-[var(--text-secondary)]">Chờ duyệt / Làm lại</p>
              {(pendingSteps.length + revisionSteps.length) > 0 && (
                <span className="ml-auto text-xs font-bold text-[var(--info)]">{pendingSteps.length + revisionSteps.length}</span>
              )}
            </div>
            <DashboardStepList title="Chờ duyệt" steps={pendingSteps.slice(0, 4)} tasks={tasks}
              emptyText="Không có bước chờ duyệt." onTaskClick={(task) => props.openCooTarget({ task })} />
            {revisionSteps.length > 0 && (
              <div className="mt-2">
                <DashboardStepList title="Cần làm lại" steps={revisionSteps.slice(0, 3)} tasks={tasks}
                  emptyText="" onTaskClick={(task) => props.openCooTarget({ task })} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Section 03: Tải người (admin only) ── */}
      {isAdmin && (
        <>
          <div className="vyvy-section-header">
            <span className="vyvy-section-number">03</span>
            <span className="vyvy-label">Tài nguyên · Ai dang gánh bao nhiêu</span>
          </div>
          <div className="vyvy-card p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-extrabold text-[var(--text-primary)]">Tải nhân sự</p>
              <div className="flex gap-3 text-xs">
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[var(--success)]"/>Đang ổn</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[var(--warning)]"/>Cần chú ý</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[var(--danger)]"/>Nguy hiểm</span>
              </div>
            </div>
            <div className="space-y-2">
              {activePeopleReports
                .sort((a, b) => b.overdue - a.overdue || b.doing - a.doing || b.total - a.total)
                .slice(0, 12)
                .map((row) => {
                  const maxTotal = Math.max(...activePeopleReports.map(r => r.total), 1)
                  const statusLevel = row.overdue >= 3 || row.total >= 10 ? 'danger' : row.overdue > 0 || row.total >= 6 ? 'warn' : 'ok'
                  const statusLabel = statusLevel === 'danger' ? 'Nguy hiểm' : statusLevel === 'warn' ? 'Cần chú ý' : 'Đang ổn'
                  const statusColor = statusLevel === 'danger' ? 'var(--danger)' : statusLevel === 'warn' ? 'var(--warning)' : 'var(--success)'
                  const barColor = statusLevel === 'danger' ? 'var(--danger)' : statusLevel === 'warn' ? 'var(--warning)' : 'var(--status-progress)'
                  return (
                    <div key={row.employee.id} className="flex items-center gap-4 py-2 border-b border-[var(--border-soft)] last:border-0">
                      <div className="flex items-center gap-2 w-40 shrink-0">
                        <Avatar name={row.employee.full_name} size="sm" />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{row.employee.full_name}</p>
                          <p className="text-[10px] text-[var(--text-muted)] truncate">{row.employee.position || row.employee.role || '—'}</p>
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="h-2 rounded-full bg-[var(--border-soft)] overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${Math.round((row.total / maxTotal) * 100)}%`, background: barColor }} />
                        </div>
                      </div>
                      <div className="shrink-0 flex items-center gap-3">
                        <span className="text-sm font-bold tabular-nums text-[var(--text-primary)] w-8 text-right">{row.total}</span>
                        <span className="text-[10px] font-semibold" style={{ color: statusColor }}>
                          {statusLabel}
                        </span>
                        {row.overdue > 0 && <span className="text-xs font-bold text-[var(--danger)]">{row.overdue} trễ</span>}
                      </div>
                    </div>
                  )
                })}
            </div>
          </div>
        </>
      )}

      {/* ── Section 04: Ô dự án (admin only) ── */}
      {isAdmin && (
        <>
          <div className="vyvy-section-header">
            <span className="vyvy-section-number">04</span>
            <span className="vyvy-label">Ô dự án — bấm để mở bảng</span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {props.projectCards.map((project) => (
              <button type="button" key={project.id}
                onClick={() => { props.setSelectedProjectId(project.id); props.setView('coo') }}
                className="vyvy-card p-4 text-left hover:-translate-y-0.5 transition-all group">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <p className="font-semibold text-sm text-[var(--text-primary)] truncate">{project.name}</p>
                  <ProjectHealthBadge health={project.health} />
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex-1 h-1.5 rounded-full bg-[var(--border-soft)] overflow-hidden">
                    <div className="h-full rounded-full transition-all"
                      style={{ width: `${isNaN(project.rate) ? 0 : project.rate}%`, background: project.health.level === 'problem' ? 'var(--danger)' : 'var(--success)' }} />
                  </div>
                  <span className="text-sm font-extrabold tabular-nums text-[var(--olive)] shrink-0">{isNaN(project.rate) ? 0 : project.rate}%</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-[var(--text-muted)]">
                  <span>{project.total} việc</span>
                  {project.overdue > 0 && <span className="text-[var(--danger)] font-semibold">⚠ {project.overdue} trễ</span>}
                  {project.problem > 0 && <span className="text-[var(--warning)]">⚡ {project.problem} vấn đề</span>}
                  {project.health.level === 'normal' && <span className="text-[var(--success)]">✓ Ổn</span>}
                </div>
              </button>
            ))}
            {props.projectCards.length === 0 && (
              <p className="col-span-3 text-center text-sm text-[var(--text-muted)] py-8">Chưa có dự án nào.</p>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// --- Dashboard Charts ---------------------------------------------------------

function InlineFilePanel({ task, reports, uploadTaskFile, deleteTaskReport }: {
  task: Task; reports: TaskReport[]
  uploadTaskFile: (task: Task, file?: File) => void
  deleteTaskReport: (report: TaskReport) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [ulding, setUlding] = useState(false)
  async function handleFile(f: File) { setUlding(true); await uploadTaskFile(task, f); setUlding(false) }
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border)] bg-[var(--bg-base)] px-4 py-2">
      <input ref={fileRef} type="file" className="sr-only"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) { handleFile(f); e.target.value = '' } }} />
      <button type="button" onClick={() => fileRef.current?.click()} disabled={ulding}
        className="flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-2.5 py-1 text-xs font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--olive)] hover:text-[var(--olive)] disabled:opacity-50">
        <Ico d={IC.plus} size={11}/>{ulding ? 'Đang up...' : 'Thêm file'}
      </button>
      {reports.length === 0
        ? <span className="text-xs text-[var(--text-muted)]">Chưa có file đính kèm</span>
        : reports.map((r) => (
          <div key={r.id} className="flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] py-1 pl-2.5 pr-1">
            <a href={r.file_url} target="_blank" rel="noreferrer"
              className="max-w-[200px] truncate text-xs font-semibold text-[var(--text-primary)] hover:text-[var(--olive)] hover:underline">{r.file_name}</a>
            <button type="button" onClick={() => deleteTaskReport(r)}
              className="ml-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"><Ico d={IC.x} size={10}/></button>
          </div>
        ))
      }
    </div>
  )
}

function CooBoard(props: {
  projects: Project[]
  workstreams: Task[]
  selectedProjectId: string
  setSelectedProjectId: (id: string) => void
  selectedWorkstream?: Task
  setSelectedWorkstreamId: (id: string) => void
  openWorkstreamForm: (projectId: string) => void
  selectedSubtasks: Task[]
  stepsByTask: Map<string, TaskStep[]>
  commentsByStep: Map<string, StepComment[]>
  supportersByTask: Map<string, TaskSupporter[]>
  reportsByTask: Map<string, TaskReport[]>
  tasksByParent: Map<string, Task[]>
  employees: Employee[]
  departments: Department[]
  employeeMap: Map<string, Employee>
  departmentMap: Map<string, Department>
  projectMap: Map<string, Project>
  setSelectedTask: (task: Task) => void
  openSubtaskForm: (task: Task) => void
  subtaskOpenFor: string
  setSubtaskOpenFor: (value: string) => void
  subtaskForm: SubtaskForm
  createSubtask: (parent: Task, form: SubtaskForm) => void
  openStepForm: (task: Task) => void
  stepOpenFor: string
  setStepOpenFor: (value: string) => void
  stepForm: StepForm
  createStep: (taskId: string, form: StepForm) => void
  updateTaskStatus: (taskId: string, status: string) => void
  updateIssueStatus: (taskId: string, status: string) => void
  updateTaskHead: (taskId: string, headIds: string[]) => void
  updateTaskAssignee: (taskId: string, assigneeId: string | null) => void
  updateTaskRoleIds: (
    taskId: string,
    field: 'co_owner_ids' | 'supporter_ids' | 'reviewer_ids' | 'watcher_ids' | 'approver_ids',
    ids: string[],
    label: string,
  ) => void
  updateTaskDescription: (taskId: string, description: string) => void
  updateStep: (step: TaskStep, patch: Partial<TaskStep>) => void
  submitStep: (step: TaskStep) => void
  approveStep: (step: TaskStep) => void
  requestRevision: (step: TaskStep) => void
  canApproveStep: (step: TaskStep) => boolean
  revisionDrafts: Record<string, string>
  setRevisionDrafts: (value: Record<string, string>) => void
  linkDrafts: Record<string, string>
  setLinkDrafts: (value: Record<string, string>) => void
  saveStepLink: (step: TaskStep) => void
  supportDrafts: Record<string, string>
  setSupportDrafts: (value: Record<string, string>) => void
  saveSupportRequest: (step: TaskStep) => void
  commentDrafts: Record<string, string>
  setCommentDrafts: (value: Record<string, string>) => void
  addComment: AddStepComment
  uploadStepFile: (step: TaskStep, file?: File) => void
  deleteTask: (task: Task) => void
  deleteStep: (step: TaskStep) => void
  deleteSupporter: (supporter: TaskSupporter) => void
  clearStepFile: (step: TaskStep) => void
  supporterDrafts: Record<string, string>
  setSupporterDrafts: (value: Record<string, string>) => void
  createSupporter: (taskId: string) => void
  getStatusLabel: (status: string) => string
  canCreateWorkstream: boolean
  canCreateSubtask: (task: Task) => boolean
  canCreateStep: (task: Task) => boolean
  canDeleteTask: boolean
  deleteProject: (project: Project) => void
  canEditProject: boolean
  onEditProject: (project: Project) => void
  updateTaskSequential: (taskId: string, sequential: boolean) => void
  uploadTaskFile: (task: Task, file?: File) => void
  deleteTaskReport: (report: TaskReport) => void
  cooTarget?: CooTarget | null
  onCooTargetHandled?: () => void
}) {
  const [expandedWorkstreams, setExpandedWorkstreams] = useState<Set<string>>(new Set())
  const [expandedSubtasks, setExpandedSubtasks] = useState<Set<string>>(new Set())
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set())
  const [boardSearch, setBoardSearch] = useState('')
  const [boardDeptFilter, setBoardDeptFilter] = useState('')
  const [boardStatusFilter, setBoardStatusFilter] = useState('')
  const [workspaceTab, setWorkspaceTab] = useState<'workstreams' | 'overview' | 'deadline' | 'files' | 'history'>('workstreams')

  // Auto-expand workstreams khi nhảy từ dashboard
  useEffect(() => {
    const id = props.selectedProjectId
    if (!id || id === 'all') return
    const wsList = props.workstreams.filter((ws) => ws.project_id === id)
    if (wsList.length > 0) {
      setExpandedWorkstreams((prev) => {
        const s = new Set(prev)
        wsList.forEach((ws) => s.add(ws.id))
        return s
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.workstreams])


  // Deep-link: expand dúng workstream + scroll + highlight item
  useEffect(() => {
    if (!props.cooTarget) return
    const { workstreamId, taskId, highlightId } = props.cooTarget

    // Expand workstream cần thiết
    if (workstreamId) {
      setExpandedWorkstreams((prev) => { const s = new Set(prev); s.add(workstreamId); return s })
    }
    // Nếu task là subtask, expand workstream cha của nó
    if (taskId) {
      const parentWs = props.workstreams.find((ws) => ws.id === taskId)
      if (parentWs?.parent_task_id) {
        setExpandedWorkstreams((prev) => { const s = new Set(prev); s.add(parentWs.parent_task_id!); return s })
      }
    }

    // Scroll + highlight sau khi DOM render
    const targetId = highlightId || taskId || workstreamId
    if (targetId) {
      setTimeout(() => {
        const el = document.querySelector(`[data-coo-id="${targetId}"]`)
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
          el.setAttribute('data-coo-highlight', 'true')
          setTimeout(() => el.removeAttribute('data-coo-highlight'), 2800)
        }
      }, 300)
    }

    props.onCooTargetHandled?.()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.cooTarget])

  function toggleWorkstream(id: string) {
    setExpandedWorkstreams((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSubtask(id: string) {
    setExpandedSubtasks((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleStep(id: string) {
    setExpandedSteps((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const searchLower = boardSearch.toLowerCase()

  function wsMatchesFilter(ws: Task): boolean {
    if (boardDeptFilter && ws.department_id !== boardDeptFilter) return false
    if (boardStatusFilter) {
      if (boardStatusFilter === 'problem' && !isTaskProblem(ws) && !isTaskOverdue(ws)) return false
      if (boardStatusFilter !== 'problem' && ws.status !== boardStatusFilter) return false
    }
    if (searchLower) {
      const titleMatch = ws.title.toLowerCase().includes(searchLower)
      const subtasks = props.tasksByParent.get(ws.id) || []
      const subtaskMatch = subtasks.some((s) => s.title.toLowerCase().includes(searchLower))
      if (!titleMatch && !subtaskMatch) return false
    }
    return true
  }

  const allSteps = Array.from(props.stepsByTask.values()).flat()

  // -- Workstream accordion (shared between grid project rows and workspace tab) --
  function WorkstreamList({ project, workstreams }: { project: Project; workstreams: Task[] }) {
    return (
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
        {workstreams.length === 0 ? (
          <div className="flex items-center gap-3 px-8 py-6 text-sm text-[var(--text-secondary)]">
            Chưa có đầu việc lớn.
            {props.canCreateWorkstream && (
              <button
                type="button"
                onClick={() => props.openWorkstreamForm(project.id)}
                className="inline-flex items-center gap-1 rounded-lg border border-[var(--olive)] px-3 py-1 text-xs font-semibold text-[var(--olive)] hover:bg-[var(--olive)] hover:text-[var(--ivory)]"
              >
                <Ico d={IC.plus} size={12}/> Thêm đầu việc lớn
              </button>
            )}
          </div>
        ) : (
          workstreams.map((ws) => {
            const wsProgress = calculateWorkstreamProgress(ws, props.tasksByParent, props.stepsByTask)
            const wsHead = props.employeeMap.get(ws.head_id || '')
            const wsHeadNames = (ws.head_ids && ws.head_ids.length > 0
              ? ws.head_ids.map((id) => props.employeeMap.get(id)?.full_name).filter((x): x is string => Boolean(x))
              : wsHead ? [wsHead.full_name] : [])
            const wsAssignee = props.employeeMap.get(ws.assignee_id || '')
            const wsCoOwnerIds = taskCoOwnerIds(ws)
            const wsSupporterIds = taskSupporterIds(ws, props.supportersByTask.get(ws.id) || [])
            const wsApproverIds = taskApproverIds(ws)
            const wsHeadNoDept = !!wsHead && !wsHead.department_id
            const wsAssigneeNoDept = !!wsAssignee && !wsAssignee.department_id
            const subtasks = props.tasksByParent.get(ws.id) || []
            const isWsExpanded = expandedWorkstreams.has(ws.id)

            return (
              <div key={ws.id} data-coo-id={ws.id} className="border-b border-[var(--border)] last:border-b-0 data-[coo-highlight]:ring-2 data-[coo-highlight]:ring-[var(--accent)] data-[coo-highlight]:bg-[var(--accent)]/8 transition-all">
                <div className="flex items-center gap-2 pl-5 pr-3 py-3 hover:bg-[var(--bg-surface)] transition-colors">
                  <button
                    type="button"
                    onClick={() => toggleWorkstream(ws.id)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <span className="w-3 shrink-0 text-xs font-bold text-[var(--text-secondary)]">
                      {isWsExpanded ? <Ico d={IC.chevronDown} size={14}/> : <Ico d={IC.chevronRight} size={14}/>}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-bold text-[var(--text-primary)]">{ws.title}</span>
                        <IssueBadge issueStatus={ws.issue_status} />
                        <span className="rounded-full bg-[var(--bg-base)] px-2 py-0.5 text-xs font-bold text-[var(--text-secondary)]">
                          {subtasks.length} việc con
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-secondary)]">
                        <span><span className="font-spec text-[9px] text-[var(--text-muted)]">LEAD</span> {wsHeadNames.length ? wsHeadNames.join(', ') : 'Chưa gán'}{wsHeadNoDept && <span className="ml-1 text-[var(--warning)]">!</span>}</span>
                        <span><span className="font-spec text-[9px] text-[var(--text-muted)]">CHÍNH</span> {wsAssignee ? wsAssignee.full_name : 'Chưa gán'}{wsAssigneeNoDept && <span className="ml-1 text-[var(--warning)]">!</span>}</span>
                        {wsCoOwnerIds.length > 0 && <span><span className="font-spec text-[9px] text-[var(--text-muted)]">ĐỒNG PT</span> {peopleLabel(wsCoOwnerIds, props.employeeMap)}</span>}
                        {wsSupporterIds.length > 0 && <span><span className="font-spec text-[9px] text-[var(--text-muted)]">HỖ TRỢ</span> {peopleLabel(wsSupporterIds, props.employeeMap)}</span>}
                        {wsApproverIds.length > 0 && <span><span className="font-spec text-[9px] text-[var(--text-muted)]">DUYỆT</span> {peopleLabel(wsApproverIds, props.employeeMap)}</span>}
                        {ws.due_date && <span>· {ws.due_date}</span>}
                        <span className="font-bold text-[var(--text-primary)]">{wsProgress}%</span>
                      </div>
                      {ws.description && (
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--text-muted)]">
                          <span className="font-spec text-[9px]">MÔ TẢ</span> {ws.description}
                        </p>
                      )}
                    </div>
                  </button>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <div className="flex flex-col items-start gap-0.5">
                      <span className="font-spec text-[8px] text-[var(--text-muted)]">LEAD</span>
                      <HeadPicker
                        headIds={ws.head_ids?.length ? ws.head_ids : (ws.head_id ? [ws.head_id] : [])}
                        employees={props.employees}
                        onSave={(ids) => props.updateTaskHead(ws.id, ids)}
                        placeholder="Chưa chọn"
                      />
                    </div>
                    <div className="flex flex-col items-start gap-0.5">
                      <span className="font-spec text-[8px] text-[var(--text-muted)]">CHÍNH</span>
                      <PersonPicker
                        value={ws.assignee_id}
                        employees={props.employees}
                        onSave={(id) => props.updateTaskAssignee(ws.id, id)}
                      />
                    </div>
                    <div className="hidden min-w-[150px] flex-col items-start gap-0.5 xl:flex">
                      <span className="font-spec text-[8px] text-[var(--text-muted)]">ĐỒNG PT</span>
                      <HeadPicker
                        headIds={wsCoOwnerIds}
                        employees={props.employees}
                        onSave={(ids) => props.updateTaskRoleIds(ws.id, 'co_owner_ids', ids, 'đồng phụ trách')}
                        placeholder="Chưa chọn"
                      />
                    </div>
                    {props.canCreateSubtask(ws) && (
                      <button type="button"
                        onClick={() => props.subtaskOpenFor === ws.id ? props.setSubtaskOpenFor('') : props.openSubtaskForm(ws)}
                        className={`rounded-[var(--radius-sm)] border px-2.5 py-1 text-xs font-semibold transition-colors ${
                          props.subtaskOpenFor === ws.id
                            ? 'border-[var(--olive)] bg-[var(--olive)] text-[var(--ivory)]'
                            : 'border-[var(--border)] bg-[var(--bg-surface)] text-[var(--olive)] hover:border-[var(--olive)]'
                        }`}
                      >
                        {props.subtaskOpenFor === ws.id ? '× Đóng' : '+ Việc con'}
                      </button>
                    )}
                    <button type="button"
                      onClick={() => props.setSelectedTask(ws)}
                      className="rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs font-bold text-[var(--text-primary)]"
                    >
                      Chi tiết
                    </button>
                    {props.canDeleteTask && (
                      <button type="button"
                        onClick={() => props.deleteTask(ws)}
                        className="rounded-lg bg-[var(--danger-soft)] px-2.5 py-1 text-xs font-bold text-[var(--danger)]"
                      >
                        Xóa
                      </button>
                    )}
                  </div>
                </div>

                {props.subtaskOpenFor === ws.id && (
                  <div className="pl-10 pr-4 pb-3">
                    <InlineSubtaskForm
                      parent={ws}
                      initialForm={props.subtaskForm}
                      departments={props.departments}
                      employees={props.employees}
                      createSubtask={props.createSubtask}
                      cancel={() => props.setSubtaskOpenFor('')}
                    />
                  </div>
                )}

                {isWsExpanded && (
                  <div className="border-t border-[var(--border)] bg-[var(--bg-surface)]">
                    <div className="pl-8">
                      <InlineFilePanel
                        task={ws}
                        reports={props.reportsByTask.get(ws.id) || []}
                        uploadTaskFile={props.uploadTaskFile}
                        deleteTaskReport={props.deleteTaskReport}
                      />
                    </div>
                    {subtasks.length === 0 ? (
                      <div className="py-3 pl-11 text-xs text-[var(--text-secondary)]">Chưa có đầu việc con.</div>
                    ) : (
                      subtasks.map((subtask) => {
                        const stepsForSubtask = props.stepsByTask.get(subtask.id) || []
                        const subtaskProgress = calculateTaskProgress(subtask, stepsForSubtask)
                        const isSubtaskExpanded = expandedSubtasks.has(subtask.id)
                        const subtaskAssignee = props.employeeMap.get(subtask.assignee_id || '')
                        const subtaskHeadIds = subtask.head_ids && subtask.head_ids.length > 0 ? subtask.head_ids : (subtask.head_id ? [subtask.head_id] : [])
                        const subtaskHeadNames = subtaskHeadIds.map((id) => props.employeeMap.get(id)?.full_name).filter((x): x is string => Boolean(x))
                        const subtaskHead = props.employeeMap.get(subtask.head_id || '')
                        const subtaskCoOwnerIds = taskCoOwnerIds(subtask)
                        const subtaskSupporterIds = taskSupporterIds(subtask, props.supportersByTask.get(subtask.id) || [])
                        const subtaskApproverIds = taskApproverIds(subtask)
                        const subtaskHeadNoDept = !!subtaskHead && !subtaskHead.department_id
                        const subtaskAssigneeNoDept = !!subtaskAssignee && !subtaskAssignee.department_id

                        return (
                          <div key={subtask.id} className="border-b border-[var(--border)] last:border-b-0">
                            <div className="flex items-center gap-2 pl-11 pr-3 py-2.5 hover:bg-[var(--bg-base)] transition-colors">
                              <button
                                type="button"
                                onClick={() => toggleSubtask(subtask.id)}
                                className="flex min-w-0 flex-1 items-center gap-3 text-left"
                              >
                                <span className="w-3 shrink-0 text-xs font-bold text-[var(--text-secondary)]">
                                  {isSubtaskExpanded ? <Ico d={IC.chevronDown} size={14}/> : <Ico d={IC.chevronRight} size={14}/>}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="truncate text-sm font-bold text-[var(--text-primary)]">{subtask.title}</span>
                                    <IssueBadge issueStatus={subtask.issue_status} />
                                    <span className="rounded-full border border-[var(--border)] bg-[var(--bg-card)] px-2 py-0.5 text-xs font-bold text-[var(--text-secondary)]">
                                      {stepsForSubtask.length} bước
                                    </span>
                                  </div>
                                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-secondary)]">
                                    <span><span className="font-spec text-[9px] text-[var(--text-muted)]">LEAD</span> {subtaskHeadNames.length ? subtaskHeadNames.join(', ') : 'Chưa gán'}{subtaskHeadNoDept && <span className="ml-1 text-[var(--warning)]">!</span>}</span>
                                    <span><span className="font-spec text-[9px] text-[var(--text-muted)]">CHÍNH</span> {subtaskAssignee ? subtaskAssignee.full_name : 'Chưa gán'}{subtaskAssigneeNoDept && <span className="ml-1 text-[var(--warning)]">!</span>}</span>
                                    {subtaskCoOwnerIds.length > 0 && <span><span className="font-spec text-[9px] text-[var(--text-muted)]">ĐỒNG PT</span> {peopleLabel(subtaskCoOwnerIds, props.employeeMap)}</span>}
                                    {subtaskSupporterIds.length > 0 && <span><span className="font-spec text-[9px] text-[var(--text-muted)]">HỖ TRỢ</span> {peopleLabel(subtaskSupporterIds, props.employeeMap)}</span>}
                                    {subtaskApproverIds.length > 0 && <span><span className="font-spec text-[9px] text-[var(--text-muted)]">DUYỆT</span> {peopleLabel(subtaskApproverIds, props.employeeMap)}</span>}
                                    {subtask.due_date && <span>· {subtask.due_date}</span>}
                                    <span className="font-bold text-[var(--text-primary)]">{subtaskProgress}%</span>
                                  </div>
                                  {subtask.description && (
                                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--text-muted)]">
                                      <span className="font-spec text-[9px]">MÔ TẢ</span> {subtask.description}
                                    </p>
                                  )}
                                </div>
                              </button>
                              <div className="flex shrink-0 items-center gap-1.5">
                                <div className="flex flex-col items-start gap-0.5">
                                  <span className="font-spec text-[8px] text-[var(--text-muted)]">LEAD</span>
                                  <HeadPicker
                                    headIds={subtaskHeadIds}
                                    employees={props.employees}
                                    onSave={(ids) => props.updateTaskHead(subtask.id, ids)}
                                    placeholder="Chưa chọn"
                                  />
                                </div>
                                <div className="flex flex-col items-start gap-0.5">
                                  <span className="font-spec text-[8px] text-[var(--text-muted)]">CHÍNH</span>
                                  <PersonPicker
                                    value={subtask.assignee_id}
                                    employees={props.employees}
                                    onSave={(id) => props.updateTaskAssignee(subtask.id, id)}
                                  />
                                </div>
                                <div className="hidden min-w-[150px] flex-col items-start gap-0.5 xl:flex">
                                  <span className="font-spec text-[8px] text-[var(--text-muted)]">ĐỒNG PT</span>
                                  <HeadPicker
                                    headIds={subtaskCoOwnerIds}
                                    employees={props.employees}
                                    onSave={(ids) => props.updateTaskRoleIds(subtask.id, 'co_owner_ids', ids, 'đồng phụ trách')}
                                    placeholder="Chưa chọn"
                                  />
                                </div>
                                <button type="button"
                                  onClick={() => props.setSelectedTask(subtask)}
                                  className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-2.5 py-1 text-xs font-bold text-[var(--text-primary)]"
                                >
                                  Chi tiết
                                </button>
                                {props.canDeleteTask && (
                                  <button type="button"
                                    onClick={() => props.deleteTask(subtask)}
                                    className="rounded-lg bg-[var(--danger-soft)] px-2.5 py-1 text-xs font-bold text-[var(--danger)]"
                                  >
                                    Xóa
                                  </button>
                                )}
                              </div>
                            </div>

                            {isSubtaskExpanded && (
                              <div className="pb-4 pl-11 pr-4 pt-1">
                                <div className="-mx-4 mb-3">
                                  <InlineFilePanel
                                    task={subtask}
                                    reports={props.reportsByTask.get(subtask.id) || []}
                                    uploadTaskFile={props.uploadTaskFile}
                                    deleteTaskReport={props.deleteTaskReport}
                                  />
                                </div>
                                <SubtaskCard
                                  task={subtask}
                                  steps={stepsForSubtask}
                                  commentsByStep={props.commentsByStep}
                                  supporters={props.supportersByTask.get(subtask.id) || []}
                                  reports={props.reportsByTask.get(subtask.id) || []}
                                  employees={props.employees}
                                  employeeMap={props.employeeMap}
                                  departmentMap={props.departmentMap}
                                  canApproveStep={props.canApproveStep}
                                  setSelectedTask={props.setSelectedTask}
                                  openStepForm={props.openStepForm}
                                  stepOpenFor={props.stepOpenFor}
                                  setStepOpenFor={props.setStepOpenFor}
                                  stepForm={props.stepForm}
                                  createStep={props.createStep}
                                  updateTaskStatus={props.updateTaskStatus}
                                  updateIssueStatus={props.updateIssueStatus}
                                  updateTaskHead={props.updateTaskHead}
                                  updateTaskAssignee={props.updateTaskAssignee}
                                  updateTaskRoleIds={props.updateTaskRoleIds}
                                  updateTaskDescription={props.updateTaskDescription}
                                  updateStep={props.updateStep}
                                  submitStep={props.submitStep}
                                  approveStep={props.approveStep}
                                  requestRevision={props.requestRevision}
                                  revisionDrafts={props.revisionDrafts}
                                  setRevisionDrafts={props.setRevisionDrafts}
                                  linkDrafts={props.linkDrafts}
                                  setLinkDrafts={props.setLinkDrafts}
                                  saveStepLink={props.saveStepLink}
                                  supportDrafts={props.supportDrafts}
                                  setSupportDrafts={props.setSupportDrafts}
                                  saveSupportRequest={props.saveSupportRequest}
                                  commentDrafts={props.commentDrafts}
                                  setCommentDrafts={props.setCommentDrafts}
                                  addComment={props.addComment}
                                  uploadStepFile={props.uploadStepFile}
                                  deleteTask={props.deleteTask}
                                  deleteStep={props.deleteStep}
                                  deleteSupporter={props.deleteSupporter}
                                  clearStepFile={props.clearStepFile}
                                  supporterDrafts={props.supporterDrafts}
                                  setSupporterDrafts={props.setSupporterDrafts}
                                  createSupporter={props.createSupporter}
                                  getStatusLabel={props.getStatusLabel}
                                  updateTaskSequential={props.updateTaskSequential}
                                  expandedSteps={expandedSteps}
                                  toggleStep={toggleStep}
                                />
                              </div>
                            )}
                          </div>
                        )
                      })
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    )
  }

  // -- Filter bar (shared) --
  const filterBar = (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3">
      <div className="relative flex-1 min-w-[180px]">
        <Ico d={IC.search} size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
        <input
          type="text"
          placeholder="Tìm đầu việc..."
          className="h-8 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] pl-8 pr-3 text-sm outline-none focus:border-[var(--accent-hover)]"
          value={boardSearch}
          onChange={(e) => setBoardSearch(e.target.value)}
        />
      </div>
      <select
        className="h-8 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-2 text-sm outline-none"
        value={boardDeptFilter}
        onChange={(e) => setBoardDeptFilter(e.target.value)}
      >
        <option value="">Tất cả phòng ban</option>
        {props.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
      </select>
      <select
        className="h-8 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-2 text-sm outline-none"
        value={boardStatusFilter}
        onChange={(e) => setBoardStatusFilter(e.target.value)}
      >
        <option value="">Tất cả trạng thái</option>
        <option value="not_started">Chưa bắt đầu</option>
        <option value="in_progress">Đang thực hiện</option>
        <option value="completed">Hoàn thành</option>
        <option value="problem">Có vấn đề / Trễ</option>
      </select>
      {(boardSearch || boardDeptFilter || boardStatusFilter) && (
        <button
          type="button"
          onClick={() => { setBoardSearch(''); setBoardDeptFilter(''); setBoardStatusFilter('') }}
          className="h-8 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-2.5 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          × Xóa lọc
        </button>
      )}
    </div>
  )

  // -- WORKSPACE VIEW --
  if (props.selectedProjectId !== 'all') {
    const project = props.projects.find((p) => p.id === props.selectedProjectId)
    if (!project) return null
    const allProjectWorkstreams = props.workstreams.filter((ws) => ws.project_id === project.id)
    const filteredWorkstreams = (boardSearch || boardDeptFilter || boardStatusFilter)
      ? allProjectWorkstreams.filter(wsMatchesFilter)
      : allProjectWorkstreams
    const projectProgress = calculateProjectProgress(allProjectWorkstreams, props.tasksByParent, props.stepsByTask)
    const health = calculateProjectHealth(project.id, props.workstreams, allSteps, props.stepsByTask)
    const totalSubtasks = allProjectWorkstreams.reduce((s, ws) => s + (props.tasksByParent.get(ws.id) || []).length, 0)
    const overdueWS = allProjectWorkstreams.filter((ws) => isTaskOverdue(ws)).length

    const WORKSPACE_TABS = [
      { id: 'workstreams', label: 'Đầu việc lớn' },
      { id: 'overview', label: 'Tổng quan' },
      { id: 'deadline', label: 'Deadline' },
      { id: 'files', label: 'File & Báo cáo' },
      { id: 'history', label: 'Lịch sử' },
    ] as const

    return (
      <div className="space-y-4">
        {/* Workspace header */}
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] px-5 py-4">
          <button
            type="button"
            onClick={() => { props.setSelectedProjectId('all'); setWorkspaceTab('workstreams') }}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)]"
          >
            <Ico d={IC.chevronLeft} size={13}/> Quay lại
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="font-extrabold text-[var(--text-primary)] truncate">{project.name}</h2>
            {project.description && <p className="mt-0.5 text-xs text-[var(--text-secondary)] line-clamp-1">{project.description}</p>}
          </div>
          <div className="flex items-center gap-5 shrink-0">
            <div className="text-center">
              <div className="text-lg font-extrabold text-[var(--text-primary)]">{projectProgress}%</div>
              <div className="text-[10px] font-spec text-[var(--text-muted)]">TIẾN ĐỘ</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-extrabold text-[var(--text-primary)]">{allProjectWorkstreams.length}</div>
              <div className="text-[10px] font-spec text-[var(--text-muted)]">ĐẦU VIỆC</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-extrabold text-[var(--text-primary)]">{totalSubtasks}</div>
              <div className="text-[10px] font-spec text-[var(--text-muted)]">VIỆC CON</div>
            </div>
            {overdueWS > 0 && (
              <div className="text-center">
                <div className="text-lg font-extrabold text-[var(--danger)]">{overdueWS}</div>
                <div className="text-[10px] font-spec text-[var(--text-muted)]">TRỄ HẠN</div>
              </div>
            )}
          </div>
          <ProjectHealthBadge health={health}/>
          {props.canEditProject && (
            <button
              type="button"
              onClick={() => props.onEditProject(project)}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-surface)]"
            >
              <Ico d={IC.edit} size={13}/> Sửa
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-0.5 border-b border-[var(--border)] px-1">
          {WORKSPACE_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setWorkspaceTab(tab.id)}
              className={`px-4 py-2.5 text-sm font-semibold transition-colors ${
                workspaceTab === tab.id
                  ? 'border-b-2 border-[var(--olive)] text-[var(--olive)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {tab.label}
            </button>
          ))}
          {props.canCreateWorkstream && workspaceTab === 'workstreams' && (
            <button
              type="button"
              onClick={() => props.openWorkstreamForm(project.id)}
              className="ml-auto flex items-center gap-1.5 rounded-lg border border-[var(--olive)] px-3 py-1 text-xs font-semibold text-[var(--olive)] hover:bg-[var(--olive)] hover:text-[var(--ivory)] mb-1"
            >
              <Ico d={IC.plus} size={12}/> Đầu việc lớn
            </button>
          )}
        </div>

        {/* Tab: Đầu việc lớn */}
        {workspaceTab === 'workstreams' && (
          <div className="space-y-3">
            {filterBar}
            <WorkstreamList project={project} workstreams={filteredWorkstreams}/>
          </div>
        )}

        {/* Tab: Tổng quan */}
        {workspaceTab === 'overview' && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6">
              <h3 className="mb-3 text-xs font-spec text-[var(--text-muted)]">TÌNH TRẠNG VẬN HÀNH</h3>
              <ProjectHealthSummary health={health}/>
            </div>
            {project.description && (
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6">
                <h3 className="mb-2 text-xs font-spec text-[var(--text-muted)]">MÔ TẢ DỰ ÁN</h3>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{project.description}</p>
              </div>
            )}
          </div>
        )}

        {/* Tab: Deadline */}
        {workspaceTab === 'deadline' && (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6">
            {allProjectWorkstreams.length === 0 ? (
              <EmptyState title="Chưa có đầu việc lớn" description="Thêm đầu việc lớn để xem deadline."/>
            ) : (
              <div className="space-y-1">
                {allProjectWorkstreams
                  .filter((ws) => ws.due_date)
                  .sort((a, b) => (a.due_date || '') < (b.due_date || '') ? -1 : 1)
                  .map((ws) => {
                    const overdue = isTaskOverdue(ws)
                    const subtasks = props.tasksByParent.get(ws.id) || []
                    const subtasksWithDeadline = subtasks.filter((s) => s.due_date)
                    return (
                      <div key={ws.id} className="py-2 border-b border-[var(--border)] last:border-0">
                        <div className="flex items-center gap-3">
                          <div className={`mt-0.5 h-2 w-2 rounded-full shrink-0 ${overdue ? 'bg-[var(--danger)]' : 'bg-[var(--olive)]'}`}/>
                          <span className="font-semibold text-sm text-[var(--text-primary)] flex-1 truncate">{ws.title}</span>
                          <span className={`shrink-0 text-sm font-bold ${overdue ? 'text-[var(--danger)]' : 'text-[var(--text-secondary)]'}`}>{ws.due_date}</span>
                        </div>
                        {subtasksWithDeadline.length > 0 && (
                          <div className="mt-1 ml-5 space-y-0.5">
                            {subtasksWithDeadline.map((s) => (
                              <div key={s.id} className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                                <span className="text-[var(--text-muted)]">+</span>
                                <span className="truncate">{s.title}</span>
                                <span className={`shrink-0 font-semibold ${isTaskOverdue(s) ? 'text-[var(--danger)]' : ''}`}>{s.due_date}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })
                }
                {allProjectWorkstreams.filter((ws) => !ws.due_date).length > 0 && (
                  <p className="pt-2 text-xs text-[var(--text-muted)]">
                    + {allProjectWorkstreams.filter((ws) => !ws.due_date).length} đầu việc chưa có deadline
                  </p>
                )}
                {allProjectWorkstreams.every((ws) => !ws.due_date) && (
                  <EmptyState title="Chưa có deadline" description="Các đầu việc lớn chưa được gán deadline."/>
                )}
              </div>
            )}
          </div>
        )}

        {/* Tab: File & Báo cáo */}
        {workspaceTab === 'files' && (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6">
            {allProjectWorkstreams.length === 0 ? (
              <EmptyState title="Chưa có đầu việc lớn" description="Thêm đầu việc lớn để xem file."/>
            ) : (
              (() => {
                const allReportsInProject = allProjectWorkstreams.flatMap((ws) => [
                  ...(props.reportsByTask.get(ws.id) || []).map((r) => ({ ...r, _wsTitle: ws.title })),
                  ...(props.tasksByParent.get(ws.id) || []).flatMap((s) =>
                    (props.reportsByTask.get(s.id) || []).map((r) => ({ ...r, _wsTitle: ws.title, _stTitle: s.title }))
                  ),
                ])
                if (allReportsInProject.length === 0) {
                  return <EmptyState title="Chưa có file" description="File báo cáo sẽ hiện ở đây khi đầu việc có báo cáo."/>
                }
                return (
                  <div className="space-y-4">
                    {allProjectWorkstreams.map((ws) => {
                      const wsReports = [
                        ...(props.reportsByTask.get(ws.id) || []).map((r) => ({ ...r, _label: ws.title })),
                        ...(props.tasksByParent.get(ws.id) || []).flatMap((s) =>
                          (props.reportsByTask.get(s.id) || []).map((r) => ({ ...r, _label: s.title }))
                        ),
                      ]
                      if (wsReports.length === 0) return null
                      return (
                        <div key={ws.id}>
                          <h4 className="mb-2 text-xs font-spec text-[var(--text-muted)]">{ws.title}</h4>
                          <div className="space-y-1">
                            {wsReports.map((r) => (
                              <a key={r.id} href={r.file_url} target="_blank" rel="noreferrer"
                                className="flex items-center gap-2 rounded-lg p-2 hover:bg-[var(--bg-surface)] text-sm transition-colors">
                                <Ico d={IC.paperclip} size={13} className="text-[var(--text-muted)] shrink-0"/>
                                <span className="truncate text-[var(--text-primary)]">{r.file_name || r.file_url}</span>
                              </a>
                            ))}
                          </div>
                        </div>
                      )
                    }).filter(Boolean)}
                  </div>
                )
              })()
            )}
          </div>
        )}

        {/* Tab: Lịch sử hoạt động */}
        {workspaceTab === 'history' && (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6">
            {(() => {
              type ActivityEvent = {
                id: string
                at: string
                icon: string
                label: string
                sub?: string
                color?: string
              }

              const events: ActivityEvent[] = []

              // Workstreams added
              allProjectWorkstreams.forEach((ws) => {
                if (ws.created_at) {
                  events.push({ id: `ws-${ws.id}`, at: ws.created_at, icon: 'LIST', label: `Thêm đầu việc lớn: ${ws.title}`, sub: project.name })
                }
                // Workstream completed
                if (ws.status === 'completed' && ws.created_at) {
                  events.push({ id: `ws-done-${ws.id}`, at: ws.created_at, icon: 'OK', label: `Hoàn thành: ${ws.title}`, color: 'text-[var(--success)]' })
                }
                // Subtasks added
                const subtasks = props.tasksByParent.get(ws.id) || []
                subtasks.forEach((st) => {
                  if (st.created_at) {
                    events.push({ id: `st-${st.id}`, at: st.created_at, icon: 'PIN', label: `Thêm task: ${st.title}`, sub: ws.title })
                  }
                  if (st.status === 'completed' && st.created_at) {
                    events.push({ id: `st-done-${st.id}`, at: st.created_at, icon: 'OK', label: `Hoàn thành task: ${st.title}`, color: 'text-[var(--success)]' })
                  }
                  // Steps
                  const steps = props.stepsByTask.get(st.id) || []
                  steps.forEach((step) => {
                    if (step.is_done && step.submitted_at) {
                      events.push({ id: `step-done-${step.id}`, at: step.submitted_at, icon: 'STEP', label: `Bước "${step.step_title}" hoàn thành`, sub: st.title })
                    }
                    // Comments
                    const comments = props.commentsByStep.get(step.id) || []
                    comments.forEach((c) => {
                      const actor = c.employees?.full_name || 'Ai đó'
                      events.push({ id: `cmt-${c.id}`, at: c.created_at, icon: 'CMT', label: `${actor} bình luận tại bước "${step.step_title}"`, sub: c.comment.slice(0, 60) + (c.comment.length > 60 ? '...' : '') })
                    })
                  })
                  // Reports / files
                  const reports = props.reportsByTask.get(st.id) || []
                  reports.forEach((r) => {
                    events.push({ id: `rpt-${r.id}`, at: r.created_at, icon: 'FILE', label: `Upload file: ${r.file_name || 'file'}`, sub: st.title })
                  })
                })
                // Workstream-level reports
                const wsReports = props.reportsByTask.get(ws.id) || []
                wsReports.forEach((r) => {
                  events.push({ id: `rpt-ws-${r.id}`, at: r.created_at, icon: 'FILE', label: `Upload file: ${r.file_name || 'file'}`, sub: ws.title })
                })
              })

              // Sort newest first
              events.sort((a, b) => b.at.localeCompare(a.at))

              if (events.length === 0) {
                return (
                  <div className="flex flex-col items-center gap-3 py-10 text-center">
                    <div className="text-4xl">??</div>
                    <p className="font-semibold text-[var(--text-secondary)]">Chưa có lịch sử hoạt động</p>
                    <p className="text-sm text-[var(--text-muted)]">Các thay đổi trong dự án sẽ hiển thị tại đây.</p>
                  </div>
                )
              }

              function fmtAt(iso: string) {
                const d = new Date(iso)
                const pad = (n: number) => String(n).padStart(2, '0')
                return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
              }

              return (
                <div className="space-y-0">
                  {events.slice(0, 80).map((ev) => (
                    <div key={ev.id} className="flex items-start gap-3 py-2.5 border-b border-[var(--border)] last:border-0">
                      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--bg-surface)] text-sm">
                        {ev.icon}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm font-medium ${ev.color || 'text-[var(--text-primary)]'}`}>{ev.label}</p>
                        {ev.sub && <p className="text-xs text-[var(--text-muted)] truncate">{ev.sub}</p>}
                      </div>
                      <span className="shrink-0 text-xs text-[var(--text-muted)] tabular-nums">{fmtAt(ev.at)}</span>
                    </div>
                  ))}
                  {events.length > 80 && (
                    <p className="pt-3 text-center text-xs text-[var(--text-muted)]">+ {events.length - 80} sự kiện cũ hơn</p>
                  )}
                </div>
              )
            })()}
          </div>
        )}
      </div>
    )
  }

  // -- GRID VIEW (selectedProjectId === 'all') --
  const CARD_COLORS = ['bg-purple-500', 'bg-emerald-500', 'bg-blue-500', 'bg-amber-500', 'bg-rose-500', 'bg-indigo-500', 'bg-teal-500', 'bg-orange-500']

  return (
    <div className="space-y-4">
      {filterBar}

      {props.projects.length === 0 ? (
        <Card>
          <EmptyState title="Chưa có dự án" description="Bấm + Tạo mới để thêm dự án." />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {props.projects.map((project, idx) => {
            const allProjectWorkstreams = props.workstreams.filter((ws) => ws.project_id === project.id)
            const filteredWS = (boardSearch || boardDeptFilter || boardStatusFilter)
              ? allProjectWorkstreams.filter(wsMatchesFilter)
              : allProjectWorkstreams
            if ((boardSearch || boardDeptFilter || boardStatusFilter) && filteredWS.length === 0) return null
            const projectProgress = calculateProjectProgress(allProjectWorkstreams, props.tasksByParent, props.stepsByTask)
            const health = calculateProjectHealth(project.id, props.workstreams, allSteps, props.stepsByTask)
            const totalSubtasks = allProjectWorkstreams.reduce((s, ws) => s + (props.tasksByParent.get(ws.id) || []).length, 0)
            const overdueWS = allProjectWorkstreams.filter((ws) => isTaskOverdue(ws)).length
            const memberIds = new Set<string>()
            allProjectWorkstreams.forEach((ws) => {
              if (ws.head_id) memberIds.add(ws.head_id)
              ;(ws.head_ids || []).forEach((id) => memberIds.add(id))
              if (ws.assignee_id) memberIds.add(ws.assignee_id)
            })
            const members = [...memberIds].slice(0, 5).map((id) => props.employeeMap.get(id)).filter((x): x is Employee => Boolean(x))
            const color = CARD_COLORS[idx % CARD_COLORS.length]
            const ringC = 2 * Math.PI * 26

            return (
              <div
                key={project.id}
                onClick={() => { props.setSelectedProjectId(project.id); setWorkspaceTab('workstreams') }}
                className="group cursor-pointer rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-sm hover:shadow-md hover:border-[var(--olive)]/50 transition-all flex flex-col gap-4"
              >
                {/* Card header */}
                <div className="flex items-start gap-3">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white text-lg font-extrabold ${color}`}>
                    {project.name.charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-extrabold text-[var(--text-primary)] leading-tight truncate">{project.name}</h3>
                    {project.description && (
                      <p className="mt-0.5 text-xs text-[var(--text-secondary)] line-clamp-2">{project.description}</p>
                    )}
                  </div>
                  <ProjectHealthBadge health={health}/>
                </div>

                {/* Progress ring + stats */}
                <div className="flex items-center gap-4">
                  <div className="relative shrink-0">
                    <svg width="64" height="64" viewBox="0 0 64 64" style={{ transform: 'rotate(-90deg)' }}>
                      <circle cx="32" cy="32" r="26" fill="none" stroke="var(--border)" strokeWidth="6"/>
                      <circle cx="32" cy="32" r="26" fill="none" stroke="var(--olive)" strokeWidth="6"
                        strokeDasharray={`${(projectProgress / 100) * ringC} ${ringC}`}
                        strokeLinecap="round"/>
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-xs font-extrabold text-[var(--text-primary)]">{projectProgress}%</span>
                    </div>
                  </div>
                  <div className="flex-1 grid grid-cols-2 gap-2">
                    <div className="rounded-xl bg-[var(--bg-surface)] p-2 text-center">
                      <div className="text-base font-extrabold text-[var(--text-primary)]">{allProjectWorkstreams.length}</div>
                      <div className="text-[10px] font-spec text-[var(--text-muted)] leading-tight">ĐẦU VIỆC LỚN</div>
                    </div>
                    <div className="rounded-xl bg-[var(--bg-surface)] p-2 text-center">
                      <div className="text-base font-extrabold text-[var(--text-primary)]">{totalSubtasks}</div>
                      <div className="text-[10px] font-spec text-[var(--text-muted)] leading-tight">VIỆC CON</div>
                    </div>
                    {overdueWS > 0 && (
                      <div className="col-span-2 rounded-xl bg-[var(--danger-soft)] p-2 text-center">
                        <div className="text-base font-extrabold text-[var(--danger)]">{overdueWS}</div>
                        <div className="text-[10px] font-spec text-[var(--danger)] leading-tight">VIỆC TRỄ HẠN</div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Members */}
                {members.length > 0 && (
                  <div className="flex items-center gap-1">
                    {members.map((m) => (
                      <div key={m.id} title={m.full_name}
                        className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--olive)]/20 text-[8px] font-bold text-[var(--olive)] ring-1 ring-[var(--bg-card)]">
                        {m.full_name?.charAt(0)}
                      </div>
                    ))}
                    {memberIds.size > 5 && (
                      <div className="flex h-6 items-center rounded-full bg-[var(--bg-surface)] px-1.5 text-[10px] font-semibold text-[var(--text-muted)]">
                        +{memberIds.size - 5}
                      </div>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 pt-1 border-t border-[var(--border)]">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); props.setSelectedProjectId(project.id); setWorkspaceTab('workstreams') }}
                    className="flex-1 rounded-lg border border-[var(--olive)] py-1.5 text-xs font-semibold text-[var(--olive)] hover:bg-[var(--olive)] hover:text-[var(--ivory)] transition-colors"
                  >
                    Mở workspace
                  </button>
                  {props.canEditProject && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); props.onEditProject(project) }}
                      className="rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)]"
                    >
                      Sửa
                    </button>
                  )}
                  {props.canDeleteTask && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); props.deleteProject(project) }}
                      className="rounded-lg border border-[var(--danger)]/30 px-2.5 py-1.5 text-xs font-semibold text-[var(--danger)] hover:bg-[var(--danger-soft)]"
                    >
                      Xóa
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function InlineSubtaskForm(props: {
  parent: Task
  initialForm: SubtaskForm
  departments: Department[]
  employees: Employee[]
  createSubtask: (parent: Task, form: SubtaskForm) => void
  cancel: () => void
}) {
  const [form, setForm] = useState<SubtaskForm>(props.initialForm)
  return (
    <div className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-4">
      <h4 className="mb-3 font-extrabold">Tạo đầu việc con</h4>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <Input
          placeholder="Tên đầu việc con"
          value={form.title}
          onChange={(value) => setForm({ ...form, title: value })}
        />
        <textarea
          rows={2}
          placeholder="Mô tả — mục tiêu, yêu cầu đầu ra..."
          className="resize-none rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 text-sm outline-none focus:border-[var(--accent-hover)] xl:col-span-1"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
        <Select
          value={form.departmentId}
          onChange={(value) => setForm({ ...form, departmentId: value })}
        >
          <option value="">Chọn phòng ban</option>
          {props.departments.map((department) => (
            <option key={department.id} value={department.id}>
              {department.name}
            </option>
          ))}
        </Select>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-bold text-[var(--text-secondary)]">Lead / ngu?i giao vi?c</label>
          <HeadPicker
            headIds={form.headIds || []}
            employees={props.employees}
            onSave={(ids) => setForm({ ...form, headIds: ids, headId: ids[0] || '' })}
          />
        </div>
        <Select
          value={form.assigneeId}
          onChange={(value) => setForm({ ...form, assigneeId: value })}
        >
          <option value="">Ch?n ngu?i ch?u trách nhi?m chính</option>
          {props.employees.map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.full_name}
            </option>
          ))}
        </Select>
        <MultiPersonField
          label="Đồng phụ trách"
          ids={form.coOwnerIds}
          employees={props.employees}
          onSave={(ids) => setForm({ ...form, coOwnerIds: ids })}
          placeholder="Chọn đồng phụ trách"
        />
        <MultiPersonField
          label="Người hỗ trợ"
          ids={form.supporterIds}
          employees={props.employees}
          onSave={(ids) => setForm({ ...form, supporterIds: ids })}
          placeholder="Chọn người hỗ trợ"
        />
        <MultiPersonField
          label="Người duyệt"
          ids={form.reviewerIds}
          employees={props.employees}
          onSave={(ids) => setForm({ ...form, reviewerIds: ids })}
          placeholder="Chọn người duyệt"
        />
        <MultiPersonField
          label="Người theo dõi"
          ids={form.watcherIds}
          employees={props.employees}
          onSave={(ids) => setForm({ ...form, watcherIds: ids })}
          placeholder="Chọn người theo dõi"
        />
        <input
          type="date"
          className="h-12 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] px-4 text-sm outline-none"
          value={form.dueDate}
          onChange={(event) => setForm({ ...form, dueDate: event.target.value })}
        />
        <Select
          value={form.priority}
          onChange={(value) => setForm({ ...form, priority: value })}
        >
          <option value="low">Ưu tiên thấp</option>
          <option value="medium">Uu tiên trung bình</option>
          <option value="high">Uu tiên cao</option>
        </Select>
      </div>

      <div className="mt-4 flex gap-2">
        <button type="button"
          onClick={() => props.createSubtask(props.parent, form)}
          className="rounded-xl bg-[var(--bg-card)] px-4 py-2 text-sm font-extrabold text-[var(--text-primary)]"
        >
          Lưu đầu việc con
        </button>
        <button type="button"
          onClick={props.cancel}
          className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-bold"
        >
          Hủy
        </button>
      </div>
    </div>
  )
}


function SubtaskCard(props: {
  task: Task
  steps: TaskStep[]
  commentsByStep: Map<string, StepComment[]>
  supporters: TaskSupporter[]
  reports: TaskReport[]
  employees: Employee[]
  employeeMap: Map<string, Employee>
  departmentMap: Map<string, Department>
  canApproveStep: (step: TaskStep) => boolean
  setSelectedTask: (task: Task) => void
  openStepForm: (task: Task) => void
  stepOpenFor: string
  setStepOpenFor: (value: string) => void
  stepForm: StepForm
  createStep: (taskId: string, form: StepForm) => void
  updateTaskStatus: (taskId: string, status: string) => void
  updateIssueStatus: (taskId: string, status: string) => void
  updateTaskHead: (taskId: string, headIds: string[]) => void
  updateTaskAssignee: (taskId: string, assigneeId: string | null) => void
  updateTaskRoleIds: (
    taskId: string,
    field: 'co_owner_ids' | 'supporter_ids' | 'reviewer_ids' | 'watcher_ids' | 'approver_ids',
    ids: string[],
    label: string,
  ) => void
  updateTaskDescription: (taskId: string, description: string) => void
  updateStep: (step: TaskStep, patch: Partial<TaskStep>) => void
  submitStep: (step: TaskStep) => void
  approveStep: (step: TaskStep) => void
  requestRevision: (step: TaskStep) => void
  revisionDrafts: Record<string, string>
  setRevisionDrafts: (value: Record<string, string>) => void
  linkDrafts: Record<string, string>
  setLinkDrafts: (value: Record<string, string>) => void
  saveStepLink: (step: TaskStep) => void
  supportDrafts: Record<string, string>
  setSupportDrafts: (value: Record<string, string>) => void
  saveSupportRequest: (step: TaskStep) => void
  commentDrafts: Record<string, string>
  setCommentDrafts: (value: Record<string, string>) => void
  addComment: AddStepComment
  uploadStepFile: (step: TaskStep, file?: File) => void
  deleteTask: (task: Task) => void
  deleteStep: (step: TaskStep) => void
  deleteSupporter: (supporter: TaskSupporter) => void
  clearStepFile: (step: TaskStep) => void
  supporterDrafts: Record<string, string>
  setSupporterDrafts: (value: Record<string, string>) => void
  createSupporter: (taskId: string) => void
  getStatusLabel: (status: string) => string
  updateTaskSequential: (taskId: string, sequential: boolean) => void
  expandedSteps: Set<string>
  toggleStep: (id: string) => void
}) {
  const head = props.employeeMap.get(props.task.head_id || props.task.assignee_id || '')
  const department = props.departmentMap.get(head?.department_id || props.task.department_id || '')
  const taskCoOwners = taskCoOwnerIds(props.task)
  const taskSupporters = taskSupporterIds(props.task, props.supporters)
  const taskApprovers = taskApproverIds(props.task)
  const headHasNoDept = !!head && !head.department_id
  const progress = calculateTaskProgress(props.task, props.steps)
  const slow = isTaskSlow(props.task, props.steps)
  const overdue = isTaskOverdue(props.task)
  const problem = isTaskProblem(props.task)
  const [descriptionDraft, setDescriptionDraft] = useState(props.task.description || '')
  const [descOpen, setDescOpen] = useState(false)

  useEffect(() => {
    setDescriptionDraft(props.task.description || '')
  }, [props.task.id, props.task.description])

  return (
    <div className={`rounded-2xl border bg-[var(--bg-card)] p-5 shadow-sm ${overdue || problem ? 'border-[var(--danger)]/30' : 'border-[var(--border)]'}`}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h4 className="text-lg font-extrabold">{props.task.title}</h4>
            <StatusBadge status={props.task.status} label={props.getStatusLabel(props.task.status)} />
            <IssueBadge issueStatus={props.task.issue_status} />
            {slow && <span className="rounded-full bg-[var(--warning-soft)] px-3 py-1 text-xs font-bold text-[var(--warning)]">Chậm tiến độ</span>}
            {overdue && <span className="rounded-full bg-[var(--danger-soft)] px-3 py-1 text-xs font-semibold text-[var(--danger)]">Quá hạn</span>}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--text-secondary)]">
            <span>Lead:</span>
            <HeadPicker
              headIds={props.task.head_ids || (props.task.head_id ? [props.task.head_id] : [])}
              employees={props.employees}
              onSave={(ids) => props.updateTaskHead(props.task.id, ids)}
            />
            <span>· Phòng ban: {headHasNoDept
              ? <b className="text-[var(--warning)]">? Head chua du?c g?n phòng ban</b>
              : <b>{department?.name || 'Chưa gắn'}</b>
            } · Deadline: <b>{props.task.due_date || 'Chua có'}</b></span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-secondary)]">
            <span><span className="font-spec text-[9px] text-[var(--text-muted)]">CHÍNH</span> {peopleLabel(props.task.assignee_id ? [props.task.assignee_id] : [], props.employeeMap)}</span>
            {taskCoOwners.length > 0 && <span><span className="font-spec text-[9px] text-[var(--text-muted)]">ĐỒNG PT</span> {peopleLabel(taskCoOwners, props.employeeMap)}</span>}
            {taskSupporters.length > 0 && <span><span className="font-spec text-[9px] text-[var(--text-muted)]">H? TR?</span> {peopleLabel(taskSupporters, props.employeeMap)}</span>}
            {taskApprovers.length > 0 && <span><span className="font-spec text-[9px] text-[var(--text-muted)]">DUY?T</span> {peopleLabel(taskApprovers, props.employeeMap)}</span>}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <select
            className="h-10 rounded-xl border border-[var(--border)] px-2 text-xs font-bold"
            value={props.task.status}
            onChange={(event) => props.updateTaskStatus(props.task.id, event.target.value)}
          >
            <option value="not_started">Chưa bắt đầu</option>
            <option value="in_progress">Đang làm</option>
            <option value="pending">Pending</option>
            <option value="completed">Hoàn thành</option>
            <option value="overdue">Trễ deadline</option>
          </select>

          <select
            className="h-10 rounded-xl border border-[var(--border)] px-2 text-xs font-bold"
            value={props.task.issue_status || 'normal'}
            onChange={(event) => props.updateIssueStatus(props.task.id, event.target.value)}
          >
            <option value="normal">Bình thường</option>
            <option value="watch">Cần theo dõi</option>
            <option value="slow">Đang chậm</option>
            <option value="problem">Có vấn đề</option>
          </select>

          <select
            className="h-10 rounded-xl border border-[var(--border)] px-2 text-xs font-bold"
            value={props.supporterDrafts[props.task.id] || ''}
            onChange={(event) => {
              props.setSupporterDrafts({ ...props.supporterDrafts, [props.task.id]: event.target.value })
              if (event.target.value) setTimeout(() => props.createSupporter(props.task.id), 0)
            }}
          >
            <option value="">+ Thêm người hỗ trợ</option>
            {props.employees.map((employee) => (
              <option key={employee.id} value={employee.id}>{employee.full_name}</option>
            ))}
          </select>

          <button type="button"
            onClick={() => props.setSelectedTask(props.task)}
            className="h-10 rounded-xl border border-[var(--border)] px-3 text-xs font-bold"
          >
            Chi tiết / File
          </button>

          <button type="button"
            onClick={() => props.deleteTask(props.task)}
            className="h-10 rounded-[var(--radius)] bg-[var(--danger-soft)] px-3 text-xs font-semibold text-[var(--danger)]"
          >
            Xóa
          </button>
        </div>
      </div>

      <div className="mb-4">
        <div className="mb-2 flex justify-between text-sm">
          <span className="font-bold">Tiến độ theo bước đã duyệt</span>
          <span className="font-extrabold text-[var(--olive)]">{progress}%</span>
        </div>
        <ProgressBar value={progress} />
      </div>

      {/* Mô tả đầu việc — accordion */}
      <div className="mb-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] overflow-hidden">
        <button type="button" onClick={() => setDescOpen(!descOpen)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-extrabold text-[var(--text-primary)] hover:bg-[var(--bg-card)] transition-colors"
        >
          <span>Mô tả đầu việc</span>
          <span className={`text-[var(--text-muted)] transition-transform ${descOpen ? 'rotate-180' : ''}`}>?</span>
        </button>
        <div className={descOpen ? 'block' : 'hidden'}>
          <div className="px-4 pb-4 pt-1">
            <textarea
              value={descriptionDraft}
              onChange={(e) => setDescriptionDraft(e.target.value)}
              placeholder="Mục tiêu, phạm vi, yêu cầu đầu ra, ghi chú..."
              className="min-h-[5rem] w-full resize-y rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-3 text-sm leading-6 outline-none focus:border-[var(--accent-hover)]"
            />
            <button type="button"
              disabled={descriptionDraft.trim() === (props.task.description || '').trim()}
              onClick={() => props.updateTaskDescription(props.task.id, descriptionDraft)}
              className="mt-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] px-4 py-1.5 text-xs font-bold text-[var(--text-primary)] disabled:opacity-40"
            >
              Lưu mô tả
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-[var(--bg-surface)] p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="font-extrabold">Các bước thực hiện & duyệt</p>
          <div className="flex items-center gap-2">
            <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-2.5 py-1 text-xs font-semibold text-[var(--text-secondary)] select-none">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 accent-[var(--olive)]"
                checked={!!props.task.sequential_steps}
                onChange={(e) => props.updateTaskSequential(props.task.id, e.target.checked)}
              />
              Theo thứ tự
            </label>
            <button type="button"
              onClick={() => props.openStepForm(props.task)}
              className="rounded-lg bg-[var(--bg-card)] px-3 py-1 text-xs font-bold"
            >
              + Bước
            </button>
          </div>
        </div>

        {props.stepOpenFor === props.task.id && (
          <InlineStepForm
            taskId={props.task.id}
            initialForm={props.stepForm}
            employees={props.employees}
            createStep={props.createStep}
            cancel={() => props.setStepOpenFor('')}
          />
        )}

        <div className="mt-3 space-y-3">
          {props.steps.length === 0 ? (
            <p className="text-sm text-[var(--text-secondary)]">Chưa có bước thực hiện.</p>
          ) : (
            props.steps.map((step, index) => {
              const previousStep = index > 0 ? props.steps[index - 1] : null
              const locked = !!(props.task.sequential_steps && previousStep && previousStep.approval_status !== 'approved')

              return (
                <StepWorkflowCard
                  key={step.id}
                  task={props.task}
                  step={step}
                  locked={locked}
                  employees={props.employees}
                  employeeMap={props.employeeMap}
                  supporters={props.supporters}
                  comments={props.commentsByStep.get(step.id) || []}
                  updateStep={props.updateStep}
                  submitStep={props.submitStep}
                  approveStep={props.approveStep}
                  requestRevision={props.requestRevision}
                  canApprove={props.canApproveStep(step)}
                  revisionDrafts={props.revisionDrafts}
                  setRevisionDrafts={props.setRevisionDrafts}
                  linkDrafts={props.linkDrafts}
                  setLinkDrafts={props.setLinkDrafts}
                  saveStepLink={props.saveStepLink}
                  supportDrafts={props.supportDrafts}
                  setSupportDrafts={props.setSupportDrafts}
                  saveSupportRequest={props.saveSupportRequest}
                  commentDrafts={props.commentDrafts}
                  setCommentDrafts={props.setCommentDrafts}
                  addComment={props.addComment}
                  uploadStepFile={props.uploadStepFile}
                  deleteStep={props.deleteStep}
                  clearStepFile={props.clearStepFile}
                  expanded={props.expandedSteps.has(step.id)}
                  onToggle={() => props.toggleStep(step.id)}
                />
              )
            })
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="font-semibold text-[var(--text-secondary)]">Hỗ trợ:</span>
        {props.supporters.length === 0 ? (
          <span className="text-[var(--text-muted)]">chua có</span>
        ) : (
          props.supporters.map((supporter) => (
            <span key={supporter.id} className="inline-flex items-center gap-1 rounded-full bg-[var(--bg-surface)] px-2 py-0.5">
              {supporter.employees?.full_name || 'Không rõ'}
              <button type="button" onClick={() => props.deleteSupporter(supporter)} className="text-[var(--danger)] hover:opacity-70">?</button>
            </span>
          ))
        )}
        <span className="ml-auto text-[var(--text-muted)]">{props.reports.length} file báo cáo</span>
      </div>
    </div>
  )
}

function InlineStepForm(props: {
  taskId: string
  initialForm: StepForm
  employees: Employee[]
  createStep: (taskId: string, form: StepForm) => void
  cancel: () => void
}) {
  const [form, setForm] = useState<StepForm>(props.initialForm)
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
      <h4 className="mb-3 font-extrabold">Tạo bước thực hiện</h4>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <Input
          placeholder="Tên bước"
          value={form.title}
          onChange={(value) => setForm({ ...form, title: value })}
        />
        <textarea
          rows={2}
          placeholder="Mô tả bước (yêu cầu đầu ra, tiêu chí hoàn thành...)"
          className="col-span-full resize-none rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 text-sm outline-none focus:border-[var(--border-strong)]"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
        <Select
          value={form.ownerId}
          onChange={(value) => setForm({ ...form, ownerId: value })}
        >
          <option value="">Ch?n ngu?i th?c hi?n chính</option>
          {props.employees.map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.full_name}
            </option>
          ))}
        </Select>
        <Select
          value={form.approverId}
          onChange={(value) => setForm({ ...form, approverId: value })}
        >
          <option value="">Chọn trưởng bộ phận duyệt</option>
          {props.employees.map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.full_name}
            </option>
          ))}
        </Select>
        <MultiPersonField
          label="Người hỗ trợ bước"
          ids={form.supporterIds}
          employees={props.employees}
          onSave={(ids) => setForm({ ...form, supporterIds: ids })}
          placeholder="Chọn người hỗ trợ"
        />
        <MultiPersonField
          label="Người duyệt bổ sung"
          ids={form.approverIds}
          employees={props.employees}
          onSave={(ids) => setForm({ ...form, approverIds: ids })}
          placeholder="Chọn người duyệt"
        />
        <input
          type="date"
          className="h-12 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] px-4 text-sm outline-none"
          value={form.dueDate}
          onChange={(event) => setForm({ ...form, dueDate: event.target.value })}
        />
      </div>

      <div className="mt-4 flex gap-2">
        <button type="button"
          onClick={() => props.createStep(props.taskId, form)}
          className="rounded-xl bg-[var(--bg-card)] px-4 py-2 text-sm font-extrabold text-[var(--text-primary)]"
        >
          Lưu bước
        </button>
        <button type="button"
          onClick={props.cancel}
          className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-bold"
        >
          Hủy
        </button>
      </div>
    </div>
  )
}

function getActiveMentionQuery(text: string) {
  const match = text.match(/(?:^|\s)@([^\s@]*)$/)
  return match ? match[1] : null
}

function insertMentionText(text: string, employee: Employee) {
  const label = `@${employee.full_name}`
  const next = text.replace(/(^|\s)@([^\s@]*)$/, (_match, prefix) => `${prefix}${label} `)
  return next === text ? `${text}${text.endsWith(' ') || text.length === 0 ? '' : ' '}${label} ` : next
}

function getMentionedEmployeeIds(text: string, employees: Employee[]) {
  const normalizedText = normalizeSearchText(text)

  return employees
    .filter((employee) => {
      const normalizedName = normalizeSearchText(employee.full_name)
      const nameParts = normalizedName.split(/\s+/).filter((part) => part.length >= 2)
      return (
        normalizedText.includes(`@${normalizedName}`) ||
        nameParts.some((part) => normalizedText.includes(`@${part}`))
      )
    })
    .map((employee) => employee.id)
}

function getRelatedCommentPeople(task: Task, step: TaskStep, supporters: TaskSupporter[], employeeMap: Map<string, Employee>) {
  const ids = new Set<string>()
  taskParticipantIds(task, supporters).forEach((id) => ids.add(id))
  supporters.forEach((supporter) => ids.add(supporter.employee_id))
  ;[
    step.owner_id,
    step.approver_id,
    step.department_approver_id,
    step.coo_approver_id,
    step.ceo_approver_id,
  ].forEach((id) => {
    if (id) ids.add(id)
  })
  stepParticipantIds(step).forEach((id) => ids.add(id))

  return Array.from(ids)
    .map((id) => employeeMap.get(id))
    .filter((employee): employee is Employee => Boolean(employee))
}

function StepWorkflowCard(props: {
  task: Task
  step: TaskStep
  locked: boolean
  employees: Employee[]
  employeeMap: Map<string, Employee>
  supporters: TaskSupporter[]
  comments: StepComment[]
  updateStep: (step: TaskStep, patch: Partial<TaskStep>) => void
  submitStep: (step: TaskStep) => void
  approveStep: (step: TaskStep) => void
  requestRevision: (step: TaskStep, explicitNote?: string) => void
  canApprove: boolean
  revisionDrafts: Record<string, string>
  setRevisionDrafts: (value: Record<string, string>) => void
  linkDrafts: Record<string, string>
  setLinkDrafts: (value: Record<string, string>) => void
  saveStepLink: (step: TaskStep, explicitLink?: string) => void
  supportDrafts: Record<string, string>
  setSupportDrafts: (value: Record<string, string>) => void
  saveSupportRequest: (step: TaskStep, explicitRequest?: string) => void
  commentDrafts: Record<string, string>
  setCommentDrafts: (value: Record<string, string>) => void
  addComment: AddStepComment
  uploadStepFile: (step: TaskStep, file?: File) => void
  deleteStep: (step: TaskStep) => void
  clearStepFile: (step: TaskStep) => void
  expanded?: boolean
  onToggle?: () => void
}) {
  // Local draft states — prevents root-level re-render on every keystroke (BUG-01)
  const [localRevisionDraft, setLocalRevisionDraft] = useState('')
  const [localCommentDraft, setLocalCommentDraft] = useState('')
  const [localSupportDraft, setLocalSupportDraft] = useState(props.step.support_request ?? '')
  const [localLinkDraft, setLocalLinkDraft] = useState(props.step.report_link ?? '')

  const owner = props.employeeMap.get(props.step.owner_id || '')
  const departmentApprover = props.employeeMap.get(props.step.department_approver_id || props.step.approver_id || '')
  const status = props.step.approval_status || 'not_submitted'
  const stage = props.step.approval_stage || 'department'
  const approveButtonLabel = getApproveButtonLabel(stage)
  const commentDraft = localCommentDraft
  const supportDraft = localSupportDraft
  const relatedPeople = useMemo(
    () => getRelatedCommentPeople(props.task, props.step, props.supporters, props.employeeMap),
    [props.task, props.step, props.supporters, props.employeeMap]
  )
  const relatedPeopleIds = new Set(relatedPeople.map((employee) => employee.id))
  const mentionSource = [
    ...relatedPeople,
    ...props.employees.filter((employee) => !relatedPeopleIds.has(employee.id)),
  ]
  const commentMentionQuery = getActiveMentionQuery(commentDraft)
  const supportMentionQuery = getActiveMentionQuery(supportDraft)
  const commentMentionOptions = commentMentionQuery === null
    ? []
    : mentionSource
        .filter((employee) => normalizeSearchText(employee.full_name).includes(normalizeSearchText(commentMentionQuery)))
        .slice(0, 8)
  const supportMentionOptions = supportMentionQuery === null
    ? []
    : mentionSource
        .filter((employee) => normalizeSearchText(employee.full_name).includes(normalizeSearchText(supportMentionQuery)))
        .slice(0, 8)

  function setCommentDraft(value: string) { setLocalCommentDraft(value) }
  function setSupportDraft(value: string) { setLocalSupportDraft(value) }

  function sendComment() {
    props.addComment(props.step.id, localCommentDraft, 'comment', getMentionedEmployeeIds(localCommentDraft, props.employees))
    setLocalCommentDraft('')
  }

  // expanded state được quản lý từ CooBoard (qua props) để tránh reset khi data refresh
  const expanded = props.expanded ?? false
  const [noteDraft, setNoteDraft] = useState(props.step.note || '')

  return (
    <div className={`rounded-2xl border bg-[var(--bg-card)] ${props.locked ? 'opacity-60' : ''} ${status === 'revision' ? 'border-[var(--danger)]/40' : status === 'approved' ? 'border-[var(--success)]/30' : 'border-[var(--border)]'}`}>
      {/* ── Header (luôn hiện) ── */}
      <button type="button" onClick={() => props.onToggle?.()}
        className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-[var(--bg-surface)] rounded-2xl transition-colors"
      >
        <span className="shrink-0 text-xs font-extrabold text-[var(--text-muted)] w-5">{props.step.step_order}.</span>
        <span className="flex-1 min-w-0 font-semibold text-sm text-[var(--text-primary)] truncate">{props.step.step_title}</span>
        {/* Thanh thông tin giai đoạn */}
        <div className="shrink-0 flex items-stretch rounded-lg border border-[var(--border)] overflow-hidden text-[11px] font-bold">
          {/* Deadline */}
          <div className={`flex items-center gap-1 px-2.5 py-1 ${props.step.due_date ? 'bg-[var(--success-soft)] text-[var(--success)]' : 'bg-[var(--bg-surface)] text-[var(--text-muted)]'}`}>
            <span>Deadline</span>
            <span>{props.step.due_date ? `✓ ${props.step.due_date}` : 'Chưa có'}</span>
          </div>
          <div className="w-px bg-[var(--border)]" />
          {/* Kết quả */}
          {(() => {
            const s = props.step
            let label: string
            let cls: string
            if (s.approval_status === 'approved') {
              label = 'Hoàn thành'; cls = 'bg-[var(--success-soft)] text-[var(--success)]'
            } else if (s.approval_status === 'pending') {
              label = 'Chờ duyệt kết quả'; cls = 'bg-[var(--warning-soft)] text-[var(--warning)]'
            } else if (s.approval_status === 'revision') {
              label = 'Kết quả bị trả lại'; cls = 'bg-[var(--danger-soft)] text-[var(--danger)]'
            } else if (s.step_in_progress) {
              label = 'Đang thực hiện'; cls = 'bg-[var(--warning-soft)] text-[var(--warning)]'
            } else {
              label = 'Chưa bắt đầu'; cls = 'bg-[var(--bg-surface)] text-[var(--text-muted)]'
            }
            return (
              <div className={`flex items-center gap-1 px-2.5 py-1 ${cls}`}>
                <span>Kết quả</span>
                <span>{label}</span>
              </div>
            )
          })()}
        </div>
        {props.locked && <span className="shrink-0 text-[10px] font-bold text-slate-500 bg-slate-100 rounded-full px-2 py-0.5">Khóa</span>}
        <span className="shrink-0 text-xs text-[var(--text-muted)]">{owner?.full_name || '—'}</span>
        {props.step.due_date && <span className="shrink-0 text-[10px] text-[var(--text-muted)] hidden sm:block">{props.step.due_date}</span>}
        <span className={`shrink-0 text-[var(--text-muted)] transition-transform ${expanded ? 'rotate-180' : ''}`}>v</span>
      </button>

      {/* -- Body collapse -- */}
      <div className={`border-t border-[var(--border)] ${expanded ? 'block' : 'hidden'}`}><div className="px-4 pb-4">
      <div className="pt-3 mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-[var(--text-secondary)]">
          Phụ trách: <b>{owner?.full_name || 'Chưa gắn'}</b> · Duyệt: <b>{departmentApprover?.full_name || 'Chưa gắn'}</b> · Deadline: <b>{props.step.due_date || 'Chưa có'}</b>
        </p>
        <button type="button"
          onClick={() => props.deleteStep(props.step)}
          className="rounded-lg bg-[var(--danger-soft)] px-3 py-1 text-xs font-bold text-[var(--danger)]"
        >
          Xóa bước
        </button>
      </div>

      {/* -- Deadline (đã chốt ngay khi giao) -- */}
      <div className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-extrabold uppercase tracking-wide text-[var(--text-muted)]">Deadline</span>
            {props.step.due_date
              ? <span className="rounded-full bg-[var(--success)] px-2 py-0.5 text-[10px] font-bold text-white">Đã chốt · {props.step.due_date}</span>
              : <span className="rounded-full bg-[var(--bg-surface)] border border-[var(--border)] px-2 py-0.5 text-[10px] font-bold text-[var(--text-muted)]">Chưa có deadline</span>
            }
          </div>
          {props.canApprove && (
            <div className="flex items-center gap-1.5">
              <input type="date"
                className="h-8 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-2 text-xs outline-none"
                defaultValue={props.step.due_date || ''}
                onBlur={(e) => {
                  if (e.target.value && e.target.value !== props.step.due_date)
                    props.updateStep(props.step, { due_date: e.target.value } as Partial<TaskStep>)
                }}
              />
              <span className="text-[10px] text-[var(--text-muted)]">Sửa deadline</span>
            </div>
          )}
        </div>
      </div>

      {/* -- Timeline lịch sử -- */}
      {(() => {
        const s = props.step
        const fmt = (iso: string | null) => iso ? new Date(iso).toLocaleString('vi-VN', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : null
        const events: { icon: string; label: string; time: string | null; done: boolean }[] = [
          { icon: 'START', label: 'Bắt đầu thực hiện', time: fmt(s.step_started_at), done: !!s.step_started_at },
          { icon: 'SEND', label: 'Gửi duyệt kết quả', time: fmt(s.submitted_at), done: !!s.submitted_at },
          { icon: 'OK', label: 'Hoàn thành', time: fmt(s.approved_at), done: s.approval_status === 'approved' },
        ]
        return (
          <div className="mb-4 flex items-center gap-0">
            {events.map((ev, i) => (
              <div key={i} className="flex flex-1 items-center">
                <div className={`flex flex-col items-center gap-0.5 min-w-0 flex-1 ${ev.done ? 'opacity-100' : 'opacity-35'}`}>
                  <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs ${ev.done ? 'bg-[var(--olive)] text-white' : 'bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--text-muted)]'}`}>{ev.icon}</div>
                  <p className="text-center text-[9px] font-bold leading-tight text-[var(--text-secondary)] px-0.5">{ev.label}</p>
                  {ev.time && <p className="text-[9px] text-[var(--text-muted)]">{ev.time}</p>}
                </div>
                {i < events.length - 1 && <div className={`h-px w-4 shrink-0 ${events[i+1].done || ev.done ? 'bg-[var(--olive)]/40' : 'bg-[var(--border)]'}`} />}
              </div>
            ))}
          </div>
        )
      })()}

      {/* ── Thực hiện & Duyệt kết quả ── */}
      <div>

      {/* Nút Bắt đầu thực hiện */}
      {!props.step.step_in_progress && props.step.approval_status === 'not_submitted' && (
        <button type="button"
          onClick={() => props.updateStep(props.step, { step_in_progress: true } as Partial<TaskStep>)}
          className="mb-3 w-full rounded-xl border-2 border-dashed border-[var(--olive)]/40 py-2 text-sm font-bold text-[var(--olive)] hover:bg-[var(--olive)]/5 transition-colors"
        >
          ▶ Bắt đầu thực hiện
        </button>
      )}
      {props.step.step_in_progress && props.step.approval_status === 'not_submitted' && (
        <div className="mb-3 flex items-center justify-between rounded-xl bg-[var(--warning-soft)] px-3 py-2">
          <span className="text-xs font-bold text-[var(--warning)]">🔄 Đang thực hiện</span>
          <button type="button"
            onClick={() => props.updateStep(props.step, { step_in_progress: false } as Partial<TaskStep>)}
            className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >Hoàn tác</button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <Select
          value={props.step.owner_id || ''}
          onChange={(value) => props.updateStep(props.step, { owner_id: value || null } as Partial<TaskStep>)}
        >
          <option value="">Chọn người phụ trách</option>
          {props.employees.map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.full_name}
            </option>
          ))}
        </Select>

        <input
          type="date"
          className="h-12 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] px-4 text-sm outline-none"
          value={props.step.due_date || ''}
          onChange={(event) => props.updateStep(props.step, { due_date: event.target.value || null } as Partial<TaskStep>)}
        />
      </div>

      <div className="mt-3 rounded-xl bg-[var(--bg-surface)] p-3">
        <Select
          value={props.step.department_approver_id || props.step.approver_id || ''}
          onChange={(value) =>
            props.updateStep(props.step, {
              department_approver_id: value || null,
              approver_id: value || null,
            } as Partial<TaskStep>)
          }
        >
          <option value="">Chọn người duyệt</option>
          {props.employees.map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employeeSelectLabel(employee)}
            </option>
          ))}
        </Select>
        {departmentApprover && (
          <p className="mt-1.5 text-xs text-[var(--text-muted)]">Người duyệt: <b className="text-[var(--text-primary)]">{departmentApprover.full_name}</b></p>
        )}
      </div>

      {props.step.support_request && (
        <div className="mt-3 rounded-xl bg-[var(--warning-soft)] p-3 text-sm text-[var(--warning)]">
          <b>Yêu cầu hỗ trợ:</b> {props.step.support_request}
        </div>
      )}

      {props.step.approval_status === 'revision' && props.step.approval_note && (
        <div className="mt-3 rounded-xl border border-[var(--danger)]/30 bg-[var(--danger-soft)] p-3">
          <p className="mb-1 text-xs font-extrabold uppercase tracking-wide text-[var(--danger)]">⚠ Cần làm lại</p>
          <p className="text-sm text-[var(--danger)]">{props.step.approval_note}</p>
        </div>
      )}
      {props.step.approval_status !== 'revision' && props.step.approval_note && (
        <div className="mt-3 rounded-xl bg-[var(--bg-surface)] p-3 text-sm text-[var(--text-secondary)]">
          <b>Ghi chú duyệt:</b> {props.step.approval_note}
        </div>
      )}

      <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
        <div className="rounded-xl bg-[var(--bg-surface)] p-3">
          <p className="mb-2 text-sm font-extrabold">File / link báo cáo</p>

          <input
            type="file"
            disabled={props.locked}
            onChange={(event) => props.uploadStepFile(props.step, event.target.files?.[0])}
            className="block w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-2 text-xs"
          />

          {props.step.report_file_url && (
            <div className="mt-2 flex flex-wrap gap-2">
              <a
                href={props.step.report_file_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex rounded-lg bg-[var(--bg-card)] px-3 py-2 text-xs font-bold text-[var(--text-primary)]"
              >
                Mở file
              </a>
              <button type="button"
                onClick={() => props.clearStepFile(props.step)}
                className="rounded-lg bg-[var(--danger-soft)] px-3 py-2 text-xs font-bold text-[var(--danger)]"
              >
                Xóa file
              </button>
            </div>
          )}

          <div className="mt-3 flex gap-2">
            <input
              className="h-9 flex-1 rounded-lg border border-[var(--border)] px-3 text-xs outline-none"
              placeholder="Dán link báo cáo... (tự lưu khi rời ô)"
              value={localLinkDraft}
              onChange={(event) => setLocalLinkDraft(event.target.value)}
              onBlur={() => {
                if (localLinkDraft !== (props.step.report_link ?? '')) {
                  props.saveStepLink(props.step, localLinkDraft)
                }
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') (event.target as HTMLInputElement).blur()
              }}
            />
            <button type="button"
              onClick={() => props.saveStepLink(props.step, localLinkDraft)}
              className="rounded-lg bg-[var(--bg-card)] px-3 text-xs font-bold text-[var(--text-primary)]"
            >
              Luu
            </button>
          </div>

          {props.step.report_link && (
            <a
              href={props.step.report_link}
              target="_blank"
              rel="noreferrer"
              className="mt-2 block text-xs font-bold text-[var(--accent-hover)]"
            >
              Mở link báo cáo
            </a>
          )}
        </div>

        <div className="rounded-xl bg-[var(--bg-surface)] p-3">
          <p className="mb-1 text-sm font-extrabold">Bình luận / tag người liên quan</p>
          {relatedPeople.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1 text-[10px] text-[var(--text-muted)]">
              <span className="font-bold">Liên quan:</span>
              {relatedPeople.slice(0, 4).map((employee) => (
                <span key={employee.id} className="rounded-full bg-[var(--bg-card)] px-2 py-0.5">
                  {employee.full_name}
                </span>
              ))}
              {relatedPeople.length > 4 && <span>+{relatedPeople.length - 4}</span>}
            </div>
          )}

          <div className="relative mb-3 flex gap-2">
            <div className="relative flex-1">
              <input
                className="h-9 w-full rounded-lg border border-[var(--border)] px-3 text-xs outline-none"
                placeholder="VD: @Quang em cần công cụ hỗ trợ... (Enter để lưu)"
                value={supportDraft}
                onChange={(event) => setSupportDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') return
                  event.preventDefault()
                  props.saveSupportRequest(props.step, localSupportDraft)
                }}
              />
              {supportMentionOptions.length > 0 && (
                <div className="absolute bottom-10 left-0 z-20 w-full max-w-[320px] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-lg">
                  <p className="px-3 py-2 text-[10px] font-extrabold uppercase text-[var(--text-muted)]">
                    Tag người hỗ trợ
                  </p>
                  {supportMentionOptions.map((employee) => (
                    <button
                      key={employee.id}
                      type="button"
                      onClick={() => setSupportDraft(insertMentionText(supportDraft, employee))}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-surface)]"
                    >
                      <Avatar name={employee.full_name} size="sm" />
                      <span className="min-w-0 truncate">{employee.full_name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button type="button"
              onClick={() => props.saveSupportRequest(props.step)}
              className="rounded-lg bg-[var(--bg-card)] px-3 text-xs font-bold text-[var(--text-primary)]"
            >
              Luu
            </button>
          </div>

          <div className="mb-3 max-h-28 space-y-2 overflow-y-auto">
            {props.comments.length === 0 ? (
              <p className="text-xs text-[var(--text-secondary)]">Chưa có bình luận.</p>
            ) : (
              props.comments.map((comment) => (
                <div key={comment.id} className="rounded-lg bg-[var(--bg-card)] p-2 text-xs">
                  <p className="font-bold">{comment.employees?.full_name || 'Không rõ'}</p>
                  <p className="text-[var(--text-secondary)]">{comment.comment}</p>
                </div>
              ))
            )}
          </div>

          <div className="relative flex gap-2">
            <div className="relative flex-1">
              <input
                className="h-9 w-full rounded-lg border border-[var(--border)] px-3 text-xs outline-none"
                placeholder="Nhập bình luận, dùng @ để tag người... (Enter để gửi)"
                value={commentDraft}
                onChange={(event) => setCommentDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') return
                  event.preventDefault()
                  sendComment()
                }}
              />
              {commentMentionOptions.length > 0 && (
                <div className="absolute bottom-10 left-0 z-20 w-full max-w-[320px] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-lg">
                  <p className="px-3 py-2 text-[10px] font-extrabold uppercase text-[var(--text-muted)]">
                    Tag người
                  </p>
                  {commentMentionOptions.map((employee) => (
                    <button
                      key={employee.id}
                      type="button"
                      onClick={() => setCommentDraft(insertMentionText(commentDraft, employee))}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-surface)]"
                    >
                      <Avatar name={employee.full_name} size="sm" />
                      <span className="min-w-0 truncate">{employee.full_name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button type="button"
              onClick={sendComment}
              className="rounded-lg bg-[var(--bg-card)] px-3 text-xs font-bold text-[var(--text-primary)]"
            >
              Gửi
            </button>
          </div>
        </div>
      </div>

      {props.canApprove && (
      <div className="mt-4 rounded-[var(--radius)] bg-[var(--danger-soft)] p-3">
        <p className="mb-2 text-sm font-semibold text-[var(--danger)]">Yêu cầu làm lại nếu chưa đạt (bắt buộc ghi lý do)</p>
        <div className="flex gap-2">
          <input
            className="h-9 flex-1 rounded-lg border border-[var(--danger)]/20 px-3 text-xs outline-none"
            placeholder="VD: phần này số liệu sai, cần làm lại..."
            value={localRevisionDraft}
            onChange={(event) => setLocalRevisionDraft(event.target.value)}
          />
          <button type="button"
            disabled={props.locked}
            onClick={() => props.requestRevision(props.step, localRevisionDraft)}
            className="rounded-[var(--radius-sm)] bg-[var(--danger)] px-3 text-xs font-bold text-[var(--paper)] disabled:opacity-40"
          >
            Gửi
          </button>
        </div>
      </div>
      )}

      {props.step.description && (
        <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--bg-base)] px-3 py-2">
          <p className="mb-0.5 text-[10px] font-extrabold uppercase tracking-wide text-[var(--text-muted)]">Yêu cầu / Mô tả bước</p>
          <p className="text-xs text-[var(--text-secondary)] leading-5">{props.step.description}</p>
        </div>
      )}

      <div className="mt-3 rounded-xl bg-[var(--bg-surface)] p-3">
        <p className="mb-1 text-xs font-extrabold text-[var(--text-secondary)]">Ghi kết quả thực hiện <span className="font-normal text-[var(--text-muted)]">(bắt buộc nếu không có file/link)</span></p>
        <textarea
          disabled={props.locked || status === 'approved'}
          rows={2}
          className="w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-xs outline-none focus:border-[var(--border-strong)] disabled:opacity-50"
          placeholder="Mô tả ngắn kết quả đã làm được..."
          value={noteDraft}
          onChange={(e) => setNoteDraft(e.target.value)}
          onBlur={() => { if (noteDraft !== (props.step.note || '')) props.updateStep(props.step, { note: noteDraft } as Partial<TaskStep>) }}
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button"
          disabled={props.locked || status === 'approved'}
          onClick={() => props.submitStep(props.step)}
          className="rounded-[var(--radius)] bg-[var(--olive)] px-4 py-2 text-xs font-extrabold text-[var(--ivory)] disabled:opacity-40"
        >
          Gửi duyệt
        </button>

        {props.canApprove && (
        <button type="button"
          disabled={props.locked || status !== 'pending'}
          onClick={() => props.approveStep(props.step)}
          className="rounded-xl bg-[var(--olive)] px-4 py-2 text-xs font-extrabold text-[var(--ivory)] disabled:opacity-40"
        >
          {approveButtonLabel}
        </button>
        )}
      </div>
      </div>{/* end phase 2 wrapper */}
    </div>
  </div>
  </div>
  )
}

function ProjectsView(props: {
  projectCards: ProjectCard[]
  tasks: Task[]
  steps: TaskStep[]
  employeeMap: Map<string, Employee>
  setView: (view: ViewKey) => void
  setSelectedProjectId: (id: string) => void
  setSelectedTask: (task: Task) => void
  deleteProject: (project: Project) => void
  canDeleteProject: boolean
  canEditProject?: boolean
  onEditProject?: (project: Project) => void
  currentEmployee: Employee | null
  projectSpecs: ProjectSpec[]
  executionTrackers: ExecutionTracker[]
}) {
  const [focusProject, setFocusProject] = useState<string | null>(null)
  const [boardProject, setBoardProject] = useState<string | null>(null)
  const boardProjectCard = boardProject ? props.projectCards.find((p) => p.id === boardProject) : null
  type BoardTab = 'overview' | 'wbs' | 'coo' | 'tasks' | 'timeline' | 'kpi' | 'decision' | 'spec' | 'files'
  const [boardTab, setBoardTab] = useState<BoardTab>('overview')
  const [wbsExpanded, setWbsExpanded] = useState<Set<string>>(new Set())

  // ── Tổng hợp tự động từ data thật ──
  const totalTasks = props.projectCards.reduce((s, p) => s + p.total, 0)
  const totalDone = props.projectCards.reduce((s, p) => s + p.done, 0)
  const overallRate = totalTasks === 0 ? 0 : Math.round((totalDone / totalTasks) * 100)

  // 3 ô tự gom (kiểu Cockpit 00·1)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  // Tuần lịch thực: Thứ 2 → Chủ nhật (ISO week)
  const dow = today.getDay() // 0=CN,1=T2..6=T7
  const toMon = dow === 0 ? -6 : 1 - dow
  const weekStart = new Date(today); weekStart.setDate(today.getDate() + toMon)
  const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6); weekEnd.setHours(23, 59, 59, 999)

  const dueThisWeek = props.tasks.filter((t) => {
    if (t.status === 'completed' || !t.due_date) return false
    const d = new Date(t.due_date); d.setHours(0, 0, 0, 0)
    return d >= weekStart && d <= weekEnd
  })
  const stuck = props.tasks.filter((t) => isTaskOverdue(t) || isTaskProblem(t) || isDeadlineActionNeeded(t))
  const pendingSteps = props.steps.filter((s) => !s.is_done && s.approval_status === 'pending')

  const focusedProject = focusProject ? props.projectCards.find((p) => p.id === focusProject) : null

  // Tải người — đếm việc đang mở theo người phụ trách
  const workload = (() => {
    const counts = new Map<string, number>()
    for (const t of props.tasks) {
      if (t.status === 'completed') continue
      const who = t.assignee_id || t.head_id
      if (!who) continue
      counts.set(who, (counts.get(who) || 0) + 1)
    }
    return Array.from(counts.entries())
      .map(([id, n]) => ({ id, name: props.employeeMap.get(id)?.full_name || '—', n }))
      .sort((a, b) => b.n - a.n)
  })()
  const maxLoad = Math.max(1, ...workload.map((w) => w.n))

  function openTaskOfStep(step: TaskStep) {
    const task = props.tasks.find((t) => t.id === step.task_id)
    if (task) props.setSelectedTask(task)
  }

  if (props.projectCards.length === 0) {
    return <Card><EmptyState title="Chưa có dự án" description="Bấm + Tạo mới để thêm dự án đầu tiên." /></Card>
  }

  // Section header kiểu VYVY-OS: số thứ tự + tiêu đề + mô tả nhỏ
  function Sec({ n, title, desc }: { n: string; title: string; desc?: string }) {
    return (
      <div className="vyvy-section-header pt-2">
        <span className="vyvy-section-number">{n}</span>
        <div className="min-w-0">
          <h2 className="font-display text-lg text-[var(--text-primary)]">{title}</h2>
          {desc && <p className="text-xs text-[var(--text-muted)]">{desc}</p>}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">

      {/* ══ Hero — đích cuối ══ */}
      <div className="vyvy-card overflow-hidden text-[var(--text-primary)]">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <div className="shrink-0 sm:w-44">
            <p className="font-spec text-[10px] text-[var(--text-muted)]">Đích cuối</p>
            <p className="font-display text-4xl leading-none text-[var(--olive)]">100<span className="text-base">%</span></p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">hoàn thành toàn bộ dự án</p>
          </div>
          <div className="min-w-0 flex-1">
            <div className="mb-1.5 flex items-baseline justify-between">
              <p className="text-sm font-bold">Hiện tại: <span className="tabular-nums text-[var(--text-primary)]">{overallRate}%</span> · {totalDone}/{totalTasks} đầu việc</p>
              <p className="text-xs text-[var(--text-muted)]">{props.projectCards.length} dự án</p>
            </div>
            <div className="relative h-5 overflow-hidden rounded-full bg-[var(--border)]">
              <div className="h-5 rounded-full bg-[var(--olive)] transition-all" style={{ width: `${Math.max(overallRate, 1)}%` }} />
            </div>
            <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">Thanh này tự cộng từ tiến độ thật của mọi dự án — không nhập tay.</p>
          </div>
        </div>
      </div>

      {/* ══ 00·1 Tuần này — liếc 5 giây ══ */}
      <Sec n="00·1" title="Tuần này — liếc 5 giây" desc="ba ô tự gom từ dữ liệu thật — không nhập tay" />
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {/* Phải xong tuần này */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)]">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2.5">
            <p className="text-xs font-extrabold uppercase tracking-wide text-[var(--text-secondary)]">Phải xong tuần này</p>
            <span className="rounded-full bg-[var(--bg-surface)] px-2 py-0.5 text-xs font-extrabold tabular-nums text-[var(--text-secondary)]">{dueThisWeek.length}</span>
          </div>
          <div className="max-h-56 divide-y divide-[var(--border)] overflow-y-auto">
            {dueThisWeek.length === 0 ? (
              <p className="px-4 py-4 text-xs text-[var(--text-muted)]">Không có việc đến hạn trong tuần.</p>
            ) : dueThisWeek.slice(0, 8).map((t) => (
              <button key={t.id} type="button" onClick={() => props.setSelectedTask(t)}
                className="flex w-full items-center justify-between gap-2 px-4 py-2 text-left hover:bg-[var(--bg-surface)]">
                <span className="truncate text-sm font-bold text-[var(--text-primary)]">{t.title}</span>
                <span className="shrink-0 text-[10px] font-bold tabular-nums text-[var(--text-muted)]">{t.due_date?.slice(5)}</span>
              </button>
            ))}
          </div>
        </div>
        {/* Đang kẹt / quá hạn */}
        <div className={`rounded-2xl border bg-[var(--bg-card)] ${stuck.length > 0 ? 'border-[var(--danger)]/30' : 'border-[var(--border)]'}`}>
          <div className={`flex items-center justify-between border-b px-4 py-2.5 ${stuck.length > 0 ? 'border-[var(--danger)]/20' : 'border-[var(--border)]'}`}>
            <p className="text-xs font-extrabold uppercase tracking-wide text-[var(--text-secondary)]">Đang kẹt / quá hạn</p>
            <span className={`rounded-full px-2 py-0.5 text-xs font-extrabold tabular-nums ${stuck.length > 0 ? 'bg-[var(--danger-soft)] text-[var(--danger)]' : 'bg-[var(--bg-surface)] text-[var(--text-muted)]'}`}>{stuck.length}</span>
          </div>
          <div className="max-h-56 divide-y divide-[var(--border)] overflow-y-auto">
            {stuck.length === 0 ? (
              <p className="px-4 py-4 text-xs text-[var(--text-muted)]">Không có gì kẹt. Tốt.</p>
            ) : stuck.slice(0, 8).map((t) => (
              <button key={t.id} type="button" onClick={() => props.setSelectedTask(t)}
                className="flex w-full items-center gap-2 px-4 py-2 text-left hover:bg-[var(--danger-soft)]">
                <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-extrabold ${isTaskOverdue(t) ? 'bg-[var(--danger-soft)] text-[var(--danger)]' : 'bg-[var(--warning-soft)] text-[var(--warning)]'}`}>
                  {isTaskOverdue(t) ? 'TRỄ' : 'KẸT'}
                </span>
                <span className="truncate text-sm font-bold text-[var(--text-primary)]">{t.title}</span>
              </button>
            ))}
          </div>
        </div>
        {/* Chờ duyệt */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)]">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2.5">
            <p className="text-xs font-extrabold uppercase tracking-wide text-[var(--text-secondary)]">Chờ duyệt</p>
            <span className="rounded-full bg-[var(--warning-soft)] px-2 py-0.5 text-xs font-extrabold tabular-nums text-[var(--warning)]">{pendingSteps.length}</span>
          </div>
          <div className="max-h-56 divide-y divide-[var(--border)] overflow-y-auto">
            {pendingSteps.length === 0 ? (
              <p className="px-4 py-4 text-xs text-[var(--text-muted)]">Không có bước nào chờ duyệt.</p>
            ) : pendingSteps.slice(0, 8).map((s) => (
              <button key={s.id} type="button" onClick={() => openTaskOfStep(s)}
                className="flex w-full items-center justify-between gap-2 px-4 py-2 text-left hover:bg-[var(--bg-surface)]">
                <span className="truncate text-sm font-bold text-[var(--text-primary)]">{s.step_title}</span>
                <span className="shrink-0 text-[10px] font-bold text-[var(--warning)]">duyệt →</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ══ 00·2 Nối dự án ══ */}
      <Sec n="00·2" title="Nối dự án — sức khỏe từng dự án" desc="bấm dự án → sổ ra chi tiết, vì sao đang màu này" />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
        <div className="vyvy-card overflow-hidden">
          <div className="divide-y divide-[var(--border)]">
            {props.projectCards.map((project) => {
              const isFocus = focusProject === project.id
              const healthColor =
                project.health.level === 'normal' ? 'bg-[var(--ok)]' :
                project.health.level === 'watch' ? 'bg-[var(--warn)]' :
                project.health.level === 'problem' ? 'bg-[var(--crit)]' : 'bg-[var(--border)]'
              const dotColor =
                project.health.level === 'normal' ? 'bg-[var(--ok)]' :
                project.health.level === 'watch' ? 'bg-[var(--warn)]' :
                project.health.level === 'problem' ? 'bg-[var(--crit)]' : 'bg-[var(--border)]'

              return (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => setFocusProject(isFocus ? null : project.id)}
                  className={`flex w-full items-center gap-4 px-5 py-3.5 text-left transition-colors ${isFocus ? 'bg-[var(--bg-surface)]' : 'hover:bg-[var(--bg-surface)]'}`}
                >
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dotColor}`} />
                  <div className="w-36 shrink-0">
                    <p className="truncate text-sm font-extrabold text-[var(--text-primary)]">{project.name}</p>
                    {project.code && <p className="text-[10px] text-[var(--text-muted)]">{project.code}</p>}
                  </div>
                  <div className="flex flex-1 items-center gap-2">
                    <div className="relative h-5 flex-1 overflow-hidden rounded-full bg-[var(--bg-surface)]">
                      <div className={`h-5 rounded-full transition-all ${healthColor}`} style={{ width: `${Math.max(isNaN(project.rate) ? 0 : project.rate, 1)}%` }} />
                      {(isNaN(project.rate) ? 0 : project.rate) > 10 && (
                        <span className="absolute inset-y-0 left-2 flex items-center text-[10px] font-extrabold text-[var(--text-primary)]">{isNaN(project.rate) ? 0 : project.rate}%</span>
                      )}
                    </div>
                    {(isNaN(project.rate) ? 0 : project.rate) <= 10 && <span className="shrink-0 text-xs font-extrabold tabular-nums text-[var(--text-primary)]">{isNaN(project.rate) ? 0 : project.rate}%</span>}
                  </div>
                  <div className="flex shrink-0 items-center gap-3 text-xs tabular-nums">
                    <span className="font-bold text-[var(--success)]">{project.done}<span className="font-normal text-[var(--text-muted)]">/{project.total}</span></span>
                    {project.overdue > 0 && <span className="font-bold text-[var(--danger)]">? {project.overdue}</span>}
                    {project.problem > 0 && <span className="font-bold text-[var(--warning)]">! {project.problem}</span>}
                  </div>
                  <Ico d={IC.chevronRight} size={13} className={`shrink-0 text-[var(--text-muted)] transition-transform ${isFocus ? 'rotate-90' : ''}`} />
                </button>
              )
            })}
          </div>
        </div>

        {/* Panel phải */}
        <div className="flex flex-col gap-4">
          {focusedProject ? (
            <div className="vyvy-card">
              <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-surface)] px-4 py-3">
                <p className="truncate text-xs font-extrabold uppercase tracking-wide text-[var(--text-secondary)]">{focusedProject.name}</p>
                <button type="button"
                  onClick={() => { props.setSelectedProjectId(focusedProject.id); props.setView('coo') }}
                  className="shrink-0 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-1 text-xs font-semibold text-[var(--olive)] hover:border-[var(--olive)]">
                  Mở COO Board
                </button>
              </div>
              <div className="space-y-3 p-4">
                <ProjectHealthSummary health={focusedProject.health} />
                <div className="grid grid-cols-3 gap-2 text-center">
                  {[
                    { label: 'Tổng', v: focusedProject.total, c: 'text-[var(--text-primary)]' },
                    { label: 'Xong', v: focusedProject.done, c: 'text-[var(--success)]' },
                    { label: 'Trễ', v: focusedProject.overdue, c: focusedProject.overdue > 0 ? 'text-[var(--danger)]' : 'text-[var(--text-muted)]' },
                  ].map((n) => (
                    <div key={n.label} className="rounded-xl bg-[var(--bg-surface)] py-2">
                      <p className={`text-xl font-extrabold tabular-nums ${n.c}`}>{n.v}</p>
                      <p className="text-[10px] font-bold text-[var(--text-muted)]">{n.label}</p>
                    </div>
                  ))}
                </div>
                {(() => {
                  const urg = props.tasks.filter((t) => t.project_id === focusedProject.id && (isTaskOverdue(t) || isTaskProblem(t) || isDeadlineActionNeeded(t))).slice(0, 5)
                  return urg.length > 0 ? (
                    <div>
                      <p className="mb-1.5 text-[10px] font-extrabold uppercase tracking-wide text-[var(--text-secondary)]">Cần chú ý</p>
                      <div className="space-y-1">
                        {urg.map((t) => (
                          <button key={t.id} type="button" onClick={() => props.setSelectedTask(t)}
                            className="flex w-full items-center gap-2 rounded-lg border border-[var(--danger)]/20 bg-[var(--danger-soft)] px-3 py-2 text-left text-xs font-bold text-[var(--danger)]">
                            <Ico d={IC.alertCircle} size={12}/>
                            <span className="truncate">{t.title}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : <p className="text-xs text-[var(--text-muted)]">Không có cảnh báo.</p>
                })()}
                {props.canEditProject && props.onEditProject && (
                  <button type="button" onClick={() => props.onEditProject!(focusedProject)}
                    className="mt-1 w-full rounded-xl border border-[var(--border)] py-1.5 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-surface)]">
                    Sửa dự án
                  </button>
                )}
                {props.canDeleteProject && (
                  <button type="button" onClick={() => props.deleteProject(focusedProject)}
                    className="mt-1 w-full rounded-xl border border-[var(--danger)]/20 py-1.5 text-xs font-semibold text-[var(--danger)] hover:bg-[var(--danger-soft)]">
                    Xóa dự án
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--bg-surface)] px-4 py-6 text-center">
              <p className="text-sm font-bold text-[var(--text-muted)]">Bấm vào một dự án bên trái<br/>để sổ ra chi tiết tại đây</p>
            </div>
          )}

          {/* Legend */}
          <div className="vyvy-card px-4 py-3">
            <p className="mb-2 text-[10px] font-extrabold uppercase tracking-wide text-[var(--text-secondary)]">Màu sức khỏe</p>
            <div className="space-y-1.5">
              {[
                { color: 'bg-[var(--ok)]', label: 'Đang ổn — đúng tiến độ' },
                { color: 'bg-[var(--warn)]', label: 'Cần chú ý — có rủi ro' },
                { color: 'bg-[var(--crit)]', label: 'Nghiêm trọng — cần can thiệp' },
              ].map((l) => (
                <div key={l.label} className="flex items-center gap-2">
                  <div className={`h-3 w-12 rounded-full ${l.color}`} />
                  <p className="text-xs text-[var(--text-secondary)]">{l.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ══ 00·3 Tải người ══ */}
      <Sec n="00·3" title="Tải người — ai đang gánh bao nhiêu" desc="tự đếm từ đầu việc đang mở · >5 việc = đỏ" />
      <div className="vyvy-card p-5">
        {workload.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">Chưa có việc nào được giao.</p>
        ) : (
          <div className="space-y-2.5">
            {workload.map((w) => (
              <div key={w.id} className="flex items-center gap-3">
                <p className="w-36 shrink-0 truncate text-sm font-bold text-[var(--text-primary)]">{w.name}</p>
                <div className="h-4 flex-1 overflow-hidden rounded-full bg-[var(--bg-surface)]">
                  <div
                    className={`h-4 rounded-full transition-all ${w.n > 5 ? 'bg-[var(--crit)]' : 'bg-[var(--umber)]'}`}
                    style={{ width: `${(w.n / maxLoad) * 100}%` }}
                  />
                </div>
                <p className={`w-14 shrink-0 text-right text-sm font-extrabold tabular-nums ${w.n > 5 ? 'text-[var(--danger)]' : 'text-[var(--text-primary)]'}`}>{w.n} việc</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ══ 00·4 Ô dự án — bấm để mở bảng ══ */}
      <Sec n="00·4" title="Ô dự án — bấm để mở bảng" desc="mỗi ô một dự án · bấm → bảng chi tiết bay ra" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {props.projectCards.map((project) => {
          const healthCls =
            project.health.level === 'normal' ? 'bg-[var(--success-soft)] text-[var(--ok)]' :
            project.health.level === 'watch' ? 'bg-[var(--warning-soft)] text-[var(--warn)]' :
            project.health.level === 'problem' ? 'bg-[var(--danger-soft)] text-[var(--crit)]' :
            'bg-[var(--bg-surface)] text-[var(--text-muted)]'
          const barColor =
            project.health.level === 'normal' ? 'var(--ok)' :
            project.health.level === 'watch' ? 'var(--warn)' :
            project.health.level === 'problem' ? 'var(--crit)' : 'var(--border)'
          const hasSpec = props.projectSpecs.some(s => s.project_id === project.id)
          const hasTracker = props.executionTrackers.some(t => t.project_id === project.id)
          return (
            <button
              key={project.id}
              type="button"
              onClick={() => setBoardProject(project.id)}
              className="vyvy-card p-5 text-left transition-colors hover:border-[var(--border-strong)]"
            >
              <div className="mb-3 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-extrabold text-[var(--text-primary)]">{project.name}</p>
                  {project.code && <p className="text-[10px] text-[var(--text-muted)]">{project.code}</p>}
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${healthCls}`}>{project.health.label}</span>
              </div>
              <div className="mb-2 h-2.5 overflow-hidden rounded-full bg-[var(--bg-surface)]">
                <div className="h-2.5 rounded-full" style={{ width: `${project.total === 0 ? 0 : Math.max(project.rate, 1)}%`, background: barColor }} />
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <span className="font-bold tabular-nums text-[var(--text-secondary)]">{isNaN(project.rate) ? 0 : project.rate}% · {project.done}/{project.total} việc</span>
                {project.overdue > 0 && <span className="font-semibold text-[var(--crit)]">{project.overdue} trễ</span>}
                {project.problem > 0 && <span className="font-semibold text-[var(--warn)]">{project.problem} vấn đề</span>}
                <span className="ml-auto font-extrabold text-[var(--text-primary)]">Mở bảng →</span>
              </div>
              {(hasSpec || hasTracker) && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {hasSpec && <span className="rounded-full bg-[var(--olive)]/10 px-2 py-0.5 text-[9px] font-bold text-[var(--olive)]">?? Strategy Spec</span>}
                  {hasTracker && <span className="rounded-full bg-[var(--accent)]/10 px-2 py-0.5 text-[9px] font-bold text-[var(--accent)]">?? Execution Tracker</span>}
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* -- Project Workspace Modal -- */}
      {boardProjectCard && (() => {
        const pTasks = props.tasks.filter((t) => t.project_id === boardProjectCard.id)
        const pTaskIds = new Set(pTasks.map((t) => t.id))
        const pDue = pTasks.filter((t) => {
          if (t.status === 'completed' || !t.due_date) return false
          const d = new Date(t.due_date); d.setHours(0, 0, 0, 0)
          return d >= today && d <= weekEnd
        }).length
        const pStuck = pTasks.filter((t) => isTaskOverdue(t) || isTaskProblem(t) || isDeadlineActionNeeded(t)).length
        const pPend = props.steps.filter((s) => pTaskIds.has(s.task_id) && !s.is_done && s.approval_status === 'pending').length
        const workstreams = pTasks.filter((t) => isWorkstream(t))
        const pDone = pTasks.filter((t) => t.status === 'completed').length
        const pTotal = pTasks.length

        // Spec & tracker linked to this project
        const spec = props.projectSpecs.find(s => s.project_id === boardProjectCard.id)
        const tracker = props.executionTrackers.find(t => t.project_id === boardProjectCard.id)

        // Parse JSON fields safely
        function parseJson<T>(s: string | null | undefined): T | null {
          if (!s) return null
          try { return JSON.parse(s) as T } catch { return null }
        }
        const specKpis = parseJson<Array<{kpi:string;formula:string;target:string}>>(spec?.kpis)
        const specRisks = parseJson<Array<{risk:string;severity:string;mitigation:string}>>(spec?.risks)
        const specDecisions = parseJson<Array<{id:string;decision:string;date:string;by:string}>>(spec?.decisions)
        const trackerPhases = parseJson<Array<{phase:string;name:string;timeline:string;work:string[];exit_gate:string[];owner:string}>>(tracker?.phases)
        const trackerModules = parseJson<Array<{id:string;name:string;readiness:string;blocker:string}>>(tracker?.module_readiness)
        const trackerDecisions = parseJson<Array<{item:string;needs:string;owner:string}>>(tracker?.decisions_needed)
        const trackerTop3 = parseJson<Array<{rank:number;action:string;why:string;owner:string}>>(tracker?.top3_actions)

        const TABS: { key: BoardTab; label: string; dot?: string }[] = [
          { key: 'overview', label: 'Tổng quan' },
          { key: 'spec', label: 'Strategy / Spec', dot: spec ? 'bg-[var(--success)]' : 'bg-[var(--warn)]' },
          { key: 'wbs', label: 'Execution / WBS', dot: tracker ? 'bg-[var(--success)]' : 'bg-[var(--warn)]' },
          { key: 'coo', label: 'COO Board' },
          { key: 'tasks', label: 'Task & Step' },
          { key: 'timeline', label: 'Timeline' },
          { key: 'kpi', label: 'KPI & Risk' },
          { key: 'decision', label: 'Decision Log' },
          { key: 'files', label: 'Files / Links' },
        ]

        function stBadge(t: Task) {
          if (t.status === 'completed') return { dot: 'bg-[var(--success)]', txt: 'Xong', cls: 'text-[var(--success)] bg-[var(--success-soft)]' }
          if (isTaskOverdue(t)) return { dot: 'bg-[var(--crit)]', txt: 'Trễ', cls: 'text-[var(--crit)] bg-[var(--danger-soft)]' }
          if (t.status === 'in_progress') return { dot: 'bg-[var(--olive)]', txt: 'Đang', cls: 'text-[var(--olive)] bg-[var(--bg-surface)]' }
          if (t.status === 'pending') return { dot: 'bg-[var(--warn)]', txt: 'Kẹt', cls: 'text-[var(--warn)] bg-[var(--warning-soft)]' }
          return { dot: 'bg-[var(--border)]', txt: 'Chua', cls: 'text-[var(--text-muted)] bg-[var(--bg-surface)]' }
        }

        return (
          <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-2 sm:p-6" onClick={() => setBoardProject(null)}>
            <div className="vyvy-modal-panel w-full max-w-5xl overflow-hidden rounded-[var(--radius-lg)]" onClick={(e) => e.stopPropagation()}>

              {/* -- Header -- */}
              <div className="sticky top-0 z-20 border-b border-[var(--border)] bg-[var(--bg-card)]">
                <div className="flex items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-[var(--accent)]">{boardProjectCard.code || 'PROJECT'}</p>
                    <p className="truncate text-lg font-extrabold text-[var(--text-primary)] leading-tight">{boardProjectCard.name}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {/* Health badge */}
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
                      boardProjectCard.health.level === 'normal' ? 'bg-[var(--success-soft)] text-[var(--ok)]' :
                      boardProjectCard.health.level === 'watch' ? 'bg-[var(--warning-soft)] text-[var(--warn)]' :
                      boardProjectCard.health.level === 'problem' ? 'bg-[var(--danger-soft)] text-[var(--crit)]' :
                      'bg-[var(--bg-surface)] text-[var(--text-muted)]'
                    }`}>{boardProjectCard.health.label}</span>
                    <span className="text-sm font-extrabold tabular-nums text-[var(--text-secondary)]">{boardProjectCard.rate}%</span>
                    {props.canDeleteProject && (
                      <button type="button" onClick={() => { setBoardProject(null); props.deleteProject(boardProjectCard) }}
                        className="rounded-lg border border-[var(--danger)]/30 px-2.5 py-1.5 text-xs font-semibold text-[var(--danger)] hover:bg-[var(--danger-soft)]">
                        Xóa
                      </button>
                    )}
                    <button type="button" onClick={() => setBoardProject(null)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-surface)]">
                      <Ico d={IC.x} size={16} />
                    </button>
                  </div>
                </div>
                {/* Progress bar */}
                <div className="h-1 w-full bg-[var(--border)]">
                  <div className="h-full bg-[var(--olive)] transition-all" style={{ width: `${boardProjectCard.total === 0 ? 0 : Math.max(boardProjectCard.rate, 1)}%` }} />
                </div>
                {/* Tabs */}
                <div className="flex overflow-x-auto border-b border-[var(--border)] px-5 gap-0">
                  {TABS.map((tab) => (
                    <button key={tab.key} type="button" onClick={() => setBoardTab(tab.key)}
                      className={`shrink-0 border-b-2 px-3 py-2.5 text-xs font-bold transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                        boardTab === tab.key
                          ? 'border-[var(--olive)] text-[var(--olive)]'
                          : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                      }`}>
                      {tab.label}
                      {tab.dot && <span className={`h-1.5 w-1.5 rounded-full ${tab.dot}`} />}
                    </button>
                  ))}
                </div>
              </div>

              {/* -- Tab content -- */}
              <div className="p-5 space-y-5">

                {/* TAB: Tổng quan */}
                {boardTab === 'overview' && (
                  <div className="space-y-5">
                    {boardProjectCard.description && (
                      <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{boardProjectCard.description}</p>
                    )}
                    {/* Spec + Tracker link status */}
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { label: 'Strategy Spec', linked: !!spec, action: () => setBoardTab('spec') },
                        { label: 'Execution Tracker', linked: !!tracker, action: () => setBoardTab('wbs') },
                      ].map((s) => (
                        <button key={s.label} type="button" onClick={s.action}
                          className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-left text-xs font-semibold transition-colors hover:bg-[var(--bg-surface)] ${s.linked ? 'border-[var(--success)]/30 text-[var(--success)]' : 'border-dashed border-[var(--border)] text-[var(--text-muted)]'}`}>
                          <span className={`h-2 w-2 rounded-full ${s.linked ? 'bg-[var(--success)]' : 'bg-[var(--border)]'}`} />
                          {s.label}: {s.linked ? 'Đã liên kết' : 'Chưa có'}
                          <span className="ml-auto text-[10px]">{s.linked ? 'Xem ->' : 'Import'}</span>
                        </button>
                      ))}
                    </div>
                    {/* North star from spec */}
                    {spec?.north_star && (
                      <div className="rounded-xl border border-[var(--olive)]/20 bg-[var(--bg-surface)] px-4 py-3">
                        <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-[var(--accent)]">North Star</p>
                        <p className="text-sm font-bold text-[var(--text-primary)]">{spec.north_star}</p>
                      </div>
                    )}
                    {/* Top 3 actions from tracker */}
                    {trackerTop3 && trackerTop3.length > 0 && (
                      <div>
                        <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">3 hành động ưu tiên</p>
                        <div className="space-y-1.5">
                          {trackerTop3.map((a) => (
                            <div key={a.rank} className="flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2.5">
                              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-[9px] font-extrabold text-[var(--text-primary)]">{a.rank}</span>
                              <div className="min-w-0">
                                <p className="text-sm font-bold text-[var(--text-primary)]">{a.action}</p>
                                <p className="text-[10px] text-[var(--text-muted)]">{a.why} · <span className="font-semibold">{a.owner}</span></p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {[
                        { label: 'Tiến độ', v: `${boardProjectCard.rate}%`, sub: `${pDone}/${pTotal} task`, c: 'text-[var(--text-primary)]' },
                        { label: 'Xong tuần này', v: pDue, sub: 'task đến hạn', c: pDue > 0 ? 'text-[var(--success)]' : 'text-[var(--text-muted)]' },
                        { label: 'Kẹt / trễ', v: pStuck, sub: 'cần xử lý ngay', c: pStuck > 0 ? 'text-[var(--danger)]' : 'text-[var(--text-muted)]' },
                        { label: 'Chờ duyệt', v: pPend, sub: 'bước pending', c: pPend > 0 ? 'text-[var(--warning)]' : 'text-[var(--text-muted)]' },
                      ].map((x) => (
                        <div key={x.label} className="rounded-xl bg-[var(--bg-surface)] px-3.5 py-3">
                          <p className={`text-2xl font-extrabold tabular-nums leading-none ${x.c}`}>{x.v}</p>
                          <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{x.label}</p>
                          <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">{x.sub}</p>
                        </div>
                      ))}
                    </div>
                    <ProjectHealthSummary health={boardProjectCard.health} />
                    {/* Workstream summary */}
                    <div>
                      <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Workstream ({workstreams.length})</p>
                      <div className="space-y-2">
                        {workstreams.length === 0 ? (
                          <div className="rounded-xl border border-dashed border-[var(--border)] py-8 text-center">
                            <p className="text-sm font-bold text-[var(--text-muted)]">Dự án chưa có task triển khai.</p>
                            <p className="mt-1 text-xs text-[var(--text-muted)]">Hãy import Execution Tracker hoặc tạo workstream đầu tiên.</p>
                          </div>
                        ) : workstreams.map((ws) => {
                          const children = pTasks.filter((t) => t.parent_task_id === ws.id)
                          const wsD = children.filter((c) => c.status === 'completed').length
                          const wsP = children.length > 0 ? Math.round((wsD / children.length) * 100) : 0
                          const st = stBadge(ws)
                          return (
                            <div key={ws.id} className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-2.5">
                              <span className={`h-2 w-2 shrink-0 rounded-full ${st.dot}`} />
                              <p className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--text-primary)]">{ws.title}</p>
                              <div className="flex items-center gap-2 shrink-0">
                                <div className="h-1.5 w-20 overflow-hidden rounded-full bg-[var(--border)]">
                                  <div className="h-full rounded-full bg-[var(--olive)]" style={{ width: `${wsP}%` }} />
                                </div>
                                <span className="text-[10px] font-bold tabular-nums text-[var(--text-muted)]">{wsD}/{children.length}</span>
                              </div>
                              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${st.cls}`}>{st.txt}</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB: Execution / WBS */}
                {boardTab === 'wbs' && (
                  <div className="space-y-4">
                    {/* Tracker stage + phases */}
                    {tracker && (
                      <div className="space-y-3">
                        {tracker.stage && (
                          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-2.5">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--accent)]">Stage hiện tại</p>
                            <p className="mt-0.5 text-sm font-bold text-[var(--text-primary)]">{tracker.stage}</p>
                          </div>
                        )}
                        {trackerPhases && trackerPhases.length > 0 && (
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                            {trackerPhases.map((ph) => (
                              <div key={ph.phase} className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-3">
                                <div className="flex items-center gap-2 mb-1.5">
                                  <span className="rounded-full bg-[var(--accent)] px-2 py-0.5 text-[9px] font-extrabold text-[var(--text-primary)]">{ph.phase}</span>
                                  <p className="font-bold text-sm text-[var(--text-primary)] truncate">{ph.name}</p>
                                </div>
                                <p className="text-[10px] text-[var(--text-muted)]">{ph.timeline} · {ph.owner}</p>
                                {ph.work && ph.work.length > 0 && (
                                  <ul className="mt-1.5 space-y-0.5">
                                    {ph.work.slice(0, 3).map((w, i) => (
                                      <li key={i} className="flex items-center gap-1.5 text-[10px] text-[var(--text-secondary)]">
                                        <span className="h-1 w-1 rounded-full bg-[var(--border)] shrink-0" />
                                        {w}
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        {trackerModules && trackerModules.length > 0 && (
                          <div>
                            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Module readiness</p>
                            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                              {trackerModules.map((m) => (
                                <div key={m.id} className={`rounded-lg border px-3 py-2 ${m.readiness === 'designed' ? 'border-[var(--success)]/20 bg-[var(--success-soft)]' : m.readiness === 'idea' ? 'border-[var(--warning)]/20 bg-[var(--warning-soft)]' : 'border-[var(--border)] bg-[var(--bg-surface)]'}`}>
                                  <p className="text-[9px] font-mono font-bold text-[var(--text-muted)]">{m.id}</p>
                                  <p className="text-xs font-semibold text-[var(--text-primary)] leading-tight">{m.name}</p>
                                  <span className={`inline-block mt-1 rounded-full px-1.5 py-0.5 text-[8px] font-extrabold uppercase ${m.readiness === 'designed' ? 'text-[var(--ok)]' : 'text-[var(--warn)]'}`}>{m.readiness}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    {/* WBS Tree from actual tasks */}
                    <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Work Breakdown Structure</p>
                      <button type="button" onClick={() => {
                        if (wbsExpanded.size === workstreams.length) setWbsExpanded(new Set())
                        else setWbsExpanded(new Set(workstreams.map((w) => w.id)))
                      }} className="text-xs font-semibold text-[var(--olive)] hover:underline">
                        {wbsExpanded.size === workstreams.length ? 'Thu gọn tất cả' : 'Mở rộng tất cả'}
                      </button>
                    </div>
                    {workstreams.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-[var(--border)] py-10 text-center">
                        <p className="text-sm font-bold text-[var(--text-muted)]">Dự án chưa có workstream nào.</p>
                        <p className="mt-1 text-xs text-[var(--text-muted)]">Import Execution Tracker hoặc tạo workstream đầu tiên để bắt đầu.</p>
                      </div>
                    ) : workstreams.map((ws) => {
                      const children = pTasks.filter((t) => t.parent_task_id === ws.id)
                      const wsD = children.filter((c) => c.status === 'completed').length
                      const wsP = children.length > 0 ? Math.round((wsD / children.length) * 100) : 0
                      const isOpen = wbsExpanded.has(ws.id)
                      const st = stBadge(ws)
                      return (
                        <div key={ws.id} className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
                          {/* Workstream row */}
                          <button type="button" onClick={() => {
                            const next = new Set(wbsExpanded)
                            if (isOpen) next.delete(ws.id)
                            else next.add(ws.id)
                            setWbsExpanded(next)
                          }} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-[var(--bg-surface)]">
                            <Ico d={IC.chevronRight} size={12} className={`shrink-0 text-[var(--text-muted)] transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                            <span className={`h-2 w-2 shrink-0 rounded-full ${st.dot}`} />
                            <p className="min-w-0 flex-1 truncate font-bold text-[var(--text-primary)]">{ws.title}</p>
                            <div className="flex items-center gap-2 shrink-0">
                              <div className="h-1.5 w-20 overflow-hidden rounded-full bg-[var(--border)]">
                                <div className="h-full rounded-full bg-[var(--olive)]" style={{ width: `${wsP}%` }} />
                              </div>
                              <span className="text-[10px] font-bold tabular-nums text-[var(--text-muted)] w-10 text-right">{wsD}/{children.length}</span>
                            </div>
                            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${st.cls}`}>{st.txt}</span>
                          </button>
                          {/* Children */}
                          {isOpen && (
                            <div className="border-t border-[var(--border)] divide-y divide-[var(--border)] bg-[var(--bg-surface)]">
                              {children.length === 0 ? (
                                <p className="px-8 py-3 text-xs text-[var(--text-muted)]">Workstream chua có subtask.</p>
                              ) : children.map((t) => {
                                const desc = t.description || ''
                                const ownerM = (desc.match(/owner:\s*([^|]+)/) || [])[1]?.trim()
                                const blkRaw = (desc.match(/blocker:\s*(CAN QUYET|CAN SO|CAN BUILD)/) || [])[1]
                                const blkLabel = blkRaw === 'CAN QUYET' ? 'Cần quyết' : blkRaw === 'CAN SO' ? 'Cần số' : blkRaw === 'CAN BUILD' ? 'Cần build' : ''
                                const isCrit = /critical-path/.test(desc)
                                const who = props.employeeMap.get(t.assignee_id || '')?.full_name || ownerM || '—'
                                const tSt = stBadge(t)
                                const tSteps = props.steps.filter((s) => s.task_id === t.id)
                                const tStepD = tSteps.filter((s) => s.is_done).length
                                return (
                                  <div key={t.id} className="pl-8">
                                    <button type="button" onClick={() => props.setSelectedTask(t)}
                                      className="flex w-full items-center gap-3 py-2 pr-4 text-left hover:bg-[var(--bg-card)] group">
                                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${tSt.dot}`} />
                                      <span className="min-w-0 flex-1 truncate text-sm text-[var(--text-primary)] group-hover:text-[var(--olive)]">{t.title}</span>
                                      {tSteps.length > 0 && (
                                        <span className="shrink-0 text-[10px] tabular-nums text-[var(--text-muted)]">{tStepD}/{tSteps.length} bước</span>
                                      )}
                                      <span className="w-16 shrink-0 truncate text-right text-xs text-[var(--text-muted)]">{who}</span>
                                      <span className="w-11 shrink-0 text-right text-[10px] tabular-nums text-[var(--text-muted)]">{t.due_date?.slice(5) || '—'}</span>
                                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${tSt.cls}`}>{tSt.txt}</span>
                                    </button>
                                    {(isCrit || blkLabel) && (
                                      <div className="flex flex-wrap gap-1 pb-1 pl-4">
                                        {isCrit && <span className="rounded-full bg-[var(--danger-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--crit)]">đường găng</span>}
                                        {blkLabel && <span className="rounded-full bg-[var(--warning-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--warn)]">{blkLabel}</span>}
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })}
                    </div>
                  </div>
                )}

                {/* TAB: COO Board */}
                {boardTab === 'coo' && (
                  <div className="space-y-4">
                    <p className="text-sm text-[var(--text-secondary)]">COO Board hiển thị toàn bộ workstream và subtask theo luồng duyệt phê duyệt.</p>
                    <button type="button"
                      onClick={() => { props.setSelectedProjectId(boardProjectCard.id); props.setView('coo'); setBoardProject(null) }}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] py-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--accent-hover)] transition-colors">
                      <Ico d={IC.externalLink} size={16} />
                      Mở COO Board cho dự án này
                    </button>
                    {/* Mini stats for COO-relevant items */}
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { label: 'Chờ duyệt COO', v: props.steps.filter((s) => pTaskIds.has(s.task_id) && !s.is_done && s.approval_status === 'pending' && s.requires_coo_approval).length, c: 'text-[var(--warning)]' },
                        { label: 'Chờ duyệt CEO', v: props.steps.filter((s) => pTaskIds.has(s.task_id) && !s.is_done && s.approval_status === 'pending' && s.requires_ceo_approval).length, c: 'text-[var(--danger)]' },
                        { label: 'Đã duyệt', v: props.steps.filter((s) => pTaskIds.has(s.task_id) && s.approval_status === 'approved').length, c: 'text-[var(--success)]' },
                        { label: 'Từ chối', v: props.steps.filter((s) => pTaskIds.has(s.task_id) && s.approval_status === 'rejected').length, c: 'text-[var(--crit)]' },
                      ].map((x) => (
                        <div key={x.label} className="rounded-xl bg-[var(--bg-surface)] px-4 py-3">
                          <p className={`text-2xl font-extrabold tabular-nums ${x.c}`}>{x.v}</p>
                          <p className="mt-1 text-xs text-[var(--text-muted)]">{x.label}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* TAB: Task & Step */}
                {boardTab === 'tasks' && (
                  <div className="space-y-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Tất cả task ({pTasks.length}) · bấm để mở chi tiết</p>
                    {pTasks.length === 0 ? (
                      <p className="py-6 text-center text-sm text-[var(--text-muted)]">Chua có task nào.</p>
                    ) : pTasks.map((t) => {
                      const tSteps = props.steps.filter((s) => s.task_id === t.id)
                      const tStepD = tSteps.filter((s) => s.is_done).length
                      const who = props.employeeMap.get(t.assignee_id || '')?.full_name || '—'
                      const tSt = stBadge(t)
                      const isWs = isWorkstream(t)
                      return (
                        <div key={t.id} className={`overflow-hidden rounded-xl border ${isWs ? 'border-[var(--olive)]/30 bg-[var(--bg-surface)]' : 'border-[var(--border)] bg-[var(--bg-card)]'}`}>
                          <button type="button" onClick={() => props.setSelectedTask(t)}
                            className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-[var(--bg-surface)] group">
                            {isWs && <span className="shrink-0 rounded-sm bg-[var(--olive)]/20 px-1 py-0.5 text-[9px] font-bold text-[var(--olive)]">WS</span>}
                            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${tSt.dot}`} />
                            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--text-primary)] group-hover:text-[var(--olive)]">{t.title}</span>
                            {tSteps.length > 0 && (
                              <span className="shrink-0 text-[10px] tabular-nums text-[var(--text-muted)]">{tStepD}/{tSteps.length}</span>
                            )}
                            <span className="shrink-0 text-xs text-[var(--text-muted)]">{who}</span>
                            <span className="shrink-0 text-[10px] tabular-nums text-[var(--text-muted)]">{t.due_date?.slice(5) || '—'}</span>
                            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${tSt.cls}`}>{tSt.txt}</span>
                          </button>
                          {tSteps.length > 0 && (
                            <div className="border-t border-[var(--border)] divide-y divide-[var(--border)]">
                              {tSteps.map((s) => (
                                <div key={s.id} className="flex items-center gap-3 px-8 py-1.5">
                                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${s.is_done ? 'bg-[var(--success)]' : s.approval_status === 'pending' ? 'bg-[var(--warn)]' : 'bg-[var(--border)]'}`} />
                                  <span className={`flex-1 truncate text-xs ${s.is_done ? 'text-[var(--text-muted)] line-through' : 'text-[var(--text-secondary)]'}`}>{s.step_title}</span>
                                  {s.approval_status === 'pending' && !s.is_done && (
                                    <span className="shrink-0 rounded-full bg-[var(--warning-soft)] px-2 py-0.5 text-[9px] font-bold text-[var(--warn)]">chờ duyệt</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* TAB: Timeline */}
                {boardTab === 'timeline' && (() => {
                  const dated = pTasks.filter((t) => t.due_date).sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''))
                  const groups = new Map<string, Task[]>()
                  for (const t of dated) {
                    const k = t.due_date!.slice(0, 7) // YYYY-MM
                    if (!groups.has(k)) groups.set(k, [])
                    groups.get(k)!.push(t)
                  }
                  const monthNames: Record<string, string> = { '01':'Tháng 1','02':'Tháng 2','03':'Tháng 3','04':'Tháng 4','05':'Tháng 5','06':'Tháng 6','07':'Tháng 7','08':'Tháng 8','09':'Tháng 9','10':'Tháng 10','11':'Tháng 11','12':'Tháng 12' }
                  return (
                    <div className="space-y-4">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Sắp xếp theo deadline</p>
                      {groups.size === 0 ? (
                        <p className="py-6 text-center text-sm text-[var(--text-muted)]">Chua có task nào có deadline.</p>
                      ) : Array.from(groups.entries()).map(([ym, ts]) => {
                        const [y, m] = ym.split('-')
                        return (
                          <div key={ym}>
                            <p className="mb-2 text-xs font-bold text-[var(--text-secondary)]">{monthNames[m] || m} {y}</p>
                            <div className="space-y-1.5">
                              {ts.map((t) => {
                                const tSt = stBadge(t)
                                const day = t.due_date!.slice(8)
                                return (
                                  <button key={t.id} type="button" onClick={() => props.setSelectedTask(t)}
                                    className="flex w-full items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-2 text-left hover:bg-[var(--bg-card)] group">
                                    <span className="w-6 shrink-0 text-center text-sm font-extrabold tabular-nums text-[var(--text-muted)]">{day}</span>
                                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${tSt.dot}`} />
                                    <span className="min-w-0 flex-1 truncate text-sm text-[var(--text-primary)] group-hover:text-[var(--olive)]">{t.title}</span>
                                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${tSt.cls}`}>{tSt.txt}</span>
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )
                })()}

                {/* TAB: KPI & Risk */}
                {boardTab === 'kpi' && (
                  <div className="space-y-5">
                    {!spec && !specKpis && (
                      <div className="rounded-xl border border-dashed border-[var(--border)] py-8 text-center">
                        <p className="text-sm font-bold text-[var(--text-muted)]">Dự án chưa có Strategy Spec</p>
                        <p className="mt-1 text-xs text-[var(--text-muted)]">Import Rebuild Spec để hiển thị KPI mục tiêu và risk.</p>
                      </div>
                    )}
                    {specKpis && specKpis.length > 0 && (
                      <div>
                        <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">KPI mục tiêu</p>
                        <div className="overflow-hidden rounded-xl border border-[var(--border)]">
                          <table className="w-full text-xs">
                            <thead className="bg-[var(--bg-surface)]">
                              <tr>
                                {['KPI', 'Công thức', 'Mục tiêu'].map((h) => (
                                  <th key={h} className="px-4 py-2 text-left font-bold text-[var(--text-secondary)] uppercase tracking-wide">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--border)]">
                              {specKpis.map((k, i) => (
                                <tr key={i} className="hover:bg-[var(--bg-surface)]">
                                  <td className="px-4 py-2 font-semibold text-[var(--text-primary)]">{k.kpi}</td>
                                  <td className="px-4 py-2 font-mono text-[var(--text-secondary)]">{k.formula}</td>
                                  <td className="px-4 py-2 font-bold text-[var(--olive)]">{k.target}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                    {specRisks && specRisks.length > 0 && (
                      <div>
                        <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Risk & Mitigation</p>
                        <div className="space-y-2">
                          {specRisks.map((r, i) => (
                            <div key={i} className={`rounded-xl border px-4 py-3 ${r.severity === 'high' ? 'border-[var(--danger)]/30 bg-[var(--danger-soft)]' : 'border-[var(--warning)]/30 bg-[var(--warning-soft)]'}`}>
                              <div className="flex items-start gap-3">
                                <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[9px] font-extrabold uppercase ${r.severity === 'high' ? 'bg-[var(--danger-soft)] text-[var(--crit)]' : 'bg-[var(--warning-soft)] text-[var(--warn)]'}`}>{r.severity}</span>
                                <div>
                                  <p className="text-sm font-bold text-[var(--text-primary)]">{r.risk}</p>
                                  <p className="mt-0.5 text-xs text-[var(--text-secondary)]">? {r.mitigation}</p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* TAB: Decision Log */}
                {boardTab === 'decision' && (
                  <div className="space-y-4">
                    {!spec && !specDecisions && (
                      <div className="rounded-xl border border-dashed border-[var(--border)] py-8 text-center">
                        <p className="text-sm font-bold text-[var(--text-muted)]">Chua có Decision Log</p>
                        <p className="mt-1 text-xs text-[var(--text-muted)]">Import Rebuild Spec để hiển thị quyết định đã chốt.</p>
                      </div>
                    )}
                    {specDecisions && specDecisions.length > 0 && (
                      <div>
                        <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Quyết định đã chốt ({specDecisions.length})</p>
                        <div className="space-y-2">
                          {specDecisions.map((d, i) => (
                            <div key={i} className="flex items-start gap-3 rounded-xl border border-[var(--success)]/20 bg-[var(--success-soft)] px-4 py-3">
                              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--success)]/20 text-[9px] font-extrabold text-[var(--ok)]">{d.id || i+1}</span>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold text-[var(--text-primary)]">{d.decision}</p>
                                <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">{d.date} · {d.by}</p>
                              </div>
                              <span className="shrink-0 rounded-full bg-[var(--success)]/20 px-2 py-0.5 text-[9px] font-extrabold text-[var(--ok)]">CHỐT</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {trackerDecisions && trackerDecisions.length > 0 && (
                      <div>
                        <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Cần quyết định ({trackerDecisions.length})</p>
                        <div className="space-y-2">
                          {trackerDecisions.map((d, i) => (
                            <div key={i} className="flex items-start gap-3 rounded-xl border border-[var(--warning)]/30 bg-[var(--warning-soft)] px-4 py-3">
                              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--warning)]/20 text-[9px] font-extrabold text-[var(--warn)]">!</span>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold text-[var(--text-primary)]">{d.item}</p>
                                <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{d.needs}</p>
                                <p className="mt-0.5 text-[10px] font-bold text-[var(--warn)]">Owner: {d.owner}</p>
                              </div>
                              <span className="shrink-0 rounded-full bg-[var(--warning-soft)] px-2 py-0.5 text-[9px] font-extrabold text-[var(--warn)]">CẦN QUYẾT</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* TAB: Strategy / Spec */}
                {boardTab === 'spec' && (
                  <div className="space-y-5">
                    {!spec ? (
                      <div className="py-10 text-center">
                        <Ico d={IC.fileText} size={32} className="mx-auto mb-3 text-[var(--text-muted)]" />
                        <p className="text-sm font-bold text-[var(--text-muted)]">Dự án chưa có Strategy Spec</p>
                        <p className="mt-1 text-xs text-[var(--text-muted)]">Hãy import Rebuild Spec để hiển thị mục tiêu, mô hình vận hành, KPI và risk.</p>
                        <p className="mt-3 text-[10px] text-[var(--text-muted)] bg-[var(--bg-surface)] inline-block rounded-full px-3 py-1">Chạy SQL seed: <code>sql/vyvy_loyalty_seed.sql</code></p>
                      </div>
                    ) : (
                      <div className="space-y-5">
                        <div className="flex items-center gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-lg font-extrabold text-[var(--text-primary)]">{spec.title || boardProjectCard.name}</p>
                            {spec.version && <p className="text-[10px] font-mono text-[var(--accent)]">{spec.version}</p>}
                          </div>
                        </div>
                        {spec.north_star && (
                          <div className="rounded-xl border border-[var(--olive)]/30 bg-[var(--bg-surface)] px-5 py-4">
                            <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-[var(--accent)]">North Star</p>
                            <p className="text-xl font-extrabold text-[var(--olive)]">{spec.north_star}</p>
                          </div>
                        )}
                        {spec.objectives && (() => {
                          let objs: string[] = []
                          try { objs = JSON.parse(spec.objectives!) } catch { objs = [spec.objectives!] }
                          return (
                            <div>
                              <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Objectives</p>
                              <ul className="space-y-1.5">
                                {objs.map((o, i) => (
                                  <li key={i} className="flex items-start gap-2 text-sm text-[var(--text-secondary)] leading-relaxed">
                                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--olive)]" />
                                    {o}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )
                        })()}
                        {spec.operating_model && (
                          <div>
                            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Operating Model</p>
                            <p className="whitespace-pre-wrap text-sm text-[var(--text-secondary)] leading-relaxed">{spec.operating_model}</p>
                          </div>
                        )}
                        {spec.data_architecture && (
                          <div>
                            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Data Architecture</p>
                            <p className="whitespace-pre-wrap text-sm text-[var(--text-secondary)] leading-relaxed">{spec.data_architecture}</p>
                          </div>
                        )}
                        {spec.governance && (
                          <div>
                            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Governance</p>
                            <p className="whitespace-pre-wrap text-sm text-[var(--text-secondary)] leading-relaxed">{spec.governance}</p>
                          </div>
                        )}
                        {spec.notes && (
                          <div>
                            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Notes & Open Items</p>
                            <p className="whitespace-pre-wrap text-sm text-[var(--text-secondary)] leading-relaxed">{spec.notes}</p>
                          </div>
                        )}
                        {specKpis && specKpis.length > 0 && (
                          <div>
                            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">KPI mục tiêu</p>
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                              {specKpis.map((k, i) => (
                                <div key={i} className="rounded-xl bg-[var(--bg-surface)] px-3 py-2.5">
                                  <p className="text-lg font-extrabold text-[var(--olive)]">{k.target}</p>
                                  <p className="text-[10px] font-bold text-[var(--text-muted)]">{k.kpi}</p>
                                  <p className="text-[10px] font-mono text-[var(--text-muted)]">{k.formula}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* TAB: Files / Links */}
                {boardTab === 'files' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {[
                        { label: 'Rebuild Spec', file: 'VyVy-Loyalty-Rebuild-Spec.html', linked: !!spec, desc: 'Strategy, North Star, KPI, Risk, Decision' },
                        { label: 'Execution Tracker', file: 'VyVy-Loyalty-Execution-Tracker.html', linked: !!tracker, desc: 'WBS, Task, Owner, Phase, Module readiness' },
                      ].map((f) => (
                        <div key={f.label} className={`rounded-xl border p-4 ${f.linked ? 'border-[var(--success)]/20 bg-[var(--success-soft)]' : 'border-dashed border-[var(--border)] bg-[var(--bg-surface)]'}`}>
                          <div className="flex items-start gap-3">
                            <Ico d={IC.fileText} size={18} className={f.linked ? 'text-[var(--ok)]' : 'text-[var(--text-muted)]'} />
                            <div className="min-w-0 flex-1">
                              <p className="font-bold text-[var(--text-primary)]">{f.label}</p>
                              <p className="text-[10px] text-[var(--text-muted)]">{f.desc}</p>
                              <p className="mt-1 font-mono text-[10px] text-[var(--text-muted)]">{f.file}</p>
                            </div>
                            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-extrabold ${f.linked ? 'bg-[var(--success)]/20 text-[var(--ok)]' : 'bg-[var(--bg-surface)] text-[var(--text-muted)]'}`}>
                              {f.linked ? 'Đã seed' : 'Chưa import'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-3">
                      <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Hướng dẫn import</p>
                      <p className="text-xs text-[var(--text-secondary)]">Chạy file <code className="rounded bg-[var(--bg-card)] px-1 py-0.5">sql/vyvy_loyalty_seed.sql</code> trong Supabase Dashboard → SQL Editor để seed toàn bộ dữ liệu từ Rebuild Spec và Execution Tracker vào project này.</p>
                    </div>
                  </div>
                )}

              </div>
            </div>
          </div>
        )
      })()}

    </div>
  )
}


function TasksView(props: {
  tasks: Task[]
  employeeMap: Map<string, Employee>
  projectMap: Map<string, Project>
  setSelectedTask: (task: Task) => void
  updateTaskStatus: (taskId: string, status: string) => void
  statusFilter: string
  setStatusFilter: (f: string) => void
  getStatusLabel: (status: string) => string
  canComplete: (task: Task) => boolean
}) {
  const statusFilter = props.statusFilter
  const setStatusFilter = props.setStatusFilter
  const [search, setSearch] = useState('')

  const filteredTasks = props.tasks
    .filter((t) => {
      if (statusFilter === 'overdue') return isTaskOverdue(t)
      if (statusFilter !== 'all') return t.status === statusFilter
      return true
    })
    .filter((t) => {
      if (!search) return true
      const q = search.toLowerCase()
      return (
        t.title.toLowerCase().includes(q) ||
        (props.employeeMap.get(t.head_id || t.assignee_id || '')?.full_name || '').toLowerCase().includes(q) ||
        (props.projectMap.get(t.project_id || '')?.name || '').toLowerCase().includes(q)
      )
    })

  const filterChips = [
    { key: 'all', label: `Tất cả (${props.tasks.length})` },
    { key: 'in_progress', label: `Đang làm (${props.tasks.filter(t => t.status === 'in_progress').length})` },
    { key: 'overdue', label: `Trễ (${props.tasks.filter(t => isTaskOverdue(t)).length})` },
    { key: 'pending', label: `Pending (${props.tasks.filter(t => t.status === 'pending').length})` },
    { key: 'pending_approval', label: `Chờ duyệt (${props.tasks.filter(t => t.status === 'pending_approval').length})` },
    { key: 'completed', label: `Xong (${props.tasks.filter(t => t.status === 'completed').length})` },
    { key: 'not_started', label: `Chưa bắt đầu (${props.tasks.filter(t => t.status === 'not_started').length})` },
  ]

  function exportCsv() {
    const header = ['Công việc', 'Cấp', 'Giao việc', 'Phụ trách', 'Dự án', 'Deadline', 'Trạng thái', 'Trễ hạn']
    const rows = filteredTasks.map((task) => {
      const head = props.employeeMap.get(task.head_id || '')
      const assignee = props.employeeMap.get(task.assignee_id || '')
      const project = props.projectMap.get(task.project_id || '')
      return [
        task.title,
        task.task_level === 'workstream' ? 'Đầu việc lớn' : task.parent_task_id ? 'Đầu việc con' : 'Task',
        head?.full_name || '',
        assignee?.full_name || '',
        project?.name || '',
        task.due_date || '',
        props.getStatusLabel(task.status),
        isTaskOverdue(task) ? 'Có' : '',
      ]
    })
    const csv = [header, ...rows].map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\r\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `cong-viec-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast(`Đã xuất ${filteredTasks.length} công việc ra CSV`)
  }

  return (
    <div className="space-y-4">
      {/* Search + export */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm việc, người, dự án..."
            className="h-9 w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-input)] pl-8 pr-3 text-sm outline-none focus:border-[var(--accent)] placeholder:text-[var(--text-muted)]" />
        </div>
        <button type="button" onClick={exportCsv}
          className="flex items-center gap-1.5 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] transition-colors">
          <Download size={13}/> Xuất CSV
        </button>
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2">
        {filterChips.map((chip) => (
          <button key={chip.key} type="button" onClick={() => setStatusFilter(chip.key)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
              statusFilter === chip.key
                ? 'bg-[var(--accent)] text-[var(--on-accent)]'
                : 'bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent)]/40'
            }`}>
            {chip.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
        {filteredTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <ListTodo size={32} className="text-[var(--text-muted)] mb-3 opacity-40"/>
            <p className="text-sm font-semibold text-[var(--text-secondary)]">Không có công việc nào</p>
            <p className="text-xs text-[var(--text-muted)] mt-1">{search ? 'Thử từ khóa khác' : 'Thay đổi bộ lọc để xem thêm'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--bg-surface)] text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                  <th className="px-4 py-3">Công việc</th>
                  <th className="px-4 py-3">Cấp</th>
                  <th className="px-4 py-3">Giao việc</th>
                  <th className="px-4 py-3">Phụ trách</th>
                  <th className="px-4 py-3">Dự án</th>
                  <th className="px-4 py-3">Deadline</th>
                  <th className="px-4 py-3">Trạng thái</th>
                  <th className="px-4 py-3">Cảnh báo</th>
                  <th className="px-4 py-3">Cập nhật</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {filteredTasks.map((task) => {
                  const head = props.employeeMap.get(task.head_id || '')
                  const assignee = props.employeeMap.get(task.assignee_id || '')
                  const project = props.projectMap.get(task.project_id || '')
                  const overdue = isTaskOverdue(task)
                  const problem = isTaskProblem(task)
                  return (
                    <tr key={task.id} className="hover:bg-[var(--bg-surface)] transition-colors">
                      <td className="px-4 py-3 max-w-[240px]">
                        <p className="font-semibold text-[var(--text-primary)] truncate">{task.title}</p>
                        {task.description && <p className="text-xs text-[var(--text-muted)] truncate mt-0.5">{task.description}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-xs text-[var(--text-muted)]">
                          {task.task_level === 'workstream' ? 'Đầu việc' : task.parent_task_id ? 'Con' : 'Task'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-[var(--text-secondary)]">{head?.full_name || <span className="text-[var(--text-muted)]">—</span>}</td>
                      <td className="px-4 py-3 text-sm text-[var(--text-secondary)]">{assignee?.full_name || <span className="text-[var(--text-muted)]">Chưa gán</span>}</td>
                      <td className="px-4 py-3 text-sm text-[var(--text-secondary)]">{project?.name || <span className="text-[var(--text-muted)]">—</span>}</td>
                      <td className="px-4 py-3 text-sm font-medium">
                        {task.due_date
                          ? <span className={overdue ? 'text-[var(--danger)]' : 'text-[var(--text-secondary)]'}>{task.due_date.slice(0,10)}</span>
                          : <span className="text-[var(--text-muted)]">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={task.status} label={props.getStatusLabel(task.status)} />
                      </td>
                      <td className="px-4 py-3">
                        {overdue || problem ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--danger-soft)] border border-[var(--danger)]/20 px-2 py-0.5 text-xs font-semibold text-[var(--danger)]">
                            <AlertCircle size={10}/> {getUrgentReason(task)}
                          </span>
                        ) : (
                          <span className="text-xs text-[var(--success)]">✓ Ổn</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <select className="h-8 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-input)] px-2 text-xs outline-none focus:border-[var(--accent)]"
                            value={task.status} onChange={(e) => props.updateTaskStatus(task.id, e.target.value)}>
                            <option value="not_started">Chưa bắt đầu</option>
                            <option value="in_progress">Đang làm</option>
                            <option value="pending">Pending</option>
                            <option value="pending_approval">Chờ duyệt</option>
                            {(props.canComplete(task) || task.status === 'completed') && (
                              <option value="completed">Hoàn thành</option>
                            )}
                          </select>
                          <button type="button" onClick={() => props.setSelectedTask(task)}
                            className="rounded-[var(--radius-sm)] bg-[var(--bg-surface)] border border-[var(--border)] px-2.5 py-1.5 text-xs font-semibold text-[var(--text-secondary)] hover:border-[var(--accent)]/40 hover:text-[var(--accent)] transition-colors">
                            Chi tiết
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="text-xs text-[var(--text-muted)]">{filteredTasks.length} / {props.tasks.length} công việc</p>
    </div>
  )
}

function MeetingView(props: {
  meetingTitle: string
  setMeetingTitle: (value: string) => void
  meetingRaw: string
  setMeetingRaw: (value: string) => void
  meetingRecap: MeetingRecap
  setMeetingRecap: React.Dispatch<React.SetStateAction<MeetingRecap>>
  notexProjectName: string
  setNotexProjectName: (value: string) => void
  notexRows: NotexRow[]
  setNotexRows: (value: NotexRow[]) => void
  departments: Department[]
  employees: Employee[]
  importing: boolean
  handleMeetingFile: (file?: File) => void
  splitNotexRows: () => void
  analyzeMeetingWithAI: () => void
  analyzing: boolean
  currentEmployee: Employee | null
  onMeetingCreated: () => void
  importNotexRows: () => void
  saveMeeting: () => void
  recurringTasks?: RecurringTask[]
  notexScheduleId?: string
  setNotexScheduleId?: (id: string) => void
  notexOccurredAt?: string
  setNotexOccurredAt?: (d: string) => void
}) {
  const r = props.meetingRecap
  const set = (patch: Partial<MeetingRecap>) => props.setMeetingRecap((prev) => ({ ...prev, ...patch }))

  function patchMetric(index: number, patch: Partial<MeetingMetric>) {
    const next = r.metrics.map((m, i) => i === index ? { ...m, ...patch } : m) as MeetingRecap['metrics']
    set({ metrics: next })
  }

  function addIssue() {
    set({ issues: [...r.issues, { id: Math.random().toString(36).slice(2), source: '', status: 'urgent', detail: '' }] })
  }
  function patchIssue(id: string, patch: Partial<MeetingIssue>) {
    set({ issues: r.issues.map((iss) => iss.id === id ? { ...iss, ...patch } : iss) })
  }
  function removeIssue(id: string) { set({ issues: r.issues.filter((iss) => iss.id !== id) }) }

  function addDirection(tag: string) {
    if (!tag.trim()) return
    set({ directions: [...r.directions, tag.trim()] })
  }
  function removeDirection(tag: string) { set({ directions: r.directions.filter((d) => d !== tag) }) }

  function addAssignment() {
    set({ assignments: [...r.assignments, { id: Math.random().toString(36).slice(2), personId: '', personName: '', tasks: '', deadline: '' }] })
  }
  function patchAssignment(id: string, patch: Partial<MeetingAssignment>) {
    set({ assignments: r.assignments.map((a) => a.id === id ? { ...a, ...patch } : a) })
  }
  function removeAssignment(id: string) { set({ assignments: r.assignments.filter((a) => a.id !== id) }) }

  const [directionInput, setDirectionInput] = useState('')

  const issueStatusMap: Record<MeetingIssue['status'], { label: string; cls: string }> = {
    urgent: { label: 'Cần xử lý', cls: 'bg-[var(--danger-soft)] text-[var(--danger)] border-[var(--danger)]/30' },
    ok:     { label: 'Tạm ổn',    cls: 'bg-[var(--success-soft)] text-[var(--success)] border-[var(--success)]/30' },
    hard:   { label: 'Còn khó',   cls: 'bg-[var(--warning-soft)] text-[var(--warning)] border-[var(--warning)]/30' },
    pending:{ label: 'Chưa chốt', cls: 'bg-[var(--bg-surface)] text-[var(--text-secondary)] border-[var(--border)]' },
  }

  function updateRow(rowId: string, patch: Partial<NotexRow>) {
    props.setNotexRows(props.notexRows.map((row) => (row.id === rowId ? { ...row, ...patch } : row)))
  }
  function deleteRow(rowId: string) {
    props.setNotexRows(props.notexRows.filter((row) => row.id !== rowId))
  }

  // Section header component
  function SH({ n, title }: { n: string; title: string }) {
    return (
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded bg-[var(--bg-card)] text-[10px] font-bold text-[var(--accent)]">{n}</span>
        <p className="text-xs font-bold uppercase tracking-widest text-[var(--text-muted)]">{title}</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <MeetingStudio employees={props.employees} currentEmployee={props.currentEmployee} onCreated={props.onMeetingCreated} />
      <details className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)]">
        <summary className="cursor-pointer px-4 py-3 text-sm font-bold text-[var(--text-secondary)]">Form nhập cũ (ẩn — chỉ dùng khi không phân tích AI)</summary>
        <div className="p-1">

      {/* -- Header info -- */}
      <Card>
        <SH n="①" title="Thông tin cuộc họp" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="xl:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-[var(--text-muted)]">Tên biên bản</label>
            <input className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 text-sm outline-none focus:border-[var(--char)]"
              value={props.meetingTitle}
              onChange={(e) => props.setMeetingTitle(e.target.value)}
              placeholder="VD: Recap họp Dữ liệu & Tăng trưởng đa kênh"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-[var(--text-muted)]">Ngày họp</label>
            <input type="date" className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 text-sm outline-none focus:border-[var(--char)]"
              value={r.date} onChange={(e) => set({ date: e.target.value })}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-[var(--text-muted)]">Nền tảng / Context</label>
            <input className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 text-sm outline-none focus:border-[var(--char)]"
              value={r.platforms} onChange={(e) => set({ platforms: e.target.value })}
              placeholder="TikTok Shop, Facebook, Shopee"
            />
          </div>
        </div>
      </Card>

      {/* -- Business metrics -- */}
      <Card>
        <SH n="1" title="Tình hình kinh doanh" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {r.metrics.map((m, i) => (
            <div key={i} className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-3 space-y-2">
              <input className="h-8 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-2 text-xs font-semibold outline-none"
                placeholder="Nhãn (VD: CDA Affiliate tháng 6)"
                value={m.label} onChange={(e) => patchMetric(i, { label: e.target.value })}
              />
              <input className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-2 text-lg font-extrabold outline-none"
                placeholder="Giá trị"
                value={m.value} onChange={(e) => patchMetric(i, { value: e.target.value })}
              />
              <input className="h-8 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-2 text-xs outline-none"
                placeholder="Badge (VD: ⚠ Đang rớt)"
                value={m.badge} onChange={(e) => patchMetric(i, { badge: e.target.value })}
              />
            </div>
          ))}
        </div>
      </Card>

      {/* -- Issues -- */}
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <SH n="③" title="Vấn đề nổi bật" />
          <button type="button" onClick={addIssue}
            className="rounded-lg bg-[var(--bg-card)] px-3 py-1.5 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)]">
            + Thêm vấn đề
          </button>
        </div>
        {r.issues.length === 0 ? (
          <p className="py-4 text-center text-sm text-[var(--text-muted)]">Bấm &quot;+ Thêm vấn đề&quot; để thêm vào.</p>
        ) : (
          <div className="space-y-3">
            {r.issues.map((iss) => (
              <div key={iss.id} className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
                <div className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2">
                  <input className="h-8 min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-2 text-sm font-semibold outline-none"
                    placeholder="Nguồn / chủ đề (VD: TikTok Shop — GM Max)"
                    value={iss.source} onChange={(e) => patchIssue(iss.id, { source: e.target.value })}
                  />
                  <select
                    className={`h-8 shrink-0 rounded-lg border px-2 text-xs font-bold outline-none ${issueStatusMap[iss.status].cls}`}
                    value={iss.status}
                    onChange={(e) => patchIssue(iss.id, { status: e.target.value as MeetingIssue['status'] })}
                  >
                    {(Object.entries(issueStatusMap) as [MeetingIssue['status'], { label: string; cls: string }][]).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                  <button type="button" onClick={() => removeIssue(iss.id)}
                    className="h-8 w-8 shrink-0 rounded-lg text-[var(--text-muted)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger)] transition-colors text-lg leading-none">×</button>
                </div>
                <textarea className="block w-full resize-none p-3 text-sm text-[var(--text-primary)] outline-none"
                  rows={2}
                  placeholder="Mô tả chi tiết vấn đề, nguyên nhân, hướng xử lý..."
                  value={iss.detail} onChange={(e) => patchIssue(iss.id, { detail: e.target.value })}
                />
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* -- Focuses + Directions -- */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card>
          <SH n="④" title="Trọng tâm được chốt" />
          <div className="space-y-2">
            {r.focuses.map((f, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-5 shrink-0 text-center text-xs font-bold text-[var(--text-muted)]">{i + 1}</span>
                <input className="h-10 flex-1 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 text-sm outline-none focus:border-[var(--char)]"
                  placeholder={i === 0 ? 'VD: Dữ liệu — gom, làm sạch, dựng dashboard' : 'VD: Gap mục tiêu — đang hụt bao nhiêu, hụt ở đâu'}
                  value={f}
                  onChange={(e) => {
                    const next = [...r.focuses] as MeetingRecap['focuses']
                    next[i] = e.target.value
                    set({ focuses: next })
                  }}
                />
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <SH n="⑤" title="Hướng tăng trưởng được chốt" />
          <div className="mb-3 flex flex-wrap gap-1.5">
            {r.directions.map((d) => (
              <span key={d} className="flex items-center gap-1 rounded-full bg-[var(--bg-card)] px-3 py-1 text-xs font-bold text-[var(--accent)]">
                {d}
                <button type="button" onClick={() => removeDirection(d)} className="ml-0.5 text-[var(--accent)]/60 hover:text-[var(--accent)]">×</button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input className="h-9 flex-1 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 text-sm outline-none focus:border-[var(--char)]"
              placeholder="VD: Affiliate + KOL"
              value={directionInput}
              onChange={(e) => setDirectionInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { addDirection(directionInput); setDirectionInput('') } }}
            />
            <button type="button" onClick={() => { addDirection(directionInput); setDirectionInput('') }}
              className="rounded-xl bg-[var(--bg-card)] px-4 text-xs font-bold text-[var(--text-primary)]">+ Thêm</button>
          </div>
          <textarea className="mt-3 w-full resize-none rounded-xl border border-[var(--border)] p-3 text-sm outline-none focus:border-[var(--char)]"
            rows={2}
            placeholder="Mô tả thêm về hướng tăng trưởng..."
            value={r.directionNote} onChange={(e) => set({ directionNote: e.target.value })}
          />
        </Card>
      </div>

      {/* -- Assignments -- */}
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <SH n="⑥" title="Phân công — Deadline tuần này" />
          <button type="button" onClick={addAssignment}
            className="rounded-lg bg-[var(--bg-card)] px-3 py-1.5 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)]">
            + Thêm người
          </button>
        </div>
        {r.assignments.length === 0 ? (
          <p className="py-4 text-center text-sm text-[var(--text-muted)]">Bấm &quot;+ Thêm người&quot; để thêm phân công.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
                  <th className="pb-2 pl-1 text-left w-40">Người phụ trách</th>
                  <th className="pb-2 pl-3 text-left">Đầu việc (mỗi dòng / dấu · = 1 task)</th>
                  <th className="pb-2 pl-3 text-left w-36">Deadline</th>
                  <th className="pb-2 w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {r.assignments.map((a) => (
                  <tr key={a.id} className="align-top">
                    <td className="py-2 pl-1 pr-2">
                      <select className="h-9 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-2 text-sm outline-none"
                        value={a.personId}
                        onChange={(e) => {
                          const emp = props.employees.find((em) => em.id === e.target.value)
                          patchAssignment(a.id, { personId: e.target.value, personName: emp?.full_name || '' })
                        }}
                      >
                        <option value="">Chọn người</option>
                        {props.employees.map((em) => <option key={em.id} value={em.id}>{em.full_name}</option>)}
                      </select>
                      <input className="mt-1 h-7 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-2 text-xs outline-none"
                        placeholder="Hoặc nhập tên thủ công"
                        value={a.personName}
                        onChange={(e) => patchAssignment(a.id, { personName: e.target.value })}
                      />
                    </td>
                    <td className="py-2 pl-3 pr-2">
                      <textarea className="w-full resize-none rounded-xl border border-[var(--border)] p-2 text-sm outline-none focus:border-[var(--char)]"
                        rows={3}
                        placeholder={"Gom số liệu (ưu tiên của Yến)\nNghiên cứu so sánh tool\nKiểm tra MCP tất cả FB"}
                        value={a.tasks}
                        onChange={(e) => patchAssignment(a.id, { tasks: e.target.value })}
                      />
                    </td>
                    <td className="py-2 pl-3 pr-2">
                      <input type="date" className="h-9 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-2 text-sm outline-none"
                        value={a.deadline} onChange={(e) => patchAssignment(a.id, { deadline: e.target.value })}
                      />
                    </td>
                    <td className="py-2">
                      <button type="button" onClick={() => removeAssignment(a.id)}
                        className="h-8 w-8 rounded-lg text-[var(--text-muted)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger)] transition-colors text-lg leading-none">×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* -- Quote + Notes -- */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card>
          <SH n="⑦" title="Quote / câu chốt cuộc họp" />
          <input className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 text-sm italic outline-none focus:border-[var(--char)]"
            placeholder='"Họp phải có số liệu, dashboard, đường dây chỉ số rõ ràng."'
            value={r.quote} onChange={(e) => set({ quote: e.target.value })}
          />
        </Card>

        <Card>
          <SH n="⑧" title="Tóm lại — điểm cần nhớ trước họp" />
          <textarea className="w-full resize-none rounded-xl border border-[var(--border)] p-3 text-sm outline-none focus:border-[var(--char)]"
            rows={3}
            placeholder={"Vào họp mở thẳng bằng gap mục tiêu\nYến cần confirm đã xin quyền TikTok Seller\nVũ cần có kết quả scan MCP Facebook"}
            value={r.notes} onChange={(e) => set({ notes: e.target.value })}
          />
        </Card>
      </div>

      {/* -- Import config + actions -- */}
      <Card>
        <SH n="7" title="Import vào COO Board" />
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1">
            <label className="mb-1 block text-xs font-semibold text-[var(--text-muted)]">Tên dự án import vào</label>
            <input className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 text-sm outline-none focus:border-[var(--char)]"
              placeholder="Tên dự án mới hoặc hiện có"
              value={props.notexProjectName}
              onChange={(e) => props.setNotexProjectName(e.target.value)}
            />
          </div>
          {/* Gắn với lịch định kỳ (tuỳ chọn) */}
          {props.recurringTasks && props.recurringTasks.length > 0 && props.setNotexScheduleId && props.setNotexOccurredAt && (
            <>
              <div className="min-w-[200px] flex-1">
                <label className="mb-1 block text-xs font-semibold text-[var(--text-muted)]">Gắn vào lịch định kỳ (tuỳ chọn)</label>
                <select className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 text-sm outline-none focus:border-[var(--char)]"
                  value={props.notexScheduleId || ''} onChange={(e) => props.setNotexScheduleId!(e.target.value)}>
                  <option value="">— Không gắn —</option>
                  {props.recurringTasks.filter((t) => t.kind === 'meeting').map((t) => (
                    <option key={t.id} value={t.id}>{t.title}</option>
                  ))}
                </select>
              </div>
              {props.notexScheduleId && (
                <div className="min-w-[160px]">
                  <label className="mb-1 block text-xs font-semibold text-[var(--text-muted)]">Ngày họp</label>
                  <input type="date" className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 text-sm outline-none focus:border-[var(--char)]"
                    value={props.notexOccurredAt || ''} onChange={(e) => props.setNotexOccurredAt!(e.target.value)} />
                </div>
              )}
            </>
          )}
          <button type="button" onClick={props.saveMeeting}
            className="h-10 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-5 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--bg-surface)] transition-colors">
            Lưu biên bản
          </button>
          <button type="button" onClick={props.analyzeMeetingWithAI} disabled={props.analyzing}
            className="h-10 rounded-xl bg-[var(--accent)] px-5 text-sm font-extrabold text-[var(--on-accent)] disabled:opacity-40 hover:bg-[var(--accent-hover)] transition-colors">
            {props.analyzing ? 'Đang phân tích...' : 'Phân tích bằng AI'}
          </button>
          <button type="button" onClick={props.splitNotexRows}
            className="h-10 rounded-xl bg-[var(--bg-card)] px-5 text-sm font-extrabold text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] transition-colors">
            Tách đầu việc từ phân công
          </button>
          <button type="button" onClick={props.importNotexRows}
            disabled={props.importing || props.notexRows.length === 0}
            className="h-10 rounded-xl bg-[var(--accent)] px-5 text-sm font-extrabold text-[var(--text-primary)] disabled:opacity-40 hover:bg-[var(--accent-hover)] transition-colors">
            {props.importing ? 'Đang import...' : `Import ${props.notexRows.length > 0 ? `(${props.notexRows.length} việc)` : ''}`}
          </button>
        </div>
      </Card>

      {/* -- Preview table -- */}
      {props.notexRows.length > 0 && (
      <Card>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-extrabold">Preview đầu việc</h3>
            <p className="mt-0.5 text-sm text-[var(--text-secondary)]">{props.notexRows.length} dòng — kiểm tra rồi bấm Import.</p>
            {props.notexRows.filter((r) => !r.dueDate).length > 0 && (
              <p className="mt-1 text-xs font-semibold text-[var(--warning)]">
                ⚠ {props.notexRows.filter((r) => !r.dueDate).length} đầu việc chưa có deadline — hãy bổ sung trước khi import.
              </p>
            )}
            {props.notexRows.filter((r) => !r.headId && !r.assigneeId).length > 0 && (
              <p className="mt-1 text-xs font-semibold text-[var(--warning)]">
                ⚠ {props.notexRows.filter((r) => !r.headId && !r.assigneeId).length} đầu việc chưa có owner — dùng nút bên phải để gán nhanh.
              </p>
            )}
          </div>
          {props.currentEmployee && props.notexRows.some((r) => !r.headId || !r.assigneeId) && (
            <button
              type="button"
              onClick={() => {
                props.setNotexRows(props.notexRows.map((r) => ({
                  ...r,
                  headId: r.headId || props.currentEmployee!.id,
                  assigneeId: r.assigneeId || props.currentEmployee!.id,
                })))
              }}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-[var(--lime)]/40 bg-[var(--lime)]/10 px-3 py-2 text-xs font-bold text-[var(--olive)] hover:bg-[var(--lime)]/20 transition-colors"
              title="Gán tất cả đầu việc thiếu Head / Người phụ trách về tài khoản đang đăng nhập"
            >
              ⚡ Gán tất cả item thiếu owner về {props.currentEmployee.full_name}
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1850px] text-left text-sm">
            <thead>
              <tr className="border-b bg-[var(--bg-surface)] text-xs uppercase text-[var(--text-secondary)]">
                <th className="p-3">Đầu việc lớn</th>
                <th className="p-3">Đầu việc con</th>
                <th className="p-3">Trách nhiệm</th>
                <th className="p-3">Kết quả mong muốn</th>
                <th className="p-3">Phòng ban</th>
                <th className="p-3">Head</th>
                <th className="p-3">Chính</th>
                <th className="p-3">Đồng phụ trách</th>
                <th className="p-3">Hỗ trợ</th>
                <th className="p-3">Người duyệt</th>
                <th className="p-3">Deadline</th>
                <th className="p-3">Uu tiên</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {props.notexRows.map((row) => (
                <tr key={row.id} className="border-b align-top">
                  <td className="p-3">
                    <input className="h-10 w-48 rounded-xl border border-[var(--border)] px-3 text-sm outline-none"
                      value={row.workstreamTitle} onChange={(e) => updateRow(row.id, { workstreamTitle: e.target.value })} />
                  </td>
                  <td className="p-3">
                    <input className="h-10 w-56 rounded-xl border border-[var(--border)] px-3 text-sm outline-none"
                      value={row.subtaskTitle} onChange={(e) => updateRow(row.id, { subtaskTitle: e.target.value })} />
                  </td>
                  <td className="p-3">
                    <textarea className="h-20 w-56 rounded-xl border border-[var(--border)] p-3 text-sm outline-none"
                      value={row.responsibility} onChange={(e) => updateRow(row.id, { responsibility: e.target.value })} />
                  </td>
                  <td className="p-3">
                    <textarea className="h-20 w-64 rounded-xl border border-[var(--border)] p-3 text-sm outline-none"
                      value={row.expectedOutput} onChange={(e) => updateRow(row.id, { expectedOutput: e.target.value })} />
                  </td>
                  <td className="p-3">
                    <select className="h-10 w-44 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 text-sm outline-none"
                      value={row.departmentId} onChange={(e) => updateRow(row.id, { departmentId: e.target.value })}>
                      <option value="">Phòng ban</option>
                      {props.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </td>
                  <td className="p-3">
                    <select className="h-10 w-44 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 text-sm outline-none"
                      value={row.headId} onChange={(e) => updateRow(row.id, { headId: e.target.value })}>
                      <option value="">Head</option>
                      {props.employees.map((em) => <option key={em.id} value={em.id}>{em.full_name}</option>)}
                    </select>
                  </td>
                  <td className="p-3">
                    <select className="h-10 w-44 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 text-sm outline-none"
                      value={row.assigneeId} onChange={(e) => updateRow(row.id, { assigneeId: e.target.value })}>
                      <option value="">Người chính</option>
                      {props.employees.map((em) => <option key={em.id} value={em.id}>{em.full_name}</option>)}
                    </select>
                  </td>
                  <td className="p-3">
                    <div className="w-48">
                      <HeadPicker headIds={row.coOwnerIds || []} employees={props.employees} onSave={(ids) => updateRow(row.id, { coOwnerIds: ids })} placeholder="Chọn đồng PT" />
                    </div>
                  </td>
                  <td className="p-3">
                    <div className="w-48">
                      <HeadPicker headIds={row.supporterIds || []} employees={props.employees} onSave={(ids) => updateRow(row.id, { supporterIds: ids })} placeholder="Chọn hỗ trợ" />
                    </div>
                  </td>
                  <td className="p-3">
                    <div className="w-48">
                      <HeadPicker headIds={row.reviewerIds || []} employees={props.employees} onSave={(ids) => updateRow(row.id, { reviewerIds: ids })} placeholder="Chọn người duyệt" />
                    </div>
                  </td>
                  <td className="p-3">
                    <div className="flex flex-col gap-1">
                      <input type="date" className={`h-10 w-40 rounded-xl border px-3 text-sm outline-none ${!row.dueDate ? 'border-[var(--warning)] bg-[var(--warning-soft)]' : 'border-[var(--border)]'}`}
                        value={row.dueDate} onChange={(e) => updateRow(row.id, { dueDate: e.target.value })} />
                      {!row.dueDate && <span className="text-[10px] font-semibold text-[var(--warning)]">Thiếu deadline</span>}
                    </div>
                  </td>
                  <td className="p-3">
                    <select className="h-10 w-32 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 text-sm outline-none"
                      value={row.priority} onChange={(e) => updateRow(row.id, { priority: e.target.value })}>
                      <option value="low">Thấp</option>
                      <option value="medium">Trung bình</option>
                      <option value="high">Cao</option>
                    </select>
                  </td>
                  <td className="p-3">
                    <button type="button" onClick={() => deleteRow(row.id)}
                      className="rounded-lg bg-[var(--danger-soft)] px-3 py-2 text-xs font-bold text-[var(--danger)]">Xóa</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      )}

        </div>
      </details>
      <div className="mt-6"><MeetingHistory /></div>
    </div>
  )
}

function RecurringFormPanel(props: {
  open: boolean
  setOpen: (value: boolean) => void
  form: RecurringTaskForm
  setForm: React.Dispatch<React.SetStateAction<RecurringTaskForm>>
  saveTask: (event: React.FormEvent) => void
  resetForm: () => void
  employees: Employee[]
  departments: Department[]
}) {
  const patchForm = (patch: Partial<RecurringTaskForm>) => props.setForm((prev) => ({ ...prev, ...patch }))
  const [newChecklistText, setNewChecklistText] = useState('')
  const [deptMenuOpen, setDeptMenuOpen] = useState(false)
  const [deptSearch, setDeptSearch] = useState('')

  function addChecklistItem() {
    if (!newChecklistText.trim()) return
    const item: PrepChecklistItem = { id: crypto.randomUUID(), text: newChecklistText.trim(), done: false }
    patchForm({ preparation_checklist: [...props.form.preparation_checklist, item] })
    setNewChecklistText('')
  }

  function removeChecklistItem(id: string) {
    patchForm({ preparation_checklist: props.form.preparation_checklist.filter((i) => i.id !== id) })
  }

  if (!props.open) return null

  function closePanel() {
    props.setOpen(false)
    props.resetForm()
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30">
      <button type="button" className="flex-1" onClick={closePanel} aria-label="Đóng tạo việc định kỳ" />
      <div className="h-full w-full max-w-full overflow-y-auto bg-[var(--bg-card)] p-4 shadow-2xl sm:max-w-[560px] sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-extrabold">
              {props.form.id ? 'Sửa việc định kỳ' : 'Tạo việc định kỳ'}
            </h3>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Gắn lịch họp, hạn nộp và người nhận nhắc cho các việc lặp lại.
            </p>
          </div>
          <button type="button" onClick={closePanel} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--bg-surface)] text-[var(--text-primary)] hover:bg-[var(--border)]">
            <Ico d={IC.x} size={16}/>
          </button>
        </div>

        {props.form.id && (
          <button type="button"
            onClick={props.resetForm}
            className="mb-3 rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-bold"
          >
            Tạo lịch mới
          </button>
        )}

        <form onSubmit={props.saveTask} className="space-y-4">

          {/* ── 1. Thông tin lịch ── */}
          <div className="space-y-2.5">
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)]">1 · Thông tin lịch</p>
            <Input
              placeholder="Tên việc, ví dụ: Họp Performance"
              value={props.form.title}
              onChange={(value) => patchForm({ title: value })}
            />
            <div className="grid grid-cols-2 gap-2">
              <Select value={props.form.kind} onChange={(value) => patchForm({ kind: value })}>
                <option value="meeting">Cuộc họp</option>
                <option value="report">Báo cáo</option>
                <option value="task">Đầu việc</option>
              </Select>
              <Select value={props.form.frequency} onChange={(value) => patchForm({ frequency: value })}>
                <option value="daily">Hằng ngày</option>
                <option value="weekly">Hằng tuần</option>
                <option value="monthly">Hằng tháng</option>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {props.form.frequency === 'weekly' ? (
                <Select value={props.form.weekday} onChange={(value) => patchForm({ weekday: value })}>
                  {WEEKDAY_LABELS.map((label, index) => (
                    <option key={label} value={String(index)}>{label}</option>
                  ))}
                </Select>
              ) : props.form.frequency === 'monthly' ? (
                <input type="number" min={1} max={31}
                  className="h-11 w-full rounded-xl border border-[var(--border)] px-3 text-sm outline-none"
                  value={props.form.month_day}
                  onChange={(e) => patchForm({ month_day: e.target.value })}
                  aria-label="Ngày trong tháng" />
              ) : (
                <div className="flex h-11 items-center rounded-xl border border-[var(--border)] px-3 text-sm font-bold text-[var(--text-secondary)]">Lặp mỗi ngày</div>
              )}
              <input type="time"
                className="h-11 w-full rounded-xl border border-[var(--border)] px-3 text-sm font-bold outline-none"
                value={props.form.time_of_day}
                onChange={(e) => patchForm({ time_of_day: e.target.value })}
                aria-label="Giờ họp" />
            </div>
            <label className="block">
              <span className="mb-1 block text-[10px] font-extrabold uppercase text-[var(--text-muted)]">Ghi chú chung</span>
              <textarea className="min-h-14 w-full rounded-xl border border-[var(--border)] p-3 text-sm outline-none"
                placeholder="Ví dụ: Họp Performance định kỳ thứ 7 hằng tuần lúc 10:00."
                value={props.form.description}
                onChange={(e) => patchForm({ description: e.target.value })} />
            </label>
          </div>

          {/* ── 2. Người phụ trách & phòng ban ── */}
          <div className="space-y-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-3">
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)]">2 · Người phụ trách & Phòng ban</p>

            {/* Chủ trì */}
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-[var(--text-secondary)]">Chủ trì</span>
              <select
                className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 text-sm outline-none"
                value={props.form.host_id}
                onChange={(e) => patchForm({ host_id: e.target.value })}>
                <option value="">— Chưa chọn chủ trì —</option>
                {props.employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>{emp.full_name}{emp.position ? ` · ${emp.position}` : ''}</option>
                ))}
              </select>
            </label>

            {/* Phòng ban — multi-select */}
            <div>
              <span className="mb-1.5 block text-xs font-bold text-[var(--text-secondary)]">Phòng ban liên quan</span>
              {/* Chips of selected depts */}
              {props.form.department_ids.length > 0 && (
                <div className="mb-1.5 flex flex-wrap gap-1">
                  {props.form.department_ids.map((id) => {
                    const d = props.departments.find((x) => x.id === id)
                    if (!d) return null
                    return (
                      <span key={id} className="inline-flex items-center gap-1 rounded-full border border-[var(--accent)]/30 bg-[var(--accent-soft)] px-2.5 py-0.5 text-[10px] font-bold text-[var(--accent-hover)]">
                        {d.name}
                        <button type="button" onClick={() => patchForm({ department_ids: props.form.department_ids.filter((x) => x !== id) })} className="ml-0.5 hover:text-[var(--danger)]">×</button>
                      </span>
                    )
                  })}
                </div>
              )}
              {/* Dropdown trigger */}
              <div className="relative">
                <button type="button"
                  onClick={() => { setDeptMenuOpen(!deptMenuOpen); setDeptSearch('') }}
                  className="flex h-10 w-full items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 text-sm text-left">
                  <span className={props.form.department_ids.length === 0 ? 'text-[var(--text-muted)]' : 'font-bold text-[var(--text-primary)]'}>
                    {props.form.department_ids.length === 0 ? '— Chưa chọn phòng ban —' : `${props.form.department_ids.length} phòng ban đã chọn`}
                  </span>
                  <span className="text-[var(--text-muted)]">{deptMenuOpen ? 'v' : '>'}</span>
                </button>
                {deptMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setDeptMenuOpen(false)} />
                    <div className="absolute left-0 top-11 z-40 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] shadow-xl">
                      <div className="p-2 border-b border-[var(--border)]">
                        <input
                          className="h-8 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-2.5 text-xs outline-none"
                          placeholder="Tìm phòng ban..."
                          value={deptSearch}
                          onChange={(e) => setDeptSearch(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          autoFocus
                        />
                      </div>
                      <div className="max-h-48 overflow-y-auto p-1">
                        {props.departments
                          .filter((d) => d.name.toLowerCase().includes(deptSearch.toLowerCase()))
                          .map((d) => {
                            const on = props.form.department_ids.includes(d.id)
                            return (
                              <label key={d.id}
                                className={`flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-xs ${on ? 'bg-[var(--accent-soft)] font-bold' : 'hover:bg-[var(--bg-surface)]'}`}>
                                <input type="checkbox" className="h-3.5 w-3.5 accent-[var(--char)]" checked={on}
                                  onChange={(e) => {
                                    patchForm({ department_ids: e.target.checked
                                      ? [...props.form.department_ids, d.id]
                                      : props.form.department_ids.filter((x) => x !== d.id)
                                    })
                                  }} />
                                <span>{d.name}</span>
                              </label>
                            )
                          })
                        }
                        {props.departments.filter((d) => d.name.toLowerCase().includes(deptSearch.toLowerCase())).length === 0 && (
                          <p className="px-3 py-2 text-xs text-[var(--text-muted)]">Không tìm thấy.</p>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Người tham gia */}
            <div>
              <p className="mb-1.5 text-xs font-bold text-[var(--text-secondary)]">Người tham gia</p>
              <div className="max-h-32 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-1">
                <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-2">
                  {props.employees.map((emp) => {
                    const on = props.form.participant_ids.includes(emp.id)
                    return (
                      <label key={emp.id} className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs ${on ? 'bg-[var(--accent-soft)] font-bold' : 'hover:bg-[var(--bg-surface)]'}`}>
                        <input type="checkbox" className="h-3.5 w-3.5 accent-[var(--char)]" checked={on}
                          onChange={(e) => patchForm({ participant_ids: e.target.checked ? [...props.form.participant_ids, emp.id] : props.form.participant_ids.filter((id) => id !== emp.id) })} />
                        <span className="min-w-0 truncate">{emp.full_name}</span>
                      </label>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Người theo dõi */}
            <div>
              <p className="mb-1.5 text-xs font-bold text-[var(--text-secondary)]">Người theo dõi</p>
              <div className="max-h-32 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-1">
                <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-2">
                  {props.employees.map((emp) => {
                    const on = props.form.observer_ids.includes(emp.id)
                    return (
                      <label key={emp.id} className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs ${on ? 'bg-[var(--accent-soft)] font-bold' : 'hover:bg-[var(--bg-surface)]'}`}>
                        <input type="checkbox" className="h-3.5 w-3.5 accent-[var(--char)]" checked={on}
                          onChange={(e) => patchForm({ observer_ids: e.target.checked ? [...props.form.observer_ids, emp.id] : props.form.observer_ids.filter((id) => id !== emp.id) })} />
                        <span className="min-w-0 truncate">{emp.full_name}</span>
                      </label>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Người nhận nhắc */}
            <div>
              <p className="mb-1.5 text-xs font-bold text-[var(--text-secondary)]">Người nhận nhắc nhở</p>
              <div className="max-h-32 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-1">
                {props.employees.length === 0 ? (
                  <p className="px-2 py-3 text-xs text-[var(--text-muted)]">Chưa có nhân sự.</p>
                ) : (
                  <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-2">
                    {props.employees.map((emp) => {
                      const on = props.form.assignee_ids.includes(emp.id)
                      return (
                        <label key={emp.id} className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs ${on ? 'bg-[var(--accent-soft)] font-bold' : 'hover:bg-[var(--bg-surface)]'}`}>
                          <input type="checkbox" className="h-3.5 w-3.5 accent-[var(--char)]" checked={on}
                            onChange={(e) => patchForm({ assignee_ids: e.target.checked ? [...props.form.assignee_ids, emp.id] : props.form.assignee_ids.filter((id) => id !== emp.id) })} />
                          <span className="min-w-0 truncate">{emp.full_name}</span>
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── 3. Mục tiêu & Agenda ── */}
          <div className="space-y-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-3">
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)]">3 · Mục tiêu & Agenda</p>
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-[var(--text-secondary)]">Mục tiêu họp</span>
              <textarea className="min-h-16 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-3 text-sm outline-none"
                placeholder="Ví dụ: Review chỉ số Performance tuần, chốt vấn đề tồn đọng, phân công đầu việc tuần tới."
                value={props.form.objective}
                onChange={(e) => patchForm({ objective: e.target.value })} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-[var(--text-secondary)]">Agenda</span>
              <textarea className="min-h-20 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-3 text-sm leading-6 outline-none"
                placeholder={"1. Review kết quả tuần trước\n2. Kiểm tra chỉ số chính\n3. Chốt vấn đề cần xử lý\n4. Giao đầu việc tuần tới"}
                value={props.form.agenda}
                onChange={(e) => patchForm({ agenda: e.target.value })} />
            </label>
          </div>

          {/* ── 4. Checklist chuẩn bị ── */}
          <div className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)]">4 · Checklist chuẩn bị</p>
              {props.form.preparation_checklist.length > 0 && (
                <span className="text-[10px] font-bold text-[var(--text-muted)]">{props.form.preparation_checklist.length} mục</span>
              )}
            </div>
            <div className="space-y-1.5">
              {props.form.preparation_checklist.map((item) => (
                <div key={item.id} className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2">
                  <span className="flex-1 text-xs text-[var(--text-secondary)]">{item.text}</span>
                  <button type="button" onClick={() => removeChecklistItem(item.id)}
                    className="shrink-0 text-[var(--text-muted)] hover:text-[var(--danger)]">
                    <Ico d={IC.x} size={12}/>
                  </button>
                </div>
              ))}
              {props.form.preparation_checklist.length === 0 && (
                <p className="text-xs italic text-[var(--text-muted)]">Chưa có mục nào. Thêm bên dưới.</p>
              )}
            </div>
            <div className="flex gap-2">
              <input className="h-9 flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 text-xs outline-none focus:border-[var(--accent-hover)]"
                placeholder="Ví dụ: Chuẩn bị báo cáo KPI tuần..."
                value={newChecklistText}
                onChange={(e) => setNewChecklistText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addChecklistItem() } }} />
              <button type="button" onClick={addChecklistItem}
                className="h-9 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 text-xs font-bold hover:bg-[var(--border)]">
                + Thêm
              </button>
            </div>
          </div>

          {/* ── 5. Recap / Hồ sơ / Lịch sử (meeting only) ── */}
          {props.form.kind === 'meeting' && (
            <div className="space-y-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-3">
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)]">5 · Recap & Hồ sơ</p>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-[var(--text-secondary)]">Recap cuộc họp trước đó</span>
                <textarea className="min-h-16 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-3 text-sm leading-5 outline-none"
                  placeholder={"- Quyết định đã chốt\n- Action items còn mở\n- Vấn đề cần follow-up"}
                  value={props.form.recap}
                  onChange={(e) => patchForm({ recap: e.target.value })} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-[var(--text-secondary)]">Hồ sơ / File cần chuẩn bị</span>
                <textarea className="min-h-16 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-3 text-sm leading-5 outline-none"
                  placeholder={"- File recap/biên bản họp trước\n- Báo cáo KPI/Performance\n- Dashboard hoặc link số liệu"}
                  value={props.form.prepFiles}
                  onChange={(e) => patchForm({ prepFiles: e.target.value })} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-[var(--text-secondary)]">Lịch sử họp (ghi chú nội bộ)</span>
                <textarea className="min-h-16 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-3 text-sm leading-5 outline-none"
                  placeholder={"- 15/06: Chốt vấn đề..., giao cho...\n- 22/06: ..."}
                  value={props.form.meetingHistory}
                  onChange={(e) => patchForm({ meetingHistory: e.target.value })} />
              </label>
            </div>
          )}

          {/* ── 6. Cài đặt nhắc ── */}
          <div className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-3">
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)]">6 · Cài đặt nhắc</p>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-[var(--text-secondary)]">Nhắc trước (ngày)</span>
                <input type="number" min={0}
                  className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 text-sm outline-none"
                  value={props.form.remind_days_before}
                  onChange={(e) => patchForm({ remind_days_before: e.target.value })} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-[var(--text-secondary)]">Nhắc trước (phút)</span>
                <input type="number" min={1}
                  className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 text-sm outline-none"
                  value={props.form.remind_minutes_before}
                  onChange={(e) => patchForm({ remind_minutes_before: e.target.value })} />
              </label>
            </div>
          </div>

          <button type="submit" className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--bg-card)] px-5 py-3 text-sm font-extrabold text-[var(--text-primary)] border border-[var(--border)] hover:bg-[var(--bg-surface)]">
            <Ico d={props.form.id ? IC.edit : IC.plus} size={15}/>
            {props.form.id ? 'Lưu thay đổi' : 'Tạo việc định kỳ'}
          </button>
        </form>
      </div>
    </div>
  )
}

function DbSetupBanner() {
  const projectRef = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace('https://', '').split('.')[0]
  const sql = encodeURIComponent(`create table if not exists public.recurring_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null, description text, kind text not null default 'task',
  frequency text not null default 'weekly', weekday int, month_day int,
  time_of_day text not null default '09:00', assignee_id uuid, recipient_ids uuid[],
  remind_days_before int not null default 2, remind_minutes_before int not null default 60,
  is_active boolean not null default true, notified_early_for text, notified_near_for text,
  created_by uuid, created_at timestamptz not null default now()
);
create table if not exists public.recurring_meeting_files (
  id uuid primary key default gen_random_uuid(),
  recurring_task_id uuid not null references public.recurring_tasks(id) on delete cascade,
  meeting_date date, title text, file_name text not null, file_url text not null,
  file_type text, note text, uploaded_by uuid, created_at timestamptz not null default now()
);
create table if not exists public.recurring_task_runs (
  id uuid primary key default gen_random_uuid(), source text not null default 'cron',
  status text not null default 'running', scanned int, notifications_sent int,
  detail jsonb not null default '{}'::jsonb, triggered_by uuid,
  started_at timestamptz not null default now(), finished_at timestamptz
);
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(), recipient_id uuid not null, actor_id uuid,
  type text not null default 'info', title text not null, body text, task_id uuid,
  project_id uuid, is_read boolean not null default false, created_at timestamptz not null default now()
);
alter table public.recurring_tasks enable row level security;
alter table public.recurring_meeting_files enable row level security;
alter table public.recurring_task_runs enable row level security;
alter table public.notifications enable row level security;
drop policy if exists "recurring_all" on public.recurring_tasks;
create policy "recurring_all" on public.recurring_tasks for all using (true) with check (true);
drop policy if exists "recurring_meeting_files_all" on public.recurring_meeting_files;
create policy "recurring_meeting_files_all" on public.recurring_meeting_files for all using (true) with check (true);
drop policy if exists "recurring_runs_all" on public.recurring_task_runs;
create policy "recurring_runs_all" on public.recurring_task_runs for all using (true) with check (true);
drop policy if exists "notifications_all" on public.notifications;
create policy "notifications_all" on public.notifications for all using (true) with check (true);
insert into public.recurring_tasks (id, title, kind, frequency, weekday, time_of_day, remind_days_before, remind_minutes_before)
select '${PERFORMANCE_MEETING_ID}'::uuid,'Họp Performance','meeting','weekly',6,'10:00',2,60
where not exists (select 1 from public.recurring_tasks where title = 'Họp Performance' or id = '${PERFORMANCE_MEETING_ID}'::uuid);`)
  const url = projectRef
    ? `https://supabase.com/dashboard/project/${projectRef}/sql/new?content=${sql}`
    : `https://supabase.com/dashboard`
  return (
    <div className="flex items-start gap-3 rounded-xl border border-[var(--warning)]/30 bg-[var(--warning-soft)] p-4">
      <span className="mt-0.5 text-amber-500">?</span>
      <div className="flex-1">
        <p className="text-sm font-bold text-[var(--warning)]">Cần khởi tạo database lần đầu</p>
        <p className="mt-0.5 text-xs text-[var(--warning)]">Các bảng cần thiết chưa tồn tại trong Supabase. Bấm nút bên dưới — trang SQL Editor sẽ mở với SQL đã điền sẵn, bấm <strong>Run</strong> là xong.</p>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] bg-[var(--warning)] px-4 py-2 text-xs font-bold text-[var(--paper)] hover:opacity-90 transition-colors"
        >
          Mở Supabase SQL Editor →
        </a>
      </div>
    </div>
  )
}

function getRecurringPrepStatus(task: RecurringTask, now: Date): 'chua_chuan_bi' | 'dang_chuan_bi' | 'du_ho_so' | 'qua_han' {
  const checklist = task.preparation_checklist || []
  if (checklist.length === 0) return 'chua_chuan_bi'
  const allDone = checklist.every((item) => item.done)
  if (allDone) return 'du_ho_so'
  const minsLeft = minutesUntil(nextOccurrence(task, now), now)
  if (minsLeft <= 120) return 'qua_han'
  return 'dang_chuan_bi'
}

const PREP_STATUS_LABEL: Record<string, string> = {
  chua_chuan_bi: 'Chưa chuẩn bị',
  dang_chuan_bi: 'Đang chuẩn bị',
  du_ho_so: 'Đủ hồ sơ',
  qua_han: 'Quá hạn chuẩn bị',
}
const PREP_STATUS_CLS: Record<string, string> = {
  chua_chuan_bi: 'bg-[var(--bg-surface)] text-[var(--text-muted)] border-[var(--border)]',
  dang_chuan_bi: 'bg-[var(--warning-soft)] text-[var(--warning)] border-[var(--warning)]/20',
  du_ho_so: 'bg-[var(--success-soft)] text-[var(--success)] border-[var(--success)]/20',
  qua_han: 'bg-[var(--danger-soft)] text-[var(--danger)] border-[var(--danger)]/20',
}

function ScheduleDetailModal(p: {
  task: RecurringTask
  employeeMap: Map<string, Employee>
  departmentMap: Map<string, Department>
  meetingFiles: RecurringMeetingFile[]
  meetingSessions: MeetingSession[]
  relatedTasks: Task[]
  now: Date
  onAddSession: () => void
  onViewSession: (s: MeetingSession) => void
  close: () => void
}) {
  const host = p.employeeMap.get(p.task.host_id || '')
  const deptIds = p.task.department_ids && p.task.department_ids.length > 0
    ? p.task.department_ids
    : p.task.department_id ? [p.task.department_id] : []
  const deptNames = deptIds.map((id) => p.departmentMap.get(id)?.name).filter(Boolean) as string[]
  const observers = (p.task.observer_ids || []).map((id) => p.employeeMap.get(id)?.full_name).filter(Boolean)
  const participants = (p.task.participant_ids || []).map((id) => p.employeeMap.get(id)?.full_name).filter(Boolean)
  const recipients = (p.task.recipient_ids || []).map((id) => p.employeeMap.get(id)?.full_name).filter(Boolean)
  const prep = getRecurringPrepStatus(p.task, p.now)
  const checklist = p.task.preparation_checklist || []
  const doneCnt = checklist.filter((i) => i.done).length
  const occ = nextOccurrence(p.task, p.now)
  // Biên bản gần nhất (sort by meeting_date desc)
  const sortedFiles = [...p.meetingFiles].sort((a, b) => String(b.meeting_date || '').localeCompare(String(a.meeting_date || '')))
  const latestFile = sortedFiles[0]
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3" onClick={p.close}>
      <div className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-2xl bg-[var(--bg-card)] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-card)] px-5 py-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-display text-base font-extrabold text-[var(--text-primary)]">{p.task.title}</p>
              <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${PREP_STATUS_CLS[prep]}`}>{PREP_STATUS_LABEL[prep]}</span>
              {!p.task.is_active && <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-500">Tạm tắt</span>}
            </div>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">{recurringKindLabel(p.task.kind)} · {recurringFrequencyLabel(p.task)} · {p.task.time_of_day}</p>
          </div>
          <button type="button" onClick={p.close} className="rounded-lg p-2 hover:bg-[var(--bg-surface)]"><Ico d={IC.x} size={16}/></button>
        </div>

        <div className="p-5 space-y-5">
          {/* ── Thông tin lịch ── */}
          <section>
            <p className="mb-2.5 text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)]">Thông tin lịch</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-xs sm:grid-cols-3">
              <div>
                <p className="text-[var(--text-muted)]">Lần tiếp theo</p>
                <p className="mt-0.5 font-bold text-[var(--text-primary)]">{formatOccurrence(occ)}</p>
              </div>
              <div>
                <p className="text-[var(--text-muted)]">Còn lại</p>
                <p className="mt-0.5 font-bold text-[var(--text-primary)]">{formatTimeLeft(occ, p.now)}</p>
              </div>
              <div>
                <p className="text-[var(--text-muted)]">Chu kỳ</p>
                <p className="mt-0.5 font-bold text-[var(--text-primary)]">{recurringFrequencyLabel(p.task)}</p>
              </div>
              <div>
                <p className="text-[var(--text-muted)]">Chủ trì</p>
                <p className={`mt-0.5 font-bold ${host ? 'text-[var(--text-primary)]' : 'italic text-[var(--text-muted)]'}`}>{host ? host.full_name : 'Chưa có chủ trì'}</p>
              </div>
              <div>
                <p className="text-[var(--text-muted)]">Phòng ban</p>
                <p className={`mt-0.5 font-bold ${deptNames.length > 0 ? 'text-[var(--text-primary)]' : 'italic text-[var(--text-muted)]'}`}>
                  {deptNames.length > 0 ? deptNames.join(', ') : 'Chưa có phòng ban'}
                </p>
              </div>
              {participants.length > 0 && (
                <div>
                  <p className="text-[var(--text-muted)]">Tham gia</p>
                  <p className="mt-0.5 font-bold text-[var(--text-primary)]">{(participants as string[]).join(', ')}</p>
                </div>
              )}
              {observers.length > 0 && (
                <div>
                  <p className="text-[var(--text-muted)]">Theo dõi</p>
                  <p className="mt-0.5 font-bold text-[var(--text-primary)]">{(observers as string[]).join(', ')}</p>
                </div>
              )}
              {recipients.length > 0 && (
                <div>
                  <p className="text-[var(--text-muted)]">Nhận nhắc</p>
                  <p className="mt-0.5 font-bold text-[var(--text-primary)]">{(recipients as string[]).join(', ')}</p>
                </div>
              )}
            </div>
          </section>

          {/* ── Mục tiêu + Agenda ── */}
          <section className="space-y-3">
            <div>
              <p className="mb-1 text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)]">Mục tiêu</p>
              {p.task.objective
                ? <p className="text-sm leading-relaxed text-[var(--text-secondary)]">{p.task.objective}</p>
                : <p className="text-xs italic text-[var(--text-muted)]">Chưa có mục tiêu họp.</p>
              }
            </div>
            {p.task.agenda && (
              <div>
                <p className="mb-1 text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)]">Agenda</p>
                <p className="whitespace-pre-line text-sm leading-relaxed text-[var(--text-secondary)]">{p.task.agenda}</p>
              </div>
            )}
          </section>

          {/* ── Checklist chuẩn bị ── */}
          <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)]">Checklist chuẩn bị</p>
              {checklist.length > 0 && (
                <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${doneCnt === checklist.length ? 'border-[var(--success)]/30 bg-[var(--success-soft)] text-[var(--success)]' : 'border-[var(--warning)]/30 bg-[var(--warning-soft)] text-[var(--warning)]'}`}>
                  {doneCnt}/{checklist.length} xong
                </span>
              )}
            </div>
            {checklist.length === 0 ? (
              <p className="text-xs italic text-[var(--text-muted)]">Chưa có checklist chuẩn bị. Bấm &ldquo;Chuẩn bị họp&rdquo; để thêm.</p>
            ) : (
              <div className="space-y-1.5">
                {checklist.map((item) => (
                  <div key={item.id} className="flex items-start gap-2 text-xs">
                    <span className={`mt-0.5 h-3.5 w-3.5 shrink-0 rounded border text-center text-[10px] leading-[14px] ${item.done ? 'bg-[var(--success)] border-[var(--success)] text-white' : 'border-[var(--border)]'}`}>{item.done ? '✓' : ''}</span>
                    <span className={item.done ? 'line-through text-[var(--text-muted)]' : 'text-[var(--text-secondary)]'}>{item.text}</span>
                    {item.owner_id && p.employeeMap.get(item.owner_id) && (
                      <span className="ml-auto shrink-0 text-[var(--text-muted)]">{p.employeeMap.get(item.owner_id)?.full_name}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ── Biên bản gần nhất ── */}
          <section>
            <p className="mb-2 text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)]">Biên bản gần nhất</p>
            {latestFile ? (
              <a href={latestFile.file_url} target="_blank" rel="noreferrer"
                className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-3 hover:bg-[var(--border)] transition-colors">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-[var(--text-primary)] truncate">{latestFile.title || latestFile.file_name}</p>
                  {latestFile.meeting_date && <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">Ngày họp: {latestFile.meeting_date}</p>}
                  {latestFile.note && <p className="mt-0.5 text-[11px] italic text-[var(--text-muted)] truncate">{latestFile.note}</p>}
                </div>
                <span className="shrink-0 text-[11px] font-bold text-[var(--accent-hover)]">Mở →</span>
              </a>
            ) : (
              <p className="rounded-xl bg-[var(--bg-surface)] px-4 py-3 text-xs italic text-[var(--text-muted)]">
                {p.task.kind === 'meeting' ? 'Chưa có biên bản nào được lưu.' : 'Không có hồ sơ.'}
              </p>
            )}
            {sortedFiles.length > 1 && (
              <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">Và {sortedFiles.length - 1} file khác — xem đầy đủ qua nút Biên bản.</p>
            )}
          </section>

          {/* ── Đầu việc đã gắn ── */}
          <section>
            <p className="mb-2 text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)]">Đầu việc đã gắn ({p.relatedTasks.length})</p>
            {p.relatedTasks.length === 0 ? (
              <p className="rounded-xl bg-[var(--bg-surface)] px-4 py-3 text-xs italic text-[var(--text-muted)]">Chưa có đầu việc nào được gắn từ các buổi trước.</p>
            ) : (
              <div className="space-y-1.5">
                {p.relatedTasks.map((t) => (
                  <div key={t.id} className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-xs">
                    <span className="flex-1 font-bold text-[var(--text-primary)] truncate">{t.title}</span>
                    <span className="shrink-0 rounded-full bg-[var(--bg-card)] px-2 py-0.5 text-[10px] text-[var(--text-muted)]">{t.status}</span>
                    {t.due_date && <span className="shrink-0 text-[var(--text-muted)]">{t.due_date}</span>}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ── Lịch sử các lần họp trước ── */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)]">Lịch sử các lần họp ({p.meetingSessions.length})</p>
              <button type="button" onClick={p.onAddSession}
                className="rounded-lg border border-[var(--border)] px-3 py-1 text-[10px] font-bold hover:bg-[var(--bg-surface)] transition-colors">
                + Thêm buổi họp
              </button>
            </div>
            {p.meetingSessions.length === 0 ? (
              <div className="rounded-xl bg-[var(--bg-surface)] px-4 py-5 text-center">
                <p className="text-xs font-bold text-[var(--text-secondary)]">Chưa có lịch sử họp trước.</p>
                <p className="mt-1 text-[11px] text-[var(--text-muted)]">Sau mỗi buổi họp, bấm &ldquo;+ Thêm buổi họp&rdquo; để lưu biên bản, recap và đầu việc.</p>
                <button type="button" onClick={p.onAddSession}
                  className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2 text-xs font-bold hover:bg-[var(--border)] transition-colors">
                  + Thêm biên bản / lịch sử cuộc họp trước
                </button>
              </div>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-0.5">
                {p.meetingSessions.map((s, idx) => {
                  const host = s.host_id ? p.employeeMap.get(s.host_id) : null
                  const [y, m, d] = s.occurred_at.split('-')
                  const fmtDate = `${d}/${m}/${y}`
                  return (
                    <div key={s.id}
                      className={`rounded-xl border px-3.5 py-3 text-xs ${idx === 0 ? 'border-[var(--success)]/30 bg-[var(--success-soft)]' : 'border-[var(--border)] bg-[var(--bg-surface)]'}`}>
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="font-extrabold text-[var(--text-primary)]">{fmtDate}</span>
                        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${SESSION_STATUS_CLS[s.status]}`}>{SESSION_STATUS_LABEL[s.status]}</span>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-0.5 mb-2">
                        {host && <span className="text-[var(--text-muted)]">Chủ trì: <b className="text-[var(--text-secondary)]">{host.full_name}</b></span>}
                        <span className="text-[var(--text-muted)]">Biên bản: <b className={s.minutes_url ? 'text-[var(--success)]' : 'text-[var(--text-muted)] font-normal italic'}>{s.minutes_url ? 'Có' : 'Chưa có'}</b></span>
                        <span className="text-[var(--text-muted)]">Đầu việc: <b className="text-[var(--text-secondary)]">{(s.linked_task_ids || []).length}</b></span>
                        {(s.decisions || []).length > 0 && <span className="text-[var(--text-muted)]">Quyết định: <b className="text-[var(--text-secondary)]">{s.decisions.length}</b></span>}
                      </div>
                      {s.recap && <p className="mb-2 line-clamp-2 italic text-[var(--text-muted)]">{s.recap}</p>}
                      <div className="flex gap-2 flex-wrap">
                        <button type="button" onClick={() => p.onViewSession(s)}
                          className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-3 py-1.5 text-[11px] font-bold hover:bg-[var(--border)]">
                          Xem chi tiết
                        </button>
                        {s.minutes_url && (
                          <a href={s.minutes_url} target="_blank" rel="noreferrer"
                            className="rounded-lg border border-[var(--success)]/30 bg-[var(--success-soft)] px-3 py-1.5 text-[11px] font-bold text-[var(--success)] hover:opacity-80">
                            Mở biên bản →
                          </a>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

function MeetingPrepModal(p: {
  task: RecurringTask
  employeeMap: Map<string, Employee>
  updateTaskPatch: (taskId: string, patch: Partial<RecurringTask>) => Promise<void>
  close: () => void
}) {
  const [checklist, setChecklist] = useState<PrepChecklistItem[]>(p.task.preparation_checklist || [])
  const [newText, setNewText] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedCount, setSavedCount] = useState(0)

  async function save(next: PrepChecklistItem[]) {
    setSaving(true)
    await p.updateTaskPatch(p.task.id, { preparation_checklist: next })
    setSaving(false)
    setSavedCount((c) => c + 1)
  }

  async function toggleItem(id: string) {
    const next = checklist.map((item) => item.id === id ? { ...item, done: !item.done } : item)
    setChecklist(next)
    await save(next)
  }

  async function addItem() {
    const text = newText.trim()
    if (!text) return
    const next = [...checklist, { id: crypto.randomUUID(), text, done: false }]
    setChecklist(next)
    setNewText('')
    await save(next)
  }

  async function removeItem(id: string) {
    const next = checklist.filter((item) => item.id !== id)
    setChecklist(next)
    await save(next)
  }

  const done = checklist.filter((i) => i.done).length
  const allDone = checklist.length > 0 && done === checklist.length
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3" onClick={p.close}>
      <div className="w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl bg-[var(--bg-card)] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <div>
            <p className="font-display text-sm font-bold">Chuẩn bị họp</p>
            <p className="mt-0.5 text-xs text-[var(--text-muted)] truncate">{p.task.title}</p>
          </div>
          <button type="button" onClick={p.close} className="rounded-lg p-1.5 hover:bg-[var(--bg-surface)]"><Ico d={IC.x} size={16}/></button>
        </div>
        <div className="p-5 space-y-3">
          {/* Progress + save status */}
          <div className="flex items-center justify-between text-xs min-h-[18px]">
            <span className={`font-bold ${allDone ? 'text-[var(--success)]' : 'text-[var(--text-muted)]'}`}>
              {checklist.length === 0 ? 'Chưa có mục nào' : `Hoàn thành ${done}/${checklist.length}`}
            </span>
            <span className="text-[var(--text-muted)]">
              {saving ? 'Đang lưu...' : savedCount > 0 ? '✓ Đã lưu' : ''}
            </span>
          </div>
          <div className="space-y-1.5">
            {checklist.map((item) => (
              <div key={item.id} className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2">
                <button type="button" onClick={() => void toggleItem(item.id)}
                  className={`h-4 w-4 shrink-0 rounded border text-[10px] leading-[14px] text-center transition-colors ${item.done ? 'bg-[var(--success)] border-[var(--success)] text-white' : 'border-[var(--border-strong)] hover:border-[var(--success)]'}`}>
                  {item.done ? '✓' : ''}
                </button>
                <span className={`flex-1 text-xs ${item.done ? 'line-through text-[var(--text-muted)]' : 'text-[var(--text-primary)]'}`}>{item.text}</span>
                <button type="button" onClick={() => void removeItem(item.id)} className="shrink-0 text-[var(--text-muted)] hover:text-[var(--danger)]"><Ico d={IC.x} size={12}/></button>
              </div>
            ))}
            {checklist.length === 0 && (
              <p className="rounded-xl bg-[var(--bg-surface)] px-4 py-4 text-center text-xs text-[var(--text-muted)]">Chưa có mục nào. Thêm việc cần chuẩn bị bên dưới.</p>
            )}
          </div>
          <div className="flex gap-2">
            <input className="vyvy-input flex-1 text-sm" placeholder="Thêm mục chuẩn bị..." value={newText}
              onChange={(e) => setNewText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void addItem() } }}
            />
            <button type="button" onClick={() => void addItem()} className="vyvy-button text-sm px-4">Thêm</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function RescheduleMeetingModal(p: {
  task: RecurringTask
  now: Date
  meetingSessions: MeetingSession[]
  employeeMap: Map<string, Employee>
  currentEmployeeId: string | null
  updateTaskPatch: (taskId: string, patch: Partial<RecurringTask>) => Promise<void>
  onSessionSaved: () => Promise<void>
  close: () => void
}) {
  const occ = nextOccurrence(p.task, p.now)
  const occStr = occ.toISOString().slice(0, 10)

  // Existing rescheduled session for this occurrence (if any)
  const existingSession = p.meetingSessions.find(
    (s) => s.original_occurred_at === occStr && s.occurred_at !== occStr
  ) || null

  const [scope, setScope] = useState<'single' | 'recurring'>('single')
  const [newDate, setNewDate] = useState(existingSession?.occurred_at ?? occStr)
  const [newTime, setNewTime] = useState(
    existingSession?.start_time?.slice(0, 5) ?? p.task.time_of_day?.slice(0, 5) ?? ''
  )
  const [reason, setReason] = useState(existingSession?.reschedule_reason ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Compute recipient list — use all available person fields
  const notifRecipients: string[] = []
  const addRecip = (...ids: (string | null | undefined)[]) => {
    ids.forEach(id => { if (id && !notifRecipients.includes(id)) notifRecipients.push(id) })
  }
  addRecip(p.task.host_id, p.task.assignee_id)
  ;(p.task.participant_ids || []).forEach(id => addRecip(id))
  ;(p.task.recipient_ids || []).forEach(id => addRecip(id))
  ;(p.task.observer_ids || []).forEach(id => addRecip(id))
  const hasNoRecipients = notifRecipients.filter(id => id !== p.currentEmployeeId).length === 0

  const [y, m, d] = occStr.split('-')
  const occLabel = `${d}/${m}/${y}`

  async function handleSave() {
    if (!newDate) { setError('Vui lòng chọn ngày mới.'); return }
    if (newDate === occStr && newTime === (p.task.time_of_day?.slice(0, 5) ?? '') && scope === 'single') {
      setError('Ngày/giờ mới phải khác ngày gốc.'); return
    }
    setSaving(true); setError(null)
    try {
      if (scope === 'single') {
        // Upsert meeting_sessions record for this occurrence
        const payload: Record<string, unknown> = {
          schedule_id: p.task.id,
          occurred_at: newDate,
          start_time: newTime || null,
          original_occurred_at: occStr,
          original_start_time: p.task.time_of_day || null,
          reschedule_reason: reason || null,
          rescheduled_by: p.currentEmployeeId || null,
          status: 'planned',
        }
        if (existingSession) {
          await supabase.from('meeting_sessions').update(payload).eq('id', existingSession.id)
        } else {
          await supabase.from('meeting_sessions').insert(payload)
        }

        // Notify all known people on this schedule
        const recipientIds: string[] = []
        const addR = (...ids: (string | null | undefined)[]) => {
          ids.forEach(id => { if (id && !recipientIds.includes(id)) recipientIds.push(id) })
        }
        addR(p.task.host_id, p.task.assignee_id)
        ;(p.task.participant_ids || []).forEach(id => addR(id))
        ;(p.task.recipient_ids || []).forEach(id => addR(id))
        ;(p.task.observer_ids || []).forEach(id => addR(id))
        const [ny, nm, nd] = newDate.split('-')
        const notifRows = recipientIds
          .filter((id) => id !== p.currentEmployeeId)
          .map((id) => ({
            recipient_id: id,
            type: 'meeting_rescheduled',
            title: `Lịch họp "${p.task.title}" đã dời`,
            body: `Dời từ ${occLabel} → ${nd}/${nm}/${ny}${reason ? ` · ${reason}` : ''}`,
            actor_id: p.currentEmployeeId,
          }))
        if (notifRows.length > 0) await pushNotify(notifRows)

        await p.onSessionSaved()
        p.close()
      } else {
        // Change recurring schedule
        if (!window.confirm(`Đổi lịch định kỳ "${p.task.title}" từ nay về sau? Tất cả buổi chưa tổ chức sẽ theo lịch mới.`)) {
          setSaving(false); return
        }
        // Compute new weekday from newDate
        const newDateObj = new Date(newDate + 'T12:00:00')
        const newWeekday = newDateObj.getDay()
        const newMonthDay = newDateObj.getDate()
        const patch: Partial<RecurringTask> = { time_of_day: newTime || p.task.time_of_day }
        if (p.task.frequency === 'weekly') patch.weekday = newWeekday
        if (p.task.frequency === 'monthly') patch.month_day = newMonthDay
        await p.updateTaskPatch(p.task.id, patch)
        p.close()
      }
    } catch {
      setError('Có lỗi khi lưu. Vui lòng thử lại.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3" onClick={p.close}>
      <div className="w-full max-w-md rounded-2xl bg-[var(--bg-card)] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <div>
            <p className="font-display text-sm font-bold">Dời cuộc họp</p>
            <p className="mt-0.5 text-xs text-[var(--text-muted)] truncate">{p.task.title}</p>
          </div>
          <button type="button" onClick={p.close} className="rounded-lg p-1.5 hover:bg-[var(--bg-surface)]"><Ico d={IC.x} size={16}/></button>
        </div>

        <div className="p-5 space-y-4">
          {/* Current info */}
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs space-y-1">
            <p className="font-bold text-amber-800">Lịch gốc buổi sắp tới</p>
            <p className="text-amber-700">Ngày: <b>{occLabel}</b></p>
            {p.task.time_of_day && <p className="text-amber-700">Giờ: <b>{p.task.time_of_day.slice(0, 5)}</b></p>}
          </div>

          {/* Scope selector */}
          <div className="space-y-2">
            <p className="text-xs font-bold text-[var(--text-secondary)]">Phạm vi dời</p>
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input type="radio" className="mt-0.5" checked={scope === 'single'} onChange={() => setScope('single')} />
              <div>
                <p className="text-xs font-bold">Chỉ dời buổi này</p>
                <p className="text-[10px] text-[var(--text-muted)]">Chỉ buổi ngày {occLabel} bị dời; các buổi sau không đổi.</p>
              </div>
            </label>
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input type="radio" className="mt-0.5" checked={scope === 'recurring'} onChange={() => setScope('recurring')} />
              <div>
                <p className="text-xs font-bold">Đổi lịch định kỳ từ nay về sau</p>
                <p className="text-[10px] text-[var(--text-muted)]">Cập nhật lịch {p.task.frequency === 'weekly' ? 'ngày trong tuần' : p.task.frequency === 'monthly' ? 'ngày trong tháng' : 'giờ'} cho toàn bộ lịch định kỳ.</p>
              </div>
            </label>
          </div>

          {/* New date + time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-[var(--text-secondary)] mb-1 block">Ngày mới *</label>
              <input type="date" className="vyvy-input w-full text-sm" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
            </div>
            <div>
              <label className="text-[10px] font-bold text-[var(--text-secondary)] mb-1 block">Giờ mới</label>
              <input type="time" className="vyvy-input w-full text-sm" value={newTime} onChange={(e) => setNewTime(e.target.value)} />
            </div>
          </div>

          {/* Reason */}
          {scope === 'single' && (
            <div>
              <label className="text-[10px] font-bold text-[var(--text-secondary)] mb-1 block">Lý do dời lịch</label>
              <textarea
                className="vyvy-input w-full text-sm resize-none"
                rows={3}
                placeholder="VD: Họp khẩn cần ưu tiên, phòng họp bận..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          )}

          {scope === 'single' && hasNoRecipients && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
              ⚠️ Cuộc họp chưa có chủ trì/người tham gia nên chưa gửi thông báo cho ai. Thêm chủ trì trong <b>Sửa lịch</b> để kích hoạt thông báo.
            </div>
          )}

          {error && <p className="text-xs text-[var(--danger)]">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={p.close}
              className="h-9 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-4 text-xs font-bold hover:bg-[var(--border)]">
              Huỷ
            </button>
            <button type="button" onClick={() => void handleSave()} disabled={saving}
              className="h-9 rounded-xl bg-amber-600 px-5 text-xs font-extrabold text-white hover:bg-amber-700 disabled:opacity-60">
              {saving ? 'Đang lưu...' : 'Xác nhận dời lịch'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function LinkTaskModal(p: {
  task: RecurringTask
  allTasks: Task[]
  updateTaskPatch: (taskId: string, patch: Partial<RecurringTask>) => Promise<void>
  close: () => void
}) {
  const [linked, setLinked] = useState<string[]>(p.task.related_task_ids || [])
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const filtered = p.allTasks.filter((t) => t.title.toLowerCase().includes(search.toLowerCase())).slice(0, 30)

  async function toggle(taskId: string) {
    const next = linked.includes(taskId) ? linked.filter((id) => id !== taskId) : [...linked, taskId]
    setLinked(next)
    setSaving(true)
    await p.updateTaskPatch(p.task.id, { related_task_ids: next })
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3" onClick={p.close}>
      <div className="w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl bg-[var(--bg-card)] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <div>
            <p className="font-display text-sm font-bold">Gắn đầu việc</p>
            <p className="mt-0.5 text-xs text-[var(--text-muted)] truncate">{p.task.title}</p>
          </div>
          <button type="button" onClick={p.close} className="rounded-lg p-1.5 hover:bg-[var(--bg-surface)]"><Ico d={IC.x} size={16}/></button>
        </div>
        <div className="p-5 space-y-3">
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
            <span>Đã gắn: {linked.length} đầu việc</span>
            {saving && <span>Đang lưu...</span>}
          </div>
          <input className="vyvy-input w-full text-sm" placeholder="Tìm đầu việc..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {filtered.map((t) => {
              const on = linked.includes(t.id)
              return (
                <button key={t.id} type="button" onClick={() => void toggle(t.id)}
                  className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-colors ${on ? 'border-[var(--accent)] bg-[var(--accent-soft)] font-semibold' : 'border-[var(--border)] hover:bg-[var(--bg-surface)]'}`}>
                  <span className={`h-3.5 w-3.5 shrink-0 rounded border text-center text-[10px] leading-[14px] ${on ? 'bg-[var(--olive)] border-[var(--olive)] text-white' : 'border-[var(--border-strong)]'}`}>{on ? '✓' : ''}</span>
                  <span className="truncate flex-1">{t.title}</span>
                  <span className="shrink-0 text-[var(--text-muted)]">{t.status}</span>
                </button>
              )
            })}
            {filtered.length === 0 && <p className="py-4 text-center text-xs text-[var(--text-muted)]">Không tìm thấy đầu việc.</p>}
          </div>
        </div>
      </div>
    </div>
  )
}

function RecurringView(props: {
  dbSetupNeeded: boolean
  tasks: RecurringTask[]
  allTasks: Task[]
  departments: Department[]
  now: Date
  employees: Employee[]
  employeeMap: Map<string, Employee>
  departmentMap: Map<string, Department>
  form: RecurringTaskForm
  setForm: React.Dispatch<React.SetStateAction<RecurringTaskForm>>
  saveTask: (event: React.FormEvent) => void
  editTask: (task: RecurringTask) => void
  resetForm: () => void
  toggleTask: (task: RecurringTask) => void
  deleteTask: (task: RecurringTask) => void
  updateTaskPatch: (taskId: string, patch: Partial<RecurringTask>) => Promise<void>
  meetingFiles: RecurringMeetingFile[]
  meetingSessions: MeetingSession[]
  onSessionSaved: () => Promise<void>
  selectedMeetingTaskId: string
  setSelectedMeetingTaskId: (taskId: string) => void
  meetingFileDrafts: Record<string, MeetingFileDraft>
  updateMeetingFileDraft: (taskId: string, patch: Partial<MeetingFileDraft>) => void
  saveMeetingLink: (task: RecurringTask) => void
  uploadMeetingFile: (task: RecurringTask, file?: File) => void
  deleteMeetingFile: (file: RecurringMeetingFile) => void
  uploadingMeetingFileFor: string
  currentEmployeeId?: string | null
}) {
  const [meetingArchiveOpen, setMeetingArchiveOpen] = useState(false)
  const [meetingArchiveQuery, setMeetingArchiveQuery] = useState('')
  const [detailTask, setDetailTask] = useState<RecurringTask | null>(null)
  const [prepTask, setPrepTask] = useState<RecurringTask | null>(null)
  const [linkTask, setLinkTask] = useState<RecurringTask | null>(null)
  const [openMenuTaskId, setOpenMenuTaskId] = useState<string | null>(null)
  const [addSessionTask, setAddSessionTask] = useState<RecurringTask | null>(null)
  const [viewSession, setViewSession] = useState<MeetingSession | null>(null)
  const [rescheduleTask, setRescheduleTask] = useState<RecurringTask | null>(null)

  const activeTasks = props.tasks.filter((task) => task.is_active)
  const upcoming = [...props.tasks].sort(
    (a, b) => nextOccurrence(a, props.now).getTime() - nextOccurrence(b, props.now).getTime()
  )

  // 4 stat counters
  const todayStr = props.now.toISOString().slice(0, 10)
  const todayTasks = activeTasks.filter((t) => nextOccurrence(t, props.now).toISOString().slice(0, 10) === todayStr)
  const within24h = activeTasks.filter((t) => minutesUntil(nextOccurrence(t, props.now), props.now) <= 24 * 60)
  const needPrep = activeTasks.filter((t) => ['chua_chuan_bi', 'dang_chuan_bi'].includes(getRecurringPrepStatus(t, props.now)))
  const overduePrep = activeTasks.filter((t) => getRecurringPrepStatus(t, props.now) === 'qua_han')

  const meetingTasks = upcoming.filter((task) => task.kind === 'meeting')
  const normalizedArchiveQuery = meetingArchiveQuery.trim().toLowerCase()
  const filteredMeetingTasks = normalizedArchiveQuery
    ? meetingTasks.filter((task) => {
      const parts = parseMeetingDescription(task.description)
      const fileText = props.meetingFiles
        .filter((file) => file.recurring_task_id === task.id)
        .map((file) => `${file.title || ''} ${file.file_name} ${file.note || ''}`)
        .join(' ')
      return `${task.title} ${parts.note} ${parts.recap} ${parts.prepFiles} ${parts.meetingHistory} ${fileText}`
        .toLowerCase()
        .includes(normalizedArchiveQuery)
    })
    : meetingTasks
  const selectedMeeting = filteredMeetingTasks.find((task) => task.id === props.selectedMeetingTaskId) ||
    filteredMeetingTasks[0] ||
    (!normalizedArchiveQuery ? meetingTasks[0] : null)
  const selectedMeetingParts = selectedMeeting ? parseMeetingDescription(selectedMeeting.description) : null
  const selectedMeetingFiles = selectedMeeting
    ? props.meetingFiles.filter((file) => file.recurring_task_id === selectedMeeting.id)
    : []
  const selectedMeetingDraft = selectedMeeting
    ? { ...DEFAULT_MEETING_FILE_DRAFT, ...(props.meetingFileDrafts[selectedMeeting.id] || {}) }
    : DEFAULT_MEETING_FILE_DRAFT
  const selectedMeetingHistory = selectedMeetingParts ? meetingTextLines(selectedMeetingParts.meetingHistory) : []
  const selectedMeetingPrepFiles = selectedMeetingParts ? meetingTextLines(selectedMeetingParts.prepFiles) : []

  return (
    <div className="space-y-4">
      {props.dbSetupNeeded && <DbSetupBanner />}

      {/* 4 stat cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard label="Họp hôm nay" value={todayTasks.length} icon={<Ico d={IC.clock} size={18}/>} tone="green" />
        <MetricCard label="Cần chuẩn bị" value={needPrep.length} icon={<Ico d={IC.warning} size={18}/>} tone="purple" />
        <MetricCard label="Sắp tới 24h" value={within24h.length} icon={<Ico d={IC.bell} size={18}/>} tone="blue" />
        <MetricCard label="Quá hạn chuẩn bị" value={overduePrep.length} icon={<Ico d={IC.alertCircle} size={18}/>} tone="red" />
      </div>

      <div className="grid grid-cols-1 gap-4">
        <Card>
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-extrabold">Lịch sắp tới</h3>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">Bây giờ: {formatOccurrence(props.now)}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {meetingTasks.length > 0 && (
                <button type="button" onClick={() => setMeetingArchiveOpen(true)}
                  className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-xs font-extrabold">
                  Tìm hồ sơ họp
                </button>
              )}
              <span className="rounded-full bg-[var(--bg-surface)] px-3 py-1 text-xs font-extrabold text-[var(--text-secondary)]">
                {props.tasks.length} lịch
              </span>
            </div>
          </div>

          {upcoming.length === 0 ? (
            <EmptyState title="Chưa có việc định kỳ" description="Tạo lịch họp, báo cáo hoặc việc lặp lại để hệ thống nhắc đúng giờ." />
          ) : (
            <div className="space-y-2">
              {upcoming.map((task) => {
                const occ = nextOccurrence(task, props.now)
                const alert = recurringAlertState(task, props.now)
                const prep = getRecurringPrepStatus(task, props.now)
                const checklist = task.preparation_checklist || []
                const taskMeetingFiles = props.meetingFiles.filter((f) => f.recurring_task_id === task.id)
                const filesCount = taskMeetingFiles.length
                const relatedCount = (task.related_task_ids || []).length
                const taskSessions = props.meetingSessions
                  .filter((s) => s.schedule_id === task.id)
                  .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
                const lastSession = taskSessions[0] || null
                const occStr = occ.toISOString().slice(0, 10)
                const rescheduledSession = taskSessions.find(
                  (s) => s.original_occurred_at === occStr && s.occurred_at !== occStr
                ) || null
                const displayOcc = rescheduledSession
                  ? new Date(rescheduledSession.occurred_at + 'T' + (rescheduledSession.start_time || task.time_of_day || '00:00'))
                  : occ
                const host = props.employeeMap.get(task.host_id || '')
                const deptIds = task.department_ids && task.department_ids.length > 0
                  ? task.department_ids
                  : task.department_id ? [task.department_id] : []
                const deptNames = deptIds.map((id) => props.departmentMap.get(id)?.name).filter(Boolean) as string[]
                const alertTone =
                  alert.tone === 'red' ? 'text-[var(--danger)]' :
                  alert.tone === 'amber' ? 'text-[var(--warning)]' : ''
                const menuOpen = openMenuTaskId === task.id
                const doneCnt = checklist.filter((c) => c.done).length
                return (
                  <div key={task.id}
                    className={`rounded-xl border p-3.5 transition-shadow hover:shadow-sm ${task.is_active ? 'border-[var(--border)] bg-[var(--bg-card)]' : 'border-[var(--border)] bg-[var(--bg-surface)] opacity-60'}`}>

                    {/* -- Dòng 1: tên + badges -- */}
                    <div className="flex flex-wrap items-start gap-1.5 mb-2">
                      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                        <h4 className="text-sm font-extrabold text-[var(--text-primary)] leading-snug">{task.title}</h4>
                        <span className="shrink-0 rounded-full bg-[var(--bg-surface)] border border-[var(--border)] px-2 py-0.5 text-[10px] font-bold text-[var(--text-secondary)]">{recurringKindLabel(task.kind)}</span>
                        <span className="shrink-0 rounded-full bg-[var(--bg-surface)] border border-[var(--border)] px-2 py-0.5 text-[10px] font-bold text-[var(--text-secondary)]">{recurringFrequencyLabel(task)}</span>
                        {!task.is_active && <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">Tạm tắt</span>}
                        {rescheduledSession && <span className="shrink-0 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">Đã dời lịch</span>}
                      </div>
                      {/* Badge trạng thái chuẩn bị */}
                      <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${PREP_STATUS_CLS[prep]}`}>{PREP_STATUS_LABEL[prep]}</span>
                    </div>

                    {/* ── Dòng 2: thời gian + chủ trì + phòng ban ── */}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] mb-2">
                      <span className="font-bold text-[var(--text-secondary)]">Tiếp theo: {formatOccurrence(displayOcc)}</span>
                      <span className={`font-bold ${alertTone || 'text-[var(--text-muted)]'}`}>Còn {formatTimeLeft(displayOcc, props.now)}</span>
                      {rescheduledSession && (
                        <span className="text-amber-600 font-bold">
                          Dời từ: {(() => { const [y,m,d] = occ.toISOString().slice(0,10).split('-'); return `${d}/${m}/${y}` })()}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] mb-2">
                      <span className="text-[var(--text-muted)]">Chủ trì: <b className={host ? 'text-[var(--text-secondary)]' : 'text-[var(--text-muted)] font-normal italic'}>{host ? host.full_name : 'Chưa có chủ trì'}</b></span>
                      <span className="text-[var(--text-muted)]">Phòng ban: {deptNames.length === 0
                        ? <b className="font-normal italic">Chưa có phòng ban</b>
                        : <b className="text-[var(--text-secondary)]">{deptNames.slice(0,2).join(', ')}{deptNames.length > 2 ? ` +${deptNames.length - 2}` : ''}</b>
                      }</span>
                    </div>

                    {/* ── Dòng 3: mục tiêu ── */}
                    <div className="mb-2.5 text-[11px]">
                      {task.objective
                        ? <p className="italic text-[var(--text-secondary)] leading-relaxed">{task.objective}</p>
                        : <p className="italic text-[var(--text-muted)]">Chưa có mục tiêu họp</p>
                      }
                    </div>

                    {/* ── Dòng 3b: lần họp trước ── */}
                    {task.kind === 'meeting' && (
                      <div className="mb-2.5 text-[11px]">
                        {lastSession ? (() => {
                          const [y, m, d] = lastSession.occurred_at.split('-')
                          return (
                            <button type="button" onClick={() => setViewSession(lastSession)}
                              className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-left hover:underline">
                              <span className="text-[var(--text-muted)]">Lần họp trước:</span>
                              <b className="text-[var(--text-secondary)]">{d}/{m}/{y}</b>
                              <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-bold ${SESSION_STATUS_CLS[lastSession.status]}`}>{SESSION_STATUS_LABEL[lastSession.status]}</span>
                              {lastSession.minutes_url && <span className="text-[var(--success)] font-bold">· Có biên bản</span>}
                              {(lastSession.linked_task_ids || []).length > 0 && <span className="text-[var(--text-muted)]">· {lastSession.linked_task_ids.length} đầu việc</span>}
                            </button>
                          )
                        })() : (
                          <button type="button" onClick={() => setAddSessionTask(task)}
                            className="text-[var(--text-muted)] hover:text-[var(--accent-hover)] hover:underline">
                            Chưa có cuộc họp trước · <span className="font-bold">+ Thêm</span>
                          </button>
                        )}
                      </div>
                    )}

                    {/* ── Dòng 4: badge hồ sơ + checklist + task ── */}
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {/* Checklist */}
                      {checklist.length > 0
                        ? <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${doneCnt === checklist.length ? 'border-[var(--success)]/30 bg-[var(--success-soft)] text-[var(--success)]' : 'border-[var(--warning)]/30 bg-[var(--warning-soft)] text-[var(--warning)]'}`}>Checklist {doneCnt}/{checklist.length}</span>
                        : <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--bg-surface)] px-2.5 py-0.5 text-[10px] font-bold text-[var(--text-muted)]">Chưa có checklist chuẩn bị</span>
                      }
                      {/* Hồ sơ */}
                      {task.kind === 'meeting' && (
                        filesCount > 0
                          ? <span className="inline-flex items-center gap-1 rounded-full border border-[var(--success)]/30 bg-[var(--success-soft)] px-2.5 py-0.5 text-[10px] font-bold text-[var(--success)]">Đã có biên bản · {filesCount} file</span>
                          : <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--bg-surface)] px-2.5 py-0.5 text-[10px] font-bold text-[var(--text-muted)]">Chưa có hồ sơ</span>
                      )}
                      {/* Đầu việc */}
                      {relatedCount > 0
                        ? <span className="inline-flex items-center gap-1 rounded-full border border-[var(--accent)]/30 bg-[var(--accent-soft)] px-2.5 py-0.5 text-[10px] font-bold text-[var(--accent-hover)]">Đã gắn {relatedCount} đầu việc</span>
                        : <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--bg-surface)] px-2.5 py-0.5 text-[10px] font-bold text-[var(--text-muted)]">Chưa gắn đầu việc</span>
                      }
                    </div>

                    {/* ── Nút thao tác: nhóm chính + nút ... nhóm phụ ── */}
                    <div className="flex items-center gap-1.5">
                      {/* Nhóm chính */}
                      <button type="button" onClick={() => setDetailTask(task)}
                        className="h-8 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 text-[11px] font-bold hover:bg-[var(--border)]">
                        Mở chi tiết
                      </button>
                      <button type="button" onClick={() => setPrepTask(task)}
                        className={`h-8 rounded-lg border px-3 text-[11px] font-bold transition-colors ${prep === 'qua_han' ? 'border-[var(--danger)]/30 bg-[var(--danger-soft)] text-[var(--danger)]' : prep === 'dang_chuan_bi' ? 'border-[var(--warning)]/30 bg-[var(--warning-soft)] text-[var(--warning)]' : 'border-[var(--border)] bg-[var(--bg-surface)] hover:bg-[var(--border)]'}`}>
                        Chuẩn bị họp
                      </button>

                      {/* Nhóm phụ — menu ... */}
                      <div className="relative ml-auto">
                        <button type="button"
                          onClick={() => setOpenMenuTaskId(menuOpen ? null : task.id)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--border)]"
                          title="Thêm thao tác">
                          <span className="text-sm leading-none tracking-widest">···</span>
                        </button>
                        {menuOpen && (
                          <>
                            <div className="fixed inset-0 z-30" onClick={() => setOpenMenuTaskId(null)} />
                            <div className="absolute right-0 top-9 z-40 min-w-[160px] rounded-xl border border-[var(--border)] bg-[var(--bg-card)] py-1 shadow-xl">
                              {task.kind === 'meeting' && (
                                <button type="button"
                                  onClick={() => { setOpenMenuTaskId(null); props.setSelectedMeetingTaskId(task.id); setMeetingArchiveOpen(true) }}
                                  className="flex w-full items-center gap-2 px-3.5 py-2 text-xs font-bold text-[var(--success)] hover:bg-[var(--bg-surface)]">
                                  Biên bản họp
                                </button>
                              )}
                              {task.kind === 'meeting' && (
                                <button type="button"
                                  onClick={() => { setOpenMenuTaskId(null); setRescheduleTask(task) }}
                                  className="flex w-full items-center gap-2 px-3.5 py-2 text-xs font-bold text-amber-700 hover:bg-[var(--bg-surface)]">
                                  Dời cuộc họp
                                </button>
                              )}
                              <button type="button"
                                onClick={() => { setOpenMenuTaskId(null); setLinkTask(task) }}
                                className="flex w-full items-center gap-2 px-3.5 py-2 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-surface)]">
                                Gắn đầu việc
                              </button>
                              <button type="button"
                                onClick={() => { setOpenMenuTaskId(null); props.editTask(task) }}
                                className="flex w-full items-center gap-2 px-3.5 py-2 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-surface)]">
                                Sửa lịch
                              </button>
                              <button type="button"
                                onClick={() => { setOpenMenuTaskId(null); props.toggleTask(task) }}
                                className="flex w-full items-center gap-2 px-3.5 py-2 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--bg-surface)]">
                                {task.is_active ? 'Tạm tắt định kỳ' : 'Bật lại định kỳ'}
                              </button>
                              <div className="mx-3 my-1 border-t border-[var(--border)]" />
                              <button type="button"
                                onClick={() => { setOpenMenuTaskId(null); if (window.confirm(`Xóa lịch "${task.title}"? Không thể hoàn tác.`)) props.deleteTask(task) }}
                                className="flex w-full items-center gap-2 px-3.5 py-2 text-xs font-bold text-[var(--danger)] hover:bg-[var(--danger-soft)]">
                                Xóa lịch này
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          {/* Empty state khi không có lịch nào */}
          {upcoming.length === 0 && (
            <div className="mt-2 rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg-surface)] px-6 py-10 text-center">
              <p className="text-sm font-extrabold text-[var(--text-primary)]">Chưa có lịch định kỳ nào</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">Tạo thêm lịch định kỳ để tự động nhắc họp, chuẩn bị hồ sơ và gắn đầu việc.</p>
              <button type="button" onClick={() => props.resetForm()}
                className="mt-4 h-9 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-5 text-xs font-bold hover:bg-[var(--border)]">
                + Tạo định kỳ
              </button>
            </div>
          )}
        </Card>
      </div>

      {/* Modal: Mở chi tiết */}
      {detailTask && (
        <ScheduleDetailModal
          task={detailTask}
          employeeMap={props.employeeMap}
          departmentMap={props.departmentMap}
          meetingFiles={props.meetingFiles.filter((f) => f.recurring_task_id === detailTask.id)}
          meetingSessions={[...props.meetingSessions.filter((s) => s.schedule_id === detailTask.id)].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))}
          relatedTasks={props.allTasks.filter((t) => (detailTask.related_task_ids || []).includes(t.id))}
          now={props.now}
          onAddSession={() => setAddSessionTask(detailTask)}
          onViewSession={(s) => setViewSession(s)}
          close={() => setDetailTask(null)}
        />
      )}

      {/* Modal: Chuẩn bị họp */}
      {prepTask && (
        <MeetingPrepModal
          task={prepTask}
          employeeMap={props.employeeMap}
          updateTaskPatch={props.updateTaskPatch}
          close={() => setPrepTask(null)}
        />
      )}

      {/* Modal: Gắn đầu việc */}
      {linkTask && (
        <LinkTaskModal
          task={linkTask}
          allTasks={props.allTasks}
          updateTaskPatch={props.updateTaskPatch}
          close={() => setLinkTask(null)}
        />
      )}

      {/* Modal: Dời cuộc họp */}
      {rescheduleTask && (
        <RescheduleMeetingModal
          task={rescheduleTask}
          now={props.now}
          meetingSessions={props.meetingSessions.filter((s) => s.schedule_id === rescheduleTask.id)}
          employeeMap={props.employeeMap}
          currentEmployeeId={props.currentEmployeeId ?? null}
          updateTaskPatch={props.updateTaskPatch}
          onSessionSaved={props.onSessionSaved}
          close={() => setRescheduleTask(null)}
        />
      )}

      {/* ───────── Hồ sơ họp (archive panel) ───────── */}
      {meetingArchiveOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30">
          <button type="button" className="flex-1" onClick={() => setMeetingArchiveOpen(false)} aria-label="Đóng hồ sơ họp" />
          <div className="h-full w-full max-w-full overflow-y-auto bg-[var(--bg-card)] p-4 shadow-2xl sm:max-w-[920px] sm:p-6">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-extrabold">Tìm hồ sơ họp</h3>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  Tìm lại recap, lịch sử họp và file đã lưu theo từng lịch họp định kỳ.
                </p>
              </div>
              <button type="button" onClick={() => setMeetingArchiveOpen(false)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--bg-surface)] text-[var(--text-primary)] hover:bg-[var(--border)]">
                <Ico d={IC.x} size={16}/>
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
              <div>
                <input
                  className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-3 text-sm outline-none focus:border-[var(--accent-hover)] focus:bg-[var(--bg-input)]"
                  placeholder="Tìm theo tên họp, recap, file..."
                  value={meetingArchiveQuery}
                  onChange={(event) => setMeetingArchiveQuery(event.target.value)}
                />

                <div className="mt-3 max-h-[calc(100vh-190px)] space-y-2 overflow-y-auto">
                  {filteredMeetingTasks.length === 0 ? (
                    <p className="rounded-xl bg-[var(--bg-surface)] px-3 py-3 text-sm text-[var(--text-secondary)]">Không tìm thấy hồ sơ họp phù hợp.</p>
                  ) : (
                    filteredMeetingTasks.map((task) => {
                      const active = selectedMeeting?.id === task.id
                      const filesCount = props.meetingFiles.filter((file) => file.recurring_task_id === task.id).length

                      return (
                        <button type="button"
                          key={task.id}
                          onClick={() => props.setSelectedMeetingTaskId(task.id)}
                          className={`w-full rounded-xl border px-3 py-2 text-left ${
                            active ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-[var(--border)] bg-[var(--bg-card)] hover:bg-[var(--bg-surface)]'
                          }`}
                        >
                          <p className="truncate text-sm font-extrabold">{task.title}</p>
                          <p className="mt-1 text-xs font-bold text-[var(--text-secondary)]">
                            {formatOccurrence(nextOccurrence(task, props.now))} · {filesCount} file/link
                          </p>
                        </button>
                      )
                    })
                  )}
                </div>
              </div>

              {!selectedMeeting || !selectedMeetingParts ? (
                <EmptyState title="Chưa chọn hồ sơ" description="Chọn một cuộc họp ở danh sách bên trái để xem." />
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-extrabold">{selectedMeeting.title}</h3>
                      <p className="mt-1 text-xs font-bold text-[var(--text-secondary)]">
                        {recurringFrequencyLabel(selectedMeeting)} · {selectedMeeting.time_of_day}
                      </p>
                    </div>
                    <button type="button"
                      onClick={() => props.editTask(selectedMeeting)}
                      className="rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-bold"
                    >
                      Cập nhật recap
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-3">
                      <p className="mb-2 text-xs font-extrabold uppercase text-[var(--text-muted)]">Lịch sử họp</p>
                      {selectedMeetingHistory.length === 0 ? (
                        <p className="text-sm text-[var(--text-secondary)]">Chưa có lịch sử họp.</p>
                      ) : (
                        <div className="max-h-44 space-y-2 overflow-y-auto">
                          {selectedMeetingHistory.map((line, index) => (
                            <p key={`${selectedMeeting.id}-archive-history-${index}`} className="rounded-lg bg-[var(--bg-card)] px-3 py-2 text-sm leading-5 text-[var(--text-secondary)]">
                              {line}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-3">
                      <p className="mb-2 text-xs font-extrabold uppercase text-[var(--text-muted)]">File cần chuẩn bị</p>
                      {selectedMeetingPrepFiles.length === 0 ? (
                        <p className="text-sm text-[var(--text-secondary)]">Chưa có danh sách file cần chuẩn bị.</p>
                      ) : (
                        <div className="max-h-44 space-y-2 overflow-y-auto">
                          {selectedMeetingPrepFiles.map((line, index) => (
                            <p key={`${selectedMeeting.id}-archive-prep-${index}`} className="rounded-lg bg-[var(--bg-card)] px-3 py-2 text-sm leading-5 text-[var(--text-secondary)]">
                              {line}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-3">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-extrabold">Lịch sử biên bản theo buổi</p>
                        <p className="mt-1 text-xs text-[var(--text-secondary)]">Mỗi buổi: ngày + tên · bấm để xem biên bản đã chốt.</p>
                      </div>
                      {isLocalRecurringTask(selectedMeeting) && (
                        <span className="rounded-full bg-[var(--warning-soft)] px-3 py-1 text-xs font-bold text-[var(--warning)]">
                          Cần lưu lịch trước
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 gap-2 lg:grid-cols-[150px_1fr]">
                      <input
                        type="date"
                        className="h-10 rounded-xl border border-[var(--border)] px-3 text-sm outline-none"
                        value={selectedMeetingDraft.meetingDate}
                        onChange={(event) => props.updateMeetingFileDraft(selectedMeeting.id, { meetingDate: event.target.value })}
                        aria-label="Ngày họp"
                      />
                      <Input
                        placeholder="Tên file/link"
                        value={selectedMeetingDraft.title}
                        onChange={(value) => props.updateMeetingFileDraft(selectedMeeting.id, { title: value })}
                      />
                    </div>

                    <div className="mt-2 grid grid-cols-1 gap-2 lg:grid-cols-[1fr_auto]">
                      <input
                        className="h-10 rounded-xl border border-[var(--border)] px-3 text-sm outline-none"
                        placeholder="Dán link Google Drive, Notex, Dashboard..."
                        value={selectedMeetingDraft.fileUrl}
                        onChange={(event) => props.updateMeetingFileDraft(selectedMeeting.id, { fileUrl: event.target.value })}
                      />
                      <button type="button"
                        onClick={() => props.saveMeetingLink(selectedMeeting)}
                        className="rounded-xl bg-[var(--bg-card)] px-4 py-2 text-sm font-extrabold text-[var(--text-primary)]"
                      >
                        Luu link
                      </button>
                    </div>

                    <textarea
                      className="mt-2 min-h-14 w-full rounded-xl border border-[var(--border)] p-3 text-sm outline-none"
                      placeholder="Ghi chú file..."
                      value={selectedMeetingDraft.note}
                      onChange={(event) => props.updateMeetingFileDraft(selectedMeeting.id, { note: event.target.value })}
                    />

                    <input
                      type="file"
                      onChange={(event) => props.uploadMeetingFile(selectedMeeting, event.target.files?.[0])}
                      className="mt-2 block w-full rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-3 text-sm"
                    />
                    {props.uploadingMeetingFileFor === selectedMeeting.id && (
                      <p className="mt-2 text-sm font-bold text-[var(--accent-hover)]">Đang upload file họp...</p>
                    )}

                    <div className="mt-4 space-y-2">
                      {selectedMeetingFiles.length === 0 ? (
                        <p className="rounded-xl bg-[var(--bg-surface)] px-3 py-3 text-sm text-[var(--text-secondary)]">Chưa có file/link họp nào.</p>
                      ) : (
                        [...selectedMeetingFiles].sort((a, b) => String(b.meeting_date || '').localeCompare(String(a.meeting_date || ''))).map((file) => (
                          <details key={file.id} className="overflow-hidden rounded-xl bg-[var(--bg-surface)]">
                            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-sm font-bold">
                              <span className="flex min-w-0 items-center gap-2">
                                <span className="shrink-0 rounded-md bg-[var(--bg-card)] px-2 py-0.5 font-mono text-[11px] text-[var(--text-secondary)]">{file.meeting_date || '—'}</span>
                                <span className="truncate text-[var(--text-primary)]">{file.title || file.file_name}</span>
                              </span>
                              <span className="shrink-0 text-xs text-[var(--text-muted)]">▾ Xem biên bản</span>
                            </summary>
                            <div className="border-t border-[var(--border)] px-3 py-2.5 text-xs text-[var(--text-secondary)]">
                              {file.note && <p className="mb-2 whitespace-pre-line leading-5 text-[var(--text-secondary)]">{file.note}</p>}
                              <p className="text-[var(--text-muted)]">{file.uploaded_by && props.employeeMap.get(file.uploaded_by) ? `Người lưu: ${props.employeeMap.get(file.uploaded_by)?.full_name} · ` : ''}{file.file_name}</p>
                              <div className="mt-2 flex gap-2">
                                <a href={file.file_url} target="_blank" rel="noreferrer" className="rounded-lg bg-[var(--bg-card)] px-3 py-1.5 text-xs font-bold text-[var(--text-primary)]">Mở biên bản đã chốt</a>
                                <button type="button" onClick={() => props.deleteMeetingFile(file)} className="rounded-lg bg-[var(--danger-soft)] px-3 py-1.5 text-xs font-bold text-[var(--danger)]">Xóa</button>
                              </div>
                            </div>
                          </details>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Modal: Thêm/sửa buổi họp trước */}
      {addSessionTask && (
        <AddMeetingSessionModal
          task={addSessionTask}
          employeeMap={props.employeeMap}
          departmentMap={props.departmentMap}
          allTasks={props.allTasks}
          existingSessions={props.meetingSessions.filter((s) => s.schedule_id === addSessionTask.id)}
          onSaved={async () => { await props.onSessionSaved(); setAddSessionTask(null) }}
          close={() => setAddSessionTask(null)}
        />
      )}

      {/* Modal: Xem chi tiết buổi họp trước */}
      {viewSession && (
        <MeetingSessionDetailModal
          session={viewSession}
          scheduleTitle={props.tasks.find((t) => t.id === viewSession.schedule_id)?.title || ''}
          employeeMap={props.employeeMap}
          departmentMap={props.departmentMap}
          allTasks={props.allTasks}
          close={() => setViewSession(null)}
          onEdit={() => {
            const task = props.tasks.find((t) => t.id === viewSession.schedule_id)
            if (task) { setAddSessionTask(task) }
            setViewSession(null)
          }}
        />
      )}
    </div>
  )
}


// --- AddMeetingSessionModal ---------------------------------------------------
function AddMeetingSessionModal(p: {
  task: RecurringTask
  employeeMap: Map<string, Employee>
  departmentMap: Map<string, Department>
  allTasks: Task[]
  existingSessions: MeetingSession[]
  onSaved: () => Promise<void>
  close: () => void
}) {
  const today = new Date().toISOString().slice(0, 10)
  const [occurredAt, setOccurredAt] = useState(today)
  const [recap, setRecap] = useState('')
  const [minutesUrl, setMinutesUrl] = useState('')
  const [notes, setNotes] = useState('')
  const [status, setStatus] = useState<MeetingSession['status']>('completed')
  const [decisions, setDecisions] = useState<{ text: string }[]>([])
  const [pendingIssues, setPendingIssues] = useState<{ text: string }[]>([])
  const [newDecision, setNewDecision] = useState('')
  const [newPending, setNewPending] = useState('')
  const [linkedTaskIds, setLinkedTaskIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [taskSearch, setTaskSearch] = useState('')

  const filteredTasks = p.allTasks.filter((t) =>
    t.title.toLowerCase().includes(taskSearch.toLowerCase()) && t.task_level !== 'workstream'
  ).slice(0, 20)

  function addDecision() {
    if (!newDecision.trim()) return
    setDecisions((prev) => [...prev, { text: newDecision.trim() }])
    setNewDecision('')
  }

  function addPending() {
    if (!newPending.trim()) return
    setPendingIssues((prev) => [...prev, { text: newPending.trim() }])
    setNewPending('')
  }

  async function handleSave() {
    if (!occurredAt) { return }
    setSaving(true)
    try {
      const payload = {
        schedule_id: p.task.id,
        title: `${p.task.title} - ${occurredAt}`,
        occurred_at: occurredAt,
        start_time: null,
        end_time: null,
        status,
        host_id: p.task.host_id || null,
        department_ids: p.task.department_ids || [],
        participant_ids: p.task.participant_ids || [],
        recap: recap.trim() || null,
        minutes_url: minutesUrl.trim() || null,
        minutes_file_id: null,
        decisions,
        pending_issues: pendingIssues,
        action_items: [],
        linked_task_ids: linkedTaskIds,
        prep_checklist_snapshot: p.task.preparation_checklist || [],
        prep_resources_snapshot: (p.task.prep_resources || []),
        notes: notes.trim() || null,
        created_by: null,
      }
      const { data: sessionRow, error } = await supabase
        .from('meeting_sessions')
        .insert(payload)
        .select('id')
        .single()
      if (error) {
        if (error.message?.includes('does not exist') || error.message?.includes('relation')) {
          toast('Bảng meeting_sessions chưa tồn tại. Chạy sql/007_meeting_sessions.sql trong Supabase SQL Editor.', 'warning')
        } else {
          toast('Lưu bị lỗi: ' + (error.message || 'unknown'), 'error')
        }
        setSaving(false)
        return
      }

      const sessionId = sessionRow?.id as string | undefined

      // Gắn meeting_session_id lên các tasks đã link
      if (sessionId && linkedTaskIds.length > 0) {
        await supabase.from('tasks').update({ meeting_session_id: sessionId }).in('id', linkedTaskIds)
      }

      // Nếu có link biên bản → tạo recurring_meeting_files record (backward compat + link session)
      const url = minutesUrl.trim()
      if (url && sessionId) {
        await supabase.from('recurring_meeting_files').insert({
          recurring_task_id: p.task.id,
          meeting_session_id: sessionId,
          meeting_date: occurredAt,
          title: `Biên bản ${p.task.title} - ${occurredAt}`,
          file_name: url,
          file_url: url,
          file_type: 'link',
          note: recap.trim() || null,
          uploaded_by: null,
        })
      }

      await p.onSaved()
      toast('Đã lưu buổi họp thành công.')
    } catch {
      toast('Lưu bị lỗi.', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3" onClick={p.close}>
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-[var(--bg-card)] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-card)] px-5 py-4">
          <div>
            <p className="font-display text-sm font-bold">Thêm lịch sử cuộc họp</p>
            <p className="mt-0.5 text-xs text-[var(--text-muted)] truncate">{p.task.title}</p>
          </div>
          <button type="button" onClick={p.close} className="rounded-lg p-1.5 hover:bg-[var(--bg-surface)]"><Ico d={IC.x} size={16}/></button>
        </div>
        <div className="p-5 space-y-4">
          {/* Ngày họp */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[var(--text-secondary)]">Ngày họp <span className="text-[var(--danger)]">*</span></label>
            <input type="date" className="vyvy-input w-full" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
            {p.existingSessions.some((s) => s.occurred_at === occurredAt) && (
              <p className="mt-1 text-[11px] text-[var(--warning)]">⚠ Đã có buổi họp ngày này. Thêm sẽ tạo bản ghi riêng.</p>
            )}
          </div>

          {/* Trạng thái */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[var(--text-secondary)]">Trạng thái</label>
            <select className="vyvy-input w-full" value={status} onChange={(e) => setStatus(e.target.value as MeetingSession['status'])}>
              <option value="completed">Đã họp</option>
              <option value="planned">Dự kiến</option>
              <option value="skipped">Bỏ qua</option>
              <option value="cancelled">Huỷ</option>
            </select>
          </div>

          {/* Recap */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[var(--text-secondary)]">Recap / tóm tắt buổi họp</label>
            <textarea className="vyvy-input w-full min-h-[80px]" placeholder="Tóm tắt nội dung họp, kết quả chính..." value={recap} onChange={(e) => setRecap(e.target.value)} />
          </div>

          {/* Link biên bản */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[var(--text-secondary)]">Link biên bản (Notex / Google Docs / Lark)</label>
            <input type="url" className="vyvy-input w-full" placeholder="https://..." value={minutesUrl} onChange={(e) => setMinutesUrl(e.target.value)} />
          </div>

          {/* Quyết định */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[var(--text-secondary)]">Quyết định đã chốt</label>
            <div className="space-y-1.5 mb-2">
              {decisions.map((d, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-xs">
                  <span className="flex-1">{d.text}</span>
                  <button type="button" onClick={() => setDecisions((prev) => prev.filter((_, j) => j !== i))} className="text-[var(--text-muted)] hover:text-[var(--danger)]"><Ico d={IC.x} size={12}/></button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input className="vyvy-input flex-1 text-sm" placeholder="Thêm quyết định..." value={newDecision}
                onChange={(e) => setNewDecision(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addDecision() } }} />
              <button type="button" onClick={addDecision} className="rounded-lg border border-[var(--border)] px-3 text-xs font-bold hover:bg-[var(--bg-surface)]">Thêm</button>
            </div>
          </div>

          {/* Vấn đề pending */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[var(--text-secondary)]">Vấn đề còn pending</label>
            <div className="space-y-1.5 mb-2">
              {pendingIssues.map((issue, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg border border-[var(--warning)]/30 bg-[var(--warning-soft)] px-3 py-2 text-xs">
                  <span className="flex-1">{issue.text}</span>
                  <button type="button" onClick={() => setPendingIssues((prev) => prev.filter((_, j) => j !== i))} className="text-[var(--text-muted)] hover:text-[var(--danger)]"><Ico d={IC.x} size={12}/></button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input className="vyvy-input flex-1 text-sm" placeholder="Vấn đề chưa giải quyết..." value={newPending}
                onChange={(e) => setNewPending(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addPending() } }} />
              <button type="button" onClick={addPending} className="rounded-lg border border-[var(--border)] px-3 text-xs font-bold hover:bg-[var(--bg-surface)]">Thêm</button>
            </div>
          </div>

          {/* Gắn đầu việc */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[var(--text-secondary)]">Gắn đầu việc từ buổi họp này</label>
            <input className="vyvy-input w-full text-sm mb-2" placeholder="Tìm đầu việc..." value={taskSearch} onChange={(e) => setTaskSearch(e.target.value)} />
            {taskSearch && (
              <div className="max-h-40 overflow-y-auto space-y-1 mb-2">
                {filteredTasks.map((t) => (
                  <button key={t.id} type="button"
                    onClick={() => setLinkedTaskIds((prev) => prev.includes(t.id) ? prev.filter((id) => id !== t.id) : [...prev, t.id])}
                    className={`w-full flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-colors ${linkedTaskIds.includes(t.id) ? 'border-[var(--accent)] bg-[var(--accent-soft)] font-bold' : 'border-[var(--border)] bg-[var(--bg-surface)]'}`}>
                    <span className={`h-3.5 w-3.5 shrink-0 rounded border text-center text-[10px] leading-[14px] ${linkedTaskIds.includes(t.id) ? 'bg-[var(--accent)] border-[var(--accent)] text-white' : 'border-[var(--border)]'}`}>{linkedTaskIds.includes(t.id) ? '✓' : ''}</span>
                    <span className="flex-1 truncate">{t.title}</span>
                  </button>
                ))}
              </div>
            )}
            {linkedTaskIds.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {linkedTaskIds.map((id) => {
                  const t = p.allTasks.find((x) => x.id === id)
                  return t ? (
                    <span key={id} className="inline-flex items-center gap-1 rounded-full border border-[var(--accent)]/30 bg-[var(--accent-soft)] px-2.5 py-0.5 text-[10px] font-bold text-[var(--accent-hover)]">
                      {t.title.slice(0, 30)}{t.title.length > 30 ? '...' : ''}
                      <button type="button" onClick={() => setLinkedTaskIds((prev) => prev.filter((i) => i !== id))} className="hover:text-[var(--danger)]"><Ico d={IC.x} size={10}/></button>
                    </span>
                  ) : null
                })}
              </div>
            )}
          </div>

          {/* Ghi chú */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-[var(--text-secondary)]">Ghi chú thêm</label>
            <textarea className="vyvy-input w-full min-h-[60px]" placeholder="Vấn đề còn pending, lưu ý tiếp theo..." value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <div className="sticky bottom-0 flex gap-2 border-t border-[var(--border)] bg-[var(--bg-card)] px-5 py-4">
          <button type="button" onClick={p.close} className="flex-1 rounded-xl border border-[var(--border)] py-2.5 text-sm font-bold hover:bg-[var(--bg-surface)]">Huỷ</button>
          <button type="button" disabled={!occurredAt || saving} onClick={() => void handleSave()}
            className="flex-1 rounded-xl bg-[var(--accent)] py-2.5 text-sm font-extrabold disabled:opacity-40 hover:bg-[var(--accent-hover)]">
            {saving ? 'Đang lưu...' : 'Lưu buổi họp'}
          </button>
        </div>
      </div>
    </div>
  )
}

// --- MeetingSessionDetailModal ------------------------------------------------
function MeetingSessionDetailModal(p: {
  session: MeetingSession
  scheduleTitle: string
  employeeMap: Map<string, Employee>
  departmentMap: Map<string, Department>
  allTasks: Task[]
  close: () => void
  onEdit: () => void
}) {
  const s = p.session
  const host = s.host_id ? p.employeeMap.get(s.host_id) : null
  const participants = (s.participant_ids || []).map((id) => p.employeeMap.get(id)?.full_name).filter(Boolean) as string[]
  const deptNames = (s.department_ids || []).map((id) => p.departmentMap.get(id)?.name).filter(Boolean) as string[]

  // Fetch tasks từ Supabase theo meeting_session_id (nguồn chuẩn) + fallback linked_task_ids
  const [sessionTasks, setSessionTasks] = useState<Task[]>([])
  const [tasksLoading, setTasksLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setTasksLoading(true)
      try {
        // Uu tiên: tasks có meeting_session_id = session.id
        const { data: bySessionId } = await supabase
          .from('tasks')
          .select('id,title,status,due_date,task_level,assignee_id,priority')
          .eq('meeting_session_id', s.id)
          .order('created_at')

        if (bySessionId && bySessionId.length > 0) {
          setSessionTasks(bySessionId as Task[])
        } else {
          // Fallback: dùng linked_task_ids (dữ liệu cũ trước khi có FK)
          const ids = s.linked_task_ids || []
          if (ids.length > 0) {
            const { data: byIds } = await supabase
              .from('tasks')
              .select('id,title,status,due_date,task_level,assignee_id,priority')
              .in('id', ids)
            setSessionTasks((byIds || []) as Task[])
          } else {
            // Cuối cùng fallback: filter từ allTasks (không cần fetch)
            setSessionTasks((s.linked_task_ids || []).map((id) => p.allTasks.find((t) => t.id === id)).filter(Boolean) as Task[])
          }
        }
      } catch {
        setSessionTasks((s.linked_task_ids || []).map((id) => p.allTasks.find((t) => t.id === id)).filter(Boolean) as Task[])
      } finally {
        setTasksLoading(false)
      }
    }
    void load()
  }, [s.id, s.linked_task_ids, p.allTasks])

  const fmtDate = (d: string) => {
    const [y, m, day] = d.split('-')
    return `${day}/${m}/${y}`
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3" onClick={p.close}>
      <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl bg-[var(--bg-card)] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-card)] px-5 py-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-display text-sm font-bold">{p.scheduleTitle} — {fmtDate(s.occurred_at)}</p>
              <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${SESSION_STATUS_CLS[s.status]}`}>{SESSION_STATUS_LABEL[s.status]}</span>
            </div>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">Ngày họp: {fmtDate(s.occurred_at)}{s.start_time ? ` · ${s.start_time}` : ''}</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={p.onEdit} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-bold hover:bg-[var(--bg-surface)]">Sửa</button>
            <button type="button" onClick={p.close} className="rounded-lg p-1.5 hover:bg-[var(--bg-surface)]"><Ico d={IC.x} size={16}/></button>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {/* Thông tin buổi họp */}
          <section>
            <p className="mb-2.5 text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)]">Thông tin buổi họp</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 text-xs">
              <div><p className="text-[var(--text-muted)]">Chủ trì</p><p className="mt-0.5 font-bold text-[var(--text-primary)]">{host ? host.full_name : <span className="italic text-[var(--text-muted)]">Chưa có</span>}</p></div>
              <div><p className="text-[var(--text-muted)]">Phòng ban</p><p className="mt-0.5 font-bold text-[var(--text-primary)]">{deptNames.length > 0 ? deptNames.join(', ') : <span className="italic text-[var(--text-muted)]">Chưa có</span>}</p></div>
              {participants.length > 0 && <div className="col-span-2"><p className="text-[var(--text-muted)]">Tham gia</p><p className="mt-0.5 font-bold text-[var(--text-primary)]">{participants.join(', ')}</p></div>}
            </div>
          </section>

          {/* Recap */}
          {s.recap && (
            <section>
              <p className="mb-1 text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)]">Recap</p>
              <p className="whitespace-pre-line text-sm leading-relaxed text-[var(--text-secondary)]">{s.recap}</p>
            </section>
          )}

          {/* Link biên bản */}
          {s.minutes_url && (
            <section>
              <p className="mb-2 text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)]">Biên bản</p>
              <a href={s.minutes_url} target="_blank" rel="noreferrer"
                className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-3 hover:bg-[var(--border)] transition-colors">
                <span className="flex-1 text-xs font-bold text-[var(--text-primary)] truncate">{s.minutes_url}</span>
                <span className="shrink-0 text-[11px] font-bold text-[var(--accent-hover)]">Mở →</span>
              </a>
            </section>
          )}

          {/* Quyết định */}
          {s.decisions && s.decisions.length > 0 && (
            <section>
              <p className="mb-2 text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)]">Quyết định đã chốt ({s.decisions.length})</p>
              <div className="space-y-1.5">
                {s.decisions.map((d, i) => (
                  <div key={i} className="flex items-start gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-xs">
                    <span className="mt-0.5 h-4 w-4 shrink-0 rounded-full bg-[var(--accent-soft)] text-center text-[10px] font-bold leading-4 text-[var(--accent-hover)]">{i + 1}</span>
                    <span className="flex-1 text-[var(--text-primary)]">{d.text}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Vấn đề pending */}
          {s.pending_issues && s.pending_issues.length > 0 && (
            <section>
              <p className="mb-2 text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)]">Vấn đề còn pending ({s.pending_issues.length})</p>
              <div className="space-y-1.5">
                {s.pending_issues.map((issue, i) => (
                  <div key={i} className="flex items-start gap-2 rounded-lg border border-[var(--warning)]/30 bg-[var(--warning-soft)] px-3 py-2 text-xs">
                    <span className="mt-0.5 h-4 w-4 shrink-0 rounded-full bg-[var(--warning)]/20 text-center text-[10px] font-bold leading-4 text-[var(--warning)]">{i + 1}</span>
                    <span className="flex-1 text-[var(--text-primary)]">{issue.text}</span>
                    {issue.owner && <span className="shrink-0 text-[var(--text-muted)]">{issue.owner}</span>}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Đầu việc đã giao — fetch từ Supabase theo meeting_session_id */}
          <section>
            <p className="mb-2 text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)]">
              Đầu việc đã giao ({tasksLoading ? '...' : sessionTasks.length})
            </p>
            {tasksLoading ? (
              <p className="rounded-xl bg-[var(--bg-surface)] px-4 py-3 text-xs text-[var(--text-muted)]">Đang tải...</p>
            ) : sessionTasks.length === 0 ? (
              <p className="rounded-xl bg-[var(--bg-surface)] px-4 py-3 text-xs italic text-[var(--text-muted)]">Chưa có đầu việc nào được gắn với buổi họp này.</p>
            ) : (
              <div className="space-y-1.5">
                {sessionTasks.map((t) => {
                  const assignee = t.assignee_id ? p.employeeMap.get(t.assignee_id) : null
                  return (
                    <div key={t.id} className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-xs">
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-[var(--text-primary)] truncate">{t.title}</p>
                        {assignee && <p className="mt-0.5 text-[var(--text-muted)]">{assignee.full_name}</p>}
                      </div>
                      <span className="shrink-0 rounded-full bg-[var(--bg-card)] px-2 py-0.5 text-[10px] text-[var(--text-muted)]">{t.status}</span>
                      {t.due_date && <span className="shrink-0 text-[var(--text-muted)]">{t.due_date}</span>}
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {/* Ghi chú */}
          {s.notes && (
            <section>
              <p className="mb-1 text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)]">Ghi chú</p>
              <p className="whitespace-pre-line text-sm leading-relaxed text-[var(--text-secondary)]">{s.notes}</p>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}

function AutomationView(props: {
  dbSetupNeeded: boolean
  tasks: RecurringTask[]
  runs: RecurringRun[]
  now: Date
  result: RecurringRunResult | null
  running: boolean
  runWorker: () => void
  digestRunning: boolean
  digestResult: (RecurringRunResult & { dueTodayCount?: number; overdueCount?: number; overdueMarkedProblem?: number }) | null
  runDigest: () => void
}) {
  const activeTasks = props.tasks.filter((task) => task.is_active)
  const nextTask = [...activeTasks].sort(
    (a, b) => nextOccurrence(a, props.now).getTime() - nextOccurrence(b, props.now).getTime()
  )[0]
  const lastRun = props.runs[0]

  function runSourceLabel(source: string) {
    if (source === 'cron') return 'Tự động'
    if (source === 'manual') return 'Bấm kiểm tra'
    return 'Trong app'
  }

  function runStatusLabel(status: string) {
    if (status === 'success') return 'Hoàn tất'
    if (status === 'running') return 'Đang chạy'
    return 'Lỗi'
  }

  function runCount(run: RecurringRun, key: 'scanned' | 'notificationsSent') {
    if (key === 'scanned') return run.scanned ?? run.detail?.scanned ?? 0
    return run.notifications_sent ?? run.detail?.notificationsSent ?? 0
  }

  return (
    <div className="space-y-6">
      {props.dbSetupNeeded && <DbSetupBanner />}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <MetricCard
          label="Lịch đang bật"
          value={activeTasks.length}
          icon={<Ico d={IC.clock} size={18}/>}
          tone="green"
        />
        <MetricCard
          label="Đã nhắc gần nhất"
          value={lastRun ? runCount(lastRun, 'notificationsSent') : 0}
          icon={<Ico d={IC.bell} size={18}/>}
          tone="blue"
        />
        <MetricCard
          label="Lần kiểm tra"
          value={props.runs.length}
          icon={<Ico d={IC.clipboard} size={18}/>}
          tone="purple"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[420px_1fr]">
        <Card>
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-extrabold">Bộ nhắc tự động</h3>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                {nextTask ? `Sắp tới sẽ theo dõi: ${nextTask.title}` : 'Chưa có lịch định kỳ đang bật.'}
              </p>
            </div>
            <span className="rounded-full bg-[var(--success-soft)] px-3 py-1 text-xs font-extrabold text-[var(--success)]">
              Đang bật
            </span>
          </div>

          <div className="space-y-3">
            <InfoPill label="Tự kiểm tra" value="5 phút/lần" />
            <InfoPill label="Lịch sắp tới" value={nextTask ? formatOccurrence(nextOccurrence(nextTask, props.now)) : 'Chưa có'} />
            <InfoPill
              label="Lần kiểm tra gần nhất"
              value={lastRun ? new Date(lastRun.started_at).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'Chưa có'}
            />
            <InfoPill label="Việc đang theo dõi" value={`${activeTasks.length} lịch`} />
          </div>

          <button type="button"
            onClick={props.runWorker}
            disabled={props.running}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--bg-card)] px-5 py-3 text-sm font-extrabold text-[var(--text-primary)] disabled:opacity-50"
          >
            <Ico d={IC.zap} size={15}/>
            {props.running ? 'Đang kiểm tra...' : 'Kiểm tra nhắc ngay'}
          </button>

          {props.result && (
            <div className={`mt-4 rounded-2xl border p-4 text-sm ${
              props.result.ok === false ? 'border-[var(--danger)]/20 bg-[var(--danger-soft)] text-[var(--danger)]' : 'border-[var(--accent)]/30 bg-[var(--success-soft)] text-[var(--success)]'
            }`}>
              <p className="font-extrabold">
                {props.result.ok === false ? 'Kiểm tra lỗi' : 'Kiểm tra xong'}
              </p>
              <p className="mt-1">
                Quét {props.result.scanned || 0} việc · gửi {props.result.notificationsSent || 0} thông báo
              </p>
              {props.result.error && <p className="mt-1">{props.result.error}</p>}
            </div>
          )}

          <div className="mt-6 border-t border-[var(--border)] pt-5">
            <h4 className="mb-1 text-sm font-extrabold">Tóm tắt buổi sáng</h4>
            <p className="mb-3 text-xs text-[var(--text-secondary)]">
              Tự gửi lúc 08:00 mỗi ngày — việc hôm nay &amp; việc đang trễ.
            </p>
            <div className="mb-3 space-y-2">
              <InfoPill label="Cron tự động" value="08:00 mỗi ngày" />
            </div>
            <button type="button"
              onClick={props.runDigest}
              disabled={props.digestRunning}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-5 py-3 text-sm font-extrabold text-[var(--text-primary)] hover:bg-[var(--bg-surface)] disabled:opacity-50"
            >
              <Ico d={IC.clipboard} size={15}/>
              {props.digestRunning ? 'Đang gửi tóm tắt...' : 'Gửi tóm tắt buổi sáng ngay'}
            </button>
            {props.digestResult && (
              <div className={`mt-3 rounded-2xl border p-3 text-sm ${
                props.digestResult.ok === false ? 'border-[var(--danger)]/20 bg-[var(--danger-soft)] text-[var(--danger)]' : 'border-[var(--accent)]/30 bg-[var(--success-soft)] text-[var(--success)]'
              }`}>
                <p className="font-extrabold">
                  {props.digestResult.ok === false ? 'Lỗi' : 'Đã gửi'}
                </p>
                <p className="mt-1">
                  Hôm nay: {props.digestResult.dueTodayCount || 0} việc ·
                  Trễ: {props.digestResult.overdueCount || 0} việc ·
                  Đánh dấu trễ: {props.digestResult.overdueMarkedProblem || 0} ·
                  Thông báo: {props.digestResult.notificationsSent || 0}
                </p>
                {props.digestResult.error && <p className="mt-1">{props.digestResult.error}</p>}
              </div>
            )}
          </div>
        </Card>

        <Card>
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-extrabold">Nhật ký nhắc tự động</h3>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">{props.runs.length} bản ghi gần nhất</p>
            </div>
          </div>

          {props.runs.length === 0 ? (
            <EmptyState title="Chưa có nhật ký" description="Khi hệ thống tự kiểm tra hoặc bạn bấm kiểm tra, kết quả sẽ nằm ở đây." />
          ) : (
            <div className="space-y-3">
              {props.runs.map((run) => {
                const isError = run.status === 'error'
                return (
                  <div key={run.id} className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <span className={`rounded-full px-3 py-1 text-xs font-extrabold ${
                            isError ? 'bg-[var(--danger-soft)] text-[var(--danger)]' : run.status === 'running' ? 'bg-[var(--warning-soft)] text-[var(--warning)]' : 'bg-[var(--success-soft)] text-[var(--success)]'
                          }`}>
                            {runStatusLabel(run.status)}
                          </span>
                          <span className="rounded-full bg-[var(--bg-surface)] px-3 py-1 text-xs font-bold text-[var(--text-secondary)]">
                            {runSourceLabel(run.source)}
                          </span>
                        </div>
                        <p className="text-sm font-extrabold">
                          {new Date(run.started_at).toLocaleString('vi-VN', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                        {run.detail?.error && <p className="mt-1 text-sm text-[var(--danger)]">{run.detail.error}</p>}
                      </div>

                      <div className="grid min-w-[220px] grid-cols-2 gap-2">
                        <MiniStat label="Quét" value={runCount(run, 'scanned')} />
                        <MiniStat label="Đã nhắc" value={runCount(run, 'notificationsSent')} />
                      </div>
                    </div>

                    {run.detail?.reminders && run.detail.reminders.length > 0 && (
                      <div className="mt-3 space-y-2 border-t border-[var(--border)] pt-3">
                        {run.detail.reminders.slice(0, 4).map((item, index) => (
                          <div key={`${run.id}-${index}`} className="rounded-xl bg-[var(--bg-surface)] px-3 py-2 text-sm">
                            <span className="font-bold">{item.title}</span>
                            <span className="text-[var(--text-secondary)]"> · {item.kind === 'near' ? 'nhắc gần' : 'nhắc sớm'}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

function AssistantView(props: {
  assistantOutput: string
  generateDailyReport: () => void
  generateFollowUpReport: () => void
  generatePendingApprovalReport: () => void
  generateRevisionReport: () => void
  generateMissingReportFileReport: () => void
  generatePeopleReport: () => void
  generateProjectReport: () => void
  tasks: Task[]
  projectCards: ProjectCard[]
  peopleReports: PeopleReport[]
  employees: Employee[]
  currentEmployee: Employee | null
}) {
  const reportButtons = [
    { label: 'Báo cáo COO hôm nay', action: props.generateDailyReport, className: 'bg-[var(--olive)] text-[var(--ivory)]' },
    { label: 'Việc cần hối thúc', action: props.generateFollowUpReport, className: 'bg-[var(--danger-soft)] text-[var(--danger)] border border-[var(--danger)]/30' },
    { label: 'Việc chờ duyệt', action: props.generatePendingApprovalReport, className: 'bg-[var(--warning-soft)] text-[var(--warning)] border border-[var(--warning)]/30' },
    { label: 'Việc cần làm lại', action: props.generateRevisionReport, className: 'bg-[var(--danger-soft)] text-[var(--danger)] border border-[var(--danger)]/30' },
    {
      label: 'Việc thiếu file/link báo cáo',
      action: props.generateMissingReportFileReport,
      className: 'bg-[var(--umber)] text-[var(--ivory)]',
    },
    { label: 'Báo cáo theo nhân sự', action: props.generatePeopleReport, className: 'bg-[var(--olive)] text-[var(--ivory)]' },
    { label: 'Báo cáo theo dự án', action: props.generateProjectReport, className: 'bg-[var(--paper)] text-[var(--char)] border border-[var(--hair)]' },
  ]

  return (
    <div className="flex flex-col gap-6">
      <CooAssistantPanel
        tasks={props.tasks}
        projectCards={props.projectCards}
        peopleReports={props.peopleReports}
        employees={props.employees}
        currentEmployee={props.currentEmployee}
        onDailyReport={props.generateDailyReport}
        onFollowUpReport={props.generateFollowUpReport}
        onPeopleReport={props.generatePeopleReport}
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
      <Card>
        <h3 className="text-lg font-extrabold">COO Assistant</h3>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Tạo báo cáo vận hành dạng text để copy gửi sếp.
        </p>

        <div className="mt-5 space-y-3">
          {reportButtons.map((button) => (
            <button type="button"
              key={button.label}
              onClick={button.action}
              className={`w-full rounded-xl px-4 py-3 text-sm font-extrabold ${button.className}`}
            >
              {button.label}
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-extrabold">Kết quả báo cáo</h3>
          {props.assistantOutput && (
            <button type="button"
              onClick={() => navigator.clipboard.writeText(props.assistantOutput)}
              className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-bold"
            >
              Copy
            </button>
          )}
        </div>

        {props.assistantOutput ? (
          <pre className="whitespace-pre-wrap rounded-2xl bg-[var(--bg-surface)] p-5 text-sm leading-7 text-[var(--text-secondary)]">
            {props.assistantOutput}
          </pre>
        ) : (
          <EmptyState title="Chưa có báo cáo" description="Bấm một nút bên trái để tạo báo cáo." />
        )}
      </Card>
      </div>
    </div>
  )
}

function CreatePanel(props: {
  open: boolean
  setOpen: (value: boolean) => void
  tab: 'project' | 'workstream'
  setTab: (value: 'project' | 'workstream') => void
  projects: Project[]
  departments: Department[]
  employees: Employee[]
  saving: boolean
  projectName: string
  setProjectName: (value: string) => void
  projectCode: string
  setProjectCode: (value: string) => void
  projectDesc: string
  setProjectDesc: (value: string) => void
  projectOwnerId: string
  setProjectOwnerId: (value: string) => void
  projectMemberIds: string[]
  setProjectMemberIds: (value: string[]) => void
  projectWatcherIds: string[]
  setProjectWatcherIds: (value: string[]) => void
  projectApproverIds: string[]
  setProjectApproverIds: (value: string[]) => void
  projectDepartmentId: string
  setProjectDepartmentId: (value: string) => void
  createProject: () => void
  workTitle: string
  setWorkTitle: (value: string) => void
  workDesc: string
  setWorkDesc: (value: string) => void
  workProjectId: string
  setWorkProjectId: (value: string) => void
  workDepartmentId: string
  setWorkDepartmentId: (value: string) => void
  workHeadId: string
  setWorkHeadId: (value: string) => void
  workHeadIds: string[]
  setWorkHeadIds: (ids: string[]) => void
  workAssigneeId: string
  setWorkAssigneeId: (value: string) => void
  workCoOwnerIds: string[]
  setWorkCoOwnerIds: (value: string[]) => void
  workSupporterIds: string[]
  setWorkSupporterIds: (value: string[]) => void
  workApproverIds: string[]
  setWorkApproverIds: (value: string[]) => void
  workDueDate: string
  setWorkDueDate: (value: string) => void
  workPriority: string
  setWorkPriority: (value: string) => void
  createWorkstream: () => void
}) {
  if (!props.open) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30">
      <button type="button" className="flex-1" onClick={() => props.setOpen(false)} />
      <div className="h-full w-full max-w-full overflow-y-auto bg-[var(--bg-card)] p-4 shadow-2xl sm:max-w-[520px] sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-extrabold">{props.tab === 'project' ? 'Tạo dự án' : 'Tạo đầu việc lớn'}</h3>
          <button type="button" onClick={() => props.setOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--bg-surface)] text-[var(--text-primary)] hover:bg-[var(--border)]"><Ico d={IC.x} size={16}/>
          </button>
        </div>

        <div className="mb-4 grid grid-cols-2 rounded-xl bg-[var(--bg-surface)] p-1">
          <button type="button"
            onClick={() => props.setTab('project')}
            className={`rounded-lg py-2 text-sm font-bold ${props.tab === 'project' ? 'bg-[var(--bg-card)] shadow' : ''}`}
          >
            + Dự án
          </button>
          <button type="button"
            onClick={() => props.setTab('workstream')}
            className={`rounded-lg py-2 text-sm font-bold ${props.tab === 'workstream' ? 'bg-[var(--bg-card)] shadow' : ''}`}
          >
            + Đầu việc lớn
          </button>
        </div>

        {props.tab === 'project' && (
          <div className="space-y-3">
            <Input placeholder="Tên dự án" value={props.projectName} onChange={props.setProjectName} />
            <Input placeholder="Mã dự án (VD: VYVY-OS)" value={props.projectCode} onChange={props.setProjectCode} />
            <textarea
              rows={3}
              placeholder="Mô tả dự án — mục tiêu, phạm vi, ghi chú..."
              className="w-full resize-none rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 text-sm outline-none focus:border-[var(--accent-hover)]"
              value={props.projectDesc}
              onChange={(e) => props.setProjectDesc(e.target.value)}
            />

            <Select value={props.projectDepartmentId} onChange={props.setProjectDepartmentId}>
              <option value="">Chọn phòng ban chính</option>
              {props.departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </Select>

            <div>
              <label className="mb-1 block text-xs font-bold text-[var(--text-secondary)]">Chủ dự án</label>
              <PersonPicker
                value={props.projectOwnerId || null}
                employees={props.employees}
                onSave={(id) => props.setProjectOwnerId(id || '')}
                placeholder="Chưa chọn chủ dự án"
              />
            </div>
            <MultiPersonField
              label="Thành viên dự án"
              ids={props.projectMemberIds}
              employees={props.employees}
              onSave={props.setProjectMemberIds}
              placeholder="Chọn nhiều người tham gia"
            />
            <MultiPersonField
              label="Người theo dõi"
              ids={props.projectWatcherIds}
              employees={props.employees}
              onSave={props.setProjectWatcherIds}
              placeholder="Chọn người theo dõi"
            />
            <MultiPersonField
              label="Người duyệt dự án"
              ids={props.projectApproverIds}
              employees={props.employees}
              onSave={props.setProjectApproverIds}
              placeholder="Chọn người duyệt"
            />

            <button type="button"
              onClick={props.createProject}
              disabled={props.saving}
              className="w-full rounded-xl bg-[var(--accent-hover)] px-4 py-3 text-sm font-extrabold text-[var(--text-primary)] disabled:opacity-50"
            >
              {props.saving ? 'Đang tạo...' : 'Tạo dự án'}
            </button>
          </div>
        )}

        {props.tab === 'workstream' && (
          <div className="space-y-3">
            <Input placeholder="Tên đầu việc lớn" value={props.workTitle} onChange={props.setWorkTitle} />
            <textarea
              rows={3}
              placeholder="Mô tả — mục tiêu, yêu cầu đầu ra, tiêu chí hoàn thành..."
              className="w-full resize-none rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3 text-sm outline-none focus:border-[var(--accent-hover)]"
              value={props.workDesc}
              onChange={(e) => props.setWorkDesc(e.target.value)}
            />

            <input
              type="date"
              className="h-12 w-full rounded-2xl border border-[var(--border)] px-4 text-sm outline-none"
              value={props.workDueDate}
              onChange={(event) => props.setWorkDueDate(event.target.value)}
            />

            <Select value={props.workProjectId} onChange={props.setWorkProjectId}>
              <option value="">Chọn dự án</option>
              {props.projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </Select>

            <Select value={props.workDepartmentId} onChange={props.setWorkDepartmentId}>
              <option value="">Chọn phòng ban</option>
              {props.departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </Select>

            <div>
              <label className="mb-1 block text-xs font-bold text-[var(--text-secondary)]">Lead đầu việc lớn</label>
              <HeadPicker
                headIds={props.workHeadIds}
                employees={props.employees}
                onSave={(ids) => {
                  props.setWorkHeadIds(ids)
                  props.setWorkHeadId(ids[0] || '')
                }}
                placeholder="Chưa chọn lead"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold text-[var(--text-secondary)]">Người chịu trách nhiệm chính</label>
              <PersonPicker
                value={props.workAssigneeId || null}
                employees={props.employees}
                onSave={(id) => props.setWorkAssigneeId(id || '')}
                placeholder="Mặc định lấy lead nếu bỏ trống"
              />
            </div>
            <MultiPersonField
              label="Đồng phụ trách"
              ids={props.workCoOwnerIds}
              employees={props.employees}
              onSave={props.setWorkCoOwnerIds}
              placeholder="Chọn đồng phụ trách"
            />
            <MultiPersonField
              label="Người hỗ trợ"
              ids={props.workSupporterIds}
              employees={props.employees}
              onSave={props.setWorkSupporterIds}
              placeholder="Chọn người hỗ trợ"
            />
            <MultiPersonField
              label="Người duyệt / theo dõi"
              ids={props.workApproverIds}
              employees={props.employees}
              onSave={props.setWorkApproverIds}
              placeholder="Chọn người duyệt"
            />

            <Select value={props.workPriority} onChange={props.setWorkPriority}>
              <option value="low">Ưu tiên thấp</option>
              <option value="medium">Uu tiên trung bình</option>
              <option value="high">Uu tiên cao</option>
            </Select>

            <button type="button"
              onClick={props.createWorkstream}
              disabled={props.saving}
              className="w-full rounded-xl bg-[var(--bg-card)] px-4 py-3 text-sm font-extrabold text-[var(--text-primary)] disabled:opacity-50"
            >
              {props.saving ? 'Đang tạo...' : 'Tạo đầu việc lớn'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function ProjectEditModal(props: {
  project: Project
  employees: Employee[]
  departments: Department[]
  currentEmployee: Employee | null
  close: () => void
  onSaved: () => Promise<void>
}) {
  const { canFullEdit } = canEditProjectDetails(props.currentEmployee, props.project)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState(props.project.name)
  const [desc, setDesc] = useState(props.project.description || '')
  const [status, setStatus] = useState(props.project.status || 'active')
  const [priority, setPriority] = useState(props.project.priority || 'medium')
  const [ownerId, setOwnerId] = useState(props.project.owner_id || '')
  const [memberIds, setMemberIds] = useState<string[]>(idsWithout(props.project.member_ids || [], props.project.owner_id))
  const [watcherIds, setWatcherIds] = useState<string[]>(props.project.watcher_ids || [])
  const [approverIds, setApproverIds] = useState<string[]>(props.project.approver_ids || [])
  const [deptId, setDeptId] = useState(props.project.department_id || '')
  const [issueStatus, setIssueStatus] = useState(props.project.issue_status || 'normal')

  async function handleSave() {
    if (saving) return
    setSaving(true)
    try {
      const update: Record<string, unknown> = {
        status,
        issue_status: issueStatus,
      }
      if (canFullEdit) {
        update.name = name.trim() || props.project.name
        update.description = desc.trim() || null
        update.priority = priority
        update.owner_id = ownerId || null
        update.member_ids = uniqueIds(memberIds, ownerId ? [ownerId] : [])
        update.watcher_ids = watcherIds
        update.approver_ids = approverIds
        update.department_id = deptId || null
      }
      await supabase.from('projects').update(update).eq('id', props.project.id)
      await props.onSaved()
    } catch (e) {
      console.error('save project', e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={props.close}>
      <div className="w-full max-w-lg rounded-2xl bg-[var(--bg-card)] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
          <p className="font-display text-base font-bold text-[var(--text-primary)]">Sửa dự án</p>
          <button type="button" onClick={props.close} className="rounded-lg p-1.5 hover:bg-[var(--bg-surface)]">
            <Ico d={IC.x} size={16}/>
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4 space-y-4">
          {canFullEdit && (
            <label className="block">
              <span className="text-xs font-semibold text-[var(--text-secondary)]">Tên dự án</span>
              <input
                className="vyvy-input mt-1 w-full"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Tên dự án"
              />
            </label>
          )}
          {canFullEdit && (
            <label className="block">
              <span className="text-xs font-semibold text-[var(--text-secondary)]">Mô tả</span>
              <textarea
                className="vyvy-input mt-1 w-full resize-none"
                rows={3}
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="Mô tả ngắn về dự án"
              />
            </label>
          )}
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-semibold text-[var(--text-secondary)]">Trạng thái</span>
              <select className="vyvy-input mt-1 w-full" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="active">Đang chạy</option>
                <option value="planning">Lên kế hoạch</option>
                <option value="on_hold">Tạm dừng</option>
                <option value="completed">Hoàn thành</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-[var(--text-secondary)]">Tình trạng rủi ro</span>
              <select className="vyvy-input mt-1 w-full" value={issueStatus} onChange={(e) => setIssueStatus(e.target.value)}>
                <option value="normal">Bình thường</option>
                <option value="at_risk">Có rủi ro</option>
                <option value="critical">Nghiêm trọng</option>
              </select>
            </label>
          </div>
          {canFullEdit && (
            <label className="block">
              <span className="text-xs font-semibold text-[var(--text-secondary)]">Uu tiên</span>
              <select className="vyvy-input mt-1 w-full" value={priority} onChange={(e) => setPriority(e.target.value)}>
                <option value="low">Thấp</option>
                <option value="medium">Trung bình</option>
                <option value="high">Cao</option>
                <option value="critical">Khẩn cấp</option>
              </select>
            </label>
          )}
          {canFullEdit && (
            <label className="block">
              <span className="text-xs font-semibold text-[var(--text-secondary)]">Ch? d? án</span>
              <select className="vyvy-input mt-1 w-full" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
                <option value="">— Chua gán —</option>
                {props.employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>{emp.full_name}</option>
                ))}
              </select>
            </label>
          )}
          {canFullEdit && (
            <MultiPersonField
              label="Thành viên dự án"
              ids={memberIds}
              employees={props.employees}
              onSave={setMemberIds}
              placeholder="Chọn thành viên"
            />
          )}
          {canFullEdit && (
            <MultiPersonField
              label="Người theo dõi"
              ids={watcherIds}
              employees={props.employees}
              onSave={setWatcherIds}
              placeholder="Chọn người theo dõi"
            />
          )}
          {canFullEdit && (
            <MultiPersonField
              label="Người duyệt dự án"
              ids={approverIds}
              employees={props.employees}
              onSave={setApproverIds}
              placeholder="Chọn người duyệt"
            />
          )}
          {canFullEdit && (
            <label className="block">
              <span className="text-xs font-semibold text-[var(--text-secondary)]">Phòng ban</span>
              <select className="vyvy-input mt-1 w-full" value={deptId} onChange={(e) => setDeptId(e.target.value)}>
                <option value="">— Không phân phòng —</option>
                {props.departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </label>
          )}
          {!canFullEdit && (
            <p className="rounded-xl bg-[var(--bg-surface)] px-4 py-3 text-xs text-[var(--text-muted)]">
              Bạn chỉ có thể chỉnh trạng thái và tình trạng rủi ro. Liên hệ quản lý để thay đổi các thông tin khác.
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-[var(--border)] px-5 py-4">
          <button type="button" onClick={props.close} className="vyvy-button-ghost text-sm">Hủy</button>
          <button type="button" onClick={handleSave} disabled={saving} className="vyvy-button text-sm disabled:opacity-50">
            {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
          </button>
        </div>
      </div>
    </div>
  )
}

function TaskDetailDrawer(props: {
  task: Task
  employeeMap: Map<string, Employee>
  departmentMap: Map<string, Department>
  projectMap: Map<string, Project>
  steps: TaskStep[]
  reports: TaskReport[]
  supporters: TaskSupporter[]
  close: () => void
  uploadTaskFile: (task: Task, file?: File) => void
  deleteTaskReport: (report: TaskReport) => void
  uploading: boolean
  getStatusLabel: (status: string) => string
  currentEmployee: Employee | null
  employees: Employee[]
  refreshTask?: () => void
}) {
  const head = props.employeeMap.get(props.task.head_id || '')
  const assignee = props.employeeMap.get(props.task.assignee_id || '')
  const headIds = taskHeadIds(props.task)
  const coOwnerIds = taskCoOwnerIds(props.task)
  const supporterIds = taskSupporterIds(props.task, props.supporters)
  const approverIds = taskApproverIds(props.task)
  const watcherIds = taskWatcherIds(props.task)
  const department = props.departmentMap.get(head?.department_id || assignee?.department_id || props.task.department_id || '')
  const project = props.projectMap.get(props.task.project_id || '')
  const progress = calculateTaskProgress(props.task, props.steps)

  const { canFullEdit, isOwner, canEdit } = canEditWorkItemDetails(
    props.currentEmployee ? { id: props.currentEmployee.id, role: props.currentEmployee.role } : null,
    props.task,
  )

  const [isEditing, setIsEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editTitle, setEditTitle] = useState(props.task.title)
  const [editDesc, setEditDesc] = useState(props.task.description || '')
  const [editStatus, setEditStatus] = useState(props.task.status)
  const [editIssueStatus, setEditIssueStatus] = useState(props.task.issue_status || 'normal')
  const [editPriority, setEditPriority] = useState(props.task.priority || 'medium')
  const [editProgress, setEditProgress] = useState<number>(props.task.progress_percent ?? 0)
  const [editAssigneeId, setEditAssigneeId] = useState(props.task.assignee_id || '')
  const [editHeadIds, setEditHeadIds] = useState<string[]>(
    (props.task.head_ids?.length ? props.task.head_ids : props.task.head_id ? [props.task.head_id] : [])
  )
  const [editCoOwnerIds, setEditCoOwnerIds] = useState<string[]>(coOwnerIds)
  const [editSupporterIds, setEditSupporterIds] = useState<string[]>(supporterIds)
  const [editApproverIds, setEditApproverIds] = useState<string[]>(approverIds)
  const [editWatcherIds, setEditWatcherIds] = useState<string[]>(watcherIds)

  function startEdit() {
    setEditTitle(props.task.title)
    setEditDesc(props.task.description || '')
    setEditStatus(props.task.status)
    setEditIssueStatus(props.task.issue_status || 'normal')
    setEditPriority(props.task.priority || 'medium')
    setEditProgress(props.task.progress_percent ?? 0)
    setEditAssigneeId(props.task.assignee_id || '')
    setEditHeadIds(props.task.head_ids?.length ? props.task.head_ids : props.task.head_id ? [props.task.head_id] : [])
    setEditCoOwnerIds(taskCoOwnerIds(props.task))
    setEditSupporterIds(taskSupporterIds(props.task, props.supporters))
    setEditApproverIds(taskApproverIds(props.task))
    setEditWatcherIds(taskWatcherIds(props.task))
    setIsEditing(true)
  }

  async function handleSave() {
    if (saving) return
    setSaving(true)
    try {
      const update: Record<string, unknown> = {
        status: editStatus,
        issue_status: editIssueStatus,
        progress_percent: editProgress,
      }
      if (canFullEdit) {
        update.title = editTitle.trim() || props.task.title
        update.description = editDesc.trim() || null
        update.priority = editPriority
        update.assignee_id = editAssigneeId || null
        update.head_id = editHeadIds[0] || null
        update.head_ids = editHeadIds.length > 0 ? editHeadIds : null
        update.co_owner_ids = idsWithout(editCoOwnerIds, editAssigneeId || null, ...editHeadIds)
        update.supporter_ids = idsWithout(editSupporterIds, editAssigneeId || null, ...editHeadIds)
        update.approver_ids = idsWithout(editApproverIds, editAssigneeId || null)
        update.reviewer_ids = idsWithout(editApproverIds, editAssigneeId || null)
        update.watcher_ids = idsWithout(editWatcherIds, editAssigneeId || null, ...editHeadIds)
      }
      await supabase.from('tasks').update(update).eq('id', props.task.id)
      setIsEditing(false)
      props.refreshTask?.()
    } catch (e) {
      console.error('save task detail', e)
    } finally {
      setSaving(false)
    }
  }

  const STATUS_OPTIONS = [
    { value: 'not_started', label: 'Chưa bắt đầu' },
    { value: 'in_progress', label: 'Đang làm' },
    { value: 'pending', label: 'Pending' },
    { value: 'completed', label: 'Hoàn thành' },
    { value: 'overdue', label: 'Trễ deadline' },
  ]
  const ISSUE_OPTIONS = [
    { value: 'normal', label: 'Ổn' },
    { value: 'watch', label: 'Cần theo dõi' },
    { value: 'slow', label: 'Đang chậm' },
    { value: 'problem', label: 'Có vấn đề' },
  ]
  const PRIORITY_OPTIONS = [
    { value: 'low', label: 'Thấp' },
    { value: 'medium', label: 'Trung bình' },
    { value: 'high', label: 'Cao' },
  ]
  const inputCls = 'vyvy-input w-full px-3 py-2 text-sm'

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30">
      <button type="button" className="flex-1" onClick={props.close} />
      <div className="vyvy-drawer-panel h-full w-full max-w-full overflow-y-auto p-4 sm:max-w-[560px] sm:p-6">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between gap-2">
          <h3 className="font-display text-lg">{isEditing ? 'Chỉnh sửa đầu việc' : 'Chi tiết vận hành'}</h3>
          <div className="flex items-center gap-2">
            {canEdit && !isEditing && (
              <button type="button" onClick={startEdit}
                className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--border)] transition-colors">
                Sửa chi tiết
              </button>
            )}
            <button type="button" onClick={props.close}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--bg-surface)] text-[var(--text-primary)] hover:bg-[var(--border)]">
              <Ico d={IC.x} size={16}/>
            </button>
          </div>
        </div>

        {isEditing ? (
          /* -- EDIT MODE -- */
          <div className="space-y-4">
            {canFullEdit && (
              <div>
                <label className="mb-1 block text-xs font-bold text-[var(--text-secondary)]">Tên đầu việc</label>
                <input className={inputCls} value={editTitle} onChange={e => setEditTitle(e.target.value)} placeholder="Tên đầu việc" />
              </div>
            )}
            {!canFullEdit && (
              <h2 className="text-xl font-extrabold">{props.task.title}</h2>
            )}
            {canFullEdit && (
              <div>
                <label className="mb-1 block text-xs font-bold text-[var(--text-secondary)]">Mô tả</label>
                <textarea className={inputCls} rows={3} value={editDesc}
                  onChange={e => setEditDesc(e.target.value)}
                  placeholder="Mô tả, mục tiêu, yêu cầu đầu ra..." />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-bold text-[var(--text-secondary)]">Trạng thái</label>
                <select className={inputCls} value={editStatus} onChange={e => setEditStatus(e.target.value)}>
                  {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-[var(--text-secondary)]">Health</label>
                <select className={inputCls} value={editIssueStatus} onChange={e => setEditIssueStatus(e.target.value)}>
                  {ISSUE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
            {canFullEdit && (
              <div>
                <label className="mb-1 block text-xs font-bold text-[var(--text-secondary)]">Mức ưu tiên</label>
                <select className={inputCls} value={editPriority} onChange={e => setEditPriority(e.target.value)}>
                  {PRIORITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="mb-1 block text-xs font-bold text-[var(--text-secondary)]">Tiến độ %</label>
              <input type="number" min={0} max={100} className={inputCls} value={editProgress}
                onChange={e => setEditProgress(Math.max(0, Math.min(100, Number(e.target.value))))} />
            </div>
            {canFullEdit && (
              <div>
                <label className="mb-1 block text-xs font-bold text-[var(--text-secondary)]">Lead / người giao việc</label>
                <HeadPicker headIds={editHeadIds} employees={props.employees}
                  onSave={setEditHeadIds} placeholder="Chưa chọn lead" />
              </div>
            )}
            {canFullEdit && (
              <div>
                <label className="mb-1 block text-xs font-bold text-[var(--text-secondary)]">Người chịu trách nhiệm chính</label>
                <PersonPicker value={editAssigneeId || null} employees={props.employees}
                  onSave={id => setEditAssigneeId(id || '')} placeholder="Chưa chọn người chính" />
              </div>
            )}
            {canFullEdit && (
              <MultiPersonField
                label="Đồng phụ trách"
                ids={editCoOwnerIds}
                employees={props.employees}
                onSave={setEditCoOwnerIds}
                placeholder="Chọn đồng phụ trách"
              />
            )}
            {canFullEdit && (
              <MultiPersonField
                label="Người hỗ trợ"
                ids={editSupporterIds}
                employees={props.employees}
                onSave={setEditSupporterIds}
                placeholder="Chọn người hỗ trợ"
              />
            )}
            {canFullEdit && (
              <MultiPersonField
                label="Người duyệt"
                ids={editApproverIds}
                employees={props.employees}
                onSave={setEditApproverIds}
                placeholder="Chọn người duyệt"
              />
            )}
            {canFullEdit && (
              <MultiPersonField
                label="Người theo dõi"
                ids={editWatcherIds}
                employees={props.employees}
                onSave={setEditWatcherIds}
                placeholder="Chọn người theo dõi"
              />
            )}
            {!isOwner && !canFullEdit && (
              <p className="rounded-xl bg-[var(--warning-soft)] p-3 text-xs text-[var(--warning)]">
                Bạn chỉ có thể cập nhật trạng thái và tiến độ.
              </p>
            )}
            <div className="flex gap-2 pt-2">
              <button type="button" onClick={handleSave} disabled={saving}
                className="vyvy-button-primary flex-1 disabled:opacity-40">
                {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
              </button>
              <button type="button" onClick={() => setIsEditing(false)} disabled={saving}
                className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-2 text-sm font-bold text-[var(--text-primary)]">
                Hủy
              </button>
            </div>
          </div>
        ) : (
          /* -- VIEW MODE -- */
          <div>
            <h2 className="text-2xl font-extrabold">{props.task.title}</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
              {props.task.description || 'Chưa có mô tả.'}
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              <StatusBadge status={props.task.status} label={props.getStatusLabel(props.task.status)} />
              <IssueBadge issueStatus={props.task.issue_status} />
            </div>

            <div className="mt-6 space-y-4">
              <InfoRow label="Dự án" value={project?.name || 'Chưa gắn'} />
              <InfoRow label="Phòng ban" value={department?.name || 'Chưa gắn'} />
              <div className="vyvy-card-muted p-4">
                <p className="mb-3 font-extrabold">Phân công &amp; trách nhiệm</p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <AssignmentRow label="Lead / giao việc" ids={headIds} employeeMap={props.employeeMap} />
                  <AssignmentRow label="Chịu trách nhiệm chính" ids={props.task.assignee_id ? [props.task.assignee_id] : []} employeeMap={props.employeeMap} />
                  <AssignmentRow label="Đồng phụ trách" ids={coOwnerIds} employeeMap={props.employeeMap} />
                  <AssignmentRow label="Người hỗ trợ" ids={supporterIds} employeeMap={props.employeeMap} />
                  <AssignmentRow label="Người duyệt" ids={approverIds} employeeMap={props.employeeMap} />
                  <AssignmentRow label="Theo dõi" ids={watcherIds} employeeMap={props.employeeMap} />
                </div>
              </div>
              <InfoRow label="Deadline" value={props.task.due_date || 'Chua có'} />
              <InfoRow label="Uu tiên" value={PRIORITY_OPTIONS.find(p => p.value === props.task.priority)?.label ?? (props.task.priority || 'Trung bình')} />

              {props.currentEmployee && (
                <div className="vyvy-card-muted p-4">
                  <p className="mb-3 font-extrabold">Deadline &amp; gia hạn</p>
                  <DeadlineBlock
                    task={props.task}
                    currentUser={{ id: props.currentEmployee.id, role: props.currentEmployee.role, department_id: props.currentEmployee.department_id }}
                    employees={props.employees}
                    deadlineStatus={getDeadlineStatus(props.task)}
                    statusLabel={DEADLINE_STATUS_LABEL[getDeadlineStatus(props.task)]}
                    sourceLabel={props.task.deadline_source ? DEADLINE_SOURCE_LABEL[props.task.deadline_source] : undefined}
                    canManage={canEditDeadlineDirect({ id: props.currentEmployee.id, role: props.currentEmployee.role, department_id: props.currentEmployee.department_id }, props.task, department?.id)}
                    needsEscalation={deadlineNeedsEscalation(props.task)}
                    soloMode={SOLO_PILOT_MODE}
                    onChanged={props.refreshTask}
                  />
                </div>
              )}

              <div>
                <div className="mb-2 flex justify-between text-sm">
                  <span className="font-bold">Tiến độ theo bước đã duyệt</span>
                  <span className="font-extrabold text-[var(--olive)]">{progress}%</span>
                </div>
                <ProgressBar value={progress} />
              </div>

              <div className="vyvy-card-muted p-4">
                <p className="mb-3 font-extrabold">File báo cáo cấp đầu việc</p>
                <input
                  type="file"
                  onChange={(event) => props.uploadTaskFile(props.task, event.target.files?.[0])}
                  className="vyvy-input block w-full p-3 text-sm"
                />
                {props.uploading && (
                  <p className="mt-2 text-sm font-bold text-[var(--accent-hover)]">Đang upload...</p>
                )}
                <div className="mt-4 space-y-2">
                  {props.reports.length === 0 ? (
                    <p className="text-sm text-[var(--text-secondary)]">Chua có file báo cáo.</p>
                  ) : (
                    props.reports.map((report) => (
                      <div key={report.id} className="flex items-center justify-between gap-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-card)] p-3">
                        <p className="truncate text-sm font-bold">{report.file_name}</p>
                        <div className="flex shrink-0 gap-2">
                          <a href={report.file_url} target="_blank" rel="noreferrer"
                            className="rounded-lg bg-[var(--bg-card)] px-3 py-2 text-xs font-bold text-[var(--text-primary)]">
                            Mở
                          </a>
                          <button type="button" onClick={() => props.deleteTaskReport(report)}
                            className="rounded-lg bg-[var(--danger-soft)] px-3 py-2 text-xs font-bold text-[var(--danger)]">
                            Xóa file
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-[var(--radius)] border border-[var(--warning)]/20 bg-[var(--warning-soft)] p-4 text-sm text-[var(--warning)]">
                <b>Gợi ý COO cần hỏi:</b> {buildFollowUpQuestion(props.task, head?.full_name)}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="vyvy-card p-5">{children}</div>
}

function MetricCard(props: {
  label: string
  value: number
  icon: React.ReactNode
  tone: 'blue' | 'green' | 'purple' | 'red'
}) {
  const toneMap = {
    blue:   'bg-[var(--bg-surface)] text-[var(--text-primary)]',
    green:  'bg-[var(--success-soft)] text-[var(--success)]',
    purple: 'bg-[var(--bg-surface)] text-[var(--text-secondary)]',
    red:    'bg-[var(--danger-soft)] text-[var(--danger)]',
  }
  const accentMap = {
    blue:   'before:bg-[var(--bg-card)]',
    green:  'before:bg-[var(--success)]',
    purple: 'before:bg-[var(--umber)]',
    red:    'before:bg-[var(--danger)]',
  }

  return (
    <div className={`vyvy-metric-card p-5 before:absolute before:left-0 before:top-0 before:h-full before:w-1 ${accentMap[props.tone]}`}>
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-bold text-[var(--text-secondary)]">{props.label}</p>
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${toneMap[props.tone]}`}>{props.icon}</span>
      </div>
      <p className="font-display mt-3 text-4xl tabular-nums text-[var(--text-primary)]">{props.value}</p>
    </div>
  )
}

function ProgressBar({ value, showLabel }: { value: number; showLabel?: boolean }) {
  const clamped = Math.max(0, Math.min(100, isNaN(value) ? 0 : value))
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 overflow-hidden rounded-full bg-[var(--border)]">
        <div
          className="progress-bar-fill h-full rounded-full bg-[var(--olive)] transition-[width] duration-500"
          style={{ width: `${clamped}%` }}
        />
      </div>
      {showLabel && <span className="text-xs font-semibold text-[var(--char)] w-8 text-right">{clamped}%</span>}
    </div>
  )
}

function MiniStat({ label, value, danger }: { label: string; value: number; danger?: boolean }) {
  return (
    <div className="rounded-xl bg-[var(--bg-surface)] p-2">
      <p className={`text-lg font-extrabold ${danger && value > 0 ? 'text-[var(--danger)]' : ''}`}>{value}</p>
      <p className="text-[11px] font-bold text-[var(--text-secondary)]">{label}</p>
    </div>
  )
}

function DashboardStepList(props: {
  title: string
  steps: TaskStep[]
  tasks: Task[]
  emptyText: string
  onTaskClick?: (task: Task) => void
}) {
  return (
    <div>
      <p className="mb-2 text-sm font-extrabold text-[var(--text-secondary)]">{props.title}</p>
      {props.steps.length === 0 ? (
        <p className="text-sm text-[var(--text-secondary)]">{props.emptyText}</p>
      ) : (
        <div className="space-y-2">
          {props.steps.map((step) => {
            const task = getTaskByStep(step, props.tasks)

            return (
              <button
                type="button"
                key={step.id}
                onClick={() => { if (task && props.onTaskClick) props.onTaskClick(task) }}
                className={`w-full rounded-xl bg-[var(--bg-surface)] p-3 text-left ${task && props.onTaskClick ? 'hover:bg-[var(--bg-surface)] cursor-pointer' : 'cursor-default'}`}
              >
                <p className="text-sm font-extrabold">{step.step_title}</p>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">{task?.title || 'Không rõ đầu việc cha'}</p>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status, label }: { status: string; label: string }) {
  const cls =
    status === 'completed'
      ? 'bg-[var(--success-soft)] text-[var(--success)]'
      : status === 'in_progress'
        ? 'bg-[var(--bg-surface)] text-[var(--text-secondary)]'
        : status === 'pending'
          ? 'bg-[var(--bg-surface)] text-[var(--text-secondary)]'
          : status === 'pending_approval'
            ? 'bg-[var(--warning-soft)] text-[var(--warning)]'
            : status === 'overdue'
              ? 'bg-[var(--danger-soft)] text-[var(--danger)]'
              : 'bg-[var(--bg-surface)] text-[var(--text-secondary)]'

  return <span className={`rounded-full px-3 py-1 text-xs font-extrabold ${cls}`}>{label}</span>
}

function IssueBadge({ issueStatus }: { issueStatus?: string | null }) {
  const value = issueStatus || 'normal'

  if (value === 'problem') {
    return <span className="rounded-full bg-[var(--danger-soft)] px-3 py-1 text-xs font-extrabold text-[var(--danger)]">Có vấn đề</span>
  }

  if (value === 'slow') {
    return <span className="rounded-full bg-[var(--warning-soft)] px-3 py-1 text-xs font-extrabold text-[var(--warning)]">Đang chậm</span>
  }

  if (value === 'watch') {
    return <span className="rounded-full bg-[var(--bg-surface)] px-3 py-1 text-xs font-extrabold text-[var(--text-secondary)]">Cần theo dõi</span>
  }

  return <span className="rounded-full bg-[var(--success-soft)] px-3 py-1 text-xs font-extrabold text-[var(--success)]">Ổn</span>
}

function ProjectHealthBadge({ health }: { health: ProjectHealth }) {
  const cls =
    health.level === 'problem'
      ? 'bg-[var(--danger-soft)] text-[var(--danger)]'
      : health.level === 'watch'
        ? 'bg-[var(--warning-soft)] text-[var(--warning)]'
        : health.level === 'normal'
          ? 'bg-[var(--success-soft)] text-[var(--success)]'
          : 'bg-[var(--bg-surface)] text-[var(--text-secondary)]'

  return <span className={`rounded-full px-3 py-1 text-xs font-extrabold ${cls}`}>{health.label}</span>
}

function ProjectHealthSummary({ health }: { health: ProjectHealth }) {
  const items = [
    { label: 'việc trễ', value: health.overdueTasks },
    { label: 'việc pending', value: health.pendingTasks },
    { label: 'việc có vấn đề', value: health.problemTasks },
    { label: 'việc đang chậm', value: health.slowTasks },
    { label: 'bước quá hạn', value: health.overdueSteps },
    { label: 'bước cần làm lại', value: health.revisionSteps },
    { label: 'bước chờ duyệt', value: health.pendingSteps },
    { label: 'yêu cầu hỗ trợ', value: health.supportRequests },
    { label: 'bước thiếu báo cáo', value: health.missingReports },
  ].filter((item) => item.value > 0)

  if (items.length === 0) {
    if (health.level === 'empty') {
      return <p className="text-sm text-[var(--text-secondary)]">Chưa có task triển khai.</p>
    }
    if (health.level === 'not_started') {
      return <p className="text-sm text-[var(--text-secondary)]">Có task nhưng chưa bắt đầu thực hiện.</p>
    }
    return <p className="text-sm text-[var(--text-secondary)]">Không có cảnh báo vận hành.</p>
  }

  return (
    <div className="space-y-1 text-sm text-[var(--text-secondary)]">
      {items.map((item) => (
        <p key={item.label}>
          + {item.value} {item.label}
        </p>
      ))}
    </div>
  )
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[var(--bg-surface)] px-3 py-2">
      <p className="text-[11px] font-bold uppercase text-[var(--text-muted)]">{label}</p>
      <p className="font-bold">{value}</p>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="mb-1 text-xs font-extrabold uppercase text-[var(--text-muted)]">{label}</p>
      <p className="font-bold">{value}</p>
    </div>
  )
}

function Avatar({ name, size }: { name: string; size?: 'sm' | 'md' }) {
  const dim = size === 'sm' ? 'h-7 w-7 text-xs' : 'h-9 w-9 text-sm'
  return (
    <div className={`flex ${dim} shrink-0 items-center justify-center rounded-full bg-[var(--bg-card)] font-extrabold text-[var(--text-primary)] ring-1 ring-[var(--border)]`}>
      {(name || 'U').slice(0, 1).toUpperCase()}
    </div>
  )
}

function AssignmentChips({
  ids,
  employeeMap,
  empty = 'Chưa gắn',
  max = 4,
}: {
  ids: string[]
  employeeMap: Map<string, Employee>
  empty?: string
  max?: number
}) {
  const people = uniqueIds(ids)
    .map((id) => employeeMap.get(id))
    .filter((employee): employee is Employee => Boolean(employee))
  if (people.length === 0) return <span className="text-[var(--text-muted)]">{empty}</span>
  const shown = people.slice(0, max)
  return (
    <div className="flex flex-wrap items-center gap-1">
      {shown.map((employee) => (
        <span key={employee.id} className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--bg-card)] px-2 py-0.5 text-[11px] font-bold text-[var(--text-secondary)]">
          <Avatar name={employee.full_name} size="sm" />
          {employee.full_name}
        </span>
      ))}
      {people.length > max && (
        <span className="rounded-full bg-[var(--bg-surface)] px-2 py-0.5 text-[11px] font-bold text-[var(--text-muted)]">+{people.length - max}</span>
      )}
    </div>
  )
}

function AssignmentRow({
  label,
  ids,
  employeeMap,
  empty,
}: {
  label: string
  ids: string[]
  employeeMap: Map<string, Employee>
  empty?: string
}) {
  return (
    <div>
      <p className="mb-1 text-xs font-extrabold uppercase text-[var(--text-muted)]">{label}</p>
      <AssignmentChips ids={ids} employeeMap={employeeMap} empty={empty} />
    </div>
  )
}

function MultiPersonField({
  label,
  ids,
  employees,
  onSave,
  placeholder,
}: {
  label: string
  ids: string[]
  employees: Employee[]
  onSave: (ids: string[]) => void
  placeholder?: string
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-bold text-[var(--text-secondary)]">{label}</label>
      <HeadPicker
        headIds={ids}
        employees={employees}
        onSave={onSave}
        placeholder={placeholder || `Chưa chọn ${label.toLowerCase()}`}
      />
    </div>
  )
}

function Input(props: {
  placeholder: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <input
      className="h-12 w-full rounded-2xl border border-[var(--border)] px-4 text-sm outline-none"
      placeholder={props.placeholder}
      value={props.value}
      onChange={(event) => props.onChange(event.target.value)}
    />
  )
}

function Select(props: {
  value: string
  onChange: (value: string) => void
  children: React.ReactNode
}) {
  return (
    <select
      className="h-12 w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] px-4 text-sm outline-none"
      value={props.value}
      onChange={(event) => props.onChange(event.target.value)}
    >
      {props.children}
    </select>
  )
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="vyvy-empty-state">
      <div className="vyvy-empty-mark" />
      <p className="font-display text-base">{title}</p>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">{description}</p>
    </div>
  )
}

function AccessDenied() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--danger-soft)] text-[var(--danger)]">
        <Shield size={28} />
      </div>
      <p className="text-lg font-semibold text-[var(--text-primary)]">Không có quyền truy cập</p>
      <p className="mt-2 text-sm text-[var(--text-muted)]">Liên hệ Admin để được cấp quyền.</p>
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="skeleton h-24 rounded-[var(--radius-lg)]" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="skeleton h-52 rounded-[var(--radius-lg)]" />
            <div className="skeleton h-52 rounded-[var(--radius-lg)]" />
          </div>
          <div className="skeleton h-64 rounded-[var(--radius-lg)]" />
        </div>
        <div className="space-y-4">
          <div className="skeleton h-40 rounded-[var(--radius-lg)]" />
          <div className="skeleton h-48 rounded-[var(--radius-lg)]" />
          <div className="skeleton h-36 rounded-[var(--radius-lg)]" />
        </div>
      </div>
    </div>
  )
}

function calculateTaskProgress(_task: Task, taskSteps: TaskStep[]) {
  if (taskSteps.length === 0) return 0
  const approved = taskSteps.filter((step) => step.approval_status === 'approved').length
  return Math.round((approved / taskSteps.length) * 100)
}

function calculateWorkstreamProgress(
  workstream: Task,
  tasksByParent: Map<string, Task[]>,
  stepsByTask: Map<string, TaskStep[]>
) {
  const subtasks = tasksByParent.get(workstream.id) || []

  if (subtasks.length === 0) {
    return calculateTaskProgress(workstream, stepsByTask.get(workstream.id) || [])
  }

  const total = subtasks.reduce((sum, subtask) => {
    return sum + calculateTaskProgress(subtask, stepsByTask.get(subtask.id) || [])
  }, 0)

  return Math.round(total / subtasks.length)
}

function calculateProjectProgress(
  workstreams: Task[],
  tasksByParent: Map<string, Task[]>,
  stepsByTask: Map<string, TaskStep[]>
) {
  if (workstreams.length === 0) return 0

  const total = workstreams.reduce((sum, workstream) => {
    return sum + calculateWorkstreamProgress(workstream, tasksByParent, stepsByTask)
  }, 0)

  const result = Math.round(total / workstreams.length)
  return isNaN(result) ? 0 : result
}

function calculateProjectHealth(
  projectId: string,
  tasks: Task[],
  steps: TaskStep[],
  stepsByTask: Map<string, TaskStep[]>
): ProjectHealth {
  const projectTasks = tasks.filter((task) => task.project_id === projectId)
  const projectTaskIds = new Set(projectTasks.map((task) => task.id))
  const projectSteps = steps.filter((step) => projectTaskIds.has(step.task_id))

  if (projectTasks.length === 0) {
    return {
      level: 'empty',
      label: 'Chưa khởi tạo',
      overdueTasks: 0,
      pendingTasks: 0,
      problemTasks: 0,
      slowTasks: 0,
      pendingSteps: 0,
      revisionSteps: 0,
      supportRequests: 0,
      missingReports: 0,
      overdueSteps: 0,
      missingDeadlineTasks: 0,
      totalWarnings: 0,
    }
  }

  const overdueTasks = projectTasks.filter((task) => isTaskOverdue(task)).length
  const pendingTasks = projectTasks.filter((task) => task.status === 'pending').length
  const problemTasks = projectTasks.filter((task) => task.issue_status === 'problem').length
  const slowTasks = projectTasks.filter((task) => isTaskSlow(task, stepsByTask.get(task.id) || [])).length
  const missingDeadlineTasks = projectTasks.filter((task) => !task.due_date && task.status !== 'completed').length
  const pendingSteps = getPendingApprovalSteps(projectSteps).length
  const revisionSteps = getRevisionSteps(projectSteps).length
  const supportRequests = projectSteps.filter((step) => Boolean(step.support_request?.trim())).length
  const missingReports = projectSteps.filter(isStepMissingReport).length
  const overdueSteps = projectSteps.filter((step) => isStepOverdue(step)).length

  const hasActivity = projectTasks.some((task) =>
    task.status === 'in_progress' ||
    task.status === 'completed' ||
    (task.progress_percent || 0) > 0 ||
    (stepsByTask.get(task.id) || []).some((step) =>
      step.is_done ||
      (step.approval_status && step.approval_status !== 'not_submitted') ||
      Boolean(step.report_file_url || step.report_link || step.note)
    )
  )
  const criticalWarnings = overdueTasks + problemTasks + overdueSteps
  const watchWarnings = pendingTasks + slowTasks + pendingSteps + revisionSteps + supportRequests + missingReports + (hasActivity ? missingDeadlineTasks : 0)
  const level: ProjectHealth['level'] =
    criticalWarnings >= 2 || problemTasks > 0
      ? 'problem'
      : criticalWarnings > 0 || watchWarnings > 0
        ? 'watch'
        : !hasActivity
          ? 'not_started'
          : 'normal'
  const label =
    level === 'problem' ? 'Nguy hiểm' :
    level === 'watch' ? 'Cần chú ý' :
    level === 'not_started' ? 'Chưa bắt đầu' :
    'Đang ổn'

  return {
    level,
    label,
    overdueTasks,
    pendingTasks,
    problemTasks,
    slowTasks,
    pendingSteps,
    revisionSteps,
    supportRequests,
    missingReports,
    overdueSteps,
    missingDeadlineTasks,
    totalWarnings: criticalWarnings + watchWarnings,
  }
}

// Đầu việc lớn = task_level 'workstream', hoặc task gốc không có cha (và không phải subtask)
function isWorkstream(task: Task) {
  if (task.task_level === 'workstream') return true
  return task.task_level !== 'subtask' && !task.parent_task_id
}

function isTaskOverdue(task: Task) {
  if (!task.due_date) return false
  if (task.status === 'completed') return false

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const due = new Date(task.due_date)
  due.setHours(0, 0, 0, 0)

  return due < today
}

// ── Deadline committed + gia hạn ────────────────────────────
type DeadlineStatus =
  | 'no_deadline'
  | 'committed'
  | 'due_soon'
  | 'due_today'
  | 'overdue'
  | 'extension_requested'
  | 'extension_approved'
  | 'extension_rejected'

const DEADLINE_STATUS_LABEL: Record<DeadlineStatus, string> = {
  no_deadline: 'Chua có deadline',
  committed: 'Đã chốt deadline',
  due_soon: 'Sắp tới hạn',
  due_today: 'Đến hạn hôm nay',
  overdue: 'Trễ hạn',
  extension_requested: 'Đang xin gia hạn',
  extension_approved: 'Gia hạn được duyệt',
  extension_rejected: 'Gia hạn bị từ chối',
}

const DEADLINE_SOURCE_LABEL: Record<string, string> = {
  meeting: 'Họp',
  manual: 'Giao trực tiếp',
  import: 'Import',
  project_milestone: 'Milestone',
}

// Trạng thái deadline để hiển thị: kết hợp trạng thái cam kết/gia hạn (lưu DB)
// với tính toán theo ngày (due_date = currentDeadline).
function getDeadlineStatus(task: Task): DeadlineStatus {
  const ds = task.deadline_status || ''
  // Đang xin gia hạn → ưu tiên hiển thị, trừ khi đã quá hạn nặng
  if (ds === 'extension_requested') return 'extension_requested'

  if (!task.due_date) return ds === 'no_deadline' || !ds ? 'no_deadline' : 'no_deadline'
  if (task.status === 'completed') return 'committed'

  const today = new Date(); today.setHours(0, 0, 0, 0)
  const due = new Date(task.due_date); due.setHours(0, 0, 0, 0)
  const diffDays = Math.round((due.getTime() - today.getTime()) / 86400000)

  if (diffDays < 0) return 'overdue'
  // Vừa bị từ chối gia hạn nhưng chưa quá hạn → hiển thị trạng thái bị từ chối
  if (ds === 'extension_rejected') return 'extension_rejected'
  if (diffDays === 0) return 'due_today'
  if (diffDays <= 3) return 'due_soon'
  if (ds === 'extension_approved') return 'extension_approved'
  return 'committed'
}

// Ai được sửa chi tiết đầu việc (title, desc, status, assignee, v.v.)
function canEditWorkItemDetails(
  user: { id: string; role?: string | null } | null,
  task: Task,
): { canFullEdit: boolean; isOwner: boolean; canEdit: boolean } {
  if (!user) return { canFullEdit: false, isOwner: false, canEdit: false }
  if (SOLO_PILOT_MODE) return { canFullEdit: true, isOwner: true, canEdit: true }
  const role = (user.role || '').toLowerCase()
  const canFullEdit =
    ['admin', 'ceo', 'coo', 'department_head'].includes(role) ||
    task.head_id === user.id ||
    (task.head_ids?.includes(user.id) ?? false) ||
    taskApproverIds(task).includes(user.id)
  const isOwner = task.assignee_id === user.id || taskCoOwnerIds(task).includes(user.id) || taskSupporterIds(task).includes(user.id)
  return { canFullEdit, isOwner, canEdit: canFullEdit || isOwner }
}

function canEditProjectDetails(
  user: { id: string; role?: string | null; department_id?: string | null } | null,
  project: Project,
): { canFullEdit: boolean; canEdit: boolean } {
  if (!user) return { canFullEdit: false, canEdit: false }
  if (SOLO_PILOT_MODE) return { canFullEdit: true, canEdit: true }
  const role = (user.role || '').toLowerCase()
  if (['admin', 'ceo', 'coo'].includes(role)) return { canFullEdit: true, canEdit: true }
  if (role === 'department_head') {
    if (project.department_id && user.department_id && project.department_id === user.department_id)
      return { canFullEdit: true, canEdit: true }
  }
  if (project.owner_id === user.id) return { canFullEdit: false, canEdit: true }
  return { canFullEdit: false, canEdit: false }
}

// Ai được sửa deadline trực tiếp / duyệt gia hạn.
function canEditDeadlineDirect(
  user: { id: string; role?: string | null; department_id?: string | null } | null,
  task: Task,
  taskDeptId?: string | null,
): boolean {
  if (!user) return false
  const role = (user.role || '').toLowerCase()
  if (['admin', 'ceo', 'coo'].includes(role)) return true
  if (task.head_id && task.head_id === user.id) return true // người giao việc
  if (role === 'department_head') {
    const dept = taskDeptId ?? task.department_id
    if (dept && user.department_id && dept === user.department_id) return true
  }
  return false
}

// Khuyến nghị escalate lên COO/CEO (chỉ cảnh báo, không hard-block).
function deadlineNeedsEscalation(task: Task, ownerOverdueCount = 0): boolean {
  const cnt = task.deadline_change_count || 0
  const prio = (task.priority || '').toLowerCase()
  if (cnt >= 2) return true                                   // sắp gia hạn lần 3+
  if (['high', 'critical', 'urgent', 'cao'].includes(prio)) return true
  if (task.task_level === 'workstream') return true           // milestone
  if (ownerOverdueCount >= 3) return true
  return false
}

// Task cần COO/quản lý chú ý vì deadline: đang xin gia hạn hoặc gia hạn bị từ chối.
function isDeadlineActionNeeded(task: Task): boolean {
  const ds = task.deadline_status || ''
  return ds === 'extension_requested' || ds === 'extension_rejected'
}

function isStepOverdue(step: TaskStep) {
  if (!step.due_date) return false
  if (step.approval_status === 'approved') return false

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const due = new Date(step.due_date)
  due.setHours(0, 0, 0, 0)

  return due < today
}

function isTaskSlow(task: Task, taskSteps: TaskStep[]) {
  if (task.status === 'completed') return false
  if (task.issue_status === 'slow') return true
  if (!task.due_date) return false

  const progress = calculateTaskProgress(task, taskSteps)

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const due = new Date(task.due_date)
  due.setHours(0, 0, 0, 0)

  const diffDays = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

  return diffDays <= 3 && progress < 70
}

function isTaskProblem(task: Task) {
  return task.issue_status === 'problem' || task.status === 'pending'
}

function getTaskByStep(step: TaskStep, tasks: Task[]) {
  return tasks.find((task) => task.id === step.task_id) || null
}

function getPendingApprovalSteps(steps: TaskStep[]) {
  return steps.filter(
    (step) =>
      step.approval_status === 'pending' ||
      step.department_approval_status === 'pending' ||
      step.coo_approval_status === 'pending' ||
      step.ceo_approval_status === 'pending'
  )
}

function getRevisionSteps(steps: TaskStep[]) {
  return steps.filter(
    (step) =>
      step.approval_status === 'revision' ||
      step.department_approval_status === 'revision' ||
      step.coo_approval_status === 'revision' ||
      step.ceo_approval_status === 'revision'
  )
}

function isStepMissingReport(step: TaskStep) {
  const status = step.approval_status || 'not_submitted'
  const hasReviewActivity =
    status === 'pending' ||
    status === 'revision' ||
    step.department_approval_status === 'pending' ||
    step.department_approval_status === 'revision' ||
    step.coo_approval_status === 'pending' ||
    step.coo_approval_status === 'revision' ||
    step.ceo_approval_status === 'pending' ||
    step.ceo_approval_status === 'revision' ||
    Boolean(step.submitted_at)

  if (!hasReviewActivity) return false
  if (status === 'approved') return false

  return !step.report_file_url && !step.report_link
}

function getMissingReportSteps(steps: TaskStep[]) {
  return steps.filter(isStepMissingReport)
}

function getDefaultDepartmentApprover(
  departmentId: string | null,
  departments: Department[],
  employees: Employee[]
) {
  const department = departments.find((item) => item.id === departmentId)
  const text = normalizeSearchText(`${department?.name || ''} ${department?.code || ''}`)

  if (matchesAny(text, ['marketing', 'ads', 'livestream', 'brand'])) {
    return findEmployeeId(employees, ['vu', 'vu']) || employees[0]?.id || ''
  }

  if (matchesAny(text, ['content', 'nội dung', 'noi dung'])) {
    return findEmployeeId(employees, ['nhung', 'nhung']) || findEmployeeId(employees, ['vu', 'vu']) || employees[0]?.id || ''
  }

  if (matchesAny(text, ['sales', 'cskh', 'customer', 'bán hàng', 'ban hang'])) {
    return findEmployeeId(employees, ['vy']) || employees[0]?.id || ''
  }

  if (matchesAny(text, ['r&d', 'rnd', 'product', 'sản phẩm', 'san pham', 'nghiên cứu', 'nghien cuu'])) {
    return findEmployeeId(employees, ['má hồng', 'ma hong']) || employees[0]?.id || ''
  }

  if (matchesAny(text, ['kế toán', 'ke toan', 'kho', 'finance', 'accounting'])) {
    return findEmployeeId(employees, ['thùy linh', 'thuy linh']) || employees[0]?.id || ''
  }

  if (matchesAny(text, ['ops', 'hr', 'admin', 'nhân sự', 'nhan su', 'vận hành', 'van hanh'])) {
    return getCooApprover(employees)
  }

  if (matchesAny(text, ['design', 'thiết kế', 'thiet ke'])) {
    return findEmployeeId(employees, ['nhi']) || employees[0]?.id || ''
  }

  return employees[0]?.id || ''
}

function getCooApprover(employees: Employee[]) {
  return (
    findEmployeeIdByRole(employees, ['coo']) ||
    findEmployeeIdByPosition(employees, ['coo', 'chief operating', 'ops', 'vận hành', 'van hanh']) ||
    findEmployeeId(employees, ['quang']) ||
    findEmployeeIdByRole(employees, ['admin']) ||
    employees[0]?.id ||
    ''
  )
}

function getCeoApprover(employees: Employee[]) {
  return (
    findEmployeeIdByRole(employees, ['ceo']) ||
    findEmployeeIdByPosition(employees, ['ceo', 'chief executive', 'giám đốc', 'giam doc']) ||
    findEmployeeId(employees, ['vy']) ||
    findEmployeeId(employees, ['phúc', 'phuc']) ||
    employees[0]?.id ||
    ''
  )
}

function findEmployeeId(employees: Employee[], names: string[]) {
  return employees.find((employee) => matchesAny(normalizeSearchText(employee.full_name), names))?.id || ''
}

function findEmployeeIdByPosition(employees: Employee[], positions: string[]) {
  return employees.find((employee) => matchesAny(normalizeSearchText(employee.position || ''), positions))?.id || ''
}

function findEmployeeIdByRole(employees: Employee[], roles: string[]) {
  return employees.find((employee) => matchesAny(normalizeSearchText(employee.role || ''), roles))?.id || ''
}

function employeeRoleLabel(employee: Employee) {
  const role = normalizeSearchText(employee.role || '')
  if (role === 'ceo') return 'CEO'
  if (role === 'coo') return 'COO'
  if (role === 'admin') return 'Admin'
  if (role === 'department_head') return 'Trưởng bộ phận'
  if (role === 'employee') return 'Nhân viên'
  return ''
}

function employeeSelectLabel(employee: Employee) {
  const title = employee.position?.trim() || employeeRoleLabel(employee)
  return title ? `${employee.full_name} - ${title}` : employee.full_name
}

function matchesAny(text: string, values: string[]) {
  return values.some((value) => text.includes(normalizeSearchText(value)))
}

function getApproveButtonLabel(stage: string) {
  if (stage === 'coo') return 'COO duyệt'
  if (stage === 'ceo') return 'CEO duyệt'
  return 'Trưởng bộ phận duyệt'
}

function getApprovalWaitingLabel(step: TaskStep) {
  const stage = step.approval_stage || 'department'
  if (stage === 'coo') return 'Chờ COO'
  if (stage === 'ceo') return 'Chờ CEO'
  return 'Chờ trưởng bộ phận'
}

function getRevisionRequesterLabel(step: TaskStep) {
  const stage = step.approval_stage || 'department'
  if (stage === 'coo') return 'COO yêu cầu làm lại'
  if (stage === 'ceo') return 'CEO yêu cầu làm lại'
  return 'Trưởng bộ phận yêu cầu làm lại'
}

function getRevisionNote(step: TaskStep) {
  const stage = step.approval_stage || 'department'
  if (stage === 'coo') return step.coo_approval_note || step.approval_note || ''
  if (stage === 'ceo') return step.ceo_approval_note || step.approval_note || ''
  return step.department_approval_note || step.approval_note || ''
}

function parseNotexText(text: string, departments: Department[], employees: Employee[]) {
  const rows: NotexRow[] = []
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  let currentWorkstream = 'Đầu việc từ Notex'
  let currentRow: NotexRow | null = null

  function pushCurrentRow() {
    if (!currentRow || !currentRow.subtaskTitle.trim()) return
    rows.push({
      ...currentRow,
      departmentId: currentRow.departmentId || guessDepartmentId(`${currentRow.subtaskTitle} ${currentRow.responsibility}`, departments),
      headId: currentRow.headId || currentRow.assigneeId || employees[0]?.id || '',
      assigneeId: currentRow.assigneeId || currentRow.headId || employees[0]?.id || '',
    })
  }

  lines.forEach((line, index) => {
    const workstreamMatch = line.match(/^\d+(?:\.\d+)+\.?\s*(.+)$/)
    const checkboxMatch = line.match(/^\[\s*\]\s*(.+)$/)
    const responsibilityMatch = line.match(/^trách nhiệm\s*:\s*(.+)$/i)
    const outputMatch = line.match(/^kết quả mong muốn\s*:\s*(.+)$/i)

    if (workstreamMatch) {
      pushCurrentRow()
      currentRow = null
      currentWorkstream = normalizeWorkstreamTitle(workstreamMatch[1])
      return
    }

    if (checkboxMatch) {
      pushCurrentRow()
      currentRow = {
        id: `notex-${index}-${checkboxMatch[1].slice(0, 24)}`,
        workstreamTitle: currentWorkstream,
        subtaskTitle: checkboxMatch[1].trim(),
        responsibility: '',
        expectedOutput: '',
        departmentId: guessDepartmentId(`${currentWorkstream} ${checkboxMatch[1]}`, departments),
        headId: employees[0]?.id || '',
        assigneeId: employees[0]?.id || '',
        coOwnerIds: [],
        supporterIds: [],
        reviewerIds: [],
        dueDate: '',
        priority: 'medium',
      }
      return
    }

    if (responsibilityMatch && currentRow) {
      const responsibility = responsibilityMatch[1].trim()
      const employeeIds = guessEmployeeIds(responsibility, employees)
      const employeeId = employeeIds[0] || ''
      currentRow = {
        ...currentRow,
        responsibility,
        departmentId: currentRow.departmentId || guessDepartmentId(responsibility, departments),
        headId: currentRow.headId || employeeId,
        assigneeId: employeeId || currentRow.assigneeId,
        coOwnerIds: employeeIds.slice(1),
      }
      return
    }

    if (outputMatch && currentRow) {
      currentRow = {
        ...currentRow,
        expectedOutput: outputMatch[1].trim(),
      }
    }
  })

  pushCurrentRow()
  return rows
}

function guessDepartmentId(text: string, departments: Department[]) {
  const normalizedText = normalizeSearchText(text)
  const match = departments.find((department) => {
    return (
      normalizedText.includes(normalizeSearchText(department.name)) ||
      normalizedText.includes(normalizeSearchText(department.code))
    )
  })

  return match?.id || departments[0]?.id || ''
}

function normalizeWorkstreamTitle(rawTitle: string) {
  return rawTitle.replace(/^\d+(?:\.\d+)+\.?\s*/, '').trim() || 'Đầu việc từ Notex'
}

function buildNotexDescription(row: NotexRow) {
  return [
    row.responsibility ? `Trách nhiệm: ${row.responsibility}` : '',
    row.expectedOutput ? `Kết quả mong muốn: ${row.expectedOutput}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

function guessEmployeeIds(text: string, employees: Employee[]) {
  const normalizedText = normalizeSearchText(text)
  const matches = employees.filter((employee) => {
    return (
      normalizedText.includes(normalizeSearchText(employee.full_name)) ||
      Boolean(employee.position && normalizedText.includes(normalizeSearchText(employee.position)))
    )
  })

  return uniqueIds(matches.map((employee) => employee.id))
}

function normalizeSearchText(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

function getUrgentReason(task: Task) {
  if (isTaskOverdue(task)) return 'Quá hạn'
  if (task.issue_status === 'problem') return 'Có vấn đề'
  if (task.issue_status === 'slow') return 'Đang chậm'
  if (task.status === 'pending') return 'Pending'
  if (!task.due_date) return 'Chua có deadline'
  return 'Cần theo dõi'
}

function buildFollowUpQuestion(task: Task, personName?: string) {
  const name = personName || 'người phụ trách'

  if (isTaskOverdue(task)) {
    return `Hỏi ${name}: Việc "${task.title}" đang quá hạn, lý do chậm là gì và cần hỗ trợ gì để chốt?`
  }

  if (task.status === 'pending' || task.issue_status === 'problem') {
    return `Hỏi ${name}: Việc "${task.title}" đang bị kẹt ở đâu, ai đang chờ ai, cần sếp quyết gì?`
  }

  if (task.issue_status === 'slow') {
    return `Hỏi ${name}: Tiến độ "${task.title}" đang chậm, bước tiếp theo là gì và khi nào hoàn thành?`
  }

  return `Hỏi ${name}: Cập nhật nhanh tiến độ "${task.title}" và bước tiếp theo.`
}

function buildDailyReport(
  tasks: Task[],
  steps: TaskStep[],
  projectCards: ProjectCard[],
  urgentTasks: Task[]
) {
  const doneTasks = tasks.filter((task) => task.status === 'completed').length
  const doingTasks = tasks.filter((task) => task.status === 'in_progress').length
  const pendingTasks = tasks.filter((task) => task.status === 'pending').length
  const overdueTasks = tasks.filter((task) => isTaskOverdue(task)).length
  const pendingSteps = getPendingApprovalSteps(steps)
  const revisionSteps = getRevisionSteps(steps)
  const missingReportSteps = getMissingReportSteps(steps)
  const attentionProjects = projectCards.filter((project) => project.health.level === 'watch' || project.health.level === 'problem')

  return `BÁO CÁO COO HÔM NAY

1. TỔNG QUAN
- Tổng đầu việc: ${tasks.length}
- Hoàn thành: ${doneTasks}
- Đang làm: ${doingTasks}
- Pending: ${pendingTasks}
- Trễ deadline: ${overdueTasks}
- Việc cần hối thúc: ${urgentTasks.length}
- Bước đang chờ duyệt: ${pendingSteps.length}
- Bước cần làm lại: ${revisionSteps.length}
- Bước thiếu file/link báo cáo: ${missingReportSteps.length}

2. DỰ ÁN CÓ CẢNH BÁO ĐỎ/CAM
${
  attentionProjects
    .map((project) => `- ${project.name}: ${project.health.label} | ${project.health.totalWarnings} cảnh báo | Tiến độ ${project.rate}%`)
    .join('\n') || '- Không có dự án đỏ/cam.'
}

3. ĐỀ XUẤT HÀNH ĐỘNG TRONG NGÀY
- Chốt các bước đang chờ duyệt để không nghẽn tiến độ.
- Hối các việc quá hạn, pending hoặc có vấn đề rõ người chịu trách nhiệm.
- Yêu cầu bổ sung file/link báo cáo cho các bước còn thiếu trước khi duyệt.
- Ưu tiên xử lý dự án đỏ trước, dự án cam theo dõi trong ngày.`
}

function buildFollowUpReport(
  urgentTasks: Task[],
  employeeMap: Map<string, Employee>,
  projectMap: Map<string, Project>
) {
  if (urgentTasks.length === 0) {
    return 'Hiện chưa có việc cần hối thúc.'
  }

  return `DANH SÁCH CẦN HỐI THÚC

${urgentTasks
  .map((task, index) => {
    const person = employeeMap.get(task.assignee_id || task.head_id || '')
    const project = projectMap.get(task.project_id || '')

    return `${index + 1}. ${person?.full_name || 'Chưa gắn người'} — ${task.title}
- Dự án: ${project?.name || 'Chưa gắn'}
- Lý do: ${getUrgentReason(task)}
- Cần hỏi: ${buildFollowUpQuestion(task, person?.full_name)}`
  })
  .join('\n\n')}`
}

function buildStepReport(
  title: string,
  reportSteps: TaskStep[],
  tasks: Task[],
  employeeMap: Map<string, Employee>,
  mode: 'pending' | 'revision' | 'missing_report'
) {
  if (reportSteps.length === 0) {
    return `${title}\n\n- Không có.`
  }

  return `${title} (${reportSteps.length})

${reportSteps
  .map((step, index) => {
    const task = getTaskByStep(step, tasks)
    const owner = employeeMap.get(step.owner_id || '')
    const stageApproverId =
      step.approval_stage === 'coo'
        ? step.coo_approver_id
        : step.approval_stage === 'ceo'
          ? step.ceo_approver_id
          : step.department_approver_id || step.approver_id
    const approver = employeeMap.get(stageApproverId || '')
    const approverLine = mode === 'pending' ? `\n- Đang chờ: ${getApprovalWaitingLabel(step)} (${approver?.full_name || 'Chưa gắn'})` : ''
    const revisionLine = mode === 'revision' ? `\n- Người yêu cầu: ${getRevisionRequesterLabel(step)}\n- Lý do làm lại: ${getRevisionNote(step) || 'Chưa có ghi chú'}` : ''

    return `${index + 1}. ${step.step_title}
- Task cha: ${task?.title || 'Không rõ'}
- Người phụ trách: ${owner?.full_name || 'Chưa gắn'}${approverLine}${revisionLine}`
  })
  .join('\n\n')}`
}

function buildPeopleReport(peopleReports: PeopleReport[]) {
  if (peopleReports.length === 0) {
    return 'BÁO CÁO THEO NHÂN SỰ\n\n- Chưa có nhân sự.'
  }

  return `BÁO CÁO THEO NHÂN SỰ

${peopleReports
  .map((person, index) => {
    return `${index + 1}. ${person.employee.full_name}
- T?ng vi?c: ${person.total}
- Chính: ${person.main}
 - Đồng phụ trách: ${person.coOwned}
 - Hỗ trợ: ${person.supported}
 - Chờ/đang duyệt: ${person.approvals}
- Hoàn thành: ${person.done}
- Đang làm: ${person.doing}
- Pending: ${person.pending}
- Trễ: ${person.overdue}
- Vấn đề: ${person.problem}
- Tỷ lệ hoàn thành: ${person.rate}%`
  })
  .join('\n\n')}`
}

function buildProjectReport(projectCards: ProjectCard[]) {
  if (projectCards.length === 0) {
    return 'BÁO CÁO THEO DỰ ÁN\n\n- Chưa có dự án.'
  }

  return `BÁO CÁO THEO DỰ ÁN

${projectCards
  .map((project, index) => {
    return `${index + 1}. ${project.name}
- Tiến độ: ${project.rate}%
- Cảnh báo: ${project.health.label}
- Tổng cảnh báo: ${project.health.totalWarnings}
- Tổng việc: ${project.total}
- Việc trễ: ${project.health.overdueTasks}
- Việc pending: ${project.health.pendingTasks}
- Bước chờ duyệt: ${project.health.pendingSteps}
- Bước cần làm lại: ${project.health.revisionSteps}`
  })
  .join('\n\n')}`
}

// --- Role helpers ------------------------------------------------------------

function filterTasksByRole(
  emp: Employee | null,
  tasks: Task[],
  supporters: TaskSupporter[],
  steps: TaskStep[]
): Task[] {
  if (!emp || !emp.id) return tasks
  const role = emp.role || 'employee'
  if (role === 'ceo' || role === 'coo' || role === 'admin') return tasks
  if (emp.can_view_all) return tasks

  const supportedTaskIds = new Set(
    supporters.filter((s) => s.employee_id === emp.id).map((s) => s.task_id)
  )
  const stepTaskIds = new Set(
    steps
      .filter(
        (s) =>
          s.owner_id === emp.id ||
          (s.supporter_ids || []).includes(emp.id) ||
          stepApproverIds(s).includes(emp.id)
      )
      .map((s) => s.task_id)
  )

  const isHead = role === 'department_head' || Boolean(emp.is_department_head)

  return tasks.filter((task) => {
    // Việc chưa được cấp trên duyệt phân công -> người làm chưa thấy
    const supporterRows = supporters.filter((supporter) => supporter.task_id === task.id)
    const isMyHead = taskHeadIds(task).includes(emp.id)
    const isMyApprover = taskApproverIds(task).includes(emp.id)
    if (task.status === 'pending_approval' && !isHead && !isMyHead && !isMyApprover) return false
    if (taskParticipantIds(task, supporterRows).includes(emp.id)) return true
    if (supportedTaskIds.has(task.id)) return true
    if (stepTaskIds.has(task.id)) return true
    if (
      (role === 'department_head' || emp.is_department_head) &&
      emp.department_id &&
      task.department_id === emp.department_id
    )
      return true
    return false
  })
}

// --- AdminUsersView -----------------------------------------------------------

type AdminEmployee = {
  id: string
  full_name: string
  email: string | null
  position: string | null
  role: string | null
  status: string | null
  department_id: string | null
}

const ROLE_OPTIONS = [
  { value: 'employee', label: 'Nhân viên' },
  { value: 'department_head', label: 'Trưởng bộ phận' },
  { value: 'admin', label: 'Admin' },
  { value: 'coo', label: 'COO' },
  { value: 'ceo', label: 'CEO' },
]

function adminRoleTone(role?: string | null) {
  if (role === 'ceo' || role === 'coo') return 'bg-[var(--olive)] text-[var(--ivory)]'
  if (role === 'admin') return 'bg-[var(--accent-soft)] text-[var(--olive)]'
  if (role === 'department_head') return 'bg-[var(--warning-soft)] text-[var(--warning)]'
  return 'bg-[var(--bg-surface)] text-[var(--text-secondary)]'
}

function AdminUsersView(props: {
  departments: Department[]
  onRefresh: () => void
  canCreateUsers: boolean
}) {
  const [employees, setEmployees] = useState<AdminEmployee[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)

  const [showCreate, setShowCreate] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createEmail, setCreateEmail] = useState('')
  const [createPassword, setCreatePassword] = useState('')
  const [createRole, setCreateRole] = useState('employee')
  const [createDept, setCreateDept] = useState('')
  const [createPosition, setCreatePosition] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  // Edit state
  const [editEmp, setEditEmp] = useState<AdminEmployee | null>(null)
  const [editName, setEditName] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editPassword, setEditPassword] = useState('')
  const [editPosition, setEditPosition] = useState('')
  const [editDept, setEditDept] = useState('')
  const [editRole, setEditRole] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')

  // Delete state
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function fetchEmployees() {
    setLoading(true)
    const { data, error } = await supabase
      .from('employees')
      .select('id, full_name, email, position, role, status, department_id')
      .order('full_name')
    if (error) console.error('fetchEmployees error:', error)
    setEmployees((data || []) as AdminEmployee[])
    setLoading(false)
  }

  useEffect(() => { fetchEmployees() }, [])

  async function updateEmployee(id: string, patch: Partial<AdminEmployee>) {
    setSaving(id)
    await supabase.from('employees').update(patch).eq('id', id)
    setSaving(null)
    await fetchEmployees()
  }

  async function toggleStatus(emp: AdminEmployee) {
    await updateEmployee(emp.id, { status: emp.status === 'active' ? 'inactive' : 'active' })
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreateError('')
    setCreating(true)

    const res = await fetch('/api/admin/create-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: createEmail,
        password: createPassword,
        fullName: createName,
        role: createRole,
        departmentId: createDept || null,
        position: createPosition || null,
      }),
    })

    const json = await res.json()
    setCreating(false)

    if (!res.ok) {
      setCreateError(json.error || 'Lỗi tạo tài khoản')
      return
    }

    setShowCreate(false)
    setCreateName('')
    setCreateEmail('')
    setCreatePassword('')
    setCreateRole('employee')
    setCreateDept('')
    setCreatePosition('')
    await fetchEmployees()
  }

  function openEdit(emp: AdminEmployee) {
    setEditEmp(emp)
    setEditName(emp.full_name)
    setEditEmail(emp.email ? displayLoginIdentifier(emp.email) : '')
    setEditPassword('')
    setEditPosition(emp.position || '')
    setEditDept(emp.department_id || '')
    setEditRole(emp.role || 'employee')
    setEditError('')
  }

  async function handleEditSave(e: React.FormEvent) {
    e.preventDefault()
    if (!editEmp) return
    setEditSaving(true)
    setEditError('')
    const res = await fetch('/api/admin/update-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employeeId: editEmp.id,
        fullName: editName.trim(),
        login: editEmail.trim(),
        newPassword: editPassword.trim() || undefined,
        position: editPosition.trim() || null,
        departmentId: editDept || null,
        role: editRole,
      }),
    })
    const json = await res.json()
    setEditSaving(false)
    if (!res.ok) {
      setEditError(json.error || 'Không lưu được thông tin nhân sự')
      return
    }
    setEditEmp(null)
    await fetchEmployees()
    props.onRefresh()
  }

  async function handleDelete(emp: AdminEmployee) {
    if (!window.confirm(`Xóa tài khoản "${emp.full_name}"? Hành động này không thể hoàn tác.`)) return
    setDeletingId(emp.id)
    // Delete auth user via API if linked
    if (emp.email) {
      await fetch('/api/admin/reset-password', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emp.email }),
      })
    }
    await supabase.from('employees').delete().eq('id', emp.id)
    setDeletingId(null)
    await fetchEmployees()
    props.onRefresh()
  }

  const deptMap = new Map(props.departments.map((d) => [d.id, d.name]))
  const activeCount = employees.filter((emp) => emp.status === 'active').length
  const leadershipCount = employees.filter((emp) => ['ceo', 'coo', 'admin', 'department_head'].includes(emp.role || '')).length
  const unassignedDeptCount = employees.filter((emp) => !emp.department_id).length

  return (
    <div className="space-y-6">
      <div className="vyvy-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="vyvy-label">People & Permission</p>
            <h3 className="mt-1 font-display text-xl text-[var(--text-primary)]">Quản lý nhân sự</h3>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">Tài khoản, vai trò, phòng ban và trạng thái truy cập.</p>
          </div>
          {props.canCreateUsers ? (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="vyvy-button-primary"
            >
              <Ico d={IC.plus} size={15} />
              Tạo tài khoản
            </button>
          ) : (
            <span className="rounded-[var(--radius)] border border-[var(--border)] px-3 py-2 text-xs font-bold text-[var(--text-muted)]">
              Không có quyền tạo tài khoản
            </span>
          )}
        </div>
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            { label: 'Tổng nhân sự', value: employees.length },
            { label: 'Đang hoạt động', value: activeCount },
            { label: 'Quản trị / duyệt', value: leadershipCount },
          ].map((item) => (
            <div key={item.label} className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-3">
              <p className="vyvy-label">{item.label}</p>
              <p className="mt-2 font-display text-3xl tabular-nums text-[var(--text-primary)]">{item.value}</p>
            </div>
          ))}
        </div>
        {unassignedDeptCount > 0 && (
          <div className="mt-3 rounded-[var(--radius)] border border-[var(--warning)]/25 bg-[var(--warning-soft)] px-3 py-2 text-xs font-semibold text-[var(--warning)]">
            {unassignedDeptCount} nhân sự chưa gắn phòng ban.
          </div>
        )}
      </div>

      {showCreate && (
        <div className="vyvy-card p-6">
          <div className="mb-4">
            <p className="vyvy-label">New account</p>
            <h3 className="mt-1 font-display text-lg">Tạo tài khoản nhân viên</h3>
          </div>
          <form onSubmit={handleCreate} className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div>
              <label className="vyvy-label mb-1 block">Họ và tên *</label>
              <input required value={createName} onChange={(e) => setCreateName(e.target.value)}
                className="vyvy-input h-11 w-full px-3 text-sm outline-none" placeholder="Nguyễn Văn A" />
            </div>
            <div>
              <label className="vyvy-label mb-1 block">Tài khoản đăng nhập *</label>
              <input required type="text" value={createEmail} onChange={(e) => setCreateEmail(e.target.value)}
                className="vyvy-input h-11 w-full px-3 text-sm outline-none" placeholder="quang / nhung / admin" />
            </div>
            <div>
              <label className="vyvy-label mb-1 block">Mật khẩu *</label>
              <input required type="password" minLength={6} value={createPassword} onChange={(e) => setCreatePassword(e.target.value)}
                className="vyvy-input h-11 w-full px-3 text-sm outline-none" placeholder="Tối thiểu 6 ký tự" />
            </div>
            <div>
              <label className="vyvy-label mb-1 block">Chức vụ</label>
              <input value={createPosition} onChange={(e) => setCreatePosition(e.target.value)}
                className="vyvy-input h-11 w-full px-3 text-sm outline-none" placeholder="Nhân viên Marketing..." />
            </div>
            <div>
              <label className="vyvy-label mb-1 block">Role</label>
              <select value={createRole} onChange={(e) => setCreateRole(e.target.value)}
                className="vyvy-input h-11 w-full px-3 text-sm outline-none">
                {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="vyvy-label mb-1 block">Phòng ban</label>
              <select value={createDept} onChange={(e) => setCreateDept(e.target.value)}
                className="vyvy-input h-11 w-full px-3 text-sm outline-none">
                <option value="">Chọn phòng ban</option>
                {props.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            {createError && (
              <div className="col-span-2 rounded-[var(--radius)] border border-[var(--danger)]/20 bg-[var(--danger-soft)] px-4 py-3 text-sm font-bold text-[var(--danger)]">{createError}</div>
            )}
            <div className="col-span-2 flex gap-3">
              <button type="submit" disabled={creating}
                className="vyvy-button-primary disabled:opacity-60">
                {creating ? 'Đang tạo...' : 'Tạo tài khoản'}
              </button>
              <button type="button" onClick={() => { setShowCreate(false); setCreateError('') }}
                className="vyvy-button-secondary">
                Hủy
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="vyvy-card p-5 text-sm text-[var(--text-secondary)]">Đang tải...</div>
      ) : employees.length === 0 ? (
        <EmptyState title="Chưa có nhân sự" description="Tạo tài khoản đầu tiên để bắt đầu phân quyền." />
      ) : (
        <div className="vyvy-card overflow-x-auto">
          <table className="vyvy-table min-w-[920px]">
            <thead>
              <tr>
                <th>Họ tên</th>
                <th>Tài khoản</th>
                <th>Chức vụ</th>
                <th>Phòng ban</th>
                <th>Role</th>
                <th>Trạng thái</th>
                <th>Hành động</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((emp) => (
                <tr key={emp.id} className="hover:bg-[var(--bg-surface)]">
                  <td>
                    <div className="flex items-center gap-2">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-surface)] text-xs font-extrabold text-[var(--olive)]">
                        {emp.full_name.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="font-bold">{emp.full_name}</span>
                    </div>
                  </td>
                  <td className="text-[var(--text-secondary)]">{displayLoginIdentifier(emp.email) || '—'}</td>
                  <td className="text-[var(--text-secondary)]">{emp.position || '—'}</td>
                  <td>
                    <span className="rounded-full bg-[var(--bg-surface)] px-2.5 py-1 text-xs font-semibold text-[var(--text-secondary)]">
                      {deptMap.get(emp.department_id || '') || 'Chưa gắn'}
                    </span>
                  </td>
                  <td>
                    <select
                      value={emp.role || 'employee'}
                      disabled={saving === emp.id}
                      onChange={(e) => updateEmployee(emp.id, { role: e.target.value })}
                      className={`rounded-full border border-transparent px-3 py-1 text-xs font-bold outline-none ${adminRoleTone(emp.role)}`}
                    >
                      {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </td>
                  <td>
                    <button
                      type="button"
                      onClick={() => toggleStatus(emp)}
                      className={`rounded-full px-3 py-1 text-xs font-bold ${
                        emp.status === 'active'
                          ? 'bg-[var(--success-soft)] text-[var(--success)]'
                          : 'bg-[var(--danger-soft)] text-[var(--danger)]'
                      }`}
                    >
                      {emp.status === 'active' ? 'Hoạt động' : 'Đã khóa'}
                    </button>
                  </td>
                  <td>
                    <div className="flex items-center gap-2 flex-wrap">
                      <button type="button" onClick={() => openEdit(emp)}
                        className="vyvy-button-secondary min-h-0 px-3 py-1.5">
                        Sửa
                      </button>
                      {emp.email && <ResetPasswordButton authUserId={emp.email} />}
                      <button type="button" disabled={deletingId === emp.id} onClick={() => handleDelete(emp)}
                        className="vyvy-button-danger min-h-0 px-3 py-1.5 disabled:opacity-40">
                        {deletingId === emp.id ? '...' : 'Xóa'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit modal */}
      {editEmp && (
        <div className="fixed inset-0 z-[9990] flex items-center justify-center bg-black/40 p-4" onClick={() => setEditEmp(null)}>
          <div className="vyvy-modal-panel w-full max-w-md rounded-[var(--radius-lg)] p-6" onClick={(e) => e.stopPropagation()}>
            <p className="vyvy-label">Edit account</p>
            <h3 className="mb-5 mt-1 font-display text-lg text-[var(--text-primary)]">Sửa thông tin — {editEmp.full_name}</h3>
            <form onSubmit={handleEditSave} className="space-y-4">
              <div>
                <label className="vyvy-label mb-1 block">Họ và tên *</label>
                <input required value={editName} onChange={(e) => setEditName(e.target.value)}
                  className="vyvy-input h-11 w-full px-3 text-sm outline-none" />
              </div>
              <div>
                <label className="vyvy-label mb-1 block">Tài khoản đăng nhập</label>
                <input value={editEmail} onChange={(e) => setEditEmail(e.target.value)}
                  className="vyvy-input h-11 w-full px-3 text-sm outline-none"
                  placeholder="quang / nhung / ten@domain.com" />
                <p className="mt-1 text-[11px] text-[var(--text-muted)]">Đổi tài khoản ở đây sẽ cập nhật luôn tài khoản đăng nhập.</p>
              </div>
              <div>
                <label className="vyvy-label mb-1 block">Mật khẩu mới</label>
                <input type="password" minLength={6} value={editPassword} onChange={(e) => setEditPassword(e.target.value)}
                  className="vyvy-input h-11 w-full px-3 text-sm outline-none"
                  placeholder="Chỉ nhập khi cần đổi/tạo tài khoản" />
              </div>
              <div>
                <label className="vyvy-label mb-1 block">Chức vụ</label>
                <input value={editPosition} onChange={(e) => setEditPosition(e.target.value)}
                  className="vyvy-input h-11 w-full px-3 text-sm outline-none" placeholder="Nhân viên Marketing..." />
              </div>
              <div>
                <label className="vyvy-label mb-1 block">Phòng ban</label>
                <select value={editDept} onChange={(e) => setEditDept(e.target.value)}
                  className="vyvy-input h-11 w-full px-3 text-sm outline-none">
                  <option value="">Chọn phòng ban</option>
                  {props.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div>
                <label className="vyvy-label mb-1 block">Role</label>
                <select value={editRole} onChange={(e) => setEditRole(e.target.value)}
                  className="vyvy-input h-11 w-full px-3 text-sm outline-none">
                  {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              {editError && (
                <div className="rounded-xl bg-[var(--danger-soft)] px-4 py-3 text-sm font-bold text-[var(--danger)]">
                  {editError}
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={editSaving}
                  className="vyvy-button-primary disabled:opacity-60">
                  {editSaving ? 'Đang lưu...' : 'Lưu'}
                </button>
                <button type="button" onClick={() => setEditEmp(null)}
                  className="vyvy-button-secondary">
                  Hủy
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function ResetPasswordButton({ authUserId }: { authUserId: string }) {
  const [open, setOpen] = useState(false)
  const [pw, setPw] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  // authUserId can be a UUID or email — API handles both
  const isEmail = authUserId.includes('@')

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setMsg('')
    const body = isEmail
      ? { email: authUserId, newPassword: pw }
      : { authUserId, newPassword: pw }
    const res = await fetch('/api/admin/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setLoading(false)
    if (res.ok) {
      setMsg('Đã đặt lại mật khẩu!')
      setPw('')
      setTimeout(() => { setOpen(false); setMsg('') }, 1500)
    } else {
      const j = await res.json()
      setMsg(j.error || 'Lỗi')
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="rounded-full border border-[var(--warning)]/20 bg-[var(--warning-soft)] px-2 py-0.5 text-[10px] font-bold text-[var(--warning)] hover:border-[var(--warning)]/40">
        Đặt lại MK
      </button>
    )
  }

  return (
    <form onSubmit={handleReset} className="flex flex-col gap-1">
      <input required minLength={6} type="password" value={pw} onChange={(e) => setPw(e.target.value)}
        placeholder="Mật khẩu mới" className="h-7 w-32 rounded border border-[var(--border)] px-2 text-xs outline-none" />
      {msg && <p className={`text-[10px] font-bold ${msg.includes('Đã') ? 'text-[var(--accent-hover)]' : 'text-[var(--danger)]'}`}>{msg}</p>}
      <div className="flex gap-1">
        <button type="submit" disabled={loading}
          className="rounded bg-[var(--olive)] px-2 py-0.5 text-[10px] font-bold text-[var(--ivory)] disabled:opacity-60">
          {loading ? '...' : 'Lưu'}
        </button>
        <button type="button" onClick={() => { setOpen(false); setMsg('') }}
          className="rounded border border-[var(--border)] bg-[var(--bg-card)] px-2 py-0.5 text-[10px] font-bold text-[var(--text-secondary)]">
          Hủy
        </button>
      </div>
    </form>
  )
}

// --- AdminDepartmentsSection --------------------------------------------------

// ─── Góp ý hệ thống ────────────────────────────────────────────────────────
type FeedbackRow = {
  id: string
  employee_id: string | null
  title: string
  content: string
  type: string
  anonymous: boolean
  status: string
  admin_note: string | null
  created_at: string
}

const FEEDBACK_TYPE_LABEL: Record<string, string> = {
  improvement: 'Cải tiến quy trình',
  bug: 'Báo lỗi',
  other: 'Ý kiến khác',
}
const FEEDBACK_STATUS_LABEL: Record<string, string> = {
  new: 'Mới',
  reviewing: 'Đang xem xét',
  done: 'Đã xử lý',
}
const FEEDBACK_STATUS_COLOR: Record<string, string> = {
  new: 'bg-[var(--accent-soft)] text-[var(--accent)]',
  reviewing: 'bg-[var(--warning-soft)] text-[var(--warning)]',
  done: 'bg-[var(--success-soft)] text-[var(--success)]',
}

function FeedbackView(props: {
  currentEmployee: Employee | null
  canManageAll: boolean
  employeeMap: Map<string, Employee>
}) {
  const [list, setList] = useState<FeedbackRow[]>([])
  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [type, setType] = useState('improvement')
  const [anonymous, setAnonymous] = useState(false)
  const [saving, setSaving] = useState(false)
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({})

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('feedback').select('*').order('created_at', { ascending: false })
    setList((data || []) as FeedbackRow[])
    setLoading(false)
  }

  useEffect(() => { void load() }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !content.trim()) return
    setSaving(true)
    await supabase.from('feedback').insert({
      employee_id: anonymous ? null : props.currentEmployee?.id ?? null,
      title: title.trim(),
      content: content.trim(),
      type,
      anonymous,
    })
    setTitle(''); setContent(''); setType('improvement'); setAnonymous(false)
    setSaving(false)
    await load()
  }

  async function updateStatus(id: string, status: string) {
    await supabase.from('feedback').update({ status }).eq('id', id)
    await load()
  }

  async function saveAdminNote(id: string) {
    await supabase.from('feedback').update({ admin_note: adminNotes[id] ?? '' }).eq('id', id)
    await load()
  }

  return (
    <div className="space-y-6">
      {/* Form gửi góp ý */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
        <h3 className="mb-4 text-sm font-extrabold">Gửi góp ý mới</h3>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <input
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-base)] px-3 py-2 text-sm outline-none focus:border-[var(--border-strong)]"
            placeholder="Tiêu đề góp ý..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
          <textarea
            rows={3}
            className="w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--bg-base)] px-3 py-2 text-sm outline-none focus:border-[var(--border-strong)]"
            placeholder="Mô tả chi tiết..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            required
          />
          <div className="flex flex-wrap items-center gap-3">
            <select
              className="rounded-lg border border-[var(--border)] bg-[var(--bg-base)] px-3 py-2 text-sm outline-none"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              <option value="improvement">Cải tiến quy trình</option>
              <option value="bug">Báo lỗi</option>
              <option value="other">Ý kiến khác</option>
            </select>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--text-secondary)]">
              <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} className="accent-[var(--olive)]" />
              Gửi ẩn danh
            </label>
            <button
              type="submit"
              disabled={saving || !title.trim() || !content.trim()}
              className="ml-auto rounded-lg bg-[var(--olive)] px-5 py-2 text-sm font-bold text-[var(--ivory)] disabled:opacity-40"
            >
              {saving ? 'Đang gửi…' : 'Gửi góp ý'}
            </button>
          </div>
        </form>
      </div>

      {/* Danh sách góp ý */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
        <h3 className="mb-4 text-sm font-extrabold">Danh sách góp ý {list.length > 0 && <span className="ml-1 text-[var(--text-muted)] font-normal">({list.length})</span>}</h3>
        {loading ? (
          <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="skeleton h-16 rounded-xl" />)}</div>
        ) : list.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">Chua có góp ý nào.</p>
        ) : (
          <div className="space-y-3">
            {list.map((row) => {
              const sender = row.anonymous ? null : props.employeeMap.get(row.employee_id || '')
              const isOwn = !row.anonymous && row.employee_id === props.currentEmployee?.id
              return (
                <div key={row.id} className="rounded-xl border border-[var(--border)] bg-[var(--bg-base)] p-4">
                  <div className="flex flex-wrap items-start gap-2 mb-2">
                    <span className="flex-1 font-semibold text-sm">{row.title}</span>
                    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${FEEDBACK_STATUS_COLOR[row.status] ?? 'bg-[var(--bg-surface)] text-[var(--text-muted)]'}`}>
                      {FEEDBACK_STATUS_LABEL[row.status] ?? row.status}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] leading-5 mb-2">{row.content}</p>
                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-[var(--text-muted)]">
                    <span>{FEEDBACK_TYPE_LABEL[row.type] ?? row.type}</span>
                    <span>·</span>
                    <span>{row.anonymous ? 'Ẩn danh' : (sender?.full_name ?? (isOwn ? 'Bạn' : '—'))}</span>
                    <span>·</span>
                    <span>{new Date(row.created_at).toLocaleDateString('vi-VN')}</span>
                  </div>
                  {row.admin_note && (
                    <div className="mt-2 rounded-lg border border-[var(--success)]/20 bg-[var(--success-soft)] px-3 py-2 text-xs text-[var(--success)]">
                      Phản hồi: {row.admin_note}
                    </div>
                  )}
                  {props.canManageAll && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {(['new','reviewing','done'] as const).map((s) => (
                        <button key={s} onClick={() => updateStatus(row.id, s)}
                          className={`rounded-lg border px-2.5 py-1 text-[11px] font-bold transition-colors ${row.status === s ? 'border-[var(--olive)] bg-[var(--olive)] text-[var(--ivory)]' : 'border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]'}`}>
                          {FEEDBACK_STATUS_LABEL[s]}
                        </button>
                      ))}
                      <div className="flex flex-1 min-w-[200px] items-center gap-2 ml-2">
                        <input
                          className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-2.5 py-1 text-xs outline-none focus:border-[var(--border-strong)]"
                          placeholder="Ghi chú phản hồi..."
                          value={adminNotes[row.id] ?? (row.admin_note || '')}
                          onChange={(e) => setAdminNotes(n => ({ ...n, [row.id]: e.target.value }))}
                          onBlur={() => saveAdminNote(row.id)}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// --- Import Excel --------------------------------------------------------------
type ImportRow = {
  rowNum: number
  project: string
  group: string
  level: string   // 'workstream' | 'subtask' | 'step'
  title: string
  description: string
  output: string
  owner: string
  approver: string
  deadline: string
  notes: string
  error?: string
}

function ImportExcelView(props: {
  employees: Employee[]
  projects: Project[]
  currentEmployee: Employee | null
  onDone: () => void
}) {
  const [rows, setRows] = useState<ImportRow[]>([])
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<{ ok: number; fail: number } | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  type DupeInfo = { rowNum: number; title: string; project: string; level: string; existingId: string }
  const [dupeWarning, setDupeWarning] = useState<DupeInfo[]>([])
  const [dupeChecking, setDupeChecking] = useState(false)
  const [skipDupes, setSkipDupes] = useState<boolean | null>(null) // null = chưa quyết định

  // ── Dọn trùng DB ──────────────────────────────────────────────────────────
  type DbDupeGroup = { title: string; projectName: string; ids: string[]; level: string }
  const [dbDupes, setDbDupes] = useState<DbDupeGroup[]>([])
  const [dbDupeScanning, setDbDupeScanning] = useState(false)
  const [dbDupeDeleting, setDbDupeDeleting] = useState<Set<string>>(new Set())
  const [dbDupeScanned, setDbDupeScanned] = useState(false)

  async function scanDbDupes() {
    setDbDupeScanning(true)
    try {
      const { data } = await supabase
        .from('tasks')
        .select('id, title, task_level, project_id, projects:project_id(name)')
        .in('task_level', ['workstream', 'subtask'])
        .order('created_at', { ascending: true })
      if (!data) { setDbDupeScanning(false); return }
      // Nhóm theo title + project_id
      const groups = new Map<string, DbDupeGroup>()
      for (const t of data) {
        const projName = (t.projects as { name?: string } | null)?.name || t.project_id || ''
        const key = `${t.title.trim().toLowerCase()}||${t.project_id}`
        if (!groups.has(key)) groups.set(key, { title: t.title, projectName: projName, ids: [], level: t.task_level })
        groups.get(key)!.ids.push(t.id)
      }
      const dupes = [...groups.values()].filter(g => g.ids.length > 1)
      setDbDupes(dupes)
      setDbDupeScanned(true)
    } catch (e) { console.error('scanDbDupes', e) }
    setDbDupeScanning(false)
  }

  async function deleteDbDupeExtra(group: DbDupeGroup) {
    // Giữ bản đầu tiên (oldest), xóa các bản sau
    const toDelete = group.ids.slice(1)
    setDbDupeDeleting(prev => new Set([...prev, ...toDelete]))
    for (const id of toDelete) {
      await supabase.from('tasks').delete().eq('id', id)
    }
    setDbDupes(prev => prev.filter(g => !(g.title === group.title && g.projectName === group.projectName)))
    setDbDupeDeleting(prev => { const s = new Set(prev); toDelete.forEach(id => s.delete(id)); return s })
  }

  const empByName = useMemo(() => {
    const m = new Map<string, string>()
    props.employees.forEach(e => {
      m.set(e.full_name.toLowerCase().trim(), e.id)
      // partial match by first word
      const first = e.full_name.split(' ')[0].toLowerCase()
      if (!m.has(first)) m.set(first, e.id)
    })
    return m
  }, [props.employees])

  const projByName = useMemo(() => {
    const m = new Map<string, string>()
    props.projects.forEach(p => m.set(p.name.toLowerCase().trim(), p.id))
    return m
  }, [props.projects])

  // Map Vietnamese level labels -> internal
  const LEVEL_MAP: Record<string, string> = {
    'đầu việc lớn': 'workstream', 'workstream': 'workstream', 'milestone': 'workstream',
    'đầu việc con': 'subtask', 'subtask': 'subtask', 'task': 'subtask',
    'bước': 'step', 'step': 'step',
  }
  const STATUS_IMPORT_MAP: Record<string, string> = {
    'chưa bắt đầu': 'not_started', 'đang thực hiện': 'in_progress',
    'đã hoàn thành': 'completed', 'đang chờ': 'pending', 'pending': 'pending',
  }

  async function parseFile(file: File) {
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/parse-excel', { method: 'POST', body: form })
      const json = await res.json()
      if (!res.ok || json.error) { alert(json.error || 'Lỗi đọc file'); return }
      const parsed: ImportRow[] = json.rows.map((r: ImportRow) => {
        const errors: string[] = []
        if (!r.title) errors.push('Thiếu tên đầu việc')
        if (!r.project) errors.push('Thiếu dự án')
        const levelNorm = LEVEL_MAP[r.level.toLowerCase()] || 'subtask'
        if (r.level && !LEVEL_MAP[r.level.toLowerCase()]) errors.push(`Cấp độ không hợp lệ: "${r.level}"`)
        return { ...r, level: levelNorm, error: errors.join('; ') || undefined }
      })
      setRows(parsed)
      setResult(null)
      setDupeWarning([])
      setSkipDupes(null)
      // Kiểm tra trùng ngay sau khi parse
      checkDupes(parsed)
    } catch (err) {
      console.error('parseFile error:', err)
      alert('Không đọc được file. Hãy dùng đúng file mẫu .xlsx')
    }
  }

  async function checkDupes(parsed: ImportRow[]) {
    const validTitles = parsed.filter(r => !r.error && r.title && (r.level === 'workstream' || r.level === 'subtask')).map(r => r.title.trim())
    if (validTitles.length === 0) return
    setDupeChecking(true)
    try {
      const { data } = await supabase
        .from('tasks')
        .select('id, title, task_level')
        .in('title', validTitles)
        .in('task_level', ['workstream', 'subtask'])
      if (!data || data.length === 0) { setDupeChecking(false); return }
      const existingTitles = new Map<string, { id: string; level: string }>()
      data.forEach(t => existingTitles.set(t.title.trim().toLowerCase(), { id: t.id, level: t.task_level }))
      const dupes: DupeInfo[] = parsed
        .filter(r => !r.error && existingTitles.has(r.title.trim().toLowerCase()))
        .map(r => {
          const ex = existingTitles.get(r.title.trim().toLowerCase())!
          return { rowNum: r.rowNum, title: r.title, project: r.project, level: r.level, existingId: ex.id }
        })
      setDupeWarning(dupes)
    } catch { /* ignore */ }
    setDupeChecking(false)
  }

  async function doImport() {
    if (importing) return  // guard double-click
    // Nếu có trùng mà user chưa quyết định → chặn
    if (dupeWarning.length > 0 && skipDupes === null) return
    setImporting(true)
    let ok = 0, fail = 0
    const errors: string[] = []
    const msCache = new Map<string, string>()                           // project|group -> workstream id
    const subCache = new Map<string, { id: string; order: number }>()  // project|group -> last subtask
    const projectIdByName = new Map(projByName)

    // Tập tên trùng để lọc (nếu user chọn bỏ qua)
    const dupeSet = new Set(skipDupes === true ? dupeWarning.map(d => d.title.trim().toLowerCase()) : [])

    for (const row of rows) {
      if (row.error) { fail++; continue }
      // Bỏ qua bản trùng nếu user chọn skip (chỉ skip workstream/subtask, không skip step)
      if (skipDupes === true && (row.level === 'workstream' || row.level === 'subtask') && dupeSet.has(row.title.trim().toLowerCase())) {
        fail++; continue
      }
      try {
        // Resolve project
        let projId = projectIdByName.get(row.project.toLowerCase().trim())
        if (!projId) {
          const newProjId = crypto.randomUUID()
          const { error: projErr } = await supabase.from('projects').insert({ id: newProjId, name: row.project, status: 'active' })
          if (projErr) { errors.push(`[${row.title}] Tạo dự án lỗi: ${projErr.message}`); fail++; continue }
          projId = newProjId
          projectIdByName.set(row.project.toLowerCase().trim(), projId)
        }

        const ownerIds = guessEmployeeIds(row.owner || '', props.employees)
        const ownerId = ownerIds[0] || empByName.get(row.owner.toLowerCase().trim()) || null
        const coOwnerIds = ownerIds.slice(1)
        const approverIds = guessEmployeeIds(row.approver || '', props.employees)
        const approverId = approverIds[0] || empByName.get(row.approver.toLowerCase().trim()) || null

        let dueDate: string | null = null
        if (row.deadline) {
          const d = new Date(row.deadline)
          if (!isNaN(d.getTime())) dueDate = d.toISOString().split('T')[0]
        }

        const desc = [row.description, row.output ? `Output: ${row.output}` : ''].filter(Boolean).join(' | ')
        const taskStatus = STATUS_IMPORT_MAP[row.notes.toLowerCase()] || 'not_started'
        const cacheKey = `${row.project.trim()}|${row.group.trim()}`

        const baseTask = {
          description: desc || null, project_id: projId,
          status: taskStatus, head_id: ownerId, head_ids: ownerId ? [ownerId] : null,
          assignee_id: ownerId, co_owner_ids: coOwnerIds,
          approver_ids: approverIds, reviewer_ids: approverIds,
          due_date: dueDate,
          progress_percent: 0, issue_status: 'normal', approval_status: 'not_submitted',
          priority: 'medium',
        }

        if (row.level === 'workstream') {
          // Pre-generate ID → không cần RETURNING (tránh RLS block)
          const wsId = crypto.randomUUID()
          const { error: e } = await supabase.from('tasks').insert({
            ...baseTask, id: wsId, title: row.title, task_level: 'workstream', parent_task_id: null,
          })
          if (e) { errors.push(`[${row.title}] Đầu việc lớn: ${e.message}`); fail++ }
          else { msCache.set(cacheKey, wsId); ok++; await commitDeadlineMeta(wsId, dueDate, 'import') }

        } else if (row.level === 'subtask') {
          const parentId = msCache.get(cacheKey)
          if (!parentId) {
            errors.push(`[${row.title}] Không tìm được đầu việc lớn cha (nhóm: ${row.group})`)
            fail++; continue
          }
          const subId = crypto.randomUUID()
          const { error: e } = await supabase.from('tasks').insert({
            ...baseTask, id: subId, title: row.title,
            task_level: 'subtask', parent_task_id: parentId,
            assignee_id: ownerId,
          })
          if (e) { errors.push(`[${row.title}] Đầu việc con: ${e.message}`); fail++ }
          else { subCache.set(cacheKey, { id: subId, order: 0 }); ok++; await commitDeadlineMeta(subId, dueDate, 'import') }

        } else if (row.level === 'step') {
          const sub = subCache.get(cacheKey)
          if (!sub) {
            errors.push(`[${row.title}] Không tìm được đầu việc con cha (nhóm: ${row.group})`)
            fail++; continue
          }
          sub.order += 1
          const { error: e } = await insertTaskStepsCompat({
            task_id: sub.id, step_title: row.title, step_order: sub.order,
            owner_id: ownerId, approver_id: approverId || null,
            supporter_ids: coOwnerIds,
            approver_ids: approverIds,
            department_approver_id: approverId || null,
            due_date: dueDate, description: desc || null,
            approval_status: 'not_submitted', department_approval_status: 'not_submitted',
            coo_approval_status: 'not_required', ceo_approval_status: 'not_required',
            approval_stage: 'department', requires_coo_approval: false, requires_ceo_approval: false,
            is_done: false,
          })
          if (e) { errors.push(`[${row.title}] Bước: ${e.message}`); fail++ }
          else ok++
        }
      } catch (ex) { errors.push(`[${row.title}] Lỗi không xác định: ${String(ex)}`); fail++ }
    }

    if (errors.length) console.error('Import errors:', errors)
    setResult({ ok, fail })
    setImporting(false)
    if (ok > 0) {
      setRows([])  // xóa rows sau khi nhập thành công → tránh nhập lại
      props.onDone()
    }
  }

  function downloadTemplateFromServer() {
    window.open('/api/excel-template', '_blank')
  }

  const validRows = rows.filter(r => !r.error)
  const errorRows = rows.filter(r => r.error)
  const dupeRows = new Set(dupeWarning.map((d) => d.rowNum))
  const missingOwner = rows.filter((r) => !r.owner?.trim()).length
  const missingDeadline = rows.filter((r) => !r.deadline?.trim()).length
  const workstreamRows = rows.filter((r) => r.level === 'workstream').length
  const subtaskRows = rows.filter((r) => r.level === 'subtask').length
  const stepRows = rows.filter((r) => r.level === 'step').length

  function levelLabel(level: string) {
    if (level === 'workstream') return 'Đầu việc lớn'
    if (level === 'step') return 'Bước'
    return 'Đầu việc con'
  }

  function rowBadges(row: ImportRow) {
    const badges: Array<{ label: string; cls: string }> = []
    if (!row.owner?.trim()) badges.push({ label: 'Thiếu owner', cls: 'bg-[var(--warning-soft)] text-[var(--warning)]' })
    if (!row.deadline?.trim()) badges.push({ label: 'Thiếu deadline', cls: 'bg-[var(--warning-soft)] text-[var(--warning)]' })
    if (dupeRows.has(row.rowNum)) badges.push({ label: 'Có thể trùng', cls: 'bg-[var(--danger-soft)] text-[var(--danger)]' })
    if (row.error) badges.push({ label: 'Có lỗi', cls: 'bg-[var(--danger-soft)] text-[var(--danger)]' })
    return badges
  }

  return (
    <div className="space-y-5">
      {/* Upload zone */}
      <div className="vyvy-card p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="vyvy-label">Document intake</p>
            <h3 className="mt-1 font-display text-xl">Nhập đầu việc từ Excel</h3>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">Tải file, kiểm tra cảnh báo, rồi xác nhận import vào COO Board.</p>
          </div>
          <button onClick={downloadTemplateFromServer}
            className="vyvy-button-secondary">
            Tải file mẫu
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx"
          className="sr-only"
          onChange={e => { const f = e.target.files?.[0]; if (f) { parseFile(f); e.target.value = '' } }}
        />
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) parseFile(f) }}
          onClick={() => fileInputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-[var(--radius-lg)] border border-dashed py-10 transition-colors ${dragOver ? 'border-[var(--olive)] bg-[var(--bg-surface)]' : 'border-[var(--border)] bg-[var(--bg-surface)] hover:border-[var(--border-strong)]'}`}
        >
          <div className="vyvy-empty-mark" />
          <p className="text-sm font-bold text-[var(--text-primary)]">Kéo thả file .xlsx vào đây</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">hoặc bấm để chọn file mẫu đã điền</p>
        </div>

        {rows.length > 0 && (
          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-6">
            {[
              { label: 'Tổng dòng', value: rows.length },
              { label: 'Hợp lệ', value: validRows.length },
              { label: 'Lỗi', value: errorRows.length },
              { label: 'Thiếu owner', value: missingOwner },
              { label: 'Thiếu deadline', value: missingDeadline },
              { label: 'Có thể trùng', value: dupeWarning.length },
            ].map((item) => (
              <div key={item.label} className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2">
                <p className="vyvy-label">{item.label}</p>
                <p className="mt-1 font-display text-2xl tabular-nums text-[var(--text-primary)]">{item.value}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Hướng dẫn sử dụng */}
      <div className="vyvy-card space-y-5 p-5">
        <div>
          <p className="vyvy-label">Format guide</p>
          <h3 className="mt-1 font-display text-lg">Hướng dẫn nhập đầu việc bằng Excel</h3>
        </div>

        {/* Bước thực hiện */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            { step: '1', title: 'Tải file mẫu', desc: 'Bấm "↓ Tải file mẫu" để lấy file .xlsx có sẵn cấu trúc và ví dụ minh họa.' },
            { step: '2', title: 'Điền dữ liệu', desc: 'Mở file bằng Excel/Google Sheets, điền từng dòng theo đúng cột. Không thay đổi hàng tiêu đề.' },
            { step: '3', title: 'Upload & Xác nhận', desc: 'Kéo thả file vào ô upload. Kiểm tra bảng xem trước rồi bấm "Xác nhận nhập".' },
          ].map(s => (
            <div key={s.step} className="flex gap-3 rounded-xl bg-[var(--bg-surface)] p-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--olive)] text-xs font-extrabold text-[var(--ivory)]">{s.step}</span>
              <div>
                <p className="text-xs font-bold text-[var(--text-primary)] mb-0.5">{s.title}</p>
                <p className="text-xs text-[var(--text-secondary)] leading-5">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Cấu trúc cột */}
        <div>
          <p className="text-xs font-extrabold text-[var(--text-secondary)] uppercase tracking-wide mb-2">Cấu trúc các cột trong file</p>
          <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
            <table className="w-full text-xs">
              <thead className="bg-[var(--bg-surface)]">
                <tr>
                  {['Cột','Tên cột','Bắt buộc','Mô tả & Ví dụ'].map(h => (
                    <th key={h} className="px-3 py-2 text-left font-bold text-[var(--text-muted)] whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {[
                  ['A', 'Dự án', '✓', 'Tên dự án. Nếu chưa có sẽ tự tạo mới. VD: Marketing Growth System'],
                  ['B', 'Nhóm việc', '', 'Nhóm phân loại trong dự án. VD: KOL/Affiliate, Content, Finance…'],
                  ['C', 'Cấp độ', '', 'Milestone hoặc Task (xem giải thích bên dưới). Mặc định: Task'],
                  ['D', 'Tên đầu việc', '✓', 'Tên ngắn gọn, rõ ràng. VD: Thiết kế hệ thống KOL'],
                  ['E', 'Mô tả', '', 'Mô tả chi tiết việc cần làm'],
                  ['F', 'Output / Kết quả mong muốn', '', 'Đầu ra cụ thể. VD: Framework KOL hoàn chỉnh + quy trình chọn KOL'],
                  ['G', 'Owner', '', 'Tên nhân viên phụ trách. Phải khớp tên trong hệ thống. VD: Đào Hoàng Vũ'],
                  ['H', 'Deadline', '', 'Định dạng YYYY-MM-DD. VD: 2026-07-15'],
                  ['I', 'Ghi chú', '', 'Ghi chú nội bộ, lưu ý thêm'],
                ].map(([col, name, req, desc]) => (
                  <tr key={col} className="hover:bg-[var(--bg-surface)]/50">
                    <td className="px-3 py-2 font-bold text-[var(--olive)]">{col}</td>
                    <td className="px-3 py-2 font-semibold whitespace-nowrap">{name}</td>
                    <td className="px-3 py-2 text-center">{req ? <span className="text-[var(--danger)] font-bold">{req}</span> : <span className="text-[var(--text-muted)]">—</span>}</td>
                    <td className="px-3 py-2 text-[var(--text-secondary)] leading-5">{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Milestone vs Task */}
        <div>
          <p className="text-xs font-extrabold text-[var(--text-secondary)] uppercase tracking-wide mb-2">Milestone và Task khác nhau thế nào?</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-[var(--olive)]/30 bg-[var(--olive)]/5 p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="rounded-full bg-[var(--olive)] px-2.5 py-0.5 text-[11px] font-extrabold text-[var(--ivory)]">Milestone</span>
                <span className="text-xs text-[var(--text-muted)]">= Đầu việc lớn</span>
              </div>
              <ul className="space-y-1.5 text-xs text-[var(--text-secondary)] leading-5">
                <li>• Là <b>mốc quan trọng</b> hoặc <b>nhóm công việc</b> lớn trong dự án</li>
                <li>• Thường bao gồm nhiều Task nhỏ hơn bên dưới</li>
                <li>• VD: <i>Thiết kế hệ thống KOL</i>, <i>Xây chiến lược branding</i></li>
                <li>• Trong hệ thống sẽ hiển thị là <b>Đầu việc lớn (Workstream)</b></li>
              </ul>
            </div>
            <div className="rounded-xl border border-[var(--accent)]/30 bg-[var(--accent-soft)] p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="rounded-full bg-[var(--accent-hover)] px-2.5 py-0.5 text-[11px] font-extrabold text-white">Task</span>
                <span className="text-xs text-[var(--text-muted)]">= Đầu việc con</span>
              </div>
              <ul className="space-y-1.5 text-xs text-[var(--text-secondary)] leading-5">
                <li>• Là <b>công việc cụ thể</b>, có thể giao cho 1 người thực hiện</li>
                <li>• Sẽ tự động gắn vào Milestone cùng &quot;Nhóm việc&quot; (cột B) trong dự án</li>
                <li>• VD: <i>Viết JD tuyển KOL</i>, <i>Thiết lập OKR cho content</i></li>
                <li>• Trong hệ thống sẽ hiển thị là <b>Đầu việc con (Subtask)</b></li>
              </ul>
            </div>
          </div>
          <p className="mt-2 rounded-[var(--radius)] bg-[var(--bg-surface)] px-3 py-2 text-xs text-[var(--text-muted)]">
            <b>Mẹo:</b> Nếu cột B (Nhóm việc) của Task trùng với Nhóm việc của một Milestone trong cùng dự án, Task đó sẽ tự động trở thành đầu việc con của Milestone đó.
          </p>
        </div>

        {/* Luu ý */}
        <div className="rounded-[var(--radius)] border border-[var(--warning)]/30 bg-[var(--warning-soft)] p-4">
          <p className="mb-2 text-xs font-extrabold text-[var(--warning)]">Lưu ý quan trọng</p>
          <ul className="space-y-1.5 text-xs text-[var(--text-secondary)] leading-5">
            <li>• <b>Không xóa hoặc đổi tên hàng tiêu đề</b> (hàng 1) trong file mẫu</li>
            <li>• Tên Owner phải <b>khớp chính xác</b> với tên nhân viên đã có trong hệ thống</li>
            <li>• Deadline phải theo định dạng <b>YYYY-MM-DD</b> (VD: 2026-07-15). Sai định dạng sẽ bỏ qua deadline</li>
            <li>• Nếu Dự án chưa tồn tại trong hệ thống, hệ thống sẽ <b>tự tạo dự án mới</b></li>
            <li>• Nhập nhiều lần cùng file sẽ tạo ra <b>bản sao</b> — không tự dedup</li>
          </ul>
        </div>
      </div>

      {/* Duplicate warning */}
      {rows.length > 0 && (dupeChecking || dupeWarning.length > 0) && (
        <div className={`rounded-[var(--radius-lg)] border p-4 ${dupeWarning.length > 0 ? 'border-[var(--warning)]/50 bg-[var(--warning-soft)]' : 'border-[var(--border)] bg-[var(--bg-surface)]'}`}>
          {dupeChecking ? (
            <p className="text-xs text-[var(--text-muted)]">Đang kiểm tra trùng lặp…</p>
          ) : (
            <>
              <p className="text-xs font-extrabold text-[var(--warning)] mb-2">
                Phát hiện {dupeWarning.length} đầu việc có thể trùng với dữ liệu hiện có
              </p>
              <div className="overflow-x-auto mb-3">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[var(--warning)]/20 text-[var(--text-muted)] text-left">
                      {['#','Tên đầu việc','Dự án','Cấp độ'].map(h => (
                        <th key={h} className="py-1 pr-4 font-bold">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dupeWarning.map(d => (
                      <tr key={d.rowNum} className="border-b border-[var(--warning)]/10">
                        <td className="py-1.5 pr-4 text-[var(--text-muted)]">{d.rowNum}</td>
                        <td className="py-1.5 pr-4 font-semibold text-[var(--warning)]">{d.title}</td>
                        <td className="py-1.5 pr-4 max-w-[140px] truncate">{d.project}</td>
                        <td className="py-1.5 pr-4 capitalize">{d.level === 'workstream' ? 'Đầu việc lớn' : 'Đầu việc con'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setSkipDupes(true)}
                  className={`rounded-[var(--radius)] border px-4 py-1.5 text-xs font-bold transition-all ${skipDupes === true ? 'border-[var(--warning)] bg-[var(--warning)] text-[var(--ivory)]' : 'border-[var(--warning)]/50 bg-[var(--bg-card)] text-[var(--warning)] hover:bg-[var(--warning-soft)]'}`}>
                  Bỏ qua bản trùng — chỉ nhập mới
                </button>
                <button
                  onClick={() => setSkipDupes(false)}
                  className={`rounded-[var(--radius)] border px-4 py-1.5 text-xs font-bold transition-all ${skipDupes === false ? 'border-[var(--olive)] bg-[var(--olive)] text-[var(--ivory)]' : 'border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface)]'}`}>
                  Nhập tất cả (kể cả trùng)
                </button>
              </div>
              {skipDupes === null && (
                <p className="mt-2 text-[11px] text-[var(--text-muted)]">Chọn một phương án trên để tiếp tục nhập.</p>
              )}
            </>
          )}
        </div>
      )}

      {/* Preview */}
      {rows.length > 0 && (
        <div className="vyvy-card p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="vyvy-label">Parsed preview</p>
              <h3 className="mt-1 font-display text-lg">
                Xem trước <span className="font-sans text-sm font-normal normal-case text-[var(--text-muted)]">({validRows.length} hợp lệ{errorRows.length > 0 ? `, ${errorRows.length} lỗi` : ''})</span>
              </h3>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                {workstreamRows} đầu việc lớn · {subtaskRows} đầu việc con · {stepRows} bước
              </p>
            </div>
            <button
              onClick={doImport}
              disabled={importing || validRows.length === 0 || (dupeWarning.length > 0 && skipDupes === null)}
              className="vyvy-button-primary disabled:opacity-40">
              {importing ? 'Đang nhập…'
                : dupeWarning.length > 0 && skipDupes === null ? 'Chọn xử lý trùng trước'
                : `Xác nhận nhập ${validRows.length} mục`}
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="vyvy-table min-w-[980px]">
              <thead>
                <tr>
                  {['#','Dự án','Nhóm','Cấp độ','Tên đầu việc','Owner','Deadline','Cảnh báo'].map(h=>(
                    <th key={h} className="whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const badges = rowBadges(r)
                  return (
                    <tr key={r.rowNum} className={r.error ? 'bg-[var(--danger-soft)]' : ''}>
                      <td className="text-[var(--text-muted)]">{r.rowNum}</td>
                      <td className="max-w-[150px] truncate">{r.project || '—'}</td>
                      <td>{r.group || '—'}</td>
                      <td className="whitespace-nowrap">
                        <span className="rounded-full bg-[var(--bg-surface)] px-2 py-0.5 text-[11px] font-bold text-[var(--text-secondary)]">
                          {levelLabel(r.level)}
                        </span>
                      </td>
                      <td className="max-w-[240px] font-medium">{r.title || '—'}</td>
                      <td className="whitespace-nowrap">{r.owner || <span className="text-[var(--warning)]">Chưa gắn</span>}</td>
                      <td className="whitespace-nowrap">{r.deadline || <span className="text-[var(--warning)]">Chua có</span>}</td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          {badges.length === 0 ? (
                            <span className="rounded-full bg-[var(--success-soft)] px-2 py-0.5 text-[11px] font-bold text-[var(--success)]">Sẵn sàng</span>
                          ) : badges.map((badge) => (
                            <span key={badge.label} className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${badge.cls}`}>{badge.label}</span>
                          ))}
                        </div>
                        {r.error && <p className="mt-1 text-[11px] font-semibold text-[var(--danger)]">{r.error}</p>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className={`rounded-[var(--radius-lg)] border p-4 text-sm font-semibold ${result.fail === 0 ? 'border-[var(--success)]/30 bg-[var(--success-soft)] text-[var(--success)]' : 'border-[var(--warning)]/30 bg-[var(--warning-soft)] text-[var(--warning)]'}`}>
          Nhập xong: {result.ok} thành công{result.fail > 0 ? `, ${result.fail} lỗi (kiểm tra lại dữ liệu)` : ''}
        </div>
      )}

      {/* Dọn trùng DB */}
      <div className="vyvy-card p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="vyvy-label">Database hygiene</p>
            <h3 className="mt-1 font-display text-lg">Dọn đầu việc trùng</h3>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">Quét DB tìm workstream / đầu việc con có tên trùng nhau trong cùng dự án</p>
          </div>
          <button onClick={scanDbDupes} disabled={dbDupeScanning}
            className="vyvy-button-secondary disabled:opacity-50">
            {dbDupeScanning ? 'Đang quét…' : 'Quét trùng'}
          </button>
        </div>

        {dbDupeScanned && dbDupes.length === 0 && (
          <p className="text-xs text-[var(--success)] font-semibold">Không tìm thấy đầu việc trùng nào.</p>
        )}

        {dbDupes.length > 0 && (
          <>
            <p className="text-xs text-[var(--warning)] font-semibold mb-3">
              Phát hiện {dbDupes.length} nhóm trùng. Hệ thống sẽ <b>giữ bản cũ nhất</b>, xóa các bản sau.
            </p>
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {dbDupes.map((g, i) => (
                <div key={i} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--warning)]/30 bg-[var(--warning-soft)] px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold truncate">{g.title}</p>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      {g.projectName} · {g.level === 'workstream' ? 'Đầu việc lớn' : 'Đầu việc con'} · <span className="text-[var(--warning)]">{g.ids.length} bản</span> → xóa {g.ids.length - 1} bản thừa
                    </p>
                  </div>
                  <button
                    onClick={() => deleteDbDupeExtra(g)}
                    disabled={g.ids.slice(1).some(id => dbDupeDeleting.has(id))}
                    className="vyvy-button-danger min-h-0 shrink-0 px-3 py-1 disabled:opacity-50">
                    {g.ids.slice(1).some(id => dbDupeDeleting.has(id)) ? 'Đang xóa…' : `Xóa ${g.ids.length - 1} bản thừa`}
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={() => Promise.all(dbDupes.map(g => deleteDbDupeExtra(g)))}
              disabled={dbDupeDeleting.size > 0}
              className="vyvy-button-danger mt-3 disabled:opacity-50">
              {dbDupeDeleting.size > 0 ? 'Đang xóa…' : `Xóa tất cả ${dbDupes.reduce((s,g)=>s+g.ids.length-1,0)} bản thừa`}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// --- Calendar View -------------------------------------------------------------
type CalMode = 'month' | 'week' | 'day'

function CalendarView(props: {
  tasks: Task[]
  projects: Project[]
  employees: Employee[]
  employeeMap: Map<string, Employee>
  currentEmployee: Employee | null
  onOpenTask: (task: Task) => void
  recurringTasks?: RecurringTask[]
  meetingSessions?: MeetingSession[]
  onOpenRecurring?: (task: RecurringTask) => void
}) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const [mode, setMode] = useState<CalMode>('month')
  const [cursor, setCursor] = useState(new Date(today))
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)

  const projMap = useMemo(() => {
    const m = new Map<string, Project>()
    props.projects.forEach(p => m.set(p.id, p))
    return m
  }, [props.projects])

  // Build map: 'YYYY-MM-DD' -> Task[]
  const tasksByDate = useMemo(() => {
    const m = new Map<string, Task[]>()
    props.tasks.forEach(t => {
      if (!t.due_date) return
      const key = t.due_date.slice(0, 10)
      if (!m.has(key)) m.set(key, [])
      m.get(key)!.push(t)
    })
    return m
  }, [props.tasks])

  type MeetingCalEvent = { rt: RecurringTask; session?: MeetingSession; rescheduled?: boolean }

  // Build map: 'YYYY-MM-DD' -> MeetingCalEvent[]
  // Computed when cursor/mode changes (depends on visible day range)
  const meetingEventsByDate = useMemo(() => {
    const m = new Map<string, MeetingCalEvent[]>()
    const rts = props.recurringTasks || []
    const sessions = props.meetingSessions || []
    if (rts.length === 0) return m

    function dayKey(d: Date) {
      const y = d.getFullYear()
      const mo = String(d.getMonth() + 1).padStart(2, '0')
      const da = String(d.getDate()).padStart(2, '0')
      return `${y}-${mo}-${da}`
    }
    function addEvt(k: string, ev: MeetingCalEvent) {
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(ev)
    }

    // Map: scheduleId:originalDate -> rescheduled MeetingSession
    const rescheduledMap = new Map<string, MeetingSession>()
    sessions.forEach(s => {
      if (s.original_occurred_at && s.occurred_at !== s.original_occurred_at) {
        rescheduledMap.set(`${s.schedule_id}:${s.original_occurred_at}`, s)
      }
    })

    // Compute visible date range for current mode
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
    const last  = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0)
    // Pad to full calendar grid (42 cells, Monday-first) + extra week buffer
    const startPad = first.getDay() === 0 ? 6 : first.getDay() - 1
    const startDate = new Date(first); startDate.setDate(startDate.getDate() - startPad)
    const endDate   = new Date(last);  endDate.setDate(endDate.getDate() + (42 - last.getDate() - startPad + 1))

    rts.filter(rt => rt.is_active && rt.kind === 'meeting').forEach(rt => {
      // Walk every day in visible range
      const cur = new Date(startDate)
      while (cur <= endDate) {
        let occurs = false
        if (rt.frequency === 'weekly' && rt.weekday !== null) {
          occurs = cur.getDay() === rt.weekday
        } else if (rt.frequency === 'monthly' && rt.month_day !== null) {
          occurs = cur.getDate() === rt.month_day
        } else if (rt.frequency === 'daily') {
          occurs = true
        }
        if (occurs) {
          const k = dayKey(cur)
          const rescheduled = rescheduledMap.get(`${rt.id}:${k}`)
          if (rescheduled) {
            // Skip original date — will appear at new date below
          } else {
            addEvt(k, { rt })
          }
        }
        cur.setDate(cur.getDate() + 1)
      }

      // Add rescheduled sessions at their NEW date
      sessions
        .filter(s => s.schedule_id === rt.id && s.original_occurred_at && s.occurred_at !== s.original_occurred_at)
        .forEach(s => { addEvt(s.occurred_at, { rt, session: s, rescheduled: true }) })
    })

    return m
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.recurringTasks, props.meetingSessions, cursor, mode])

  const STATUS_COLOR: Record<string, string> = {
    completed:  'bg-[var(--success-soft)] text-[var(--success)] border border-[var(--success)]/20',
    in_progress:'bg-[var(--bg-surface)] text-[var(--olive)] border border-[var(--olive)]/20',
    pending:    'bg-[var(--warning-soft)] text-[var(--warning)] border border-[var(--warning)]/20',
    not_started:'bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border)]',
    overdue:    'bg-[var(--danger-soft)] text-[var(--danger)] border border-[var(--danger)]/20',
  }
  function taskColor(t: Task) {
    const isOverdue = t.due_date && new Date(t.due_date) < today && t.status !== 'completed'
    if (isOverdue) return STATUS_COLOR.overdue
    return STATUS_COLOR[t.status] || STATUS_COLOR.not_started
  }

  function fmtKey(d: Date) {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }
  function isSameDay(a: Date, b: Date) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  }
  function addMonths(d: Date, n: number) {
    const r = new Date(d)
    r.setMonth(r.getMonth() + n)
    return r
  }
  function addDays(d: Date, n: number) {
    const r = new Date(d)
    r.setDate(r.getDate() + n)
    return r
  }
  function addWeeks(d: Date, n: number) { return addDays(d, n * 7) }

  // -- Month grid --------------------------------------------------------------
  function getMonthDays(ref: Date) {
    const first = new Date(ref.getFullYear(), ref.getMonth(), 1)
    const last  = new Date(ref.getFullYear(), ref.getMonth() + 1, 0)
    const dow = first.getDay() // 0=Sun
    const startOffset = dow === 0 ? 6 : dow - 1 // Monday-first
    const days: Date[] = []
    for (let i = startOffset; i > 0; i--) days.push(addDays(first, -i))
    for (let i = 0; i < last.getDate(); i++) days.push(addDays(first, i))
    const rem = 42 - days.length
    for (let i = 1; i <= rem; i++) days.push(addDays(last, i))
    return days
  }
  // -- Week grid ---------------------------------------------------------------
  function getWeekDays(ref: Date) {
    const dow = ref.getDay()
    const toMon = dow === 0 ? -6 : 1 - dow
    const mon = addDays(ref, toMon)
    return Array.from({ length: 7 }, (_, i) => addDays(mon, i))
  }

  const DOW_LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']
  const VI_MONTHS = ['Tháng 1','Tháng 2','Tháng 3','Tháng 4','Tháng 5','Tháng 6','Tháng 7','Tháng 8','Tháng 9','Tháng 10','Tháng 11','Tháng 12']

  function navLabel() {
    if (mode === 'month') return `${VI_MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`
    if (mode === 'week') {
      const days = getWeekDays(cursor)
      return `${days[0].getDate()}/${days[0].getMonth()+1} – ${days[6].getDate()}/${days[6].getMonth()+1}/${days[6].getFullYear()}`
    }
    return `${cursor.getDate()}/${cursor.getMonth()+1}/${cursor.getFullYear()}`
  }
  function navPrev() {
    if (mode === 'month') setCursor(addMonths(cursor, -1))
    else if (mode === 'week') setCursor(addWeeks(cursor, -1))
    else setCursor(addDays(cursor, -1))
  }
  function navNext() {
    if (mode === 'month') setCursor(addMonths(cursor, 1))
    else if (mode === 'week') setCursor(addWeeks(cursor, 1))
    else setCursor(addDays(cursor, 1))
  }

  const selectedTasks    = selectedDay ? (tasksByDate.get(fmtKey(selectedDay)) || []) : null
  const selectedMeetings = selectedDay ? (meetingEventsByDate.get(fmtKey(selectedDay)) || []) : null

  function DayCell({ day, inMonth }: { day: Date; inMonth: boolean }) {
    const key = fmtKey(day)
    const dayTasks    = tasksByDate.get(key) || []
    const dayMeetings = meetingEventsByDate.get(key) || []
    const isToday = isSameDay(day, today)
    const isSel = selectedDay && isSameDay(day, selectedDay)
    const MAX_SHOW = 2
    const totalEvents = dayTasks.length + dayMeetings.length
    const shownMeetings = dayMeetings.slice(0, Math.max(0, MAX_SHOW - dayTasks.slice(0, MAX_SHOW).length))
    return (
      <div
        onClick={() => setSelectedDay(isSel ? null : day)}
        className={`min-h-[80px] p-1.5 cursor-pointer rounded-lg border transition-all ${isSel ? 'border-[var(--olive)] bg-[var(--olive)]/5' : 'border-transparent hover:border-[var(--border)] hover:bg-[var(--bg-surface)]'}`}>
        <div className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full mb-1 ${isToday ? 'bg-[var(--olive)] text-[var(--ivory)]' : inMonth ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}>
          {day.getDate()}
        </div>
        <div className="space-y-0.5">
          {dayTasks.slice(0, MAX_SHOW).map(t => (
            <div key={t.id} onClick={(e) => { e.stopPropagation(); props.onOpenTask(t) }}
              className={`truncate rounded px-1 py-0.5 text-[10px] font-medium cursor-pointer ${taskColor(t)}`}>
              {t.title}
            </div>
          ))}
          {shownMeetings.map((ev, i) => (
            <div key={`m-${i}`} onClick={(e) => { e.stopPropagation(); props.onOpenRecurring?.(ev.rt) }}
              className={`truncate rounded px-1 py-0.5 text-[10px] font-bold cursor-pointer ${ev.rescheduled ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-blue-50 text-blue-700 border border-blue-200'}`}>
              {ev.rescheduled ? '↔ ' : '◆ '}{ev.rt.title}
            </div>
          ))}
          {totalEvents > MAX_SHOW && (
            <div className="text-[10px] text-[var(--text-muted)] pl-1">+{totalEvents - MAX_SHOW} thêm</div>
          )}
        </div>
      </div>
    )
  }

  const monthDays   = mode === 'month' ? getMonthDays(cursor) : []
  const weekDays    = mode === 'week'  ? getWeekDays(cursor)  : []
  const dayTasks    = mode === 'day'   ? (tasksByDate.get(fmtKey(cursor)) || []) : []
  const dayMeetings = mode === 'day'   ? (meetingEventsByDate.get(fmtKey(cursor)) || []) : []

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] px-5 py-3">
        <div className="flex items-center gap-2">
          <button onClick={navPrev} className="rounded-lg border border-[var(--border)] p-1.5 hover:bg-[var(--bg-surface)]">
            <Ico d={IC.chevronLeft} size={16}/>
          </button>
          <span className="text-sm font-bold min-w-[180px] text-center">{navLabel()}</span>
          <button onClick={navNext} className="rounded-lg border border-[var(--border)] p-1.5 hover:bg-[var(--bg-surface)]">
            <Ico d={IC.chevronRight} size={16}/>
          </button>
          <button onClick={() => { setCursor(new Date(today)); setSelectedDay(null) }}
            className="ml-1 rounded-lg border border-[var(--border)] px-3 py-1 text-xs font-semibold hover:bg-[var(--bg-surface)]">
            Hôm nay
          </button>
        </div>
        <div className="flex rounded-lg border border-[var(--border)] overflow-hidden">
          {(['month','week','day'] as CalMode[]).map(m => (
            <button key={m} onClick={() => setMode(m)}
              className={`px-3 py-1.5 text-xs font-semibold transition-all ${mode === m ? 'bg-[var(--olive)] text-[var(--ivory)]' : 'hover:bg-[var(--bg-surface)]'}`}>
              {m === 'month' ? 'Tháng' : m === 'week' ? 'Tuần' : 'Ngày'}
            </button>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 px-1 text-[11px] font-medium">
        {[
          { label: 'Hoàn thành', cls: 'bg-[var(--success)]' },
          { label: 'Đang làm', cls: 'bg-[var(--olive)]' },
          { label: 'Pending', cls: 'bg-[var(--warning)]' },
          { label: 'Chưa bắt đầu', cls: 'bg-[var(--bg-surface)] border border-[var(--border)]' },
          { label: 'Trễ deadline', cls: 'bg-[var(--danger)]' },
          { label: 'Cuộc họp', cls: 'bg-blue-100 border border-blue-200' },
          { label: 'Họp đã dời', cls: 'bg-amber-100 border border-amber-200' },
        ].map(l => (
          <div key={l.label} className="flex items-center gap-1.5">
            <span className={`w-3 h-3 rounded-sm inline-block ${l.cls}`}/>
            <span className="text-[var(--text-secondary)]">{l.label}</span>
          </div>
        ))}
      </div>

      {/* Month view */}
      {mode === 'month' && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-3">
          <div className="grid grid-cols-7 mb-1">
            {DOW_LABELS.map(d => (
              <div key={d} className="text-center text-[11px] font-bold text-[var(--text-muted)] py-2">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {monthDays.map((day, i) => (
              <DayCell key={i} day={day} inMonth={day.getMonth() === cursor.getMonth()} />
            ))}
          </div>
        </div>
      )}

      {/* Week view */}
      {mode === 'week' && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-3">
          <div className="grid grid-cols-7 gap-1">
            {weekDays.map((day, i) => (
              <div key={i}>
                <div className={`text-center text-[11px] font-bold py-2 rounded-lg mb-1 ${isSameDay(day, today) ? 'bg-[var(--olive)] text-[var(--ivory)]' : 'text-[var(--text-muted)]'}`}>
                  {DOW_LABELS[i]}<br/><span className="text-xs">{day.getDate()}/{day.getMonth()+1}</span>
                </div>
                <DayCell day={day} inMonth />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Day view */}
      {mode === 'day' && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className={`text-sm font-bold px-3 py-1 rounded-lg ${isSameDay(cursor, today) ? 'bg-[var(--olive)] text-[var(--ivory)]' : 'bg-[var(--bg-surface)]'}`}>
              {DOW_LABELS[(cursor.getDay() + 6) % 7]} — {cursor.getDate()}/{cursor.getMonth()+1}/{cursor.getFullYear()}
            </span>
            <span className="text-xs text-[var(--text-muted)]">{dayTasks.length} đầu việc{dayMeetings.length > 0 ? ` · ${dayMeetings.length} cuộc họp` : ''}</span>
          </div>
          {dayTasks.length === 0 && dayMeetings.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)] text-center py-8">Không có đầu việc hay cuộc họp nào hôm này.</p>
          ) : (
            <div className="space-y-2">
              {dayMeetings.map((ev, i) => (
                <div key={`m-${i}`} onClick={() => props.onOpenRecurring?.(ev.rt)}
                  className={`flex items-center gap-3 rounded-xl border px-4 py-3 cursor-pointer hover:opacity-80 ${ev.rescheduled ? 'border-amber-200 bg-amber-50' : 'border-blue-200 bg-blue-50'}`}>
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${ev.rescheduled ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                    {ev.rescheduled ? 'Đã dời' : 'Cuộc họp'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{ev.rt.title}</p>
                    <p className="text-xs text-[var(--text-muted)]">
                      {ev.session?.start_time?.slice(0,5) || ev.rt.time_of_day?.slice(0,5)}
                      {ev.rescheduled && ev.session?.original_occurred_at && ` · Dời từ ${ev.session.original_occurred_at.split('-').reverse().join('/')}`}
                    </p>
                  </div>
                </div>
              ))}
              {dayTasks.map(t => (
                <div key={t.id} onClick={() => props.onOpenTask(t)}
                  className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-3 cursor-pointer hover:border-[var(--olive)]/50 hover:bg-[var(--bg-hover)]">
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${taskColor(t)}`}>
                    {t.status === 'completed' ? 'Hoàn thành' : t.status === 'in_progress' ? 'Đang làm' : t.status === 'pending' ? 'Pending' : 'Chưa bắt đầu'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{t.title}</p>
                    <p className="text-xs text-[var(--text-muted)]">{projMap.get(t.project_id || '')?.name || ''}</p>
                  </div>
                  {t.deadline_status === 'extension_requested' && (
                    <span className="shrink-0 rounded-full bg-[var(--warning-soft)] px-2 py-0.5 text-[10px] font-bold text-[var(--warning)]">Đang xin gia hạn</span>
                  )}
                  {t.assignee_id && props.employeeMap.get(t.assignee_id) && (
                    <span className="shrink-0 text-xs text-[var(--text-secondary)]">{props.employeeMap.get(t.assignee_id)!.full_name}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Selected day task list (month/week only) */}
      {selectedDay && (selectedTasks || selectedMeetings) && (mode === 'month' || mode === 'week') && (
        <div className="rounded-2xl border border-[var(--olive)]/30 bg-[var(--bg-card)] p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-extrabold">
              {selectedDay.getDate()}/{selectedDay.getMonth()+1}/{selectedDay.getFullYear()}
              <span className="font-normal text-[var(--text-muted)] ml-2">
                — {(selectedTasks?.length || 0)} đầu việc{(selectedMeetings?.length || 0) > 0 ? ` · ${selectedMeetings!.length} cuộc họp` : ''}
              </span>
            </h3>
            <button onClick={() => setSelectedDay(null)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
              <Ico d={IC.x} size={16}/>
            </button>
          </div>
          {(selectedTasks?.length || 0) === 0 && (selectedMeetings?.length || 0) === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">Không có đầu việc hay cuộc họp nào ngày này.</p>
          ) : (
            <div className="space-y-2">
              {(selectedMeetings || []).map((ev, i) => (
                <div key={`m-${i}`} onClick={() => props.onOpenRecurring?.(ev.rt)}
                  className={`flex items-center gap-3 rounded-xl border px-4 py-3 cursor-pointer hover:opacity-80 ${ev.rescheduled ? 'border-amber-200 bg-amber-50' : 'border-blue-200 bg-blue-50'}`}>
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${ev.rescheduled ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                    {ev.rescheduled ? 'Đã dời' : 'Cuộc họp'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{ev.rt.title}</p>
                    <p className="text-xs text-[var(--text-muted)]">
                      {ev.session?.start_time?.slice(0,5) || ev.rt.time_of_day?.slice(0,5)}
                      {ev.rescheduled && ev.session?.original_occurred_at && ` · Dời từ ${ev.session.original_occurred_at.split('-').reverse().join('/')}`}
                      {ev.session?.reschedule_reason && ` · ${ev.session.reschedule_reason}`}
                    </p>
                  </div>
                </div>
              ))}
              {(selectedTasks || []).map(t => (
                <div key={t.id} onClick={() => props.onOpenTask(t)}
                  className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-3 cursor-pointer hover:border-[var(--olive)]/50 hover:bg-[var(--bg-hover)]">
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${taskColor(t)}`}>
                    {t.status === 'completed' ? 'Hoàn thành' : t.status === 'in_progress' ? 'Đang làm' : t.status === 'pending' ? 'Pending' : 'Chưa bắt đầu'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{t.title}</p>
                    <p className="text-xs text-[var(--text-muted)]">{projMap.get(t.project_id || '')?.name || ''}</p>
                  </div>
                  {t.deadline_status === 'extension_requested' && (
                    <span className="shrink-0 rounded-full bg-[var(--warning-soft)] px-2 py-0.5 text-[10px] font-bold text-[var(--warning)]">Đang xin gia hạn</span>
                  )}
                  {t.assignee_id && props.employeeMap.get(t.assignee_id) && (
                    <span className="shrink-0 text-xs text-[var(--text-secondary)]">{props.employeeMap.get(t.assignee_id)!.full_name}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Lịch sử & Restore ─────────────────────────────────────────────────────────
type TaskVersion = {
  id: string
  task_id: string
  version: number
  change_type: string
  changed_by: string | null
  changed_at: string
  snapshot: Record<string, unknown>
}

function HistoryView(props: {
  employees: Employee[]
  employeeMap: Map<string, Employee>
  tasks: Task[]
  currentEmployee: Employee | null
}) {
  const [versions, setVersions] = useState<TaskVersion[]>([])
  const [loading, setLoading] = useState(true)
  const [restoring, setRestoring] = useState<string | null>(null)
  const [expandedTask, setExpandedTask] = useState<string | null>(null)
  const [filterTask, setFilterTask] = useState('')
  const [toast2, setToast2] = useState('')

  const taskMap = useMemo(() => new Map(props.tasks.map(t => [t.id, t])), [props.tasks])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('task_versions')
      .select('*')
      .order('changed_at', { ascending: false })
      .limit(200)
    setVersions((data || []) as TaskVersion[])
    setLoading(false)
  }

  useEffect(() => { void load() }, [])

  async function restore(v: TaskVersion) {
    if (!confirm(`Khôi phục về version ${v.version}? Thao tác này sẽ ghi đè dữ liệu hiện tại.`)) return
    setRestoring(v.id)
    const snap = { ...v.snapshot } as Record<string, unknown>
    delete snap.id; delete snap.created_at
    // Save current as a new version first
    const cur = props.tasks.find(t => t.id === v.task_id)
    if (cur) {
      const { data: lastVer } = await supabase.from('task_versions').select('version').eq('task_id', v.task_id).order('version', { ascending: false }).limit(1).single()
      await supabase.from('task_versions').insert({
        task_id: v.task_id, version: (lastVer?.version || 0) + 1,
        change_type: 'before_restore', changed_by: props.currentEmployee?.id || null,
        snapshot: cur,
      })
    }
    await supabase.from('tasks').update(snap).eq('id', v.task_id)
    setRestoring(null)
    setToast2('✓ Đã khôi phục về version ' + v.version)
    setTimeout(() => setToast2(''), 3000)
    await load()
  }

  const changeTypeLabel: Record<string, string> = {
    insert: 'Tạo mới', update: 'Cập nhật', delete: 'Xóa', before_restore: 'Trước khi restore',
  }

  const filtered = filterTask
    ? versions.filter(v => {
        const t = taskMap.get(v.task_id)
        return t?.title.toLowerCase().includes(filterTask.toLowerCase()) || v.task_id.includes(filterTask)
      })
    : versions

  // Group by task
  const byTask = new Map<string, TaskVersion[]>()
  filtered.forEach(v => {
    if (!byTask.has(v.task_id)) byTask.set(v.task_id, [])
    byTask.get(v.task_id)!.push(v)
  })

  return (
    <div className="space-y-4">
      {toast2 && (
        <div className="rounded-xl border border-[var(--success)]/30 bg-[var(--success-soft)] px-4 py-2 text-sm font-semibold text-[var(--success)]">{toast2}</div>
      )}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <h3 className="text-sm font-extrabold flex-1">Lịch sử thay đổi</h3>
          <input
            className="w-56 rounded-lg border border-[var(--border)] bg-[var(--bg-base)] px-3 py-1.5 text-xs outline-none focus:border-[var(--border-strong)]"
            placeholder="Tìm theo tên đầu việc..."
            value={filterTask}
            onChange={e => setFilterTask(e.target.value)}
          />
          <button onClick={load} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-bold hover:border-[var(--border-strong)]">↺ Làm mới</button>
        </div>

        {loading ? (
          <div className="space-y-2">{[1,2,3].map(i=><div key={i} className="skeleton h-12 rounded-xl"/>)}</div>
        ) : byTask.size === 0 ? (
          <div className="py-10 text-center text-sm text-[var(--text-muted)]">
            <p>Chưa có lịch sử nào.</p>
            <p className="mt-1 text-xs">Lịch sử sẽ được ghi lại khi đầu việc được tạo hoặc cập nhật.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {Array.from(byTask.entries()).map(([taskId, vlist]) => {
              const task = taskMap.get(taskId)
              const isOpen = expandedTask === taskId
              return (
                <div key={taskId} className="rounded-xl border border-[var(--border)] overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setExpandedTask(isOpen ? null : taskId)}
                    className="w-full flex items-center gap-3 px-4 py-3 bg-[var(--bg-surface)] hover:bg-[var(--border)]/30 text-left"
                  >
                    <span className="flex-1 font-semibold text-sm truncate">{task?.title || taskId}</span>
                    <span className="shrink-0 text-xs text-[var(--text-muted)]">{vlist.length} phiên bản</span>
                    <span className="shrink-0 text-xs text-[var(--text-muted)]">{isOpen ? 'v' : '>'}</span>
                  </button>
                  {isOpen && (
                    <div className="divide-y divide-[var(--border)]">
                      {vlist.map(v => {
                        const changer = props.employeeMap.get(v.changed_by || '')
                        const snap = v.snapshot as Record<string, unknown>
                        return (
                          <div key={v.id} className="flex items-start gap-3 px-4 py-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-2 mb-1">
                                <span className="text-xs font-bold text-[var(--text-primary)]">v{v.version}</span>
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${v.change_type === 'insert' ? 'bg-[var(--success-soft)] text-[var(--success)]' : v.change_type === 'delete' ? 'bg-[var(--danger-soft)] text-[var(--danger)]' : 'bg-[var(--accent-soft)] text-[var(--accent-hover)]'}`}>
                                  {changeTypeLabel[v.change_type] || v.change_type}
                                </span>
                                <span className="text-xs text-[var(--text-muted)]">{changer?.full_name || 'Hệ thống'}</span>
                                <span className="text-xs text-[var(--text-muted)]">· {new Date(v.changed_at).toLocaleString('vi-VN')}</span>
                              </div>
                              <div className="text-xs text-[var(--text-secondary)] space-y-0.5">
                                {snap.title ? <div>Tên: <b>{String(snap.title)}</b></div> : null}
                                {snap.status ? <div>Trạng thái: <b>{String(snap.status)}</b></div> : null}
                                {snap.due_date ? <div>Deadline: <b>{String(snap.due_date)}</b></div> : null}
                              </div>
                            </div>
                            <button
                              onClick={() => restore(v)}
                              disabled={restoring === v.id}
                              className="shrink-0 rounded-lg border border-[var(--border)] px-3 py-1.5 text-[11px] font-bold hover:border-[var(--olive)] hover:text-[var(--olive)] disabled:opacity-40 transition-colors"
                            >
                              {restoring === v.id ? '...' : 'Restore'}
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function AdminDepartmentsSection(props: { departments: Department[]; onRefresh: () => void }) {
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editCode, setEditCode] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true); setErr('')
    const { error } = await supabase.from('departments').insert({ name: name.trim(), code: code.trim() || null })
    setSaving(false)
    if (error) { setErr(error.message); return }
    setName(''); setCode(''); setShowForm(false)
    props.onRefresh()
    toast('Đã thêm phòng ban')
  }

  async function handleEdit(id: string) {
    if (!editName.trim()) return
    setEditSaving(true)
    await supabase.from('departments').update({ name: editName.trim(), code: editCode.trim() || null }).eq('id', id)
    setEditSaving(false); setEditId(null)
    props.onRefresh()
    toast('Đã cập nhật phòng ban')
  }

  async function handleDelete(dept: Department) {
    const ok = await confirmDialog(`Xóa phòng ban "${dept.name}"? Các nhân viên thuộc phòng ban này sẽ mất liên kết.`)
    if (!ok) return
    setDeletingId(dept.id)
    await supabase.from('departments').delete().eq('id', dept.id)
    setDeletingId(null)
    props.onRefresh()
    toast('Đã xóa phòng ban')
  }

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-extrabold text-sm text-[var(--text-primary)]">Phòng ban ({props.departments.length})</h3>
        {!showForm && (
          <button type="button" onClick={() => setShowForm(true)}
            className="flex items-center gap-1 rounded-xl bg-[var(--olive)] px-3 py-1.5 text-xs font-bold text-[var(--ivory)] hover:opacity-90">
            <Ico d={IC.plus} size={12} /> Thêm phòng ban
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="mb-4 flex flex-wrap gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-3">
          <input required value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Tên phòng ban *" className="h-8 flex-1 min-w-[160px] rounded-lg border border-[var(--border)] bg-[var(--bg-base)] px-3 text-sm outline-none" />
          <input value={code} onChange={(e) => setCode(e.target.value)}
            placeholder="Mã (VD: KD, MKT)" className="h-8 w-28 rounded-lg border border-[var(--border)] bg-[var(--bg-base)] px-3 text-sm outline-none" />
          {err && <p className="w-full text-xs text-[var(--danger)]">{err}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={saving}
              className="rounded-lg bg-[var(--olive)] px-4 py-1.5 text-xs font-bold text-[var(--ivory)] disabled:opacity-60">
              {saving ? 'Đang lưu...' : 'Lưu'}
            </button>
            <button type="button" onClick={() => { setShowForm(false); setErr('') }}
              className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-bold text-[var(--text-secondary)]">
              Hủy
            </button>
          </div>
        </form>
      )}

      {props.departments.length === 0 ? (
        <p className="text-center text-sm text-[var(--text-muted)] py-4">Chua có phòng ban nào</p>
      ) : (
        <div className="divide-y divide-[var(--border)]">
          {props.departments.map((dept) => (
            <div key={dept.id} className="flex items-center gap-3 py-2.5">
              {editId === dept.id ? (
                <>
                  <input value={editName} onChange={(e) => setEditName(e.target.value)}
                    className="h-7 flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-base)] px-2 text-sm outline-none" />
                  <input value={editCode} onChange={(e) => setEditCode(e.target.value)}
                    placeholder="Mã" className="h-7 w-20 rounded-lg border border-[var(--border)] bg-[var(--bg-base)] px-2 text-sm outline-none" />
                  <button type="button" disabled={editSaving} onClick={() => handleEdit(dept.id)}
                    className="rounded-lg bg-[var(--olive)] px-3 py-1 text-xs font-bold text-[var(--ivory)] disabled:opacity-60">
                    {editSaving ? '...' : 'Lưu'}
                  </button>
                  <button type="button" onClick={() => setEditId(null)}
                    className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs text-[var(--text-muted)]">
                    Hủy
                  </button>
                </>
              ) : (
                <>
                  <div className="flex-1 min-w-0">
                    <span className="font-semibold text-sm text-[var(--text-primary)]">{dept.name}</span>
                    {dept.code && <span className="ml-2 rounded-full bg-[var(--bg-base)] px-2 py-0.5 text-[10px] font-bold text-[var(--text-muted)]">{dept.code}</span>}
                  </div>
                  <button type="button" onClick={() => { setEditId(dept.id); setEditName(dept.name); setEditCode(dept.code || '') }}
                    className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--bg-surface)]">
                    Sửa
                  </button>
                  <button type="button" disabled={deletingId === dept.id} onClick={() => handleDelete(dept)}
                    className="rounded-lg border border-[var(--danger)]/30 px-2 py-1 text-xs font-bold text-[var(--danger)] hover:bg-[var(--danger)]/5 disabled:opacity-50">
                    {deletingId === dept.id ? '...' : 'Xóa'}
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// --- MyWorkView ---------------------------------------------------------------
// View "Việc được giao": danh sách task của tôi + inbox deadline

function MyWorkView(props: {
  tasks: Task[]
  allSteps: TaskStep[]
  stepsByTask: Map<string, TaskStep[]>
  supportersByTask: Map<string, TaskSupporter[]>
  currentEmployee: Employee | null
  employeeMap: Map<string, Employee>
  setSelectedTask: (task: Task) => void
  employees: Employee[]
  seeAll: boolean
}) {
  const myId = props.currentEmployee?.id || ''
  const taskMap = new Map(props.tasks.map((t) => [t.id, t]))

  // Tuần lịch thực (T2–CN)
  const todayD = new Date(); todayD.setHours(0, 0, 0, 0)
  const dow = todayD.getDay()
  const toMon = dow === 0 ? -6 : 1 - dow
  const wkStart = new Date(todayD); wkStart.setDate(todayD.getDate() + toMon)
  const wkEnd = new Date(wkStart); wkEnd.setDate(wkStart.getDate() + 6)

  function isDueThisWeek(t: Task) {
    if (!t.due_date) return false
    const d = new Date(t.due_date); d.setHours(0, 0, 0, 0)
    return d >= wkStart && d <= wkEnd
  }

  const myTasks = props.tasks.filter((t) => {
    if (t.status === 'completed' || t.status === 'cancelled') return false
    return taskParticipantIds(t, props.supportersByTask.get(t.id) || []).includes(myId)
  })

  // Bước tôi cần nộp (owner, chưa nộp hoặc cần làm lại)
  const myPendingSubmit = props.allSteps.filter((s) =>
    s.owner_id === myId && (s.approval_status === 'not_submitted' || s.approval_status === 'revision' || !s.approval_status) && !s.is_done
  )

  // Bước chờ tôi duyệt
  const myPendingApprove = props.allSteps.filter((s) =>
    stepApproverIds(s).includes(myId) && s.approval_status === 'pending'
  )

  // Phân nhóm task theo mức cấp bách
  const activeTasks = myTasks.filter((t) => t.status !== 'pending_approval')
  const urgent   = activeTasks.filter((t) => isTaskOverdue(t) || myPendingSubmit.some((s) => s.approval_status === 'revision' && taskMap.get(s.task_id)?.id === t.id))
  const thisWeek = activeTasks.filter((t) => !isTaskOverdue(t) && isDueThisWeek(t))
  const inProg   = activeTasks.filter((t) => !isTaskOverdue(t) && !isDueThisWeek(t) && t.status === 'in_progress')
  const notStart = activeTasks.filter((t) => !isTaskOverdue(t) && !isDueThisWeek(t) && (t.status === 'not_started' || !t.status))
  const pending  = myTasks.filter((t) => t.status === 'pending_approval')

  type TG = { key: string; label: string; accent: string; headerCls: string; tasks: Task[] }
  const groups: TG[] = [
    { key: 'urgent',   label: 'Cần xử lý ngay',        accent: 'var(--danger)',  headerCls: 'border-[var(--danger)]/30 bg-[var(--danger-soft)]',   tasks: urgent },
    { key: 'week',     label: 'Deadline tuần này',      accent: 'var(--warning)', headerCls: 'border-[var(--warning)]/30 bg-[var(--warning-soft)]', tasks: thisWeek },
    { key: 'progress', label: 'Đang thực hiện',         accent: 'var(--olive)',   headerCls: 'border-[var(--border)] bg-[var(--bg-surface)]',        tasks: inProg },
    { key: 'new',      label: 'Chưa bắt đầu',           accent: 'var(--text-secondary)', headerCls: 'border-[var(--border)] bg-[var(--bg-surface)]', tasks: notStart },
    { key: 'pend',     label: 'Chờ phân công duyệt',    accent: 'var(--text-secondary)', headerCls: 'border-[var(--border)] bg-[var(--bg-surface)]', tasks: pending },
  ].filter((g) => g.tasks.length > 0)

  const isEmpty = myTasks.length === 0 && myPendingSubmit.length === 0 && myPendingApprove.length === 0

  function TaskRow({ task }: { task: Task }) {
    const steps = props.stepsByTask.get(task.id) || []
    const progress = calculateTaskProgress(task, steps)
    const myStepsToSubmit = steps.filter((s) => s.owner_id === myId && (s.approval_status === 'not_submitted' || s.approval_status === 'revision' || !s.approval_status) && !s.is_done)
    const myStepsToApprove = steps.filter((s) => stepApproverIds(s).includes(myId) && s.approval_status === 'pending')
    const headIds = task.head_ids && task.head_ids.length > 0 ? task.head_ids : (task.head_id ? [task.head_id] : [])
    const headNames = headIds.map((id) => props.employeeMap.get(id)?.full_name).filter(Boolean).join(', ')
    const assignee = props.employeeMap.get(task.assignee_id || '')
    const overdue = isTaskOverdue(task)
    const myRole = taskRoleForEmployee(task, myId, props.supportersByTask.get(task.id) || []).toUpperCase()

    // Nút hành động ưu tiên
    let actionLabel = 'Chi tiết'
    let actionCls = 'border-[var(--border)] text-[var(--text-primary)] hover:bg-[var(--bg-base)]'
    if (myStepsToApprove.length > 0) { actionLabel = `Duyệt ${myStepsToApprove.length} bước`; actionCls = 'border-[var(--warning)]/50 bg-[var(--warning-soft)] text-[var(--warning)] hover:bg-[var(--warning)]/20' }
    else if (myStepsToSubmit.some((s) => s.approval_status === 'revision')) { actionLabel = 'Làm lại bước'; actionCls = 'border-[var(--danger)]/40 bg-[var(--danger-soft)] text-[var(--danger)] hover:bg-[var(--danger)]/20' }
    else if (myStepsToSubmit.length > 0) { actionLabel = `Nộp bước`; actionCls = 'border-[var(--olive)]/50 bg-[var(--bg-surface)] text-[var(--olive)] hover:border-[var(--olive)]' }
    else if (task.status === 'not_started' && task.assignee_id === myId) { actionLabel = 'Bắt đầu'; actionCls = 'border-[var(--olive)] text-[var(--olive)] hover:bg-[var(--olive)] hover:text-[var(--ivory)]' }

    return (
      <div className="flex items-center gap-3 px-5 py-3 hover:bg-[var(--bg-surface)] transition-colors">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-semibold text-[var(--text-primary)]">{task.title}</span>
            <IssueBadge issueStatus={task.issue_status} />
            {task.due_date && (
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${overdue ? 'bg-[var(--danger-soft)] text-[var(--danger)]' : isDueThisWeek(task) ? 'bg-[var(--warning-soft)] text-[var(--warning)]' : 'text-[var(--text-muted)]'}`}>
                {overdue ? 'TRỄ ' : ''}{task.due_date.slice(5)}
              </span>
            )}
            <span className="shrink-0 rounded-full border border-[var(--border)] px-1.5 py-0.5 text-[9px] font-bold text-[var(--text-muted)]">{myRole}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-[var(--text-secondary)]">
            {headNames && <span><span className="font-spec text-[9px] text-[var(--text-muted)]">GIAO</span> {headNames}</span>}
            {assignee && <span><span className="font-spec text-[9px] text-[var(--text-muted)]">CHÍNH</span> {assignee.full_name}</span>}
            {taskCoOwnerIds(task).length > 0 && <span><span className="font-spec text-[9px] text-[var(--text-muted)]">ĐỒNG PT</span> {peopleLabel(taskCoOwnerIds(task), props.employeeMap)}</span>}
            {taskSupporterIds(task, props.supportersByTask.get(task.id) || []).length > 0 && <span><span className="font-spec text-[9px] text-[var(--text-muted)]">HỖ TRỢ</span> {peopleLabel(taskSupporterIds(task, props.supportersByTask.get(task.id) || []), props.employeeMap)}</span>}
            <span>{steps.length} bước</span>
            {steps.length > 0 && (
              <span className="flex items-center gap-1.5">
                <span className="h-1 w-16 overflow-hidden rounded-full bg-[var(--border)]">
                  <span className="block h-full rounded-full bg-[var(--olive)]" style={{ width: `${progress}%` }} />
                </span>
                <b className="text-[var(--text-primary)]">{progress}%</b>
              </span>
            )}
            {myStepsToApprove.length > 0 && <span className="font-bold text-[var(--warning)]">{myStepsToApprove.length} bước chờ tôi duyệt</span>}
            {myStepsToSubmit.length > 0 && <span className="font-bold text-[var(--olive)]">{myStepsToSubmit.length} bước chưa nộp</span>}
          </div>
        </div>
        <button type="button" onClick={() => props.setSelectedTask(task)}
          className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors ${actionCls}`}>
          {actionLabel}
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <MyDeadlineInbox tasks={props.tasks} currentUserId={myId} employees={props.employees} seeAll={props.seeAll} />

      {/* Bước chờ tôi duyệt */}
      {myPendingApprove.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-[var(--warning)]/40 bg-[var(--bg-card)]">
          <div className="flex items-center gap-2 border-b border-[var(--warning)]/30 bg-[var(--warning-soft)] px-5 py-3">
            <p className="text-sm font-extrabold text-[var(--warning)]">Bước chờ tôi duyệt</p>
            <span className="rounded-full bg-[var(--warning)]/20 px-2 py-0.5 text-xs font-bold text-[var(--warning)]">{myPendingApprove.length}</span>
          </div>
          <div className="divide-y divide-[var(--border)]">
            {myPendingApprove.map((step) => {
              const task = taskMap.get(step.task_id)
              const owner = props.employeeMap.get(step.owner_id || '')
              return (
                <div key={step.id} className="flex items-center gap-3 px-5 py-3 hover:bg-[var(--bg-surface)] transition-colors">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-[var(--text-primary)]">{step.step_title}</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-[var(--text-secondary)]">
                      {task && <span className="text-[var(--text-muted)]">? {task.title}</span>}
                      {owner && <span><span className="font-spec text-[9px]">NỘP BỞI</span> {owner.full_name}</span>}
                      {step.due_date && <span>· Hạn {step.due_date}</span>}
                      {(step.report_file_url || step.report_link || step.note) && <span className="font-bold text-[var(--success)]">Có báo cáo ?</span>}
                    </div>
                  </div>
                  {task && (
                    <button type="button" onClick={() => props.setSelectedTask(task)}
                      className="shrink-0 rounded-lg border border-[var(--warning)]/50 bg-[var(--warning)]/10 px-3 py-1.5 text-xs font-bold text-[var(--warning)] hover:bg-[var(--warning)]/20">
                      Duyệt ngay
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Bước tôi cần nộp */}
      {myPendingSubmit.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-[var(--olive)]/30 bg-[var(--bg-card)]">
          <div className="flex items-center gap-2 border-b border-[var(--olive)]/20 bg-[var(--bg-surface)] px-5 py-3">
            <p className="text-sm font-extrabold">Bước tôi cần nộp</p>
            <span className="rounded-full bg-[var(--bg-base)] px-2 py-0.5 text-xs font-bold text-[var(--text-secondary)]">{myPendingSubmit.length}</span>
          </div>
          <div className="divide-y divide-[var(--border)]">
            {myPendingSubmit.map((step) => {
              const task = taskMap.get(step.task_id)
              const approver = props.employeeMap.get(step.approver_id || '')
              const isRevision = step.approval_status === 'revision'
              return (
                <div key={step.id} className={`flex items-center gap-3 px-5 py-3 transition-colors hover:bg-[var(--bg-surface)] ${isRevision ? 'bg-[var(--danger-soft)]/30' : ''}`}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-[var(--text-primary)]">{step.step_title}</p>
                      {isRevision && <span className="rounded-full bg-[var(--danger-soft)] px-2 py-0.5 text-[10px] font-extrabold text-[var(--danger)]">Cần làm lại</span>}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-[var(--text-secondary)]">
                      {task && <span className="text-[var(--text-muted)]">? {task.title}</span>}
                      {approver && <span><span className="font-spec text-[9px]">DUYỆT BỞI</span> {approver.full_name}</span>}
                      {step.due_date && <span>· Hạn {step.due_date}</span>}
                      {isRevision && step.approval_note && <span className="text-[var(--danger)]">&quot;{step.approval_note}&quot;</span>}
                    </div>
                  </div>
                  {task && (
                    <button type="button" onClick={() => props.setSelectedTask(task)}
                      className="shrink-0 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-base)]">
                      Mở & nộp
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Danh sách task theo nhóm urgency */}
      {isEmpty ? (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] px-6 py-12 text-center">
          <p className="font-extrabold text-[var(--text-primary)]">Không có việc đang mở</p>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">Tất cả việc của bạn đã hoàn thành hoặc chưa được giao.</p>
        </div>
      ) : (
        groups.map((group) => (
          <div key={group.key} className={`overflow-hidden rounded-2xl border bg-[var(--bg-card)] ${group.key === 'urgent' ? 'border-[var(--danger)]/30' : group.key === 'week' ? 'border-[var(--warning)]/30' : 'border-[var(--border)]'}`}>
            <div className={`flex items-center gap-2 border-b px-5 py-3 ${group.headerCls}`}>
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: group.accent }} />
              <p className="text-sm font-extrabold" style={{ color: group.key === 'urgent' ? 'var(--danger)' : group.key === 'week' ? 'var(--warning)' : 'var(--text-primary)' }}>{group.label}</p>
              <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs font-bold">{group.tasks.length}</span>
            </div>
            <div className="divide-y divide-[var(--border)]">
              {group.tasks.map((task) => <TaskRow key={task.id} task={task} />)}
            </div>
          </div>
        ))
      )}
    </div>
  )
}

// --- PermissionsView --------------------------------------------------------
const RESOURCES = ['project', 'workstream', 'subtask', 'step', 'import', 'export', 'admin_panel'] as const
const SCOPES    = ['all', 'own_dept', 'assigned', 'none'] as const
const ROLES     = ['ceo', 'coo', 'admin', 'department_head', 'employee'] as const

const RESOURCE_LABEL: Record<string, string> = {
  project: 'Dự án', workstream: 'Đầu việc lớn', subtask: 'Đầu việc con',
  step: 'Bước', import: 'Import Excel', export: 'Export', admin_panel: 'Quản lý hệ thống',
}
const ACTION_LABEL: Record<string, string> = {
  view: 'Xem', create: 'Tạo', edit: 'Sửa', delete: 'Xóa', approve: 'Duyệt', use: 'Dùng',
}
const SCOPE_LABEL: Record<string, string> = {
  all: 'Tất cả', own_dept: 'Bộ phận mình', assigned: 'Được giao', none: 'Không có',
}
const SCOPE_COLOR: Record<string, string> = {
  all: 'bg-[var(--olive)] text-[var(--ivory)]',
  own_dept: 'bg-[var(--warning-soft)] text-[var(--warning)]',
  assigned: 'bg-[var(--success-soft)] text-[var(--success)]',
  none: 'bg-[var(--bg-surface)] text-[var(--text-muted)]',
}

function PermissionsView(props: {
  permissions: RolePermission[]
  onRefresh: () => void
}) {
  const [selectedRole, setSelectedRole] = useState<string>('department_head')
  const [saving, setSaving] = useState(false)
  // draft: key = "resource:action", value = scope — only populated when user changes something
  const [draft, setDraft] = useState<Record<string, string>>({})

  // Reset draft when switching role
  function selectRole(r: string) { setSelectedRole(r); setDraft({}) }

  const hasDraft = Object.keys(draft).length > 0

  function getSavedScope(resource: string, action: string): string {
    return props.permissions.find(p => p.role === selectedRole && p.resource === resource && p.action === action)?.scope || 'none'
  }
  function getDraftScope(resource: string, action: string): string {
    return draft[`${resource}:${action}`] ?? getSavedScope(resource, action)
  }

  function pickScope(resource: string, action: string, scope: string) {
    const saved = getSavedScope(resource, action)
    setDraft(prev => {
      const next = { ...prev }
      if (scope === saved) {
        // revert to saved -> remove from draft
        delete next[`${resource}:${action}`]
      } else {
        next[`${resource}:${action}`] = scope
      }
      return next
    })
  }

  async function saveDraft() {
    if (!hasDraft) return
    setSaving(true)
    const upserts = Object.entries(draft).map(([key, scope]) => {
      const [resource, action] = key.split(':')
      return { role: selectedRole, resource, action, scope, updated_at: new Date().toISOString() }
    })
    await supabase.from('role_permissions').upsert(upserts, { onConflict: 'role,resource,action' })
    await props.onRefresh()
    setDraft({})
    setSaving(false)
    toast(`Đã lưu ${upserts.length} thay đổi quyền cho ${selectedRole === 'department_head' ? 'Trưởng phòng' : selectedRole}`)
  }

  function discardDraft() { setDraft({}) }

  // Actions relevant per resource
  const relevantActions: Record<string, string[]> = {
    project:     ['view', 'create', 'edit', 'delete'],
    workstream:  ['view', 'create', 'edit', 'delete'],
    subtask:     ['view', 'create', 'edit', 'delete'],
    step:        ['view', 'create', 'edit', 'delete', 'approve'],
    import:      ['use'],
    export:      ['use'],
    admin_panel: ['use'],
  }

  const roleLabel = (r: string) => r === 'ceo' ? 'CEO' : r === 'coo' ? 'COO' : r === 'admin' ? 'Admin' : r === 'department_head' ? 'Trưởng phòng' : 'Nhân viên'

  return (
    <div className="space-y-5">
      {/* Role tabs */}
      <div className="vyvy-card p-5">
        <div className="mb-4">
          <p className="vyvy-label">Permission matrix</p>
          <h3 className="mt-1 font-display text-lg">Chọn vai trò để chỉnh quyền</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {ROLES.map(r => (
            <button key={r} onClick={() => selectRole(r)}
              className={`rounded-[var(--radius)] px-4 py-2 text-xs font-bold transition-colors ${selectedRole === r ? 'bg-[var(--olive)] text-[var(--ivory)]' : 'border border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:border-[var(--olive)]'}`}>
              {roleLabel(r)}
            </button>
          ))}
        </div>
      </div>

      {/* Matrix */}
      <div className="vyvy-card p-5">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <p className="vyvy-label">Access scope</p>
            <h3 className="mt-1 font-display text-lg">Ma trận quyền — {roleLabel(selectedRole)}</h3>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">Chọn phạm vi rồi bấm <strong>Lưu thay đổi</strong> để áp dụng.</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {hasDraft && (
              <>
                <span className="rounded-[var(--radius)] border border-[var(--warning)]/20 bg-[var(--warning-soft)] px-2 py-1 text-xs font-semibold text-[var(--warning)]">
                  {Object.keys(draft).length} thay đổi chưa lưu
                </span>
                <button onClick={discardDraft}
                  className="vyvy-button-secondary min-h-0 px-3 py-1.5">
                  Huỷ
                </button>
              </>
            )}
            <button onClick={saveDraft} disabled={!hasDraft || saving}
              className="vyvy-button-primary min-h-0 px-4 py-1.5 disabled:opacity-40">
              {saving ? 'Đang lưu…' : 'Lưu thay đổi'}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="vyvy-table min-w-[820px]">
            <thead>
              <tr>
                <th>Đối tượng</th>
                <th>Hành động</th>
                {SCOPES.map(s => (
                  <th key={s} className="min-w-[90px] text-center">
                    {SCOPE_LABEL[s]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {RESOURCES.map(res => {
                const actions = relevantActions[res] || []
                return actions.map((act, ai) => {
                  const draftScope = getDraftScope(res, act)
                  const savedScope = getSavedScope(res, act)
                  const isChanged = draftScope !== savedScope
                  return (
                    <tr key={`${res}:${act}`} className={`${isChanged ? 'bg-[var(--warning-soft)]' : ''}`}>
                      {ai === 0 && (
                        <td rowSpan={actions.length} className="align-top font-bold text-[var(--text-primary)]">
                          {RESOURCE_LABEL[res]}
                        </td>
                      )}
                      <td className="text-[var(--text-secondary)]">
                        {ACTION_LABEL[act]}
                        {isChanged && <span className="ml-1 text-[var(--warning)]">*</span>}
                      </td>
                      {SCOPES.map(sc => {
                        const isActive = draftScope === sc
                        const isSaved = savedScope === sc
                        return (
                          <td key={sc} className="py-2 px-2 text-center">
                            <button
                              onClick={() => pickScope(res, act, sc)}
                              title={isActive && !isSaved ? 'Thay đổi chưa lưu' : ''}
                              className={`w-full rounded-md py-1 px-2 text-xs font-semibold transition-all
                                ${isActive
                                  ? SCOPE_COLOR[sc] + (isSaved ? ' ring-1 ring-[var(--olive)]' : ' ring-2 ring-[var(--warning)]')
                                  : 'bg-[var(--bg-surface)] text-[var(--text-muted)] hover:bg-[var(--bg-input)] opacity-50 hover:opacity-100'}`}>
                              {isActive ? (isSaved ? '✓' : '*') : ''}
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  )
                })
              })}
            </tbody>
          </table>
        </div>

        {/* Legend */}
        <div className="mt-4 flex flex-wrap gap-3 items-center">
          {SCOPES.map(s => (
          <span key={s} className={`rounded-md px-2 py-1 text-xs font-semibold ${SCOPE_COLOR[s]}`}>
            {SCOPE_LABEL[s]}
          </span>
        ))}
        <span className="text-xs text-[var(--text-muted)] ml-1">— phạm vi áp dụng</span>
          <span className="text-xs text-[var(--warning)] ml-3">◉ = chưa lưu &nbsp; ● = đã lưu</span>
        </div>
      </div>
    </div>
  )
}
