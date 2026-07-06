// DB row types - handwritten from the current Supabase schema.
// Replace with generated types once CLI access is available.

export interface ProfileRow {
  id: string
  workspace_id: string | null
  auth_user_id: string | null
  display_name: string
  avatar_url: string | null
  status: string
  created_at: string
  updated_at: string
}

export interface RoleRow {
  id: string
  code: string
  name: string
  description: string | null
}

export interface WorkspaceMembershipRow {
  id: string
  workspace_id: string
  profile_id: string
  role_id: string
  is_active: boolean
  joined_at: string
}

export interface PersonRow {
  id: string
  workspace_id: string
  profile_id: string | null
  department_id: string | null
  full_name: string
  job_title: string | null
  email: string | null
  facebook_url: string | null
  messenger_url: string | null
  status: string
  created_at: string
  deleted_at: string | null
  department?: { name: string } | null
}

export interface ProjectRow {
  id: string
  workspace_id: string
  name: string
  code: string | null
  description: string | null
  owner_id: string | null
  status: string
  health_status: 'NO_DATA' | 'ON_TRACK' | 'WARNING' | 'AT_RISK' | 'CRITICAL'
  start_date: string | null
  due_date: string | null
  deleted_at: string | null
}

export interface TaskRow {
  id: string
  workspace_id: string
  project_id: string | null
  workstream_id: string | null
  title: string
  owner_id: string | null
  status:
    | 'NOT_STARTED'
    | 'IN_PROGRESS'
    | 'WAITING'
    | 'BLOCKED'
    | 'PENDING_APPROVAL'
    | 'REVISION_REQUIRED'
    | 'COMPLETED'
    | 'CANCELLED'
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  due_date: string | null
  waiting_for_person_id: string | null
  waiting_for_content: string | null
  expected_result: string | null
  deleted_at: string | null
}

export interface MeetingRow {
  id: string
  workspace_id: string
  title: string
  start_at: string | null
  status: string | null
  project_id: string | null
}

export interface MeetingTaskDraftRow {
  id: string
  meeting_id: string
  import_status: string | null
}

export interface DeliverableRow {
  id: string
  workspace_id: string
  name: string
  task_id: string | null
  project_id: string | null
  submitter_id: string | null
  due_date: string | null
  status: 'REQUIRED' | 'NOT_SUBMITTED' | 'SUBMITTED' | 'MISSING_INFORMATION' | 'REVISION_REQUIRED' | 'APPROVED'
  type: string | null
}

export interface ApprovalRow {
  id: string
  workspace_id: string
  task_id: string | null
  step_id: string | null
  deliverable_id: string | null
  project_id: string | null
  requested_by: string | null
  approver_id: string | null
  status: 'NOT_REQUESTED' | 'PENDING' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'REVISION_REQUESTED' | 'CANCELLED' | 'UPLOADED_BY_MISTAKE' | 'SUPERSEDED'
  requested_at: string | null
  due_at: string | null
}

export interface ReminderRow {
  id: string
  workspace_id: string
  person_id: string | null
  task_id: string | null
  deliverable_id: string | null
  reminder_level: number
  status: string | null
  response_status:
    | 'NOT_REMINDERED'
    | 'REMINDERED'
    | 'VIEWED'
    | 'WAITING_RESPONSE'
    | 'PROMISED_DELIVERY'
    | 'DEADLINE_EXTENSION_REQUESTED'
    | 'FILE_SUBMITTED'
    | 'NO_RESPONSE'
    | 'ESCALATED'
    | 'CLOSED'
  next_follow_up_at: string | null
  last_reminded_at: string | null
}

export interface CeoDecisionRequestRow {
  id: string
  workspace_id: string
  title: string
  project_id: string | null
  context: string | null
  delay_impact: string | null
  recommendation: string | null
  decision_due_at: string | null
  status: string | null
  created_at: string
}

export interface ActivityLogRow {
  id: string
  workspace_id: string
  created_at: string
  action: string | null
  actor_id: string | null
  entity_type: string | null
  entity_id: string | null
  metadata: Record<string, unknown> | null
}

export interface CommandCenterPersonRow {
  id: string
  full_name: string
  job_title: string | null
  email: string | null
  phone: string | null
  messenger_url: string | null
  department_id: string | null
  profile_id: string | null
  status: string
  deleted_at: string | null
  department?: { name: string }[] | { name: string } | null
}

export interface CommandCenterProjectRow {
  id: string
  name: string
  code: string | null
  description: string | null
  owner_id: string | null
  status: string
  health_status: 'NO_DATA' | 'ON_TRACK' | 'WARNING' | 'AT_RISK' | 'CRITICAL'
  start_date: string | null
  due_date: string | null
  deleted_at: string | null
}

export interface CommandCenterTaskRow {
  id: string
  title: string
  description: string | null
  owner_id: string | null
  project_id: string | null
  workstream_id: string | null
  start_date: string | null
  due_date: string | null
  status:
    | 'NOT_STARTED'
    | 'IN_PROGRESS'
    | 'WAITING'
    | 'BLOCKED'
    | 'PENDING_APPROVAL'
    | 'REVISION_REQUIRED'
    | 'COMPLETED'
    | 'CANCELLED'
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  waiting_for_person_id: string | null
  waiting_for_content: string | null
  expected_result: string | null
  deleted_at: string | null
  assignee_ids?: string[] | null
  supporter_ids?: string[] | null
}

export interface CommandCenterWorkstreamRow {
  id: string
  project_id: string
  name: string
  description: string | null
  owner_id: string | null
  status: string
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  start_date: string | null
  due_date: string | null
  sort_order: number | null
  deleted_at: string | null
}

export interface CommandCenterTaskStepRow {
  id: string
  task_id: string
  title: string
  description: string | null
  owner_id: string | null
  status:
    | 'NOT_STARTED'
    | 'IN_PROGRESS'
    | 'WAITING'
    | 'BLOCKED'
    | 'PENDING_APPROVAL'
    | 'REVISION_REQUIRED'
    | 'COMPLETED'
    | 'CANCELLED'
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  start_date: string | null
  due_date: string | null
  is_required: boolean
  sort_order: number | null
  deleted_at: string | null
}

export interface CommandCenterMeetingRow {
  id: string
  title: string
  start_at: string | null
  status: string | null
  project_id: string | null
}

export interface CommandCenterMeetingTaskDraftRow {
  id: string
  meeting_id: string
  import_status: string | null
}

export interface CommandCenterDeliverableRow {
  id: string
  name: string
  description: string | null
  task_id: string | null
  project_id: string | null
  step_id: string | null
  required_format: string | null
  submitter_id: string | null
  reviewer_id: string | null
  due_date: string | null
  status: 'REQUIRED' | 'NOT_SUBMITTED' | 'SUBMITTED' | 'MISSING_INFORMATION' | 'REVISION_REQUIRED' | 'APPROVED'
  type: string | null
  is_required: boolean
  approved_version_id: string | null
  created_at: string | null
  updated_at: string | null
}

export interface CommandCenterDeliverableVersionRow {
  id: string
  deliverable_id: string
  version_number: number
  attachment_id: string | null
  external_url: string | null
  submitted_by: string | null
  submitted_at: string | null
  change_note: string | null
  review_status: 'NOT_REQUESTED' | 'PENDING' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'REVISION_REQUESTED' | 'CANCELLED' | 'UPLOADED_BY_MISTAKE' | 'SUPERSEDED'
  review_comment: string | null
  reviewed_by: string | null
  reviewed_at: string | null
}

export interface CommandCenterAttachmentRow {
  id: string
  workspace_id: string
  storage_mode?: string | null
  storage_path: string
  file_name: string | null
  mime_type: string | null
  size_bytes: number | null
  uploaded_by: string | null
  uploaded_at: string | null
  deleted_at: string | null
}

export interface CommandCenterApprovalRow {
  id: string
  task_id: string | null
  step_id: string | null
  deliverable_id: string | null
  project_id: string | null
  requested_by: string | null
  approver_id: string | null
  status: 'NOT_REQUESTED' | 'PENDING' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'REVISION_REQUESTED' | 'CANCELLED' | 'UPLOADED_BY_MISTAKE' | 'SUPERSEDED'
  requested_at: string | null
  due_at: string | null
}

export interface CommandCenterReminderRow {
  id: string
  person_id: string | null
  task_id: string | null
  deliverable_id: string | null
  reminder_level: number
  status: string | null
  response_status:
    | 'NOT_REMINDERED'
    | 'REMINDERED'
    | 'VIEWED'
    | 'WAITING_RESPONSE'
    | 'PROMISED_DELIVERY'
    | 'DEADLINE_EXTENSION_REQUESTED'
    | 'FILE_SUBMITTED'
    | 'NO_RESPONSE'
    | 'ESCALATED'
    | 'CLOSED'
  next_follow_up_at: string | null
  last_reminded_at: string | null
}

export interface CommandCenterCeoDecisionRequestRow {
  id: string
  title: string
  project_id: string | null
  context: string | null
  delay_impact: string | null
  recommendation: string | null
  decision_due_at: string | null
  status: string | null
  created_at: string
}

export interface CommandCenterActivityLogRow {
  id: string
  created_at: string
  action: string | null
  actor_id: string | null
  entity_type: string | null
  entity_id: string | null
  metadata: Record<string, unknown> | null
}

export interface RawCommandCenterData {
  people: CommandCenterPersonRow[]
  projects: CommandCenterProjectRow[]
  workstreams: CommandCenterWorkstreamRow[]
  tasks: CommandCenterTaskRow[]
  taskSteps: CommandCenterTaskStepRow[]
  meetings: CommandCenterMeetingRow[]
  taskDrafts: CommandCenterMeetingTaskDraftRow[]
  deliverables: CommandCenterDeliverableRow[]
  deliverableVersions: CommandCenterDeliverableVersionRow[]
  attachments: CommandCenterAttachmentRow[]
  approvals: CommandCenterApprovalRow[]
  reminders: CommandCenterReminderRow[]
  ceoRequests: CommandCenterCeoDecisionRequestRow[]
  activityLogs: CommandCenterActivityLogRow[]
}
