import { describe, expect, it, vi } from 'vitest'

import {
  completeTask,
  type TaskCompletionRpcClient,
} from './taskCompletionService'

function clientWithResult(
  data: unknown,
  error: { code?: string; message?: string } | null = null,
) {
  return {
    rpc: vi.fn().mockResolvedValue({ data, error }),
  } satisfies TaskCompletionRpcClient
}

describe('completeTask', () => {
  it('completes an UNASSIGNED task without file/report through the audited bypass', async () => {
    const client = clientWithResult({
      task: { id: 'task-1', status: 'COMPLETED' },
      bypass: true,
      audit_action: 'complete_unassigned_bypass',
    })

    await expect(completeTask(client, {
      taskId: 'task-1',
      workspaceId: 'workspace-1',
      actorPersonId: 'person-1',
    })).resolves.toMatchObject({
      task: { id: 'task-1', status: 'COMPLETED' },
      bypass: true,
      auditAction: 'complete_unassigned_bypass',
    })
  })

  it('keeps the full quality gate for NOT_STARTED without file/report', async () => {
    const client = clientWithResult(null, {
      code: 'P0001',
      message: 'GATE: thiếu kết quả đầu việc',
    })

    await expect(completeTask(client, {
      taskId: 'task-2',
      workspaceId: 'workspace-1',
      actorPersonId: 'person-1',
    })).rejects.toMatchObject({
      code: 'TASK_COMPLETION_QUALITY_GATE',
      status: 409,
      message: 'GATE: thiếu kết quả đầu việc',
    })
  })

  it('requires the special audit action for every successful bypass', async () => {
    const client = clientWithResult({
      task: { id: 'task-3', status: 'COMPLETED' },
      bypass: true,
      audit_action: null,
    })

    await expect(completeTask(client, {
      taskId: 'task-3',
      workspaceId: 'workspace-1',
      actorPersonId: null,
    })).rejects.toMatchObject({
      code: 'TASK_COMPLETION_AUDIT_MISSING',
      status: 500,
    })
  })
})
