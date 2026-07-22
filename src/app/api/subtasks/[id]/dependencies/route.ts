import { NextResponse } from 'next/server'
import {
  createDependency,
  replaceDependencies,
} from '@/lib/dependencies/dependencyService'
import {
  dependencyErrorResponse,
  dependencyRequestError,
  isUuid,
  readDependencyJson,
} from '@/lib/dependencies/dependencyApi'
import { ensureLocalQaWriteAllowed } from '@/lib/localQaGuard'

export const runtime = 'nodejs'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id: dependentSubtaskId } = await context.params
    const body = await readDependencyJson(request)
    const fromSubtaskId = body.fromSubtaskId
    if (!isUuid(dependentSubtaskId) || !isUuid(fromSubtaskId)) {
      throw dependencyRequestError('ID đầu việc phụ thuộc không hợp lệ.')
    }

    const guard = ensureLocalQaWriteAllowed(
      request,
      body,
      'Không được tạo phụ thuộc từ localhost khi local đang trỏ production.',
    )
    if (guard) return guard

    const result = await createDependency(fromSubtaskId, dependentSubtaskId)
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    return dependencyErrorResponse(error)
  }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const { id: dependentSubtaskId } = await context.params
    const body = await readDependencyJson(request)
    const prerequisiteSubtaskIds = body.prerequisiteSubtaskIds
    if (!isUuid(dependentSubtaskId)) {
      throw dependencyRequestError('ID đầu việc con không hợp lệ.')
    }
    if (!Array.isArray(prerequisiteSubtaskIds) || !prerequisiteSubtaskIds.every(isUuid)) {
      throw dependencyRequestError('prerequisiteSubtaskIds phải là danh sách UUID hợp lệ.')
    }

    const guard = ensureLocalQaWriteAllowed(
      request,
      body,
      'Không được thay phụ thuộc từ localhost khi local đang trỏ production.',
    )
    if (guard) return guard

    const result = await replaceDependencies(dependentSubtaskId, prerequisiteSubtaskIds)
    return NextResponse.json(result)
  } catch (error) {
    return dependencyErrorResponse(error)
  }
}
