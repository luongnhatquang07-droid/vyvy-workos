import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

export interface ProjectMemberScope {
  project: string[]
  workstreams: Map<string, string[]>
}

export async function loadProjectMemberScope(
  service: SupabaseClient,
  workspaceId: string,
  projectId: string,
): Promise<ProjectMemberScope> {
  const taskResult = await service
    .from('tasks')
    .select('id,workstream_id,owner_id,reviewer_id,waiting_for_person_id')
    .eq('workspace_id', workspaceId)
    .eq('project_id', projectId)
    .is('deleted_at', null)
  if (taskResult.error) throw taskResult.error

  const tasks = taskResult.data ?? []
  const taskIds = tasks.map((task) => task.id as string)
  const projectMembers = new Set<string>()
  const workstreamMembers = new Map<string, Set<string>>()
  const taskWorkstreams = new Map<string, string | null>()

  for (const task of tasks) {
    const taskId = task.id as string
    const workstreamId = (task.workstream_id as string | null) ?? null
    taskWorkstreams.set(taskId, workstreamId)
    addMember(projectMembers, task.owner_id)
    addMember(projectMembers, task.reviewer_id)
    addMember(projectMembers, task.waiting_for_person_id)
    if (workstreamId) {
      const members = workstreamMembers.get(workstreamId) ?? new Set<string>()
      addMember(members, task.owner_id)
      addMember(members, task.reviewer_id)
      addMember(members, task.waiting_for_person_id)
      workstreamMembers.set(workstreamId, members)
    }
  }

  if (taskIds.length) {
    const [assigneeResult, stepResult] = await Promise.all([
      service
        .from('task_assignees')
        .select('task_id,person_id')
        .in('task_id', taskIds),
      service
        .from('task_steps')
        .select('task_id,owner_id,reviewer_id')
        .eq('workspace_id', workspaceId)
        .is('deleted_at', null)
        .in('task_id', taskIds),
    ])
    if (assigneeResult.error) throw assigneeResult.error
    if (stepResult.error) throw stepResult.error

    for (const assignment of assigneeResult.data ?? []) {
      const personId = assignment.person_id as string | null
      const workstreamId = taskWorkstreams.get(assignment.task_id as string) ?? null
      addMember(projectMembers, personId)
      if (workstreamId) {
        const members = workstreamMembers.get(workstreamId) ?? new Set<string>()
        addMember(members, personId)
        workstreamMembers.set(workstreamId, members)
      }
    }

    for (const step of stepResult.data ?? []) {
      const workstreamId = taskWorkstreams.get(step.task_id as string) ?? null
      addMember(projectMembers, step.owner_id)
      addMember(projectMembers, step.reviewer_id)
      if (workstreamId) {
        const members = workstreamMembers.get(workstreamId) ?? new Set<string>()
        addMember(members, step.owner_id)
        addMember(members, step.reviewer_id)
        workstreamMembers.set(workstreamId, members)
      }
    }
  }

  return {
    project: Array.from(projectMembers),
    workstreams: new Map(
      Array.from(workstreamMembers, ([workstreamId, members]) => [workstreamId, Array.from(members)]),
    ),
  }
}

function addMember(target: Set<string>, value: unknown) {
  if (typeof value === 'string' && value) target.add(value)
}
