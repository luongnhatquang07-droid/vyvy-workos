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
      .select('id,full_name,job_title,email,messenger_url,department_id,profile_id,status,deleted_at,department:departments!people_department_id_fkey(name)')
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
      .eq('workspace_id', workspaceId),

    sb.from('meeting_task_drafts')
      .select('id,meeting_id,import_status')
      .eq('workspace_id', workspaceId),

    sb.from('deliverables')
      .select('id,name,description,task_id,project_id,step_id,required_format,submitter_id,reviewer_id,due_date,status,type,is_required,approved_version_id,created_at,updated_at')
      .eq('workspace_id', workspaceId),

    sb.from('approvals')
      .select('id,task_id,deliverable_id,project_id,requested_by,approver_id,status,requested_at,due_at')
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

  return {
    people: requireRows('nhân sự', peopleRes) as RawCommandCenterData['people'],
    projects: requireRows('dự án', projectsRes) as RawCommandCenterData['projects'],
    workstreams: requireRows('đầu việc lớn', workstreamsRes) as RawCommandCenterData['workstreams'],
    tasks: requireRows('đầu việc', tasksRes) as RawCommandCenterData['tasks'],
    taskSteps: requireRows('bước thực hiện', taskStepsRes) as RawCommandCenterData['taskSteps'],
    meetings: requireRows('cuộc họp', meetingsRes) as RawCommandCenterData['meetings'],
    taskDrafts: requireRows('draft đầu việc từ họp', draftsRes) as RawCommandCenterData['taskDrafts'],
    deliverables: requireRows('file/báo cáo', deliverablesRes) as RawCommandCenterData['deliverables'],
    approvals: requireRows('phê duyệt', approvalsRes) as RawCommandCenterData['approvals'],
    reminders: requireRows('nhắc việc', remindersRes) as RawCommandCenterData['reminders'],
    ceoRequests: requireRows('báo cáo CEO', ceoRes) as RawCommandCenterData['ceoRequests'],
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
