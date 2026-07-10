import 'server-only'

import { withSyntheticPendingApprovals } from '@/lib/approvalQueue'
import type {
  CommandCenterEntityCounts,
  CommandCenterProjectVisibilitySummary,
  CommandCenterVisibilitySummary,
  RawCommandCenterData,
} from '@/lib/database.types'
import { buildDeadlineRollups } from '@/lib/deadlineRollup'
import { filterCommandCenterDataByUser } from '@/lib/rbac/commandDataFilter'
import { isExecutive, type RbacUserContext } from '@/lib/rbac/permissions'
import { createClient } from '@/lib/supabase/server'

const OPERATIONAL_ACTIVITY_ACTIONS = new Set([
  'follow_up.reminder.sent',
  'follow_up.reminder.scheduled',
  'follow_up.reminder.escalated',
  'deliverable.reminder.sent',
  'deliverable.approve',
  'deliverable.requestRevision',
  'deliverable.markMissing',
  'approval.requested',
  'approval.approved',
  'approval.revision_required',
  'approval.rejected',
  'escalation.created',
])

export async function getCommandCenterData(
  workspaceId: string,
  userContext?: RbacUserContext | null,
): Promise<RawCommandCenterData & { visibilitySummary?: CommandCenterVisibilitySummary }> {
  const sb = await createClient()

  const [
    peopleRes,
    projectsRes,
    workstreamsRes,
    tasksRes,
    taskStepsRes,
    meetingsRes,
    draftsRes,
    deliverablesRes,
    approvalsRes,
    remindersRes,
    ceoRes,
    activityRes,
  ] = await Promise.all([
    sb.from('people')
      .select('id,full_name,job_title,email,phone,messenger_url,department_id,profile_id,status,deleted_at,department:departments!people_department_id_fkey(name)')
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null),

    sb.from('projects')
      .select('id,name,code,description,owner_id,status,health_status,start_date,due_date,deleted_at')
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null),

    sb.from('workstreams')
      .select('id,project_id,name,description,owner_id,status,priority,start_date,due_date,sort_order,deleted_at')
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .order('sort_order', { ascending: true }),

    sb.from('tasks')
      .select('id,title,description,owner_id,project_id,workstream_id,start_date,due_date,status,priority,waiting_for_person_id,waiting_for_content,expected_result,deleted_at')
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null),

    sb.from('task_steps')
      .select('id,task_id,title,description,owner_id,status,priority,start_date,due_date,is_required,sort_order,deleted_at')
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .order('sort_order', { ascending: true }),

    sb.from('meetings')
      .select('id,title,start_at,status,project_id')
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null),

    sb.from('meeting_task_drafts')
      .select('id,meeting_id,import_status')
      .eq('workspace_id', workspaceId),

    sb.from('deliverables')
      .select('id,name,description,task_id,project_id,step_id,required_format,submitter_id,reviewer_id,due_date,status,type,is_required,approved_version_id,created_at,updated_at')
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null),

    sb.from('approvals')
      .select('id,task_id,step_id,deliverable_id,project_id,requested_by,approver_id,status,requested_at,due_at')
      .eq('workspace_id', workspaceId),

    sb.from('reminders')
      .select('id,person_id,task_id,deliverable_id,reminder_level,response_status,next_follow_up_at,last_reminded_at,status')
      .eq('workspace_id', workspaceId),

    sb.from('ceo_decision_requests')
      .select('id,title,project_id,context,delay_impact,recommendation,decision_due_at,status,created_at')
      .eq('workspace_id', workspaceId),

    sb.from('activity_logs')
      .select('id,created_at,action,actor_id,entity_type,entity_id,metadata')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(100),
  ])

  let projects = requireRows('dự án', projectsRes) as RawCommandCenterData['projects']
  const allPeople = requireRows('nhan su', peopleRes) as RawCommandCenterData['people']
  const projectIds = new Set(projects.map((project) => project.id))
  let workstreams = (requireRows('đầu việc lớn', workstreamsRes) as RawCommandCenterData['workstreams'])
    .filter((workstream) => projectIds.has(workstream.project_id))
  const workstreamIds = new Set(workstreams.map((workstream) => workstream.id))
  let tasks = (requireRows('đầu việc', tasksRes) as RawCommandCenterData['tasks'])
    .filter((task) =>
      (!task.project_id || projectIds.has(task.project_id)) &&
      (!task.workstream_id || workstreamIds.has(task.workstream_id)),
    )
  await hydrateWorkspaceItemReviewers(sb, workspaceId, { projects, workstreams, tasks })
  const taskIds = new Set(tasks.map((task) => task.id))
  if (taskIds.size) {
    const assigneesRes = await sb
      .from('task_assignees')
      .select('task_id,person_id,assignment_role')
      .in('task_id', Array.from(taskIds))

    if (assigneesRes.error) throw new Error(`Khong doc duoc task assignees: ${assigneesRes.error.message}`)

    const assigneesByTask = new Map<string, string[]>()
    const supportersByTask = new Map<string, string[]>()
    for (const row of assigneesRes.data ?? []) {
      if (!row.task_id || !row.person_id) continue
      const assigneeIds = assigneesByTask.get(row.task_id) ?? []
      assigneeIds.push(row.person_id)
      assigneesByTask.set(row.task_id, assigneeIds)

      if (row.assignment_role === 'SUPPORTER') {
        const supporterIds = supportersByTask.get(row.task_id) ?? []
        supporterIds.push(row.person_id)
        supportersByTask.set(row.task_id, supporterIds)
      }
    }

    tasks = tasks.map((task) => ({
      ...task,
      assignee_ids: assigneesByTask.get(task.id) ?? [],
      supporter_ids: supportersByTask.get(task.id) ?? [],
    }))
  }
  let taskSteps = (requireRows('bước thực hiện', taskStepsRes) as RawCommandCenterData['taskSteps'])
    .filter((step) => taskIds.has(step.task_id))
  await hydrateWorkspaceItemReviewers(sb, workspaceId, { taskSteps })
  const stepIds = new Set(taskSteps.map((step) => step.id))

  const deadlineRollups = buildDeadlineRollups({
    projects,
    workstreams,
    subtasks: tasks,
    steps: taskSteps,
  })
  projects = projects.map((project) => ({
    ...project,
    due_date: deadlineRollups.projectDeadlines.get(project.id) ?? project.due_date,
  }))
  workstreams = workstreams.map((workstream) => ({
    ...workstream,
    due_date: deadlineRollups.workstreamDeadlines.get(workstream.id) ?? workstream.due_date,
  }))
  tasks = tasks.map((task) => ({
    ...task,
    due_date: deadlineRollups.taskDeadlines.get(task.id) ?? task.due_date,
  }))
  taskSteps = taskSteps.map((step) => ({
    ...step,
    due_date: deadlineRollups.stepDeadlines.get(step.id) ?? step.due_date,
  }))

  const meetings = (requireRows('cuộc họp', meetingsRes) as RawCommandCenterData['meetings'])
    .filter((meeting) => !meeting.project_id || projectIds.has(meeting.project_id))
  const meetingIds = new Set(meetings.map((meeting) => meeting.id))
  const taskDrafts = (requireRows('draft đầu việc từ họp', draftsRes) as RawCommandCenterData['taskDrafts'])
    .filter((draft) => meetingIds.has(draft.meeting_id))
  const deliverables = (requireRows('file/báo cáo', deliverablesRes) as RawCommandCenterData['deliverables'])
    .filter((deliverable) =>
      (!deliverable.project_id || projectIds.has(deliverable.project_id)) &&
      (!deliverable.task_id || taskIds.has(deliverable.task_id)) &&
      (!deliverable.step_id || stepIds.has(deliverable.step_id)),
    )
  const deliverableIds = deliverables.map((deliverable) => deliverable.id)
  const deliverableIdSet = new Set(deliverableIds)
  let approvals = (requireRows('phê duyệt', approvalsRes) as RawCommandCenterData['approvals'])
    .filter((approval) =>
      approval.status !== 'CANCELLED' &&
      (!approval.project_id || projectIds.has(approval.project_id)) &&
      (!approval.task_id || taskIds.has(approval.task_id)) &&
      (!approval.step_id || stepIds.has(approval.step_id)) &&
      (!approval.deliverable_id || deliverableIdSet.has(approval.deliverable_id)),
    )
  const approvalIds = new Set(approvals.map((approval) => approval.id))
  const reminders = (requireRows('nhắc việc', remindersRes) as RawCommandCenterData['reminders'])
    .filter((reminder) =>
      reminder.status !== 'closed' &&
      reminder.response_status !== 'CLOSED' &&
      (!reminder.task_id || taskIds.has(reminder.task_id)) &&
      (!reminder.deliverable_id || deliverableIdSet.has(reminder.deliverable_id)),
    )
  const reminderIds = new Set(reminders.map((reminder) => reminder.id))
  const ceoRequests = (requireRows('báo cáo CEO', ceoRes) as RawCommandCenterData['ceoRequests'])
    .filter((request) => !request.project_id || projectIds.has(request.project_id))
  const activityLogs = (requireRows('nhật ký hoạt động', activityRes) as RawCommandCenterData['activityLogs'])
    .filter((activity) =>
      isOperationalActivity(activity.action) &&
      isActivityEntityActive(activity, {
        projectIds,
        workstreamIds,
        taskIds,
        stepIds,
        deliverableIds: deliverableIdSet,
        reminderIds,
        approvalIds,
        meetingIds,
      }),
    )
    .slice(0, 20)
  let deliverableVersions: RawCommandCenterData['deliverableVersions'] = []

  if (deliverableIds.length) {
    const versionsRes = await sb
      .from('deliverable_versions')
      .select('id,deliverable_id,version_number,attachment_id,external_url,submitted_by,submitted_at,change_note,review_status,review_comment,reviewed_by,reviewed_at')
      .in('deliverable_id', deliverableIds)
      .order('version_number', { ascending: false })

    deliverableVersions = requireRows('version bàn giao', versionsRes) as RawCommandCenterData['deliverableVersions']
  }

  approvals = withSyntheticPendingApprovals({
    approvals,
    deliverables,
    versions: deliverableVersions,
    tasks,
    taskSteps,
  })

  const rawData: RawCommandCenterData = {
    people: allPeople,
    projects,
    workstreams,
    tasks,
    taskSteps,
    meetings,
    taskDrafts,
    deliverables,
    deliverableVersions,
    attachments: [],
    approvals,
    reminders,
    ceoRequests,
    activityLogs,
  }

  if (userContext !== undefined) {
    const filteredData = filterCommandCenterDataByUser(rawData, userContext)
    return {
      ...filteredData,
      visibilitySummary: buildVisibilitySummary(rawData, filteredData, userContext),
    }
  }

  return rawData
}

function buildVisibilitySummary(
  rawData: RawCommandCenterData,
  filteredData: RawCommandCenterData,
  userContext: RbacUserContext | null | undefined,
): CommandCenterVisibilitySummary {
  return {
    scope: userContext && isExecutive(userContext) ? 'full' : 'restricted',
    role: userContext?.normalizedRole ?? userContext?.role ?? null,
    departmentName: userContext?.departmentName ?? null,
    total: countEntities(rawData),
    visible: countEntities(filteredData),
    projects: rawData.projects.map((project) => buildProjectVisibilitySummary(project.id, project.name, rawData, filteredData)),
  }
}

function buildProjectVisibilitySummary(
  projectId: string,
  projectName: string,
  rawData: RawCommandCenterData,
  filteredData: RawCommandCenterData,
): CommandCenterProjectVisibilitySummary {
  return {
    projectId,
    projectName,
    total: countProjectEntities(rawData, projectId),
    visible: countProjectEntities(filteredData, projectId),
  }
}

function countEntities(data: RawCommandCenterData): CommandCenterEntityCounts {
  return {
    projects: data.projects.length,
    workstreams: data.workstreams.length,
    subtasks: data.tasks.length,
    steps: data.taskSteps.length,
  }
}

function countProjectEntities(data: RawCommandCenterData, projectId: string): CommandCenterEntityCounts {
  const workstreamIds = new Set(
    data.workstreams.filter((workstream) => workstream.project_id === projectId).map((workstream) => workstream.id),
  )
  const tasks = data.tasks.filter((task) => task.project_id === projectId)
  const taskIds = new Set(tasks.map((task) => task.id))

  return {
    projects: data.projects.some((project) => project.id === projectId) ? 1 : 0,
    workstreams: workstreamIds.size,
    subtasks: tasks.length,
    steps: data.taskSteps.filter((step) => taskIds.has(step.task_id)).length,
  }
}

function isOperationalActivity(action: string | null) {
  return Boolean(action && OPERATIONAL_ACTIVITY_ACTIONS.has(action))
}

function isActivityEntityActive(
  activity: RawCommandCenterData['activityLogs'][number],
  graph: {
    projectIds: Set<string>
    workstreamIds: Set<string>
    taskIds: Set<string>
    stepIds: Set<string>
    deliverableIds: Set<string>
    reminderIds: Set<string>
    approvalIds: Set<string>
    meetingIds: Set<string>
  },
) {
  const entityId = activity.entity_id
  if (!entityId) return false

  switch ((activity.entity_type ?? '').toLowerCase()) {
    case 'project':
      return graph.projectIds.has(entityId)
    case 'workstream':
      return graph.workstreamIds.has(entityId)
    case 'task':
      return graph.taskIds.has(entityId)
    case 'task_step':
    case 'step':
      return graph.stepIds.has(entityId)
    case 'deliverable':
      return graph.deliverableIds.has(entityId)
    case 'reminder':
      return graph.reminderIds.has(entityId)
    case 'approval':
      return graph.approvalIds.has(entityId)
    case 'meeting':
      return graph.meetingIds.has(entityId)
    default:
      return false
  }
}

async function hydrateWorkspaceItemReviewers(
  sb: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
  collections: {
    projects?: Array<{ id: string; reviewer_id?: string | null }>
    workstreams?: Array<{ id: string; reviewer_id?: string | null }>
    tasks?: Array<{ id: string; reviewer_id?: string | null }>
    taskSteps?: Array<{ id: string; reviewer_id?: string | null }>
  },
) {
  await Promise.all([
    hydrateReviewerRows(sb, workspaceId, 'projects', collections.projects),
    hydrateReviewerRows(sb, workspaceId, 'workstreams', collections.workstreams),
    hydrateReviewerRows(sb, workspaceId, 'tasks', collections.tasks),
    hydrateReviewerRows(sb, workspaceId, 'task_steps', collections.taskSteps),
  ])
}

async function hydrateReviewerRows<T extends { id: string; reviewer_id?: string | null }>(
  sb: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
  table: 'projects' | 'workstreams' | 'tasks' | 'task_steps',
  rows: T[] | undefined,
) {
  if (!rows?.length) return
  const result = await sb
    .from(table)
    .select('id,reviewer_id')
    .eq('workspace_id', workspaceId)
    .in('id', rows.map((row) => row.id))

  if (result.error) {
    if (isMissingReviewerColumn(result.error)) return
    throw new Error(`Khong doc duoc nguoi duyet cua ${table}: ${result.error.message}`)
  }

  const reviewers = new Map((result.data ?? []).map((row) => [row.id as string, row.reviewer_id as string | null]))
  rows.forEach((row) => {
    if (reviewers.has(row.id)) row.reviewer_id = reviewers.get(row.id) ?? null
  })
}

function isMissingReviewerColumn(error: unknown) {
  const message = error instanceof Error
    ? error.message
    : typeof error === 'object' && error && 'message' in error
      ? String(error.message)
      : ''
  return message.includes('reviewer_id')
}

function requireRows<T>(
  label: string,
  result: { data: T[] | null; error: { message: string } | null },
): T[] {
  if (result.error) {
    throw new Error(`Không đọc được ${label}: ${result.error.message}`)
  }
  return result.data ?? []
}
