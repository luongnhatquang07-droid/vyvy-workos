import { NextResponse } from 'next/server'
import { getCommandCenterData } from '@/lib/db/commandCenter'
import { resyncCompletedTasks } from '@/lib/db/taskCompletionSync'
import { isLocalProductionDatabaseRequest } from '@/lib/localQaGuard'
import { getCurrentUserProfile, type RbacClient, type RbacUserContext } from '@/lib/rbac/permissions'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET(request: Request) {
  const sb = await createClient()
  const {
    data: { user },
  } = await sb.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Bạn cần đăng nhập để xem dữ liệu điều hành.' }, { status: 401 })
  }

  const profileRes = await sb
    .from('profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (profileRes.error) {
    return NextResponse.json(
      { error: 'Không đọc được hồ sơ đăng nhập. Kiểm tra bảng profiles hoặc RLS.' },
      { status: 500 },
    )
  }

  if (!profileRes.data?.id) {
    return NextResponse.json({ error: 'Tài khoản chưa có profile trong workspace.' }, { status: 403 })
  }

  const membershipRes = await sb
    .from('workspace_memberships')
    .select('workspace_id')
    .eq('profile_id', profileRes.data.id)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()

  if (membershipRes.error) {
    return NextResponse.json(
      { error: 'Không đọc được quyền workspace. Kiểm tra RLS hoặc membership của tài khoản.' },
      { status: 500 },
    )
  }

  const workspaceId = membershipRes.data?.workspace_id
  const userContext = await getCurrentUserProfile(sb as unknown as RbacClient)
  if (!workspaceId) {
    return NextResponse.json({ error: 'Tài khoản chưa được gắn workspace.' }, { status: 403 })
  }

  if (!userContext || userContext.workspaceId !== workspaceId) {
    return NextResponse.json({ error: 'Ban khong co quyen xem du lieu workspace nay.' }, { status: 403 })
  }

  try {
    if (!isLocalProductionDatabaseRequest(request)) {
      try {
        const syncClient = process.env.SUPABASE_SERVICE_ROLE_KEY ? createServiceClient() : sb
        await resyncCompletedTasks(syncClient, workspaceId)
      } catch (syncError) {
        console.warn(
          'COMMAND_CENTER_RESYNC_SKIPPED',
          syncError instanceof Error ? syncError.message : 'Unknown resync error',
        )
      }
    }
    const data = await getCommandCenterData(workspaceId, userContext)
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
