import { NextResponse } from 'next/server'
import {
  dependencyErrorResponse,
  dependencyRequestError,
  isUuid,
} from '@/lib/dependencies/dependencyApi'
import { listForProject } from '@/lib/dependencies/dependencyService'

export const runtime = 'nodejs'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id: projectId } = await context.params
    if (!isUuid(projectId)) throw dependencyRequestError('ID dự án không hợp lệ.')

    const dependencies = await listForProject(projectId)
    return NextResponse.json(
      { dependencies },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    return dependencyErrorResponse(error)
  }
}
