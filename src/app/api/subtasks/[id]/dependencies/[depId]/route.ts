import {
  dependencyErrorResponse,
  dependencyRequestError,
  isUuid,
} from '@/lib/dependencies/dependencyApi'
import { deleteDependency } from '@/lib/dependencies/dependencyService'
import { ensureLocalQaWriteAllowed } from '@/lib/localQaGuard'

export const runtime = 'nodejs'

interface RouteContext {
  params: Promise<{ id: string; depId: string }>
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { id: dependentSubtaskId, depId } = await context.params
    if (!isUuid(dependentSubtaskId) || !isUuid(depId)) {
      throw dependencyRequestError('ID quan hệ phụ thuộc không hợp lệ.')
    }

    const guard = ensureLocalQaWriteAllowed(
      request,
      { dependentSubtaskId, depId },
      'Không được xóa phụ thuộc từ localhost khi local đang trỏ production.',
    )
    if (guard) return guard

    await deleteDependency(dependentSubtaskId, depId)
    return new Response(null, { status: 204 })
  } catch (error) {
    return dependencyErrorResponse(error)
  }
}
