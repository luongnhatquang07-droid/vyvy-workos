'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { displayLoginIdentifier } from '@/lib/internal-auth'
import DeadlineApproval from '@/components/DeadlineApproval'
import CooAssistantPanel from '@/components/CooAssistantPanel'
import HeadPicker from '@/components/HeadPicker'
import MeetingHistory from '@/components/MeetingHistory'
import MeetingStudio from '@/components/MeetingStudio'
import MyDeadlineInbox from '@/components/MyDeadlineInbox'
import {
  LayoutDashboard, Kanban, FolderKanban, ListTodo, FileText,
  CalendarClock, Zap, Bot, Users,
  Plus, Trash2, X, Check, ChevronRight, ChevronDown, ChevronUp,
  Bell, Search, LogOut, AlertTriangle, Info,
  Upload, Download, Paperclip,
  Clock, Calendar, RefreshCw, Play,
  CheckCircle2, XCircle, AlertCircle,
  User, Building2, Shield,
  Edit3, Filter, MoreHorizontal,
  ArrowRight, Loader2,
  MessageSquare, Link2, Flag, Activity,
} from 'lucide-react'

// ─── Module-level toast (no prop drilling needed) ───────────────────────────
type ToastType = 'success' | 'error' | 'info' | 'warning'
type ToastItem = { id: string; message: string; type: ToastType }
let _showToast: ((msg: string, type?: ToastType) => void) | null = null
function toast(msg: string, type: ToastType = 'success') { _showToast?.(msg, type) }

// ─── Module-level confirm dialog (thay window.confirm) ──────────────────────
let _confirm: ((msg: string) => Promise<boolean>) | null = null
function confirmDialog(msg: string): Promise<boolean> {
  return _confirm ? _confirm(msg) : Promise.resolve(window.confirm(msg))
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
  const { error } = await supabase.from('notifications').insert(valid.map((r) => ({ type: 'info', ...r })))
  if (error) console.warn('pushNotify failed (bảng notifications đã tạo chưa?):', error.message)
}

type Department = {
  id: string
  code: string
  name: string
}

type Employee = {
  id: string
  full_name: string
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
  department_id: string | null
  status: string | null
  priority: string | null
  progress_percent: number | null
  issue_status?: string | null
}

type ProjectHealth = {
  level: 'problem' | 'watch' | 'normal'
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
  issue_status: string | null
  created_at?: string | null
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
  report_file_url: string | null
  report_file_name: string | null
  report_link: string | null
  support_request: string | null
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

type ViewKey = 'dashboard' | 'coo' | 'projects' | 'assigned' | 'tasks' | 'meeting' | 'recurring' | 'automation' | 'assistant' | 'admin'

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
    id: 'default-performance-meeting',
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

function recurringRecipientNames(task: RecurringTask, employeeMap: Map<string, Employee>): string {
  const names = recurringRecipientIds(task)
    .map((id) => employeeMap.get(id)?.full_name)
    .filter(Boolean)
  return names.length > 0 ? names.join(', ') : 'Chưa gắn'
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
  assigneeId: string
  dueDate: string
  priority: string
}

type StepForm = {
  title: string
  ownerId: string
  approverId: string
  dueDate: string
}

// ─── Structured meeting recap ────────────────────────────────────────────────
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

// ─── SVG Icon Library ─────────────────────────────────────────────────────────
const S = 'stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"'
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
}

export default function Home() {
  const router = useRouter()
  const [authChecked, setAuthChecked] = useState(false)
  const [currentEmployee, setCurrentEmployee] = useState<Employee | null>(null)

  // ─── Toast system ──────────────────────────────────────────────────────────
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

  // ─── Confirm dialog ────────────────────────────────────────────────────────
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

  // ─── Realtime sync ─────────────────────────────────────────────────────────
  const [realtimeStatus, setRealtimeStatus] = useState<'connecting' | 'live' | 'off'>('connecting')
  const fetchAllRef = useRef<((opts?: { silent?: boolean }) => void) | null>(null)

  const [view, setView] = useState<ViewKey>('coo')
  const [taskFilter, setTaskFilter] = useState('all')
  const [collapsed, setCollapsed] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  const [departments, setDepartments] = useState<Department[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [steps, setSteps] = useState<TaskStep[]>([])
  const [supporters, setSupporters] = useState<TaskSupporter[]>([])
  const [reports, setReports] = useState<TaskReport[]>([])
  const [comments, setComments] = useState<StepComment[]>([])

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  const [selectedProjectId, setSelectedProjectId] = useState('all')
  const [selectedWorkstreamId, setSelectedWorkstreamId] = useState('')
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [createTab, setCreateTab] = useState<'project' | 'workstream'>('workstream')

  const [projectName, setProjectName] = useState('')
  const [projectCode, setProjectCode] = useState('')
  const [projectDesc, setProjectDesc] = useState('')
  const [projectOwnerId, setProjectOwnerId] = useState('')
  const [projectDepartmentId, setProjectDepartmentId] = useState('')

  const [workTitle, setWorkTitle] = useState('')
  const [workDesc, setWorkDesc] = useState('')
  const [workProjectId, setWorkProjectId] = useState('')
  const [workDepartmentId, setWorkDepartmentId] = useState('')
  const [workHeadId, setWorkHeadId] = useState('')
  const [workAssigneeId, setWorkAssigneeId] = useState('')
  const [workDueDate, setWorkDueDate] = useState('')
  const [workPriority, setWorkPriority] = useState('medium')

  const [subtaskOpenFor, setSubtaskOpenFor] = useState('')
  const [subtaskForm, setSubtaskForm] = useState<SubtaskForm>({
    title: '',
    description: '',
    departmentId: '',
    headId: '',
    assigneeId: '',
    dueDate: '',
    priority: 'medium',
  })

  const [stepOpenFor, setStepOpenFor] = useState('')
  const [stepForm, setStepForm] = useState<StepForm>({
    title: '',
    ownerId: '',
    approverId: '',
    dueDate: '',
  })

  const [supporterDrafts, setSupporterDrafts] = useState<Record<string, string>>({})
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({})
  const [revisionDrafts, setRevisionDrafts] = useState<Record<string, string>>({})
  const [linkDrafts, setLinkDrafts] = useState<Record<string, string>>({})
  const [supportDrafts, setSupportDrafts] = useState<Record<string, string>>({})

  const [searchQuery, setSearchQuery] = useState('')
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
    const canManage = isTopLevelRole || isAdminRole
    // Redirect restricted views for non-managers
    if (!canManage && (view === 'coo' || view === 'automation' || view === 'admin')) {
      setView('dashboard')
    }
    // If first load on coo as non-manager, go to tasks
    if (!canManage && view === 'coo') {
      setView('tasks')
    }
  }, [currentEmployee]) // eslint-disable-line react-hooks/exhaustive-deps

  async function logout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

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
    const { data, error } = await supabase.from('employees').select('id, full_name, position').order('full_name')
    if (error) {
      console.error(error)
      setEmployees([])
      return
    }

    const rows = (data || []) as Employee[]
    setEmployees(rows)

    if (rows[0]) {
      setProjectOwnerId((v) => v || rows[0].id)
      setWorkHeadId((v) => v || rows[0].id)
      setWorkAssigneeId((v) => v || rows[0].id)
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
    ])
    if (!options?.silent) {
      setLoading(false)
    }
  }, [
    fetchComments,
    fetchDepartments,
    fetchEmployees,
    fetchProjects,
    fetchReports,
    fetchSteps,
    fetchSupporters,
    fetchTasks,
  ])

  useEffect(() => {
    fetchAllRef.current = fetchAll
  }, [fetchAll])

  useEffect(() => {
    const loadTimer = window.setTimeout(() => { fetchAll() }, 0)
    return () => window.clearTimeout(loadTimer)
  }, [fetchAll])

  // ─── Thông báo trong app ───────────────────────────────────────────────────
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
      const errorMessage = error.message || ''
      if (errorMessage.includes('recurring_tasks') || errorMessage.includes('recipient_ids')) {
        const localId = recurringForm.id || `local-recurring-${Date.now()}`
        const localTask = recurringTaskFromForm(localId)
        setRecurringTasks((prev) => {
          const exists = prev.some((task) => task.id === localId)
          return exists ? prev.map((task) => (task.id === localId ? localTask : task)) : [localTask, ...prev]
        })
        toast('Đã cập nhật trên màn hình. Chạy SQL Supabase để lưu vĩnh viễn.', 'warning')
        resetRecurringForm()
        setRecurringPanelOpen(false)
        return
      }
      toast('Lưu việc định kỳ bị lỗi. Kiểm tra bảng recurring_tasks trong Supabase.', 'error')
      return
    }

    toast(recurringForm.id ? 'Đã cập nhật việc định kỳ.' : 'Đã tạo việc định kỳ.')
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
    ])
  }, [fetchComments, fetchReports, fetchSteps, fetchSupporters, fetchTasks])

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

    const { error } = await supabase.from('tasks').insert({
      title: workTitle.trim(),
      description: workDesc.trim() || null,
      parent_task_id: null,
      task_level: 'workstream',
      status: 'not_started',
      priority: workPriority,
      progress_percent: 0,
      due_date: workDueDate || null,
      department_id: workDepartmentId || null,
      assignee_id: workAssigneeId || null,
      head_id: workHeadId || null,
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

    setWorkTitle('')
    setWorkDesc('')
    setWorkDueDate('')
    await refreshDataSilent()
  }

  function openSubtaskForm(parent: Task) {
    setSubtaskOpenFor(parent.id)
    setSubtaskForm({
      title: '',
      description: '',
      departmentId: parent.department_id || departments[0]?.id || '',
      headId: parent.head_id || parent.assignee_id || employees[0]?.id || '',
      assigneeId: parent.assignee_id || parent.head_id || employees[0]?.id || '',
      dueDate: parent.due_date || '',
      priority: parent.priority || 'medium',
    })
  }

  async function createSubtask(parent: Task) {
    if (!subtaskForm.title.trim()) {
      toast('Nhập tên đầu việc con trước.', 'warning')
      return
    }

    const { error } = await supabase.from('tasks').insert({
      title: subtaskForm.title.trim(),
      description: subtaskForm.description.trim() || null,
      parent_task_id: parent.id,
      task_level: 'subtask',
      status: 'not_started',
      priority: subtaskForm.priority,
      progress_percent: 0,
      due_date: subtaskForm.dueDate || null,
      department_id: subtaskForm.departmentId || null,
      assignee_id: subtaskForm.assigneeId || null,
      head_id: subtaskForm.headId || null,
      project_id: parent.project_id || null,
      issue_status: 'normal',
      approval_status: 'not_submitted',
    })

    if (error) {
      console.error(error)
      toast('Tạo đầu việc con bị lỗi.', 'error')
      return
    }

    setSubtaskOpenFor('')
    await refreshDataSilent()
  }

  function openStepForm(task: Task) {
    const departmentApproverId = getDefaultDepartmentApprover(task.department_id, departments, employees)

    setStepOpenFor(task.id)
    setStepForm({
      title: '',
      ownerId: task.assignee_id || task.head_id || employees[0]?.id || '',
      approverId: departmentApproverId || task.head_id || employees[0]?.id || '',
      dueDate: task.due_date || '',
    })
  }

  async function createStep(taskId: string) {
    if (!stepForm.title.trim()) {
      toast('Nhập tên bước trước.', 'warning')
      return
    }

    const currentSteps = steps.filter((step) => step.task_id === taskId)
    const nextOrder = currentSteps.length + 1
    const task = tasks.find((item) => item.id === taskId)
    const departmentApproverId = stepForm.approverId || getDefaultDepartmentApprover(task?.department_id || null, departments, employees)
    const cooApproverId = getCooApprover(employees)
    const ceoApproverId = getCeoApprover(employees)

    const { error } = await supabase.from('task_steps').insert({
      task_id: taskId,
      step_title: stepForm.title.trim(),
      step_order: nextOrder,
      is_done: false,
      owner_id: stepForm.ownerId || null,
      approver_id: departmentApproverId || null,
      department_approver_id: departmentApproverId || null,
      coo_approver_id: cooApproverId || null,
      ceo_approver_id: ceoApproverId || null,
      requires_coo_approval: false,
      requires_ceo_approval: false,
      approval_stage: 'department',
      department_approval_status: 'not_submitted',
      coo_approval_status: 'not_required',
      ceo_approval_status: 'not_required',
      due_date: stepForm.dueDate || null,
      approval_status: 'not_submitted',
    })

    if (error) {
      console.error(error)
      toast('Tạo bước bị lỗi.', 'error')
      return
    }

    setStepOpenFor('')
    await syncTaskProgress(taskId)
    await refreshDataSilent()
  }

  async function updateTaskStatus(taskId: string, status: string) {
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
    const { error } = await supabase.from('tasks').update({ head_ids: headIds, head_id: headIds[0] || null }).eq('id', taskId)
    if (error) {
      console.error(error)
      toast('Cập nhật Head lỗi.', 'error')
      return
    }
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

    const done = rows.filter((row) => row.is_done).length
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
    const { error } = await supabase.from('task_steps').update(patch).eq('id', step.id)

    if (error) {
      console.error(error)
      toast('Cập nhật bước bị lỗi.', 'error')
      return
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
    const approverId = step.department_approver_id || step.approver_id
    if (approverId && approverId !== currentEmployee?.id) {
      pushNotify([{
        recipient_id: approverId,
        actor_id: currentEmployee?.id || null,
        type: 'step_submitted',
        title: 'Có bước chờ bạn duyệt',
        body: step.step_title,
        task_id: step.task_id,
      }])
    }
    toast('Đã gửi duyệt.', 'info')
  }

  function notifyStepResult(step: TaskStep, title: string, extraRecipient?: string | null) {
    const recipients = new Set<string>()
    if (step.owner_id) recipients.add(step.owner_id)
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
  }

  async function approveCurrentStage(step: TaskStep) {
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
      notifyStepResult(step, 'Bước của bạn đã được duyệt hoàn tất ✓')
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
      notifyStepResult(step, 'COO đã duyệt — bước của bạn hoàn tất ✓')
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
    notifyStepResult(step, 'CEO đã duyệt — bước của bạn hoàn tất ✓')
    toast('CEO đã duyệt — bước hoàn tất.')
  }

  async function requestRevision(step: TaskStep) {
    const note = revisionDrafts[step.id]?.trim()

    if (!note) {
      toast('Nhập lý do cần làm lại trước.', 'warning')
      return
    }

    const stage = step.approval_stage || 'department'
    const stagePatch =
      stage === 'coo'
        ? { coo_approval_status: 'revision', coo_approval_note: note }
        : stage === 'ceo'
          ? { ceo_approval_status: 'revision', ceo_approval_note: note }
          : { department_approval_status: 'revision', department_approval_note: note }

    const { error } = await supabase
      .from('task_steps')
      .update({
        is_done: false,
        approval_status: 'revision',
        approval_note: note,
        ...stagePatch,
      })
      .eq('id', step.id)

    if (error) {
      console.error(error)
      toast('Yêu cầu làm lại bị lỗi.', 'error')
      return
    }

    await addComment(step.id, note, 'revision')
    notifyStepResult(step, `Bước cần làm lại: ${note.slice(0, 80)}`)
    setRevisionDrafts((current) => ({ ...current, [step.id]: '' }))
    toast('Đã gửi yêu cầu làm lại.', 'info')
    await syncTaskProgress(step.task_id)
    await refreshDataSilent()
  }

  async function saveStepLink(step: TaskStep) {
    const link = linkDrafts[step.id] ?? step.report_link ?? ''
    await updateStep(step, { report_link: link } as Partial<TaskStep>)
    toast('Đã lưu link báo cáo.', 'info')
  }

  async function saveSupportRequest(step: TaskStep) {
    const request = supportDrafts[step.id] ?? step.support_request ?? ''

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

  async function addComment(stepId: string, content?: string, type = 'comment') {
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
          const emp = employees.find((e) => (e.full_name || '').toLowerCase() === owner.toLowerCase())
          rows.push({
            id: `ai-${rows.length}-${Date.now()}`,
            workstreamTitle: ws?.title || 'Đầu việc lớn',
            subtaskTitle: st?.title || 'Đầu việc',
            responsibility: owner,
            expectedOutput: '',
            departmentId: '',
            headId: emp?.id || '',
            assigneeId: emp?.id || '',
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
          approver_id: departmentApproverId || null,
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

        const { error: stepsError } = await supabase.from('task_steps').insert(stepRows)

        if (stepsError) {
          console.error(stepsError)
          toast(`Tạo bước cho "${row.subtaskTitle}" bị lỗi.`, 'error')
          setImporting(false)
          return
        }

        // Gom thông báo cho người duyệt phân công (trưởng bộ phận / head)
        const approverId = row.headId || departmentApproverId
        if (approverId && approverId !== currentEmployee?.id) {
          approvalNotices.push({
            recipient_id: approverId,
            title: 'Phân công mới chờ bạn duyệt',
            body: row.subtaskTitle.trim(),
            task_id: subtaskId,
            project_id: projectId,
          })
        }
      }

      // Gửi thông báo duyệt phân công
      await pushNotify(approvalNotices.map((n) => ({ ...n, actor_id: currentEmployee?.id || null, type: 'assignment_approval' })))

      await fetchAll({ silent: true })
      setNotexRows([])
      setView('coo')
      setSelectedProjectId(projectId)
      toast(`Import thành công — ${approvalNotices.length} việc đã gửi cấp trên duyệt phân công.`)
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
    const ownedTasks = tasks.filter((task) => task.assignee_id === employee.id || task.head_id === employee.id)
    const done = ownedTasks.filter((task) => task.status === 'completed').length

    return {
      employee,
      total: ownedTasks.length,
      done,
      doing: ownedTasks.filter((task) => task.status === 'in_progress').length,
      pending: ownedTasks.filter((task) => task.status === 'pending').length,
      overdue: ownedTasks.filter((task) => isTaskOverdue(task)).length,
      problem: ownedTasks.filter((task) => isTaskProblem(task)).length,
      rate: ownedTasks.length === 0 ? 0 : Math.round((done / ownedTasks.length) * 100),
    }
  })

  const urgentTasks = tasks
    .filter((task) => isTaskOverdue(task) || isTaskProblem(task) || isTaskSlow(task, stepsByTask.get(task.id) || []))
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
      (p) => visibleProjectIds.has(p.id) || p.owner_id === currentEmployee.id
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, authChecked, visibleTasks])

  // Các bước đang chờ chính user này duyệt (inbox duyệt nhanh)
  const pendingForMe = useMemo(() => {
    if (!currentEmployee?.id) return []
    return steps.filter((step) => {
      if (step.approval_status !== 'pending') return false
      const stage = step.approval_stage || 'department'
      const approverId =
        stage === 'coo' ? step.coo_approver_id :
        stage === 'ceo' ? step.ceo_approver_id :
        (step.department_approver_id || step.approver_id)
      return approverId === currentEmployee.id
    })
  }, [steps, currentEmployee])

  async function approveAssignment(task: Task) {
    const { error } = await supabase.from('tasks').update({ status: 'not_started' }).eq('id', task.id)
    if (error) { toast('Duyệt phân công bị lỗi.', 'error'); return }
    const notices = []
    if (task.assignee_id && task.assignee_id !== currentEmployee?.id) {
      notices.push({
        recipient_id: task.assignee_id,
        actor_id: currentEmployee?.id || null,
        type: 'assigned',
        title: 'Bạn được giao việc mới',
        body: task.title,
        task_id: task.id,
        project_id: task.project_id,
      })
    }
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

  // ─── Permission flags ───────────────────────────────────────────────────────
  const role = currentEmployee?.role || 'employee'
  const isTopLevel = role === 'ceo' || role === 'coo' || role === 'admin' // admin đồng quyền top-level (tạm thời)
  const isAdmin = role === 'admin'
  const isDeptHead = role === 'department_head' || Boolean(currentEmployee?.is_department_head)

  const canManageAll = isTopLevel || isAdmin

  const canCreateUsers =
    canManageAll || Boolean(currentEmployee?.can_manage_users)

  // Tạo dự án / đầu việc lớn: CEO, COO, Admin
  const canCreateProject = canManageAll
  const canCreateWorkstream = canManageAll

  // Tạo đầu việc con: CEO, COO, Admin, Trưởng BP (trong BP mình), hoặc head của workstream
  function canCreateSubtask(task: Task): boolean {
    if (canManageAll) return true
    if (isDeptHead && currentEmployee?.department_id && task.department_id === currentEmployee.department_id) return true
    if (currentEmployee?.id && task.head_id === currentEmployee.id) return true
    return false
  }

  // Xóa task: CEO, COO, Admin
  const canDeleteTask = canManageAll

  // Tạo step: CEO, COO, Admin, Trưởng BP, hoặc người được assign task đó
  function canCreateStep(task: Task): boolean {
    if (canManageAll || isDeptHead) return true
    if (currentEmployee?.id && (task.assignee_id === currentEmployee.id || task.head_id === currentEmployee.id)) return true
    return false
  }

  // Phân công chờ tôi duyệt (task import từ biên bản, chưa chia xuống người làm)
  const assignmentsForMe = useMemo(() => {
    if (!currentEmployee?.id) return []
    return tasks.filter((t) => {
      if (t.status !== 'pending_approval') return false
      if (canManageAll) return true
      if (t.head_id === currentEmployee.id) return true
      if (isDeptHead && t.department_id && t.department_id === currentEmployee.department_id) return true
      return false
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, currentEmployee, canManageAll, isDeptHead])

  const allMenuItems: { key: ViewKey; label: string; icon: React.ReactNode; hide?: boolean }[] = [
    { key: 'dashboard', label: 'Thống kê', icon: <Ico d={IC.activity} size={18}/> },
    { key: 'coo', label: 'COO Board', icon: <Ico d={IC.layers} size={18}/>, hide: !canManageAll },
    { key: 'projects', label: 'Dự án', icon: <Ico d={IC.folder} size={18}/> },
    { key: 'assigned', label: 'Việc được giao', icon: <Ico d={IC.clock} size={18}/> },
    { key: 'tasks', label: 'Công việc', icon: <Ico d={IC.clipboard} size={18}/> },
    { key: 'meeting', label: 'Biên bản họp', icon: <Ico d={IC.messageSquare} size={18}/> },
    { key: 'recurring', label: 'Việc định kỳ', icon: <Ico d={IC.clock} size={18}/> },
    { key: 'automation', label: 'Nhắc tự động', icon: <Ico d={IC.zap} size={18}/>, hide: !canManageAll },
    { key: 'assistant', label: 'COO Assistant', icon: <Ico d={IC.zap} size={18}/>, hide: !isTopLevel },
    { key: 'admin', label: 'Quản lý nhân sự', icon: <Ico d={IC.users} size={18}/>, hide: !canManageAll },
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
    <main className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)]">
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      <aside
        className={`fixed left-0 top-0 z-50 h-screen transition-all duration-200
          bg-[var(--olive)] border-r border-[var(--hair-d)] text-[rgba(241,237,228,0.85)]
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
                    ? 'bg-[rgba(241,237,228,0.08)] text-[var(--lime)]'
                    : 'text-[rgba(241,237,228,0.55)] hover:bg-[rgba(241,237,228,0.06)] hover:text-[rgba(241,237,228,0.85)]'
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
        <header className="sticky top-0 z-20 flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--ivory)]/95 px-3 py-3 backdrop-blur-md sm:px-6">
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
              {view === 'assigned' && 'Việc được giao'}
              {view === 'tasks' && 'Quản lý công việc'}
              {view === 'meeting' && 'Nhập biên bản họp'}
              {view === 'recurring' && 'Việc định kỳ'}
              {view === 'automation' && 'Nhắc tự động'}
              {view === 'assistant' && 'COO Assistant'}
              {view === 'admin' && 'Quản lý nhân sự'}
            </h2>
            <p className="hidden text-xs text-[var(--text-secondary)] sm:block">
              Dự án → Đầu việc lớn → Đầu việc con → Bước duyệt → File báo cáo.
            </p>
            </div>
          </div>

          <div className="relative hidden min-w-0 flex-1 max-w-md lg:block">
            <input
              ref={searchInputRef}
              className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] pl-9 pr-12 text-sm outline-none focus:border-[var(--char)] focus:bg-[var(--bg-card)]"
              placeholder="Tìm dự án, đầu việc... (Ctrl+K)"
              value={searchQuery}
              onChange={(event) => { setSearchQuery(event.target.value); setSearchOpen(true) }}
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
                onClick={() => {
                  setInboxOpen((v) => {
                    if (!v) markNotificationsRead()
                    return !v
                  })
                }}
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
                <div className="absolute right-0 top-12 z-30 w-80 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-2 shadow-xl">

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
                    <p className="px-2 py-3 text-sm text-[var(--text-secondary)]">Không có bước nào chờ duyệt. 🎉</p>
                  ) : (
                    <div className="max-h-80 space-y-1 overflow-y-auto">
                      {pendingForMe.map((step) => {
                        const task = tasks.find((item) => item.id === step.task_id)
                        return (
                          <div key={step.id} className="rounded-lg border border-[var(--border)] p-2">
                            <button type="button"
                              onClick={() => {
                                if (task) setSelectedTask(task)
                                setInboxOpen(false)
                              }}
                              className="block w-full text-left"
                            >
                              <p className="truncate text-sm font-bold">{step.step_title}</p>
                              <p className="truncate text-[11px] text-[var(--text-secondary)]">{task?.title || 'Đầu việc'}</p>
                            </button>
                            <div className="mt-1.5 flex gap-1.5">
                              <button type="button"
                                onClick={() => approveCurrentStage(step)}
                                className="rounded-lg bg-[var(--bg-card)] px-2.5 py-1 text-[11px] font-extrabold text-[var(--text-primary)]"
                              >
                                Duyệt ngay
                              </button>
                              <button type="button"
                                onClick={() => {
                                  if (task) setSelectedTask(task)
                                  setInboxOpen(false)
                                }}
                                className="rounded-lg border border-[var(--border)] px-2.5 py-1 text-[11px] font-bold"
                              >
                                Xem chi tiết
                              </button>
                            </div>
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
                    <p className="px-2 py-3 text-sm text-[var(--text-secondary)]">Chưa có thông báo.</p>
                  ) : (
                    <div className="max-h-64 space-y-1 overflow-y-auto">
                      {notifications.map((n) => {
                        const relTask = n.task_id ? tasks.find((t) => t.id === n.task_id) : null
                        return (
                          <button key={n.id} type="button"
                            onClick={() => {
                              if (relTask) { setSelectedTask(relTask); setInboxOpen(false) }
                              else if (n.type === 'recurring_reminder') { setView('recurring'); setInboxOpen(false) }
                              else if (n.type === 'daily_digest') { setView('tasks'); setInboxOpen(false) }
                            }}
                            className={`block w-full rounded-lg p-2 text-left ${n.is_read ? '' : 'bg-[var(--accent-soft)]'} hover:bg-[var(--bg-surface)]`}
                          >
                            <p className="truncate text-sm font-bold">{n.title}</p>
                            {n.body && <p className="truncate text-[11px] text-[var(--text-secondary)]">{n.body}</p>}
                            <p className="text-[10px] text-[var(--text-muted)]">
                              {new Date(n.created_at).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                              {n.actor_id && employeeMap.get(n.actor_id) ? ` · ${employeeMap.get(n.actor_id)?.full_name}` : ''}
                            </p>
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
              {view === 'dashboard' && (
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
                  currentEmployee={currentEmployee}
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
                  setSubtaskForm={setSubtaskForm}
                  createSubtask={createSubtask}
                  openStepForm={openStepForm}
                  stepOpenFor={stepOpenFor}
                  setStepOpenFor={setStepOpenFor}
                  stepForm={stepForm}
                  setStepForm={setStepForm}
                  createStep={createStep}
                  updateTaskStatus={updateTaskStatus}
                  updateIssueStatus={updateIssueStatus}
updateTaskHead={updateTaskHead}
                  updateStep={updateStep}
                  submitStep={submitStep}
                  approveStep={approveCurrentStage}
                  requestRevision={requestRevision}
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
                />
              )}

              {view === 'projects' && (
                <ProjectsView
                  currentEmployee={currentEmployee}
                  projectCards={projectCards.filter((p) => visibleProjects.some((vp) => vp.id === p.id))}
                  tasks={visibleTasks}
                  steps={steps}
                  employeeMap={employeeMap}
                  setView={setView}
                  setSelectedProjectId={setSelectedProjectId}
                  setSelectedTask={setSelectedTask}
                  deleteProject={canDeleteTask ? deleteProject : async () => {}}
                  canDeleteProject={canDeleteTask}
                />
              )}

              {view === 'assigned' && (
                <MyDeadlineInbox tasks={visibleTasks} currentUserId={currentEmployee?.id || ''} employees={Array.from(employeeMap.values())} seeAll={['admin','coo','ceo'].includes(currentEmployee?.role || '')} />
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
                />
              )}

              {view === 'recurring' && (
                <RecurringView
                  dbSetupNeeded={dbSetupNeeded}
                  tasks={recurringTasks}
                  now={now}
                  employees={employees}
                  employeeMap={employeeMap}
                  form={recurringForm}
                  setForm={setRecurringForm}
                  saveTask={saveRecurringTask}
                  editTask={editRecurringTask}
                  resetForm={resetRecurringForm}
                  toggleTask={toggleRecurringTask}
                  deleteTask={deleteRecurringTask}
                  meetingFiles={recurringMeetingFiles}
                  selectedMeetingTaskId={selectedMeetingTaskId}
                  setSelectedMeetingTaskId={setSelectedMeetingTaskId}
                  meetingFileDrafts={meetingFileDrafts}
                  updateMeetingFileDraft={updateMeetingFileDraft}
                  saveMeetingLink={saveRecurringMeetingLink}
                  uploadMeetingFile={uploadRecurringMeetingFile}
                  deleteMeetingFile={deleteRecurringMeetingFile}
                  uploadingMeetingFileFor={uploadingMeetingFileFor}
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

              {view === 'admin' && canManageAll && (
                <AdminUsersView
                  departments={departments}
                  onRefresh={fetchAll}
                  canCreateUsers={canCreateUsers}
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
        workAssigneeId={workAssigneeId}
        setWorkAssigneeId={setWorkAssigneeId}
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
      />

      {selectedTask && (
        <TaskDetailDrawer
          task={selectedTask}
          employeeMap={employeeMap}
          departmentMap={departmentMap}
          projectMap={projectMap}
          steps={stepsByTask.get(selectedTask.id) || []}
          reports={reportsByTask.get(selectedTask.id) || []}
          close={() => setSelectedTask(null)}
          uploadTaskFile={uploadTaskFile}
          deleteTaskReport={deleteTaskReport}
          uploading={uploading}
          getStatusLabel={getStatusLabel}
          currentEmployee={currentEmployee}
          employees={employees}
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
  peopleReports: Array<{ employee: Employee; total: number; done: number; doing: number; pending: number; overdue: number; problem: number; rate: number }>
  employeeMap: Map<string, Employee>
  projectMap: Map<string, Project>
  setView: (view: ViewKey) => void
  setTaskFilter: (f: string) => void
  setSelectedProjectId: (id: string) => void
  setSelectedTask: (task: Task) => void
  currentEmployee: Employee | null
}) {
  const { tasks, currentEmployee } = props
  const isAdmin = currentEmployee?.role === 'admin' || currentEmployee?.role === 'coo' || currentEmployee?.role === 'ceo'

  const total = tasks.length
  const done = tasks.filter((t) => t.status === 'completed').length
  const doing = tasks.filter((t) => t.status === 'in_progress').length
  const pending = tasks.filter((t) => t.status === 'pending').length
  const overdue = tasks.filter((t) => isTaskOverdue(t)).length
  const attentionProjects = props.projectCards.filter((p) => p.health.level !== 'normal')
  const pendingSteps = getPendingApprovalSteps(props.steps)
  const revisionSteps = getRevisionSteps(props.steps)
  const missingReportSteps = getMissingReportSteps(props.steps)

  // My tasks (for employee view)
  const myTasks = currentEmployee?.id
    ? tasks.filter((t) => t.assignee_id === currentEmployee.id || t.head_id === currentEmployee.id)
    : []
  const myOverdue = myTasks.filter((t) => isTaskOverdue(t))
  const myDueToday = myTasks.filter((t) => {
    if (!t.due_date) return false
    const today = new Date().toISOString().slice(0, 10)
    return t.due_date.slice(0, 10) === today
  })
  const myDoing = myTasks.filter((t) => t.status === 'in_progress')

  // Donut data
  const donutData = [
    { name: 'Hoàn thành', value: done, color: '#5B6B2E' },
    { name: 'Đang làm', value: doing, color: '#8A8047' },
    { name: 'Pending', value: pending, color: '#4A5A6A' },
    { name: 'Trễ hạn', value: overdue, color: '#8A3A2E' },
    { name: 'Chưa bắt đầu', value: Math.max(0, total - done - doing - pending), color: '#A59780' },
  ].filter((d) => d.value > 0)

  // Workload bar data (top 8)
  const workloadData = props.peopleReports.slice(0, 8).map((r) => ({
    name: r.employee.full_name.split(' ').slice(-1)[0],
    done: r.done,
    doing: r.doing,
    overdue: r.overdue,
  }))

  const cardCls = 'rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-card)] p-5'

  return (
    <div className="space-y-6">

      {/* ── Employee: Việc của tôi hôm nay ── */}
      {!isAdmin && currentEmployee && (
        <div className="rounded-[var(--radius-lg)] border border-[var(--accent)]/20 bg-[var(--accent-soft)] p-5">
          <p className="font-spec text-[var(--olive)] mb-3">VIỆC CỦA TÔI</p>
          <div className="grid grid-cols-3 gap-3 mb-4">
            {[
              { label: 'Đang làm', value: myDoing.length, color: 'text-[var(--char)]' },
              { label: 'Đến hạn hôm nay', value: myDueToday.length, color: 'text-[var(--warning)]' },
              { label: 'Trễ hạn', value: myOverdue.length, color: 'text-[var(--danger)]' },
            ].map((s) => (
              <div key={s.label} className="rounded-[var(--radius)] bg-[var(--bg-card)]/60 p-3 text-center">
                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
          {[...myOverdue, ...myDueToday, ...myDoing].slice(0, 5).map((t) => (
            <button key={t.id} type="button" onClick={() => props.setSelectedTask(t)}
              className="w-full text-left flex items-center gap-3 rounded-[var(--radius)] px-3 py-2.5 hover:bg-[var(--bg-card)]/40 transition-colors mb-1">
              <span className={`h-2 w-2 rounded-full shrink-0 ${isTaskOverdue(t) ? 'bg-[var(--danger)]' : 'bg-[var(--accent)]'}`}/>
              <span className="text-sm font-medium text-[var(--text-primary)] truncate">{t.title}</span>
              {t.due_date && <span className="text-xs text-[var(--text-muted)] ml-auto shrink-0">{t.due_date.slice(0, 10)}</span>}
            </button>
          ))}
          {myTasks.length === 0 && <p className="text-sm text-[var(--text-muted)] text-center py-2">Chưa có việc nào được giao.</p>}
        </div>
      )}

      {/* ── Metric cards ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {[
          { label: 'Tổng việc', value: total, icon: <ListTodo size={16}/>, view: 'tasks' as ViewKey, filter: 'all', color: 'text-[var(--info)]', bg: 'bg-[var(--info-soft)]' },
          { label: 'Hoàn thành', value: done, icon: <CheckCircle2 size={16}/>, view: 'tasks' as ViewKey, filter: 'completed', color: 'text-[var(--success)]', bg: 'bg-[var(--success-soft)]' },
          { label: 'Đang làm', value: doing, icon: <Activity size={16}/>, view: 'tasks' as ViewKey, filter: 'in_progress', color: 'text-[var(--char)]', bg: 'bg-[var(--bg-surface)]' },
          { label: 'Pending', value: pending, icon: <Clock size={16}/>, view: 'tasks' as ViewKey, filter: 'pending', color: 'text-[var(--warning)]', bg: 'bg-[var(--warning-soft)]' },
          { label: 'Trễ hạn', value: overdue, icon: <AlertCircle size={16}/>, view: 'tasks' as ViewKey, filter: 'overdue', color: 'text-[var(--danger)]', bg: 'bg-[var(--danger-soft)]' },
        ].map((m) => (
          <button key={m.label} type="button" onClick={() => { props.setTaskFilter(m.filter); props.setView(m.view) }}
            className={`${cardCls} text-left hover:bg-[var(--bg-card-hover)] transition-colors group`}>
            <div className={`inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] ${m.bg} ${m.color} mb-3`}>
              {m.icon}
            </div>
            <p className={`text-2xl font-bold ${m.color}`}>{m.value}</p>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">{m.label}</p>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">

          {/* ── Charts row ── */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* Donut — tỉ lệ trạng thái */}
            <div className={cardCls}>
              <p className="text-sm font-semibold text-[var(--text-secondary)] mb-4">Tỉ lệ trạng thái</p>
              {total > 0 ? (
                <DashboardDonut data={donutData} total={total} />
              ) : (
                <p className="text-center text-sm text-[var(--text-muted)] py-8">Chưa có dữ liệu</p>
              )}
            </div>

            {/* Bar — khối lượng nhân sự */}
            <div className={cardCls}>
              <p className="text-sm font-semibold text-[var(--text-secondary)] mb-4">Khối lượng theo người</p>
              {workloadData.length > 0 ? (
                <DashboardWorkloadBar data={workloadData} />
              ) : (
                <p className="text-center text-sm text-[var(--text-muted)] py-8">Chưa có dữ liệu</p>
              )}
            </div>
          </div>

          {/* ── Projects ── */}
          <div className={cardCls}>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold text-[var(--text-secondary)]">Tiến độ dự án</p>
              <span className="text-xs text-[var(--text-muted)]">{props.projectCards.length} dự án</span>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {props.projectCards.length === 0 ? (
                <p className="col-span-2 text-center text-sm text-[var(--text-muted)] py-6">Chưa có dự án nào.</p>
              ) : props.projectCards.map((project) => (
                <button type="button" key={project.id}
                  onClick={() => { props.setSelectedProjectId(project.id); props.setView('coo') }}
                  className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-surface)] p-4 text-left hover:border-[var(--border-strong)] hover:bg-[var(--bg-card-hover)] transition-all">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-[var(--text-primary)] truncate">{project.name}</p>
                      <p className="text-xs text-[var(--text-muted)] mt-0.5">{project.total} việc</p>
                    </div>
                    <div className="text-right shrink-0">
                      <ProjectHealthBadge health={project.health} />
                      <p className="text-xl font-bold text-[var(--olive)] mt-1">{project.rate}%</p>
                    </div>
                  </div>
                  <ProgressBar value={project.rate} />
                  <div className="mt-3 flex gap-3 text-xs text-[var(--text-muted)]">
                    {project.overdue > 0 && <span className="text-[var(--danger)]">⚠ {project.overdue} trễ</span>}
                    {project.problem > 0 && <span className="text-[var(--warning)]">⚡ {project.problem} vấn đề</span>}
                    {project.overdue === 0 && project.problem === 0 && <span className="text-[var(--success)]">✓ Đang ổn</span>}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* ── Workload table (admin only) ── */}
          {isAdmin && props.peopleReports.length > 0 && (
            <div className={cardCls}>
              <p className="text-sm font-semibold text-[var(--text-secondary)] mb-4">Khối lượng theo nhân sự</p>
              <div className="space-y-2">
                {props.peopleReports.map((row) => (
                  <div key={row.employee.id} className="flex items-center gap-3 rounded-[var(--radius)] bg-[var(--bg-surface)] px-4 py-3">
                    <Avatar name={row.employee.full_name} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{row.employee.full_name}</p>
                      <div className="flex gap-3 text-xs text-[var(--text-muted)] mt-0.5">
                        <span className="text-[var(--success)]">{row.done} xong</span>
                        <span className="text-[var(--umber)]">{row.doing} đang làm</span>
                        {row.overdue > 0 && <span className="text-[var(--danger)]">{row.overdue} trễ</span>}
                      </div>
                    </div>
                    <div className="w-24 shrink-0">
                      <ProgressBar value={row.rate} showLabel />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Right column ── */}
        <div className="space-y-4">

          {/* Dự án cần chú ý */}
          <div className={cardCls}>
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={15} className="text-[var(--warning)]"/>
              <p className="text-sm font-semibold text-[var(--text-secondary)]">Dự án cần chú ý</p>
              {attentionProjects.length > 0 && <span className="ml-auto text-xs font-bold text-[var(--warning)]">{attentionProjects.length}</span>}
            </div>
            {attentionProjects.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)] text-center py-4">Tất cả dự án đang ổn ✓</p>
            ) : attentionProjects.map((p) => (
              <button key={p.id} type="button"
                onClick={() => { props.setSelectedProjectId(p.id); props.setView('coo') }}
                className="w-full text-left rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-surface)] p-3 mb-2 hover:border-[var(--warning)]/40 transition-colors">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{p.name}</p>
                  <ProjectHealthBadge health={p.health} />
                </div>
                <ProjectHealthSummary health={p.health} />
              </button>
            ))}
          </div>

          {/* Việc khẩn */}
          <div className={cardCls}>
            <div className="flex items-center gap-2 mb-3">
              <Flag size={15} className="text-[var(--danger)]"/>
              <p className="text-sm font-semibold text-[var(--text-secondary)]">Việc cần hối thúc</p>
              {props.urgentTasks.length > 0 && <span className="ml-auto text-xs font-bold text-[var(--danger)]">{props.urgentTasks.length}</span>}
            </div>
            {props.urgentTasks.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)] text-center py-4">Không có việc khẩn ✓</p>
            ) : props.urgentTasks.slice(0, 6).map((t) => {
              const head = props.employeeMap.get(t.head_id || '')
              const assignee = props.employeeMap.get(t.assignee_id || '')
              return (
                <button key={t.id} type="button" onClick={() => props.setSelectedTask(t)}
                  className="w-full text-left flex items-start gap-3 rounded-[var(--radius)] border border-[var(--danger)]/20 bg-[var(--danger-soft)] p-3 mb-2 hover:border-[var(--danger)]/40 transition-colors">
                  <AlertCircle size={14} className="text-[var(--danger)] mt-0.5 shrink-0"/>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{t.title}</p>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">
                      <span className="font-spec text-[9px] text-[var(--text-muted)]">GIAO</span> {head?.full_name || '—'} · <span className="font-spec text-[9px] text-[var(--text-muted)]">PHỤ TRÁCH</span> {assignee?.full_name || 'Chưa gán'}
                    </p>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">{getUrgentReason(t)}</p>
                  </div>
                </button>
              )
            })}
          </div>

          {/* Chờ duyệt */}
          <div className={cardCls}>
            <div className="flex items-center gap-2 mb-3">
              <Clock size={15} className="text-[var(--info)]"/>
              <p className="text-sm font-semibold text-[var(--text-secondary)]">Chờ duyệt / Làm lại</p>
              {(pendingSteps.length + revisionSteps.length) > 0 && (
                <span className="ml-auto text-xs font-bold text-[var(--info)]">{pendingSteps.length + revisionSteps.length}</span>
              )}
            </div>
            <DashboardStepList title="Chờ duyệt" steps={pendingSteps.slice(0, 4)} tasks={tasks}
              emptyText="Không có bước chờ duyệt." onTaskClick={props.setSelectedTask} />
            {revisionSteps.length > 0 && (
              <div className="mt-3">
                <DashboardStepList title="Cần làm lại" steps={revisionSteps.slice(0, 3)} tasks={tasks}
                  emptyText="" onTaskClick={props.setSelectedTask} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Dashboard Charts ─────────────────────────────────────────────────────────

function DashboardDonut({ data, total }: { data: Array<{ name: string; value: number; color: string }>; total: number }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  if (!mounted) return <div className="h-48 skeleton rounded-[var(--radius)]" />

  // Dynamic import via inline lazy rendering
  const { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } = require('recharts')
  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={160}>
        <PieChart>
          <Pie data={data} cx="50%" cy="50%" innerRadius={48} outerRadius={72} paddingAngle={2} dataKey="value">
            {data.map((entry: { name: string; value: number; color: string }, index: number) => (
              <Cell key={index} fill={entry.color} strokeWidth={0} />
            ))}
          </Pie>
          <Tooltip formatter={(v: number, name: string) => [`${v} việc`, name]}
            contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <p className="text-2xl font-bold text-[var(--text-primary)]">{total}</p>
        <p className="text-xs text-[var(--text-muted)]">tổng việc</p>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 justify-center">
        {data.map((d) => (
          <span key={d.name} className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
            <span className="h-2 w-2 rounded-full" style={{ background: d.color }}/>
            {d.name}
          </span>
        ))}
      </div>
    </div>
  )
}

function DashboardWorkloadBar({ data }: { data: Array<{ name: string; done: number; doing: number; overdue: number }> }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  if (!mounted) return <div className="h-48 skeleton rounded-[var(--radius)]" />

  const { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } = require('recharts')
  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={data} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
        <Bar dataKey="done" name="Xong" fill="#5B6B2E" radius={[3,3,0,0]} stackId="a" />
        <Bar dataKey="doing" name="Đang làm" fill="#8A8047" radius={[3,3,0,0]} stackId="a" />
        <Bar dataKey="overdue" name="Trễ" fill="#8A3A2E" radius={[3,3,0,0]} stackId="a" />
      </BarChart>
    </ResponsiveContainer>
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
  setSubtaskForm: (value: SubtaskForm) => void
  createSubtask: (parent: Task) => void
  openStepForm: (task: Task) => void
  stepOpenFor: string
  setStepOpenFor: (value: string) => void
  stepForm: StepForm
  setStepForm: (value: StepForm) => void
  createStep: (taskId: string) => void
  updateTaskStatus: (taskId: string, status: string) => void
  updateIssueStatus: (taskId: string, status: string) => void
  updateTaskHead: (taskId: string, headIds: string[]) => void
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
  addComment: (stepId: string) => void
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
}) {
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set())
  const [expandedWorkstreams, setExpandedWorkstreams] = useState<Set<string>>(new Set())
  const [expandedSubtasks, setExpandedSubtasks] = useState<Set<string>>(new Set())

  function toggleProject(id: string) {
    setExpandedProjects((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleWorkstream(id: string) {
    setExpandedWorkstreams((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleSubtask(id: string) {
    setExpandedSubtasks((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  return (
    <div className="space-y-3">
      {props.projects.length === 0 ? (
        <Card>
          <EmptyState title="Chưa có dự án" description="Bấm + Tạo mới để thêm dự án." />
        </Card>
      ) : (
        props.projects.map((project) => {
          const projectWorkstreams = props.workstreams.filter((ws) => ws.project_id === project.id)
          const projectProgress = calculateProjectProgress(projectWorkstreams, props.tasksByParent, props.stepsByTask)
          const isProjectExpanded = expandedProjects.has(project.id)

          return (
            <div key={project.id} className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden">
              {/* Project header */}
              <div className="flex items-center gap-2 px-5 py-4 hover:bg-[var(--bg-surface)] transition-colors">
                <button
                  type="button"
                  onClick={() => toggleProject(project.id)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <span className="w-4 shrink-0 text-sm font-bold text-[var(--text-secondary)]">
                    {isProjectExpanded ? <Ico d={IC.chevronDown} size={14}/> : <Ico d={IC.chevronRight} size={14}/>}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-[var(--text-primary)] truncate">{project.name}</span>
                      <span className="shrink-0 rounded-full bg-[var(--bg-base)] px-2 py-0.5 text-xs font-bold text-[var(--text-secondary)]">
                        {projectWorkstreams.length} đầu việc lớn
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="h-1.5 w-32 rounded-full bg-[var(--border)]">
                        <div
                          className="h-1.5 rounded-full bg-[var(--olive)] transition-all"
                          style={{ width: `${projectProgress}%` }}
                        />
                      </div>
                      <span className="text-xs font-bold text-[var(--text-secondary)]">{projectProgress}%</span>
                    </div>
                  </div>
                </button>
                {props.canCreateWorkstream && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); props.openWorkstreamForm(project.id) }}
                  className="shrink-0 flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--olive)] bg-transparent px-3 py-1.5 text-xs font-semibold text-[var(--olive)] hover:bg-[var(--olive)] hover:text-[var(--ivory)] transition-colors"
                >
                  <Ico d={IC.plus} size={13}/>
                  Đầu việc lớn
                </button>
                )}
                {props.canDeleteTask && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); props.deleteProject(project) }}
                  className="shrink-0 flex items-center gap-1.5 rounded-lg border border-[var(--danger)]/30 px-3 py-1.5 text-xs font-semibold text-[var(--danger)] hover:bg-[var(--danger-soft)]"
                >
                  <Ico d={IC.trash} size={13}/>
                  Xóa
                </button>
                )}
              </div>

              {/* Workstreams */}
              {isProjectExpanded && (
                <div className="border-t border-[var(--border)]">
                  {projectWorkstreams.length === 0 ? (
                    <div className="px-8 py-4 text-sm text-[var(--text-secondary)]">Chưa có đầu việc lớn.</div>
                  ) : (
                    projectWorkstreams.map((ws) => {
                      const wsProgress = calculateWorkstreamProgress(ws, props.tasksByParent, props.stepsByTask)
                      const wsHead = props.employeeMap.get(ws.head_id || '')
                      const wsHeadNames = (ws.head_ids && ws.head_ids.length > 0
                        ? ws.head_ids.map((id) => props.employeeMap.get(id)?.full_name).filter((x): x is string => Boolean(x))
                        : wsHead ? [wsHead.full_name] : [])
                      const wsAssignee = props.employeeMap.get(ws.assignee_id || '')
                      const subtasks = props.tasksByParent.get(ws.id) || []
                      const isWsExpanded = expandedWorkstreams.has(ws.id)

                      return (
                        <div key={ws.id} className="border-b border-[var(--border)] last:border-b-0">
                          <div className="flex items-center gap-2 pl-8 pr-3 py-3 hover:bg-[var(--bg-surface)] transition-colors">
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
                                  <span><span className="font-spec text-[9px] text-[var(--text-muted)]">GIAO</span> {wsHeadNames.length ? wsHeadNames.join(', ') : 'Chưa gán'}</span>
                                  <span><span className="font-spec text-[9px] text-[var(--text-muted)]">PHỤ TRÁCH</span> {wsAssignee ? wsAssignee.full_name : 'Chưa gán'}</span>
                                  {ws.due_date && <span>· {ws.due_date}</span>}
                                  <span className="font-bold text-[var(--text-primary)]">{wsProgress}%</span>
                                </div>
                              </div>
                            </button>
                            <div className="flex shrink-0 items-center gap-1.5">
                              <HeadPicker
                                headIds={ws.head_ids || (ws.head_id ? [ws.head_id] : [])}
                                employees={props.employees}
                                onSave={(ids) => props.updateTaskHead(ws.id, ids)}
                              />
                              {props.canCreateSubtask(ws) && (
                                <button type="button"
                                  onClick={() => props.openSubtaskForm(ws)}
                                  className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-surface)] px-2.5 py-1 text-xs font-semibold text-[var(--olive)] hover:border-[var(--olive)]"
                                >
                                  + Việc con
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
                            <div className="pl-12 pr-4 pb-3">
                              <InlineSubtaskForm
                                parent={ws}
                                form={props.subtaskForm}
                                setForm={props.setSubtaskForm}
                                departments={props.departments}
                                employees={props.employees}
                                createSubtask={props.createSubtask}
                                cancel={() => props.setSubtaskOpenFor('')}
                              />
                            </div>
                          )}

                          {isWsExpanded && (
                            <div className="border-t border-[var(--border)] bg-[var(--bg-surface)]">
                              {subtasks.length === 0 ? (
                                <div className="py-3 pl-14 text-xs text-[var(--text-secondary)]">Chưa có đầu việc con.</div>
                              ) : (
                                subtasks.map((subtask) => {
                                  const stepsForSubtask = props.stepsByTask.get(subtask.id) || []
                                  const subtaskProgress = calculateTaskProgress(subtask, stepsForSubtask)
                                  const isSubtaskExpanded = expandedSubtasks.has(subtask.id)
                                  const subtaskAssignee = props.employeeMap.get(subtask.assignee_id || '')
                                  const subtaskHead = props.employeeMap.get(subtask.head_id || '')

                                  return (
                                    <div key={subtask.id} className="border-b border-[var(--border)] last:border-b-0">
                                      <div className="flex items-center gap-2 pl-14 pr-3 py-2.5 hover:bg-[var(--bg-base)] transition-colors">
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
                                              <span><span className="font-spec text-[9px] text-[var(--text-muted)]">GIAO</span> {subtaskHead ? subtaskHead.full_name : 'Chưa gán'}</span>
                                              <span><span className="font-spec text-[9px] text-[var(--text-muted)]">PHỤ TRÁCH</span> {subtaskAssignee ? subtaskAssignee.full_name : 'Chưa gán'}</span>
                                              {subtask.due_date && <span>· {subtask.due_date}</span>}
                                              <span className="font-bold text-[var(--text-primary)]">{subtaskProgress}%</span>
                                            </div>
                                          </div>
                                        </button>
                                        <div className="flex shrink-0 gap-1.5">
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
                                        <div className="pb-4 pl-14 pr-4 pt-1">
                                          <SubtaskCard
                                            task={subtask}
                                            steps={stepsForSubtask}
                                            commentsByStep={props.commentsByStep}
                                            supporters={props.supportersByTask.get(subtask.id) || []}
                                            reports={props.reportsByTask.get(subtask.id) || []}
                                            employees={props.employees}
                                            employeeMap={props.employeeMap}
                                            departmentMap={props.departmentMap}
                                            setSelectedTask={props.setSelectedTask}
                                            openStepForm={props.openStepForm}
                                            stepOpenFor={props.stepOpenFor}
                                            setStepOpenFor={props.setStepOpenFor}
                                            stepForm={props.stepForm}
                                            setStepForm={props.setStepForm}
                                            createStep={props.createStep}
                                            updateTaskStatus={props.updateTaskStatus}
                                            updateIssueStatus={props.updateIssueStatus}
                                            updateTaskHead={props.updateTaskHead}
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
              )}
            </div>
          )
        })
      )}
    </div>
  )
}

function InlineSubtaskForm(props: {
  parent: Task
  form: SubtaskForm
  setForm: (value: SubtaskForm) => void
  departments: Department[]
  employees: Employee[]
  createSubtask: (parent: Task) => void
  cancel: () => void
}) {
  return (
    <div className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-4">
      <h4 className="mb-3 font-extrabold">Tạo đầu việc con</h4>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <Input
          placeholder="Tên đầu việc con"
          value={props.form.title}
          onChange={(value) => props.setForm({ ...props.form, title: value })}
        />
        <Input
          placeholder="Mô tả"
          value={props.form.description}
          onChange={(value) => props.setForm({ ...props.form, description: value })}
        />
        <Select
          value={props.form.departmentId}
          onChange={(value) => props.setForm({ ...props.form, departmentId: value })}
        >
          <option value="">Chọn phòng ban</option>
          {props.departments.map((department) => (
            <option key={department.id} value={department.id}>
              {department.name}
            </option>
          ))}
        </Select>
        <Select
          value={props.form.headId}
          onChange={(value) => props.setForm({ ...props.form, headId: value })}
        >
          <option value="">Chọn Head</option>
          {props.employees.map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.full_name}
            </option>
          ))}
        </Select>
        <Select
          value={props.form.assigneeId}
          onChange={(value) => props.setForm({ ...props.form, assigneeId: value })}
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
          value={props.form.dueDate}
          onChange={(event) => props.setForm({ ...props.form, dueDate: event.target.value })}
        />
        <Select
          value={props.form.priority}
          onChange={(value) => props.setForm({ ...props.form, priority: value })}
        >
          <option value="low">Ưu tiên thấp</option>
          <option value="medium">Ưu tiên trung bình</option>
          <option value="high">Ưu tiên cao</option>
        </Select>
      </div>

      <div className="mt-4 flex gap-2">
        <button type="button"
          onClick={() => props.createSubtask(props.parent)}
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
  setSelectedTask: (task: Task) => void
  openStepForm: (task: Task) => void
  stepOpenFor: string
  setStepOpenFor: (value: string) => void
  stepForm: StepForm
  setStepForm: (value: StepForm) => void
  createStep: (taskId: string) => void
  updateTaskStatus: (taskId: string, status: string) => void
  updateIssueStatus: (taskId: string, status: string) => void
  updateTaskHead: (taskId: string, headIds: string[]) => void
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
  addComment: (stepId: string) => void
  uploadStepFile: (step: TaskStep, file?: File) => void
  deleteTask: (task: Task) => void
  deleteStep: (step: TaskStep) => void
  deleteSupporter: (supporter: TaskSupporter) => void
  clearStepFile: (step: TaskStep) => void
  supporterDrafts: Record<string, string>
  setSupporterDrafts: (value: Record<string, string>) => void
  createSupporter: (taskId: string) => void
  getStatusLabel: (status: string) => string
}) {
  const head = props.employeeMap.get(props.task.head_id || props.task.assignee_id || '')
  const department = props.departmentMap.get(props.task.department_id || '')
  const progress = calculateTaskProgress(props.task, props.steps)
  const slow = isTaskSlow(props.task, props.steps)
  const overdue = isTaskOverdue(props.task)
  const problem = isTaskProblem(props.task)

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
            <span>Head:</span>
            <HeadPicker
              headIds={props.task.head_ids || (props.task.head_id ? [props.task.head_id] : [])}
              employees={props.employees}
              onSave={(ids) => props.updateTaskHead(props.task.id, ids)}
            />
            <span>· Phòng ban: <b>{department?.name || 'Chưa gắn'}</b> · Deadline: <b>{props.task.due_date || 'Chưa có'}</b></span>
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
            onChange={(event) => props.setSupporterDrafts({ ...props.supporterDrafts, [props.task.id]: event.target.value })}
          >
            <option value="">+ Người hỗ trợ</option>
            {props.employees.map((employee) => (
              <option key={employee.id} value={employee.id}>{employee.full_name}</option>
            ))}
          </select>
          <button type="button"
            onClick={() => props.createSupporter(props.task.id)}
            className="h-10 rounded-xl border border-[var(--border)] px-3 text-xs font-bold"
          >
            Thêm HT
          </button>

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

      <div className="rounded-2xl bg-[var(--bg-surface)] p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="font-extrabold">Các bước thực hiện & duyệt</p>
          <button type="button"
            onClick={() => props.openStepForm(props.task)}
            className="rounded-lg bg-[var(--bg-card)] px-3 py-1 text-xs font-bold"
          >
            + Bước
          </button>
        </div>

        {props.stepOpenFor === props.task.id && (
          <InlineStepForm
            taskId={props.task.id}
            form={props.stepForm}
            setForm={props.setStepForm}
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
              const locked = previousStep ? previousStep.approval_status !== 'approved' : false

              return (
                <StepWorkflowCard
                  key={step.id}
                  step={step}
                  locked={locked}
                  employees={props.employees}
                  employeeMap={props.employeeMap}
                  comments={props.commentsByStep.get(step.id) || []}
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
                  deleteStep={props.deleteStep}
                  clearStepFile={props.clearStepFile}
                />
              )
            })
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="font-semibold text-[var(--text-secondary)]">Hỗ trợ:</span>
        {props.supporters.length === 0 ? (
          <span className="text-[var(--text-muted)]">chưa có</span>
        ) : (
          props.supporters.map((supporter) => (
            <span key={supporter.id} className="inline-flex items-center gap-1 rounded-full bg-[var(--bg-surface)] px-2 py-0.5">
              {supporter.employees?.full_name || 'Không rõ'}
              <button type="button" onClick={() => props.deleteSupporter(supporter)} className="text-[var(--danger)] hover:opacity-70">✕</button>
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
  form: StepForm
  setForm: (value: StepForm) => void
  employees: Employee[]
  createStep: (taskId: string) => void
  cancel: () => void
}) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
      <h4 className="mb-3 font-extrabold">Tạo bước thực hiện</h4>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <Input
          placeholder="Tên bước"
          value={props.form.title}
          onChange={(value) => props.setForm({ ...props.form, title: value })}
        />
        <Select
          value={props.form.ownerId}
          onChange={(value) => props.setForm({ ...props.form, ownerId: value })}
        >
          <option value="">Chọn người phụ trách</option>
          {props.employees.map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.full_name}
            </option>
          ))}
        </Select>
        <Select
          value={props.form.approverId}
          onChange={(value) => props.setForm({ ...props.form, approverId: value })}
        >
          <option value="">Chọn trưởng bộ phận duyệt</option>
          {props.employees.map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.full_name}
            </option>
          ))}
        </Select>
        <input
          type="date"
          className="h-12 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] px-4 text-sm outline-none"
          value={props.form.dueDate}
          onChange={(event) => props.setForm({ ...props.form, dueDate: event.target.value })}
        />
      </div>

      <div className="mt-4 flex gap-2">
        <button type="button"
          onClick={() => props.createStep(props.taskId)}
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

function StepWorkflowCard(props: {
  step: TaskStep
  locked: boolean
  employees: Employee[]
  employeeMap: Map<string, Employee>
  comments: StepComment[]
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
  addComment: (stepId: string) => void
  uploadStepFile: (step: TaskStep, file?: File) => void
  deleteStep: (step: TaskStep) => void
  clearStepFile: (step: TaskStep) => void
}) {
  const owner = props.employeeMap.get(props.step.owner_id || '')
  const departmentApprover = props.employeeMap.get(props.step.department_approver_id || props.step.approver_id || '')
  const cooApprover = props.employeeMap.get(props.step.coo_approver_id || '')
  const ceoApprover = props.employeeMap.get(props.step.ceo_approver_id || '')
  const status = props.step.approval_status || 'not_submitted'
  const stage = props.step.approval_stage || 'department'
  const approvalRoute = buildApprovalRoute(props.step)
  const approveButtonLabel = getApproveButtonLabel(stage)

  return (
    <div className={`rounded-2xl border bg-[var(--bg-card)] p-4 ${props.locked ? 'opacity-60' : ''}`}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-extrabold">
                {props.step.step_order}. {props.step.step_title}
              </p>
              <StepApprovalBadge status={status} />
              {props.locked && (
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">
                  Khóa đến khi bước trước được duyệt
                </span>
              )}
            </div>

            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Phụ trách: <b>{owner?.full_name || 'Chưa gắn'}</b> · Trưởng bộ phận:{' '}
              <b>{departmentApprover?.full_name || 'Chưa gắn'}</b> · Deadline:{' '}
              <b>{props.step.due_date || 'Chưa có'}</b>
            </p>
          </div>
        </div>

        <button type="button"
          onClick={() => props.deleteStep(props.step)}
          className="rounded-lg bg-[var(--danger-soft)] px-3 py-1 text-xs font-bold text-[var(--danger)]"
        >
          Xóa bước
        </button>
      </div>

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
        <p className="mb-3 text-sm font-extrabold">Tuyến duyệt: {approvalRoute}</p>

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
          <div>
            <p className="mb-1 text-xs font-extrabold text-[var(--text-secondary)]">Trưởng bộ phận duyệt</p>
            <Select
              value={props.step.department_approver_id || props.step.approver_id || ''}
              onChange={(value) =>
                props.updateStep(props.step, {
                  department_approver_id: value || null,
                  approver_id: value || null,
                } as Partial<TaskStep>)
              }
            >
              <option value="">Chọn trưởng bộ phận</option>
              {props.employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.full_name}
                </option>
              ))}
            </Select>
          </div>

          <label className="flex min-h-12 items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] px-4 text-sm font-bold">
            <input
              type="checkbox"
              checked={Boolean(props.step.requires_coo_approval)}
              onChange={(event) =>
                props.updateStep(props.step, {
                  requires_coo_approval: event.target.checked,
                  coo_approval_status: event.target.checked ? 'not_submitted' : 'not_required',
                } as Partial<TaskStep>)
              }
            />
            Cần COO duyệt
          </label>

          <label className="flex min-h-12 items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] px-4 text-sm font-bold">
            <input
              type="checkbox"
              checked={Boolean(props.step.requires_ceo_approval)}
              onChange={(event) =>
                props.updateStep(props.step, {
                  requires_ceo_approval: event.target.checked,
                  ceo_approval_status: event.target.checked ? 'not_submitted' : 'not_required',
                } as Partial<TaskStep>)
              }
            />
            Cần CEO duyệt
          </label>
        </div>

        {(props.step.requires_coo_approval || props.step.requires_ceo_approval) && (
          <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
            {props.step.requires_coo_approval && (
              <div>
                <p className="mb-1 text-xs font-extrabold text-[var(--text-secondary)]">COO duyệt vận hành</p>
                <Select
                  value={props.step.coo_approver_id || ''}
                  onChange={(value) => props.updateStep(props.step, { coo_approver_id: value || null } as Partial<TaskStep>)}
                >
                  <option value="">Chọn COO</option>
                  {props.employees.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.full_name}
                    </option>
                  ))}
                </Select>
              </div>
            )}

            {props.step.requires_ceo_approval && (
              <div>
                <p className="mb-1 text-xs font-extrabold text-[var(--text-secondary)]">CEO duyệt cuối</p>
                <Select
                  value={props.step.ceo_approver_id || ''}
                  onChange={(value) => props.updateStep(props.step, { ceo_approver_id: value || null } as Partial<TaskStep>)}
                >
                  <option value="">Chọn CEO</option>
                  {props.employees.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.full_name}
                    </option>
                  ))}
                </Select>
              </div>
            )}
          </div>
        )}

        <div className="mt-3 grid grid-cols-1 gap-2 text-sm xl:grid-cols-3">
          <ApprovalStatusPill label="Trưởng bộ phận" status={props.step.department_approval_status || status} />
          <ApprovalStatusPill label="COO" status={props.step.coo_approval_status || 'not_required'} />
          <ApprovalStatusPill label="CEO" status={props.step.ceo_approval_status || 'not_required'} />
        </div>

        <p className="mt-2 text-xs text-[var(--text-secondary)]">
          Người duyệt: Trưởng bộ phận {departmentApprover?.full_name || 'chưa gắn'}
          {props.step.requires_coo_approval ? ` · COO ${cooApprover?.full_name || 'chưa gắn'}` : ''}
          {props.step.requires_ceo_approval ? ` · CEO ${ceoApprover?.full_name || 'chưa gắn'}` : ''}
        </p>
      </div>

      {props.step.support_request && (
        <div className="mt-3 rounded-xl bg-[var(--warning-soft)] p-3 text-sm text-[var(--warning)]">
          <b>Yêu cầu hỗ trợ:</b> {props.step.support_request}
        </div>
      )}

      {props.step.approval_note && (
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
              value={props.linkDrafts[props.step.id] ?? props.step.report_link ?? ''}
              onChange={(event) =>
                props.setLinkDrafts({
                  ...props.linkDrafts,
                  [props.step.id]: event.target.value,
                })
              }
              onBlur={() => {
                const draft = props.linkDrafts[props.step.id]
                if (draft !== undefined && draft !== (props.step.report_link ?? '')) {
                  props.saveStepLink(props.step)
                }
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') (event.target as HTMLInputElement).blur()
              }}
            />
            <button type="button"
              onClick={() => props.saveStepLink(props.step)}
              className="rounded-lg bg-[var(--bg-card)] px-3 text-xs font-bold text-[var(--text-primary)]"
            >
              Lưu
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
          <p className="mb-2 text-sm font-extrabold">Bình luận / cần hỗ trợ</p>

          <div className="mb-3 flex gap-2">
            <input
              className="h-9 flex-1 rounded-lg border border-[var(--border)] px-3 text-xs outline-none"
              placeholder="VD: Em cần công cụ hỗ trợ... (Enter để lưu)"
              value={props.supportDrafts[props.step.id] ?? props.step.support_request ?? ''}
              onChange={(event) =>
                props.setSupportDrafts({
                  ...props.supportDrafts,
                  [props.step.id]: event.target.value,
                })
              }
              onKeyDown={(event) => {
                if (event.key === 'Enter') props.saveSupportRequest(props.step)
              }}
            />
            <button type="button"
              onClick={() => props.saveSupportRequest(props.step)}
              className="rounded-lg bg-[var(--bg-card)] px-3 text-xs font-bold text-[var(--text-primary)]"
            >
              Lưu
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

          <div className="flex gap-2">
            <input
              className="h-9 flex-1 rounded-lg border border-[var(--border)] px-3 text-xs outline-none"
              placeholder="Nhập bình luận... (Enter để gửi)"
              value={props.commentDrafts[props.step.id] || ''}
              onChange={(event) =>
                props.setCommentDrafts({
                  ...props.commentDrafts,
                  [props.step.id]: event.target.value,
                })
              }
              onKeyDown={(event) => {
                if (event.key === 'Enter') props.addComment(props.step.id)
              }}
            />
            <button type="button"
              onClick={() => props.addComment(props.step.id)}
              className="rounded-lg bg-[var(--bg-card)] px-3 text-xs font-bold text-[var(--text-primary)]"
            >
              Gửi
            </button>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-[var(--radius)] bg-[var(--danger-soft)] p-3">
        <p className="mb-2 text-sm font-semibold text-[var(--danger)]">Yêu cầu làm lại nếu chưa đạt</p>
        <div className="flex gap-2">
          <input
            className="h-9 flex-1 rounded-lg border border-[var(--danger)]/20 px-3 text-xs outline-none"
            placeholder="Nhập lý do cần làm lại..."
            value={props.revisionDrafts[props.step.id] || ''}
            onChange={(event) =>
              props.setRevisionDrafts({
                ...props.revisionDrafts,
                [props.step.id]: event.target.value,
              })
            }
          />
          <button type="button"
            disabled={props.locked}
            onClick={() => props.requestRevision(props.step)}
            className="rounded-[var(--radius-sm)] bg-[var(--danger)] px-3 text-xs font-bold text-[var(--paper)] disabled:opacity-40"
          >
            Gửi
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button"
          disabled={props.locked || status === 'approved'}
          onClick={() => props.submitStep(props.step)}
          className="rounded-[var(--radius)] bg-[var(--olive)] px-4 py-2 text-xs font-extrabold text-[var(--ivory)] disabled:opacity-40"
        >
          Gửi duyệt
        </button>

        <button type="button"
          disabled={props.locked}
          onClick={() => props.approveStep(props.step)}
          className="rounded-xl bg-[var(--bg-card)] px-4 py-2 text-xs font-extrabold text-[var(--text-primary)] disabled:opacity-40"
        >
          {approveButtonLabel}
        </button>
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
  currentEmployee: Employee | null
}) {
  const [focusProject, setFocusProject] = useState<string | null>(null)
  const [boardProject, setBoardProject] = useState<string | null>(null)
  const boardProjectCard = boardProject ? props.projectCards.find((p) => p.id === boardProject) : null

  // ── Tổng hợp tự động từ data thật ──
  const totalTasks = props.projectCards.reduce((s, p) => s + p.total, 0)
  const totalDone = props.projectCards.reduce((s, p) => s + p.done, 0)
  const overallRate = totalTasks === 0 ? 0 : Math.round((totalDone / totalTasks) * 100)

  // 3 ô tự gom (kiểu Cockpit 00·1)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const weekEnd = new Date(today); weekEnd.setDate(weekEnd.getDate() + 7)

  const dueThisWeek = props.tasks.filter((t) => {
    if (t.status === 'completed' || !t.due_date) return false
    const d = new Date(t.due_date); d.setHours(0, 0, 0, 0)
    return d >= today && d <= weekEnd
  })
  const stuck = props.tasks.filter((t) => isTaskOverdue(t) || isTaskProblem(t))
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
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 pt-2">
        <span className="rounded-md bg-[var(--bg-card)] px-2 py-0.5 font-mono text-[11px] font-bold text-[var(--accent)]">{n}</span>
        <h2 className="font-display text-lg text-[var(--text-primary)]">{title}</h2>
        {desc && <p className="text-xs text-[var(--text-muted)]">{desc}</p>}
      </div>
    )
  }

  return (
    <div className="space-y-5">

      {/* ══ Hero — đích cuối ══ */}
      <div className="overflow-hidden rounded-2xl border border-[var(--olive)] bg-[var(--bg-card-hover)] text-[var(--text-primary)]">
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
        <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)]">
          <div className="divide-y divide-[#d9d3c5]">
            {props.projectCards.map((project) => {
              const isFocus = focusProject === project.id
              const healthColor =
                project.health.label === 'Tốt' ? 'bg-[var(--ok)]' :
                project.health.label === 'Chú ý' ? 'bg-[var(--warn)]' : 'bg-[var(--crit)]'
              const dotColor =
                project.health.label === 'Tốt' ? 'bg-[var(--ok)]' :
                project.health.label === 'Chú ý' ? 'bg-[var(--warn)]' : 'bg-[var(--crit)]'

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
                      <div className={`h-5 rounded-full transition-all ${healthColor}`} style={{ width: `${Math.max(project.rate, 1)}%` }} />
                      {project.rate > 10 && (
                        <span className="absolute inset-y-0 left-2 flex items-center text-[10px] font-extrabold text-[var(--text-primary)]">{project.rate}%</span>
                      )}
                    </div>
                    {project.rate <= 10 && <span className="shrink-0 text-xs font-extrabold tabular-nums text-[var(--text-primary)]">{project.rate}%</span>}
                  </div>
                  <div className="flex shrink-0 items-center gap-3 text-xs tabular-nums">
                    <span className="font-bold text-[var(--success)]">{project.done}<span className="font-normal text-[var(--text-muted)]">/{project.total}</span></span>
                    {project.overdue > 0 && <span className="font-bold text-[var(--danger)]">⚠ {project.overdue}</span>}
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
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)]">
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
                  const urg = props.tasks.filter((t) => t.project_id === focusedProject.id && (isTaskOverdue(t) || isTaskProblem(t))).slice(0, 5)
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
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] px-4 py-3">
            <p className="mb-2 text-[10px] font-extrabold uppercase tracking-wide text-[var(--text-secondary)]">Màu sức khỏe</p>
            <div className="space-y-1.5">
              {[
                { color: 'bg-[var(--ok)]', label: 'Tốt — đúng tiến độ' },
                { color: 'bg-[var(--warn)]', label: 'Chú ý — có rủi ro' },
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
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
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
            project.health.label === 'Tốt' ? 'bg-[var(--success-soft)] text-[var(--ok)]' :
            project.health.label === 'Chú ý' ? 'bg-[var(--warning-soft)] text-[var(--warn)]' :
            'bg-[var(--danger-soft)] text-[var(--crit)]'
          const barColor =
            project.health.label === 'Tốt' ? 'var(--ok)' :
            project.health.label === 'Chú ý' ? 'var(--warn)' : 'var(--crit)'
          return (
            <button
              key={project.id}
              type="button"
              onClick={() => setBoardProject(project.id)}
              className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 text-left transition-shadow hover:shadow-md"
            >
              <div className="mb-3 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-extrabold text-[var(--text-primary)]">{project.name}</p>
                  {project.code && <p className="text-[10px] text-[var(--text-muted)]">{project.code}</p>}
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${healthCls}`}>{project.health.label}</span>
              </div>
              <div className="mb-2 h-2.5 overflow-hidden rounded-full bg-[var(--bg-surface)]">
                <div className="h-2.5 rounded-full" style={{ width: `${Math.max(project.rate, 1)}%`, background: barColor }} />
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <span className="font-bold tabular-nums text-[var(--text-secondary)]">{project.rate}% · {project.done}/{project.total} việc</span>
                {project.overdue > 0 && <span className="font-semibold text-[var(--crit)]">{project.overdue} trễ</span>}
                {project.problem > 0 && <span className="font-semibold text-[var(--warn)]">{project.problem} vấn đề</span>}
                <span className="ml-auto font-extrabold text-[var(--text-primary)]">Mở bảng →</span>
              </div>
            </button>
          )
        })}
      </div>

      {/* ══ Project board modal ══ */}
      {boardProjectCard && (() => {
        const pTasks = props.tasks.filter((t) => t.project_id === boardProjectCard.id)
        const pTaskIds = new Set(pTasks.map((t) => t.id))
        const pDue = pTasks.filter((t) => {
          if (t.status === 'completed' || !t.due_date) return false
          const d = new Date(t.due_date); d.setHours(0, 0, 0, 0)
          return d >= today && d <= weekEnd
        }).length
        const pStuck = pTasks.filter((t) => isTaskOverdue(t) || isTaskProblem(t)).length
        const pPend = props.steps.filter((s) => pTaskIds.has(s.task_id) && !s.is_done && s.approval_status === 'pending').length
        const workstreams = props.tasks.filter((t) => t.project_id === boardProjectCard.id && isWorkstream(t))

        return (
          <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:p-8" onClick={() => setBoardProject(null)}>
            <div className="w-full max-w-4xl overflow-hidden rounded-2xl bg-[var(--bg-card)] shadow-2xl ring-1 ring-black/5" onClick={(e) => e.stopPropagation()}>

              {/* ── Sticky header ── */}
              <div className="sticky top-0 z-10 flex items-center gap-3 bg-[var(--bg-card)] px-5 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[var(--text-primary)]/50 uppercase tracking-widest" style={{fontSize:'10px'}}>
                    {boardProjectCard.code || 'PROJECT'}
                  </p>
                  <p className="truncate text-base font-bold text-[var(--text-primary)] leading-snug">{boardProjectCard.name}</p>
                </div>
                <button type="button"
                  onClick={() => { props.setSelectedProjectId(boardProjectCard.id); props.setView('coo') }}
                  className="shrink-0 rounded-lg bg-[var(--accent)] px-3.5 py-1.5 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--accent-hover)] transition-colors">
                  Mở COO Board
                </button>
                {props.canDeleteProject && (
                  <button type="button"
                    onClick={() => { setBoardProject(null); props.deleteProject(boardProjectCard) }}
                    className="shrink-0 rounded-lg border border-[var(--danger)]/30 px-3 py-1.5 text-xs font-semibold text-[var(--danger)] hover:bg-[var(--danger-soft)] transition-colors">
                    Xóa dự án
                  </button>
                )}
                <button type="button" onClick={() => setBoardProject(null)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--text-primary)]/60 hover:bg-[var(--bg-card)]/10 transition-colors">
                  <Ico d={IC.x} size={16} />
                </button>
              </div>

              {/* ── Progress bar ── */}
              <div className="h-1 w-full bg-[var(--border)]">
                <div className="h-full bg-[var(--olive)] transition-all" style={{ width: `${boardProjectCard.rate}%` }} />
              </div>

              <div className="p-5 space-y-6">

                {/* ── Description ── */}
                {boardProjectCard.description && (
                  <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{boardProjectCard.description}</p>
                )}

                {/* ── Stats row ── */}
                <div className="grid grid-cols-4 gap-3">
                  {[
                    { label: 'Tiến độ', v: `${boardProjectCard.rate}%`, sub: `${boardProjectCard.done}/${boardProjectCard.total} việc`, c: 'text-[var(--text-primary)]' },
                    { label: 'Xong tuần này', v: pDue, sub: 'việc cần hoàn thành', c: pDue > 0 ? 'text-[var(--success)]' : 'text-[var(--text-muted)]' },
                    { label: 'Kẹt / trễ', v: pStuck, sub: 'cần xử lý ngay', c: pStuck > 0 ? 'text-[var(--danger)]' : 'text-[var(--text-muted)]' },
                    { label: 'Chờ duyệt', v: pPend, sub: 'bước đang pending', c: pPend > 0 ? 'text-[var(--warning)]' : 'text-[var(--text-muted)]' },
                  ].map((x) => (
                    <div key={x.label} className="rounded-xl bg-[var(--bg-surface)] px-3.5 py-3">
                      <p className={`text-2xl font-extrabold tabular-nums leading-none ${x.c}`}>{x.v}</p>
                      <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{x.label}</p>
                      <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">{x.sub}</p>
                    </div>
                  ))}
                </div>

                {/* ── Task workstreams ── */}
                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-xs font-bold uppercase tracking-widest text-[var(--text-muted)]">Việc theo mảng</p>
                    <p className="text-xs text-[var(--text-muted)]">bấm để mở chi tiết</p>
                  </div>
                  <div className="space-y-2">
                    {workstreams.map((ws) => {
                      const children = props.tasks.filter((t) => t.parent_task_id === ws.id)
                      const doneCount = children.filter((c) => c.status === 'completed').length
                      const wsProgress = children.length > 0 ? Math.round((doneCount / children.length) * 100) : 0
                      return (
                        <div key={ws.id} className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
                          {/* Workstream header */}
                          <div className="flex items-center gap-3 px-4 py-2.5">
                            <p className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--text-primary)]">{ws.title}</p>
                            <div className="flex items-center gap-2 shrink-0">
                              <div className="h-1.5 w-16 overflow-hidden rounded-full bg-[var(--border)]">
                                <div className="h-full rounded-full bg-[var(--olive)]" style={{ width: `${wsProgress}%` }} />
                              </div>
                              <span className="w-10 text-right text-[10px] font-bold tabular-nums text-[var(--text-muted)]">{doneCount}/{children.length}</span>
                            </div>
                          </div>
                          {/* Child tasks */}
                          {children.length > 0 && (
                            <div className="border-t border-[var(--border)] divide-y divide-[var(--border)]">
                              {children.map((t) => {
                                                                const desc = t.description || ''
                                const ownerM = (desc.match(/owner:\s*([^|]+)/) || [])[1]?.trim()
                                const moduleM = (desc.match(/module:\s*([^|]+)/) || [])[1]?.trim()
                                const blkRaw = (desc.match(/blocker:\s*(CAN QUYET|CAN SO|CAN BUILD)/) || [])[1]
                                const blkLabel = blkRaw === 'CAN QUYET' ? 'Cần quyết' : blkRaw === 'CAN SO' ? 'Cần số' : blkRaw === 'CAN BUILD' ? 'Cần build' : ''
                                const isCrit = /critical-path/.test(desc)
                                const giaoName = props.employeeMap.get(t.head_id || '')?.full_name || '—'
                                const who = props.employeeMap.get(t.assignee_id || '')?.full_name
                                  || (desc.match(/Ai làm: ([^·]+)/) || [])[1]?.trim() || ownerM || 'Chưa gán'
                                const st =
                                  t.status === 'completed' ? { dot: 'bg-[var(--success)]', txt: 'Xong', cls: 'text-[var(--success)] bg-[var(--success-soft)]' } :
                                  isTaskOverdue(t) ? { dot: 'bg-[var(--crit)]', txt: 'Trễ', cls: 'text-[var(--crit)] bg-[var(--danger-soft)]' } :
                                  t.status === 'in_progress' ? { dot: 'bg-[var(--olive)]', txt: 'Đang', cls: 'text-[var(--olive)] bg-[var(--bg-surface)]' } :
                                  t.status === 'pending' ? { dot: 'bg-[var(--warn)]', txt: 'Kẹt', cls: 'text-[var(--warn)] bg-[var(--warning-soft)]' } :
                                  { dot: 'bg-[var(--border)]', txt: 'Chưa', cls: 'text-[var(--text-muted)] bg-[var(--bg-surface)]' }
                                return (
                                  <button key={t.id} type="button" onClick={() => props.setSelectedTask(t)}
                                    className="flex w-full flex-col gap-1 px-4 py-2 text-left hover:bg-[var(--bg-surface)] transition-colors group">
                                    <span className="flex w-full items-center gap-3">
                                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${st.dot}`} />
                                      <span className="min-w-0 flex-1 truncate text-sm text-[var(--text-primary)] group-hover:text-[var(--olive)]">{t.title}</span>
                                      <span className="w-20 shrink-0 truncate text-right text-xs text-[var(--text-muted)]">{who}</span>
                                      <span className="w-12 shrink-0 text-right text-[10px] tabular-nums text-[var(--text-muted)]">{t.due_date?.slice(5) || '—'}</span>
                                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${st.cls}`}>{st.txt}</span>
                                    </span>
                                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-4 text-[10px] text-[var(--text-muted)]">
                                      <span><span className="font-spec text-[8px]">GIAO</span> {giaoName}</span>
                                      <span><span className="font-spec text-[8px]">PHỤ TRÁCH</span> {who}</span>
                                      {isCrit && <span className="rounded-full bg-[var(--danger-soft)] px-2 py-0.5 font-semibold text-[var(--crit)]">đường găng</span>}
                                      {blkLabel && <span className="rounded-full bg-[var(--warning-soft)] px-2 py-0.5 font-semibold text-[var(--warn)]">{blkLabel}</span>}
                                      {moduleM && <span className="rounded-full bg-[var(--bg-surface)] px-2 py-0.5 font-medium text-[var(--text-secondary)]">{moduleM}</span>}
                                    </span>
                                  </button>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })}
                    {workstreams.length === 0 && (
                      <p className="py-6 text-center text-sm text-[var(--text-muted)]">Chưa có việc trong dự án này.</p>
                    )}
                  </div>
                </div>

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
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
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
                            <option value="completed">Hoàn thành</option>
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

      {/* ── Header info ── */}
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

      {/* ── Business metrics ── */}
      <Card>
        <SH n="②" title="Tình hình kinh doanh" />
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

      {/* ── Issues ── */}
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <SH n="③" title="Vấn đề nổi bật" />
          <button type="button" onClick={addIssue}
            className="rounded-lg bg-[var(--bg-card)] px-3 py-1.5 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)]">
            + Thêm vấn đề
          </button>
        </div>
        {r.issues.length === 0 ? (
          <p className="py-4 text-center text-sm text-[var(--text-muted)]">Bấm "+ Thêm vấn đề" để thêm vào.</p>
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

      {/* ── Focuses + Directions ── */}
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

      {/* ── Assignments ── */}
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <SH n="⑥" title="Phân công — Deadline tuần này" />
          <button type="button" onClick={addAssignment}
            className="rounded-lg bg-[var(--bg-card)] px-3 py-1.5 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)]">
            + Thêm người
          </button>
        </div>
        {r.assignments.length === 0 ? (
          <p className="py-4 text-center text-sm text-[var(--text-muted)]">Bấm "+ Thêm người" để thêm phân công.</p>
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

      {/* ── Quote + Notes ── */}
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

      {/* ── Import config + actions ── */}
      <Card>
        <SH n="⑨" title="Import vào COO Board" />
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1">
            <label className="mb-1 block text-xs font-semibold text-[var(--text-muted)]">Tên dự án import vào</label>
            <input className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 text-sm outline-none focus:border-[var(--char)]"
              placeholder="Tên dự án mới hoặc hiện có"
              value={props.notexProjectName}
              onChange={(e) => props.setNotexProjectName(e.target.value)}
            />
          </div>
          <button type="button" onClick={props.saveMeeting}
            className="h-10 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-5 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--bg-surface)] transition-colors">
            Lưu biên bản
          </button>
          <button type="button" onClick={props.analyzeMeetingWithAI} disabled={props.analyzing}
            className="h-10 rounded-xl bg-[var(--accent)] px-5 text-sm font-extrabold text-[var(--on-accent)] disabled:opacity-40 hover:bg-[var(--accent-hover)] transition-colors">
            {props.analyzing ? 'Đang phân tích...' : '✨ Phân tích bằng AI'}
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

      {/* ── Preview table ── */}
      {props.notexRows.length > 0 && (
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-base font-extrabold">Preview đầu việc</h3>
            <p className="mt-0.5 text-sm text-[var(--text-secondary)]">{props.notexRows.length} dòng — kiểm tra rồi bấm Import.</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1500px] text-left text-sm">
            <thead>
              <tr className="border-b bg-[var(--bg-surface)] text-xs uppercase text-[var(--text-secondary)]">
                <th className="p-3">Đầu việc lớn</th>
                <th className="p-3">Đầu việc con</th>
                <th className="p-3">Trách nhiệm</th>
                <th className="p-3">Kết quả mong muốn</th>
                <th className="p-3">Phòng ban</th>
                <th className="p-3">Head</th>
                <th className="p-3">Người phụ trách</th>
                <th className="p-3">Deadline</th>
                <th className="p-3">Ưu tiên</th>
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
                      <option value="">Người phụ trách</option>
                      {props.employees.map((em) => <option key={em.id} value={em.id}>{em.full_name}</option>)}
                    </select>
                  </td>
                  <td className="p-3">
                    <input type="date" className="h-10 w-40 rounded-xl border border-[var(--border)] px-3 text-sm outline-none"
                      value={row.dueDate} onChange={(e) => updateRow(row.id, { dueDate: e.target.value })} />
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
}) {
  const patchForm = (patch: Partial<RecurringTaskForm>) => props.setForm((prev) => ({ ...prev, ...patch }))

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

        <form onSubmit={props.saveTask} className="space-y-3">
          <Input
            placeholder="Tên việc, ví dụ: Họp Performance"
            value={props.form.title}
            onChange={(value) => patchForm({ title: value })}
          />

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {props.form.frequency === 'weekly' ? (
              <Select value={props.form.weekday} onChange={(value) => patchForm({ weekday: value })}>
                {WEEKDAY_LABELS.map((label, index) => (
                  <option key={label} value={String(index)}>{label}</option>
                ))}
              </Select>
            ) : props.form.frequency === 'monthly' ? (
              <input
                type="number"
                min={1}
                max={31}
                className="h-12 w-full rounded-2xl border border-[var(--border)] px-4 text-sm outline-none"
                value={props.form.month_day}
                onChange={(event) => patchForm({ month_day: event.target.value })}
                aria-label="Ngày trong tháng"
              />
            ) : (
              <div className="flex h-12 items-center rounded-2xl border border-[var(--border)] px-4 text-sm font-bold text-[var(--text-secondary)]">
                Lặp mỗi ngày
              </div>
            )}

            <input
              type="time"
              className="h-12 w-full rounded-2xl border border-[var(--border)] px-4 text-sm font-bold outline-none"
              value={props.form.time_of_day}
              onChange={(event) => patchForm({ time_of_day: event.target.value })}
              aria-label="Giờ họp hoặc hạn nộp"
            />
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-extrabold uppercase text-[var(--text-muted)]">Ghi chú chung</span>
            <textarea
              className="min-h-16 w-full rounded-xl border border-[var(--border)] p-3 text-sm outline-none"
              placeholder="Ví dụ: Họp Performance định kỳ thứ 7 hằng tuần lúc 10:00."
              value={props.form.description}
              onChange={(event) => patchForm({ description: event.target.value })}
            />
          </label>

          {props.form.kind === 'meeting' && (
            <div className="space-y-2 rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-3">
              <label className="block">
                <span className="mb-1 block text-xs font-extrabold uppercase text-[var(--text-muted)]">RECAP cuộc họp trước đó</span>
                <textarea
                  className="min-h-20 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-3 text-sm leading-5 outline-none"
                  placeholder="- Quyết định đã chốt&#10;- Action items còn mở&#10;- Vấn đề cần follow-up"
                  value={props.form.recap}
                  onChange={(event) => patchForm({ recap: event.target.value })}
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-extrabold uppercase text-[var(--text-muted)]">File cần chuẩn bị</span>
                <textarea
                  className="min-h-20 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-3 text-sm leading-5 outline-none"
                  placeholder="- File recap/biên bản họp trước&#10;- Báo cáo KPI/Performance&#10;- Dashboard hoặc link số liệu"
                  value={props.form.prepFiles}
                  onChange={(event) => patchForm({ prepFiles: event.target.value })}
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-extrabold uppercase text-[var(--text-muted)]">Lịch sử họp</span>
                <textarea
                  className="min-h-20 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-3 text-sm leading-5 outline-none"
                  placeholder="- 15/06: Chốt vấn đề..., giao cho..., deadline...&#10;- 22/06: ..."
                  value={props.form.meetingHistory}
                  onChange={(event) => patchForm({ meetingHistory: event.target.value })}
                />
              </label>
            </div>
          )}

          <div>
            <p className="mb-2 text-xs font-extrabold uppercase text-[var(--text-muted)]">Người nhận nhắc</p>
            <div className="max-h-40 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-1">
              {props.employees.length === 0 ? (
                <p className="px-2 py-3 text-sm text-[var(--text-secondary)]">Chưa có nhân sự để chọn.</p>
              ) : (
                <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                  {props.employees.map((employee) => {
                    const checked = props.form.assignee_ids.includes(employee.id)

                    return (
                      <label
                        key={employee.id}
                        className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-bold ${
                          checked ? 'bg-[var(--accent-soft)] text-[var(--text-primary)]' : 'hover:bg-[var(--bg-surface)]'
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-[#191919]"
                          checked={checked}
                          onChange={(event) => {
                            patchForm({
                              assignee_ids: event.target.checked
                                ? [...props.form.assignee_ids, employee.id]
                                : props.form.assignee_ids.filter((id) => id !== employee.id),
                            })
                          }}
                        />
                        <span className="min-w-0 truncate">{employee.full_name}</span>
                      </label>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-extrabold uppercase text-[var(--text-muted)]">Nhắc trước ngày</span>
              <input
                type="number"
                min={0}
                className="h-11 w-full rounded-xl border border-[var(--border)] px-3 text-sm outline-none"
                value={props.form.remind_days_before}
                onChange={(event) => patchForm({ remind_days_before: event.target.value })}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-extrabold uppercase text-[var(--text-muted)]">Nhắc trước phút</span>
              <input
                type="number"
                min={1}
                className="h-11 w-full rounded-xl border border-[var(--border)] px-3 text-sm outline-none"
                value={props.form.remind_minutes_before}
                onChange={(event) => patchForm({ remind_minutes_before: event.target.value })}
              />
            </label>
          </div>

          <button type="submit" className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--bg-card)] px-5 py-3 text-sm font-extrabold text-[var(--text-primary)]">
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
insert into public.recurring_tasks (title, kind, frequency, weekday, time_of_day, remind_days_before, remind_minutes_before)
select 'Họp Performance','meeting','weekly',6,'10:00',2,60
where not exists (select 1 from public.recurring_tasks where title = 'Họp Performance');`)
  const url = projectRef
    ? `https://supabase.com/dashboard/project/${projectRef}/sql/new?content=${sql}`
    : `https://supabase.com/dashboard`
  return (
    <div className="flex items-start gap-3 rounded-xl border border-[var(--warning)]/30 bg-[var(--warning-soft)] p-4">
      <span className="mt-0.5 text-amber-500">⚠</span>
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

function RecurringView(props: {
  dbSetupNeeded: boolean
  tasks: RecurringTask[]
  now: Date
  employees: Employee[]
  employeeMap: Map<string, Employee>
  form: RecurringTaskForm
  setForm: React.Dispatch<React.SetStateAction<RecurringTaskForm>>
  saveTask: (event: React.FormEvent) => void
  editTask: (task: RecurringTask) => void
  resetForm: () => void
  toggleTask: (task: RecurringTask) => void
  deleteTask: (task: RecurringTask) => void
  meetingFiles: RecurringMeetingFile[]
  selectedMeetingTaskId: string
  setSelectedMeetingTaskId: (taskId: string) => void
  meetingFileDrafts: Record<string, MeetingFileDraft>
  updateMeetingFileDraft: (taskId: string, patch: Partial<MeetingFileDraft>) => void
  saveMeetingLink: (task: RecurringTask) => void
  uploadMeetingFile: (task: RecurringTask, file?: File) => void
  deleteMeetingFile: (file: RecurringMeetingFile) => void
  uploadingMeetingFileFor: string
}) {
  const [meetingArchiveOpen, setMeetingArchiveOpen] = useState(false)
  const [meetingArchiveQuery, setMeetingArchiveQuery] = useState('')
  const activeTasks = props.tasks.filter((task) => task.is_active)
  const upcoming = [...props.tasks].sort(
    (a, b) => nextOccurrence(a, props.now).getTime() - nextOccurrence(b, props.now).getTime()
  )
  const nearTasks = activeTasks.filter((task) => {
    const occ = nextOccurrence(task, props.now)
    return minutesUntil(occ, props.now) <= task.remind_minutes_before
  })
  const prepTasks = activeTasks.filter((task) => {
    const occ = nextOccurrence(task, props.now)
    const mins = minutesUntil(occ, props.now)
    return (task.frequency === 'weekly' || task.frequency === 'monthly') &&
      mins <= task.remind_days_before * 24 * 60 &&
      mins > task.remind_minutes_before
  })
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

  const patchForm = (patch: Partial<RecurringTaskForm>) => props.setForm((prev) => ({ ...prev, ...patch }))

  return (
    <div className="space-y-4">
      {props.dbSetupNeeded && <DbSetupBanner />}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <MetricCard
          label="Đang theo dõi"
          value={activeTasks.length}
          icon={<Ico d={IC.clock} size={18}/>}
          tone="green"
        />
        <MetricCard
          label="Cần chuẩn bị trước"
          value={prepTasks.length}
          icon={<Ico d={IC.warning} size={18}/>}
          tone="purple"
        />
        <MetricCard
          label="Sắp tới giờ"
          value={nearTasks.length}
          icon={<Ico d={IC.bell} size={18}/>}
          tone="red"
        />
      </div>


      <div className="grid grid-cols-1 gap-4">

        <Card>
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-extrabold">Lịch sắp tới</h3>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                Bây giờ: {formatOccurrence(props.now)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {meetingTasks.length > 0 && (
                <button type="button"
                  onClick={() => setMeetingArchiveOpen(true)}
                  className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-xs font-extrabold"
                >
                  Tìm hồ sơ họp
                </button>
              )}
              <span className="rounded-full bg-[var(--bg-surface)] px-3 py-1 text-xs font-extrabold text-[var(--text-secondary)]">
                {props.tasks.length} việc định kỳ
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
                const recipientNames = recurringRecipientNames(task, props.employeeMap)
                const tone =
                  alert.tone === 'red' ? 'bg-[var(--danger-soft)] text-[var(--danger)] border-[var(--danger)]/20' :
                  alert.tone === 'amber' ? 'bg-[var(--warning-soft)] text-[var(--warning)] border-[var(--warning)]/20' :
                  'bg-[var(--success-soft)] text-[var(--success)] border-[var(--accent)]/30'
                const taskMeetingFiles = task.kind === 'meeting'
                  ? props.meetingFiles.filter((file) => file.recurring_task_id === task.id)
                  : []
                const taskMeetingDraft = task.kind === 'meeting'
                  ? { ...DEFAULT_MEETING_FILE_DRAFT, ...(props.meetingFileDrafts[task.id] || {}) }
                  : DEFAULT_MEETING_FILE_DRAFT

                return (
                  <div
                    key={task.id}
                    className={`rounded-xl border px-3 py-2.5 ${task.is_active ? 'border-[var(--border)] bg-[var(--bg-card)]' : 'border-[var(--border)] bg-[var(--bg-surface)] opacity-70'}`}
                  >
                    <div className="flex flex-col gap-2 xl:flex-row xl:items-start xl:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-extrabold ${tone}`}>{alert.label}</span>
                          <h4 className="min-w-[180px] flex-1 truncate text-sm font-extrabold text-[var(--text-primary)]">{task.title}</h4>
                          <span className="shrink-0 rounded-full bg-[var(--bg-surface)] px-2.5 py-0.5 text-[11px] font-bold text-[var(--text-secondary)]">
                            {recurringKindLabel(task.kind)}
                          </span>
                          <span className="shrink-0 rounded-full bg-[var(--bg-surface)] px-2.5 py-0.5 text-[11px] font-bold text-[var(--text-secondary)]">
                            {recurringFrequencyLabel(task)}
                          </span>
                          {!task.is_active && <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-500">Đang tắt</span>}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs font-bold text-[var(--text-secondary)]">
                          <span>Tiếp: {formatOccurrence(occ)}</span>
                          <span>Còn: {formatTimeLeft(occ, props.now)}</span>
                          <span className="min-w-0 truncate">Nhận: {recipientNames}</span>
                        </div>
                        {task.description && task.kind !== 'meeting' && (
                          <p className="mt-1 max-h-12 overflow-y-auto whitespace-pre-line text-xs leading-5 text-[var(--text-secondary)]">{task.description}</p>
                        )}
                      </div>

                      <div className="flex shrink-0 flex-wrap gap-1.5 xl:justify-end">
                        {task.kind === 'meeting' && (
                          <button type="button"
                            onClick={() => {
                              props.setSelectedMeetingTaskId(task.id)
                              setMeetingArchiveQuery('')
                              setMeetingArchiveOpen(true)
                            }}
                            className="h-8 rounded-lg border border-[var(--border)] bg-[var(--success-soft)] px-2.5 text-xs font-bold text-[var(--success)]"
                          >
                            Hồ sơ
                          </button>
                        )}
                        <button type="button"
                          onClick={() => props.editTask(task)}
                          className="flex h-8 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-2.5 text-xs font-bold"
                          title="Sửa việc định kỳ"
                        >
                          <Ico d={IC.edit} size={13}/>
                          Sửa
                        </button>
                        <button type="button"
                          onClick={() => props.toggleTask(task)}
                          className="h-8 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-2.5 text-xs font-bold"
                        >
                          {task.is_active ? 'Tắt' : 'Bật'}
                        </button>
                        <button type="button"
                          onClick={() => props.deleteTask(task)}
                          className="flex h-8 items-center gap-1.5 rounded-lg bg-[var(--danger-soft)] px-2.5 text-xs font-bold text-[var(--danger)]"
                          title="Xóa việc định kỳ"
                        >
                          <Ico d={IC.trash} size={13}/>
                          Xóa
                        </button>
                      </div>
                    </div>
                    {task.description && task.kind === 'meeting' && (
                      <details className="mt-2 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2">
                        <summary className="cursor-pointer text-xs font-extrabold uppercase text-[var(--text-secondary)] outline-none">
                          Chi tiết họp
                        </summary>
                        <div className="mt-2 grid grid-cols-1 gap-2 xl:grid-cols-[minmax(0,1fr)_330px]">
                          <RecurringMeetingSummary description={task.description} compact />
                          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-2">
                            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <p className="text-xs font-extrabold uppercase text-[var(--text-muted)]">Kho file họp</p>
                                <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{taskMeetingFiles.length} file/link đã lưu</p>
                              </div>
                              <button type="button"
                                onClick={() => {
                                  props.setSelectedMeetingTaskId(task.id)
                                  setMeetingArchiveQuery('')
                                  setMeetingArchiveOpen(true)
                                }}
                                className="rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-bold"
                              >
                                Mở hồ sơ
                              </button>
                            </div>

                            <div className="grid grid-cols-1 gap-2">
                              <input
                                type="date"
                                className="h-9 rounded-lg border border-[var(--border)] px-2.5 text-xs outline-none"
                                value={taskMeetingDraft.meetingDate}
                                onChange={(event) => props.updateMeetingFileDraft(task.id, { meetingDate: event.target.value })}
                                aria-label="Ngày họp"
                              />
                              <input
                                className="h-9 rounded-lg border border-[var(--border)] px-2.5 text-xs outline-none"
                                placeholder="Tên file/link"
                                value={taskMeetingDraft.title}
                                onChange={(event) => props.updateMeetingFileDraft(task.id, { title: event.target.value })}
                              />
                              <input
                                className="h-9 rounded-lg border border-[var(--border)] px-2.5 text-xs outline-none"
                                placeholder="Dán link Google Drive, Notex, Dashboard..."
                                value={taskMeetingDraft.fileUrl}
                                onChange={(event) => props.updateMeetingFileDraft(task.id, { fileUrl: event.target.value })}
                              />
                            </div>

                            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                              <button type="button"
                                onClick={() => props.saveMeetingLink(task)}
                                className="rounded-lg bg-[var(--bg-card)] px-3 py-2 text-xs font-extrabold text-[var(--text-primary)]"
                              >
                                Lưu link
                              </button>
                              <label className="flex cursor-pointer items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-xs font-bold">
                                Tải file lên
                                <input
                                  type="file"
                                  onChange={(event) => props.uploadMeetingFile(task, event.target.files?.[0])}
                                  className="sr-only"
                                />
                              </label>
                            </div>
                            {props.uploadingMeetingFileFor === task.id && (
                              <p className="mt-2 text-xs font-bold text-[var(--accent-hover)]">Đang upload file họp...</p>
                            )}

                            {taskMeetingFiles.length > 0 && (
                              <div className="mt-2 space-y-1.5">
                                {taskMeetingFiles.slice(0, 3).map((file) => (
                                  <a
                                    key={file.id}
                                    href={file.file_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="block min-w-0 rounded-lg bg-[var(--bg-surface)] px-2.5 py-2 text-xs font-bold hover:bg-[var(--bg-surface)]"
                                  >
                                    <span className="block truncate">{file.title || file.file_name}</span>
                                    <span className="mt-0.5 block truncate font-normal text-[var(--text-secondary)]">
                                      {file.meeting_date || file.note || 'Mở file/link'}
                                    </span>
                                  </a>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </details>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </div>

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
                        Lưu link
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
    </div>
  )
}

function RecurringMeetingSummary({ description, compact = false }: { description: string; compact?: boolean }) {
  const parts = parseMeetingDescription(description)
  const sections = [
    { label: 'RECAP cuộc họp trước đó', value: parts.recap },
    { label: 'File cần chuẩn bị', value: parts.prepFiles },
    { label: 'Lịch sử họp', value: parts.meetingHistory },
  ]

  if (compact) {
    return (
      <div className="mt-2 space-y-2">
        {parts.note && <p className="max-h-12 overflow-y-auto whitespace-pre-line text-xs leading-5 text-[var(--text-secondary)]">{parts.note}</p>}
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
          {sections.map((section) => (
            <div key={section.label} className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-2">
              <p className="mb-1 text-[11px] font-extrabold uppercase text-[var(--text-muted)]">{section.label}</p>
              <p className="max-h-24 overflow-y-auto whitespace-pre-line text-xs leading-5 text-[var(--text-secondary)]">
                {section.value || '- Chưa cập nhật.'}
              </p>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="mt-3 space-y-3">
      {parts.note && <p className="whitespace-pre-line text-sm text-[var(--text-secondary)]">{parts.note}</p>}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {sections.map((section) => (
          <div key={section.label} className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-3">
            <p className="mb-2 text-xs font-extrabold uppercase text-[var(--text-muted)]">{section.label}</p>
            <p className="whitespace-pre-line text-sm leading-6 text-[var(--text-secondary)]">
              {section.value || '- Chưa cập nhật.'}
            </p>
          </div>
        ))}
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
  peopleReports: Array<{ employee: Employee; total: number; done: number; doing: number; pending: number; overdue: number; problem: number; rate: number }>
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
  workAssigneeId: string
  setWorkAssigneeId: (value: string) => void
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
            <Input placeholder="Mã dự án" value={props.projectCode} onChange={props.setProjectCode} />
            <Input placeholder="Mô tả dự án" value={props.projectDesc} onChange={props.setProjectDesc} />

            <Select value={props.projectDepartmentId} onChange={props.setProjectDepartmentId}>
              <option value="">Chọn phòng ban chính</option>
              {props.departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </Select>

            <Select value={props.projectOwnerId} onChange={props.setProjectOwnerId}>
              <option value="">Chọn owner</option>
              {props.employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.full_name}
                </option>
              ))}
            </Select>

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
            <Input placeholder="Mô tả" value={props.workDesc} onChange={props.setWorkDesc} />

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

            <Select value={props.workHeadId} onChange={props.setWorkHeadId}>
              <option value="">Chọn Head</option>
              {props.employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.full_name}
                </option>
              ))}
            </Select>

            <Select value={props.workAssigneeId} onChange={props.setWorkAssigneeId}>
              <option value="">Chọn người phụ trách</option>
              {props.employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.full_name}
                </option>
              ))}
            </Select>

            <Select value={props.workPriority} onChange={props.setWorkPriority}>
              <option value="low">Ưu tiên thấp</option>
              <option value="medium">Ưu tiên trung bình</option>
              <option value="high">Ưu tiên cao</option>
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

function TaskDetailDrawer(props: {
  task: Task
  employeeMap: Map<string, Employee>
  departmentMap: Map<string, Department>
  projectMap: Map<string, Project>
  steps: TaskStep[]
  reports: TaskReport[]
  close: () => void
  uploadTaskFile: (task: Task, file?: File) => void
  deleteTaskReport: (report: TaskReport) => void
  uploading: boolean
  getStatusLabel: (status: string) => string
  currentEmployee: Employee | null
  employees: Employee[]
}) {
  const head = props.employeeMap.get(props.task.head_id || '')
  const assignee = props.employeeMap.get(props.task.assignee_id || '')
  const department = props.departmentMap.get(props.task.department_id || '')
  const project = props.projectMap.get(props.task.project_id || '')
  const progress = calculateTaskProgress(props.task, props.steps)

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/20">
      <button type="button" className="flex-1" onClick={props.close} />
      <div className="h-full w-full max-w-[560px] overflow-y-auto bg-[var(--bg-card)] p-4 shadow-2xl sm:p-6">
        <div className="mb-6 flex items-center justify-between">
          <h3 className="text-lg font-extrabold">Chi tiết vận hành</h3>
          <button type="button" onClick={props.close} className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--bg-surface)] text-[var(--text-primary)] hover:bg-[var(--border)]"><Ico d={IC.x} size={16}/>
          </button>
        </div>

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
          <InfoRow label="Người giao việc (Head)" value={head?.full_name || 'Chưa gán'} />
          <InfoRow label="Người phụ trách" value={assignee?.full_name || 'Chưa gán'} />
          <InfoRow label="Deadline" value={props.task.due_date || 'Chưa có'} />

          {props.currentEmployee && (
            <div className="rounded-2xl bg-[var(--bg-surface)] p-4">
              <p className="mb-3 font-extrabold">Duyệt deadline</p>
              <DeadlineApproval
                taskId={props.task.id}
                taskLevel={props.task.task_level}
                currentUser={{ id: props.currentEmployee.id, role: props.currentEmployee.role }}
                employees={props.employees}
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

          <div className="rounded-2xl bg-[var(--bg-surface)] p-4">
            <p className="mb-3 font-extrabold">File báo cáo cấp đầu việc</p>

            <input
              type="file"
              onChange={(event) => props.uploadTaskFile(props.task, event.target.files?.[0])}
              className="block w-full rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-3 text-sm"
            />

            {props.uploading && (
              <p className="mt-2 text-sm font-bold text-[var(--accent-hover)]">Đang upload...</p>
            )}

            <div className="mt-4 space-y-2">
              {props.reports.length === 0 ? (
                <p className="text-sm text-[var(--text-secondary)]">Chưa có file báo cáo.</p>
              ) : (
                props.reports.map((report) => (
                  <div key={report.id} className="flex items-center justify-between gap-3 rounded-xl bg-[var(--bg-card)] p-3">
                    <p className="truncate text-sm font-bold">{report.file_name}</p>
                    <div className="flex shrink-0 gap-2">
                      <a
                        href={report.file_url}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg bg-[var(--bg-card)] px-3 py-2 text-xs font-bold text-[var(--text-primary)]"
                      >
                        Mở
                      </a>
                      <button type="button"
                        onClick={() => props.deleteTaskReport(report)}
                        className="rounded-lg bg-[var(--danger-soft)] px-3 py-2 text-xs font-bold text-[var(--danger)]"
                      >
                        Xóa file
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl bg-[var(--warning-soft)] p-4 text-sm text-[var(--warning)]">
            <b>Gợi ý COO cần hỏi:</b> {buildFollowUpQuestion(props.task, head?.full_name)}
          </div>
        </div>
      </div>
    </div>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-[0_1px_3px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.08)]">{children}</div>
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
    purple: 'before:bg-[#594e3d]',
    red:    'before:bg-[var(--danger)]',
  }

  return (
    <div className={`card-hover relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-[0_1px_3px_rgba(38,34,25,0.05),0_8px_24px_-12px_rgba(38,34,25,0.08)]
      before:absolute before:left-0 before:top-0 before:h-full before:w-1 ${accentMap[props.tone]}`}>
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-bold text-[var(--text-secondary)]">{props.label}</p>
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${toneMap[props.tone]}`}>{props.icon}</span>
      </div>
      <p className="font-display mt-3 text-4xl tabular-nums text-[var(--text-primary)]">{props.value}</p>
    </div>
  )
}

function ProgressBar({ value, showLabel }: { value: number; showLabel?: boolean }) {
  const clamped = Math.max(0, Math.min(100, value))
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

function StatusDistributionRow(props: {
  label: string
  count: number
  total: number
  color: string
}) {
  const percent = props.total === 0 ? 0 : Math.round((props.count / props.total) * 100)

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3 text-sm">
        <p className="font-bold text-[var(--text-secondary)]">{props.label}</p>
        <p className="font-extrabold">
          {props.count} <span className="text-[var(--text-secondary)]">({percent}%)</span>
        </p>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-[var(--border)]">
        <div className={`h-full rounded-full ${props.color}`} style={{ width: `${percent}%` }} />
      </div>
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
        : 'bg-[var(--success-soft)] text-[var(--success)]'

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

function StepApprovalBadge({ status }: { status: string }) {
  if (status === 'not_required') {
    return <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-extrabold text-slate-500">Không yêu cầu</span>
  }

  if (status === 'approved') {
    return <span className="rounded-full bg-[var(--success-soft)] px-3 py-1 text-xs font-extrabold text-[var(--success)]">Đã duyệt</span>
  }

  if (status === 'pending') {
    return <span className="rounded-full bg-[var(--bg-surface)] px-3 py-1 text-xs font-extrabold text-[var(--text-secondary)]">Chờ duyệt</span>
  }

  if (status === 'revision') {
    return <span className="rounded-full bg-[var(--danger-soft)] px-3 py-1 text-xs font-extrabold text-[var(--danger)]">Cần làm lại</span>
  }

  return <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-extrabold text-slate-600">Chưa gửi</span>
}

function ApprovalStatusPill({ label, status }: { label: string; status: string }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl bg-[var(--bg-card)] px-3 py-2">
      <span className="text-xs font-extrabold text-[var(--text-secondary)]">{label}</span>
      <StepApprovalBadge status={status} />
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
    <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--bg-surface)] p-8 text-center">
      <div className="mb-3 text-3xl">🗂️</div>
      <p className="font-extrabold">{title}</p>
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

function calculateTaskProgress(task: Task, taskSteps: TaskStep[]) {
  if (taskSteps.length > 0) {
    const approved = taskSteps.filter((step) => step.approval_status === 'approved').length
    return Math.round((approved / taskSteps.length) * 100)
  }

  return task.progress_percent || 0
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

  return Math.round(total / workstreams.length)
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

  const overdueTasks = projectTasks.filter((task) => isTaskOverdue(task)).length
  const pendingTasks = projectTasks.filter((task) => task.status === 'pending').length
  const problemTasks = projectTasks.filter((task) => task.issue_status === 'problem').length
  const slowTasks = projectTasks.filter((task) => isTaskSlow(task, stepsByTask.get(task.id) || [])).length
  const pendingSteps = getPendingApprovalSteps(projectSteps).length
  const revisionSteps = getRevisionSteps(projectSteps).length
  const supportRequests = projectSteps.filter((step) => Boolean(step.support_request?.trim())).length
  const missingReports = projectSteps.filter((step) => !step.report_file_url && !step.report_link).length
  const overdueSteps = projectSteps.filter((step) => isStepOverdue(step)).length

  const problemWarnings = overdueTasks + pendingTasks + problemTasks + revisionSteps + overdueSteps
  const watchWarnings = slowTasks + pendingSteps + supportRequests + missingReports
  const level = problemWarnings > 0 ? 'problem' : watchWarnings > 0 ? 'watch' : 'normal'
  const label =
    level === 'problem' ? 'Có vấn đề' : level === 'watch' ? 'Cần theo dõi' : 'Đang ổn'

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
    totalWarnings: problemWarnings + watchWarnings,
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

function getMissingReportSteps(steps: TaskStep[]) {
  return steps.filter((step) => {
    if (step.approval_status === 'approved') return false
    return !step.report_file_url && !step.report_link
  })
}

function getDefaultDepartmentApprover(
  departmentId: string | null,
  departments: Department[],
  employees: Employee[]
) {
  const department = departments.find((item) => item.id === departmentId)
  const text = normalizeSearchText(`${department?.name || ''} ${department?.code || ''}`)

  if (matchesAny(text, ['marketing', 'ads', 'livestream', 'brand'])) {
    return findEmployeeId(employees, ['vũ', 'vu']) || employees[0]?.id || ''
  }

  if (matchesAny(text, ['content', 'nội dung', 'noi dung'])) {
    return findEmployeeId(employees, ['nhung', 'nhung']) || findEmployeeId(employees, ['vũ', 'vu']) || employees[0]?.id || ''
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
  return findEmployeeId(employees, ['quang']) || findEmployeeIdByPosition(employees, ['coo', 'ops', 'admin']) || employees[0]?.id || ''
}

function getCeoApprover(employees: Employee[]) {
  return (
    findEmployeeId(employees, ['vy']) ||
    findEmployeeId(employees, ['phúc', 'phuc']) ||
    findEmployeeIdByPosition(employees, ['ceo']) ||
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

function matchesAny(text: string, values: string[]) {
  return values.some((value) => text.includes(normalizeSearchText(value)))
}

function buildApprovalRoute(step: TaskStep) {
  const route = ['Trưởng bộ phận']
  if (step.requires_coo_approval) route.push('COO')
  if (step.requires_ceo_approval) route.push('CEO')
  return route.join(' → ')
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
        dueDate: '',
        priority: 'medium',
      }
      return
    }

    if (responsibilityMatch && currentRow) {
      const responsibility = responsibilityMatch[1].trim()
      const employeeId = guessEmployeeId(responsibility, employees)
      currentRow = {
        ...currentRow,
        responsibility,
        departmentId: currentRow.departmentId || guessDepartmentId(responsibility, departments),
        headId: currentRow.headId || employeeId,
        assigneeId: employeeId || currentRow.assigneeId,
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

function guessEmployeeId(text: string, employees: Employee[]) {
  const normalizedText = normalizeSearchText(text)
  const match = employees.find((employee) => {
    return (
      normalizedText.includes(normalizeSearchText(employee.full_name)) ||
      Boolean(employee.position && normalizedText.includes(normalizeSearchText(employee.position)))
    )
  })

  return match?.id || ''
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
  const attentionProjects = projectCards.filter((project) => project.health.level !== 'normal')

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

function buildPeopleReport(
  peopleReports: Array<{ employee: Employee; total: number; done: number; doing: number; pending: number; overdue: number; problem: number; rate: number }>
) {
  if (peopleReports.length === 0) {
    return 'BÁO CÁO THEO NHÂN SỰ\n\n- Chưa có nhân sự.'
  }

  return `BÁO CÁO THEO NHÂN SỰ

${peopleReports
  .map((person, index) => {
    return `${index + 1}. ${person.employee.full_name}
- Tổng việc: ${person.total}
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

// ─── Role helpers ────────────────────────────────────────────────────────────

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
          s.approver_id === emp.id ||
          s.department_approver_id === emp.id ||
          s.coo_approver_id === emp.id ||
          s.ceo_approver_id === emp.id
      )
      .map((s) => s.task_id)
  )

  const isHead = role === 'department_head' || Boolean(emp.is_department_head)

  return tasks.filter((task) => {
    // Việc chưa được cấp trên duyệt phân công → người làm chưa thấy
    if (task.status === 'pending_approval' && !isHead && task.head_id !== emp.id) return false
    if (task.assignee_id === emp.id || task.head_id === emp.id) return true
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

// ─── AdminUsersView ───────────────────────────────────────────────────────────

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
  const [editPosition, setEditPosition] = useState('')
  const [editDept, setEditDept] = useState('')
  const [editRole, setEditRole] = useState('')
  const [editSaving, setEditSaving] = useState(false)

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
    setEditPosition(emp.position || '')
    setEditDept(emp.department_id || '')
    setEditRole(emp.role || 'employee')
  }

  async function handleEditSave(e: React.FormEvent) {
    e.preventDefault()
    if (!editEmp) return
    setEditSaving(true)
    await supabase.from('employees').update({
      full_name: editName.trim(),
      position: editPosition.trim() || null,
      department_id: editDept || null,
      role: editRole,
    }).eq('id', editEmp.id)
    setEditSaving(false)
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[var(--text-secondary)]">{employees.length} nhân sự</p>
        {props.canCreateUsers ? (
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-extrabold text-[var(--text-primary)]"
          >
            <Ico d={IC.plus} size={15} />
            Tạo tài khoản
          </button>
        ) : (
          <span className="rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-bold text-[var(--text-muted)]">
            Không có quyền tạo tài khoản
          </span>
        )}
      </div>

      {showCreate && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6">
          <h3 className="mb-4 text-base font-extrabold">Tạo tài khoản nhân viên</h3>
          <form onSubmit={handleCreate} className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-bold text-[var(--text-secondary)]">Họ và tên *</label>
              <input required value={createName} onChange={(e) => setCreateName(e.target.value)}
                className="h-11 w-full rounded-xl border border-[var(--border)] px-3 text-sm outline-none focus:border-[var(--accent-hover)]" placeholder="Nguyễn Văn A" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-[var(--text-secondary)]">Tài khoản đăng nhập *</label>
              <input required type="text" value={createEmail} onChange={(e) => setCreateEmail(e.target.value)}
                className="h-11 w-full rounded-xl border border-[var(--border)] px-3 text-sm outline-none focus:border-[var(--accent-hover)]" placeholder="quang / nhung / admin" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-[var(--text-secondary)]">Mật khẩu *</label>
              <input required type="password" minLength={6} value={createPassword} onChange={(e) => setCreatePassword(e.target.value)}
                className="h-11 w-full rounded-xl border border-[var(--border)] px-3 text-sm outline-none focus:border-[var(--accent-hover)]" placeholder="Tối thiểu 6 ký tự" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-[var(--text-secondary)]">Chức vụ</label>
              <input value={createPosition} onChange={(e) => setCreatePosition(e.target.value)}
                className="h-11 w-full rounded-xl border border-[var(--border)] px-3 text-sm outline-none focus:border-[var(--accent-hover)]" placeholder="Nhân viên Marketing..." />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-[var(--text-secondary)]">Role</label>
              <select value={createRole} onChange={(e) => setCreateRole(e.target.value)}
                className="h-11 w-full rounded-xl border border-[var(--border)] px-3 text-sm outline-none focus:border-[var(--accent-hover)]">
                {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-[var(--text-secondary)]">Phòng ban</label>
              <select value={createDept} onChange={(e) => setCreateDept(e.target.value)}
                className="h-11 w-full rounded-xl border border-[var(--border)] px-3 text-sm outline-none focus:border-[var(--accent-hover)]">
                <option value="">Chọn phòng ban</option>
                {props.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            {createError && (
              <div className="col-span-2 rounded-xl bg-[var(--danger-soft)] px-4 py-3 text-sm font-bold text-[var(--danger)]">{createError}</div>
            )}
            <div className="col-span-2 flex gap-3">
              <button type="submit" disabled={creating}
                className="rounded-xl bg-[var(--bg-card)] px-5 py-2.5 text-sm font-extrabold text-[var(--text-primary)] disabled:opacity-60">
                {creating ? 'Đang tạo...' : 'Tạo tài khoản'}
              </button>
              <button type="button" onClick={() => { setShowCreate(false); setCreateError('') }}
                className="rounded-xl border border-[var(--border)] px-5 py-2.5 text-sm font-bold text-[var(--text-secondary)]">
                Hủy
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="text-sm text-[var(--text-secondary)]">Đang tải...</div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--bg-card)]">
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--border)] bg-[var(--bg-surface)]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-extrabold text-[var(--text-secondary)]">Họ tên</th>
                <th className="px-4 py-3 text-left text-xs font-extrabold text-[var(--text-secondary)]">Tài khoản</th>
                <th className="px-4 py-3 text-left text-xs font-extrabold text-[var(--text-secondary)]">Chức vụ</th>
                <th className="px-4 py-3 text-left text-xs font-extrabold text-[var(--text-secondary)]">Phòng ban</th>
                <th className="px-4 py-3 text-left text-xs font-extrabold text-[var(--text-secondary)]">Role</th>
                <th className="px-4 py-3 text-left text-xs font-extrabold text-[var(--text-secondary)]">Trạng thái</th>
                <th className="px-4 py-3 text-left text-xs font-extrabold text-[var(--text-secondary)]">Hành động</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F5F9]">
              {employees.map((emp) => (
                <tr key={emp.id} className="hover:bg-[var(--bg-surface)]">
                  <td className="px-4 py-3 font-bold">{emp.full_name}</td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">{displayLoginIdentifier(emp.email)}</td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">{emp.position || '—'}</td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">{deptMap.get(emp.department_id || '') || '—'}</td>
                  <td className="px-4 py-3">
                    <select
                      value={emp.role || 'employee'}
                      disabled={saving === emp.id}
                      onChange={(e) => updateEmployee(emp.id, { role: e.target.value })}
                      className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs font-bold outline-none"
                    >
                      {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => toggleStatus(emp)}
                      className={`rounded-full px-3 py-1 text-xs font-bold ${
                        emp.status === 'active'
                          ? 'bg-emerald-100 text-[var(--accent-hover)]'
                          : 'bg-[var(--danger-soft)] text-[var(--danger)]'
                      }`}
                    >
                      {emp.status === 'active' ? 'Hoạt động' : 'Đã khóa'}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button type="button" onClick={() => openEdit(emp)}
                        className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-base)]">
                        Sửa
                      </button>
                      {emp.email && <ResetPasswordButton authUserId={emp.email} />}
                      <button type="button" disabled={deletingId === emp.id} onClick={() => handleDelete(emp)}
                        className="rounded-lg border border-[var(--danger)]/30 px-3 py-1.5 text-xs font-bold text-[var(--danger)] hover:bg-[var(--danger-soft)] disabled:opacity-40">
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
          <div className="w-full max-w-md rounded-2xl bg-[var(--bg-card)] p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-5 text-base font-extrabold text-[var(--text-primary)]">Sửa thông tin — {editEmp.full_name}</h3>
            <form onSubmit={handleEditSave} className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-bold text-[var(--text-secondary)]">Họ và tên *</label>
                <input required value={editName} onChange={(e) => setEditName(e.target.value)}
                  className="h-11 w-full rounded-xl border border-[var(--border)] px-3 text-sm outline-none focus:border-[var(--accent-hover)]" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-[var(--text-secondary)]">Chức vụ</label>
                <input value={editPosition} onChange={(e) => setEditPosition(e.target.value)}
                  className="h-11 w-full rounded-xl border border-[var(--border)] px-3 text-sm outline-none focus:border-[var(--accent-hover)]" placeholder="Nhân viên Marketing..." />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-[var(--text-secondary)]">Phòng ban</label>
                <select value={editDept} onChange={(e) => setEditDept(e.target.value)}
                  className="h-11 w-full rounded-xl border border-[var(--border)] px-3 text-sm outline-none focus:border-[var(--accent-hover)]">
                  <option value="">Chọn phòng ban</option>
                  {props.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-[var(--text-secondary)]">Role</label>
                <select value={editRole} onChange={(e) => setEditRole(e.target.value)}
                  className="h-11 w-full rounded-xl border border-[var(--border)] px-3 text-sm outline-none focus:border-[var(--accent-hover)]">
                  {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={editSaving}
                  className="rounded-xl bg-[var(--bg-card)] px-5 py-2.5 text-sm font-extrabold text-[var(--text-primary)] disabled:opacity-60">
                  {editSaving ? 'Đang lưu...' : 'Lưu'}
                </button>
                <button type="button" onClick={() => setEditEmp(null)}
                  className="rounded-xl border border-[var(--border)] px-5 py-2.5 text-sm font-bold text-[var(--text-secondary)]">
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
        className="rounded-full bg-[var(--warning-soft)] px-2 py-0.5 text-[10px] font-bold text-[var(--warning)] hover:bg-amber-200">
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
          className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
          Hủy
        </button>
      </div>
    </form>
  )
}
