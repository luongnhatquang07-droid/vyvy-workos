import 'server-only'

import { NextResponse } from 'next/server'
import { DependencyServiceError } from './dependencyService'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}

export async function readDependencyJson(request: Request) {
  try {
    const value = await request.json()
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new DependencyServiceError(
        'Dữ liệu yêu cầu phải là một JSON object.',
        400,
        'DEPENDENCY_INVALID_BODY',
      )
    }
    return value as Record<string, unknown>
  } catch (error) {
    if (error instanceof DependencyServiceError) throw error
    throw new DependencyServiceError(
      'Dữ liệu JSON không hợp lệ.',
      400,
      'DEPENDENCY_INVALID_JSON',
    )
  }
}

export function dependencyRequestError(message: string) {
  return new DependencyServiceError(message, 400, 'DEPENDENCY_INVALID_REQUEST')
}

export function dependencyErrorResponse(error: unknown) {
  if (error instanceof DependencyServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status })
  }
  return NextResponse.json(
    { error: 'Không thể xử lý quan hệ phụ thuộc. Vui lòng thử lại.' },
    { status: 500 },
  )
}
