import 'server-only'

import type {
  CommandCenterPersonRow,
  CommandCenterProjectRow,
  CommandCenterTaskRow,
  CommandCenterTaskStepRow,
  CommandCenterWorkstreamRow,
  RawCommandCenterData,
} from '@/lib/database.types'
import { filterCommandCenterDataByUser } from '@/lib/rbac/commandDataFilter'
import {
  canEditSubtask,
  resolveRbacUserContext,
  type RbacClient,
  type RbacResource,
} from '@/lib/rbac/permissions'
import { createServiceClient } from '@/lib/supabase/service'
import { createClient } from '@/lib/supabase/server'
import type {
  TimelineOwner,
  TimelinePageData,
  TimelineStep,
  TimelineTask,
  TimelineWorkstream,
} from './types'

export const TIMELINE_PROJECT_NAME = 'Timeline chuyển đổi số'

const TIMELINE_WORKSTREAM_NAMES = ['Mục 6', 'Mục 9'] as const

export class TimelineAuthenticationError extends Error {
  constructor() {
    super('Bạn cần đăng nhập để xem Timeline chuyển đổi số.')
    this.name = 'TimelineAuthenticationError'
  }
}

export type TimelinePageDataResult =
  | { kind: 'ready'; data: TimelinePageData }
  | { kind: 'missing'; message: string }
  | { kind: 'forbidden'; message: string }
  | { kind: 'error'; message: string }

interface TaskAssigneeRow {
  task_id: string
  person_id: string
  assignment_role: string
}

export async function getTimelinePageData(): Promise<TimelinePageDataResult> {
  try {
    const session = await createClient()
    const resolution = await resolveRbacUserContext(session as unknown as RbacClient)

    if (!resolution.ok) {
      if (resolution.stage === 'unauthenticated') throw new TimelineAuthenticationError()
      if (
        resolution.stage === 'no_profile' ||
        resolution.stage === 'no_membership' ||
        resolution.stage === 'workspace_mismatch'
      ) {
        return {
          kind: 'forbidden',
          message: 'Tài khoản chưa được cấp quyền truy cập workspace của Timeline chuyển đổi số.',
        }
      }
      return {
        kind: 'error',
        message: 'Không xác định được hồ sơ và quyền truy cập Timeline. Vui lòng thử đăng nhập lại.',
      }
    }

    const actor = resolution.context
    const workspaceId = actor.workspaceId
    if (!workspaceId) {
      return {
        kind: 'forbidden',
        message: 'Tài khoản chưa được gắn với workspace của Timeline chuyển đổi số.',
      }
    }

    const service = createServiceClient()
    const projectResult = await service
      .from('projects')
      .select('id,name,code,description,owner_id,reviewer_id,status,health_status,start_date,due_date,deleted_at')
      .eq('workspace_id', workspaceId)
      .eq('name', TIMELINE_PROJECT_NAME)
      .is('deleted_at', null)
      .limit(2)

    if (projectResult.error) return timelineReadError()
    const projects = (projectResult.data ?? []) as CommandCenterProjectRow[]
    if (projects.length === 0) {
      return {
        kind: 'missing',
        message: 'Chưa có dữ liệu Timeline chuyển đổi số. Hãy chạy seed Timeline trước.',
      }
    }
    if (projects.length > 1) {
      return {
        kind: 'error',
        message: 'Có nhiều dự án cùng tên Timeline chuyển đổi số. Hãy kiểm tra lại dữ liệu seed.',
      }
    }

    const project = projects[0]
    const [workstreamsResult, tasksResult, peopleResult] = await Promise.all([
      service
        .from('workstreams')
        .select('id,project_id,name,description,owner_id,reviewer_id,status,priority,start_date,due_date,sort_order,deleted_at')
        .eq('workspace_id', workspaceId)
        .eq('project_id', project.id)
        .in('name', [...TIMELINE_WORKSTREAM_NAMES])
        .is('deleted_at', null)
        .order('sort_order', { ascending: true }),
      service
        .from('tasks')
        .select('id,title,description,owner_id,reviewer_id,project_id,workstream_id,start_date,due_date,status,priority,waiting_for_person_id,waiting_for_content,expected_result,deleted_at')
        .eq('workspace_id', workspaceId)
        .eq('project_id', project.id)
        .is('deleted_at', null),
      service
        .from('people')
        .select('id,full_name,job_title,department_id,profile_id,status,deleted_at')
        .eq('workspace_id', workspaceId)
        .is('deleted_at', null),
    ])

    if (workstreamsResult.error || tasksResult.error || peopleResult.error) return timelineReadError()

    const workstreams = (workstreamsResult.data ?? []) as CommandCenterWorkstreamRow[]
    if (!hasExactlyOneTimelineWorkstreamEach(workstreams)) {
      return {
        kind: 'missing',
        message: 'Dữ liệu Timeline chưa có đủ hai đầu việc lớn Mục 6 và Mục 9.',
      }
    }

    const timelineWorkstreamIds = new Set(workstreams.map((workstream) => workstream.id))
    const tasks = ((tasksResult.data ?? []) as CommandCenterTaskRow[]).filter(
      (task) => task.workstream_id !== null && timelineWorkstreamIds.has(task.workstream_id),
    )
    const people = ((peopleResult.data ?? []) as Array<{
      id: string
      full_name: string
      job_title: string | null
      department_id: string | null
      profile_id: string | null
      status: string
      deleted_at: string | null
    }>).map<CommandCenterPersonRow>((person) => ({
      ...person,
      email: null,
      phone: null,
      messenger_url: null,
    }))

    const taskIds = tasks.map((task) => task.id)
    const [stepsResult, assigneesResult] = taskIds.length
      ? await Promise.all([
          service
            .from('task_steps')
            .select('id,task_id,title,description,owner_id,reviewer_id,status,priority,start_date,due_date,is_required,sort_order,created_at,deleted_at')
            .eq('workspace_id', workspaceId)
            .in('task_id', taskIds)
            .is('deleted_at', null)
            .order('sort_order', { ascending: true }),
          service
            .from('task_assignees')
            .select('task_id,person_id,assignment_role')
            .in('task_id', taskIds),
        ])
      : [
          { data: [] as CommandCenterTaskStepRow[], error: null },
          { data: [] as TaskAssigneeRow[], error: null },
        ]

    if (stepsResult.error || assigneesResult.error) return timelineReadError()

    const assigneeIdsByTask = new Map<string, string[]>()
    const supporterIdsByTask = new Map<string, string[]>()
    for (const row of (assigneesResult.data ?? []) as TaskAssigneeRow[]) {
      appendUnique(assigneeIdsByTask, row.task_id, row.person_id)
      if (row.assignment_role === 'SUPPORTER') {
        appendUnique(supporterIdsByTask, row.task_id, row.person_id)
      }
    }

    const tasksWithAssignments = tasks.map<CommandCenterTaskRow>((task) => ({
      ...task,
      assignee_ids: assigneeIdsByTask.get(task.id) ?? [],
      supporter_ids: supporterIdsByTask.get(task.id) ?? [],
    }))

    const rawData: RawCommandCenterData = {
      people,
      projects,
      workstreams,
      tasks: tasksWithAssignments,
      taskSteps: (stepsResult.data ?? []) as CommandCenterTaskStepRow[],
      meetings: [],
      taskDrafts: [],
      deliverables: [],
      deliverableVersions: [],
      attachments: [],
      approvals: [],
      reminders: [],
      ceoRequests: [],
      activityLogs: [],
    }
    const visibleData = filterCommandCenterDataByUser(rawData, actor)
    if (!visibleData.projects.some((candidate) => candidate.id === project.id)) {
      return {
        kind: 'forbidden',
        message: 'Bạn chưa được cấp quyền xem các đầu việc trong Timeline chuyển đổi số.',
      }
    }

    const peopleById = new Map(people.map((person) => [person.id, person]))
    const workstreamsById = new Map(workstreams.map((workstream) => [workstream.id, workstream]))
    const visibleStepsByTask = groupVisibleSteps(visibleData.taskSteps)
    const incompleteTask = visibleData.tasks.find(
      (task) =>
        !task.owner_id ||
        !peopleById.has(task.owner_id) ||
        !task.workstream_id ||
        !workstreamsById.has(task.workstream_id),
    )
    if (incompleteTask) {
      return {
        kind: 'error',
        message: 'Có đầu việc Timeline thiếu người phụ trách hoặc đầu việc lớn hợp lệ. Hãy kiểm tra lại dữ liệu seed.',
      }
    }

    const timelineTasks = visibleData.tasks
      .map<TimelineTask>((task) => {
        const ownerId = task.owner_id as string
        const workstreamId = task.workstream_id as string
        const owner = peopleById.get(ownerId) as CommandCenterPersonRow
        const workstream = workstreamsById.get(workstreamId) as CommandCenterWorkstreamRow
        return {
          id: task.id,
          title: task.title,
          description: task.description,
          ownerId,
          ownerName: owner.full_name,
          workstreamId,
          workstreamName: workstream.name,
          status: task.status,
          startDate: task.start_date,
          dueDate: task.due_date,
          canEdit: canEditSubtask(actor, taskRbacResource(task, peopleById)),
          steps: visibleStepsByTask.get(task.id) ?? [],
        }
      })
      .sort(compareTimelineTasks)

    const visibleOwnerIds = new Set(
      visibleData.tasks
        .map((task) => task.owner_id)
        .filter((ownerId): ownerId is string => Boolean(ownerId)),
    )
    const owners = Array.from(visibleOwnerIds)
      .map((ownerId) => peopleById.get(ownerId))
      .filter((owner): owner is CommandCenterPersonRow => Boolean(owner))
      .map<TimelineOwner>((owner) => ({
        id: owner.id,
        name: owner.full_name,
        colorKey: timelineOwnerColorKey(owner.full_name),
      }))
      .sort((left, right) => left.name.localeCompare(right.name, 'vi'))

    const visibleWorkstreamIds = new Set(visibleData.tasks.map((task) => task.workstream_id).filter(Boolean))
    const timelineWorkstreams = visibleData.workstreams
      .filter((workstream) => visibleWorkstreamIds.has(workstream.id) || visibleData.tasks.length === 0)
      .map<TimelineWorkstream>((workstream) => ({ id: workstream.id, name: workstream.name }))
      .sort(compareTimelineWorkstreams)

    return {
      kind: 'ready',
      data: {
        projectId: project.id,
        projectName: project.name,
        tasks: timelineTasks,
        owners,
        workstreams: timelineWorkstreams,
      },
    }
  } catch (error) {
    if (error instanceof TimelineAuthenticationError) throw error
    return timelineReadError()
  }
}

function taskRbacResource(
  task: CommandCenterTaskRow,
  peopleById: Map<string, CommandCenterPersonRow>,
): RbacResource {
  const assigneeIds = task.assignee_ids ?? []
  const supporterIds = task.supporter_ids ?? []
  return {
    id: task.id,
    project_id: task.project_id,
    workstream_id: task.workstream_id,
    owner_id: task.owner_id,
    owner_department_id: task.owner_id ? peopleById.get(task.owner_id)?.department_id ?? null : null,
    assignee_ids: assigneeIds,
    supporter_ids: supporterIds,
    member_ids: compact([
      task.owner_id,
      task.waiting_for_person_id,
      ...assigneeIds,
      ...supporterIds,
    ]),
  }
}

function groupVisibleSteps(steps: CommandCenterTaskStepRow[]) {
  const byTask = new Map<string, TimelineStep[]>()
  const ordered = [...steps].sort((left, right) => {
    const sortDifference = (left.sort_order ?? Number.MAX_SAFE_INTEGER) - (right.sort_order ?? Number.MAX_SAFE_INTEGER)
    return sortDifference || left.title.localeCompare(right.title, 'vi')
  })
  for (const step of ordered) {
    const existing = byTask.get(step.task_id) ?? []
    existing.push({ id: step.id, title: step.title, status: step.status })
    byTask.set(step.task_id, existing)
  }
  return byTask
}

function hasExactlyOneTimelineWorkstreamEach(workstreams: CommandCenterWorkstreamRow[]) {
  return TIMELINE_WORKSTREAM_NAMES.every(
    (name) => workstreams.filter((workstream) => workstream.name === name).length === 1,
  )
}

function compareTimelineTasks(left: TimelineTask, right: TimelineTask) {
  return (
    compareTimelineWorkstreamNames(left.workstreamName, right.workstreamName) ||
    left.ownerName.localeCompare(right.ownerName, 'vi') ||
    left.title.localeCompare(right.title, 'vi')
  )
}

function compareTimelineWorkstreams(left: TimelineWorkstream, right: TimelineWorkstream) {
  return compareTimelineWorkstreamNames(left.name, right.name)
}

function compareTimelineWorkstreamNames(left: string, right: string) {
  const leftIndex = TIMELINE_WORKSTREAM_NAMES.indexOf(left as (typeof TIMELINE_WORKSTREAM_NAMES)[number])
  const rightIndex = TIMELINE_WORKSTREAM_NAMES.indexOf(right as (typeof TIMELINE_WORKSTREAM_NAMES)[number])
  if (leftIndex !== -1 || rightIndex !== -1) {
    return (leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex) -
      (rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex)
  }
  return left.localeCompare(right, 'vi')
}

function appendUnique(target: Map<string, string[]>, taskId: string, personId: string) {
  const values = target.get(taskId) ?? []
  if (!values.includes(personId)) values.push(personId)
  target.set(taskId, values)
}

function timelineOwnerColorKey(ownerName: string): TimelineOwner['colorKey'] {
  const normalizedTokens = ownerName
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('vi')
    .split(/\s+/)
    .filter(Boolean)
  const lastToken = normalizedTokens.at(-1)

  if (normalizedTokens.includes('team') || normalizedTokens.includes('nhom')) return 'purple'
  if (lastToken === 'vu') return 'blue'
  if (lastToken === 'an') return 'teal'
  if (lastToken === 'chi') return 'orange'
  if (lastToken === 'long') return 'indigo'
  return 'neutral'
}

function compact(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))))
}

function timelineReadError(): TimelinePageDataResult {
  return {
    kind: 'error',
    message: 'Không tải được dữ liệu Timeline chuyển đổi số. Vui lòng thử lại.',
  }
}
