import { NextResponse } from 'next/server'
import {
  cleanStatus,
  isActiveAccountStatus,
  jsonError,
  requireUserManagementAccess,
} from '@/lib/admin/userManagement'
import { loadUserManagementData } from '@/lib/admin/userManagementData'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireUserManagementAccess()
  if (!auth.ok) return auth.response

  try {
    const { id: profileId } = await context.params
    const body = (await request.json()) as Record<string, unknown>
    const status = cleanStatus(body.status)

    const profileRes = await auth.service
      .from('profiles')
      .select('id,auth_user_id')
      .eq('workspace_id', auth.workspaceId)
      .eq('id', profileId)
      .maybeSingle()
    if (profileRes.error) throw profileRes.error
    if (!profileRes.data) return jsonError('Không tìm thấy tài khoản.', 404)

    const profileUpdate = await auth.service
      .from('profiles')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('workspace_id', auth.workspaceId)
      .eq('id', profileId)
    if (profileUpdate.error) throw profileUpdate.error

    const personUpdate = await auth.service
      .from('people')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('workspace_id', auth.workspaceId)
      .eq('profile_id', profileId)
      .is('deleted_at', null)
    if (personUpdate.error) throw personUpdate.error

    const membershipUpdate = await auth.service
      .from('workspace_memberships')
      .update({ is_active: isActiveAccountStatus(status) })
      .eq('workspace_id', auth.workspaceId)
      .eq('profile_id', profileId)
    if (membershipUpdate.error) throw membershipUpdate.error

    if (profileRes.data.auth_user_id) {
      const authUpdate = await auth.service.auth.admin.updateUserById(profileRes.data.auth_user_id, {
        user_metadata: { account_status: status },
        ban_duration: isActiveAccountStatus(status) ? 'none' : '876000h',
      })
      if (authUpdate.error) throw authUpdate.error
    }

    const data = await loadUserManagementData(auth.service, auth.workspaceId)
    return NextResponse.json({
      ok: true,
      user: data.users.find((user) => user.profileId === profileId) ?? null,
      users: data.users,
    })
  } catch (error) {
    return jsonError(errorMessage(error), 500)
  }
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error && 'message' in error) return String(error.message)
  return 'Có lỗi xảy ra khi đổi trạng thái tài khoản.'
}
