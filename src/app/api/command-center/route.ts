import { NextResponse } from 'next/server'
import { getCommandCenterData } from '@/lib/db/commandCenter'
import { resolveRbacUserContext, type RbacClient, type RbacUserContext } from '@/lib/rbac/permissions'
import { createClient } from '@/lib/supabase/server'

const COMMAND_CENTER_TIMEOUT_MS = 15000

export async function GET() {
  const sb = await createClient()
  const resolution = await resolveRbacUserContext(sb as unknown as RbacClient)

  if (!resolution.ok) {
    switch (resolution.stage) {
      case 'unauthenticated':
        return NextResponse.json({ error: 'Bạn cần đăng nhập để xem dữ liệu điều hành.' }, { status: 401 })
      case 'profile_error':
        return NextResponse.json(
          { error: 'Không đọc được hồ sơ đăng nhập. Kiểm tra bảng profiles hoặc RLS.' },
          { status: 500 },
        )
      case 'no_profile':
        return NextResponse.json({ error: 'Tài khoản chưa có profile trong workspace.' }, { status: 403 })
      case 'membership_error':
        return NextResponse.json(
          { error: 'Không đọc được quyền workspace. Kiểm tra RLS hoặc membership của tài khoản.' },
          { status: 500 },
        )
      case 'no_membership':
      case 'workspace_mismatch':
        return NextResponse.json({ error: 'Tài khoản chưa được gắn workspace.' }, { status: 403 })
    }
  }

  const userContext = resolution.context
  const workspaceId = userContext.workspaceId as string

  try {
    const data = await withTimeout(
      getCommandCenterData(workspaceId, userContext),
      COMMAND_CENTER_TIMEOUT_MS,
      'Tải dữ liệu điều hành quá lâu. Hãy thử lại sau ít phút.',
    )
    return NextResponse.json({
      ...data,
      workspaceId,
      currentUser: {
        personId: userContext.personId,
        role: userContext.normalizedRole,
        canApproveOnBehalf: canUserApproveOnBehalf(userContext),
      },
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error
          ? error.message
          : 'Không tải được dữ liệu điều hành.',
      },
      { status: 500 },
    )
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

function canUserApproveOnBehalf(userContext: RbacUserContext) {
  if (userContext.normalizedRole === 'ADMIN' || userContext.normalizedRole === 'COO' || userContext.normalizedRole === 'CEO') {
    return true
  }
  const override = userContext.permissionOverrides.find((permission) => permission.module === 'approvals')
  return Boolean(
    override?.actions.approve_on_behalf &&
    override.scope &&
    override.scope !== 'none',
  )
}
