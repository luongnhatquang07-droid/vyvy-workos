// ============================================================
// VYVY WORKOS V2 — COMMAND CENTER TYPES (Ivory v2.0)
// ============================================================

// ---- Enums ----
import type { TaskStatus } from '@/lib/tasks/taskStatusService'
export type { TaskStatus } from '@/lib/tasks/taskStatusService'
export type DeliverableStatus = 'REQUIRED'|'NOT_SUBMITTED'|'SUBMITTED'|'MISSING_INFORMATION'|'REVISION_REQUIRED'|'APPROVED'
export type ProjectHealth = 'NO_DATA'|'ON_TRACK'|'WARNING'|'AT_RISK'|'CRITICAL'
export type ReminderResponse = 'NOT_REMINDED'|'SENT'|'SEEN'|'WAITING_RESPONSE'|'PROMISED'|'EXTENSION_REQUESTED'|'FILE_SUBMITTED'|'NO_RESPONSE'|'ESCALATED'|'CLOSED'
export type EscalationStep = 'REMIND_1'|'REMIND_2'|'CALL'|'MANAGER'|'CEO'
export type ActionKind = 'MEETING'|'IMPORT'|'APPROVE'|'REMIND'|'COLLECT_FILE'|'COLLECT_REPORT'
export type Urgency = 'CRITICAL'|'HIGH'|'MEDIUM'|'LOW'
export type CEOSeverity = 'critical'|'warning'|'info'
export type MeetingStatus = 'no_minutes'|'minutes_no_tasks'|'draft_pending'|'follow_up_needed'|'done'
export type ApprovalStatus = 'pending'|'approved'|'rejected'|'overdue'

// ---- Core entities ----

export interface Person {
  id: string
  name: string
  role: string
  department: string
  avatarInitials: string
}

export interface Project {
  id: string
  name: string
  code: string
  health: ProjectHealth
}

export interface Meeting {
  id: string
  title: string
  date: string        // YYYY-MM-DD
  time: string        // HH:MM
  status: MeetingStatus
  attendees: string[] // person ids
  taskDraftCount: number
  decisionCount: number
  importedTaskCount: number
  projectId?: string
  futureRoute: string
}

export interface Task {
  id: string
  title: string
  ownerId: string
  projectId?: string
  dueDate: string
  status: TaskStatus
  urgency: Urgency
  deliverableId?: string
  waitingFor?: string
  kind: ActionKind
  futureRoute: string
}

export interface Deliverable {
  id: string
  title: string
  taskId?: string
  ownerId: string
  projectId?: string
  dueDate: string
  status: DeliverableStatus
  type: 'report'|'file'|'presentation'|'contract'|'data'
  futureRoute: string
}

export interface DeliverableCheck {
  taskId: string
  taskTitle: string
  ownerName: string
  items: { label: string; present: boolean; required: boolean }[]
  gateOpen: boolean
}

export interface Reminder {
  id: string
  personId: string
  taskId?: string
  deliverableId?: string
  content: string
  dueDate: string
  reminderCount: number
  lastReminderDate: string
  response: ReminderResponse
  responseNote?: string
  futureRoute: string
}

export interface ChaseItem {
  personId: string
  owedItem: string
  deliverableType?: string
  deadline?: string
  remindCount: number
  response: ReminderResponse
  escalationStep: EscalationStep
  suggestEscalate: boolean
}

export interface Commitment {
  personId: string
  promisedWhat: string
  promisedDate: string
  delivered: boolean
  sourceMeetingId?: string
  sourceMeetingTitle?: string
}

export interface Approval {
  id: string
  title: string
  description: string
  requesterId: string
  approverId: string
  projectId?: string
  submittedDate: string
  deadline: string
  status: ApprovalStatus
  daysWaiting: number
  futureRoute: string
}

export interface CEODecisionRequest {
  id: string
  title: string
  projectId?: string
  severity: CEOSeverity
  issue: string
  impact: string
  consequence: string
  proposedAction: string
  createdDate: string
  escalatedBy: string
  futureRoute: string
}

export interface ActivityLogEntry {
  id: string
  time: string          // e.g. "08:40" or "Hôm qua 17:00"
  text: string          // HTML-like rich text as plain text with bold markers
  personName?: string
  dotColor: 'green'|'blue'|'violet'|'amber'|'gray'|'red'
}

// ---- Priority list ----

export interface PriorityItem {
  id: string
  title: string
  kind: ActionKind
  projectName?: string
  personName?: string
  deadline?: string
  urgency: Urgency
  status: TaskStatus
  statusLabel: string
  statusVariant: 'danger'|'warning'|'waiting'|'default'
  nextAction: string
  sourceId: string
  futureRoute: string
}

// ---- KPI ----

export interface KPIData {
  meetingsToday: number
  unimportedDrafts: number
  pendingDeliverable: number
  overdueItems: number
  pendingApprovals: number
  ceoItems: number
}

// ---- COO Summary ----

export interface COOSummary {
  urgentItems: string[]
  risks: string[]
  watchItems: string[]
  proposedActions: string[]
}

// ---- Summary Banner (Zone B) ----

export interface SummaryBannerData {
  paragraph: string
  chips: { label: string; colorClass: 'default'|'danger'|'warning'|'waiting'|'lime'; route: string }[]
}

// ---- Filter ----

export type FilterView = 'all'|'today'|'next_24h'|'overdue'|'waiting'|'pending_approval'|'ceo_report'

// ---- Full data ----

export interface CommandCenterData {
  people: Person[]
  projects: Project[]
  meetings: Meeting[]
  tasks: Task[]
  deliverables: Deliverable[]
  deliverableChecks: DeliverableCheck[]
  reminders: Reminder[]
  chaseItems: ChaseItem[]
  commitments: Commitment[]
  approvals: Approval[]
  ceoRequests: CEODecisionRequest[]
  activityLog: ActivityLogEntry[]
  // computed
  kpi: KPIData
  priorityItems: PriorityItem[]
  cooSummary: COOSummary
  summaryBanner: SummaryBannerData
}

// ---- Drawer ----

export type DrawerItemType = 'reminder'|'meeting'|'approval'|'ceo'|'task'|'deliverable'

export interface DrawerState {
  open: boolean
  type: DrawerItemType | null
  id: string | null
}
