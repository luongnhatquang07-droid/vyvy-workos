// ============================================================
// VYVY WORKOS V2 — COMMAND CENTER TYPES
// ============================================================

export type Priority = 'critical' | 'high' | 'medium' | 'low'
export type TaskStatus = 'overdue' | 'due_today' | 'due_soon' | 'in_progress' | 'waiting' | 'done'
export type MeetingStatus = 'no_minutes' | 'minutes_no_tasks' | 'draft_pending' | 'follow_up_needed' | 'done'
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'overdue'
export type ReminderResponse = 'no_response' | 'acknowledged' | 'in_progress' | 'done'
export type CEOSeverity = 'info' | 'warning' | 'critical'

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
  status: 'active' | 'at_risk' | 'delayed' | 'completed'
}

export interface Meeting {
  id: string
  title: string
  date: string        // ISO date YYYY-MM-DD
  time: string        // HH:MM
  status: MeetingStatus
  attendees: string[] // person ids
  taskDraftCount: number
  followUpOwner?: string // person id
  minutesUrl?: string
  projectId?: string
  /** future route: /meetings/:id */
  futureRoute: string
}

export interface MeetingTaskDraft {
  id: string
  meetingId: string
  title: string
  assigneeId?: string
  projectId?: string
  suggestedDeadline?: string
  imported: boolean
  /** future route: /task-inbox/:id */
  futureRoute: string
}

export interface Task {
  id: string
  title: string
  ownerId: string
  projectId?: string
  dueDate: string     // ISO date
  status: TaskStatus
  priority: Priority
  deliverableId?: string
  pendingApproval?: boolean
  waitingFor?: string
  /** future route: /follow-ups/:id */
  futureRoute: string
}

export interface Deliverable {
  id: string
  title: string
  taskId?: string
  ownerId: string
  projectId?: string
  dueDate: string
  status: 'missing' | 'draft' | 'submitted' | 'accepted'
  type: 'report' | 'file' | 'presentation' | 'contract' | 'data'
  /** future route: /deliverables/:id */
  futureRoute: string
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
  /** future route: /follow-ups/:id */
  futureRoute: string
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
  /** future route: /approvals/:id */
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
  escalatedBy: string // person id
  /** future route: /ceo-reports */
  futureRoute: string
}

// ---- Derived/view types ----

export type PriorityItemType =
  | 'task_overdue'
  | 'task_due_today'
  | 'meeting_no_tasks'
  | 'reminder_pending'
  | 'approval_urgent'
  | 'ceo_escalation'
  | 'deliverable_missing'

export interface PriorityItem {
  id: string
  type: PriorityItemType
  title: string
  subtitle: string
  projectName?: string
  personName?: string
  dueDate?: string
  priority: Priority
  status: string
  statusVariant: 'danger' | 'warning' | 'waiting' | 'default'
  nextAction: string
  sourceModule: string
  sourceId: string
  futureRoute: string
}

export type FilterView = 'all' | 'today' | 'next_24h' | 'overdue' | 'waiting' | 'pending_approval' | 'ceo_report'

export interface KPIData {
  meetingsToday: number
  unimportedDrafts: number
  pendingDeliverable: number   // unique people owing
  overdueItems: number
  pendingApprovals: number
  ceoItems: number
}

export interface COOSummary {
  urgentItems: string[]
  risks: string[]
  watchItems: string[]
  proposedActions: string[]
}

export interface CommandCenterData {
  people: Person[]
  projects: Project[]
  meetings: Meeting[]
  taskDrafts: MeetingTaskDraft[]
  tasks: Task[]
  deliverables: Deliverable[]
  reminders: Reminder[]
  approvals: Approval[]
  ceoRequests: CEODecisionRequest[]
  // computed
  kpi: KPIData
  priorityItems: PriorityItem[]
  cooSummary: COOSummary
}

// ---- Drawer types ----

export type DrawerItemType = 'reminder' | 'meeting' | 'approval' | 'ceo' | 'task' | 'deliverable'

export interface DrawerState {
  open: boolean
  type: DrawerItemType | null
  id: string | null
}
