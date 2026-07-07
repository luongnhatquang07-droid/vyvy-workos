import { NextResponse } from 'next/server'
import { jsonError, requireUserManagementAccess } from '@/lib/admin/userManagement'
import {
  loadUserPermissionState,
  resetUserPermissionOverrides,
  saveUserPermissionOverrides,
} from '@/lib/admin/userPermissionOverrides'

export const runtime = 'nodejs'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireUserManagementAccess()
  if (!auth.ok) return auth.response

  try {
    const { id } = await context.params
    const state = await loadUserPermissionState(auth.service, auth.workspaceId, id)
    return NextResponse.json({ ok: true, ...state })
  } catch (error) {
    return jsonError(errorMessage(error), 500)
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireUserManagementAccess()
  if (!auth.ok) return auth.response

  try {
    const { id } = await context.params
    const body = (await request.json()) as Record<string, unknown>
    const state = await saveUserPermissionOverrides(auth.service, auth.workspaceId, id, body.permissions)
    return NextResponse.json({ ok: true, ...state })
  } catch (error) {
    return jsonError(errorMessage(error), 409)
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const auth = await requireUserManagementAccess()
  if (!auth.ok) return auth.response

  try {
    const { id } = await context.params
    const state = await resetUserPermissionOverrides(auth.service, auth.workspaceId, id)
    return NextResponse.json({ ok: true, ...state })
  } catch (error) {
    return jsonError(errorMessage(error), 409)
  }
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error && 'message' in error) return String(error.message)
  return 'Khong xu ly duoc bang phan quyen.'
}
