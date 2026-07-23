import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { TaskStatus } from '@/lib/tasks/taskStatusService'

type DeliverableStatus = 'REQUIRED' | 'NOT_SUBMITTED' | 'SUBMITTED' | 'APPROVED' | 'REVISION_REQUIRED' | 'MISSING_INFORMATION'

interface StaleTaskRow {
  id: string
  status: TaskStatus | null
  expected_result: string | null
}

interface StaleDeliverableRow {
  id: string
  name: string | null
  task_id: string | null
  step_id: string | null
  status: DeliverableStatus | null
  is_required: boolean | null
  approved_version_id: string | null
}

interface StaleStepRow {
  id: string
  task_id: string
  title: string | null
  description: string | null
  status: TaskStatus | null
  is_required: boolean | null
}

export interface TaskCompletionResyncResult {
  checked: number
  completedTaskIds: string[]
  completedStepIds: string[]
}

export async function resyncCompletedTasks(client: SupabaseClient, workspaceId: string): Promise<TaskCompletionResyncResult> {
  const [tasksRes, deliverablesRes, stepsRes] = await Promise.all([
    client
      .from('tasks')
      .select('id,status,expected_result')
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .not('status', 'in', '("COMPLETED","CANCELLED")'),
    client
      .from('deliverables')
      .select('id,name,task_id,step_id,status,is_required,approved_version_id')
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null),
    client
      .from('task_steps')
      .select('id,task_id,title,description,status,is_required')
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null),
  ])

  if (tasksRes.error) throw tasksRes.error
  if (deliverablesRes.error) throw deliverablesRes.error
  if (stepsRes.error) throw stepsRes.error

  const tasks = (tasksRes.data ?? []) as StaleTaskRow[]
  const deliverables = (deliverablesRes.data ?? []) as StaleDeliverableRow[]
  const steps = (stepsRes.data ?? []) as StaleStepRow[]
  const taskIds = new Set(tasks.map((task) => task.id))
  const deliverablesByTask = groupByTask(deliverables.filter((deliverable) => deliverable.task_id && taskIds.has(deliverable.task_id)))
  const stepsByTask = groupByTask(steps.filter((step) => taskIds.has(step.task_id)))
  const completedTaskIds: string[] = []
  const completedTaskPatches: Array<{ id: string; expectedResult: string | null }> = []
  const completedStepIds = new Set<string>()

  for (const task of tasks) {
    const taskDeliverables = deliverablesByTask.get(task.id) ?? []
    const requiredDeliverables = taskDeliverables.filter((deliverable) => deliverable.is_required !== false)
    if (requiredDeliverables.length === 0 || !requiredDeliverables.every(isApprovedDeliverable)) continue

    const approvedLinkedStepIds = new Set(requiredDeliverables.map((deliverable) => deliverable.step_id).filter(Boolean) as string[])
    const taskSteps = stepsByTask.get(task.id) ?? []
    const incompleteRequiredSteps = taskSteps.filter((step) => step.is_required !== false && step.status !== 'COMPLETED' && !approvedLinkedStepIds.has(step.id))
    const defaultStepIds = incompleteRequiredSteps.filter(isDefaultCompletionStep).map((step) => step.id)
    const realStepBlockers = incompleteRequiredSteps.filter((step) => !defaultStepIds.includes(step.id))
    if (realStepBlockers.length > 0) continue

    approvedLinkedStepIds.forEach((stepId) => completedStepIds.add(stepId))
    defaultStepIds.forEach((stepId) => completedStepIds.add(stepId))
    completedTaskIds.push(task.id)
    completedTaskPatches.push({
      id: task.id,
      expectedResult: task.expected_result?.trim() ? null : buildApprovedDeliverableResult(requiredDeliverables),
    })
  }

  const completedStepIdList = Array.from(completedStepIds)
  if (completedStepIdList.length > 0) {
    const stepUpdateRes = await client
      .from('task_steps')
      .update({ status: 'COMPLETED' })
      .eq('workspace_id', workspaceId)
      .in('id', completedStepIdList)
    if (stepUpdateRes.error) throw stepUpdateRes.error
  }

  for (const taskPatch of completedTaskPatches) {
    const payload: { status: 'COMPLETED'; expected_result?: string } = { status: 'COMPLETED' }
    if (taskPatch.expectedResult) payload.expected_result = taskPatch.expectedResult

    const taskUpdateRes = await client
      .from('tasks')
      .update(payload)
      .eq('workspace_id', workspaceId)
      .eq('id', taskPatch.id)
    if (taskUpdateRes.error) throw taskUpdateRes.error
  }

  if (completedTaskIds.length > 0) {
    const reminderUpdateRes = await client
      .from('reminders')
      .update({ status: 'closed', response_status: 'CLOSED', updated_at: new Date().toISOString() })
      .eq('workspace_id', workspaceId)
      .in('task_id', completedTaskIds)
    if (reminderUpdateRes.error) throw reminderUpdateRes.error
  }

  return {
    checked: tasks.length,
    completedTaskIds,
    completedStepIds: completedStepIdList,
  }
}

function groupByTask<T extends { task_id: string | null }>(rows: T[]) {
  const grouped = new Map<string, T[]>()
  rows.forEach((row) => {
    if (!row.task_id) return
    const entries = grouped.get(row.task_id) ?? []
    entries.push(row)
    grouped.set(row.task_id, entries)
  })
  return grouped
}

function isApprovedDeliverable(deliverable: StaleDeliverableRow) {
  return deliverable.status === 'APPROVED' && Boolean(deliverable.approved_version_id)
}

function buildApprovedDeliverableResult(deliverables: StaleDeliverableRow[]) {
  const names = deliverables
    .map((deliverable) => deliverable.name?.trim())
    .filter(Boolean)
    .slice(0, 3)

  return names.length
    ? `Đã có bàn giao được duyệt: ${names.join('; ')}`
    : 'Đã có bàn giao được duyệt.'
}

function isDefaultCompletionStep(row: StaleStepRow) {
  const text = `${row.title ?? ''} ${row.description ?? ''}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/Ä‘/g, 'd')

  return (
    text.includes('cap nhat ket qua') ||
    text.includes('bao cao ket qua') ||
    text.includes('thuc hien va cap nhat')
  )
}
