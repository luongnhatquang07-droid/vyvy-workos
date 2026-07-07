import { NextResponse } from 'next/server'
import { jsonError, requireUserManagementAccess } from '@/lib/admin/userManagement'
import { adminAuthErrorMessage, loadUserManagementData, requireCompleteManagedUserRow } from '@/lib/admin/userManagementData'

export const runtime = 'nodejs'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function DELETE(_request: Request, context: RouteContext) {
  const auth = await requireUserManagementAccess()
  if (!auth.ok) return auth.response

  try {
    const { id: profileId } = await context.params
    if (!profileId) return jsonError('Thiếu profile cần xóa.', 400)
    if (auth.actor.profileId === profileId) return jsonError('Không thể xóa chính tài khoản đang đăng nhập.', 400)

    const profileRes = await auth.service
      .from('profiles')
      .select('id,auth_user_id,display_name')
      .eq('workspace_id', auth.workspaceId)
      .eq('id', profileId)
      .maybeSingle()
    if (profileRes.error) throw profileRes.error
    if (!profileRes.data) return jsonError('Không tìm thấy tài khoản.', 404)

    const rowReady = await requireCompleteManagedUserRow(auth.service, auth.workspaceId, profileId)
    if (!rowReady.ok) return jsonError(rowReady.message, rowReady.status)

    const membershipRes = await auth.service
      .from('workspace_memberships')
      .select('id,role_id')
      .eq('workspace_id', auth.workspaceId)
      .eq('profile_id', profileId)
      .maybeSingle()
    if (membershipRes.error) throw membershipRes.error
    if (!membershipRes.data?.role_id) return jsonError('Tài khoản chưa có vai trò hợp lệ.', 400)

    const roleRes = await auth.service
      .from('roles')
      .select('code')
      .eq('id', membershipRes.data.role_id)
      .maybeSingle()
    if (roleRes.error) throw roleRes.error
    if (roleRes.data?.code === 'ADMIN') {
      return jsonError('Không được xóa tài khoản ADMIN bằng thao tác nhanh. Hãy đổi vai trò hoặc khóa trước nếu thật sự cần.', 400)
    }

    const deletedAt = new Date().toISOString()
    const accountStatus = 'suspended'

    const profileUpdate = await auth.service
      .from('profiles')
      .update({ status: 'deleted', updated_at: deletedAt })
      .eq('workspace_id', auth.workspaceId)
      .eq('id', profileId)
    if (profileUpdate.error) throw profileUpdate.error

    const personUpdate = await auth.service
      .from('people')
      .update({ status: accountStatus, deleted_at: deletedAt, updated_at: deletedAt })
      .eq('workspace_id', auth.workspaceId)
      .eq('profile_id', profileId)
      .is('deleted_at', null)
    if (personUpdate.error) throw personUpdate.error

    const membershipUpdate = await auth.service
      .from('workspace_memberships')
      .update({ is_active: false })
      .eq('workspace_id', auth.workspaceId)
      .eq('profile_id', profileId)
    if (membershipUpdate.error) throw membershipUpdate.error

    if (profileRes.data.auth_user_id) {
      const authUpdate = await auth.service.auth.admin.updateUserById(profileRes.data.auth_user_id, {
        user_metadata: { account_status: accountStatus, account_deleted_at: deletedAt },
        ban_duration: '876000h',
      })
      if (authUpdate.error) return jsonError(adminAuthErrorMessage(authUpdate.error), 400)
    }

    const data = await loadUserManagementData(auth.service, auth.workspaceId)
    return NextResponse.json({
      ok: true,
      user: null,
      users: data.users,
    })
  } catch (error) {
    return jsonError(errorMessage(error), 500)
  }
}

function errorMessage(error: unknown) {
  const authMessage = adminAuthErrorMessage(error)
  if (authMessage) return authMessage
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error && 'message' in error) return String(error.message)
  return 'Có lỗi xảy ra khi xóa tài khoản.'
}
