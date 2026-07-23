export interface TaskCompletionRpcClient {
  rpc: (
    functionName: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{
    data: unknown
    error: { code?: string; message?: string } | null
  }>
}

export interface CompleteTaskInput {
  taskId: string
  workspaceId: string
  actorPersonId: string | null
}

export interface CompleteTaskResult {
  task: Record<string, unknown> & { id: string; status: 'COMPLETED' }
  bypass: boolean
  auditAction: 'complete_unassigned_bypass' | null
}

export class TaskCompletionServiceError extends Error {
  readonly code: string
  readonly status: number

  constructor(message: string, status: number, code: string) {
    super(message)
    this.name = 'TaskCompletionServiceError'
    this.status = status
    this.code = code
  }
}

export async function completeTask(
  client: TaskCompletionRpcClient,
  input: CompleteTaskInput,
): Promise<CompleteTaskResult> {
  const result = await client.rpc('complete_task_with_unassigned_bypass', {
    p_task_id: input.taskId,
    p_workspace_id: input.workspaceId,
    p_actor_id: input.actorPersonId,
  })
  if (result.error) throw mapCompletionError(result.error)

  const payload = asRecord(result.data)
  const task = asRecord(payload?.task)
  if (
    !payload
    || !task
    || typeof task.id !== 'string'
    || task.status !== 'COMPLETED'
    || typeof payload.bypass !== 'boolean'
  ) {
    throw new TaskCompletionServiceError(
      'Không nhận được kết quả hoàn thành đầu việc hợp lệ.',
      500,
      'TASK_COMPLETION_INVALID_RESPONSE',
    )
  }

  const auditAction = payload.audit_action === 'complete_unassigned_bypass'
    ? payload.audit_action
    : null
  if (payload.bypass && auditAction !== 'complete_unassigned_bypass') {
    throw new TaskCompletionServiceError(
      'Đầu việc đã hoàn thành nhưng thiếu xác nhận audit bypass.',
      500,
      'TASK_COMPLETION_AUDIT_MISSING',
    )
  }

  return {
    task: task as CompleteTaskResult['task'],
    bypass: payload.bypass,
    auditAction,
  }
}

function mapCompletionError(error: { code?: string; message?: string }) {
  if (error.code === 'TU001') {
    return new TaskCompletionServiceError(
      'Không tìm thấy đầu việc con hợp lệ để hoàn thành.',
      404,
      'TU001',
    )
  }
  if (error.code === 'TU002') {
    return new TaskCompletionServiceError(
      'Đầu việc con đã hoàn thành trước đó.',
      409,
      'TU002',
    )
  }
  if (error.code === 'TU003') {
    return new TaskCompletionServiceError(
      'Bạn không có quyền hoàn thành đầu việc này.',
      403,
      'TU003',
    )
  }
  if (error.code === 'P0001' && error.message?.startsWith('GATE:')) {
    return new TaskCompletionServiceError(
      error.message,
      409,
      'TASK_COMPLETION_QUALITY_GATE',
    )
  }
  return new TaskCompletionServiceError(
    'Không thể hoàn thành đầu việc. Vui lòng thử lại.',
    500,
    error.code ?? 'TASK_COMPLETION_UNKNOWN',
  )
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}
