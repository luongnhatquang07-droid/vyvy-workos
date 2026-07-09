import type { RawCommandCenterData } from '@/lib/database.types'
import {
  canApproveDeliverable,
  canViewFileLibrary,
  canViewProject,
  canViewReports,
  canViewStep,
  canViewSubtask,
  canViewWorkstream,
  isDepartmentHead,
  isExecutive,
  type RbacResource,
  type RbacUserContext,
} from '@/lib/rbac/permissions'

export function filterCommandCenterDataByUser(
  data: RawCommandCenterData,
  user: RbacUserContext | null | undefined,
): RawCommandCenterData {
  if (!user) return emptyCommandData()
  if (isExecutive(user)) return data

  const peopleById = new Map(data.people.map((person) => [person.id, person]))
  const projectsById = new Map(data.projects.map((project) => [project.id, project]))
  const workstreamsById = new Map(data.workstreams.map((workstream) => [workstream.id, workstream]))
  const tasksById = new Map(data.tasks.map((task) => [task.id, task]))
  const stepsById = new Map(data.taskSteps.map((step) => [step.id, step]))
  const deliverablesById = new Map(data.deliverables.map((deliverable) => [deliverable.id, deliverable]))

  const visibleProjectIds = new Set<string>()
  const visibleWorkstreamIds = new Set<string>()
  const visibleTaskIds = new Set<string>()
  const visibleStepIds = new Set<string>()
  const visibleDeliverableIds = new Set<string>()
  const visibleApprovalIds = new Set<string>()
  const visibleReminderIds = new Set<string>()
  const visibleMeetingIds = new Set<string>()
  const visiblePeopleIds = new Set<string>()

  addPerson(visiblePeopleIds, user.personId)

  for (const project of data.projects) {
    if (canViewProject(user, projectResource(project, peopleById))) addProjectContext(project.id)
  }

  for (const workstream of data.workstreams) {
    if (canViewWorkstream(user, workstreamResource(workstream, peopleById))) addWorkstreamContext(workstream.id)
  }

  for (const task of data.tasks) {
    if (canViewSubtask(user, taskResource(task, peopleById))) addTaskContext(task.id)
  }

  for (const step of data.taskSteps) {
    const parentTaskVisible = visibleTaskIds.has(step.task_id)
    if (parentTaskVisible || canViewStep(user, stepResource(step, tasksById, peopleById))) {
      addStepContext(step.id)
    }
  }

  for (const deliverable of data.deliverables) {
    const relatedTaskVisible = Boolean(deliverable.task_id && visibleTaskIds.has(deliverable.task_id))
    const relatedStepVisible = Boolean(deliverable.step_id && visibleStepIds.has(deliverable.step_id))
    if (relatedTaskVisible || relatedStepVisible || canViewFileLibrary(user, deliverableResource(deliverable, tasksById, stepsById, peopleById))) {
      addDeliverableContext(deliverable.id)
    }
  }

  for (const approval of data.approvals) {
    const relatedDeliverable = approval.deliverable_id ? deliverablesById.get(approval.deliverable_id) ?? null : null
    const relatedVisible =
      Boolean(approval.deliverable_id && visibleDeliverableIds.has(approval.deliverable_id)) ||
      Boolean(approval.task_id && visibleTaskIds.has(approval.task_id)) ||
      Boolean(approval.step_id && visibleStepIds.has(approval.step_id))
    const ownRequest = user.personId === approval.requested_by || user.personId === approval.approver_id

    if (
      relatedVisible ||
      ownRequest ||
      canApproveDeliverable(user, approvalResource(approval, relatedDeliverable, tasksById, stepsById, peopleById))
    ) {
      visibleApprovalIds.add(approval.id)
      addPerson(visiblePeopleIds, approval.requested_by)
      addPerson(visiblePeopleIds, approval.approver_id)
      if (approval.deliverable_id) addDeliverableContext(approval.deliverable_id)
      if (approval.step_id) addStepContext(approval.step_id)
      if (approval.task_id) addTaskContext(approval.task_id)
      if (approval.project_id) addProjectContext(approval.project_id)
    }
  }

  for (const reminder of data.reminders) {
    const person = reminder.person_id ? peopleById.get(reminder.person_id) ?? null : null
    const sameDepartment = isDepartmentHead(user) && Boolean(person?.department_id && isUserDepartment(user, person.department_id))
    const relatedVisible =
      user.personId === reminder.person_id ||
      sameDepartment ||
      Boolean(reminder.task_id && visibleTaskIds.has(reminder.task_id)) ||
      Boolean(reminder.deliverable_id && visibleDeliverableIds.has(reminder.deliverable_id))

    if (relatedVisible) {
      visibleReminderIds.add(reminder.id)
      addPerson(visiblePeopleIds, reminder.person_id)
      if (reminder.task_id) addTaskContext(reminder.task_id)
      if (reminder.deliverable_id) addDeliverableContext(reminder.deliverable_id)
    }
  }

  for (const meeting of data.meetings) {
    if (!meeting.project_id || visibleProjectIds.has(meeting.project_id)) visibleMeetingIds.add(meeting.id)
  }

  for (const version of data.deliverableVersions) {
    if (!visibleDeliverableIds.has(version.deliverable_id)) continue
    addPerson(visiblePeopleIds, version.submitted_by)
    addPerson(visiblePeopleIds, version.reviewed_by)
  }

  for (const attachment of data.attachments) {
    addPerson(visiblePeopleIds, attachment.uploaded_by)
  }

  if (isDepartmentHead(user)) {
    for (const person of data.people) {
      if (person.department_id && isUserDepartment(user, person.department_id)) addPerson(visiblePeopleIds, person.id)
    }
    for (const projectId of visibleProjectIds) addProjectParticipants(projectId)
  }

  const visibleDeliverableVersions = data.deliverableVersions.filter((version) => visibleDeliverableIds.has(version.deliverable_id))
  const visibleAttachmentIds = new Set(visibleDeliverableVersions.map((version) => version.attachment_id).filter(Boolean) as string[])

  const graph = {
    projectIds: visibleProjectIds,
    workstreamIds: visibleWorkstreamIds,
    taskIds: visibleTaskIds,
    stepIds: visibleStepIds,
    deliverableIds: visibleDeliverableIds,
    reminderIds: visibleReminderIds,
    approvalIds: visibleApprovalIds,
    meetingIds: visibleMeetingIds,
  }

  return {
    people: data.people.filter((person) => visiblePeopleIds.has(person.id)),
    projects: data.projects.filter((project) => visibleProjectIds.has(project.id)),
    workstreams: data.workstreams.filter((workstream) => visibleWorkstreamIds.has(workstream.id)),
    tasks: data.tasks.filter((task) => visibleTaskIds.has(task.id)),
    taskSteps: data.taskSteps.filter((step) => visibleStepIds.has(step.id)),
    meetings: data.meetings.filter((meeting) => visibleMeetingIds.has(meeting.id)),
    taskDrafts: data.taskDrafts.filter((draft) => visibleMeetingIds.has(draft.meeting_id)),
    deliverables: data.deliverables.filter((deliverable) => visibleDeliverableIds.has(deliverable.id)),
    deliverableVersions: visibleDeliverableVersions,
    attachments: data.attachments.filter((attachment) => visibleAttachmentIds.has(attachment.id)),
    approvals: data.approvals.filter((approval) => visibleApprovalIds.has(approval.id)),
    reminders: data.reminders.filter((reminder) => visibleReminderIds.has(reminder.id)),
    ceoRequests: canViewReports(user)
      ? data.ceoRequests.filter((request) => !request.project_id || visibleProjectIds.has(request.project_id))
      : [],
    activityLogs: data.activityLogs.filter((activity) => isVisibleActivity(activity, graph)),
  }

  function addProjectContext(projectId: string | null | undefined) {
    if (!projectId || !projectsById.has(projectId)) return
    visibleProjectIds.add(projectId)
    addPerson(visiblePeopleIds, projectsById.get(projectId)?.owner_id)
  }

  function addWorkstreamContext(workstreamId: string | null | undefined) {
    if (!workstreamId) return
    const workstream = workstreamsById.get(workstreamId)
    if (!workstream) return
    visibleWorkstreamIds.add(workstream.id)
    addProjectContext(workstream.project_id)
    addPerson(visiblePeopleIds, workstream.owner_id)
  }

  function addTaskContext(taskId: string | null | undefined) {
    if (!taskId) return
    const task = tasksById.get(taskId)
    if (!task) return
    visibleTaskIds.add(task.id)
    addProjectContext(task.project_id)
    addWorkstreamContext(task.workstream_id)
    addPerson(visiblePeopleIds, task.owner_id)
    addPerson(visiblePeopleIds, task.waiting_for_person_id)
  }

  function addStepContext(stepId: string | null | undefined) {
    if (!stepId) return
    const step = stepsById.get(stepId)
    if (!step) return
    visibleStepIds.add(step.id)
    addTaskContext(step.task_id)
    addPerson(visiblePeopleIds, step.owner_id)
  }

  function addDeliverableContext(deliverableId: string | null | undefined) {
    if (!deliverableId) return
    const deliverable = deliverablesById.get(deliverableId)
    if (!deliverable) return
    visibleDeliverableIds.add(deliverable.id)
    addProjectContext(deliverable.project_id)
    addTaskContext(deliverable.task_id)
    addStepContext(deliverable.step_id)
    addPerson(visiblePeopleIds, deliverable.submitter_id)
    addPerson(visiblePeopleIds, deliverable.reviewer_id)
  }

  function addProjectParticipants(projectId: string | null | undefined) {
    if (!projectId) return
    addPerson(visiblePeopleIds, projectsById.get(projectId)?.owner_id)

    for (const workstream of data.workstreams) {
      if (workstream.project_id !== projectId) continue
      addPerson(visiblePeopleIds, workstream.owner_id)
    }

    const projectTaskIds = new Set<string>()
    for (const task of data.tasks) {
      if (task.project_id !== projectId) continue
      projectTaskIds.add(task.id)
      addPerson(visiblePeopleIds, task.owner_id)
      addPerson(visiblePeopleIds, task.waiting_for_person_id)
      for (const personId of task.assignee_ids ?? []) addPerson(visiblePeopleIds, personId)
      for (const personId of task.supporter_ids ?? []) addPerson(visiblePeopleIds, personId)
    }

    for (const step of data.taskSteps) {
      if (projectTaskIds.has(step.task_id)) addPerson(visiblePeopleIds, step.owner_id)
    }

    for (const deliverable of data.deliverables) {
      const taskId = deliverable.task_id ?? null
      if (deliverable.project_id !== projectId && (!taskId || !projectTaskIds.has(taskId))) continue
      addPerson(visiblePeopleIds, deliverable.submitter_id)
      addPerson(visiblePeopleIds, deliverable.reviewer_id)
    }
  }
}

function projectResource(
  project: RawCommandCenterData['projects'][number],
  peopleById: Map<string, RawCommandCenterData['people'][number]>,
): RbacResource {
  return {
    id: project.id,
    owner_id: project.owner_id,
    owner_department_id: departmentFor(project.owner_id, peopleById),
    member_ids: compact([project.owner_id]),
  }
}

function workstreamResource(
  workstream: RawCommandCenterData['workstreams'][number],
  peopleById: Map<string, RawCommandCenterData['people'][number]>,
): RbacResource {
  return {
    id: workstream.id,
    project_id: workstream.project_id,
    owner_id: workstream.owner_id,
    owner_department_id: departmentFor(workstream.owner_id, peopleById),
    member_ids: compact([workstream.owner_id]),
  }
}

function taskResource(
  task: RawCommandCenterData['tasks'][number],
  peopleById: Map<string, RawCommandCenterData['people'][number]>,
): RbacResource {
  return {
    id: task.id,
    project_id: task.project_id,
    workstream_id: task.workstream_id,
    owner_id: task.owner_id,
    owner_department_id: departmentFor(task.owner_id, peopleById),
    assignee_ids: task.assignee_ids ?? [],
    supporter_ids: task.supporter_ids ?? [],
    member_ids: compact([task.owner_id, task.waiting_for_person_id, ...(task.assignee_ids ?? []), ...(task.supporter_ids ?? [])]),
  }
}

function stepResource(
  step: RawCommandCenterData['taskSteps'][number],
  tasksById: Map<string, RawCommandCenterData['tasks'][number]>,
  peopleById: Map<string, RawCommandCenterData['people'][number]>,
): RbacResource {
  const task = tasksById.get(step.task_id)
  return {
    id: step.id,
    task_id: step.task_id,
    project_id: task?.project_id ?? null,
    workstream_id: task?.workstream_id ?? null,
    owner_id: step.owner_id,
    owner_department_id: departmentFor(step.owner_id ?? task?.owner_id, peopleById),
    assignee_ids: task?.assignee_ids ?? [],
    supporter_ids: task?.supporter_ids ?? [],
    member_ids: compact([step.owner_id, task?.owner_id, task?.waiting_for_person_id, ...(task?.assignee_ids ?? []), ...(task?.supporter_ids ?? [])]),
  }
}

function deliverableResource(
  deliverable: RawCommandCenterData['deliverables'][number],
  tasksById: Map<string, RawCommandCenterData['tasks'][number]>,
  stepsById: Map<string, RawCommandCenterData['taskSteps'][number]>,
  peopleById: Map<string, RawCommandCenterData['people'][number]>,
): RbacResource {
  const task = deliverable.task_id ? tasksById.get(deliverable.task_id) : null
  const step = deliverable.step_id ? stepsById.get(deliverable.step_id) : null
  return {
    id: deliverable.id,
    project_id: deliverable.project_id ?? task?.project_id ?? null,
    task_id: deliverable.task_id,
    step_id: deliverable.step_id,
    submitter_id: deliverable.submitter_id,
    reviewer_id: deliverable.reviewer_id,
    owner_id: step?.owner_id ?? task?.owner_id ?? deliverable.submitter_id,
    owner_department_id: firstDepartment(
      peopleById,
      deliverable.submitter_id,
      deliverable.reviewer_id,
      step?.owner_id,
      task?.owner_id,
    ),
    assignee_ids: task?.assignee_ids ?? [],
    supporter_ids: task?.supporter_ids ?? [],
    member_ids: compact([deliverable.submitter_id, deliverable.reviewer_id, step?.owner_id, task?.owner_id, ...(task?.assignee_ids ?? []), ...(task?.supporter_ids ?? [])]),
  }
}

function approvalResource(
  approval: RawCommandCenterData['approvals'][number],
  deliverable: RawCommandCenterData['deliverables'][number] | null,
  tasksById: Map<string, RawCommandCenterData['tasks'][number]>,
  stepsById: Map<string, RawCommandCenterData['taskSteps'][number]>,
  peopleById: Map<string, RawCommandCenterData['people'][number]>,
): RbacResource {
  const deliverableAccess = deliverable
    ? deliverableResource(deliverable, tasksById, stepsById, peopleById)
    : null
  return {
    id: approval.id,
    project_id: approval.project_id ?? deliverableAccess?.project_id ?? null,
    task_id: approval.task_id ?? deliverableAccess?.task_id ?? null,
    step_id: approval.step_id ?? deliverableAccess?.step_id ?? null,
    submitter_id: deliverable?.submitter_id ?? approval.requested_by,
    reviewer_id: deliverable?.reviewer_id ?? approval.approver_id,
    requested_by: approval.requested_by,
    approver_id: approval.approver_id,
    owner_department_id: deliverableAccess?.owner_department_id ?? firstDepartment(peopleById, approval.requested_by, approval.approver_id),
    member_ids: compact([
      approval.requested_by,
      approval.approver_id,
      deliverable?.submitter_id,
      deliverable?.reviewer_id,
      deliverableAccess?.owner_id,
    ]),
  }
}

function isVisibleActivity(
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

function departmentFor(
  personId: string | null | undefined,
  peopleById: Map<string, RawCommandCenterData['people'][number]>,
) {
  return personId ? peopleById.get(personId)?.department_id ?? null : null
}

function firstDepartment(
  peopleById: Map<string, RawCommandCenterData['people'][number]>,
  ...personIds: Array<string | null | undefined>
) {
  for (const personId of personIds) {
    const departmentId = departmentFor(personId, peopleById)
    if (departmentId) return departmentId
  }
  return null
}

function isUserDepartment(user: RbacUserContext, departmentId: string) {
  return user.departmentId === departmentId || user.managedDepartmentIds.includes(departmentId)
}

function addPerson(target: Set<string>, personId: string | null | undefined) {
  if (personId) target.add(personId)
}

function compact(values: Array<string | null | undefined>) {
  return values.filter((value): value is string => Boolean(value))
}

function emptyCommandData(): RawCommandCenterData {
  return {
    people: [],
    projects: [],
    workstreams: [],
    tasks: [],
    taskSteps: [],
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
}
