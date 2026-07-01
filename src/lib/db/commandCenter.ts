import 'server-only'

import type { RawCommandCenterData } from '@/lib/database.types'
import { createClient } from '@/lib/supabase/server'

export async function getCommandCenterData(workspaceId: string): Promise<RawCommandCenterData> {
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
      .select('id,name,code,owner_id,status,health_status,start_date,due_date,deleted_at')
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null),

    sb.from('workstreams')
      .select('id,project_id,name,description,owner_id,status,priority,start_date,due_date,sort_order,deleted_at')
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .order('sort_order', { ascending: true }),

    sb.from('tasks')
      .select('id,title,owner_id,project_id,workstream_id,start_date,due_date,status,priority,waiting_for_person_id,waiting_for_content,deleted_at')
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
      .select('id,person_id,task_id,deliverable_id,reminder_level,response_status,next_follow_up_at,last_reminded_at')
      .eq('workspace_id', workspaceId),

    sb.from('ceo_decision_requests')
      .select('id,title,project_id,context,delay_impact,recommendation,decision_due_at,status,created_at')
      .eq('workspace_id', workspaceId),

    sb.from('activity_logs')
      .select('id,created_at,action,actor_id,entity_type,metadata')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  const projects = requireRows('dự án', projectsRes) as RawCommandCenterData['projects']
  const projectIds = new Set(projects.map((project) => project.id))
  const workstreams = (requireRows('đầu việc lớn', workstreamsRes) as RawCommandCenterData['workstreams'])
    .filter((workstream) => projectIds.has(workstream.project_id))
  const workstreamIds = new Set(workstreams.map((workstream) => workstream.id))
  const tasks = (requireRows('đầu việc', tasksRes) as RawCommandCenterData['tasks'])
    .filter((task) =>
      (!task.project_id || projectIds.has(task.project_id)) &&
      (!task.workstream_id || workstreamIds.has(task.workstream_id)),
    )
  const taskIds = new Set(tasks.map((task) => task.id))
  const taskSteps = (requireRows('bước thực hiện', taskStepsRes) as RawCommandCenterData['taskSteps'])
    .filter((step) => taskIds.has(step.task_id))
  const stepIds = new Set(taskSteps.map((step) => step.id))
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
  const approvals = (requireRows('phê duyệt', approvalsRes) as RawCommandCenterData['approvals'])
    .filter((approval) =>
      approval.status !== 'CANCELLED' &&
      (!approval.project_id || projectIds.has(approval.project_id)) &&
      (!approval.task_id || taskIds.has(approval.task_id)) &&
      (!approval.step_id || stepIds.has(approval.step_id)) &&
      (!approval.deliverable_id || deliverableIdSet.has(approval.deliverable_id)),
    )
  const reminders = (requireRows('nhắc việc', remindersRes) as RawCommandCenterData['reminders'])
    .filter((reminder) =>
      reminder.response_status !== 'CLOSED' &&
      (!reminder.task_id || taskIds.has(reminder.task_id)) &&
      (!reminder.deliverable_id || deliverableIdSet.has(reminder.deliverable_id)),
    )
  const ceoRequests = (requireRows('báo cáo CEO', ceoRes) as RawCommandCenterData['ceoRequests'])
    .filter((request) => !request.project_id || projectIds.has(request.project_id))
  let deliverableVersions: RawCommandCenterData['deliverableVersions'] = []
  let attachments: RawCommandCenterData['attachments'] = []

  if (deliverableIds.length) {
    const versionsRes = await sb
      .from('deliverable_versions')
      .select('id,deliverable_id,version_number,attachment_id,external_url,submitted_by,submitted_at,change_note,review_status,review_comment,reviewed_by,reviewed_at')
      .in('deliverable_id', deliverableIds)
      .order('version_number', { ascending: false })

    deliverableVersions = requireRows('version bàn giao', versionsRes) as RawCommandCenterData['deliverableVersions']
    const attachmentIds = deliverableVersions.map((version) => version.attachment_id).filter(Boolean) as string[]

    if (attachmentIds.length) {
      const attachmentsRes = await sb
        .from('attachments')
        .select('id,workspace_id,storage_path,file_name,mime_type,size_bytes,uploaded_by,uploaded_at,deleted_at')
        .eq('workspace_id', workspaceId)
        .in('id', attachmentIds)
        .is('deleted_at', null)

      attachments = requireRows('attachment', attachmentsRes) as RawCommandCenterData['attachments']
    }
  }

  return {
    people: requireRows('nhân sự', peopleRes) as RawCommandCenterData['people'],
    projects,
    workstreams,
    tasks,
    taskSteps,
    meetings,
    taskDrafts,
    deliverables,
    deliverableVersions,
    attachments,
    approvals,
    reminders,
    ceoRequests,
    activityLogs: requireRows('nhật ký hoạt động', activityRes) as RawCommandCenterData['activityLogs'],
  }
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
